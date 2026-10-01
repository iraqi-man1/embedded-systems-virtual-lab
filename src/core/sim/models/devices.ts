/**
 * Behaviour models for modules, displays, ICs and actuators. Pin-level
 * protocols (servo PWM, HC-SR04, DHT22, HD44780) are decoded from the exact
 * edge times the co-simulation provides; hardware buses (I2C, SPI) are
 * attached at protocol level to the MCU peripherals.
 */
import { fontA00 } from '@wokwi/elements/dist/esm/lcd1602-font-a00.js';
import type { Diagnostic } from '../../circuit/diagnostics';
import type { PropValue } from '../../model/circuit';
import { diodeCurrent, type PwlDiode, type StampCollector } from '../analog/solver';
import type { I2CDevice, SPIDevice } from '../mcu/mcu';
import { numProp, registerModel, type ModelContext, type SimModel } from '../model';
import { DigitalInput, driveOutput, supply } from './helpers';

const diag = (ctx: ModelContext, code: string, severity: Diagnostic['severity'], message: string): Diagnostic => ({
  code,
  severity,
  message: `${ctx.setup.label}: ${message}`,
  componentIds: [ctx.setup.id],
  source: 'simulation',
});

// =============================================================== servo
class ServoModel implements SimModel {
  private input: DigitalInput;
  private riseAt = -1;
  private target = 90;
  private angle = 90;
  private powered = false;
  private lastPulse = -1;
  constructor(readonly ctx: ModelContext) {
    this.input = new DigitalInput(ctx, 'PWM');
  }
  stamp() {}
  afterSolve(v: Float64Array) {
    const s = supply(this.ctx, v, 'V+', 'GND');
    this.powered = s.powered;
    const e = this.input.sample(v, s.gnd, 5);
    const t = this.ctx.now();
    if (e.rising) this.riseAt = t;
    if (e.falling && this.riseAt >= 0) {
      const width = t - this.riseAt;
      // Arduino Servo library defaults: 544 µs = 0°, 2400 µs = 180°.
      if (width > 300e-6 && width < 3000e-6) {
        this.target = Math.max(0, Math.min(180, ((width - 544e-6) / (2400e-6 - 544e-6)) * 180));
        this.lastPulse = t;
      }
      this.riseAt = -1;
    }
  }
  visualState(frameDt: number) {
    if (this.powered) {
      // SG90-class speed: ~0.1 s per 60° at 5 V.
      const maxStep = 600 * Math.max(frameDt, 0);
      this.angle += Math.max(-maxStep, Math.min(maxStep, this.target - this.angle));
    }
    return { angle: this.angle };
  }
  diagnostics(): Diagnostic[] {
    const out: Diagnostic[] = [];
    if (!this.powered) out.push(diag(this.ctx, 'servo-unpowered', 'warning', 'V+ and GND must be connected to a 5 V supply.'));
    else if (this.lastPulse >= 0 && this.ctx.now() - this.lastPulse > 0.1)
      out.push(diag(this.ctx, 'servo-no-signal', 'info', 'no control pulses for >100 ms (the horn holds its last position).'));
    return out;
  }
}
registerModel('servo', (ctx) => new ServoModel(ctx));

// ============================================================ HC-SR04
class UltrasonicModel implements SimModel {
  private trig: DigitalInput;
  private trigRise = -1;
  private echo = false;
  private busy = false;
  private powered = false;
  private gnd = -1;
  private vcc = 5;
  constructor(readonly ctx: ModelContext) {
    this.trig = new DigitalInput(ctx, 'TRIG');
  }
  stamp(s: StampCollector) {
    if (this.powered) driveOutput(s, this.ctx, 'ECHO', this.echo, this.vcc, this.gnd, 100);
  }
  afterSolve(v: Float64Array) {
    const s = supply(this.ctx, v);
    if (s.powered !== this.powered) {
      this.powered = s.powered;
      this.gnd = s.gnd;
      this.vcc = s.volts;
      this.ctx.solveNow([this.ctx.net('ECHO')]);
    }
    if (!this.powered) return;
    const e = this.trig.sample(v, s.gnd, s.volts);
    const t = this.ctx.now();
    if (e.rising) this.trigRise = t;
    if (e.falling && this.trigRise >= 0 && t - this.trigRise >= 8e-6 && !this.busy) {
      this.busy = true;
      const cm = Math.max(2, Math.min(400, numProp(this.ctx, 'distance', 100)));
      const width = numProp(this.ctx, 'distance', 100) > 400 ? 0.038 : (cm * 2) / 34300;
      // 8 cycles of 40 kHz burst (~200 µs) + transducer latency before ECHO rises.
      this.ctx.schedule(250e-6, () => {
        this.setEcho(true);
        this.ctx.schedule(width, () => {
          this.setEcho(false);
          this.busy = false;
        });
      });
    }
  }
  private setEcho(on: boolean) {
    this.echo = on;
    this.ctx.solveNow([this.ctx.net('ECHO')]);
  }
  setProp() {}
  diagnostics(): Diagnostic[] {
    return this.powered ? [] : [diag(this.ctx, 'unpowered', 'warning', 'VCC/GND are not powered (needs 5 V).')];
  }
}
registerModel('hc-sr04', (ctx) => new UltrasonicModel(ctx));

