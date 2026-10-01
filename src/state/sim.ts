/**
 * Simulation store + client. Owns the simulation Web Worker, the firmware
 * build state, and forwards circuit edits to a running simulation.
 */
import { create } from 'zustand';
import type { Diagnostic } from '../core/circuit/diagnostics';
import type { ComponentInstance, PropValue } from '../core/model/circuit';
import type { Project } from '../core/project/schema';
import { buildSimSetup, type ProbeRequest } from '../core/sim/setup';
import type { McuStatus, SimCommand, SimEvent, SimRunState, StepKind } from '../core/sim/types';
import { bytesToText } from '../core/instruments/decoders';
import { compileRequestFor, type CompileDiagnostic, type ToolchainStatus } from '../core/toolchain/types';
import { lookup } from '../app/registry';
import { toolchain } from '../platform';
import { captures } from './captures';
import { getNetlist } from './derived';
import { useEditor } from './editor';
import { useProject } from './project';
import { visualBus } from './visualBus';

const SERIAL_CAP = 200_000;

export interface CompileState {
  status: 'idle' | 'compiling' | 'success' | 'error';
  log: string;
  diagnostics: CompileDiagnostic[];
  hex: Record<string, string>;
  hash: string | null;
  flashBytes: number | null;
  ramBytes: number | null;
  durationMs: number | null;
}

interface SimState {
  state: SimRunState;
  simTime: number;
  speed: number;
  voltages: number[];
  driven: boolean[];
  mcus: McuStatus[];
  diagnostics: Diagnostic[];
  serial: Record<string, string>;
  compile: CompileState;
  toolchain: ToolchainStatus | null;
  starting: boolean;
  set(p: Partial<SimState>): void;
}

export const useSim = create<SimState>((set) => ({
  state: 'stopped',
  simTime: 0,
  speed: 0,
  voltages: [],
  driven: [],
  mcus: [],
  diagnostics: [],
  serial: {},
  compile: { status: 'idle', log: '', diagnostics: [], hex: {}, hash: null, flashBytes: null, ramBytes: null, durationMs: null },
  toolchain: null,
  starting: false,
  set: (p) => set(p),
}));

// ---------------------------------------------------------------- worker
let worker: Worker | null = null;
let lastStoreUpdate = 0;
const serialDecoder = new Map<string, string>(); // partial line per board (plotter)

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../core/sim/worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<SimEvent>) => handleEvent(e.data);
    worker.onerror = (e) => useEditor.getState().notify(`Simulation worker error: ${e.message}`, 'error');
  }
  return worker;
}

const send = (cmd: SimCommand) => getWorker().postMessage(cmd);

function handleEvent(ev: SimEvent) {
  const sim = useSim.getState();
  switch (ev.type) {
    case 'frame': {
      visualBus.apply(ev.visuals);
      captures.simTime = ev.simTime;
      for (const p of ev.probes) captures.appendProbe(p.id, p.samples);
      let serial = sim.serial;
      if (ev.serial.length) {
        serial = { ...serial };
        for (const s of ev.serial) {
          const text = bytesToText(s.data);
          let t = (serial[s.componentId] ?? '') + text;
          if (t.length > SERIAL_CAP) t = t.slice(t.length - SERIAL_CAP * 0.8);
          serial[s.componentId] = t;
          // Feed complete lines to the serial plotter.
          const pending = (serialDecoder.get(s.componentId) ?? '') + text;
          const lines = pending.split(/\r?\n/);
          serialDecoder.set(s.componentId, lines.pop() ?? '');
          for (const line of lines) captures.pushPlotterLine(line);
        }
      }
      const now = performance.now();
      if (now - lastStoreUpdate > 90 || ev.state !== 'running' || serial !== sim.serial) {
        lastStoreUpdate = now;
        useSim.setState({ simTime: ev.simTime, speed: ev.speed, voltages: ev.voltages, driven: ev.driven, mcus: ev.mcus, serial });
      }
      break;
    }
    case 'diagnostics':
      useSim.setState({ diagnostics: ev.diagnostics });
      break;
    case 'state':
      useSim.setState({ state: ev.state, ...(ev.state === 'stopped' ? { speed: 0, voltages: [], driven: [], mcus: [] } : {}) });
      if (ev.state === 'stopped') visualBus.reset();
      break;
    case 'error':
      useEditor.getState().notify(ev.message, 'error');
      break;
  }
}

