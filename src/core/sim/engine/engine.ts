/**
 * SimulationEngine — runs inside a Web Worker (or headless in tests).
 *
 * Co-simulation strategy:
 *  - The first MCU's cycle counter is the master clock (virtual clock if no MCU).
 *  - MCUs run in slices. Their GPIO listeners request a solve *at the exact
 *    cycle* a pin changes; only islands containing changed nets are re-solved.
 *  - Before every solve, models integrate the previous solution over the
 *    elapsed time, giving exact PWM averages (LED brightness, pin currents).
 *  - Frames (~30 Hz) deliver visual state, voltages, probes, serial data.
 */
import type { PropValue } from '../../model/circuit';
import type { Diagnostic } from '../../circuit/diagnostics';
import { StampCollector, solve, type SolveResult } from '../analog/solver';
import type { McuEmulator } from '../mcu/mcu';
import { getModelFactory, type ModelContext, type SimModel } from '../model';
import type {
  McuStatus,
  ProbeSetup,
  SimComponentSetup,
  SimEvent,
  SimRunState,
  SimSettings,
  SimSetup,
  StepKind,
} from '../types';

interface TimedEvent {
  t: number;
  seq: number;
  cb: () => void;
}

const FRAME_INTERVAL_MS = 33;
const MAX_SLICE_WALL_S = 0.05;

export class SimulationEngine {
  state: SimRunState = 'stopped';
  private setup: SimSetup;
  private settings: SimSettings;
  private models = new Map<string, SimModel>();
  private contexts = new Map<string, { setup: SimComponentSetup }>();
  /**
   * Programmable parts. `offset` is the simulation time at which the MCU's
   * cycle counter was 0, so MCUs added (or reset) mid-run share one time base.
   */
  private mcus: { id: string; mcu: McuEmulator; offset: number }[] = [];
  private stamps = new StampCollector();
  private solution: SolveResult | null = null;
  private dirty = new Set<number>();
  private solving = false;
  private resolveRequested = false;
  private lastSolveTime = 0;
  private virtualTime = 0;
  private events: TimedEvent[] = [];
  /** End of the slice the MCUs are currently executing (simulation seconds). */
  private segEnd = Infinity;
  private eventSeq = 0;
  private serialBuf = new Map<string, number[]>();
  private probes: ProbeSetup[] = [];
  private probeBuf = new Map<string, number[]>();
  private probeLast = new Map<string, number>();
  private lastDiagKey = '';
  private lastFrameWall = 0;
  private lastFrameSim = 0;
  private solveCount = 0;
  private loopTimer: ReturnType<typeof setTimeout> | null = null;
  private lastLoopWall = 0;
  private achievedSpeed = 0;
  private engineDiagnostics: Diagnostic[] = [];

  constructor(
    setup: SimSetup,
    settings: SimSettings,
    private post: (ev: SimEvent) => void,
    private clock: () => number = () => performance.now(),
  ) {
    this.setup = setup;
    this.settings = settings;
    this.probes = setup.probes;
  }

  // ---------------------------------------------------------------- time
  /** Simulation time: the first MCU's clock is the master; a virtual clock otherwise. Never decreases. */
  now(): number {
    if (this.mcus.length) {
      const { mcu, offset } = this.mcus[0];
      return offset + mcu.cycles / mcu.clockHz;
    }
    return this.virtualTime;
  }

  private cyclesAt(entry: { mcu: McuEmulator; offset: number }, t: number) {
    return Math.ceil((t - entry.offset) * entry.mcu.clockHz);
  }

  // ------------------------------------------------------------ lifecycle
  private buildModels() {
    this.engineDiagnostics = [];
    for (const comp of this.setup.components) this.createModel(comp);
    this.refreshMcuList(0);
  }

  private createModel(comp: SimComponentSetup) {
    const factory = getModelFactory(comp.model);
    if (!factory) {
      this.engineDiagnostics.push({
        code: 'model-missing',
        severity: 'warning',
        message: `${comp.label}: simulation model "${comp.model}" is not available; the part is treated as disconnected.`,
        componentIds: [comp.id],
        source: 'simulation',
      });
      return;
    }
    const holder = { setup: comp };
    this.contexts.set(comp.id, holder);
    const ctx = this.makeContext(holder);
    try {
      this.models.set(comp.id, factory(ctx));
    } catch (e) {
      this.engineDiagnostics.push({
        code: 'model-error',
        severity: 'error',
        message: `${comp.label}: ${(e as Error).message}`,
        componentIds: [comp.id],
        source: 'simulation',
      });
    }
  }

