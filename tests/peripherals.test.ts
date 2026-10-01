/**
 * New device models driven by real firmware built from tests/fixtures with
 * the real Arduino libraries: Keypad, a polled KY-040, Adafruit_SSD1306,
 * Adafruit_MPU6050, RTClib, IRremote, Adafruit_NeoPixel, Stepper, plus
 * A4988 / L298N driver chains.
 */
import { describe, expect, it } from 'vitest';
import { CircuitBuilder, fixture, simulate, type Harness } from './helpers';

const lines = (h: Harness) => h.serial().split(/\r?\n/).filter(Boolean);

function uno(b: CircuitBuilder) {
  return b.add('evlab.arduino-uno');
}

describe('4×4 membrane keypad', () => {
  it('is scanned by the Keypad library', () => {
    const b = new CircuitBuilder();
    const u = uno(b);
    const kp = b.add('evlab.keypad-4x4', 400, 0);
    ['R1', 'R2', 'R3', 'R4'].forEach((p, i) => b.wire(kp, p, u, String(9 - i)));
    ['C1', 'C2', 'C3', 'C4'].forEach((p, i) => b.wire(kp, p, u, String(5 - i)));
    const h = simulate(b, { [u.id]: fixture('dev_keypad.hex') });
    h.run(0.05);
    for (const key of ['5', 'D', '*']) {
      h.engine.input(kp.id, `key:${key}`, true);
      h.run(0.06);
      expect(h.lastVisual(kp.id)?._pressed).toEqual([key]);
      h.engine.input(kp.id, `key:${key}`, false);
      h.run(0.06);
    }
    expect(lines(h)).toEqual(['ready', 'key=5', 'key=D', 'key=*']);
  });
});

describe('KY-040 rotary encoder', () => {
  it('produces quadrature the firmware decodes in both directions, and a click', () => {
    const b = new CircuitBuilder();
    const u = uno(b);
    const enc = b.add('evlab.ky040', 400, 0);
    b.wire(enc, 'VCC', u, '5V');
    b.wire(enc, 'GND', u, 'GND.1');
    b.wire(enc, 'CLK', u, '2');
    b.wire(enc, 'DT', u, '3');
    b.wire(enc, 'SW', u, '4');
    const h = simulate(b, { [u.id]: fixture('dev_encoder.hex') });
    h.run(0.02);
    h.engine.input(enc.id, 'rotate', 3);
    h.run(0.05);
    h.engine.input(enc.id, 'rotate', -1);
    h.run(0.02);
    h.engine.input(enc.id, 'pressed', true);
    h.run(0.01);
    h.engine.input(enc.id, 'pressed', false);
    h.run(0.01);
    expect(lines(h)).toEqual(['ready', 'pos=1', 'pos=2', 'pos=3', 'pos=2', 'click']);
    expect(h.lastVisual(enc.id)?.angle).toBe(36);
  });
});

describe('SSD1306 OLED', () => {
  it('shows what Adafruit_SSD1306 draws', () => {
    const b = new CircuitBuilder();
    const u = uno(b);
    const oled = b.add('evlab.ssd1306', 400, 0);
    b.wire(oled, 'VIN', u, '5V');
    b.wire(oled, 'GND', u, 'GND.1');
    b.wire(oled, 'DATA', u, 'A4');
    b.wire(oled, 'CLK', u, 'A5');
    const h = simulate(b, { [u.id]: fixture('dev_oled.hex') });
    h.run(0.6);
    expect(h.serial()).toContain('drawn');
    const img = h.frames
      .map((f) => f.visuals[oled.id]?.$imageData as Uint8ClampedArray | undefined)
      .filter(Boolean)
      .pop()!;
    expect(img).toBeDefined();
    const lit = (x: number, y: number) => img[(y * 128 + x) * 4] > 128;
    expect(lit(0, 0)).toBe(true);
    expect(lit(9, 9)).toBe(true);
    expect(lit(10, 10)).toBe(false);
    expect(lit(127, 63)).toBe(true);
    expect(lit(64, 50)).toBe(false);
    // Text "Hi" at (20, 30): some pixels of the 5×7 glyphs are lit.
    let text = 0;
    for (let y = 30; y < 38; y++) for (let x = 20; x < 32; x++) text += lit(x, y) ? 1 : 0;
    expect(text).toBeGreaterThan(8);
  });

  it('stays dark and reports missing power when VIN is not connected', () => {
    const b = new CircuitBuilder();
    const u = uno(b);
    const oled = b.add('evlab.ssd1306', 400, 0);
    b.wire(oled, 'DATA', u, 'A4');
    b.wire(oled, 'CLK', u, 'A5');
    const h = simulate(b, { [u.id]: fixture('dev_oled.hex') });
    h.run(0.6);
    expect(h.serial()).toContain('drawn'); // the library does not check for an ACK
    const img = h.frames.map((f) => f.visuals[oled.id]?.$imageData as Uint8ClampedArray | undefined).filter(Boolean).pop();
    expect(img ? img.some((v, i) => i % 4 === 0 && v > 128) : false).toBe(false);
    expect(h.diagnostics().some((d) => d.code === 'unpowered')).toBe(true);
  });
});

