/**
 * RP2040 emulator adapter (Raspberry Pi Pico) built on rp2040js (MIT): the
 * Cortex-M0+ core, GPIO, PWM, ADC, I2C, SPI, UART, timers and the USB
 * controller run the real MicroPython firmware. This adapter maps board pins
 * to GPIO numbers, feeds ADC voltages, connects I2C/SPI to the circuit's
 * devices and plays the USB host for the serial port (see MicroPythonHost).
 */
import { GPIOPinState, I2CMode, Simulator, USBCDC, type RP2040, type RPI2C } from 'rp2040js';
import { decodeBlock } from 'uf2';
import type { McuDefinition } from '../../../model/component';
import type { FirmwareImage, I2CDevice, McuEmulator, McuRegisters, PinDrive, ScriptProgram, SPIDevice } from '../mcu';
import { bootromB1 } from './bootrom';
import { attachFlash } from './flash';
import { MicroPythonHost } from './micropythonHost';

const FLASH_START = 0x10000000;
/** clk_sys as configured by the Pico SDK (MicroPython) and assumed by rp2040js' own runner. */
const CLOCK_HZ = 125_000_000;
const NS_PER_CYCLE = 1e9 / CLOCK_HZ;
const ADC_VREF = 3.3;

export class Rp2040Emulator implements McuEmulator {
  readonly family = 'rp2040';
  readonly clockHz = CLOCK_HZ;
  readonly pins: string[];
  readonly serialBaud = 115200;
  onPinChange: ((pinId: string) => void) | null = null;
  onSerialByte: ((byte: number) => void) | null = null;
  i2cResolver: ((address: number) => I2CDevice | null) | null = null;
  spiResolver: (() => SPIDevice | null) | null = null;

  private clock!: Simulator['clock'];
  private chip!: RP2040;
  private cdc!: USBCDC;
  private host: MicroPythonHost | null = null;
  /** Size of the USB OUT buffer the board has armed and waits to have filled by the host. */
  private usbRead: number | null = null;
  private program: ScriptProgram | null = null;
  /** Flash contents to boot from (the interpreter, and after the first run the files too). */
  private flash: Uint8Array | null = null;
  private gpioOf = new Map<string, number>();
  private adcOf = new Map<string, number>();
  private analog = new Map<number, number>();
  /** Level the circuit last put on each GPIO (what its input buffer reads when not driving). */
  private circuitLevel = new Map<number, boolean>();
  private i2cDevices: I2CDevice[] = [];
  private spiDevices: SPIDevice[] = [];
  private limit = 0;
  /** Simulation time already run by earlier chip instances (resets keep the clock monotonic). */
  private baseNanos = 0;

  constructor(def: McuDefinition) {
    for (const [pin, m] of Object.entries(def.pinMap)) {
      if ('gpio' in m) {
        this.gpioOf.set(pin, m.gpio);
        if (m.adc !== undefined) this.adcOf.set(pin, m.adc);
      }
    }
    this.pins = [...this.gpioOf.keys()];
    // Internal ADC inputs: VSYS/3 on the Pico (channel 3) and the temperature sensor (channel 4,
    // 0.706 V at 27 °C), so ADC(3) and ADC(4) read what a board on a desk would.
    this.analog.set(3, 4.75 / 3);
    this.analog.set(4, 0.706);
    this.build();
  }

  get cycles() {
    return (this.baseNanos + this.clock.nanos) / NS_PER_CYCLE;
  }

  get pc() {
    return this.chip.core.PC;
  }

  load(firmware: FirmwareImage) {
    throw new Error(`The RP2040 board runs MicroPython programs, not ${firmware.format} firmware.`);
  }

  loadProgram(program: ScriptProgram) {
    this.program = program;
    const flash = new Uint8Array(this.chip.flash.length).fill(0xff);
    const img = program.image;
    for (let i = 0; i + 512 <= img.length; i += 512) {
      const block = decodeBlock(img.subarray(i, i + 512));
      if (block.flashAddress >= FLASH_START) flash.set(block.payload, block.flashAddress - FLASH_START);
    }
    this.flash = flash;
    this.boot(false);
  }

  /** Power-on or RESET: the file system survives a reset, as on the real board. */
  reset() {
    const keep = this.chip.flash.slice();
    this.flash = keep;
    this.boot(true);
    for (const p of this.pins) this.onPinChange?.(p);
  }

  private build() {
    if (this.clock) this.baseNanos += this.clock.nanos;
    // The Simulator only bundles a chip with its clock; this adapter runs the instruction loop itself.
    const sim = new Simulator();
    this.clock = sim.clock;
    const chip = sim.rp2040;
    chip.loadBootrom(bootromB1);
    attachFlash(chip);
    chip.logger = { debug() {}, info() {}, warn() {}, error() {} };
    this.chip = chip;
    for (const [pin, n] of this.gpioOf) {
      const gpio = chip.gpio[n];
      gpio.addListener(() => {
        // The input buffer of a driven pin reads its own level (Pin.value() on an output); once
        // released it reads the circuit again (open-drain bit-banging, e.g. the I2C scan).
        const level = gpio.outputEnable ? gpio.outputValue : this.circuitLevel.get(n);
        if (level !== undefined && level !== gpio.inputValue) gpio.setInputValue(level);
        this.onPinChange?.(pin);
      });
    }
    chip.adc.onADCRead = (channel) => {
      const volts = this.analog.get(channel) ?? 0;
      const raw = Math.round((Math.max(0, Math.min(ADC_VREF, volts)) / ADC_VREF) * 4095);
      const alarm = this.clock.createAlarm(() => chip.adc.completeADCRead(raw, false));
      alarm.schedule(chip.adc.sampleTime * 1000);
    };
    for (const i2c of chip.i2c) this.wireI2C(i2c);
    for (const spi of chip.spi) {
      spi.onTransmit = (value) => {
        const dev = this.spiDevices.find((d) => d.selected()) ?? this.spiResolver?.() ?? null;
        spi.completeTransmit(dev ? dev.transfer(value) & 0xff : 0xff);
      };
    }
    this.cdc = new USBCDC(chip.usbCtrl);
    this.cdc.onDeviceConnected = () => this.host?.connected();
    this.cdc.onSerialData = (bytes) => this.host?.received(bytes);
    // rp2040js' host answers an armed OUT endpoint at once, with an empty packet when it has
    // nothing to send: the board re-arms, the USB interrupt fires non-stop and the CPU never
    // sleeps (the simulation crawls). A real host only sends when it has data, so the read
    // stays pending until then.
    this.usbRead = null;
    chip.usbCtrl.onEndpointRead = (endpoint, size) => {
      if (endpoint !== this.cdcOut) return;
      this.usbRead = size;
      this.pumpUsb();
    };
  }

