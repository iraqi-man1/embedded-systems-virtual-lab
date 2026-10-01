import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import '../src/core/sim/models/register';
import { builtinPackage } from '../src/components/builtin';
import { ComponentRegistry } from '../src/core/registry/registry';
import type { CircuitDocument, ComponentInstance, PinRef, Wire } from '../src/core/model/circuit';
import { pinWorld } from '../src/core/circuit/geometry';
import { buildNetlist } from '../src/core/circuit/netlist';
import { buildSimSetup, type ProbeRequest } from '../src/core/sim/setup';
import { SimulationEngine } from '../src/core/sim/engine/engine';
import type { SimEvent } from '../src/core/sim/types';

export const registry = new ComponentRegistry();
registry.registerPackage(builtinPackage);
export const lookup = (t: string) => registry.get(t);

export const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

export class CircuitBuilder {
  doc: CircuitDocument = { components: [], wires: [] };
  private n = 0;
  add(type: string, x = 0, y = 0, props: Record<string, string | number | boolean> = {}): ComponentInstance {
    const def = registry.require(type);
    const inst: ComponentInstance = { id: `c${++this.n}`, type, x, y, rotation: 0, label: `${def.designator}${this.n}`, props };
    this.doc.components.push(inst);
    return inst;
  }
  /** World position of a pin. */
  pin(inst: ComponentInstance, pinId: string) {
    const def = registry.require(inst.type);
    return pinWorld(inst, def, def.pins.find((p) => p.id === pinId)!);
  }
  /** Moves `inst` so that its pin `pinId` sits exactly on `target`'s pin. */
  insert(inst: ComponentInstance, pinId: string, target: ComponentInstance, targetPin: string) {
    const here = this.pin(inst, pinId);
    const there = this.pin(target, targetPin);
    inst.x += there.x - here.x;
    inst.y += there.y - here.y;
  }
  wire(a: ComponentInstance, ap: string, b: ComponentInstance, bp: string): Wire {
    const w: Wire = { id: `w${++this.n}`, from: { componentId: a.id, pinId: ap }, to: { componentId: b.id, pinId: bp }, points: [], color: '#2ecc71' };
    this.doc.wires.push(w);
    return w;
  }
}

export interface Harness {
  engine: SimulationEngine;
  events: SimEvent[];
  frames: Extract<SimEvent, { type: 'frame' }>[];
  serial: () => string;
  diagnostics: () => { code: string; message: string }[];
  run: (seconds: number) => void;
  lastVisual: (id: string) => Record<string, unknown> | undefined;
  netOf: (ref: PinRef) => number | undefined;
}

export function simulate(b: CircuitBuilder, firmware: Record<string, string>, probes: ProbeRequest[] = []): Harness {
  const netlist = buildNetlist(b.doc, lookup);
  const setup = buildSimSetup(b.doc, lookup, netlist, firmware, probes);
  const events: SimEvent[] = [];
  const engine = new SimulationEngine(setup, { speed: 1, realtime: true }, (e) => events.push(e));
  engine.start();
  engine.pause(); // drive time manually
  const frames = () => events.filter((e): e is Extract<SimEvent, { type: 'frame' }> => e.type === 'frame');
  return {
    engine,
    events,
    get frames() {
      return frames();
    },
    serial: () =>
      frames()
        .flatMap((f) => f.serial.flatMap((s) => s.data))
        .map((c) => String.fromCharCode(c))
        .join(''),
    diagnostics: () => {
      const d = events.filter((e) => e.type === 'diagnostics');
      const last = d[d.length - 1] as Extract<SimEvent, { type: 'diagnostics' }> | undefined;
      return last?.diagnostics ?? [];
    },
    run: (seconds: number) => {
      // Emit a frame every 10 ms of simulated time, like the UI loop would.
      const end = engine.now() + seconds;
      while (engine.now() < end - 1e-9) {
        engine.advance(Math.min(end, engine.now() + 0.01));
        engine.emitFrame();
      }
    },
    lastVisual: (id: string) => {
      const f = frames();
      return f[f.length - 1]?.visuals[id];
    },
    netOf: (ref) => netlist.netOf(ref),
  };
}