// =============================================================== DHT22
/** AM2302/DHT22 single-wire protocol (also DHT11 with params.variant). */
class DhtModel implements SimModel {
  private pullingLow = false;
  private hostLowAt = -1;
  private busy = false;
  private powered = false;
  private gnd = -1;
  private lastRead = -10;
  private tooFast = false;
  constructor(readonly ctx: ModelContext) {}
  private get dataPin() {
    return String(this.ctx.setup.params.data ?? 'SDA');
  }
  private get dht11() {
    return this.ctx.setup.params.variant === 'dht11';
  }
  stamp(s: StampCollector) {
    const n = this.ctx.net(this.dataPin);
    if (this.powered && this.pullingLow && n >= 0) s.resistor(n, this.gnd, 30);
  }
  afterSolve(v: Float64Array) {
    const s = supply(this.ctx, v);
    this.powered = s.powered;
    this.gnd = s.gnd;
    if (!this.powered || this.busy) return;
    const n = this.ctx.net(this.dataPin);
    if (n < 0 || !this.ctx.isDriven(n)) return;
    const low = v[n] - v[s.gnd] < 0.3 * s.volts;
    const t = this.ctx.now();
    if (low && this.hostLowAt < 0) this.hostLowAt = t;
    if (!low && this.hostLowAt >= 0) {
      const held = t - this.hostLowAt;
      this.hostLowAt = -1;
      const minStart = this.dht11 ? 18e-3 : 0.8e-3;
      if (held >= minStart * 0.9) this.respond();
    }
  }
  private respond() {
    this.busy = true;
    const now = this.ctx.now();
    this.tooFast = now - this.lastRead < (this.dht11 ? 1 : 2);
    this.lastRead = now;
    const h = Math.max(0, Math.min(100, numProp(this.ctx, 'humidity', 40)));
    const tc = Math.max(-40, Math.min(80, numProp(this.ctx, 'temperature', 24)));
    let bytes: number[];
    if (this.dht11) {
      bytes = [Math.round(h), 0, Math.round(tc), 0];
    } else {
      const hh = Math.round(h * 10);
      const tt = Math.round(Math.abs(tc) * 10) | (tc < 0 ? 0x8000 : 0);
      bytes = [hh >> 8, hh & 0xff, tt >> 8, tt & 0xff];
    }
    bytes.push((bytes[0] + bytes[1] + bytes[2] + bytes[3]) & 0xff);
    // Timeline of (delay, pullLow) steps.
    const steps: [number, boolean][] = [
      [30e-6, true],
      [80e-6, false],
      [80e-6, true],
    ];
    for (const b of bytes) {
      for (let i = 7; i >= 0; i--) {
        const one = (b >> i) & 1;
        steps.push([50e-6, false]);
        steps.push([one ? 70e-6 : 27e-6, true]);
      }
    }
    steps.push([50e-6, false]);
    let k = 0;
    const next = () => {
      if (k >= steps.length) {
        this.busy = false;
        return;
      }
      const [delay, low] = steps[k++];
      this.ctx.schedule(delay, () => {
        this.pullingLow = low;
        this.ctx.solveNow([this.ctx.net(this.dataPin)]);
        next();
      });
    };
    next();
  }
  diagnostics(): Diagnostic[] {
    const out: Diagnostic[] = [];
    if (!this.powered) out.push(diag(this.ctx, 'unpowered', 'warning', 'VCC/GND are not powered.'));
    if (this.tooFast) out.push(diag(this.ctx, 'dht-too-fast', 'info', `read more often than every ${this.dht11 ? 1 : 2} s; real sensors return stale data.`));
    return out;
  }
}
registerModel('dht', (ctx) => new DhtModel(ctx));

// ============================================================= HD44780
/** HD44780 character LCD controller (4/8-bit interface, CGRAM, shifting). */
export class Hd44780 {
  ddram = new Uint8Array(128).fill(0x20);
  cgram = new Uint8Array(64);
  ac = 0;
  toCgram = false;
  increment = true;
  autoShift = false;
  displayOn = false;
  cursorOn = false;
  blinkOn = false;
  eightBit = true;
  shift = 0;
  pending: number | null = null;
  cgramDirty = true;
  dirty = true;
  constructor(
    readonly cols: number,
    readonly rows: number,
  ) {}

