/**
 * Types shared between the UI thread and the simulation worker. Everything
 * here must be structured-clone friendly (plain data).
 */
import type { McuDefinition } from '../model/component';
import type { PropValue } from '../model/circuit';
import type { Diagnostic } from '../circuit/diagnostics';

export interface SimComponentSetup {
  id: string;
  type: string;
  label: string;
  model: string;
  props: Record<string, PropValue>;
  /** pinId -> net index. */
  pins: Record<string, number>;
  /** Pin kinds, so models can tell power/ground pins apart. */
  pinKinds: Record<string, string>;
  /** Alternate pin functions, e.g. { A4: ['i2c:SDA'] } — used to find bus pins. */
  pinSignals: Record<string, string[]>;
  /** Model parameters from the definition. */
  params: Record<string, unknown>;
  mcu?: McuDefinition;
  firmware?: string;
}

export interface ProbeSetup {
  id: string;
  net: number;
  kind: 'digital' | 'analog';
}

export interface SimSetup {
  netCount: number;
  netNames: string[];
  /** Nets containing a ground pin, used as solver references. */
  groundNets: number[];
  /** Number of component pins attached to each net. */
  netPinCount: number[];
  components: SimComponentSetup[];
  probes: ProbeSetup[];
}

export interface SimSettings {
  /** 1 = real time. */
  speed: number;
  /** false = run as fast as possible. */
  realtime: boolean;
}

export type StepKind = 'instruction' | '1ms' | '10ms' | '100ms';

/** UI -> worker. */
export type SimCommand =
  | { type: 'setup'; setup: SimSetup; settings: SimSettings }
  | { type: 'update-circuit'; setup: SimSetup }
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'stop' }
  | { type: 'reset' }
  | { type: 'step'; kind: StepKind }
  | { type: 'settings'; settings: SimSettings }
  | { type: 'input'; componentId: string; key: string; value: PropValue }
  | { type: 'set-prop'; componentId: string; key: string; value: PropValue }
  | { type: 'serial-write'; componentId: string; data: number[] }
  | { type: 'probes'; probes: ProbeSetup[] };

export interface ProbeCapture {
  id: string;
  /** Interleaved [t0, v0, t1, v1, ...]; t in seconds of simulation time. */
  samples: number[];
}

export interface McuStatus {
  componentId: string;
  cycles: number;
  pc: number;
  /** pinId -> drive state ('low' | 'high' | 'input' | 'input-pullup'). */
  pins: Record<string, string>;
  serialBaud: number;
}

export type SimRunState = 'stopped' | 'running' | 'paused';

/** Worker -> UI. */
export type SimEvent =
  | {
      type: 'frame';
      state: SimRunState;
      simTime: number;
      /** Achieved simulation speed relative to real time over the last frame. */
      speed: number;
      visuals: Record<string, Record<string, unknown>>;
      voltages: number[];
      /** For every net: has a defined potential (connected to a source). */
      driven: boolean[];
      mcus: McuStatus[];
      serial: { componentId: string; data: number[] }[];
      probes: ProbeCapture[];
      solves: number;
    }
  | { type: 'diagnostics'; diagnostics: Diagnostic[] }
  | { type: 'state'; state: SimRunState }
  | { type: 'error'; message: string };
