/**
 * Device models driven by real firmware and real Arduino libraries
 * (DHT sensor library, Servo, LiquidCrystal, LiquidCrystal_I2C, SPI).
 */
import { describe, expect, it } from 'vitest';
import { CircuitBuilder, fixture, simulate } from './helpers';

const text = (chars: unknown, cols: number, row: number) => {
  const a = Array.from(chars as Uint8Array);
  return String.fromCharCode(...a.slice(row * cols, row * cols + cols)).trimEnd();
};

describe('HC-SR04', () => {
  it('measures the configured distance with pulseIn()', () => {
    const b = new CircuitBuilder();
    const uno = b.add('evlab.arduino-uno');
    const us = b.add('evlab.hc-sr04', 400, 0, { distance: 50 });
    b.wire(us, 'VCC', uno, '5V');
    b.wire(us, 'GND', uno, 'GND.1');
    b.wire(us, 'TRIG', uno, '9');
    b.wire(us, 'ECHO', uno, '10');
    const h = simulate(b, { [uno.id]: fixture('dev_hcsr04.hex') });
    h.run(0.2);
    const vals = [...h.serial().matchAll(/cm=([\d.]+)/g)].map((m) => Number(m[1]));
    expect(vals.length).toBeGreaterThan(1);
    expect(vals[vals.length - 1]).toBeGreaterThan(48);
    expect(vals[vals.length - 1]).toBeLessThan(53);
    h.engine.setProp(us.id, 'distance', 200);
    h.run(0.2);
    const vals2 = [...h.serial().matchAll(/cm=([\d.]+)/g)].map((m) => Number(m[1]));
    expect(vals2[vals2.length - 1]).toBeGreaterThan(195);
    expect(vals2[vals2.length - 1]).toBeLessThan(206);
  });
});

describe('DHT22', () => {
  it('is read by the Adafruit DHT library', () => {
    const b = new CircuitBuilder();
    const uno = b.add('evlab.arduino-uno');
    const dht = b.add('evlab.dht22', 400, 0, { temperature: 23.4, humidity: 56.7 });
    b.wire(dht, 'VCC', uno, '5V');
    b.wire(dht, 'GND', uno, 'GND.1');
    b.wire(dht, 'SDA', uno, '2');
    const pull = b.add('evlab.resistor', 400, 200, { resistance: '10k' });
    b.wire(pull, '1', uno, '5V');
    b.wire(pull, '2', uno, '2');
    const h = simulate(b, { [uno.id]: fixture('dev_dht22.hex') });
    h.run(2.4);
    expect(h.serial()).toContain('T=23.4 H=56.7');
  });
});

describe('Servo', () => {
  it('follows Servo.write() angles from the Servo library', () => {
    const b = new CircuitBuilder();
    const uno = b.add('evlab.arduino-uno');
    const servo = b.add('evlab.servo', 400, 0);
    b.wire(servo, 'V+', uno, '5V');
    b.wire(servo, 'GND', uno, 'GND.1');
    b.wire(servo, 'PWM', uno, '9');
    const h = simulate(b, { [uno.id]: fixture('dev_servo.hex') });
    h.run(0.5);
    expect(Math.abs((h.lastVisual(servo.id)?.angle as number) - 30)).toBeLessThan(2);
    h.run(0.8);
    expect(Math.abs((h.lastVisual(servo.id)?.angle as number) - 150)).toBeLessThan(2);
  });
});

