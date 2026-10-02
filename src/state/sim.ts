/**
 * Simulation store + client. Owns the simulation Web Worker, the firmware
 * build state, and forwards circuit edits to a running simulation.
 */
import { create } from 'zustand';
import type { Diagnostic } from '../core/circuit/diagnostics';
import type { ComponentInstance, PropValue } from '../core/model/circuit';
import type { Project } from '../core/project/schema';
import { buildSimSetup, type ProbeRequest } from '../core/sim/setup';
import type { ScriptProgram } from '../core/sim/mcu/mcu';
import { DEFAULT_MAIN_PY, MAIN_FILE, languageOf, sourcesFor, type FirmwareLanguage } from '../core/project/firmware';
import { TracebackReader, errorLocation, type PythonError } from '../core/toolchain/pythonTraceback';
import type { McuStatus, SimCommand, SimEvent, SimRunState, StepKind } from '../core/sim/types';
import { bytesToText } from '../core/instruments/decoders';
import { countLines, decodeSerialText, stampLines } from '../core/instruments/serialLog';
import { compileRequestFor, type CompileDiagnostic, type ToolchainStatus } from '../core/toolchain/types';
import { lookup } from '../app/registry';
import { t } from '../i18n';
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
  /** File contents of the last successful build (marks files edited since). */
  built: Record<string, string> | null;
}

export const EMPTY_COMPILE: CompileState = {
  status: 'idle',
  log: '',
  diagnostics: [],
  hex: {},
  hash: null,
  flashBytes: null,
  ramBytes: null,
  durationMs: null,
  built: null,
};

interface SimState {
  state: SimRunState;
  simTime: number;
  speed: number;
  voltages: number[];
  driven: boolean[];
  mcus: McuStatus[];
  diagnostics: Diagnostic[];
  serial: Record<string, string>;
  /** Simulation time at which each line of `serial` began (for timestamps). */
  serialStamps: Record<string, number[]>;
  compile: CompileState;
  /** MicroPython boards: the files copied to the board when it last started (null when stopped). */
  uploaded: { hash: string; files: Record<string, string> } | null;
  /** Errors the running Python program stopped with (from its tracebacks). */
  scriptErrors: CompileDiagnostic[];
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
  serialStamps: {},
  compile: EMPTY_COMPILE,
  uploaded: null,
  scriptErrors: [],
  toolchain: null,
  starting: false,
  set: (p) => set(p),
}));

// ---------------------------------------------------------------- worker
let worker: Worker | null = null;
let lastStoreUpdate = 0;
const serialDecoder = new Map<string, string>(); // partial line per board (plotter)
const tracebacks = new Map<string, TracebackReader>(); // MicroPython boards

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../core/sim/worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<SimEvent>) => handleEvent(e.data);
    worker.onerror = (e) => useEditor.getState().notify(t('Simulation worker error: {error}', { error: e.message }), 'error');
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
      let serialStamps = sim.serialStamps;
      if (ev.serial.length) {
        serial = { ...serial };
        serialStamps = { ...serialStamps };
        for (const s of ev.serial) {
          const text = bytesToText(s.data);
          const prev = serial[s.componentId] ?? '';
          const stamps = serialStamps[s.componentId]?.slice() ?? [];
          stampLines(prev, text, stamps, ev.simTime);
          let t = prev + text;
          if (t.length > SERIAL_CAP) {
            const cut = t.length - SERIAL_CAP * 0.8;
            stamps.splice(0, countLines(t.slice(0, cut)));
            t = t.slice(cut);
          }
          serial[s.componentId] = t;
          serialStamps[s.componentId] = stamps;
          // Feed complete lines to the serial plotter.
          const pending = (serialDecoder.get(s.componentId) ?? '') + text;
          const lines = pending.split(/\r?\n/);
          serialDecoder.set(s.componentId, lines.pop() ?? '');
          for (const line of lines) {
            captures.pushPlotterLine(line);
            const err = tracebacks.get(s.componentId)?.line(line);
            if (err) reportScriptError(err);
          }
        }
      }
      const now = performance.now();
      if (now - lastStoreUpdate > 90 || ev.state !== 'running' || serial !== sim.serial) {
        lastStoreUpdate = now;
        useSim.setState({ simTime: ev.simTime, speed: ev.speed, voltages: ev.voltages, driven: ev.driven, mcus: ev.mcus, serial, serialStamps });
      }
      break;
    }
    case 'diagnostics':
      useSim.setState({ diagnostics: ev.diagnostics });
      break;
    case 'state':
      useSim.setState({ state: ev.state, ...(ev.state === 'stopped' ? { speed: 0, voltages: [], driven: [], mcus: [], uploaded: null } : {}) });
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

