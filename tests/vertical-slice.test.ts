/**
 * End-to-end tests of the vertical slice: Arduino Uno + breadboard +
 * resistor + LED + push button + potentiometer, running real firmware
 * compiled by PlatformIO (tests/fixtures/*.hex) on avr8js.
 */
import { describe, expect, it } from 'vitest';
import { buildNetlist } from '../src/core/circuit/netlist';
import { runStaticErc } from '../src/core/circuit/erc';
import { CircuitBuilder, fixture, lookup, simulate } from './helpers';

/** Uno D13 → 220 Ω → LED → GND, all on a half breadboard. */
function blinkCircuit(resistor = true) {
  const b = new CircuitBuilder();
  const uno = b.add('evlab.arduino-uno', 0, 0);
  const bb = b.add('evlab.breadboard-half', 0, 260);
  const led = b.add('evlab.led', 0, 0, { color: 'red' });
  b.insert(led, 'C', bb, 'a10'); // anode lands on a11 (pins are ~0.1" apart)
  if (resistor) {
    const r = b.add('evlab.resistor', 0, 0, { resistance: '220' });
    b.insert(r, '1', bb, 'b11'); // second leg lands on b17
    b.wire(uno, '13', bb, 'c17');
    return { b, uno, bb, led, r };
  }
  b.wire(uno, '13', bb, 'c11');
  b.wire(bb, 'c10', uno, 'GND.1');
  return { b, uno, bb, led, r: null };
}

describe('netlist from breadboard insertion', () => {
  it('connects legs inserted into the same terminal strip', () => {
    const { b, uno, bb, led, r } = blinkCircuit();
    b.wire(bb, 'c10', uno, 'GND.1');
    const nl = buildNetlist(b.doc, lookup);
    const net = (c: { id: string }, p: string) => nl.netOf({ componentId: c.id, pinId: p });
    expect(net(led, 'A')).toBe(net(r!, '1'));
    expect(net(r!, '2')).toBe(net(uno, '13'));
    expect(net(led, 'C')).toBe(net(uno, 'GND.2')); // GND pins are tied inside the Uno
    expect(net(led, 'A')).not.toBe(net(led, 'C'));
    expect(nl.insertions.length).toBe(4);
  });

  it('keeps the two halves of a column separate across the channel', () => {
    const b = new CircuitBuilder();
    const bb = b.add('evlab.breadboard-half');
    const nl = buildNetlist(b.doc, lookup);
    const n = (p: string) => nl.netOf({ componentId: bb.id, pinId: p });
    expect(n('a5')).toBe(n('e5'));
    expect(n('f5')).toBe(n('j5'));
    expect(n('a5')).not.toBe(n('f5'));
    expect(n('a5')).not.toBe(n('a6'));
    expect(n('tp.1')).toBe(n('tp.29'));
    expect(n('tp.1')).not.toBe(n('tn.1'));
  });
});

describe('static ERC', () => {
  it('flags a 5V-to-GND short', () => {
    const b = new CircuitBuilder();
    const uno = b.add('evlab.arduino-uno');
    b.wire(uno, '5V', uno, 'GND.1');
    const diags = runStaticErc(b.doc, buildNetlist(b.doc, lookup), lookup);
    expect(diags.map((d) => d.code)).toContain('supply-shorted-to-ground');
  });
});

describe('Blink on Arduino Uno', () => {
  it('drives the breadboard LED from digitalWrite()', () => {
    const { b, uno, bb, led } = blinkCircuit();
    b.wire(bb, 'c10', uno, 'GND.1');
    const h = simulate(b, { [uno.id]: fixture('blink.hex') }, [{ id: 'p13', target: { componentId: uno.id, pinId: '13' }, kind: 'digital' }]);
    const states: boolean[] = [];
    for (let i = 0; i < 100; i++) {
      h.run(0.01);
      states.push(!!h.lastVisual(led.id)?.value);
    }
    // 100 ms on / 100 ms off over 1 s => ~5 on-periods
    let rising = 0;
    for (let i = 1; i < states.length; i++) if (states[i] && !states[i - 1]) rising++;
    expect(rising).toBeGreaterThanOrEqual(4);
    expect(rising).toBeLessThanOrEqual(6);
    const samples = h.frames.flatMap((f) => f.probes.filter((p) => p.id === 'p13').flatMap((p) => p.samples));
    expect(samples.length / 2).toBeGreaterThanOrEqual(9); // ~10 edges recorded by the logic probe
    expect(h.diagnostics().filter((d) => d.code.includes('overcurrent') || d.code === 'led-destroyed')).toEqual([]);
  });

  it('computes the LED current through the resistor', () => {
    const { b, uno, bb, led } = blinkCircuit();
    b.wire(bb, 'c10', uno, 'GND.1');
    const h = simulate(b, { [uno.id]: fixture('blink.hex') });
    h.run(0.05); // LED is on for the first 100 ms
    const frame = h.frames[h.frames.length - 1];
    const vA = frame.voltages[h.netOf({ componentId: led.id, pinId: 'A' })!];
    const v13 = frame.voltages[h.netOf({ componentId: uno.id, pinId: '13' })!];
    const i = (v13 - vA) / 220;
    expect(i * 1000).toBeGreaterThan(11);
    expect(i * 1000).toBeLessThan(14);
  });

  it('reports a missing series resistor as over-current', () => {
    const { b, uno, led } = blinkCircuit(false);
    const h = simulate(b, { [uno.id]: fixture('blink.hex') });
    h.run(0.05);
    const codes = h.diagnostics().map((d) => d.code);
    expect(codes).toContain('led-destroyed');
    expect(codes).toContain('pin-overcurrent');
    expect(h.lastVisual(led.id)?.value).toBe(true);
  });
});