  /**
   * Rebuilds the MCU list after models changed, at simulation time `t`. MCUs
   * that already ran keep their offset; new ones start their clock at `t`.
   * Without an MCU the virtual clock continues from `t`.
   */
  private refreshMcuList(t: number) {
    const previous = new Map(this.mcus.map((e) => [e.mcu, e.offset]));
    this.mcus = [];
    for (const [id, m] of this.models) {
      if (!m.mcu) continue;
      this.mcus.push({ id, mcu: m.mcu, offset: previous.get(m.mcu) ?? t - m.mcu.cycles / m.mcu.clockHz });
    }
    // A different MCU may now be the master clock; lock-stepped MCUs can lag by an
    // instruction, so align it to never step back.
    const master = this.mcus[0];
    if (master) master.offset += Math.max(0, t - this.now());
    this.virtualTime = t;
  }

  private makeContext(holder: { setup: SimComponentSetup }): ModelContext {
    const engine = this;
    return {
      get setup() {
        return holder.setup;
      },
      net: (pinId) => holder.setup.pins[pinId] ?? -1,
      now: () => engine.now(),
      invalidate: (nets) => {
        if (nets) for (const n of nets) engine.dirty.add(n);
        else engine.dirty.add(-1);
      },
      solveNow: (nets) => {
        if (nets) for (const n of nets) engine.dirty.add(n);
        else engine.dirty.add(-1);
        engine.solveNow();
      },
      schedule: (seconds, cb) => engine.schedule(seconds, cb),
      serialOut: (bytes) => {
        const id = holder.setup.id;
        if (!engine.serialBuf.has(id)) engine.serialBuf.set(id, []);
        engine.serialBuf.get(id)!.push(...bytes);
      },
      models: () => engine.models.values(),
      netPinCount: (net) => engine.setup.netPinCount[net] ?? 0,
      isDriven: (net) => {
        const s = engine.solution;
        if (!s || net < 0) return false;
        const isl = s.island[net];
        return isl >= 0 && s.islandDriven[isl];
      },
    };
  }

  start() {
    if (this.state !== 'stopped') return;
    this.disposeModels();
    this.virtualTime = 0;
    this.lastSolveTime = 0;
    this.events = [];
    this.solution = null;
    this.buildModels();
    this.dirty.add(-1);
    this.solveNow();
    this.setState('running');
    this.lastLoopWall = this.clock();
    this.lastFrameWall = this.lastLoopWall;
    this.lastFrameSim = 0;
    this.scheduleLoop();
    this.emitFrame();
  }

  pause() {
    if (this.state !== 'running') return;
    this.setState('paused');
    this.emitFrame();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.setState('running');
    this.lastLoopWall = this.clock();
    this.scheduleLoop();
  }

  stop() {
    if (this.state === 'stopped') return;
    this.disposeModels();
    this.setState('stopped');
  }

  /** Power-cycle: MCUs restart from address 0, models return to initial state. */
  reset() {
    if (this.state === 'stopped') return;
    // Keep the time base monotonic across MCU resets.
    const t = this.now();
    for (const m of this.models.values()) m.reset?.();
    for (const e of this.mcus) e.offset = t - e.mcu.cycles / e.mcu.clockHz;
    this.dirty.add(-1);
    this.solveNow();
    this.emitFrame();
  }

  step(kind: StepKind) {
    if (this.state === 'stopped') {
      this.start();
      this.pause();
    }
    if (this.state !== 'paused') return;
    if (kind === 'instruction') {
      if (this.mcus.length) this.mcus[0].mcu.step();
    } else {
      const dt = kind === '1ms' ? 1e-3 : kind === '10ms' ? 1e-2 : 0.1;
      this.advance(this.now() + dt);
    }
    this.emitFrame();
  }

  updateSettings(s: SimSettings) {
    this.settings = s;
  }

  /** Re-wires the running circuit, preserving model state (incl. MCU state). */
  updateCircuit(setup: SimSetup) {
    const oldSetup = this.setup;
    this.setup = setup;
    this.probes = setup.probes;
    if (this.state === 'stopped') return;
    // Capture the time before the MCU list (and with it the master clock) changes.
    const t = this.now();
    const nextIds = new Set(setup.components.map((c) => c.id));
    for (const [id, model] of this.models) {
      if (!nextIds.has(id)) {
        model.dispose?.();
        this.models.delete(id);
        this.contexts.delete(id);
      }
    }
    for (const comp of setup.components) {
      const holder = this.contexts.get(comp.id);
      const old = oldSetup.components.find((c) => c.id === comp.id);
      if (holder && old && old.model === comp.model && old.type === comp.type && old.firmware === comp.firmware) {
        holder.setup = comp;
      } else {
        this.models.get(comp.id)?.dispose?.();
        this.models.delete(comp.id);
        this.createModel(comp);
      }
    }
    this.refreshMcuList(t);
    this.solution = null;
    this.dirty.add(-1);
    this.solveNow();
    this.emitFrame();
  }