  private get cdcOut(): number {
    return (this.cdc as unknown as { outEndpoint: number }).outEndpoint;
  }

  private boot(afterReset: boolean) {
    this.build();
    if (this.flash) this.chip.flash.set(this.flash);
    this.chip.core.PC = FLASH_START;
    if (!this.program) return;
    this.host = new MicroPythonHost(this.program.files, (bytes) => {
      for (const b of bytes) this.onSerialByte?.(b);
    });
    // After a reset main.py is already on the board's file system.
    if (afterReset) this.host.skipUpload();
  }

  private wireI2C(i2c: RPI2C) {
    let dev: I2CDevice | null = null;
    i2c.onStart = () => i2c.completeStart();
    i2c.onConnect = (address, mode) => {
      dev = this.i2cDevices.find((d) => d.address === address) ?? this.i2cResolver?.(address) ?? null;
      i2c.completeConnect(dev ? dev.connect(mode === I2CMode.Write) : false);
    };
    i2c.onWriteByte = (value) => i2c.completeWrite(dev ? dev.write(value) : false);
    i2c.onReadByte = (ack) => i2c.completeRead(dev ? dev.read(ack) & 0xff : 0xff);
    i2c.onStop = () => {
      dev?.stop();
      dev = null;
      i2c.completeStop();
    };
  }

  /** Sends queued host bytes to the board when it has a USB OUT buffer armed. */
  private pumpUsb() {
    const size = this.usbRead;
    if (size === null || !this.host?.pending) return;
    const bytes: number[] = [];
    this.host.pump(
      () => bytes.length < size,
      (b) => bytes.push(b),
    );
    this.usbRead = null;
    this.chip.usbCtrl.endpointReadDone(this.cdcOut, Uint8Array.from(bytes));
  }

  runUntil(target: number) {
    this.limit = target;
    const chip = this.chip;
    const core = chip.core;
    const clock = this.clock;
    let n = 0;
    while (this.cycles < this.limit) {
      if (core.waiting) {
        const remaining = (this.limit - this.cycles) * NS_PER_CYCLE;
        const next = clock.nanosToNextAlarm;
        clock.tick(next > 0 ? Math.min(next, remaining) : remaining);
      } else {
        clock.tick(core.executeInstruction() * NS_PER_CYCLE);
      }
      if ((++n & 0x3ff) === 0) this.pumpUsb();
    }
    this.pumpUsb();
  }

  limitTo(target: number) {
    if (target < this.limit) this.limit = target;
  }

  step() {
    if (this.chip.core.waiting) this.clock.tick(Math.max(NS_PER_CYCLE, this.clock.nanosToNextAlarm));
    else this.clock.tick(this.chip.core.executeInstruction() * NS_PER_CYCLE);
    this.pumpUsb();
  }

  pinDrive(pinId: string): PinDrive {
    const n = this.gpioOf.get(pinId);
    if (n === undefined) return 'input';
    switch (this.chip.gpio[n].value) {
      case GPIOPinState.High:
        return 'high';
      case GPIOPinState.Low:
        return 'low';
      case GPIOPinState.InputPullUp:
        return 'input-pullup';
      case GPIOPinState.InputPullDown:
        return 'input-pulldown';
      default:
        return 'input';
    }
  }

  setInputLevel(pinId: string, high: boolean) {
    const n = this.gpioOf.get(pinId);
    if (n === undefined) return;
    this.circuitLevel.set(n, high);
    if (!this.chip.gpio[n].outputEnable) this.chip.gpio[n].setInputValue(high);
  }

  setAnalogVoltage(pinId: string, volts: number) {
    const ch = this.adcOf.get(pinId);
    if (ch !== undefined) this.analog.set(ch, volts);
  }

  serialWrite(byte: number): boolean {
    const ok = this.host?.write(byte) ?? false;
    if (ok) this.pumpUsb();
    return ok;
  }

  attachI2C(device: I2CDevice) {
    this.i2cDevices.push(device);
  }

  attachSPI(device: SPIDevice) {
    this.spiDevices.push(device);
  }

  schedule(cycles: number, cb: () => void) {
    this.clock.createAlarm(cb).schedule(Math.max(1, cycles) * NS_PER_CYCLE);
  }

  registers(): McuRegisters {
    const core = this.chip.core;
    return { arch: 'arm', r: Array.from(core.registers.subarray(0, 13)), sp: core.SP >>> 0, lr: core.LR >>> 0, sreg: core.xPSR >>> 0, ramEnd: 0x20042000 };
  }
}
