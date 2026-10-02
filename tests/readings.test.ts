/** Live readings on the hover card: a 9 V battery driving a red LED through 1 kΩ, solved by the simulator. */
import { describe, expect, it } from 'vitest';
import { partReadings } from '../src/core/sim/readings';
import { CircuitBuilder, lookup, simulate } from './helpers';

function circuit(ohms: string) {
  const b = new CircuitBuilder();
  const bat = b.add('evlab.battery-9v', 0, 0);
  const r = b.add('evlab.resistor', 200, 0, { resistance: ohms });
  const led = b.add('evlab.led', 400, 0, { color: 'red' });
  b.wire(bat, '+', r, '1');
  b.wire(r, '2', led, 'A');
  b.wire(led, 'C', bat, '-');
  const h = simulate(b, {});
  h.run(0.1);
  const frame = h.frames.at(-1)!;
  const read = (inst: typeof r) => partReadings(lookup(inst.type)!, inst, h.netOf, frame.voltages, frame.driven, frame.visuals[inst.id])!;
  return { r: read(r), led: read(led), bat: read(bat) };
}

describe('live readings', () => {
  it('show the voltage, current, power and load of each part', () => {
    const { r, led, bat } = circuit('1k');
    // About 7 mA flows: (9 V − ~2 V across the red LED) / 1 kΩ.
    expect(r.amps!).toBeGreaterThan(0.006);
    expect(r.amps!).toBeLessThan(0.0075);
    expect(led.amps!).toBeCloseTo(r.amps!, 4);
    expect(bat.amps!).toBeCloseTo(r.amps!, 4);
    expect(led.volts!).toBeGreaterThan(1.8);
    expect(led.volts!).toBeLessThan(2.3);
    expect(r.volts! + led.volts!).toBeCloseTo(bat.volts!, 3);
    expect(r.watts!).toBeCloseTo(r.volts! * r.amps!, 9);
    // A 0.25 W resistor and a 20 mA LED are well within their ratings.
    expect(r.load).toMatchObject({ unit: 'W', limit: 0.25 });
    expect(r.load!.ratio).toBeLessThan(0.3);
    expect(led.load!.ratio).toBeCloseTo(led.amps! / 0.02, 6);
  });

  it('show an overloaded LED', () => {
    const { led } = circuit('47');
    expect(led.load!.ratio).toBeGreaterThan(1);
  });

  it('have nothing for parts without two plain terminals', () => {
    const b = new CircuitBuilder();
    const uno = b.add('evlab.arduino-uno', 0, 0);
    const h = simulate(b, {});
    h.run(0.02);
    const f = h.frames.at(-1)!;
    expect(partReadings(lookup(uno.type)!, uno, h.netOf, f.voltages, f.driven, f.visuals[uno.id])).toBeNull();
  });
});
