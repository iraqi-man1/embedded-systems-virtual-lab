/**
 * Behaviour-model contract. A component definition names a model id; the
 * engine instantiates the registered factory for each instance.
 */
import type { PropValue } from '../model/circuit';
import type { Diagnostic } from '../circuit/diagnostics';
import type { SolveResult, StampCollector } from './analog/solver';
import type { I2CDevice, McuEmulator, SPIDevice } from './mcu/mcu';
import type { McuDebug, SimComponentSetup } from './types';

export interface ModelContext {
  readonly setup: SimComponentSetup;
  /** Net index of a pin, or -1 if the pin does not exist. */
  net(pinId: string): number;
  /** Current simulation time in seconds. */
  now(): number;
  /** Marks nets dirty so the next solve re-evaluates their islands. */
  invalidate(nets?: number[]): void;
  /** Requests an immediate re-solve (e.g. after an MCU pin toggled). */
  solveNow(nets?: number[]): void;
  /** Runs `cb` after `seconds` of simulation time. */
  schedule(seconds: number, cb: () => void): void;
  /** Bytes from a UART for the serial monitor. */
  serialOut(bytes: number[]): void;
  /** Find other models (for protocol-level buses). */
  models(): Iterable<SimModel>;
  /** Number of component pins on a net (1 = only this pin, i.e. unconnected). */
  netPinCount(net: number): number;
  isDriven(net: number): boolean;
}

export interface SimModel {
  readonly ctx: ModelContext;
  /** Adds this element's conductances/sources to the solver. */
  stamp(s: StampCollector): void;
  /** Called after each solve with the node voltages. */
  afterSolve?(v: Float64Array, result: SolveResult): void;
  /** Time-integration hook: `dt` seconds elapsed with solution `v`. */
  integrate?(dt: number, v: Float64Array): void;
  /** UI interaction (button press, knob turn...). */
  onInput?(key: string, value: PropValue): void;
  /** Live property change. */
  setProp?(key: string, value: PropValue): void;
  /** State for the visual layer, read once per frame. May reset averages. */
  visualState?(frameDt: number): Record<string, unknown> | undefined;
  /** Dynamic problems (over-current, floating input read...). */
  diagnostics?(): Diagnostic[];
  /** Set for models that own a programmable MCU. */
  readonly mcu?: McuEmulator;
  /** Registers and pin activity for the MCU panel (called once per frame, after `visualState`). */
  mcuDebug?(): McuDebug | undefined;
  /** Protocol-level I2C target, reachable when its SDA/SCL nets are an MCU's bus nets. */
  readonly i2c?: I2CDevice & { sdaPin: string; sclPin: string };
  /** Protocol-level SPI peripheral, reachable when its MOSI/SCK nets are an MCU's bus nets. */
  readonly spi?: SPIDevice & { mosiPin: string; sckPin: string };
  /** Called on simulation reset (power cycle). */
  reset?(): void;
  dispose?(): void;
}

export type ModelFactory = (ctx: ModelContext) => SimModel;

const models = new Map<string, ModelFactory>();

export function registerModel(id: string, factory: ModelFactory) {
  models.set(id, factory);
}

export function getModelFactory(id: string): ModelFactory | undefined {
  return models.get(id);
}

export function registeredModelIds(): string[] {
  return [...models.keys()];
}

/** Helpers shared by models. */
export function numProp(ctx: ModelContext, key: string, fallback: number): number {
  const v = ctx.setup.props[key];
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return isFinite(n) ? n : fallback;
  }
  return fallback;
}