  setProbes(probes: ProbeSetup[]) {
    this.probes = probes;
    this.setup = { ...this.setup, probes };
    this.probeLast.clear();
  }

  input(componentId: string, key: string, value: PropValue) {
    this.models.get(componentId)?.onInput?.(key, value);
    if (this.state === 'paused') this.emitFrame();
  }

  setProp(componentId: string, key: string, value: PropValue) {
    const holder = this.contexts.get(componentId);
    if (holder) holder.setup = { ...holder.setup, props: { ...holder.setup.props, [key]: value } };
    const m = this.models.get(componentId);
    if (m?.setProp) m.setProp(key, value);
    else {
      this.dirty.add(-1);
      this.solveNow();
    }
    if (this.state === 'paused') this.emitFrame();
  }

  serialWrite(componentId: string, data: number[]) {
    for (const b of data) this.models.get(componentId)?.onInput?.('serial', b);
  }

  private disposeModels() {
    for (const m of this.models.values()) m.dispose?.();
    this.models.clear();
    this.contexts.clear();
    this.mcus = [];
    if (this.loopTimer) clearTimeout(this.loopTimer);
    this.loopTimer = null;
  }

  private setState(s: SimRunState) {
    this.state = s;
    this.post({ type: 'state', state: s });
  }

  // -------------------------------------------------------------- events
  schedule(seconds: number, cb: () => void) {
    const ev = { t: this.now() + Math.max(0, seconds), seq: this.eventSeq++, cb };
    // insertion keeps the list sorted (event counts are small)
    let i = this.events.length;
    while (i > 0 && (this.events[i - 1].t > ev.t || (this.events[i - 1].t === ev.t && this.events[i - 1].seq > ev.seq))) i--;
    this.events.splice(i, 0, ev);
    // Scheduled from inside a running slice (e.g. a model reacting to a pin edge):
    // stop the MCUs at the event time so it fires exactly when due.
    if (ev.t < this.segEnd) {
      this.segEnd = ev.t;
      for (const e of this.mcus) e.mcu.limitTo(this.cyclesAt(e, ev.t));
    }
  }

  private fireDueEvents() {
    const t = this.now();
    while (this.events.length && this.events[0].t <= t + 1e-12) {
      const ev = this.events.shift()!;
      ev.cb();
    }
  }

  // ------------------------------------------------------------- solving
  solveNow() {
    if (this.solving) {
      this.resolveRequested = true;
      return;
    }
    this.solving = true;
    try {
      let guard = 0;
      do {
        this.resolveRequested = false;
        this.solveOnce();
      } while (this.resolveRequested && ++guard < 50);
      if (guard >= 50) {
        this.pushEngineDiag({
          code: 'oscillation',
          severity: 'warning',
          message: 'The circuit did not settle (digital feedback oscillation?). Results may be inaccurate.',
          source: 'simulation',
        });
      }
    } finally {
      this.solving = false;
    }
  }

  private solveOnce() {
    const t = this.now();
    this.integrate(t);
    this.stamps.clear();
    for (const m of this.models.values()) m.stamp(this.stamps);
    const full = this.dirty.has(-1) || !this.solution;
    const result = solve(
      this.setup.netCount,
      this.stamps,
      this.setup.groundNets,
      full ? undefined : this.solution!,
      full ? undefined : this.dirty,
    );
    this.dirty.clear();
    this.solution = result;
    this.solveCount++;
    if (!result.converged) {
      this.pushEngineDiag({
        code: 'no-convergence',
        severity: 'warning',
        message: 'The analog solver did not converge for the current circuit state.',
        source: 'simulation',
      });
    }
    for (const m of this.models.values()) m.afterSolve?.(result.voltages, result);
    this.recordProbes(t, result);
  }

  private integrate(t: number) {
    const dt = t - this.lastSolveTime;
    if (dt > 0 && this.solution) {
      for (const m of this.models.values()) m.integrate?.(dt, this.solution.voltages);
    }
    this.lastSolveTime = t;
  }

  private pushEngineDiag(d: Diagnostic) {
    if (!this.engineDiagnostics.some((x) => x.code === d.code)) this.engineDiagnostics.push(d);
  }

