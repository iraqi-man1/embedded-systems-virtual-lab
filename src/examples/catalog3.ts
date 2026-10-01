/** Examples built around the interactive parts: keypad, rotary encoder, NeoPixels, IMU and OLED. */
import type { Point } from '../core/model/circuit';
import type { ComponentRegistry } from '../core/registry/registry';
import { newProject, type Project } from '../core/project/schema';
import { CircuitBuilder, WIRE } from './builder';
import type { ExampleInfo } from './catalog';

function project(name: string, description: string, sketch: string, b: CircuitBuilder): Project {
  const p = newProject(name);
  p.meta.description = description;
  p.firmware.files = [{ name: 'sketch.ino', content: sketch }];
  p.circuit = b.doc;
  return p;
}

function base(r: ComponentRegistry) {
  const b = new CircuitBuilder(r);
  const uno = b.add('evlab.arduino-uno', 0, 0);
  return { b, uno };
}

/** Horizontal jog at `y` between two pins (vertical runs on both ends). */
const jog = (from: Point, to: Point, y: number): Point[] => [
  { x: from.x, y },
  { x: to.x, y },
];

/** Route to a bottom-header pin of the Uno (5V, GND.2, A0…) below the board. */
const underUno = (from: Point, to: Point, sideX: number, laneY: number): Point[] => [
  { x: sideX, y: from.y },
  { x: sideX, y: laneY },
  { x: to.x, y: laneY },
];

