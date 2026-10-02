/**
 * AVR emulator adapter (ATmega328P/2560 class) built on avr8js (MIT).
 * avr8js provides the cycle-accurate CPU and peripherals; this adapter maps
 * board pins to ports and exposes the generic McuEmulator interface.
 */
import {
  AVRADC,
  AVRClock,
  AVREEPROM,
  AVRIOPort,
  AVRSPI,
  AVRTimer,
  AVRTWI,
  AVRUSART,
  AVRWatchdog,
  CPU,
  EEPROMMemoryBackend,
  PinState,
  adcConfig,
  avrInstruction,
  clockConfig,
  portBConfig,
  portCConfig,
  portDConfig,
  spiConfig,
  timer0Config,
  timer1Config,
  timer2Config,
  twiConfig,
  usart0Config,
  watchdogConfig,
  type TWIEventHandler,
} from 'avr8js';
import type { McuDefinition } from '../../../model/component';
import { loadIntelHex } from '../ihex';
import type { FirmwareImage, I2CDevice, McuEmulator, McuRegisters, PinDrive, SPIDevice } from '../mcu';

interface PinBinding {
  port: AVRIOPort;
  bit: number;
  adc?: number;
}

class TwiBus implements TWIEventHandler {
  devices: I2CDevice[] = [];
  resolver: ((address: number) => I2CDevice | null) | null = null;
  private active: I2CDevice | null = null;
  constructor(private twi: AVRTWI) {}
  start() {
    this.twi.completeStart();
  }
  stop() {
    this.active?.stop();
    this.active = null;
    this.twi.completeStop();
  }
  connectToSlave(addr: number, write: boolean) {
    const dev = this.devices.find((d) => d.address === addr) ?? this.resolver?.(addr) ?? null;
    this.active = dev;
    this.twi.completeConnect(dev ? dev.connect(write) : false);
  }
  writeByte(value: number) {
    this.twi.completeWrite(this.active ? this.active.write(value) : false);
  }
  readByte(ack: boolean) {
    this.twi.completeRead(this.active ? this.active.read(ack) & 0xff : 0xff);
  }
}

export class AvrEmulator implements McuEmulator {
  readonly family = 'avr';
  readonly clockHz: number;
  readonly pins: string[];
  onPinChange: ((pinId: string) => void) | null = null;
  onSerialByte: ((byte: number) => void) | null = null;
  i2cResolver: ((address: number) => I2CDevice | null) | null = null;
  spiResolver: (() => SPIDevice | null) | null = null;

  private program: Uint16Array;
  private cpu!: CPU;
  private portList: AVRIOPort[] = [];
  private ports = new Map<string, AVRIOPort>();
  private bindings = new Map<string, PinBinding>();
  private adcOnly = new Map<string, number>();
  private adc!: AVRADC;
  private usart!: AVRUSART;
  private spi!: AVRSPI;
  private twiBus!: TwiBus;
  private eepromBackend: EEPROMMemoryBackend;
  private i2cDevices: I2CDevice[] = [];
  private spiDevices: SPIDevice[] = [];
  private analogValues = new Map<number, number>();

  constructor(private def: McuDefinition) {
    this.clockHz = def.clockHz;
    this.program = new Uint16Array(def.flashBytes / 2);
    this.eepromBackend = new EEPROMMemoryBackend(1024);
    this.pins = Object.keys(def.pinMap);
    this.build();
  }

  get cycles() {
    return this.cpu.cycles;
  }
  get pc() {
    return this.cpu.pc;
  }
  get serialBaud() {
    return this.usart.baudRate;
  }

  load(firmware: FirmwareImage) {
    if (firmware.format !== 'ihex') throw new Error(`Unsupported firmware format ${firmware.format}`);
    this.program.fill(0xffff);
    loadIntelHex(firmware.data, new Uint8Array(this.program.buffer));
    this.build();
  }

  /** Power-on reset: rebuilds CPU and peripheral state (EEPROM is retained). */
  reset() {
    this.build();
    for (const p of this.pins) this.onPinChange?.(p);
  }