export function sourceHash(project: Project, board: ComponentInstance | undefined): string {
  const def = board && lookup(board.type);
  return JSON.stringify([def?.mcu?.toolchain, sourcesFor(languageOf(def?.mcu), project.firmware.files)]);
}

/** Language of the code the project's target board runs (Arduino without a board). */
export function targetLanguage(project: Project): FirmwareLanguage {
  const board = findTargetBoard(project);
  return languageOf(board && lookup(board.type)?.mcu);
}

export const useTargetLanguage = () => useProject((s) => targetLanguage(s.project));

/**
 * Firmware build state shown in the status bar: `none` without a
 * programmable board, `modified` when the sources (or the target board)
 * changed since the last successful build.
 */
export type BuildState = 'none' | 'unbuilt' | 'compiling' | 'built' | 'modified' | 'failed';

export function buildStateOf(project: Project, compile: CompileState, uploaded: SimState['uploaded'] = null): BuildState {
  const board = findTargetBoard(project);
  const def = board && lookup(board.type);
  if (!board || !def?.mcu || def.simulation.support === 'visual-only') return 'none';
  // MicroPython runs the files as they are: the only state is whether the running board has the latest ones.
  if (def.mcu.runtime) return !uploaded ? 'none' : uploaded.hash === sourceHash(project, board) ? 'built' : 'modified';
  if (compile.status === 'compiling') return 'compiling';
  if (compile.status === 'error') return 'failed';
  if (!compile.hex[board.id] || !compile.built) return 'unbuilt';
  return compile.hash === sourceHash(project, board) ? 'built' : 'modified';
}

export function useBuildState(): BuildState {
  const compile = useSim((s) => s.compile);
  const uploaded = useSim((s) => s.uploaded);
  return useProject((s) => buildStateOf(s.project, compile, uploaded));
}

function probeRequests(project: Project): ProbeRequest[] {
  return [
    ...project.instruments.logic.map((c) => ({ id: `logic:${c.id}`, target: c.target, kind: 'digital' as const })),
    ...project.instruments.scope.map((c) => ({ id: `scope:${c.id}`, target: c.target, kind: 'analog' as const })),
  ];
}

// ------------------------------------------------- interpreter boards
/** Interpreter images (MicroPython UF2) by path, fetched once from the application's files. */
const runtimeImages = new Map<string, Uint8Array>();
const runtimeLoads = new Map<string, Promise<Uint8Array>>();

function loadRuntime(path: string): Promise<Uint8Array> {
  const have = runtimeImages.get(path);
  if (have) return Promise.resolve(have);
  let load = runtimeLoads.get(path);
  if (!load) {
    load = (async () => {
      const res = await fetch(new URL(path, document.baseURI));
      if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      runtimeImages.set(path, bytes);
      return bytes;
    })();
    runtimeLoads.set(path, load);
    load.catch(() => runtimeLoads.delete(path));
  }
  return load;
}

/** The Python program for the target board: the interpreter image and the project's .py files. */
function scriptPrograms(project: Project): Record<string, ScriptProgram> {
  const board = findTargetBoard(project);
  const runtime = board && lookup(board.type)?.mcu?.runtime;
  const image = runtime && runtimeImages.get(runtime.image);
  if (!board || !runtime || !image) return {};
  const files = sourcesFor('micropython', project.firmware.files).map((f) => ({ name: f.name, content: f.content }));
  return { [board.id]: { kind: runtime.kind, image, files } };
}