describe('MPU-6050', () => {
  function rig(props: Record<string, number>) {
    const b = new CircuitBuilder();
    const u = uno(b);
    const imu = b.add('evlab.mpu6050', 400, 0, props);
    b.wire(imu, 'VCC', u, '5V');
    b.wire(imu, 'GND', u, 'GND.1');
    b.wire(imu, 'SDA', u, 'A4');
    b.wire(imu, 'SCL', u, 'A5');
    return { h: simulate(b, { [u.id]: fixture('dev_mpu6050.hex') }), imu };
  }
  const last = (h: Harness) => {
    const m = [...h.serial().matchAll(/ax=(-?[\d.]+) ay=(-?[\d.]+) az=(-?[\d.]+) gz=(-?[\d.]+) t=(-?[\d.]+)/g)].pop()!;
    return m.slice(1).map(Number);
  };

  it('reads gravity on Z when level, plus die temperature', () => {
    const { h } = rig({ temperature: 31.5 });
    h.run(0.6);
    expect(h.serial()).toContain('mpu ok');
    const [ax, ay, az, , t] = last(h);
    expect(Math.abs(ax)).toBeLessThan(0.1);
    expect(Math.abs(ay)).toBeLessThan(0.1);
    expect(az).toBeCloseTo(9.81, 1);
    expect(t).toBeCloseTo(31.5, 0);
  });

  it('follows tilt and rotation-rate changes live', () => {
    const { h, imu } = rig({});
    h.run(0.5);
    h.engine.setProp(imu.id, 'roll', 90);
    h.engine.setProp(imu.id, 'gz', 45);
    h.run(0.2);
    const [ax, ay, az, gz] = last(h);
    expect(Math.abs(ax)).toBeLessThan(0.1);
    expect(ay).toBeCloseTo(9.81, 1);
    expect(Math.abs(az)).toBeLessThan(0.1);
    expect(gz).toBeCloseTo((45 * Math.PI) / 180, 1); // rad/s
  });
});

describe('DS1307 RTC', () => {
  it('keeps time set by RTClib, advancing with simulation time, and stores RAM', () => {
    const b = new CircuitBuilder();
    const u = uno(b);
    const rtc = b.add('evlab.ds1307', 400, 0);
    b.wire(rtc, '5V', u, '5V');
    b.wire(rtc, 'GND', u, 'GND.1');
    b.wire(rtc, 'SDA', u, 'A4');
    b.wire(rtc, 'SCL', u, 'A5');
    const h = simulate(b, { [u.id]: fixture('dev_rtc.hex') });
    h.run(3.2);
    const out = lines(h);
    expect(out[0]).toBe('ram=42');
    expect(out[1]).toBe('2025-12-31 23:59:58');
    expect(out[2]).toBe('2025-12-31 23:59:59');
    expect(out[3]).toBe('2026-01-01 00:00:00'); // rolls over the year
    expect(h.lastVisual(rtc.id)?._time).toMatch(/^2026-01-01 00:00:0\d$/);
  });
});

describe('IR remote and receiver', () => {
  it('delivers NEC frames and repeat codes that IRremote decodes', () => {
    const b = new CircuitBuilder();
    const u = uno(b);
    const rx = b.add('evlab.ir-receiver', 400, 0);
    const remote = b.add('evlab.ir-remote', 600, 0);
    b.wire(rx, 'VCC', u, '5V');
    b.wire(rx, 'GND', u, 'GND.1');
    b.wire(rx, 'DAT', u, '2');
    const h = simulate(b, { [u.id]: fixture('dev_ir.hex') });
    // IRremote treats a frame that follows another within ~108 ms as a repeat,
    // so leave the line idle first (as between real button presses).
    h.run(0.3);
    h.engine.input(remote.id, 'key:power', true);
    h.run(0.2); // frame + one repeat code
    h.engine.input(remote.id, 'key:power', false);
    h.run(0.4);
    h.engine.input(remote.id, 'key:5', true);
    h.engine.input(remote.id, 'key:5', false);
    h.run(0.2);
    const out = lines(h);
    expect(out).toEqual(['ready', 'cmd=A2', 'repeat', 'cmd=38']);
    expect(Number(h.lastVisual(rx.id)?._frames)).toBeGreaterThanOrEqual(3);
  });
});