// ---------------------------------------------------------------- helpers
export function findTargetBoard(project: Project): ComponentInstance | undefined {
  const boards = project.circuit.components.filter((c) => lookup(c.type)?.mcu);
  return boards.find((b) => b.id === project.firmware.target) ?? boards[0];
}

function sourceHash(project: Project, board: ComponentInstance | undefined): string {
  const def = board && lookup(board.type);
  return JSON.stringify([def?.mcu?.toolchain, project.firmware.files]);
}

function probeRequests(project: Project): ProbeRequest[] {
  return [
    ...project.instruments.logic.map((c) => ({ id: `logic:${c.id}`, target: c.target, kind: 'digital' as const })),
    ...project.instruments.scope.map((c) => ({ id: `scope:${c.id}`, target: c.target, kind: 'analog' as const })),
  ];
}

function currentSetup() {
  const { project } = useProject.getState();
  const netlist = getNetlist(project.circuit);
  return buildSimSetup(project.circuit, lookup, netlist, useSim.getState().compile.hex, probeRequests(project));
}

// ----------------------------------------------------------------- actions
export async function refreshToolchain(): Promise<ToolchainStatus | null> {
  try {
    const status = await toolchain.status();
    useSim.setState({ toolchain: status });
    return status;
  } catch {
    useSim.setState({ toolchain: null });
    return null;
  }
}

export async function compileFirmware(): Promise<boolean> {
  const { project } = useProject.getState();
  const editor = useEditor.getState();
  const board = findTargetBoard(project);
  if (!board) {
    editor.notify('Add a programmable board (e.g. Arduino Uno) to compile firmware.', 'warning');
    return false;
  }
  const def = lookup(board.type)!;
  if (def.simulation.support === 'visual-only' || !def.mcu) {
    editor.notify(`${def.name} cannot be simulated yet (${def.simulation.notes ?? 'visual-only'}).`, 'warning');
    return false;
  }
  const sim = useSim.getState();
  useSim.setState({ compile: { ...sim.compile, status: 'compiling', log: `Compiling for ${def.name} (${def.mcu.toolchain.board})…\n` } });
  try {
    const res = await toolchain.compile(compileRequestFor(def.mcu, project.firmware.files));
    const hex = res.success && res.hex ? { ...useSim.getState().compile.hex, [board.id]: res.hex } : useSim.getState().compile.hex;
    useSim.setState({
      compile: {
        status: res.success ? 'success' : 'error',
        log: res.log,
        diagnostics: res.diagnostics,
        hex,
        hash: res.success ? sourceHash(project, board) : null,
        flashBytes: res.flashBytes,
        ramBytes: res.ramBytes,
        durationMs: res.durationMs,
      },
    });
    if (res.success) {
      editor.notify(
        `Compiled in ${(res.durationMs / 1000).toFixed(1)} s — flash ${res.flashBytes ?? '?'} B, RAM ${res.ramBytes ?? '?'} B`,
        'success',
      );
    } else {
      const n = res.diagnostics.filter((d) => d.severity === 'error').length;
      editor.notify(`Compilation failed with ${n || 'unknown'} error${n === 1 ? '' : 's'}. See Problems.`, 'error');
      editor.set({ dockTab: 'problems', showDock: true });
    }
    return res.success;
  } catch (e) {
    const message = (e as Error).message ?? String(e);
    useSim.setState({ compile: { ...useSim.getState().compile, status: 'error', log: message, diagnostics: [] } });
    editor.notify(`Toolchain error: ${message}`, 'error');
    const status = await refreshToolchain();
    if (!status?.installed) editor.set({ dialog: 'toolchain' });
    return false;
  }
}

