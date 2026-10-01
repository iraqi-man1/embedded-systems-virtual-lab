import { describe, expect, it } from 'vitest';
import { StampCollector, solve, diodeCurrent, type PwlDiode } from '../src/core/sim/analog/solver';
import { parseEngineering, formatEngineering } from '../src/core/model/units';

describe('MNA solver', () => {
  it('solves a voltage divider', () => {
    const s = new StampCollector();
    s.voltageSource(1, 0, 10, 1e-3);
    s.resistor(1, 2, 1000);
    s.resistor(2, 0, 1000);
    const r = solve(3, s, [0]);
    expect(r.voltages[2]).toBeCloseTo(5, 2);
  });

  it('solves a forward-biased LED with series resistor', () => {
    const s = new StampCollector();
    const d: PwlDiode = { anode: 2, cathode: 0, vOn: 1.7, rOn: 15, gOff: 1e-9, on: false };
    s.voltageSource(1, 0, 5, 25);
    s.resistor(1, 2, 220);
    s.diode(d);
    const r = solve(3, s, [0]);
    expect(d.on).toBe(true);
    const i = diodeCurrent(d, r.voltages);
    expect(i * 1000).toBeCloseTo((5 - 1.7) / (25 + 220 + 15) * 1000, 1);
  });

  it('keeps a reverse-biased diode off', () => {
    const s = new StampCollector();
    const d: PwlDiode = { anode: 0, cathode: 2, vOn: 0.7, rOn: 1, gOff: 1e-9, on: true };
    s.voltageSource(1, 0, 5, 1);
    s.resistor(1, 2, 1000);
    s.diode(d);
    const r = solve(3, s, [0]);
    expect(d.on).toBe(false);
    expect(r.voltages[2]).toBeCloseTo(5, 2);
  });

  it('separates islands and marks undriven ones', () => {
    const s = new StampCollector();
    s.voltageSource(1, 0, 3, 1);
    s.resistor(2, 3, 100); // isolated resistor, no source
    const r = solve(4, s, [0]);
    expect(r.island[1]).not.toBe(r.island[2]);
    expect(r.islandDriven[r.island[1]]).toBe(true);
    expect(r.islandDriven[r.island[2]]).toBe(false);
  });

  it('solves a VCCS (transconductance amplifier)', () => {
    const s = new StampCollector();
    s.voltageSource(1, 0, 0.1, 1e-3); // input 0.1 V
    s.controlledSource(2, 0, 1, 0, 0.01); // 10 mS: 1 mA flows 2 -> 0 through the source
    s.resistor(3, 2, 1000); // load from a 5 V rail
    s.voltageSource(3, 0, 5, 1e-3);
    const r = solve(4, s, [0]);
    expect(r.voltages[2]).toBeCloseTo(4, 2);
  });
});

describe('engineering units', () => {
  it('parses common notations', () => {
    expect(parseEngineering('4.7k')).toBeCloseTo(4700);
    expect(parseEngineering('4k7')).toBeCloseTo(4700);
    expect(parseEngineering('1M')).toBe(1e6);
    expect(parseEngineering('100n')).toBeCloseTo(1e-7);
    expect(parseEngineering('220Ω')).toBe(220);
    expect(Number.isNaN(parseEngineering('abc'))).toBe(true);
  });
  it('formats values', () => {
    expect(formatEngineering(4700, 'Ω')).toBe('4.7 kΩ');
    expect(formatEngineering(0.0127, 'A')).toBe('12.7 mA');
  });
});