/** A Pico project needs main.py: create one (a blink starter) when it is missing. */
function ensureMainPy(): boolean {
  const { project } = useProject.getState();
  if (project.firmware.files.some((f) => f.name === MAIN_FILE.micropython)) return false;
  useProject.getState().updateProject((p) => {
    p.firmware.files.unshift({ name: MAIN_FILE.micropython, content: DEFAULT_MAIN_PY });
  });
  useEditor.getState().notify(t('Created main.py — the Pico runs it when it starts. Edit it in the Code panel.'), 'info');
  return true;
}

/** Remembers which files the board got, and starts reading its tracebacks afresh. */
function markUploaded(project: Project, board: ComponentInstance) {
  const files = Object.fromEntries(sourcesFor('micropython', project.firmware.files).map((f) => [f.name, f.content]));
  useSim.setState({ uploaded: { hash: sourceHash(project, board), files }, scriptErrors: [] });
  tracebacks.set(board.id, new TracebackReader());
}

/** A traceback ended the Python program: show it in Problems and at its line in the editor. */
function reportScriptError(err: PythonError) {
  const { project } = useProject.getState();
  const at = errorLocation(err, project.firmware.files.map((f) => f.name));
  const message = decodeSerialText(err.message);
  const diag: CompileDiagnostic = { file: at.file, line: at.line, column: 1, severity: 'error', message };
  useSim.setState({ scriptErrors: [...useSim.getState().scriptErrors, diag] });
  // Isolated so the file name and the (English) Python message keep their order in Arabic.
  useEditor.getState().notify(t('{file} line {line}: {error}', { file: `\u2066${at.file}\u2069`, line: at.line, error: `\u2066${message}\u2069` }), 'error');
}

function currentSetup() {
  const { project } = useProject.getState();
  const netlist = getNetlist(project.circuit);
  return buildSimSetup(project.circuit, lookup, netlist, useSim.getState().compile.hex, probeRequests(project), scriptPrograms(project));
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
    editor.notify(t('Add a programmable board (e.g. Arduino Uno) to compile firmware.'), 'warning');
    return false;
  }
  const def = lookup(board.type)!;
  if (def.simulation.support === 'visual-only' || !def.mcu) {
    editor.notify(t('{part} cannot be simulated yet ({reason}).', { part: def.name, reason: def.simulation.notes ?? t('visual-only') }), 'warning');
    return false;
  }
  if (def.mcu.runtime) return uploadScripts();
  const sim = useSim.getState();
  useSim.setState({ compile: { ...sim.compile, status: 'compiling', log: `${t('Compiling for {board} ({target})…', { board: def.name, target: def.mcu.toolchain.board })}\n` } });
  try {
    const res = await toolchain.compile(compileRequestFor(def.mcu, sourcesFor('arduino', project.firmware.files)));
    const hex = res.success && res.hex ? { ...useSim.getState().compile.hex, [board.id]: res.hex } : useSim.getState().compile.hex;
    useSim.setState({
      compile: {
        status: res.success ? 'success' : 'error',
        log: res.log,
        diagnostics: res.diagnostics,
        hex,
        hash: res.success ? sourceHash(project, board) : null,
        built: res.success ? Object.fromEntries(sourcesFor('arduino', project.firmware.files).map((f) => [f.name, f.content])) : useSim.getState().compile.built,
        flashBytes: res.flashBytes,
        ramBytes: res.ramBytes,
        durationMs: res.durationMs,
      },
    });
    if (res.success && useSim.getState().state !== 'stopped') {
      // Running: flash the new build into the board; the rest of the circuit keeps its state.
      reflash(board.id, board.label);
    } else if (res.success) {
      editor.notify(
        t('Compiled in {seconds} s — flash {flash} B, RAM {ram} B', { seconds: (res.durationMs / 1000).toFixed(1), flash: res.flashBytes ?? '?', ram: res.ramBytes ?? '?' }),
        'success',
      );
    } else {
      const n = res.diagnostics.filter((d) => d.severity === 'error').length;
      editor.notify(n ? t('Compilation failed ({n} errors). See Problems.', { n }) : t('Compilation failed. See Problems.'), 'error');
      editor.set({ dockTab: 'problems', showDock: true });
    }
    return res.success;
  } catch (e) {
    const message = (e as Error).message ?? String(e);
    useSim.setState({ compile: { ...useSim.getState().compile, status: 'error', log: message, diagnostics: [] } });
    editor.notify(t('Toolchain error: {error}', { error: message }), 'error');
    const status = await refreshToolchain();
    if (!status?.installed) editor.set({ dialog: 'toolchain' });
    return false;
  }
}