  /** One E falling edge in 4-bit mode (nibble on D7..D4) or 8-bit mode (byte). */
  strobe(rs: boolean, high: number, low: number | null) {
    if (this.eightBit) {
      this.execute(rs, ((high & 0xf) << 4) | ((low ?? 0) & 0xf));
      return;
    }
    if (this.pending === null) this.pending = high & 0xf;
    else {
      const b = (this.pending << 4) | (high & 0xf);
      this.pending = null;
      this.execute(rs, b);
    }
  }

  execute(rs: boolean, b: number) {
    this.dirty = true;
    if (rs) {
      if (this.toCgram) {
        this.cgram[this.ac & 0x3f] = b & 0x1f;
        this.ac = (this.ac + (this.increment ? 1 : -1)) & 0x3f;
        this.cgramDirty = true;
      } else {
        this.ddram[this.ac & 0x7f] = b;
        this.ac = (this.ac + (this.increment ? 1 : -1)) & 0x7f;
        if (this.autoShift) this.shift += this.increment ? -1 : 1;
      }
      return;
    }
    if (b & 0x80) {
      this.toCgram = false;
      this.ac = b & 0x7f;
    } else if (b & 0x40) {
      this.toCgram = true;
      this.ac = b & 0x3f;
    } else if (b & 0x20) {
      const was = this.eightBit;
      this.eightBit = !!(b & 0x10);
      if (was !== this.eightBit) this.pending = null;
    } else if (b & 0x10) {
      const right = !!(b & 0x04);
      if (b & 0x08) this.shift += right ? 1 : -1;
      else this.ac = (this.ac + (right ? 1 : -1)) & 0x7f;
    } else if (b & 0x08) {
      this.displayOn = !!(b & 0x04);
      this.cursorOn = !!(b & 0x02);
      this.blinkOn = !!(b & 0x01);
    } else if (b & 0x04) {
      this.increment = !!(b & 0x02);
      this.autoShift = !!(b & 0x01);
    } else if (b & 0x02) {
      this.ac = 0;
      this.shift = 0;
    } else if (b & 0x01) {
      this.ddram.fill(0x20);
      this.ac = 0;
      this.shift = 0;
      this.increment = true;
      this.toCgram = false;
    }
  }

  private rowBase(r: number) {
    return [0x00, 0x40, this.cols, 0x40 + this.cols][r] ?? 0;
  }

  visual(backlight: boolean): Record<string, unknown> {
    const chars = new Uint8Array(this.cols * this.rows).fill(0x20);
    let cursorX = -1;
    let cursorY = -1;
    if (this.displayOn) {
      const lineLen = this.rows <= 2 ? 40 : 20;
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const offset = (((c - this.shift) % lineLen) + lineLen) % lineLen;
          const addr = this.rows <= 2 ? this.rowBase(r) + offset : this.rowBase(r) + c;
          chars[r * this.cols + c] = this.ddram[addr & 0x7f];
          if (!this.toCgram && (addr & 0x7f) === this.ac) {
            cursorX = c;
            cursorY = r;
          }
        }
      }
    }
    const out: Record<string, unknown> = {
      characters: chars,
      cursor: this.displayOn && this.cursorOn && cursorX >= 0,
      blink: this.displayOn && this.blinkOn && cursorX >= 0,
      cursorX: Math.max(0, cursorX),
      cursorY: Math.max(0, cursorY),
      backlight,
    };
    if (this.cgramDirty) {
      const font = new Uint8Array(fontA00);
      for (let ch = 0; ch < 8; ch++) {
        for (let row = 0; row < 8; row++) {
          font[ch * 8 + row] = this.cgram[ch * 8 + row];
          font[(ch + 8) * 8 + row] = this.cgram[ch * 8 + row];
        }
      }
      out.font = font;
      this.cgramDirty = false;
    }
    this.dirty = false;
    return out;
  }
}

