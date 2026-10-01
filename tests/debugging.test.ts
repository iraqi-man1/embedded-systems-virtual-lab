/**
 * Debugging tools: MCU panel data (registers, PWM duty, input levels),
 * flashing new firmware into a running simulation, serial log timestamps and
 * the hex view.
 */
import { describe, expect, it } from 'vitest';
import { hexDump, stampLines, withTimestamps } from '../src/core/instruments/serialLog';
import { buildNetlist } from '../src/core/circuit/netlist';
import { buildSimSetup } from '../src/core/sim/setup';
import { CircuitBuilder, fixture, lookup, simulate } from './helpers';

describe('MCU panel data', () => {
  it('reports registers, stack and the PWM duty of a wired pin', () => {
    const b = new CircuitBuilder();
    const uno = b.add('evlab.arduino-uno');
    // A0 at mid-supply → analogWrite(9, ~128) → ~50 % duty.
    const r1 = b.add('evlab.resistor', 400, 0, { resistance: '10k' });
    const r2 = b.add('evlab.resistor', 400, 100, { resistance: '10k' });
    b.wire(r1, '1', uno, '5V');
    b.wire(r1, '2', uno, 'A0');
    b.wire(r2, '1', uno, 'A0');
    b.wire(r2, '2', uno, 'GND.1');
    const load = b.add('evlab.resistor', 400, 200, { resistance: '1k' });
    b.wire(load, '1', uno, '9');
    b.wire(load, '2', uno, 'GND.2');
    const h = simulate(b, { [uno.id]: fixture('pot_pwm.hex') });
    h.run(0.3);
    const status = h.frames[h.frames.length - 1].mcus[0];
    const dbg = status.debug!;
    expect(dbg.r).toHaveLength(32);
    expect(dbg.ramEnd).toBe(0x8ff);
    expect(dbg.sp).toBeLessThan(dbg.ramEnd);
    expect(dbg.ramEnd - dbg.sp).toBeLessThan(256);
    expect(dbg.duty['9']).toBeGreaterThan(0.4);
    expect(dbg.duty['9']).toBeLessThan(0.6);
    // Unwired pins report no duty.
    expect(dbg.duty['13']).toBeUndefined();
  });
});

describe('flashing a running simulation', () => {
  it('restarts only the board with the new firmware', () => {
    const b = new CircuitBuilder();
    const uno = b.add('evlab.arduino-uno');
    const led = b.add('evlab.led', 400, 0, { color: 'red' });
    const r = b.add('evlab.resistor', 400, 100, { resistance: '220' });
    b.wire(led, 'A', uno, '13');
    b.wire(led, 'C', r, '1');
    b.wire(r, '2', uno, 'GND.1');
    const h = simulate(b, { [uno.id]: fixture('boot_banner.hex') });
    h.run(0.3);
    expect(h.serial()).toContain('boot');
    const t = h.engine.now();
    const setup = buildSimSetup(b.doc, lookup, buildNetlist(b.doc, lookup), { [uno.id]: fixture('blink.hex') }, []);
    h.engine.updateCircuit(setup);
    const lit: boolean[] = [];
    for (let i = 0; i < 25; i++) {
      h.run(0.1);
      lit.push(!!h.lastVisual(led.id)?.value);
    }
    // Time keeps running; the MCU started over and now blinks the LED.
    expect(h.engine.now()).toBeGreaterThan(t + 2);
    expect(h.frames[h.frames.length - 1].mcus[0].cycles).toBeLessThan(2.6 * 16e6);
    expect(lit).toContain(true);
    expect(lit).toContain(false);
  });

  it('restarts a board flashed with an identical build', () => {
    const b = new CircuitBuilder();
    const uno = b.add('evlab.arduino-uno');
    const h = simulate(b, { [uno.id]: fixture('boot_banner.hex') });
    h.run(0.3);
    const setup = buildSimSetup(b.doc, lookup, buildNetlist(b.doc, lookup), { [uno.id]: fixture('boot_banner.hex') }, []);
    h.engine.updateCircuit(setup);
    h.run(0.3);
    expect(h.serial().split('boot').length - 1).toBe(1);
    h.engine.updateCircuit(setup, [uno.id]);
    h.run(0.3);
    expect(h.serial().split('boot').length - 1).toBe(2);
  });
});

describe('serial log', () => {
  it('stamps each line with the time it began', () => {
    const stamps: number[] = [];
    let text = '';
    for (const [chunk, t] of [['hel', 1], ['lo\nwor', 2], ['ld\n', 3], ['x', 4]] as const) {
      stampLines(text, chunk, stamps, t);
      text += chunk;
    }
    expect(stamps).toEqual([1, 2, 4]);
    expect(withTimestamps(text, stamps).split('\n')).toEqual(['[   1.000 s] hello', '[   2.000 s] world', '[   4.000 s] x']);
  });

  it('dumps bytes in hex with printable characters', () => {
    const dump = hexDump('Hello\r\n' + String.fromCharCode(0xff));
    // Offset, two groups of 8 bytes (the second one empty here), then the characters.
    expect(dump).toBe(`000000  48 65 6c 6c 6f 0d 0a ff  ${' '.repeat(23)}  |Hello···${' '.repeat(8)}|`);
  });
});
