/**
 * Data-safety and correctness fixes: serial decoding of large bursts,
 * breadboards carrying their parts, a monotonic simulation clock when MCUs
 * are added/removed while running, crash-recovery autosave.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { bytesToText } from '../src/core/instruments/decoders';
import { buildNetlist, carriedComponents } from '../src/core/circuit/netlist';
import { buildSimSetup } from '../src/core/sim/setup';
import { CircuitBuilder, fixture, lookup, simulate } from './helpers';

describe('serial decoding', () => {
  it('decodes like String.fromCharCode', () => {
    const bytes = [72, 105, 0x0a, 0x80, 0xff];
    expect(bytesToText(bytes)).toBe(String.fromCharCode(...bytes));
  });

  it('handles bursts far larger than the argument limit', () => {
    const bytes = new Array(1_000_000).fill(65);
    const text = bytesToText(bytes);
    expect(text.length).toBe(1_000_000);
    expect(text.slice(0, 3)).toBe('AAA');
  });
});

describe('breadboard carries inserted parts', () => {
  function board() {
    const b = new CircuitBuilder();
    const uno = b.add('evlab.arduino-uno', 0, 0);
    const bb = b.add('evlab.breadboard-half', 0, 260);
    const led = b.add('evlab.led', 0, 0, { color: 'red' });
    const r = b.add('evlab.resistor', 0, 0, { resistance: '220' });
    b.insert(led, 'C', bb, 'a10');
    b.insert(r, '1', bb, 'b11');
    const loose = b.add('evlab.led', 600, 600);
    return { b, uno, bb, led, r, loose };
  }

  it('moving the board moves the parts plugged into it, nothing else', () => {
    const { b, uno, bb, led, r, loose } = board();
    const moved = carriedComponents(buildNetlist(b.doc, lookup), [bb.id]);
    expect(moved.has(bb.id)).toBe(true);
    expect(moved.has(led.id)).toBe(true);
    expect(moved.has(r.id)).toBe(true);
    expect(moved.has(uno.id)).toBe(false);
    expect(moved.has(loose.id)).toBe(false);
  });

  it('moving a plugged-in part does not drag the board', () => {
    const { b, bb, led } = board();
    const moved = carriedComponents(buildNetlist(b.doc, lookup), [led.id]);
    expect([...moved]).toEqual([led.id]);
    expect(moved.has(bb.id)).toBe(false);
  });

  it('keeps the parts connected after the move', () => {
    const { b, bb, led, r } = board();
    const before = buildNetlist(b.doc, lookup);
    const moved = carriedComponents(before, [bb.id]);
    for (const c of b.doc.components) {
      if (!moved.has(c.id)) continue;
      c.x += 96;
      c.y += 48;
    }
    const after = buildNetlist(b.doc, lookup);
    expect(after.insertions.length).toBe(before.insertions.length);
    expect(after.netOf({ componentId: led.id, pinId: 'A' })).toBe(after.netOf({ componentId: r.id, pinId: '1' }));
  });
});

describe('simulation clock', () => {
  /** Two Unos running blink; returns the builder and both boards. */
  function twoBoards() {
    const b = new CircuitBuilder();
    const a = b.add('evlab.arduino-uno', 0, 0);
    const c = b.add('evlab.arduino-uno', 400, 0);
    return { b, a, c };
  }

  it('stays monotonic when an MCU is added while running, and the new MCU starts from now', () => {
    const { b, a, c } = twoBoards();
    const only = { components: b.doc.components.filter((x) => x.id === a.id), wires: [] };
    const first = new CircuitBuilder();
    first.doc = only;
    const h = simulate(first, { [a.id]: fixture('blink.hex') });
    h.run(0.3);
    const t1 = h.engine.now();
    expect(t1).toBeGreaterThan(0.29);

    // Add the second board (with firmware) mid-run.
    const netlist = buildNetlist(b.doc, lookup);
    h.engine.updateCircuit(buildSimSetup(b.doc, lookup, netlist, { [a.id]: fixture('blink.hex'), [c.id]: fixture('blink.hex') }));
    expect(h.engine.now()).toBeGreaterThanOrEqual(t1);
    h.run(0.1);
    expect(h.engine.now()).toBeGreaterThan(t1 + 0.099);
    const mcus = h.frames[h.frames.length - 1].mcus;
    const second = mcus.find((m) => m.componentId === c.id)!;
    // ~0.1 s at 16 MHz — not 0.4 s of catch-up execution.
    expect(second.cycles / 16e6).toBeGreaterThan(0.09);
    expect(second.cycles / 16e6).toBeLessThan(0.11);
  });

  it('stays monotonic when the master MCU is removed', () => {
    const { b, a, c } = twoBoards();
    const fw = { [a.id]: fixture('blink.hex'), [c.id]: fixture('blink.hex') };
    const h = simulate(b, fw);
    h.run(0.2);
    const t1 = h.engine.now();
    const rest = { components: b.doc.components.filter((x) => x.id !== a.id), wires: [] };
    h.engine.updateCircuit(buildSimSetup(rest, lookup, buildNetlist(rest, lookup), fw));
    expect(h.engine.now()).toBeGreaterThanOrEqual(t1);
    h.run(0.05);
    expect(h.engine.now()).toBeGreaterThan(t1 + 0.049);
    // Last MCU removed: the virtual clock continues from the same time.
    const t2 = h.engine.now();
    const none = { components: [], wires: [] };
    h.engine.updateCircuit(buildSimSetup(none, lookup, buildNetlist(none, lookup), {}));
    expect(h.engine.now()).toBeGreaterThanOrEqual(t2);
    h.run(0.01);
    expect(h.engine.now()).toBeGreaterThan(t2 + 0.009);
  });

  it('stays monotonic across a board reset', () => {
    const { b, a } = twoBoards();
    const h = simulate(b, { [a.id]: fixture('blink.hex') });
    h.run(0.2);
    const t1 = h.engine.now();
    h.engine.reset();
    expect(h.engine.now()).toBeGreaterThanOrEqual(t1);
  });
});