class ParallelLcdModel implements SimModel {
  private lcd: Hd44780;
  private e: DigitalInput;
  private powered = false;
  private dataPins: DigitalInput[];
  private rs: DigitalInput;
  constructor(readonly ctx: ModelContext) {
    this.lcd = new Hd44780(Number(ctx.setup.params.cols ?? 16), Number(ctx.setup.params.rows ?? 2));
    this.e = new DigitalInput(ctx, 'E');
    this.rs = new DigitalInput(ctx, 'RS');
    this.dataPins = ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'].map((p) => new DigitalInput(ctx, p));
  }
  stamp() {}
  afterSolve(v: Float64Array) {
    const s = supply(this.ctx, v, 'VDD', 'VSS');
    this.powered = s.powered;
    if (!this.powered) return;
    for (const d of this.dataPins) d.sample(v, s.gnd, s.volts);
    this.rs.sample(v, s.gnd, s.volts);
    const e = this.e.sample(v, s.gnd, s.volts);
    if (!e.falling) return;
    const bits = this.dataPins.map((d) => (d.level ? 1 : 0));
    const high = (bits[7] << 3) | (bits[6] << 2) | (bits[5] << 1) | bits[4];
    const lowConnected = ['D0', 'D1', 'D2', 'D3'].some((p) => this.ctx.netPinCount(this.ctx.net(p)) > 1);
    const low = lowConnected ? (bits[3] << 3) | (bits[2] << 2) | (bits[1] << 1) | bits[0] : 0;
    this.lcd.strobe(this.rs.level, high, low);
  }
  visualState() {
    const a = this.ctx.net('A');
    const k = this.ctx.net('K');
    const backlight = this.powered && a >= 0 && k >= 0 && this.ctx.isDriven(a) && this.ctx.isDriven(k);
    return this.lcd.visual(backlight);
  }
  diagnostics(): Diagnostic[] {
    return this.powered ? [] : [diag(this.ctx, 'unpowered', 'warning', 'VDD/VSS are not powered (5 V).')];
  }
}
registerModel('hd44780', (ctx) => new ParallelLcdModel(ctx));

/** PCF8574 I2C backpack driving an HD44780 (LiquidCrystal_I2C pin mapping). */
class I2cLcdModel implements SimModel {
  private lcd: Hd44780;
  private port = 0;
  private powered = false;
  readonly i2c: I2CDevice & { sdaPin: string; sclPin: string };
  constructor(readonly ctx: ModelContext) {
    this.lcd = new Hd44780(Number(ctx.setup.params.cols ?? 16), Number(ctx.setup.params.rows ?? 2));
    const self = this;
    this.i2c = {
      sdaPin: 'SDA',
      sclPin: 'SCL',
      get address() {
        return parseInt(String(self.ctx.setup.props.address ?? '0x27'), 16) || 0x27;
      },
      connect: () => this.powered,
      write: (byte) => {
        const prev = this.port;
        this.port = byte;
        // P2 = E: latch on its falling edge. P0 = RS, P4..P7 = D4..D7.
        if (prev & 0x04 && !(byte & 0x04)) this.lcd.strobe(!!(prev & 0x01), (prev >> 4) & 0xf, null);
        return true;
      },
      read: () => this.port,
      stop: () => undefined,
    };
    // The PCF8574 starts with all outputs high; the LCD is in 8-bit mode.
  }
  stamp() {}
  afterSolve(v: Float64Array) {
    this.powered = supply(this.ctx, v).powered;
  }
  visualState() {
    return this.lcd.visual(this.powered && !!(this.port & 0x08));
  }
  diagnostics(): Diagnostic[] {
    return this.powered ? [] : [diag(this.ctx, 'unpowered', 'warning', 'VCC/GND are not powered.')];
  }
}
registerModel('lcd-i2c', (ctx) => new I2cLcdModel(ctx));

// ============================================================ 74HC595
class ShiftRegisterModel implements SimModel {
  private shift = 0;
  private latch = 0;
  private srclk: DigitalInput;
  private rclk: DigitalInput;
  private ser: DigitalInput;
  private clr: DigitalInput;
  private oe: DigitalInput;
  private powered = false;
  private vcc = 5;
  private gnd = -1;
  private readonly outs = ['QA', 'QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH'];
  readonly spi: SPIDevice & { mosiPin: string; sckPin: string };
  constructor(readonly ctx: ModelContext) {
    this.srclk = new DigitalInput(ctx, 'SRCLK');
    this.rclk = new DigitalInput(ctx, 'RCLK');
    this.ser = new DigitalInput(ctx, 'SER');
    this.clr = new DigitalInput(ctx, 'SRCLR');
    this.oe = new DigitalInput(ctx, 'OE');
    this.clr.level = true;
    this.spi = {
      mosiPin: 'SER',
      sckPin: 'SRCLK',
      selected: () => this.powered,
      transfer: (byte) => {
        let out = 0;
        for (let i = 7; i >= 0; i--) {
          out = (out << 1) | ((this.shift >> 7) & 1);
          this.shift = ((this.shift << 1) | ((byte >> i) & 1)) & 0xff;
        }
        return out;
      },
    };
  }
  private outputsEnabled() {
    return !this.oe.level;
  }
  stamp(s: StampCollector) {
    if (!this.powered) return;
    if (this.outputsEnabled()) this.outs.forEach((p, i) => driveOutput(s, this.ctx, p, !!((this.latch >> i) & 1), this.vcc, this.gnd));
    driveOutput(s, this.ctx, "QH'", !!((this.shift >> 7) & 1), this.vcc, this.gnd);
  }
  afterSolve(v: Float64Array) {
    const s = supply(this.ctx, v);
    const wasPowered = this.powered;
    this.powered = s.powered;
    this.vcc = s.volts;
    this.gnd = s.gnd;
    if (!this.powered) return;
    this.ser.sample(v, s.gnd, s.volts);
    const oe = this.oe.sample(v, s.gnd, s.volts);
    const clr = this.clr.sample(v, s.gnd, s.volts);
    const sr = this.srclk.sample(v, s.gnd, s.volts);
    const rc = this.rclk.sample(v, s.gnd, s.volts);
    let changed = !wasPowered || oe.changed;
    if (!clr.level) {
      if (this.shift) changed = true;
      this.shift = 0;
    } else if (sr.rising) {
      this.shift = ((this.shift << 1) | (this.ser.level ? 1 : 0)) & 0xff;
      changed = true;
    }
    if (rc.rising && this.latch !== this.shift) {
      this.latch = this.shift;
      changed = true;
    }
    if (changed) this.ctx.solveNow([...this.outs, "QH'"].map((p) => this.ctx.net(p)));
  }
  diagnostics(): Diagnostic[] {
    return this.powered ? [] : [diag(this.ctx, 'unpowered', 'warning', 'VCC/GND are not powered.')];
  }
}
registerModel('74hc595', (ctx) => new ShiftRegisterModel(ctx));

