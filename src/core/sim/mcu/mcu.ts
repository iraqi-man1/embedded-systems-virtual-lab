/**
 * MCU Emulator abstraction. Each core family (AVR via avr8js, RP2040 via
 * rp2040js, Renode-bridged targets...) implements this interface; the
 * simulation engine only ever talks to it.
 */
import type { McuDefinition } from '../../model/component';

export type PinDrive = 'low' | 'high' | 'input' | 'input-pullup' | 'input-pulldown';

/** Program counter as a byte address: AVR counts 16-bit words, ARM counts bytes. */
export const pcAddress = (core: string | undefined, pc: number) => (core === 'rp2040' ? pc >>> 0 : pc * 2);

export interface FirmwareImage {
  format: 'ihex';
  data: string;
}

/** A program run by an interpreter on the board (MicroPython): the interpreter image and the user's files. */
export interface ScriptProgram {
  kind: 'micropython';
  /** UF2 image of the interpreter. */
  image: Uint8Array;
  files: { name: string; content: string }[];
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

/** CPU registers for the MCU debug panel. */
export interface McuRegisters {
  /** Register file layout: AVR R0..R31 with SREG, or ARM R0..R15 with xPSR. */
  arch?: 'avr' | 'arm';
  /** General-purpose registers (R0..R31 on AVR, R0..R12 on ARM). */
  r: number[];
  sp: number;
  /** AVR SREG, or ARM xPSR. */
  sreg: number;
  /** Highest data address (stack pointer value at reset). */
  ramEnd: number;
  /** ARM link register. */
  lr?: number;
}

export interface McuEmulator {
  readonly family: string;
  readonly clockHz: number;
  readonly cycles: number;
  readonly pc: number;
  load(firmware: FirmwareImage): void;
  /** Interpreter-based boards: loads the interpreter and the user's files (instead of `load`). */
  loadProgram?(program: ScriptProgram): void;
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
  /** Register snapshot for debugging (optional per family). */
  registers?(): McuRegisters;
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
