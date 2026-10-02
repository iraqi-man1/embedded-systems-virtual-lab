/**
 * Programmable board model: wraps an MCU emulator and couples its pins to
 * the analog solver.
 *  - output HIGH/LOW  -> Thevenin source (vcc|0 V through rOut)
 *  - INPUT_PULLUP     -> vcc through rPullUp
 *  - INPUT            -> high impedance; level from solved voltage with
 *                        Schmitt thresholds (0.3·Vcc / 0.6·Vcc)
 *  - ADC pins         -> solved voltage fed to the ADC channel
 *  - supply pins      -> regulated sources with current limits checked
 *  - pins on an I2C module's SDA/SCL -> read the bus as decoded by BitBangI2C,
 *                        so bit-banged I2C reaches the devices too
 */
import type { Diagnostic } from '../../circuit/diagnostics';
import type { PropValue } from '../../model/circuit';
import type { McuDefinition } from '../../model/component';
import type { SolveResult, StampCollector } from '../analog/solver';
import type { McuDebug } from '../types';
import { createMcu, type McuEmulator, type PinDrive } from '../mcu/mcu';
import { registerModel, type ModelContext, type SimModel } from '../model';
import { BitBangI2C } from './bitBangI2C';

const DEFAULT_GPIO = { rOut: 25, rPullUp: 35_000, absMaxCurrent: 0.04, recommendedCurrent: 0.02 };

class McuBoardModel implements SimModel {
  readonly mcu: McuEmulator;
  private def: McuDefinition;
  private gpio: typeof DEFAULT_GPIO;
  private lastDrive = new Map<string, PinDrive>();
  private inputLevel = new Map<string, boolean>();
  private floating = new Set<string>();
  private midLevel = new Set<string>();
  /** Integrated |current| (C) per pin and per supply over the current frame. */
  private pinCharge = new Map<string, number>();
  private supplyCharge = new Map<string, number>();
  private window = 0;
  private overCurrent = new Map<string, number>();
  private supplyOver = new Map<string, number>();
  private highTime = new Map<string, number>();
  /** High-time share of each wired pin over the last frame (MCU panel). */
  private duty: Record<string, number> = {};
  /** Drive of each pin as stamped into the current solution (valid until the next solve). */
  private stamped = new Map<string, PinDrive>();
  private txActivity = 0;
  private rxActivity = 0;
  private rxQueue: number[] = [];
  private rxPumping = false;
  private resetLow = false;
  private hasFirmware: boolean;
  /** Bit-banged I2C buses by board pin, for the setup they were found in. */
  private buses = new Map<string, BitBangI2C>();
  private busesFor: unknown = null;

  constructor(readonly ctx: ModelContext) {
    const def = ctx.setup.mcu;
    if (!def) throw new Error('Board definition lacks an "mcu" section.');
    this.def = def;
    this.gpio = { ...DEFAULT_GPIO, ...def.gpio };
    this.mcu = createMcu(def);
    this.hasFirmware = !!ctx.setup.firmware || !!ctx.setup.program;
    if (ctx.setup.program && this.mcu.loadProgram) this.mcu.loadProgram(ctx.setup.program);
    else if (ctx.setup.firmware) this.mcu.load({ format: 'ihex', data: ctx.setup.firmware });
    this.mcu.onPinChange = (pin) => this.pinChanged(pin);
    this.mcu.onSerialByte = (b) => {
      this.txActivity = 0.05;
      ctx.serialOut([b]);
    };
    for (const p of this.mcu.pins) this.lastDrive.set(p, this.mcu.pinDrive(p));
    // Hardware buses reach devices wired to this board's bus pins (any pin that can carry the
    // signal: one pair on the Uno, almost every GPIO on the RP2040).
    this.mcu.i2cResolver = (address) => {
      const sda = this.busNets('i2c:SDA');
      const scl = this.busNets('i2c:SCL');
      if (!sda.size || !scl.size) return null;
      for (const m of ctx.models()) {
        const d = m.i2c;
        if (d && d.address === address && sda.has(m.ctx.net(d.sdaPin)) && scl.has(m.ctx.net(d.sclPin))) return d;
      }
      return null;
    };
    this.mcu.spiResolver = () => {
      const mosi = this.busNets('spi:MOSI');
      const sck = this.busNets('spi:SCK');
      if (!mosi.size || !sck.size) return null;
      for (const m of ctx.models()) {
        const d = m.spi;
        if (d && mosi.has(m.ctx.net(d.mosiPin)) && sck.has(m.ctx.net(d.sckPin)) && d.selected()) return d;
      }
      return null;
    };
  }