export const EXAMPLES_3: ExampleInfo[] = [
  {
    id: 'keypad-lock',
    title: 'Keypad Door Lock',
    summary: 'A 4×4 matrix keypad read with the Keypad library: type 1234 and # to unlock (the L LED lights). Click the keys on the keypad while the simulation runs.',
    tags: ['input', 'keypad', 'library', 'interactive'],
    build: (r) => {
      const { b, uno } = base(r);
      const pad = b.add('evlab.keypad-4x4', 63, -420);
      const lines: [string, string, string][] = [
        ['R1', '9', WIRE.yellow],
        ['R2', '8', WIRE.yellow],
        ['R3', '7', WIRE.yellow],
        ['R4', '6', WIRE.yellow],
        ['C1', '5', WIRE.blue],
        ['C2', '4', WIRE.blue],
        ['C3', '3', WIRE.blue],
        ['C4', '2', WIRE.blue],
      ];
      for (const [kp, up, color] of lines) {
        const a = b.pin(pad, kp);
        const z = b.pin(uno, up);
        b.wire(pad, kp, uno, up, color, Math.abs(a.x - z.x) < 0.5 ? [] : jog(a, z, -40));
      }
      return project(
        'Keypad Door Lock',
        'Enter a code on a 4×4 keypad to unlock.',
        `// Keypad door lock. Type the code 1234 and press # to unlock: the Uno's L LED
// (pin 13) lights for 3 seconds. * clears what you typed.
// Click the keys on the keypad while the simulation runs.
#include <Keypad.h>

const byte ROWS = 4, COLS = 4;
char keys[ROWS][COLS] = {
  {'1', '2', '3', 'A'},
  {'4', '5', '6', 'B'},
  {'7', '8', '9', 'C'},
  {'*', '0', '#', 'D'},
};
byte rowPins[ROWS] = {9, 8, 7, 6};
byte colPins[COLS] = {5, 4, 3, 2};
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

const char CODE[] = "1234";
const int LOCK_LED = 13;
String entry;

void setup() {
  pinMode(LOCK_LED, OUTPUT);
  Serial.begin(9600);
  Serial.println("Locked. Enter the code and press #");
}

void loop() {
  char k = keypad.getKey();
  if (!k) return;
  if (k == '*') {
    entry = "";
    Serial.println(" cleared");
    return;
  }
  if (k != '#') {
    entry += k;
    Serial.print('*');
    return;
  }
  Serial.println();
  if (entry == CODE) {
    Serial.println("Unlocked!");
    digitalWrite(LOCK_LED, HIGH);
    delay(3000);
    digitalWrite(LOCK_LED, LOW);
    Serial.println("Locked again");
  } else {
    Serial.println("Wrong code");
  }
  entry = "";
}
`,
        b,
      );
    },
  },
  {
    id: 'encoder-ring',
    title: 'Encoder Light Ring',
    summary: 'Turn a KY-040 rotary encoder to move a light around a 16-pixel NeoPixel ring; click it to change colour. Drag around the knob (or scroll on it) while simulating.',
    tags: ['input', 'rotary encoder', 'NeoPixel', 'library', 'interactive'],
    build: (r) => {
      const { b, uno } = base(r);
      const ring = b.add('evlab.neopixel-ring', 120, -262);
      const enc = b.add('evlab.ky040', 330, -150, {}, 180);
      const din = b.pin(ring, 'DIN');
      b.wire(ring, 'DIN', uno, '6', WIRE.green, jog(din, b.pin(uno, '6'), -60));
      b.wire(ring, 'GND', uno, 'GND.1', WIRE.black, jog(b.pin(ring, 'GND'), b.pin(uno, 'GND.1'), -75));
      const vcc = b.pin(ring, 'VCC');
      b.wire(ring, 'VCC', uno, '5V', WIRE.red, [{ x: vcc.x, y: -90 }, { x: -30, y: -90 }, { x: -30, y: 240 }, { x: 160.3, y: 240 }]);
      for (const [p, up, color] of [
        ['CLK', '2', WIRE.yellow],
        ['DT', '3', WIRE.orange],
        ['SW', '4', WIRE.purple],
      ] as const) {
        const a = b.pin(enc, p);
        const z = b.pin(uno, up);
        b.wire(enc, p, uno, up, color, [{ x: z.x, y: a.y }]);
      }
      b.wire(enc, 'GND', uno, 'GND.2', WIRE.black, underUno(b.pin(enc, 'GND'), b.pin(uno, 'GND.2'), 300, 225));
      b.wire(enc, 'VCC', uno, '5V', WIRE.red, underUno(b.pin(enc, 'VCC'), b.pin(uno, '5V'), 310, 232));
      return project(
        'Encoder Light Ring',
        'A rotary encoder moves a light around a NeoPixel ring.',
        `// Rotary encoder + NeoPixel ring. Turn the knob to move the light around the
// ring, click it to change colour. While simulating, drag around the encoder's
// knob (or scroll on it); click it to press.
#include <Adafruit_NeoPixel.h>

const int CLK = 2, DT = 3, SW = 4;   // KY-040 (the module has pull-ups)
const int RING_PIN = 6, PIXELS = 16;
Adafruit_NeoPixel ring(PIXELS, RING_PIN, NEO_GRB + NEO_KHZ800);

const uint32_t COLOURS[] = {0xFF3000, 0x00D060, 0x2070FF, 0xD000D0};
int position = 0, colour = 0, lastClk;

void show() {
  ring.clear();
  ring.setPixelColor(position, COLOURS[colour]);
  // A dim tail behind the light.
  ring.setPixelColor((position + PIXELS - 1) % PIXELS, (COLOURS[colour] >> 3) & 0x1F1F1F);
  ring.show();
  Serial.print("position:");
  Serial.println(position);
}

void setup() {
  pinMode(CLK, INPUT);
  pinMode(DT, INPUT);
  pinMode(SW, INPUT);
  ring.begin();
  ring.setBrightness(90);
  Serial.begin(9600);
  lastClk = digitalRead(CLK);
  show();
}

void loop() {
  int clk = digitalRead(CLK);
  if (clk != lastClk && clk == LOW) {
    // On a falling CLK edge, DT tells the direction.
    position = (position + (digitalRead(DT) == HIGH ? 1 : PIXELS - 1)) % PIXELS;
    show();
  }
  lastClk = clk;
  if (digitalRead(SW) == LOW) {
    colour = (colour + 1) % 4;
    show();
    while (digitalRead(SW) == LOW) {}
  }
}
`,
        b,
      );
    },
  },
  {
    id: 'spirit-level',
    title: 'Spirit Level (MPU-6050 + OLED)',
    summary: 'Read tilt from an MPU-6050 accelerometer over I²C and draw a bubble level on an SSD1306 OLED. Drag the tilt pad next to the sensor while simulating.',
    tags: ['sensor', 'MPU-6050', 'display', 'OLED', 'I2C', 'library', 'interactive'],
    build: (r) => {
      const { b, uno } = base(r);
      const imu = b.add('evlab.mpu6050', 330, 250);
      const oled = b.add('evlab.ssd1306', 470, 236);
      const a4 = b.pin(uno, 'A4');
      const a5 = b.pin(uno, 'A5');
      b.wire(uno, 'A4', imu, 'SDA', WIRE.blue, jog(a4, b.pin(imu, 'SDA'), 214));
      b.wire(uno, 'A5', imu, 'SCL', WIRE.yellow, jog(a5, b.pin(imu, 'SCL'), 207));
      b.wire(imu, 'SDA', oled, 'DATA', WIRE.blue, [{ x: b.pin(imu, 'SDA').x, y: 214 }, { x: b.pin(oled, 'DATA').x, y: 214 }]);
      b.wire(imu, 'SCL', oled, 'CLK', WIRE.yellow, [{ x: b.pin(imu, 'SCL').x, y: 207 }, { x: b.pin(oled, 'CLK').x, y: 207 }]);
      const gnd = b.pin(uno, 'GND.2');
      const v5 = b.pin(uno, '5V');
      b.wire(uno, 'GND.2', imu, 'GND', WIRE.black, [{ x: gnd.x, y: 228 }, { x: b.pin(imu, 'GND').x, y: 228 }]);
      b.wire(uno, '5V', imu, 'VCC', WIRE.red, [{ x: v5.x, y: 236 }, { x: b.pin(imu, 'VCC').x, y: 236 }]);
      b.wire(imu, 'GND', oled, 'GND', WIRE.black, [{ x: b.pin(imu, 'GND').x, y: 228 }, { x: b.pin(oled, 'GND').x, y: 228 }]);
      b.wire(imu, 'VCC', oled, 'VIN', WIRE.red, [{ x: b.pin(imu, 'VCC').x, y: 221 }, { x: b.pin(oled, 'VIN').x, y: 221 }]);
      return project(
        'Spirit Level',
        'MPU-6050 tilt shown as a bubble level on an SSD1306 OLED.',
        `// Spirit level. An MPU-6050 accelerometer (I2C address 0x68) measures tilt and
// an SSD1306 OLED (0x3C) shows a bubble with the pitch and roll angles.
// While simulating, drag the tilt pad next to the sensor.
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

Adafruit_SSD1306 oled(128, 64, &Wire, -1);
const uint8_t MPU = 0x68;

// Raw register access: accelerometer X/Y/Z in g (±2 g range).
void readAccel(float &ax, float &ay, float &az) {
  Wire.beginTransmission(MPU);
  Wire.write(0x3B);  // ACCEL_XOUT_H
  Wire.endTransmission(false);
  Wire.requestFrom(MPU, (uint8_t)6);
  int16_t x = Wire.read() << 8 | Wire.read();
  int16_t y = Wire.read() << 8 | Wire.read();
  int16_t z = Wire.read() << 8 | Wire.read();
  ax = x / 16384.0;
  ay = y / 16384.0;
  az = z / 16384.0;
}

void setup() {
  Serial.begin(9600);
  Wire.begin();
  Wire.beginTransmission(MPU);
  Wire.write(0x6B);  // PWR_MGMT_1: wake up
  Wire.write(0);
  Wire.endTransmission();
  if (!oled.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED not found");
    for (;;) {}
  }
  oled.setTextColor(SSD1306_WHITE);
}

void loop() {
  float ax, ay, az;
  readAccel(ax, ay, az);
  float pitch = atan2(-ax, sqrt(ay * ay + az * az)) * 180 / PI;
  float roll = atan2(ay, az) * 180 / PI;

  oled.clearDisplay();
  oled.drawCircle(96, 32, 28, SSD1306_WHITE);
  oled.drawFastHLine(68, 32, 57, SSD1306_WHITE);
  oled.drawFastVLine(96, 4, 57, SSD1306_WHITE);
  int bx = 96 + constrain(roll, -45, 45) * 0.5;
  int by = 32 - constrain(pitch, -45, 45) * 0.5;
  oled.fillCircle(bx, by, 5, SSD1306_WHITE);
  oled.setCursor(0, 8);
  oled.print("pitch");
  oled.setCursor(0, 20);
  oled.print(pitch, 1);
  oled.setCursor(0, 38);
  oled.print("roll");
  oled.setCursor(0, 50);
  oled.print(roll, 1);
  oled.display();

  Serial.print("pitch:");
  Serial.print(pitch, 1);
  Serial.print(" roll:");
  Serial.println(roll, 1);
  delay(100);
}
`,
        b,
      );
    },
  },
];