describe('HD44780 LCD', () => {
  it('shows text written by LiquidCrystal (4-bit parallel)', () => {
    const b = new CircuitBuilder();
    const uno = b.add('evlab.arduino-uno');
    const lcd = b.add('evlab.lcd1602', 0, -200);
    b.wire(lcd, 'VSS', uno, 'GND.1');
    b.wire(lcd, 'VDD', uno, '5V');
    b.wire(lcd, 'RW', uno, 'GND.2');
    b.wire(lcd, 'A', uno, '5V');
    b.wire(lcd, 'K', uno, 'GND.3');
    for (const [l, u] of [['RS', '12'], ['E', '11'], ['D4', '5'], ['D5', '4'], ['D6', '3'], ['D7', '2']]) b.wire(lcd, l, uno, u);
    const h = simulate(b, { [uno.id]: fixture('dev_lcd.hex') });
    h.run(0.3);
    const v = h.lastVisual(lcd.id)!;
    expect(text(v.characters, 16, 0)).toBe('Hello, Lab!');
    expect(text(v.characters, 16, 1)).toBe('Line 2 ok');
    expect(v.backlight).toBe(true);
  });

  it('shows text written by LiquidCrystal_I2C over the TWI bus', () => {
    const b = new CircuitBuilder();
    const uno = b.add('evlab.arduino-uno');
    const lcd = b.add('evlab.lcd1602-i2c', 0, -200);
    b.wire(lcd, 'GND', uno, 'GND.1');
    b.wire(lcd, 'VCC', uno, '5V');
    b.wire(lcd, 'SDA', uno, 'A4');
    b.wire(lcd, 'SCL', uno, 'A5');
    const h = simulate(b, { [uno.id]: fixture('dev_lcdi2c.hex') });
    h.run(1.4); // LiquidCrystal_I2C::begin() waits 1 s before initialising
    const v = h.lastVisual(lcd.id)!;
    expect(text(v.characters, 16, 0)).toBe('I2C works');
    expect(text(v.characters, 16, 1)).toBe('  0x27');
    expect(v.backlight).toBe(true);
  });

  it('does not respond when SDA/SCL are not wired to the I2C pins', () => {
    const b = new CircuitBuilder();
    const uno = b.add('evlab.arduino-uno');
    const lcd = b.add('evlab.lcd1602-i2c', 0, -200);
    b.wire(lcd, 'GND', uno, 'GND.1');
    b.wire(lcd, 'VCC', uno, '5V');
    b.wire(lcd, 'SDA', uno, '2');
    b.wire(lcd, 'SCL', uno, '3');
    const h = simulate(b, { [uno.id]: fixture('dev_lcdi2c.hex') });
    h.run(1.4);
    expect(text(h.lastVisual(lcd.id)!.characters, 16, 0)).toBe('');
  });
});

describe('74HC595 shift register', () => {
  const build = () => {
    const b = new CircuitBuilder();
    const uno = b.add('evlab.arduino-uno');
    const sr = b.add('evlab.74hc595', 400, 0);
    b.wire(sr, 'VCC', uno, '5V');
    b.wire(sr, 'SRCLR', uno, '5V');
    b.wire(sr, 'GND', uno, 'GND.1');
    b.wire(sr, 'OE', uno, 'GND.2');
    return { b, uno, sr };
  };
  const outputs = (h: ReturnType<typeof simulate>, srId: string) => {
    const f = h.frames[h.frames.length - 1];
    return ['QA', 'QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH'].map((q) => (f.voltages[h.netOf({ componentId: srId, pinId: q })!] > 2.5 ? 1 : 0)).join('');
  };

  it('latches bits from shiftOut() (bit-banged GPIO)', () => {
    const { b, uno, sr } = build();
    b.wire(sr, 'SER', uno, '8');
    b.wire(sr, 'SRCLK', uno, '12');
    b.wire(sr, 'RCLK', uno, '11');
    // Load each output so its net is part of the solved circuit.
    const h = simulate(b, { [uno.id]: fixture('dev_shift.hex') });
    h.run(0.05);
    // 0b10100101 MSB first -> QH..QA = 1,0,1,0,0,1,0,1 -> QA..QH = 1,0,1,0,0,1,0,1
    expect(outputs(h, sr.id)).toBe('10100101');
  });

  it('acts as an SPI peripheral on the hardware SPI pins', () => {
    const { b, uno, sr } = build();
    b.wire(sr, 'SER', uno, '11');
    b.wire(sr, 'SRCLK', uno, '13');
    b.wire(sr, 'RCLK', uno, '10');
    const h = simulate(b, { [uno.id]: fixture('dev_spi595.hex') });
    h.run(0.05);
    expect(outputs(h, sr.id)).toBe('11000011');
  });
});

describe('Logic gates (no MCU)', () => {
  it('74HC08 AND gate driven by switches from a bench supply', () => {
    const b = new CircuitBuilder();
    const psu = b.add('evlab.bench-supply', 0, 0, { voltage: 5 });
    const gate = b.add('evlab.74hc08', 200, 0);
    const led = b.add('evlab.led', 300, 100);
    const r = b.add('evlab.resistor', 300, 200, { resistance: '330' });
    b.wire(gate, 'VCC', psu, '+');
    b.wire(gate, 'GND', psu, '-');
    b.wire(gate, '1A', psu, '+');
    b.wire(gate, '1B', psu, '+');
    b.wire(gate, '1Y', r, '1');
    b.wire(r, '2', led, 'A');
    b.wire(led, 'C', psu, '-');
    const h = simulate(b, {});
    h.run(0.01);
    expect(h.lastVisual(led.id)?.value).toBe(true);
  });
});
