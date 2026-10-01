import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ComponentPackage } from '../src/core/model/component';
import { validateDefinition } from '../src/core/registry/validate';
import { CircuitBuilder, registry, simulate } from './helpers';

const sample = JSON.parse(readFileSync(join(__dirname, '..', 'docs', 'examples', 'sample-package', 'package.json'), 'utf8')) as ComponentPackage;

describe('JSON component packages', () => {
  it('the documented sample package validates and registers', () => {
    for (const def of sample.components) expect(validateDefinition(def)).toEqual([]);
    const before = registry.problems.length;
    registry.registerPackage(sample);
    expect(registry.problems.length).toBe(before);
    expect(registry.get('sample.cd4001')?.packageId).toBe('sample.extras');
  });

  it('rejects inline SVG with scripts', () => {
    const bad = { ...sample.components[0], type: 'sample.bad', visual: { kind: 'svg' as const, svg: '<svg onload="alert(1)"></svg>' } };
    expect(validateDefinition(bad).join()).toMatch(/scripts/);
  });

  it('a JSON-defined NOR gate simulates through the generic logic model', () => {
    registry.registerPackage(sample);
    const b = new CircuitBuilder();
    const bat = b.add('evlab.battery-9v', 0, 0, { voltage: 5 });
    const nor = b.add('sample.cd4001', 200, 0);
    const led = b.add('sample.led-3mm-blue', 300, 100);
    const r = b.add('evlab.resistor', 300, 200, { resistance: '470' });
    b.wire(nor, 'VCC', bat, '+');
    b.wire(nor, 'GND', bat, '-');
    b.wire(nor, '1A', bat, '-');
    b.wire(nor, '1B', bat, '-');
    b.wire(nor, '1Y', r, '1');
    b.wire(r, '2', led, 'A');
    b.wire(led, 'C', bat, '-');
    const h = simulate(b, {});
    h.run(0.01);
    expect(h.lastVisual(led.id)?.value).toBe(true); // NOR(0,0) = 1
  });
});
