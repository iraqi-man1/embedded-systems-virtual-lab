/**
 * MCU Emulator abstraction. Each core family (AVR via avr8js, RP2040 via
 * rp2040js, Renode-bridged targets...) implements this interface; the
 * simulation engine only ever talks to it.
 */
import type { McuDefinition } from '../../model/component';

export type PinDrive = 'low' | 'high' | 'input' | 'input-pullup';

export interface FirmwareImage {
  format: 'ihex';
  data: string;
}

/** Protocol-level I2C target attached to an MCU's hardware TWI peripheral. */
export interface I2CDevice {
  address: number;
  /** Return true to ACK. */
  connect(write: boolean): boolean;
  /** Byte written by the controller; return true to ACK. */
  write(byte: number): boolean;
  /** Byte requested by the controller. */
  read(ack: boolean): number;
  stop(): void;
}

/** Protocol-level SPI peripheral attached to the MCU's SPI controller. */
export interface SPIDevice {
  /** Called only while the device's chip-select is asserted. */
  transfer(byte: number): number;
  selected(): boolean;
}

export interface McuEmulator {
  readonly family: string;
  readonly clockHz: number;
  readonly cycles: number;
  readonly pc: number;
  load(firmware: FirmwareImage): void;
  reset(): void;
  /** Executes instructions until `cycles >= target`. */
  runUntil(targetCycles: number): void;
  /** Lowers the target of a `runUntil` in progress (an earlier event was scheduled). */
  limitTo(targetCycles: number): void;
  /** Executes one instruction. */
  step(): void;
  /** Board pin ids this emulator controls. */
  readonly pins: string[];
  pinDrive(pinId: string): PinDrive;
  /** Digital level seen by an input pin. */
  setInputLevel(pinId: string, high: boolean): void;
  /** Voltage applied to an ADC-capable pin. */
  setAnalogVoltage(pinId: string, volts: number): void;
  /** Fires when a pin's drive state may have changed. */
  onPinChange: ((pinId: string) => void) | null;
  /** Serial port 0 (bytes transmitted by the firmware). */
  onSerialByte: ((byte: number) => void) | null;
  serialWrite(byte: number): boolean;
  readonly serialBaud: number;
  attachI2C(device: I2CDevice): void;
  attachSPI(device: SPIDevice): void;
  /** Dynamic lookup of I2C targets by address (consulted after attached devices). */
  i2cResolver: ((address: number) => I2CDevice | null) | null;
  /** Dynamic lookup of the selected SPI peripheral. */
  spiResolver: (() => SPIDevice | null) | null;
  /** Schedules a callback after `cycles` CPU cycles. */
  schedule(cycles: number, cb: () => void): void;
}

export type McuFactory = (def: McuDefinition) => McuEmulator;

const factories = new Map<string, McuFactory>();

export function registerMcuFamily(core: string, factory: McuFactory) {
  factories.set(core, factory);
}

export function createMcu(def: McuDefinition): McuEmulator {
  const f = factories.get(def.core);
  if (!f) throw new Error(`No emulator registered for MCU core "${def.core}" (${def.chip}).`);
  return f(def);
}

export function hasMcuFamily(core: string) {
  return factories.has(core);
}