/** Appends a marker line (not firmware output) to a board's serial monitor. */
function serialNote(boardId: string, note: string) {
  const { serial, serialStamps, simTime } = useSim.getState();
  const text = serial[boardId] ?? '';
  // Serial text holds one character per byte (the monitor decodes UTF-8), so the note is stored as its UTF-8 bytes.
  const line = String.fromCharCode(...new TextEncoder().encode(`${text && !text.endsWith('\n') ? '\n' : ''}── ${note} ──\n`));
  const stamps = serialStamps[boardId]?.slice() ?? [];
  stampLines(text, line, stamps, simTime);
  useSim.setState({ serial: { ...serial, [boardId]: text + line }, serialStamps: { ...serialStamps, [boardId]: stamps } });
}

/** Hot-swaps the firmware of a running simulation: the board restarts with the new build. */
function reflash(boardId: string, label: string) {
  send({ type: 'update-circuit', setup: currentSetup(), restart: [boardId] });
  serialNote(boardId, t('firmware updated, {board} restarted', { board: label }));
  useEditor.getState().notify(t('New firmware flashed — {board} restarted', { board: label }), 'success');
}

/**
 * MicroPython boards have nothing to compile: "Compile" copies the .py files
 * to the running board and restarts it, or starts the simulation.
 */
async function uploadScripts(): Promise<boolean> {
  if (useSim.getState().state === 'stopped') {
    await startSimulation();
    return true;
  }
  ensureMainPy();
  const { project } = useProject.getState();
  const board = findTargetBoard(project)!;
  try {
    await loadRuntime(lookup(board.type)!.mcu!.runtime!.image);
  } catch (e) {
    useEditor.getState().notify(t('Could not load MicroPython: {error}', { error: (e as Error).message }), 'error');
    return false;
  }
  markUploaded(project, board);
  send({ type: 'update-circuit', setup: currentSetup(), restart: [board.id] });
  serialNote(board.id, t('files copied, {board} restarted', { board: board.label }));
  useEditor.getState().notify(t('Code copied to {board} — it restarted', { board: board.label }), 'success');
  return true;
}

export async function startSimulation() {
  const sim = useSim.getState();
  if (sim.state === 'paused') return resumeSimulation();
  if (sim.state === 'running' || sim.starting) return;
  useSim.setState({ starting: true });
  try {
    let { project } = useProject.getState();
    const board = findTargetBoard(project);
    const def = board && lookup(board.type);
    if (board && def?.mcu?.runtime) {
      // MicroPython: no build; the interpreter starts and gets the .py files.
      if (ensureMainPy()) project = useProject.getState().project;
      try {
        await loadRuntime(def.mcu.runtime.image);
      } catch (e) {
        useEditor.getState().notify(t('Could not load MicroPython: {error}', { error: (e as Error).message }), 'error');
        return;
      }
      markUploaded(project, board);
    } else if (board && def?.mcu && def.simulation.support !== 'visual-only') {
      const c = useSim.getState().compile;
      if (c.hash !== sourceHash(project, board) || !c.hex[board.id]) {
        const ok = await compileFirmware();
        if (!ok) return;
      }
    }
    captures.clearProbes();
    captures.clearPlotter();
    serialDecoder.clear();
    if (useEditor.getState().serialClearOnRun) useSim.setState({ serial: {}, serialStamps: {} });
    useSim.setState({ diagnostics: [], simTime: 0 });
    for (const id of Object.keys(useSim.getState().serial)) serialNote(id, t('simulation started'));
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
  useSim.setState({ serial: {}, serialStamps: {} });
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
