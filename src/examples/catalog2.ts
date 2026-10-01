/** Examples for sensors, displays, buses and actuators. */
import type { ComponentInstance, Point } from '../core/model/circuit';
import type { ComponentRegistry } from '../core/registry/registry';
import { newProject, type Project } from '../core/project/schema';
import { CircuitBuilder, WIRE } from './builder';
import type { ExampleInfo } from './catalog';

function project(name: string, description: string, sketch: string, b: CircuitBuilder, extra?: (p: Project) => void): Project {
  const p = newProject(name);
  p.meta.description = description;
  p.firmware.files = [{ name: 'sketch.ino', content: sketch }];
  p.circuit = b.doc;
  extra?.(p);
  return p;
}

/** Waypoints: leave the pin vertically to `laneY`, run horizontally, drop into the target. */
const lane = (from: Point, to: Point, y: number): Point[] => [
  { x: from.x, y },
  { x: to.x, y },
];

/** Route from the Uno 5V pin (bottom header) around the right side of the board. */
function fiveVolt(b: CircuitBuilder, uno: ComponentInstance, part: ComponentInstance, pin: string, x = 300, color = WIRE.red) {
  const p = b.pin(part, pin);
  b.wire(uno, '5V', part, pin, color, [
    { x: 160, y: 230.4 },
    { x, y: 230.4 },
    { x, y: p.y },
  ]);
}

function base(r: ComponentRegistry) {
  const b = new CircuitBuilder(r);
  const uno = b.add('evlab.arduino-uno', 0, 0);
  return { b, uno };
}

