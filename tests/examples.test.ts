import { describe, expect, it } from 'vitest';
import { ALL_EXAMPLES as EXAMPLES } from '../src/examples/all';
import { buildNetlist } from '../src/core/circuit/netlist';
import { runStaticErc } from '../src/core/circuit/erc';
import { lookup, registry } from './helpers';
import type { CircuitDocument } from '../src/core/model/circuit';

function nets(doc: CircuitDocument) {
  const nl = buildNetlist(doc, lookup);
  const byLabel = (label: string, pin: string) => {
    const c = doc.components.find((x) => x.label === label);
    if (!c) throw new Error(`no ${label}`);
    const n = nl.netOf({ componentId: c.id, pinId: pin });
    if (n === undefined) throw new Error(`no pin ${label}.${pin}`);
    return n;
  };
  return { nl, n: byLabel };
}

describe('example projects', () => {
  for (const ex of EXAMPLES) {
    it(`${ex.id}: builds without static ERC errors`, () => {
      const p = ex.build(registry);
      const { nl } = nets(p.circuit);
      const errors = runStaticErc(p.circuit, nl, lookup).filter((d) => d.severity === 'error');
      expect(errors).toEqual([]);
      for (const w of p.circuit.wires) {
        expect(p.circuit.components.some((c) => c.id === w.from.componentId)).toBe(true);
        expect(p.circuit.components.some((c) => c.id === w.to.componentId)).toBe(true);
      }
    });
  }

  it('blink: LED and resistor are inserted into the right strips', () => {
    const p = EXAMPLES.find((e) => e.id === 'blink')!.build(registry);
    const { n } = nets(p.circuit);
    expect(n('LED1', 'A')).toBe(n('R1', '1'));
    expect(n('R1', '2')).toBe(n('U1', '13'));
    expect(n('LED1', 'C')).toBe(n('U1', 'GND.1'));
  });

  it('button: the rotated push button straddles the channel correctly', () => {
    const p = EXAMPLES.find((e) => e.id === 'button')!.build(registry);
    const { n } = nets(p.circuit);
    expect(n('SW1', '1.l')).toBe(n('U1', '2'));
    expect(n('SW1', '2.l')).toBe(n('U1', 'GND.1'));
    expect(n('SW1', '1.l')).not.toBe(n('SW1', '2.l'));
  });

  it('traffic light: each LED reaches its pin through its resistor', () => {
    const p = EXAMPLES.find((e) => e.id === 'traffic-light')!.build(registry);
    const { n } = nets(p.circuit);
    expect(n('R1', '2')).toBe(n('U1', '13'));
    expect(n('R2', '2')).toBe(n('U1', '12'));
    expect(n('R3', '2')).toBe(n('U1', '11'));
    for (const led of ['LED1', 'LED2', 'LED3']) expect(n(led, 'C')).toBe(n('U1', 'GND.1'));
    expect(n('LED1', 'A')).toBe(n('R1', '1'));
    expect(n('LED3', 'A')).toBe(n('R3', '1'));
  });

  it('potentiometer: wiper on A0, LED on pin 9', () => {
    const p = EXAMPLES.find((e) => e.id === 'potentiometer')!.build(registry);
    const { n } = nets(p.circuit);
    expect(n('RV1', 'SIG')).toBe(n('U1', 'A0'));
    expect(n('R1', '2')).toBe(n('U1', '9'));
  });
});