describe('NeoPixel ring', () => {
  it('decodes Adafruit_NeoPixel bit timing into pixel colours', () => {
    const b = new CircuitBuilder();
    const u = uno(b);
    const ring = b.add('evlab.neopixel-ring', 400, 0);
    b.wire(ring, 'VCC', u, '5V');
    b.wire(ring, 'GND', u, 'GND.1');
    b.wire(ring, 'DIN', u, '6');
    const h = simulate(b, { [u.id]: fixture('dev_neopixel.hex') });
    h.run(0.05);
    expect(h.serial()).toContain('shown');
    const px = h.lastVisual(ring.id)?.$pixels as { r: number; g: number; b: number }[];
    expect(px).toHaveLength(16);
    expect(px[0]).toEqual({ r: 1, g: 0, b: 0 });
    expect(px[1]).toEqual({ r: 0, g: 1, b: 0 });
    expect(px[15]).toEqual({ r: 0, g: 0, b: 1 });
    for (let i = 2; i < 15; i++) expect(px[i]).toEqual({ r: 0, g: 0, b: 0 });
  });
});

describe('steppers', () => {
  it('A4988 STEP/DIR pulses turn a NEMA 17 by 1.8° per full step', () => {
    const b = new CircuitBuilder();
    const u = uno(b);
    const psu = b.add('evlab.bench-supply', 0, 400, { voltage: 12 });
    const drv = b.add('evlab.a4988', 300, 300);
    const motor = b.add('evlab.stepper', 500, 300);
    b.wire(drv, 'VDD', u, '5V');
    b.wire(drv, 'GND', u, 'GND.1');
    b.wire(drv, 'VMOT', psu, '+');
    b.wire(drv, 'GND.2', psu, '-');
    b.wire(drv, 'STEP', u, '3');
    b.wire(drv, 'DIR', u, '4');
    b.wire(drv, '1A', motor, 'A+');
    b.wire(drv, '1B', motor, 'A-');
    b.wire(drv, '2A', motor, 'B+');
    b.wire(drv, '2B', motor, 'B-');
    const h = simulate(b, { [u.id]: fixture('dev_a4988.hex') });
    h.run(0.25); // 100 steps of 1 ms, then a 300 ms pause
    expect(h.serial()).toContain('fwd');
    expect(h.lastVisual(motor.id)?._steps).toBe(100);
    expect(Number(h.lastVisual(motor.id)?._angle)).toBeCloseTo(180, 0);
    h.run(0.3);
    expect(h.serial()).toContain('back');
    expect(h.lastVisual(motor.id)?._steps).toBe(50);
  });

  it('the Stepper library turns a 28BYJ-48 a quarter turn', () => {
    const b = new CircuitBuilder();
    const u = uno(b);
    const m = b.add('evlab.28byj48', 400, 0);
    b.wire(m, '+', u, '5V');
    b.wire(m, '-', u, 'GND.1');
    b.wire(m, 'IN1', u, '8');
    b.wire(m, 'IN2', u, '9');
    b.wire(m, 'IN3', u, '10');
    b.wire(m, 'IN4', u, '11');
    const h = simulate(b, { [u.id]: fixture('dev_28byj48.hex') });
    h.run(2.3); // 512 steps at 15 rpm ≈ 2 s
    expect(h.serial()).toContain('done');
    expect(Math.abs(Number(h.lastVisual(m.id)?._angle))).toBeCloseTo(90, 0);
  });
});

describe('L298N + DC motor', () => {
  it('PWM sets the speed and IN1/IN2 the direction', () => {
    const b = new CircuitBuilder();
    const u = uno(b);
    const psu = b.add('evlab.bench-supply', 0, 400, { voltage: 12 });
    const drv = b.add('evlab.l298n', 300, 300);
    const motor = b.add('evlab.dc-motor', 500, 300);
    b.wire(drv, '12V', psu, '+');
    b.wire(drv, 'GND', psu, '-');
    b.wire(drv, 'GND', u, 'GND.1');
    b.wire(drv, 'ENA', u, '9');
    b.wire(drv, 'IN1', u, '7');
    b.wire(drv, 'IN2', u, '8');
    b.wire(drv, 'OUT1', motor, '+');
    b.wire(drv, 'OUT2', motor, '-');
    const h = simulate(b, { [u.id]: fixture('dev_l298n.hex') });
    h.run(0.9);
    const half = Number(h.lastVisual(motor.id)?._rpm);
    // 12 V × 10/(10 + 2·1 Ω) = 10 V on the motor × 50 % duty × 30 rpm/V ≈ 150 rpm
    expect(half).toBeGreaterThan(130);
    expect(half).toBeLessThan(170);
    h.run(1.0);
    const reverse = Number(h.lastVisual(motor.id)?._rpm);
    expect(reverse).toBeLessThan(-280);
    expect(reverse).toBeGreaterThan(-320);
    // The module's regulator supplies its 5 V pin from the 12 V input, and the
    // motor current (12 V over 1 + 10 + 1 Ω ≈ 1 A) is drawn from the bench supply.
    expect(h.frames[h.frames.length - 1].voltages[h.netOf({ componentId: drv.id, pinId: '5V' })!]).toBeCloseTo(5, 0);
    expect(Number(h.lastVisual(psu.id)?._amps)).toBeGreaterThan(0.9);
  });
});