  private recordProbes(t: number, result: SolveResult) {
    for (const p of this.probes) {
      if (p.net < 0) continue;
      const isl = result.island[p.net];
      const driven = isl >= 0 && result.islandDriven[isl];
      const v = driven ? result.voltages[p.net] : NaN;
      const value = p.kind === 'digital' ? (driven ? (v > 2.0 ? 1 : 0) : 0.5) : v;
      const last = this.probeLast.get(p.id);
      const changed =
        last === undefined ||
        (p.kind === 'digital' ? last !== value : Number.isNaN(last) !== Number.isNaN(value) || Math.abs(last - value) > 1e-3);
      if (!changed) continue;
      this.probeLast.set(p.id, value);
      if (!this.probeBuf.has(p.id)) this.probeBuf.set(p.id, []);
      this.probeBuf.get(p.id)!.push(t, value);
    }
  }

  // ------------------------------------------------------------- running
  /** Advances simulation time to `target` seconds. */
  advance(target: number) {
    let guard = 0;
    while (this.now() < target - 1e-12 && guard++ < 1_000_000) {
      let segEnd = target;
      if (this.events.length && this.events[0].t < segEnd) segEnd = this.events[0].t;
      // Multiple MCUs advance in lock-step slices of at most 100 µs.
      if (this.mcus.length > 1) segEnd = Math.min(segEnd, this.now() + 1e-4);
      if (this.mcus.length) {
        this.segEnd = segEnd;
        for (const e of this.mcus) e.mcu.runUntil(this.cyclesAt(e, this.segEnd));
        this.segEnd = Infinity;
      } else {
        this.virtualTime = segEnd;
      }
      this.fireDueEvents();
      if (this.dirty.size) this.solveNow();
    }
  }

  private scheduleLoop() {
    if (this.loopTimer) clearTimeout(this.loopTimer);
    this.loopTimer = setTimeout(() => this.loop(), this.settings.realtime ? 4 : 0);
  }

  private loop() {
    this.loopTimer = null;
    if (this.state !== 'running') return;
    const wallStart = this.clock();
    try {
      if (this.settings.realtime) {
        const elapsed = Math.min((wallStart - this.lastLoopWall) / 1000, MAX_SLICE_WALL_S);
        this.advance(this.now() + elapsed * this.settings.speed);
      } else {
        // As fast as possible: ~15 ms of wall time per loop iteration.
        while (this.clock() - wallStart < 15) this.advance(this.now() + 1e-3);
      }
    } catch (e) {
      this.post({ type: 'error', message: `Simulation error: ${(e as Error).message}` });
      this.pause();
      return;
    }
    this.lastLoopWall = wallStart;
    if (this.clock() - this.lastFrameWall >= FRAME_INTERVAL_MS) this.emitFrame();
    this.scheduleLoop();
  }

  // -------------------------------------------------------------- frames
  emitFrame() {
    if (this.dirty.size) this.solveNow();
    const t = this.now();
    this.integrate(t);
    const wall = this.clock();
    const frameDt = t - this.lastFrameSim;
    const wallDt = (wall - this.lastFrameWall) / 1000;
    if (this.state === 'running' && wallDt > 0) this.achievedSpeed = frameDt / wallDt;
    this.lastFrameSim = t;
    this.lastFrameWall = wall;

    const visuals: Record<string, Record<string, unknown>> = {};
    for (const [id, m] of this.models) {
      const v = m.visualState?.(frameDt);
      if (v) visuals[id] = v;
    }
    const mcus: McuStatus[] = this.mcus.map(({ id, mcu }) => {
      const pins: Record<string, string> = {};
      for (const p of mcu.pins) pins[p] = mcu.pinDrive(p);
      return { componentId: id, cycles: mcu.cycles, pc: mcu.pc, pins, serialBaud: mcu.serialBaud };
    });
    const sol = this.solution;
    const voltages = sol ? Array.from(sol.voltages) : [];
    const driven = sol ? Array.from(sol.island, (isl) => isl >= 0 && sol.islandDriven[isl]) : [];
    const serial = [...this.serialBuf].map(([componentId, data]) => ({ componentId, data }));
    this.serialBuf.clear();
    const probes = [...this.probeBuf].map(([id, samples]) => ({ id, samples }));
    this.probeBuf.clear();
    this.post({
      type: 'frame',
      state: this.state,
      simTime: t,
      speed: this.state === 'running' ? this.achievedSpeed : 0,
      visuals,
      voltages,
      driven,
      mcus,
      serial,
      probes,
      solves: this.solveCount,
    });
    this.emitDiagnostics();
  }

  private emitDiagnostics() {
    const all: Diagnostic[] = [...this.engineDiagnostics];
    for (const m of this.models.values()) {
      const d = m.diagnostics?.();
      if (d) all.push(...d);
    }
    const key = JSON.stringify(all);
    if (key !== this.lastDiagKey) {
      this.lastDiagKey = key;
      this.post({ type: 'diagnostics', diagnostics: all });
    }
  }
}
