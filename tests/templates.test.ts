/** New-project templates: valid circuits whose breadboard rails are really powered. */
import { describe, expect, it } from 'vitest';
import { buildNetlist } from '../src/core/circuit/netlist';
import { runStaticErc } from '../src/core/circuit/erc';
import { TEMPLATES } from '../src/examples/templates';
import { lookup, registry } from './helpers';

describe('project templates', () => {
  for (const tpl of TEMPLATES) {
    it(`${tpl.id} builds a valid project`, () => {
      const p = tpl.build(registry, 'My project');
      expect(p.meta.name).toBe('My project');
      expect(p.firmware.files[0].name).toBe('sketch.ino');
      for (const c of p.circuit.components) expect(lookup(c.type), c.type).toBeTruthy();
      const netlist = buildNetlist(p.circuit, lookup);
      const errors = runStaticErc(p.circuit, netlist, lookup).filter((d) => d.severity === 'error');
      expect(errors.map((d) => d.message)).toEqual([]);
      // No part is plugged into the breadboard by accident.
      expect(netlist.insertions).toEqual([]);
    });
  }

  it.each(['uno-breadboard', 'nano-breadboard', 'logic'])('%s puts 5 V and GND on the bottom rails', (id) => {
    const p = TEMPLATES.find((x) => x.id === id)!.build(registry, 'x');
    const netlist = buildNetlist(p.circuit, lookup);
    const bb = p.circuit.components.find((c) => c.type === 'evlab.breadboard-half')!;
    const plus = netlist.nets[netlist.netOf({ componentId: bb.id, pinId: 'bp.10' })!];
    const minus = netlist.nets[netlist.netOf({ componentId: bb.id, pinId: 'bn.10' })!];
    const psu = p.circuit.components.find((c) => c.type === 'evlab.bench-supply');
    if (psu) {
      // The bench supply's voltage is a property: check the rails reach its terminals.
      expect(plus.pins).toContainEqual({ componentId: psu.id, pinId: '+' });
      expect(minus.pins).toContainEqual({ componentId: psu.id, pinId: '-' });
    } else {
      expect(plus.powerVoltages).toEqual([5]);
      expect(minus.hasGround).toBe(true);
    }
  });
});
