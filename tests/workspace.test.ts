/**
 * Workspace geometry: CAD-style box selection and the breadboard insertion
 * preview shown while dragging parts.
 */
import { describe, expect, it } from 'vitest';
import { componentBounds, pinWorld } from '../src/core/circuit/geometry';
import { buildNetlist } from '../src/core/circuit/netlist';
import { insertionPreview, marqueeSelection } from '../src/ui/workspace/geometry';
import { CircuitBuilder, lookup, registry } from './helpers';

function boardWithLed() {
  const b = new CircuitBuilder();
  const bb = b.add('evlab.breadboard-half', 0, 0);
  const led = b.add('evlab.led', 0, 0, { color: 'red' });
  b.insert(led, 'C', bb, 'e10');
  return { b, bb, led };
}

describe('box selection', () => {
  it('left→right (window) selects only what lies completely inside', () => {
    const { b, bb, led } = boardWithLed();
    const lb = componentBounds(led, registry.require('evlab.led'));
    const rect = { x: lb.x - 2, y: lb.y - 2, width: lb.width + 4, height: lb.height + 4 };
    const sel = marqueeSelection(b.doc, rect, false);
    expect(sel.components).toEqual([led.id]);
    expect(sel.components).not.toContain(bb.id);
  });

  it('right→left (crossing) selects everything the box touches', () => {
    const { b, bb, led } = boardWithLed();
    const lb = componentBounds(led, registry.require('evlab.led'));
    const rect = { x: lb.x + 2, y: lb.y + 2, width: 4, height: 4 };
    const sel = marqueeSelection(b.doc, rect, true);
    expect(sel.components.sort()).toEqual([bb.id, led.id].sort());
  });

  it('selects wires by containment or crossing', () => {
    const b = new CircuitBuilder();
    const r1 = b.add('evlab.resistor', 0, 0);
    const r2 = b.add('evlab.resistor', 0, 200);
    const w = b.wire(r1, '1', r2, '1');
    w.points = [{ x: -100, y: 0 }, { x: -100, y: 200 }];
    const p1 = pinWorld(r1, registry.require('evlab.resistor'), registry.require('evlab.resistor').pins[0]);
    // A thin box across the vertical wire segment only.
    const across = { x: -110, y: 90, width: 20, height: 20 };
    expect(marqueeSelection(b.doc, across, true).wires).toEqual([w.id]);
    expect(marqueeSelection(b.doc, across, false).wires).toEqual([]);
    const all = { x: -120, y: p1.y - 20, width: 400, height: 260 };
    expect(marqueeSelection(b.doc, all, false).wires).toEqual([w.id]);
  });
});

describe('insertion preview', () => {
  it('finds the holes under the legs and the rest of their strips', () => {
    const b = new CircuitBuilder();
    const bb = b.add('evlab.breadboard-half', 0, 0);
    const def = registry.require('evlab.led');
    // A loose LED placed so its legs sit on two holes (not yet part of the circuit).
    const ghost = { id: 'g', type: 'evlab.led', x: 0, y: 0, rotation: 0 as const, label: '', props: {} };
    const here = pinWorld(ghost, def, def.pins.find((p) => p.id === 'C')!);
    const hole = pinWorld(bb, registry.require('evlab.breadboard-half'), registry.require('evlab.breadboard-half').pins.find((p) => p.id === 'e10')!);
    ghost.x += hole.x - here.x;
    ghost.y += hole.y - here.y;
    const legs = def.pins.map((p) => pinWorld(ghost, def, p));
    const preview = insertionPreview(b.doc, buildNetlist(b.doc, lookup), legs, new Set());
    expect(preview.holes).toHaveLength(2);
    // Each terminal strip has 5 holes: 2 strips × 4 other holes.
    expect(preview.strips).toHaveLength(8);
    // Nothing is highlighted for parts that are being moved themselves.
    expect(insertionPreview(b.doc, buildNetlist(b.doc, lookup), legs, new Set([bb.id])).holes).toHaveLength(0);
  });
});