  private build() {
    const cpu = new CPU(this.program, this.def.sramBytes);
    this.cpu = cpu;
    const freq = this.def.clockHz;
    new AVRTimer(cpu, timer0Config);
    new AVRTimer(cpu, timer1Config);
    new AVRTimer(cpu, timer2Config);
    const clock = new AVRClock(cpu, freq, clockConfig);
    new AVRWatchdog(cpu, watchdogConfig, clock);
    new AVREEPROM(cpu, this.eepromBackend);
    this.ports.clear();
    this.portList = [];
    const configs: [string, typeof portBConfig][] = [
      ['B', portBConfig],
      ['C', portCConfig],
      ['D', portDConfig],
    ];
    for (const [name, cfg] of configs) {
      const port = new AVRIOPort(cpu, cfg);
      this.ports.set(name, port);
      this.portList.push(port);
    }
    this.bindings.clear();
    this.adcOnly.clear();
    for (const [pinId, m] of Object.entries(this.def.pinMap)) {
      if ('adcOnly' in m) this.adcOnly.set(pinId, m.adcOnly);
      else if ('port' in m) {
        const port = this.ports.get(m.port);
        if (port) this.bindings.set(pinId, { port, bit: m.bit, adc: m.adc });
      }
    }
    // Per-port listener -> notify board pins on that port.
    for (const [name, port] of this.ports) {
      const pinsOnPort = [...this.bindings.entries()].filter(([, b]) => b.port === port);
      port.addListener((value, old) => {
        const changed = value ^ old;
        for (const [pinId, b] of pinsOnPort) {
          // DDR changes don't show up in `value ^ old`, so always notify when nothing toggled.
          if (changed === 0 || changed & (1 << b.bit)) this.onPinChange?.(pinId);
        }
      });
      void name;
    }
    this.adc = new AVRADC(cpu, adcConfig);
    for (const [ch, v] of this.analogValues) this.adc.channelValues[ch] = v;
    this.usart = new AVRUSART(cpu, usart0Config, freq);
    this.usart.onByteTransmit = (b) => this.onSerialByte?.(b);
    this.spi = new AVRSPI(cpu, spiConfig, freq);
    this.spi.onTransfer = (value) => {
      const dev = this.spiDevices.find((d) => d.selected()) ?? this.spiResolver?.() ?? null;
      return dev ? dev.transfer(value) & 0xff : 0xff;
    };
    const twi = new AVRTWI(cpu, twiConfig, freq);
    this.twiBus = new TwiBus(twi);
    this.twiBus.devices = this.i2cDevices;
    this.twiBus.resolver = (addr) => this.i2cResolver?.(addr) ?? null;
    twi.eventHandler = this.twiBus;
  }

  private limit = 0;

  runUntil(target: number) {
    const cpu = this.cpu;
    this.limit = target;
    while (cpu.cycles < this.limit) {
      avrInstruction(cpu);
      cpu.tick();
    }
  }

  limitTo(target: number) {
    if (target < this.limit) this.limit = target;
  }

  step() {
    avrInstruction(this.cpu);
    this.cpu.tick();
  }

  pinDrive(pinId: string): PinDrive {
    const b = this.bindings.get(pinId);
    if (!b) return 'input';
    switch (b.port.pinState(b.bit)) {
      case PinState.High:
        return 'high';
      case PinState.Low:
        return 'low';
      case PinState.InputPullUp:
        return 'input-pullup';
      default:
        return 'input';
    }
  }

  setInputLevel(pinId: string, high: boolean) {
    const b = this.bindings.get(pinId);
    if (b) b.port.setPin(b.bit, high);
  }

  setAnalogVoltage(pinId: string, volts: number) {
    const ch = this.bindings.get(pinId)?.adc ?? this.adcOnly.get(pinId);
    if (ch === undefined) return;
    this.analogValues.set(ch, volts);
    this.adc.channelValues[ch] = volts;
  }

  serialWrite(byte: number): boolean {
    if (!this.usart.rxEnable || this.usart.rxBusy) return false;
    return !!this.usart.writeByte(byte);
  }

  attachI2C(device: I2CDevice) {
    this.i2cDevices.push(device);
  }

  attachSPI(device: SPIDevice) {
    this.spiDevices.push(device);
  }

  schedule(cycles: number, cb: () => void) {
    this.cpu.addClockEvent(cb, Math.max(1, Math.round(cycles)));
  }

  registers(): McuRegisters {
    const { data } = this.cpu;
    return { r: Array.from(data.subarray(0, 32)), sp: this.cpu.SP, sreg: this.cpu.SREG, ramEnd: data.length - 1 };
  }
}