  /** Nets of the wired board pins that can carry a bus signal such as "i2c:SDA". */
  private busNets(signal: string): Set<number> {
    const nets = new Set<number>();
    for (const [pin, signals] of Object.entries(this.ctx.setup.pinSignals ?? {})) {
      if (!signals.includes(signal) || !(pin in this.ctx.setup.mcu!.pinMap)) continue;
      const n = this.ctx.net(pin);
      if (n >= 0 && this.ctx.netPinCount(n) > 1) nets.add(n);
    }
    return nets;
  }

  /**
   * I2C modules wired to this board's pins: each SDA/SCL net pair with a device on it is a
   * bus a program can bit-bang. Found again whenever the circuit changes.
   */
  private bitBangBuses(): Map<string, BitBangI2C> {
    if (this.busesFor === this.ctx.setup) return this.buses;
    this.busesFor = this.ctx.setup;
    const old = this.buses;
    this.buses = new Map();
    const byNets = new Map<string, BitBangI2C>();
    for (const m of this.ctx.models()) {
      const d = m.i2c;
      if (!d) continue;
      const sda = m.ctx.net(d.sdaPin);
      const scl = m.ctx.net(d.sclPin);
      if (sda < 0 || scl < 0) continue;
      const key = `${sda}:${scl}`;
      let bus = byNets.get(key);
      if (!bus) {
        const sdaPins = this.mcu.pins.filter((p) => this.ctx.net(p) === sda);
        const sclPins = this.mcu.pins.filter((p) => this.ctx.net(p) === scl);
        if (!sdaPins.length || !sclPins.length) continue;
        bus = new BitBangI2C(sdaPins, sclPins);
        byNets.set(key, bus);
        for (const p of [...sdaPins, ...sclPins]) this.buses.set(p, bus);
      }
      bus.devices.push(d);
    }
    // Pins that left a bus go back to the solver's levels.
    for (const p of old.keys()) if (!this.buses.has(p)) this.inputLevel.delete(p);
    return this.buses;
  }

  /** Feeds the controller's drive of a bus to its decoder and gives the pins the line levels. */
  private updateBus(bus: BitBangI2C) {
    const low = (pins: string[]) => pins.some((p) => this.mcu.pinDrive(p) === 'low');
    bus.update(low(bus.sdaPins), low(bus.sclPins));
    for (const p of bus.sdaPins) this.setLevel(p, bus.sda);
    for (const p of bus.sclPins) this.setLevel(p, bus.scl);
  }

  private setLevel(pin: string, level: boolean) {
    if (this.inputLevel.get(pin) === level) return;
    this.inputLevel.set(pin, level);
    this.mcu.setInputLevel(pin, level);
  }

  private get gnd(): number {
    for (const [pin, kind] of Object.entries(this.ctx.setup.pinKinds)) {
      if (kind === 'ground') return this.ctx.net(pin);
    }
    return -1;
  }

  private pinChanged(pin: string) {
    const drive = this.mcu.pinDrive(pin);
    if (this.lastDrive.get(pin) === drive) return;
    this.lastDrive.set(pin, drive);
    // Decode bit-banged I2C at the exact moment of the edge (the program reads SDA right after).
    const bus = this.bitBangBuses().get(pin);
    if (bus) this.updateBus(bus);
    const n = this.ctx.net(pin);
    if (n < 0) return;
    // An unconnected pin cannot influence anything: defer the solve to the next frame.
    if (this.ctx.netPinCount(n) <= 1) this.ctx.invalidate([n]);
    else this.ctx.solveNow([n]);
  }

  stamp(s: StampCollector) {
    const gnd = this.gnd;
    if (gnd < 0) return;
    const vcc = this.def.vcc;
    for (const sup of this.def.supplies ?? []) {
      s.voltageSource(this.ctx.net(sup.pin), gnd, sup.voltage, sup.rInternal);
    }
    this.stamped.clear();
    for (const pin of this.mcu.pins) {
      const n = this.ctx.net(pin);
      if (n < 0 || this.ctx.netPinCount(n) <= 1) continue;
      const drive = this.mcu.pinDrive(pin);
      this.stamped.set(pin, drive);
      switch (drive) {
        case 'high':
          s.voltageSource(n, gnd, vcc, this.gpio.rOut);
          break;
        case 'low':
          s.resistor(n, gnd, this.gpio.rOut);
          break;
        case 'input-pullup':
          s.voltageSource(n, gnd, vcc, this.gpio.rPullUp);
          break;
        case 'input-pulldown':
          s.resistor(n, gnd, this.gpio.rPullUp);
          break;
        default:
          break; // high impedance
      }
    }
  }