// =========================================================== logic gates
type GateFn = 'and' | 'nand' | 'or' | 'nor' | 'xor' | 'xnor' | 'not' | 'buf';
interface GateSpec {
  inputs: string[];
  output: string;
  fn: GateFn;
}

/** Generic CMOS gate package; the pin mapping comes from `simulation.params.gates`. */
class LogicGatesModel implements SimModel {
  private gates: GateSpec[];
  private inputs = new Map<string, DigitalInput>();
  private outputs: boolean[];
  private powered = false;
  private vcc = 5;
  private gnd = -1;
  constructor(readonly ctx: ModelContext) {
    this.gates = (ctx.setup.params.gates as GateSpec[]) ?? [];
    for (const g of this.gates) for (const i of g.inputs) this.inputs.set(i, new DigitalInput(ctx, i));
    this.outputs = this.gates.map(() => false);
  }
  stamp(s: StampCollector) {
    if (!this.powered) return;
    this.gates.forEach((g, i) => driveOutput(s, this.ctx, g.output, this.outputs[i], this.vcc, this.gnd));
  }
  afterSolve(v: Float64Array) {
    const s = supply(this.ctx, v);
    const was = this.powered;
    this.powered = s.powered;
    this.vcc = s.volts;
    this.gnd = s.gnd;
    if (!this.powered) {
      if (was) this.ctx.solveNow(this.gates.map((g) => this.ctx.net(g.output)));
      return;
    }
    for (const inp of this.inputs.values()) inp.sample(v, s.gnd, s.volts);
    const changedNets: number[] = [];
    this.gates.forEach((g, i) => {
      const x = g.inputs.map((p) => this.inputs.get(p)!.level);
      let y: boolean;
      switch (g.fn) {
        case 'and': y = x.every(Boolean); break;
        case 'nand': y = !x.every(Boolean); break;
        case 'or': y = x.some(Boolean); break;
        case 'nor': y = !x.some(Boolean); break;
        case 'xor': y = x.filter(Boolean).length % 2 === 1; break;
        case 'xnor': y = x.filter(Boolean).length % 2 === 0; break;
        case 'not': y = !x[0]; break;
        default: y = x[0];
      }
      if (y !== this.outputs[i] || !was) {
        this.outputs[i] = y;
        changedNets.push(this.ctx.net(g.output));
      }
    });
    if (changedNets.length) this.ctx.solveNow(changedNets);
  }
  diagnostics(): Diagnostic[] {
    return this.powered ? [] : [diag(this.ctx, 'unpowered', 'warning', 'VCC/GND are not powered.')];
  }
}
registerModel('logic-gates', (ctx) => new LogicGatesModel(ctx));