describe('Push button with INPUT_PULLUP', () => {
  it('reads the button through the breadboard and lights the LED', () => {
    const { b, uno, bb, led } = blinkCircuit();
    b.wire(bb, 'c10', uno, 'GND.1');
    const btn = b.add('evlab.pushbutton');
    // Button across the channel: 1.l at e20 -> 1.r lands 7 rows below (j20? no: x offset), so wire it explicitly.
    b.wire(uno, '2', btn, '1.l');
    b.wire(btn, '2.l', uno, 'GND.2');
    const h = simulate(b, { [uno.id]: fixture('button_led.hex') });
    h.run(0.05);
    expect(h.lastVisual(led.id)?.value).toBe(false);
    h.engine.input(btn.id, 'pressed', true);
    h.run(0.05);
    expect(h.lastVisual(led.id)?.value).toBe(true);
    h.engine.input(btn.id, 'pressed', false);
    h.run(0.05);
    expect(h.lastVisual(led.id)?.value).toBe(false);
    expect(h.serial()).toContain('DOWN');
    expect(h.serial()).toContain('UP');
    expect(h.diagnostics().map((d) => d.code)).not.toContain('floating-input');
  });

  it('warns about a floating input without pull-up', () => {
    const b = new CircuitBuilder();
    const uno = b.add('evlab.arduino-uno');
    const btn = b.add('evlab.pushbutton', 400, 0);
    b.wire(uno, '2', btn, '1.l');
    b.wire(btn, '2.l', uno, 'GND.1');
    // blink.hex never configures pin 2, so it stays a plain INPUT
    const h = simulate(b, { [uno.id]: fixture('blink.hex') });
    h.run(0.02);
    expect(h.diagnostics().map((d) => d.code)).toContain('floating-input');
  });
});

describe('Potentiometer → ADC → PWM', () => {
  it('reads the wiper voltage with analogRead and dims the LED with analogWrite', () => {
    const b = new CircuitBuilder();
    const uno = b.add('evlab.arduino-uno');
    const pot = b.add('evlab.potentiometer', 400, 0, { position: 0.25 });
    const led = b.add('evlab.led', 400, 200);
    const r = b.add('evlab.resistor', 500, 200, { resistance: '220' });
    b.wire(pot, 'GND', uno, 'GND.1');
    b.wire(pot, 'VCC', uno, '5V');
    b.wire(pot, 'SIG', uno, 'A0');
    b.wire(uno, '9', r, '1');
    b.wire(r, '2', led, 'A');
    b.wire(led, 'C', uno, 'GND.2');
    const h = simulate(b, { [uno.id]: fixture('pot_pwm.hex') });
    h.run(0.2);
    const readings = h.serial().trim().split(/\r?\n/).map(Number).filter((n) => !Number.isNaN(n));
    expect(readings.length).toBeGreaterThan(3);
    const last = readings[readings.length - 1];
    expect(last).toBeGreaterThan(240);
    expect(last).toBeLessThan(270);
    const dim = h.lastVisual(led.id)?.brightness as number;
    h.engine.input(pot.id, 'position', 1);
    h.run(0.2);
    const bright = h.lastVisual(led.id)?.brightness as number;
    const readings2 = h.serial().trim().split(/\r?\n/).map(Number);
    expect(readings2[readings2.length - 1]).toBeGreaterThan(1015);
    expect(bright).toBeGreaterThan(dim * 2);
    expect(dim).toBeGreaterThan(0.1);
  });
});