  afterSolve(v: Float64Array, result: SolveResult) {
    const gnd = this.gnd;
    if (gnd < 0) return;
    const vcc = this.def.vcc;
    const gndIsland = result.island[gnd];
    this.floating.clear();
    this.midLevel.clear();
    const buses = this.bitBangBuses();
    for (const pin of this.mcu.pins) {
      const n = this.ctx.net(pin);
      if (n < 0) continue;
      const drive = this.mcu.pinDrive(pin);
      const isl = result.island[n];
      const driven = isl >= 0 && result.islandDriven[isl] && isl === gndIsland;
      const volts = driven ? v[n] - v[gnd] : NaN;
      if (driven) this.mcu.setAnalogVoltage(pin, Math.max(0, Math.min(vcc, volts)));
      const bus = buses.get(pin);
      if (bus) {
        // I2C lines: the module's pull-ups and the bus decoder set the level.
        this.updateBus(bus);
        continue;
      }
      if (drive === 'input' || drive === 'input-pullup' || drive === 'input-pulldown') {
        if (!driven) {
          // Floating: hardware reads noise. Keep the last level, flag it if wired to something.
          if (this.ctx.netPinCount(n) > 1) this.floating.add(pin);
          continue;
        }
        let level = this.inputLevel.get(pin) ?? false;
        if (volts >= 0.6 * vcc) level = true;
        else if (volts <= 0.3 * vcc) level = false;
        else this.midLevel.add(pin);
        if (this.inputLevel.get(pin) !== level) {
          this.inputLevel.set(pin, level);
          this.mcu.setInputLevel(pin, level);
        }
      }
    }
    // RESET pin pulled low -> reset on release.
    if (this.def.resetPin) {
      const n = this.ctx.net(this.def.resetPin);
      const isl = n >= 0 ? result.island[n] : -1;
      const low = isl >= 0 && result.islandDriven[isl] && v[n] - v[gnd] < 0.3 * vcc;
      if (this.resetLow && !low) this.reset();
      this.resetLow = low;
    }
  }

  integrate(dt: number, v: Float64Array) {
    const gnd = this.gnd;
    if (gnd < 0) return;
    this.window += dt;
    const vcc = this.def.vcc;
    // Integrate with the drive that was in effect for this interval (the one stamped
    // into `v`), not the drive the firmware has just switched to.
    for (const [pin, drive] of this.stamped) {
      const n = this.ctx.net(pin);
      if (drive === 'high') this.highTime.set(pin, (this.highTime.get(pin) ?? 0) + dt);
      if (n < 0 || (drive !== 'high' && drive !== 'low')) continue;
      const src = drive === 'high' ? vcc : 0;
      const i = Math.abs((src - (v[n] - v[gnd])) / this.gpio.rOut);
      this.pinCharge.set(pin, (this.pinCharge.get(pin) ?? 0) + i * dt);
    }
    for (const ind of this.def.indicators ?? []) {
      if (typeof ind.source === 'object' && !this.stamped.has(ind.source.pin) && this.mcu.pinDrive(ind.source.pin) === 'high')
        this.highTime.set(ind.source.pin, (this.highTime.get(ind.source.pin) ?? 0) + dt);
    }
    for (const sup of this.def.supplies ?? []) {
      const n = this.ctx.net(sup.pin);
      if (n < 0) continue;
      const i = Math.abs((sup.voltage - (v[n] - v[gnd])) / sup.rInternal);
      this.supplyCharge.set(sup.pin, (this.supplyCharge.get(sup.pin) ?? 0) + i * dt);
    }
  }

  onInput(key: string, value: PropValue) {
    if (key === 'serial' && typeof value === 'number') {
      this.rxQueue.push(value & 0xff);
      this.pumpRx();
    } else if (key === 'reset' && !value) {
      // On-board RESET button: the sketch restarts when the button is released.
      this.reset();
    }
  }

  private pumpRx() {
    if (this.rxPumping) return;
    this.rxPumping = true;
    const tick = () => {
      if (!this.rxQueue.length) {
        this.rxPumping = false;
        return;
      }
      if (this.mcu.serialWrite(this.rxQueue[0])) {
        this.rxQueue.shift();
        this.rxActivity = 0.05;
      }
      const baud = this.mcu.serialBaud || 9600;
      this.ctx.schedule(10 / baud, tick);
    };
    tick();
  }

  reset() {
    this.mcu.reset();
    this.inputLevel.clear();
    for (const bus of new Set(this.buses.values())) bus.reset();
    for (const p of this.mcu.pins) this.lastDrive.set(p, this.mcu.pinDrive(p));
    this.ctx.invalidate();
  }