// =============================================================== LED arrays
const LED_R_ON = 15;
class LedArrayModel implements SimModel {
  private junctions: { d: PwlDiode; charge: number; window: number; avg: number; a: string; c: string }[];
  constructor(readonly ctx: ModelContext) {
    const segs = (ctx.setup.params.segments as { a: string; c: string }[]) ?? [];
    const vf = Number(ctx.setup.params.vf ?? 2.0);
    this.junctions = segs.map((s) => ({ d: { anode: -1, cathode: -1, vOn: vf - 0.02 * LED_R_ON, rOn: LED_R_ON, gOff: 1e-9, on: false }, charge: 0, window: 0, avg: 0, a: s.a, c: s.c }));
  }
  /** Common-anode variants swap the segment/common roles. */
  private resolve(pin: string) {
    const common = String(this.ctx.setup.params.commonPin ?? 'COM');
    if (pin === '$COM') return common;
    return pin;
  }
  stamp(s: StampCollector) {
    const anodeCommon = this.ctx.setup.props.common === 'anode';
    for (const j of this.junctions) {
      let a = this.resolve(j.a);
      let c = this.resolve(j.c);
      if (anodeCommon && (j.c === '$COM' || j.a === '$COM')) [a, c] = [c, a];
      j.d.anode = this.ctx.net(a);
      j.d.cathode = this.ctx.net(c);
      s.diode(j.d);
    }
  }
  integrate(dt: number, v: Float64Array) {
    for (const j of this.junctions) {
      if (j.d.anode < 0 || j.d.cathode < 0) continue;
      j.charge += Math.max(0, diodeCurrent(j.d, v)) * dt;
      j.window += dt;
    }
  }
  visualState() {
    const values = this.junctions.map((j) => {
      if (j.window > 0) j.avg = j.charge / j.window;
      j.charge = j.window = 0;
      return Math.min(1, j.avg / 0.005) > 0.15 ? 1 : 0;
    });
    return { values };
  }
  diagnostics(): Diagnostic[] {
    const hot = this.junctions.filter((j) => j.avg > 0.03).length;
    return hot ? [diag(this.ctx, 'led-overcurrent', 'warning', `${hot} segment(s) above 30 mA — add series resistors.`)] : [];
  }
}
registerModel('led-array', (ctx) => new LedArrayModel(ctx));

// ================================================================ buzzer
class BuzzerModel implements SimModel {
  private lastEdge = -1;
  private period = 0;
  private level = false;
  private lastToggle = -1;
  constructor(readonly ctx: ModelContext) {}
  stamp(s: StampCollector) {
    // Piezo element: mostly capacitive; a large resistance keeps the net defined.
    s.resistor(this.ctx.net('1'), this.ctx.net('2'), 100_000);
  }
  afterSolve(v: Float64Array) {
    const a = this.ctx.net('1');
    const b = this.ctx.net('2');
    if (a < 0 || b < 0) return;
    const lvl = Math.abs(v[a] - v[b]) > 1.5;
    if (lvl !== this.level) {
      this.level = lvl;
      const t = this.ctx.now();
      if (lvl) {
        if (this.lastEdge >= 0) this.period = t - this.lastEdge;
        this.lastEdge = t;
      }
      this.lastToggle = t;
    }
  }
  visualState() {
    const active = this.lastToggle >= 0 && this.ctx.now() - this.lastToggle < 0.05 && this.period > 0;
    return { hasSignal: active, frequency: active ? 1 / this.period : 0 };
  }
}
registerModel('buzzer', (ctx) => new BuzzerModel(ctx));

// ================================================================= relays
/** Electromechanical relay: coil resistance, pull-in/drop-out hysteresis, SPDT/DPDT contacts. */
class RelayModel implements SimModel {
  private energized = false;
  constructor(readonly ctx: ModelContext) {}
  private p() {
    return this.ctx.setup.params as { coil: [string, string]; poles: { com: string; no: string; nc: string }[]; rCoil?: number; pullIn?: number; dropOut?: number };
  }
  stamp(s: StampCollector) {
    const { coil, poles, rCoil } = this.p();
    s.resistor(this.ctx.net(coil[0]), this.ctx.net(coil[1]), rCoil ?? 70);
    for (const pole of poles) s.resistor(this.ctx.net(pole.com), this.ctx.net(this.energized ? pole.no : pole.nc), 0.05);
  }
  afterSolve(v: Float64Array) {
    const { coil, poles, pullIn, dropOut } = this.p();
    const a = this.ctx.net(coil[0]);
    const b = this.ctx.net(coil[1]);
    if (a < 0 || b < 0) return;
    const volts = Math.abs(v[a] - v[b]);
    const next = this.energized ? volts > (dropOut ?? 1.5) : volts > (pullIn ?? 3.75);
    if (next !== this.energized) {
      this.energized = next;
      this.ctx.solveNow(poles.flatMap((p) => [p.com, p.no, p.nc].map((x) => this.ctx.net(x))));
    }
  }
  visualState() {
    return { energized: this.energized };
  }
}
registerModel('relay', (ctx) => new RelayModel(ctx));