describe('autosave', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    };
  });

  it('writes the unsaved project and removes the copy once saved', async () => {
    const { autosaveNow, clearAutosave } = await import('../src/app/autosave');
    const { autosaveStore } = await import('../src/platform');
    const { useProject } = await import('../src/state/project');
    const { parseProject } = await import('../src/core/project/schema');

    // Clean project: nothing to recover.
    await autosaveNow();
    expect(await autosaveStore.read()).toBeNull();

    useProject.getState().updateProject((p) => {
      p.meta.name = 'Recovered lab';
      p.firmware.files[0].content = 'void setup(){}\nvoid loop(){}\n';
    });
    useProject.getState().edit((c) => {
      c.components.push({ id: 'x1', type: 'evlab.led', x: 10, y: 20, rotation: 0, label: 'LED1', props: { color: 'blue' } });
    });
    await autosaveNow();
    const copy = await autosaveStore.read();
    expect(copy).not.toBeNull();
    expect(copy!.meta.name).toBe('Recovered lab');
    expect(copy!.meta.sourcePath).toBeNull();
    const restored = parseProject(copy!.text);
    expect(restored.circuit.components.map((c) => c.id)).toEqual(['x1']);
    expect(restored.firmware.files[0].content).toContain('void loop');

    useProject.getState().markSaved('/tmp/lab.evlab');
    await clearAutosave();
    expect(await autosaveStore.read()).toBeNull();
    await autosaveNow(); // saved project: stays empty
    expect(await autosaveStore.read()).toBeNull();
  });
});

describe('undo coalescing', () => {
  it('turns a burst of wheel steps into one undo step', async () => {
    const { coalescedEdit, flushCoalesced, useProject } = await import('../src/state/project');
    const { newProject } = await import('../src/core/project/schema');
    const p = useProject.getState();
    p.load(newProject(), null);
    p.edit((c) => {
      c.components.push({ id: 'pot', type: 'evlab.potentiometer', x: 0, y: 0, rotation: 0, label: 'RV1', props: { position: 0.5 } });
    });
    const before = useProject.getState().past.length;
    for (let i = 1; i <= 10; i++) coalescedEdit((c) => void (c.components[0].props.position = 0.5 + i * 0.02));
    flushCoalesced();
    expect(useProject.getState().past.length).toBe(before + 1);
    expect(useProject.getState().project.circuit.components[0].props.position).toBeCloseTo(0.7);
    useProject.getState().undo();
    expect(useProject.getState().project.circuit.components[0].props.position).toBe(0.5);
  });
});