  visualState(frameDt: number): Record<string, PropValue> {
    const out: Record<string, PropValue> = {};
    const w = this.window || frameDt || 1e-9;
    for (const ind of this.def.indicators ?? []) {
      if (ind.source === 'power') out[ind.prop] = true;
      else if (ind.source === 'tx') out[ind.prop] = this.txActivity > 0;
      else if (ind.source === 'rx') out[ind.prop] = this.rxActivity > 0;
      else out[ind.prop] = (this.highTime.get(ind.source.pin) ?? 0) / w > 0.25;
    }
    this.txActivity = Math.max(0, this.txActivity - frameDt);
    this.rxActivity = Math.max(0, this.rxActivity - frameDt);
    // Convert integrated charge into average currents for diagnostics.
    this.overCurrent.clear();
    this.supplyOver.clear();
    if (this.window > 0) {
      for (const [pin, q] of this.pinCharge) {
        const avg = q / this.window;
        if (avg > this.gpio.recommendedCurrent) this.overCurrent.set(pin, avg);
      }
      for (const sup of this.def.supplies ?? []) {
        const avg = (this.supplyCharge.get(sup.pin) ?? 0) / this.window;
        if (avg > sup.maxCurrent) this.supplyOver.set(sup.pin, avg);
      }
    }
    this.duty = {};
    for (const pin of this.stamped.keys()) this.duty[pin] = Math.min(1, (this.highTime.get(pin) ?? 0) / w);
    this.pinCharge.clear();
    this.supplyCharge.clear();
    this.highTime.clear();
    this.window = 0;
    return out;
  }

  mcuDebug(): McuDebug | undefined {
    const regs = this.mcu.registers?.();
    if (!regs) return undefined;
    const inputs: Record<string, boolean> = {};
    for (const [pin, level] of this.inputLevel) {
      const d = this.mcu.pinDrive(pin);
      if (d === 'input' || d === 'input-pullup' || d === 'input-pulldown') inputs[pin] = level;
    }
    return { ...regs, duty: this.duty, inputs, floating: [...this.floating] };
  }

  diagnostics(): Diagnostic[] {
    const id = this.ctx.setup.id;
    const label = this.ctx.setup.label;
    const out: Diagnostic[] = [];
    if (!this.hasFirmware) {
      out.push({
        code: 'no-firmware',
        severity: 'info',
        message: this.def.runtime ? `${label}: no main.py — add a main.py file to run Python on this board.` : `${label}: no firmware loaded — compile the sketch to run code on this board.`,
        componentIds: [id],
        source: 'simulation',
      });
    }
    for (const [pin, i] of this.overCurrent) {
      const ma = (i * 1000).toFixed(0);
      const abs = i > this.gpio.absMaxCurrent;
      out.push({
        code: abs ? 'pin-overcurrent' : 'pin-high-current',
        severity: abs ? 'error' : 'warning',
        message: abs
          ? `${label} pin ${pin} is sourcing/sinking ${ma} mA — exceeds the ${this.gpio.absMaxCurrent * 1000} mA absolute maximum (likely a missing series resistor or a short).`
          : `${label} pin ${pin} carries ${ma} mA — above the recommended ${this.gpio.recommendedCurrent * 1000} mA.`,
        componentIds: [id],
        source: 'simulation',
      });
    }
    for (const [pin, i] of this.supplyOver) {
      out.push({
        code: 'supply-overcurrent',
        severity: 'error',
        message: `${label} ${pin} supply delivers ${(i * 1000).toFixed(0)} mA — more than it can provide (short circuit?).`,
        componentIds: [id],
        source: 'simulation',
      });
    }
    for (const pin of this.floating) {
      out.push({
        code: 'floating-input',
        severity: 'warning',
        message: `${label} pin ${pin} is a floating input: nothing pulls it high or low, so reads are unpredictable. ${this.def.runtime ? 'Use Pin.PULL_UP (or Pin.PULL_DOWN)' : 'Use INPUT_PULLUP'} or add a pull-up/pull-down resistor.`,
        componentIds: [id],
        source: 'simulation',
      });
    }
    for (const pin of this.midLevel) {
      out.push({
        code: 'undefined-logic-level',
        severity: 'warning',
        message: `${label} pin ${pin} sits between the logic thresholds (0.3–0.6 Vcc); its digital value is undefined.`,
        componentIds: [id],
        source: 'simulation',
      });
    }
    return out;
  }
}

registerModel('mcu-board', (ctx) => new McuBoardModel(ctx));
