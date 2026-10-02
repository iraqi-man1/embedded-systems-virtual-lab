/** Quick value editor: the value it offers for each part, and a resistor's colour bands. */
import { describe, expect, it } from 'vitest';
import { resistorBands } from '../src/core/model/colorCode';
import { quickProperties } from '../src/ui/workspace/QuickEdit';
import { lookup, registry } from './helpers';

const names = (ohms: number) => resistorBands(ohms)?.map((b) => b.name).join(' ');

describe('resistor colour code', () => {
  it('reads four bands for two-digit values', () => {
    expect(names(220)).toBe('red red brown gold');
    expect(names(1000)).toBe('brown black red gold');
    expect(names(4700)).toBe('yellow violet red gold');
    expect(names(10_000)).toBe('brown black orange gold');
    expect(names(1_000_000)).toBe('brown black green gold');
    expect(names(4.7)).toBe('yellow violet gold gold');
    expect(names(0.47)).toBe('yellow violet silver gold');
    expect(names(1)).toBe('brown black gold gold');
  });

  it('reads five bands (1 %) when three digits are needed', () => {
    expect(names(4990)).toBe('yellow white white brown brown');
    expect(names(1020)).toBe('brown black red brown brown');
  });

  it('has no bands for values a colour code cannot show', () => {
    expect(resistorBands(0)).toBeNull();
    expect(resistorBands(-5)).toBeNull();
    expect(resistorBands(NaN)).toBeNull();
    expect(resistorBands(1234.5)).toBeNull();
    expect(resistorBands(0.001)).toBeNull();
  });
});

describe('quick value editor', () => {
  const keys = (type: string) => quickProperties(lookup(type)!).map((p) => p.key);
  it('offers each part its main value', () => {
    expect(keys('evlab.resistor')).toEqual(['resistance']);
    expect(keys('evlab.led')).toEqual(['color']);
    expect(keys('evlab.battery-9v')).toEqual(['voltage']);
    expect(keys('evlab.dht22')).toEqual(['temperature']);
    expect(keys('evlab.hc-sr04')).toEqual(['distance']);
    expect(keys('evlab.capacitor-ceramic')).toEqual(['capacitance']);
    // A DIP switch: all its switches.
    expect(keys('evlab.dip-switch-8')).toHaveLength(8);
    // Parts without settings have nothing to edit (double-click opens Properties).
    expect(keys('evlab.arduino-uno')).toEqual([]);
  });

  it('every offered value has a label and a usable kind', () => {
    for (const def of registry.all()) {
      for (const p of quickProperties(def)) {
        expect(p.label, def.type).toBeTruthy();
        if (p.type === 'enum') expect(p.options?.length, `${def.type}.${p.key}`).toBeGreaterThan(0);
      }
    }
  });
});