/** Opto-isolated relay module (active-low IN by default). */
class RelayModuleModel implements SimModel {
  private on = false;
  constructor(readonly ctx: ModelContext) {}
  stamp(s: StampCollector) {
    // Input LED + optocoupler path from VCC: ~1 kΩ.
    s.resistor(this.ctx.net('VCC'), this.ctx.net('IN'), 1000);
    s.resistor(this.ctx.net('COM'), this.ctx.net(this.on ? 'NO' : 'NC'), 0.05);
  }
  afterSolve(v: Float64Array) {
    const sup = supply(this.ctx, v);
    const inNet = this.ctx.net('IN');
    let next = false;
    if (sup.powered && inNet >= 0 && this.ctx.isDriven(inNet)) {
      const activeLow = this.ctx.setup.props.trigger !== 'high';
      const vin = v[inNet] - v[sup.gnd];
      next = activeLow ? vin < 0.3 * sup.volts : vin > 0.6 * sup.volts;
    }
    if (next !== this.on) {
      this.on = next;
      this.ctx.solveNow(['COM', 'NO', 'NC'].map((p) => this.ctx.net(p)));
    }
  }
}
registerModel('relay-module', (ctx) => new RelayModuleModel(ctx));

// ============================================================ DIP switch
class SwitchArrayModel implements SimModel {
  constructor(readonly ctx: ModelContext) {}
  private pairs() {
    return (this.ctx.setup.params.pairs as [string, string][]) ?? [];
  }
  stamp(s: StampCollector) {
    this.pairs().forEach(([a, b], i) => {
      if (this.ctx.setup.props[`sw${i + 1}`]) s.resistor(this.ctx.net(a), this.ctx.net(b), 0.05);
    });
  }
  setProp() {
    this.ctx.solveNow(this.pairs().flat().map((p) => this.ctx.net(p)));
  }
  visualState() {
    return { values: this.pairs().map((_, i) => (this.ctx.setup.props[`sw${i + 1}`] ? 1 : 0)) };
  }
}
registerModel('switch-array', (ctx) => new SwitchArrayModel(ctx));

// =============================================================== joystick
class JoystickModel implements SimModel {
  private pressed = false;
  constructor(readonly ctx: ModelContext) {}
  stamp(s: StampCollector) {
    const vcc = this.ctx.net('VCC');
    const gnd = this.ctx.net('GND');
    const r = 10_000;
    for (const [pin, key] of [
      ['HORZ', 'x'],
      ['VERT', 'y'],
    ] as const) {
      const p = Math.max(0, Math.min(1, numProp(this.ctx, key, 0.5)));
      const w = this.ctx.net(pin);
      s.resistor(gnd, w, Math.max(1, r * p));
      s.resistor(w, vcc, Math.max(1, r * (1 - p)));
    }
    if (this.pressed || this.ctx.setup.props.pressed) s.resistor(this.ctx.net('SEL'), gnd, 0.05);
  }
  onInput(key: string, value: PropValue) {
    if (key === 'pressed') {
      this.pressed = !!value;
      this.ctx.solveNow([this.ctx.net('SEL')]);
    }
  }
  setProp() {
    this.ctx.solveNow(['HORZ', 'VERT', 'SEL'].map((p) => this.ctx.net(p)));
  }
  visualState() {
    return { xValue: numProp(this.ctx, 'x', 0.5) * 2 - 1, yValue: numProp(this.ctx, 'y', 0.5) * 2 - 1, pressed: this.pressed || !!this.ctx.setup.props.pressed };
  }
}
registerModel('joystick', (ctx) => new JoystickModel(ctx));

// =========================================================== digital sensors
/** PIR / tilt / generic "event" sensor: OUT high while active (with hold time). */
class EventSensorModel implements SimModel {
  private activeUntil = -1;
  private powered = false;
  private vcc = 5;
  private gnd = -1;
  constructor(readonly ctx: ModelContext) {}
  private get out() {
    return String(this.ctx.setup.params.out ?? 'OUT');
  }
  private active() {
    return !!this.ctx.setup.props.active || this.ctx.now() < this.activeUntil;
  }
  stamp(s: StampCollector) {
    if (this.powered) driveOutput(s, this.ctx, this.out, this.active() !== (this.ctx.setup.params.activeLow === true), this.vcc, this.gnd, 100);
  }
  afterSolve(v: Float64Array) {
    const sup = supply(this.ctx, v);
    if (sup.powered !== this.powered) {
      this.powered = sup.powered;
      this.vcc = sup.volts;
      this.gnd = sup.gnd;
      this.ctx.solveNow([this.ctx.net(this.out)]);
    }
  }
  onInput(key: string) {
    if (key !== 'trigger' && key !== 'toggle') return;
    if (key === 'toggle') {
      this.activeUntil = this.active() ? -1 : Infinity;
    } else {
      const hold = numProp(this.ctx, 'holdTime', 2.5);
      this.activeUntil = this.ctx.now() + hold;
      this.ctx.schedule(hold + 1e-6, () => this.ctx.solveNow([this.ctx.net(this.out)]));
    }
    this.ctx.solveNow([this.ctx.net(this.out)]);
  }
  setProp() {
    this.ctx.solveNow([this.ctx.net(this.out)]);
  }
}
registerModel('event-sensor', (ctx) => new EventSensorModel(ctx));

