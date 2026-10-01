/**
 * Interactive simulation: every built-in control/indicator definition is
 * valid, and the model inputs the on-canvas controls send behave like the
 * real parts (spring-back stick, clap burst, board reset button…).
 */
import { describe, expect, it } from 'vitest';
import { builtinPackage } from '../src/components/builtin';
import { validateDefinition } from '../src/core/registry/validate';
import { CircuitBuilder, fixture, registry, simulate } from './helpers';

describe('control definitions', () => {
  it('every built-in part validates (controls and indicators reference real properties)', () => {
    const problems = builtinPackage.components.flatMap((d) => validateDefinition(d).map((e) => `${d.type}: ${e}`));
    expect(problems).toEqual([]);
    expect(registry.problems).toEqual([]);
  });

  it('interactive sensors declare on-canvas controls', () => {
    for (const type of ['evlab.hc-sr04', 'evlab.dht22', 'evlab.photoresistor', 'evlab.ntc-thermistor', 'evlab.mq2', 'evlab.pir', 'evlab.joystick', 'evlab.dip-switch-8', 'evlab.arduino-uno', 'evlab.signal-generator']) {
      expect(registry.get(type)?.controls?.length, type).toBeGreaterThan(0);
    }
  });

  it('rejects controls that reference unknown properties', () => {
    const def = { ...registry.require('evlab.photoresistor'), type: 'x.bad', controls: [{ kind: 'slider' as const, prop: 'nope' }] };
    expect(validateDefinition(def).join()).toMatch(/unknown property "nope"/);
    const def2 = { ...registry.require('evlab.photoresistor'), type: 'x.bad2', indicators: [{ kind: 'glow' as const, value: 'prop:missing', at: { x: 0, y: 0 }, radius: 4, color: '#fff' }] };
    expect(validateDefinition(def2).join()).toMatch(/unknown property "missing"/);
  });
});

describe('model inputs from on-canvas controls', () => {
  it('a dragged joystick moves the wiper and springs back on release', () => {
    const b = new CircuitBuilder();
    const bat = b.add('evlab.battery-9v', 0, 0, { voltage: 5 });
    const js = b.add('evlab.joystick', 200, 0);
    b.wire(js, 'VCC', bat, '+');
    b.wire(js, 'GND', bat, '-');
    const h = simulate(b, {});
    h.run(0.001);
    const v = () => h.frames[h.frames.length - 1].voltages[h.netOf({ componentId: js.id, pinId: 'VERT' })!];
    expect(v()).toBeCloseTo(2.5, 1);
    h.engine.input(js.id, 'y', 1); // stick pushed fully up
    h.run(0.001);
    expect(v()).toBeGreaterThan(4.9);
    expect(h.lastVisual(js.id)?.yValue).toBeCloseTo(1);
    h.engine.input(js.id, 'release', true);
    h.run(0.001);
    expect(v()).toBeCloseTo(2.5, 1);
  });

  it('a clap at the sound sensor produces a short loud burst', () => {
    const b = new CircuitBuilder();
    const bat = b.add('evlab.battery-9v', 0, 0, { voltage: 5 });
    const mic = b.add('evlab.sound-sensor', 200, 0, { level: 0.1, threshold: 0.5 });
    b.wire(mic, 'VCC', bat, '+');
    b.wire(mic, 'GND', bat, '-');
    const h = simulate(b, {});
    h.run(0.01);
    const ao = () => h.frames[h.frames.length - 1].voltages[h.netOf({ componentId: mic.id, pinId: 'AOUT' })!];
    expect(ao()).toBeLessThan(1);
    h.engine.input(mic.id, 'burst', true);
    h.run(0.05);
    expect(ao()).toBeGreaterThan(4);
    expect(h.lastVisual(mic.id)?._triggered).toBe(true);
    h.run(0.2);
    expect(ao()).toBeLessThan(1);
  });

  it('the on-board RESET button restarts the sketch when released', () => {
    const b = new CircuitBuilder();
    const uno = b.add('evlab.arduino-uno');
    const h = simulate(b, { [uno.id]: fixture('boot_banner.hex') });
    h.run(0.3);
    const before = h.serial().split('boot').length - 1;
    expect(before).toBe(1);
    h.engine.input(uno.id, 'reset', true);
    h.engine.input(uno.id, 'reset', false);
    h.run(0.3);
    expect(h.serial().split('boot').length - 1).toBe(before + 1);
  });

  it('HC-SR04 counts measurements for the echo animation', () => {
    const b = new CircuitBuilder();
    const uno = b.add('evlab.arduino-uno');
    const us = b.add('evlab.hc-sr04', 400, 0, { distance: 50 });
    b.wire(us, 'VCC', uno, '5V');
    b.wire(us, 'GND', uno, 'GND.1');
    b.wire(us, 'TRIG', uno, '9');
    b.wire(us, 'ECHO', uno, '10');
    const h = simulate(b, { [uno.id]: fixture('dev_hcsr04.hex') });
    h.run(0.2);
    expect(Number(h.lastVisual(us.id)?._pings)).toBeGreaterThan(1);
  });

  it('a tilted tilt switch drives OUT high and tilts the part', () => {
    const b = new CircuitBuilder();
    const bat = b.add('evlab.battery-9v', 0, 0, { voltage: 5 });
    const tilt = b.add('evlab.tilt-switch', 200, 0);
    b.wire(tilt, 'VCC', bat, '+');
    b.wire(tilt, 'GND', bat, '-');
    const h = simulate(b, {});
    h.run(0.001);
    expect(h.lastVisual(tilt.id)?._active).toBe(false);
    h.engine.input(tilt.id, 'toggle', true);
    h.run(0.001);
    expect(h.lastVisual(tilt.id)?._active).toBe(true);
    expect(h.lastVisual(tilt.id)?.$rotate).not.toBe(0);
    expect(h.frames[h.frames.length - 1].voltages[h.netOf({ componentId: tilt.id, pinId: 'OUT' })!]).toBeGreaterThan(4);
  });
});