export const EXAMPLES_2: ExampleInfo[] = [
  {
    id: 'ultrasonic',
    title: 'Ultrasonic Distance (HC-SR04)',
    summary: 'Measure distance with an HC-SR04 using pulseIn(). An LED warns when an obstacle is closer than 20 cm. Change the distance in the Inspector.',
    tags: ['sensor', 'HC-SR04', 'pulseIn', 'timing'],
    build: (r) => {
      const { b, uno } = base(r);
      const us = b.add('evlab.hc-sr04', 20, -190, { distance: 80 });
      const led = b.add('evlab.led', 300, -120, { color: 'red' });
      const res = b.add('evlab.resistor', 300, -50, { resistance: '220' });
      b.wire(us, 'TRIG', uno, '9', WIRE.yellow, lane(b.pin(us, 'TRIG'), b.pin(uno, '9'), -40));
      b.wire(us, 'ECHO', uno, '10', WIRE.blue, lane(b.pin(us, 'ECHO'), b.pin(uno, '10'), -30));
      b.wire(us, 'GND', uno, 'GND.1', WIRE.black, lane(b.pin(us, 'GND'), b.pin(uno, 'GND.1'), -50));
      fiveVolt(b, uno, us, 'VCC', -40);
      b.wire(uno, '13', res, '1', WIRE.green, lane(b.pin(uno, '13'), b.pin(res, '1'), -20));
      b.wire(res, '2', led, 'A', WIRE.green);
      b.wire(led, 'C', uno, 'GND.1', WIRE.black, lane(b.pin(led, 'C'), b.pin(uno, 'GND.1'), -60));
      return project(
        'Ultrasonic Distance',
        'HC-SR04 distance measurement with a proximity LED.',
        `// HC-SR04 ultrasonic sensor: TRIG -> pin 9, ECHO -> pin 10.
// Sound travels ~58 microseconds per centimetre (there and back).

const int TRIG = 9;
const int ECHO = 10;
const int LED_PIN = 13;

void setup() {
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);   // 10 us trigger pulse
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);

  unsigned long duration = pulseIn(ECHO, HIGH, 30000UL);
  float cm = duration / 58.0;

  digitalWrite(LED_PIN, cm > 0 && cm < 20 ? HIGH : LOW);
  Serial.print("distance_cm:");
  Serial.println(cm, 1);
  delay(100);
}
`,
        b,
      );
    },
  },
  {
    id: 'dht22',
    title: 'DHT22 Weather Station',
    summary: 'Read temperature and humidity from a DHT22 with the Adafruit DHT library and stream them to the Serial Plotter.',
    tags: ['sensor', 'DHT22', 'library', 'single-wire'],
    build: (r) => {
      const { b, uno } = base(r);
      const dht = b.add('evlab.dht22', 190, -200, { temperature: 22.5, humidity: 48 });
      const pull = b.add('evlab.resistor', 0, 0, { resistance: '10k' }, 90);
      const sda = b.pin(dht, 'SDA');
      const p2 = b.pin(pull, '2');
      pull.x += sda.x - 30 - p2.x;
      pull.y += sda.y + 30 - p2.y;
      b.wire(dht, 'SDA', uno, '2', WIRE.yellow);
      b.wire(pull, '2', dht, 'SDA', WIRE.yellow);
      b.wire(pull, '1', dht, 'VCC', WIRE.red);
      b.wire(dht, 'GND', uno, 'GND.1', WIRE.black, lane(b.pin(dht, 'GND'), b.pin(uno, 'GND.1'), -30));
      fiveVolt(b, uno, dht, 'VCC', 320);
      return project(
        'DHT22 Weather Station',
        'Temperature and humidity with the DHT library.',
        `// DHT22 temperature & humidity sensor on pin 2 (10k pull-up to 5V).
// Library: Adafruit "DHT sensor library" (installed automatically).

#include <DHT.h>

DHT dht(2, DHT22);

void setup() {
  Serial.begin(9600);
  dht.begin();
}

void loop() {
  delay(2000);  // the DHT22 updates at most every 2 seconds
  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();
  if (isnan(humidity) || isnan(temperature)) {
    Serial.println("Failed to read from DHT sensor!");
    return;
  }
  Serial.print("temperature:");
  Serial.print(temperature, 1);
  Serial.print(" humidity:");
  Serial.println(humidity, 1);
}
`,
        b,
      );
    },
  },
  {
    id: 'servo',
    title: 'Servo Control with a Knob',
    summary: 'Map a potentiometer to a servo angle with the Servo library. Turn the knob while the simulation runs.',
    tags: ['servo', 'PWM', 'library', 'actuator', 'analog input'],
    build: (r) => {
      const { b, uno } = base(r);
      const servo = b.add('evlab.servo', 330, -60);
      const pot = b.add('evlab.potentiometer', 340, 120, { position: 0.5 });
      b.wire(servo, 'PWM', uno, '9', WIRE.orange, [{ x: 310, y: b.pin(servo, 'PWM').y }, { x: 310, y: -30 }, { x: 163, y: -30 }]);
      b.wire(servo, 'GND', uno, 'GND.1', WIRE.black, [{ x: 300, y: b.pin(servo, 'GND').y }, { x: 300, y: -45 }, { x: 115.5, y: -45 }]);
      fiveVolt(b, uno, servo, 'V+', 290);
      b.wire(pot, 'SIG', uno, 'A0', WIRE.blue, [{ x: b.pin(pot, 'SIG').x, y: 220.8 }, { x: 208, y: 220.8 }]);
      b.wire(pot, 'VCC', uno, '5V', WIRE.red, [{ x: b.pin(pot, 'VCC').x, y: 240 }, { x: 160, y: 240 }]);
      b.wire(pot, 'GND', uno, 'GND.2', WIRE.black, [{ x: b.pin(pot, 'GND').x, y: 249.6 }, { x: 169.5, y: 249.6 }]);
      return project(
        'Servo Knob',
        'Potentiometer-controlled servo.',
        `// Servo knob: the potentiometer on A0 sets the servo angle on pin 9.
#include <Servo.h>

Servo servo;

void setup() {
  servo.attach(9);
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(A0);              // 0..1023
  int angle = map(raw, 0, 1023, 0, 180); // 0..180 degrees
  servo.write(angle);
  Serial.print("angle:");
  Serial.println(angle);
  delay(20);
}
`,
        b,
      );
    },
  },
  {
    id: 'lcd',
    title: 'LCD 16×2 Display',
    summary: 'Drive an HD44780 character LCD in 4-bit mode with the LiquidCrystal library: a greeting and a running uptime counter.',
    tags: ['display', 'LCD', 'HD44780', 'library', 'parallel'],
    build: (r) => {
      const { b, uno } = base(r);
      const lcd = b.add('evlab.lcd1602', -30, -250);
      const map: [string, string, string, number][] = [
        ['RS', '12', WIRE.orange, -70],
        ['E', '11', WIRE.yellow, -62],
        ['D4', '5', WIRE.green, -54],
        ['D5', '4', WIRE.blue, -46],
        ['D6', '3', WIRE.purple, -38],
        ['D7', '2', WIRE.white, -30],
      ];
      for (const [l, u, color, y] of map) b.wire(lcd, l, uno, u, color, lane(b.pin(lcd, l), b.pin(uno, u), y));
      for (const g of ['VSS', 'RW', 'K']) b.wire(lcd, g, uno, 'GND.1', WIRE.black, lane(b.pin(lcd, g), b.pin(uno, 'GND.1'), -86));
      for (const v of ['VDD', 'A']) {
        const p = b.pin(lcd, v);
        b.wire(uno, '5V', lcd, v, WIRE.red, [
          { x: 160, y: 230.4 },
          { x: -60, y: 230.4 },
          { x: -60, y: -78 },
          { x: p.x, y: -78 },
        ]);
      }
      return project(
        'LCD 16x2',
        'LiquidCrystal in 4-bit mode.',
        `// HD44780 16x2 LCD in 4-bit mode.
// RS=12, E=11, D4=5, D5=4, D6=3, D7=2. RW, VSS and K to GND; VDD and A to 5V.
// (Contrast is not simulated, so V0 can stay unconnected here.)
#include <LiquidCrystal.h>

LiquidCrystal lcd(12, 11, 5, 4, 3, 2);

byte heart[8] = { 0b00000, 0b01010, 0b11111, 0b11111, 0b01110, 0b00100, 0b00000, 0b00000 };

void setup() {
  lcd.begin(16, 2);
  lcd.createChar(0, heart);  // leaves the controller addressing CGRAM...
  lcd.setCursor(0, 0);       // ...so move back to display memory before printing
  lcd.print("Hello, Lab! ");
  lcd.write(byte(0));
}

void loop() {
  lcd.setCursor(0, 1);
  lcd.print("Uptime: ");
  lcd.print(millis() / 1000);
  lcd.print(" s   ");
  delay(200);
}
`,
        b,
      );
    },
  },
  {
    id: 'i2c-lcd',
    title: 'I²C LCD (TWI bus)',
    summary: 'An LCD with a PCF8574 backpack on the I²C bus (address 0x27) shows a potentiometer reading. Only two signal wires: SDA and SCL.',
    tags: ['I2C', 'TWI', 'communication', 'LCD', 'library'],
    build: (r) => {
      const { b, uno } = base(r);
      const lcd = b.add('evlab.lcd1602-i2c', -80, -230);
      const pot = b.add('evlab.potentiometer', 330, 100, { position: 0.3 });
      b.wire(lcd, 'SDA', uno, 'A4.2', WIRE.blue, [{ x: -100, y: b.pin(lcd, 'SDA').y }, { x: -100, y: -40 }, { x: 97, y: -40 }]);
      b.wire(lcd, 'SCL', uno, 'A5.2', WIRE.yellow, [{ x: -110, y: b.pin(lcd, 'SCL').y }, { x: -110, y: -30 }, { x: 87, y: -30 }]);
      b.wire(lcd, 'GND', uno, 'GND.1', WIRE.black, [{ x: -90, y: b.pin(lcd, 'GND').y }, { x: -90, y: -50 }, { x: 115.5, y: -50 }]);
      b.wire(uno, '5V', lcd, 'VCC', WIRE.red, [{ x: 160, y: 230.4 }, { x: -120, y: 230.4 }, { x: -120, y: b.pin(lcd, 'VCC').y }]);
      b.wire(pot, 'SIG', uno, 'A0', WIRE.green, [{ x: b.pin(pot, 'SIG').x, y: 220.8 }, { x: 208, y: 220.8 }]);
      b.wire(pot, 'VCC', uno, '5V', WIRE.red, [{ x: b.pin(pot, 'VCC').x, y: 240 }, { x: 160, y: 240 }]);
      b.wire(pot, 'GND', uno, 'GND.2', WIRE.black, [{ x: b.pin(pot, 'GND').x, y: 249.6 }, { x: 169.5, y: 249.6 }]);
      return project(
        'I2C LCD',
        'LiquidCrystal_I2C on the TWI bus.',
        `// I2C LCD (PCF8574 backpack, address 0x27). Uno: SDA = A4, SCL = A5.
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);

void setup() {
  lcd.init();
  lcd.backlight();
  lcd.print("I2C LCD @ 0x27");
}

void loop() {
  int raw = analogRead(A0);
  lcd.setCursor(0, 1);
  lcd.print("A0 = ");
  lcd.print(raw);
  lcd.print("    ");
  delay(100);
}
`,
        b,
      );
    },
  },
  {
    id: 'spi-shift',
    title: 'SPI Shift Register (74HC595)',
    summary: 'Hardware SPI clocks bytes into a 74HC595 that drives an LED bar graph — eight outputs from three pins.',
    tags: ['SPI', 'communication', '74HC595', 'shift register', 'intermediate'],
    build: (r) => {
      const { b, uno } = base(r);
      const sr = b.add('evlab.74hc595', 120, -170);
      const bar = b.add('evlab.led-bar-graph', 420, -230);
      const outs = ['QA', 'QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH'];
      outs.forEach((q, i) => {
        const res = b.add('evlab.resistor', 0, 0, { resistance: '330' });
        const a = b.pin(bar, `A${i + 1}`);
        const p2 = b.pin(res, '2');
        res.x += a.x - (i % 2 ? 84 : 20) - p2.x;
        res.y += a.y - p2.y;
        b.wire(res, '2', bar, `A${i + 1}`, WIRE.yellow);
        const q0 = b.pin(sr, q);
        const r1 = b.pin(res, '1');
        b.wire(sr, q, res, '1', WIRE.green, [{ x: q0.x, y: q0.y + (q === 'QA' ? -20 - i * 4 : 18 + i * 4) }, { x: r1.x - 12 - i * 3, y: q0.y + (q === 'QA' ? -20 - i * 4 : 18 + i * 4) }, { x: r1.x - 12 - i * 3, y: r1.y }]);
        if (i > 0) b.wire(bar, `C${i}`, bar, `C${i + 1}`, WIRE.black);
      });
      b.wire(bar, 'C8', uno, 'GND.1', WIRE.black, [{ x: b.pin(bar, 'C8').x + 20, y: b.pin(bar, 'C8').y }, { x: b.pin(bar, 'C8').x + 20, y: -60 }, { x: 115.5, y: -60 }]);
      b.wire(sr, 'SER', uno, '11', WIRE.blue, lane(b.pin(sr, 'SER'), b.pin(uno, '11'), -110));
      b.wire(sr, 'SRCLK', uno, '13', WIRE.yellow, lane(b.pin(sr, 'SRCLK'), b.pin(uno, '13'), -120));
      b.wire(sr, 'RCLK', uno, '10', WIRE.orange, lane(b.pin(sr, 'RCLK'), b.pin(uno, '10'), -100));
      b.wire(sr, 'OE', sr, 'GND', WIRE.black, [{ x: b.pin(sr, 'OE').x, y: -195 }, { x: 100, y: -195 }, { x: 100, y: b.pin(sr, 'GND').y + 12 }, { x: b.pin(sr, 'GND').x, y: b.pin(sr, 'GND').y + 12 }]);
      b.wire(sr, 'GND', uno, 'GND.1', WIRE.black, lane(b.pin(sr, 'GND'), b.pin(uno, 'GND.1'), -70));
      b.wire(sr, 'SRCLR', sr, 'VCC', WIRE.red, [{ x: b.pin(sr, 'SRCLR').x, y: -200 }, { x: b.pin(sr, 'VCC').x, y: -200 }]);
      fiveVolt(b, uno, sr, 'VCC', 330);
      return project(
        'SPI Shift Register',
        'Hardware SPI to a 74HC595 driving LEDs.',
        `// 74HC595 on the hardware SPI bus.
// MOSI (11) -> SER, SCK (13) -> SRCLK, pin 10 -> RCLK (latch).
// OE to GND, SRCLR to 5V. Each output drives an LED through 330 ohms.
#include <SPI.h>

const int LATCH = 10;

void writeLeds(byte pattern) {
  digitalWrite(LATCH, LOW);
  SPI.transfer(pattern);
  digitalWrite(LATCH, HIGH);  // rising edge copies the shift register to the outputs
}

void setup() {
  pinMode(LATCH, OUTPUT);
  SPI.begin();
}

void loop() {
  for (int i = 0; i < 8; i++) { writeLeds(1 << i); delay(120); }       // running light
  for (int i = 0; i <= 8; i++) { writeLeds((1 << i) - 1); delay(120); } // bar fill
}
`,
        b,
      );
    },
  },
  {
    id: 'buzzer',
    title: 'Buzzer Melody (tone)',
    summary: 'Play a melody on a piezo buzzer with tone(). Enable sound in the View menu to hear it.',
    tags: ['sound', 'buzzer', 'tone', 'beginner'],
    build: (r) => {
      const { b, uno } = base(r);
      const bz = b.add('evlab.buzzer', 150, -130);
      b.wire(bz, '1', uno, '8', WIRE.orange, lane(b.pin(bz, '1'), b.pin(uno, '8'), -25));
      b.wire(bz, '2', uno, 'GND.1', WIRE.black, lane(b.pin(bz, '2'), b.pin(uno, 'GND.1'), -35));
      return project(
        'Buzzer Melody',
        'tone() melody on a piezo buzzer.',
        `// Plays "Twinkle Twinkle Little Star" on a buzzer connected to pin 8.
const int BUZZER = 8;
const int NOTE_C4 = 262, NOTE_D4 = 294, NOTE_E4 = 330, NOTE_F4 = 349, NOTE_G4 = 392, NOTE_A4 = 440;
int melody[] = { NOTE_C4, NOTE_C4, NOTE_G4, NOTE_G4, NOTE_A4, NOTE_A4, NOTE_G4,
                 NOTE_F4, NOTE_F4, NOTE_E4, NOTE_E4, NOTE_D4, NOTE_D4, NOTE_C4 };
int beats[]  = { 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 2 };

void setup() {}

void loop() {
  for (int i = 0; i < 14; i++) {
    int duration = 300 * beats[i];
    tone(BUZZER, melody[i], duration * 0.9);
    delay(duration);
  }
  delay(1000);
}
`,
        b,
      );
    },
  },
  {
    id: 'relay',
    title: 'Relay Switching a Separate Circuit',
    summary: 'A relay module, toggled from pin 7, switches an LED powered by its own 9 V battery — the classic way to control loads that are isolated from the MCU.',
    tags: ['relay', 'isolation', 'actuator', 'external supply'],
    build: (r) => {
      const { b, uno } = base(r);
      const relay = b.add('evlab.relay-module', 210, -170);
      const bat = b.add('evlab.battery-9v', 470, -210);
      const led = b.add('evlab.led', 400, -280, { color: 'yellow' });
      const res = b.add('evlab.resistor', 440, -300, { resistance: '470' });
      b.wire(relay, 'IN', uno, '7', WIRE.orange, lane(b.pin(relay, 'IN'), b.pin(uno, '7'), -30));
      b.wire(relay, 'GND', uno, 'GND.1', WIRE.black, lane(b.pin(relay, 'GND'), b.pin(uno, 'GND.1'), -40));
      fiveVolt(b, uno, relay, 'VCC', 330);
      b.wire(bat, '+', relay, 'COM', WIRE.red);
      b.wire(relay, 'NO', res, '1', WIRE.yellow);
      b.wire(res, '2', led, 'A', WIRE.yellow);
      b.wire(led, 'C', bat, '-', WIRE.black);
      return project(
        'Relay Switch',
        'Relay module controlling an isolated LED circuit.',
        `// Relay module on pin 7 (active LOW, like most modules).
// COM -> battery +, NO -> 470R -> LED -> battery -.

const int RELAY = 7;

void setup() {
  pinMode(RELAY, OUTPUT);
  digitalWrite(RELAY, HIGH);  // relay off
  Serial.begin(9600);
}

void loop() {
  Serial.println("Relay ON");
  digitalWrite(RELAY, LOW);
  delay(1500);
  Serial.println("Relay OFF");
  digitalWrite(RELAY, HIGH);
  delay(1500);
}
`,
        b,
      );
    },
  },
  {
    id: 'half-adder',
    title: 'Half Adder (Logic Gates)',
    summary: 'A pure digital-logic circuit with no microcontroller: a 74HC86 XOR gives SUM and a 74HC08 AND gives CARRY. Click the switches while simulating.',
    tags: ['digital logic', 'gates', 'no MCU', 'education'],
    build: (r) => {
      const b = new CircuitBuilder(r);
      const psu = b.add('evlab.bench-supply', -120, 60, { voltage: 5 });
      const xor = b.add('evlab.74hc86', 120, -40);
      const and = b.add('evlab.74hc08', 120, 60);
      const swA = b.add('evlab.slide-switch', 20, -140);
      const swB = b.add('evlab.slide-switch', 70, -140);
      const ledS = b.add('evlab.led', 330, -110, { color: 'green' });
      const ledC = b.add('evlab.led', 400, -110, { color: 'red' });
      const rS = b.add('evlab.resistor', 300, -20, { resistance: '330' }, 90);
      const rC = b.add('evlab.resistor', 370, -20, { resistance: '330' }, 90);
      const vcc = '+';
      const gnd = '-';
      for (const sw of [swA, swB]) {
        b.wire(sw, '1', psu, gnd, WIRE.black);
        b.wire(sw, '3', psu, vcc, WIRE.red);
      }
      for (const ic of [xor, and]) {
        b.wire(ic, 'VCC', psu, vcc, WIRE.red);
        b.wire(ic, 'GND', psu, gnd, WIRE.black);
        b.wire(ic, '1A', swA, '2', WIRE.blue);
        b.wire(ic, '1B', swB, '2', WIRE.yellow);
      }
      b.wire(xor, '1Y', rS, '2', WIRE.green);
      b.wire(rS, '1', ledS, 'A', WIRE.green);
      b.wire(and, '1Y', rC, '2', WIRE.orange);
      b.wire(rC, '1', ledC, 'A', WIRE.orange);
      b.wire(ledS, 'C', psu, gnd, WIRE.black);
      b.wire(ledC, 'C', psu, gnd, WIRE.black);
      return project(
        'Half Adder',
        'XOR + AND half adder with switches and LEDs.',
        `// This circuit has no microcontroller: it is pure digital logic.
// Press Run, then click switches A and B.
//   A B | SUM CARRY
//   0 0 |  0    0
//   0 1 |  1    0
//   1 0 |  1    0
//   1 1 |  0    1
void setup() {}
void loop() {}
`,
        b,
      );
    },
  },
];