/** Analog sensor module: divider AO + comparator DO (LDR/NTC/gas/flame-style boards). */
class AnalogModuleModel implements SimModel {
  private doHigh = false;
  private powered = false;
  private vcc = 5;
  private gnd = -1;
  constructor(readonly ctx: ModelContext) {}
  private p() {
    return this.ctx.setup.params as { ao: string; do?: string; sensor: 'ldr' | 'ntc' | 'level'; vcc?: string; gnd?: string };
  }
  /** Sensor resistance against a 10 kΩ load. */
  private ratio(): number {
    const k = this.p().sensor;
    if (k === 'ldr') {
      const lux = Math.max(0.1, numProp(this.ctx, 'lux', 300));
      const r = 20_000 * Math.pow(lux / 10, -0.7);
      return 10_000 / (r + 10_000);
    }
    if (k === 'ntc') {
      const t = numProp(this.ctx, 'temperature', 25) + 273.15;
      const r = 10_000 * Math.exp(3950 * (1 / t - 1 / 298.15));
      return 10_000 / (r + 10_000);
    }
    return Math.max(0, Math.min(1, numProp(this.ctx, 'level', 0.2)));
  }
  stamp(s: StampCollector) {
    const p = this.p();
    if (!this.powered) return;
    const ao = this.ctx.net(p.ao);
    if (ao >= 0 && this.gnd >= 0) s.voltageSource(ao, this.gnd, this.vcc * this.ratio(), 1000);
    if (p.do) driveOutput(s, this.ctx, p.do, this.doHigh, this.vcc, this.gnd, 1000);
  }
  afterSolve(v: Float64Array) {
    const p = this.p();
    const sup = supply(this.ctx, v, p.vcc ?? 'VCC', p.gnd ?? 'GND');
    const thr = numProp(this.ctx, 'threshold', 0.5);
    const doHigh = this.ratio() < thr; // typical boards: DO low when the reading exceeds the trimmer threshold
    if (sup.powered !== this.powered || doHigh !== this.doHigh) {
      this.powered = sup.powered;
      this.vcc = sup.volts;
      this.gnd = sup.gnd;
      this.doHigh = doHigh;
      this.ctx.solveNow([this.ctx.net(p.ao), this.ctx.net(p.do ?? '')]);
    }
  }
  setProp() {
    this.ctx.solveNow([this.ctx.net(this.p().ao), this.ctx.net(this.p().do ?? '')]);
  }
}
registerModel('analog-module', (ctx) => new AnalogModuleModel(ctx));

// ======================================================= signal generator
class SignalGeneratorModel implements SimModel {
  private value = 0;
  private running = false;
  constructor(readonly ctx: ModelContext) {
    ctx.schedule(0, () => this.tick());
  }
  private get freq() {
    return Math.max(0.01, numProp(this.ctx, 'frequency', 1000));
  }
  private compute(t: number) {
    const amp = numProp(this.ctx, 'amplitude', 5) / 2;
    const off = numProp(this.ctx, 'offset', 2.5);
    const phase = (t * this.freq) % 1;
    switch (this.ctx.setup.props.waveform) {
      case 'sine':
        return off + amp * Math.sin(2 * Math.PI * phase);
      case 'triangle':
        return off + amp * (phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase);
      case 'dc':
        return off;
      default: {
        const duty = Math.max(0.01, Math.min(0.99, numProp(this.ctx, 'duty', 50) / 100));
        return off + (phase < duty ? amp : -amp);
      }
    }
  }
  private tick() {
    if (this.running) return;
    this.running = true;
    const step = () => {
      const t = this.ctx.now();
      this.value = this.compute(t);
      this.ctx.solveNow([this.ctx.net('OUT')]);
      const wave = this.ctx.setup.props.waveform;
      if (wave === 'dc') {
        this.running = false;
        return;
      }
      const period = 1 / this.freq;
      if (wave === 'square' || !wave) {
        // Exact edges: schedule the next transition.
        const duty = Math.max(0.01, Math.min(0.99, numProp(this.ctx, 'duty', 50) / 100));
        const phase = (t * this.freq) % 1;
        const next = phase < duty ? (duty - phase) * period : (1 - phase) * period;
        this.ctx.schedule(Math.max(next, 1e-7), step);
      } else this.ctx.schedule(period / 64, step);
    };
    step();
  }
  stamp(s: StampCollector) {
    s.voltageSource(this.ctx.net('OUT'), this.ctx.net('GND'), this.value, 50);
  }
  setProp() {
    this.running = false;
    this.tick();
  }
}
registerModel('signal-generator', (ctx) => new SignalGeneratorModel(ctx));