export async function startSimulation() {
  const sim = useSim.getState();
  if (sim.state === 'paused') return resumeSimulation();
  if (sim.state === 'running' || sim.starting) return;
  useSim.setState({ starting: true });
  try {
    const { project } = useProject.getState();
    const board = findTargetBoard(project);
    const def = board && lookup(board.type);
    if (board && def?.mcu && def.simulation.support !== 'visual-only') {
      const c = useSim.getState().compile;
      if (c.hash !== sourceHash(project, board) || !c.hex[board.id]) {
        const ok = await compileFirmware();
        if (!ok) return;
      }
    }
    captures.clearProbes();
    captures.clearPlotter();
    serialDecoder.clear();
    useSim.setState({ serial: {}, diagnostics: [], simTime: 0 });
    send({ type: 'setup', setup: currentSetup(), settings: project.simulation });
    send({ type: 'start' });
  } finally {
    useSim.setState({ starting: false });
  }
}

export const pauseSimulation = () => send({ type: 'pause' });
export const resumeSimulation = () => send({ type: 'resume' });
export const stopSimulation = () => send({ type: 'stop' });
export const resetSimulation = () => send({ type: 'reset' });

export function stepSimulation(kind: StepKind) {
  if (useSim.getState().state === 'stopped') {
    // Start paused, then step.
    void startSimulation().then(() => {
      send({ type: 'pause' });
      send({ type: 'step', kind });
    });
    return;
  }
  send({ type: 'step', kind });
}

export function setSimulationSettings(speed: number, realtime: boolean) {
  useProject.getState().updateProject((p) => {
    p.simulation = { speed, realtime };
  });
  if (worker) send({ type: 'settings', settings: { speed, realtime } });
}

export function sendInput(componentId: string, key: string, value: PropValue) {
  if (useSim.getState().state !== 'stopped') send({ type: 'input', componentId, key, value });
}

export function sendSerial(text: string) {
  const board = findTargetBoard(useProject.getState().project);
  if (!board || useSim.getState().state === 'stopped') return;
  send({ type: 'serial-write', componentId: board.id, data: Array.from(new TextEncoder().encode(text)) });
}

export function clearSerial() {
  useSim.setState({ serial: {} });
  captures.clearPlotter();
}

// ------------------------------------------- live edits while simulating
let pending: ReturnType<typeof setTimeout> | null = null;
let lastCircuit = useProject.getState().project.circuit;
let lastInstruments = useProject.getState().project.instruments;

useProject.subscribe((s) => {
  const circuit = s.project.circuit;
  const instruments = s.project.instruments;
  if (useSim.getState().state === 'stopped') {
    lastCircuit = circuit;
    lastInstruments = instruments;
    return;
  }
  if (circuit !== lastCircuit) {
    // Live property changes go straight to the models.
    const prevById = new Map(lastCircuit.components.map((c) => [c.id, c]));
    let structural = circuit.components.length !== lastCircuit.components.length || circuit.wires !== lastCircuit.wires;
    for (const c of circuit.components) {
      const prev = prevById.get(c.id);
      if (!prev) {
        structural = true;
        continue;
      }
      if (prev.x !== c.x || prev.y !== c.y || prev.rotation !== c.rotation || prev.flip !== c.flip) structural = true;
      if (prev.props !== c.props) {
        for (const [k, v] of Object.entries(c.props)) if (prev.props[k] !== v) send({ type: 'set-prop', componentId: c.id, key: k, value: v });
      }
    }
    lastCircuit = circuit;
    if (structural) {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        pending = null;
        if (useSim.getState().state !== 'stopped') send({ type: 'update-circuit', setup: currentSetup() });
      }, 120);
    }
  }
  if (instruments !== lastInstruments) {
    lastInstruments = instruments;
    send({ type: 'probes', probes: currentSetup().probes });
  }
});
