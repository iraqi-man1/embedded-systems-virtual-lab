/**
 * Example projects. Each is built from real component geometry so legs land
 * in breadboard holes exactly as if a user had dropped them there.
 * Layout convention: Uno at (0,0), half breadboard at (-48,-240) so that
 * breadboard column 17 sits right above Uno pin 13 and column 16 above GND.
 */
import type { ComponentRegistry } from '../core/registry/registry';
import { newProject, type Project } from '../core/project/schema';
import { CircuitBuilder, WIRE } from './builder';

export interface ExampleInfo {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  build: (registry: ComponentRegistry) => Project;
}

/** Waypoints for a wire from a breadboard column down to an Uno top-header pin. */
const drop = (fromX: number, toX: number, lane: number) => [
  { x: fromX, y: -38.4 + lane * 9.6 },
  { x: toX, y: -38.4 + lane * 9.6 },
];

function base(r: ComponentRegistry) {
  const b = new CircuitBuilder(r);
  const uno = b.add('evlab.arduino-uno', 0, 0);
  const bb = b.add('evlab.breadboard-half', -48, -240);
  b.wire(uno, 'GND.1', bb, 'bn.16', WIRE.black);
  return { b, uno, bb };
}

/** LED (cathode at f<c>, anode f<c+1>) + resistor h<c+1>→h<c+7>, cathode strip to GND rail. */
function ledOnBoard(b: CircuitBuilder, bb: ReturnType<CircuitBuilder['add']>, c: number, color: string, ohms = '220') {
  const led = b.add('evlab.led', 0, 0, { color });
  b.insert(led, 'C', bb, `f${c}`);
  const res = b.add('evlab.resistor', 0, 0, { resistance: ohms });
  b.insert(res, '1', bb, `h${c + 1}`);
  const gndCol = c % 6 === 0 ? c - 1 : c;
  b.wire(bb, `j${c}`, bb, `bn.${gndCol}`, WIRE.black);
  return { led, res, outCol: c + 7 };
}

function project(name: string, description: string, sketch: string, build: (p: Project) => void): Project {
  const p = newProject(name);
  p.meta.description = description;
  p.firmware.files = [{ name: 'sketch.ino', content: sketch }];
  build(p);
  return p;
}

export const EXAMPLES: ExampleInfo[] = [
  {
    id: 'blink',
    title: 'Blink',
    summary: 'The "hello world" of embedded systems: an LED on a breadboard blinks from pin 13 through a 220 Ω resistor.',
    tags: ['beginner', 'digital output', 'breadboard'],
    build: (r) => {
      const { b, uno, bb } = base(r);
      const { outCol } = ledOnBoard(b, bb, 10, 'red');
      b.wire(bb, `j${outCol}`, uno, '13', WIRE.green);
      return project(
        'Blink',
        'Blinks an LED connected to pin 13 on a breadboard.',
        `// Blink: turns an LED on for half a second, then off, repeatedly.
// The LED is wired from pin 13 through a 220 ohm resistor to GND.

const int LED_PIN = 13;

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_PIN, HIGH);  // LED on
  delay(500);
  digitalWrite(LED_PIN, LOW);   // LED off
  delay(500);
}
`,
        (p) => {
          p.circuit = b.doc;
          p.view = { x: 260, y: 330, zoom: 1.15 };
        },
      );
    },
  },
  {
    id: 'button',
    title: 'Push Button',
    summary: 'Read a push button with the internal pull-up resistor and light an LED while it is pressed. Prints events to the Serial Monitor.',
    tags: ['beginner', 'digital input', 'INPUT_PULLUP', 'serial'],
    build: (r) => {
      const { b, uno, bb } = base(r);
      const { outCol } = ledOnBoard(b, bb, 10, 'green');
      b.wire(bb, `j${outCol}`, uno, '13', WIRE.green);
      const btn = b.add('evlab.pushbutton', 0, 0, { color: 'blue' }, 90);
      b.insert(btn, '2.l', bb, 'd27');
      b.wire(bb, 'j27', bb, 'bn.27', WIRE.black);
      b.wire(bb, 'j29', uno, '2', WIRE.blue);
      return project(
        'Push Button',
        'An LED follows a push button read with INPUT_PULLUP.',
        `// Push button with the internal pull-up resistor.
// One side of the button goes to pin 2, the other side to GND.
// Released: the pull-up reads HIGH. Pressed: the pin is pulled LOW.

const int BUTTON_PIN = 2;
const int LED_PIN = 13;

bool lastPressed = false;

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
  Serial.println("Press the button!");
}

void loop() {
  bool pressed = digitalRead(BUTTON_PIN) == LOW;
  digitalWrite(LED_PIN, pressed ? HIGH : LOW);
  if (pressed != lastPressed) {
    Serial.println(pressed ? "Button pressed" : "Button released");
    lastPressed = pressed;
    delay(20);  // simple debounce
  }
}
`,
        (p) => {
          p.circuit = b.doc;
          p.view = { x: 250, y: 330, zoom: 1.15 };
        },
      );
    },
  },
  {
    id: 'potentiometer',
    title: 'Potentiometer Dimmer',
    summary: 'analogRead() a potentiometer on A0 and dim an LED with analogWrite() PWM. Values stream to the Serial Monitor and Plotter.',
    tags: ['beginner', 'analog input', 'ADC', 'PWM', 'serial plotter'],
    build: (r) => {
      const { b, uno, bb } = base(r);
      const { outCol } = ledOnBoard(b, bb, 14, 'yellow');
      b.wire(bb, `j${outCol}`, uno, '9', WIRE.orange);
      const pot = b.add('evlab.potentiometer', 330, 90, { position: 0.5 });
      b.wire(pot, 'GND', uno, 'GND.2', WIRE.black, [{ x: 359, y: 240 }, { x: 169.5, y: 240 }]);
      b.wire(pot, 'VCC', uno, '5V', WIRE.red, [{ x: 379, y: 230.4 }, { x: 160, y: 230.4 }]);
      b.wire(pot, 'SIG', uno, 'A0', WIRE.blue, [{ x: 369, y: 220.8 }, { x: 208, y: 220.8 }]);
      return project(
        'Potentiometer Dimmer',
        'Reads a potentiometer and dims an LED with PWM.',
        `// Potentiometer dimmer.
// The pot's wiper (middle pin) goes to A0, its ends to 5V and GND.
// analogRead() returns 0..1023; analogWrite() takes 0..255.

const int POT_PIN = A0;
const int LED_PIN = 9;   // PWM-capable pin (marked ~ on the board)

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(POT_PIN);
  analogWrite(LED_PIN, raw / 4);
  float volts = raw * 5.0 / 1023.0;
  Serial.print("raw:");
  Serial.print(raw);
  Serial.print(" volts:");
  Serial.println(volts);
  delay(50);
}
`,
        (p) => {
          p.circuit = b.doc;
          p.view = { x: 230, y: 320, zoom: 1.05 };
        },
      );
    },
  },
  {
    id: 'traffic-light',
    title: 'Traffic Light',
    summary: 'Three LEDs sequence through red, red+amber, green and amber like a real traffic light.',
    tags: ['beginner', 'digital output', 'state machine'],
    build: (r) => {
      const { b, uno, bb } = base(r);
      const red = ledOnBoard(b, bb, 2, 'red');
      const amber = ledOnBoard(b, bb, 10, 'yellow');
      const green = ledOnBoard(b, bb, 19, 'green');
      const x = (c: number) => -28.8 + (c - 1) * 9.6;
      b.wire(bb, `j${red.outCol}`, uno, '13', WIRE.red, drop(x(red.outCol), 125, 0));
      b.wire(bb, `j${amber.outCol}`, uno, '12', WIRE.yellow, drop(x(amber.outCol), 134.5, 1));
      b.wire(bb, `j${green.outCol}`, uno, '11', WIRE.green, drop(x(green.outCol), 144, 2));
      return project(
        'Traffic Light',
        'A UK-style traffic light sequence on three LEDs.',
        `// Traffic light: red -> red+amber -> green -> amber -> red ...

const int RED = 13;
const int AMBER = 12;
const int GREEN = 11;

void setLights(bool r, bool a, bool g) {
  digitalWrite(RED, r);
  digitalWrite(AMBER, a);
  digitalWrite(GREEN, g);
}

void setup() {
  pinMode(RED, OUTPUT);
  pinMode(AMBER, OUTPUT);
  pinMode(GREEN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  Serial.println("STOP");
  setLights(HIGH, LOW, LOW);
  delay(3000);
  Serial.println("GET READY");
  setLights(HIGH, HIGH, LOW);
  delay(1000);
  Serial.println("GO");
  setLights(LOW, LOW, HIGH);
  delay(3000);
  Serial.println("CAUTION");
  setLights(LOW, HIGH, LOW);
  delay(1000);
}
`,
        (p) => {
          p.circuit = b.doc;
          p.view = { x: 260, y: 330, zoom: 1.1 };
        },
      );
    },
  },
  {
    id: 'fade',
    title: 'LED Fade (PWM)',
    summary: 'Smoothly fades an LED in and out with analogWrite(). Probe pin 9 with the oscilloscope to see the duty cycle change.',
    tags: ['PWM', 'analog output', 'oscilloscope'],
    build: (r) => {
      const { b, uno, bb } = base(r);
      const { outCol } = ledOnBoard(b, bb, 14, 'blue');
      b.wire(bb, `j${outCol}`, uno, '9', WIRE.orange);
      return project(
        'LED Fade',
        'PWM fade on pin 9.',
        `// Fade an LED using PWM (pulse-width modulation).
// Open the Oscilloscope, choose the probe tool and click Uno pin 9.

const int LED_PIN = 9;

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  for (int level = 0; level <= 255; level += 5) {
    analogWrite(LED_PIN, level);
    delay(30);
  }
  for (int level = 255; level >= 0; level -= 5) {
    analogWrite(LED_PIN, level);
    delay(30);
  }
}
`,
        (p) => {
          p.circuit = b.doc;
          p.instruments.scope = [{ id: 'ch1', target: { componentId: uno.id, pinId: '9' }, label: 'U1.9', color: '#f5c400' }];
          p.view = { x: 260, y: 330, zoom: 1.15 };
        },
      );
    },
  },
  {
    id: 'rgb',
    title: 'RGB Color Mixing',
    summary: 'Mix colours on a common-cathode RGB LED with three PWM channels.',
    tags: ['PWM', 'RGB LED', 'color'],
    build: (r) => {
      const b = new CircuitBuilder(r);
      const uno = b.add('evlab.arduino-uno', 0, 0);
      const led = b.add('evlab.rgb-led', 172.8, -192);
      const rr = b.add('evlab.resistor', 0, 0, { resistance: '220' }, 90);
      const rg = b.add('evlab.resistor', 0, 0, { resistance: '220' }, 90);
      const rb = b.add('evlab.resistor', 0, 0, { resistance: '220' }, 90);
      const pr = b.pin(led, 'R');
      const pg = b.pin(led, 'G');
      const pb = b.pin(led, 'B');
      const place = (res: typeof rr, x: number) => {
        const p = b.pin(res, '1');
        res.x += x - p.x;
        res.y += -105.6 - p.y;
      };
      place(rr, pr.x - 28.8);
      place(rg, pg.x);
      place(rb, pb.x + 28.8);
      b.wire(led, 'R', rr, '1', WIRE.red);
      b.wire(led, 'G', rg, '1', WIRE.green);
      b.wire(led, 'B', rb, '1', WIRE.blue);
      b.wire(rr, '2', uno, '11', WIRE.red);
      b.wire(rg, '2', uno, '10', WIRE.green);
      b.wire(rb, '2', uno, '9', WIRE.blue);
      b.wire(led, 'COM', uno, 'GND.1', WIRE.black, [{ x: b.pin(led, 'COM').x, y: -124.8 }, { x: 115.5, y: -124.8 }]);
      return project(
        'RGB Color Mixing',
        'Cycles through colours on an RGB LED.',
        `// RGB LED colour wheel on PWM pins 9 (blue), 10 (green), 11 (red).

const int R_PIN = 11;
const int G_PIN = 10;
const int B_PIN = 9;

void setColor(int r, int g, int b) {
  analogWrite(R_PIN, r);
  analogWrite(G_PIN, g);
  analogWrite(B_PIN, b);
}

void setup() {}

void loop() {
  for (int i = 0; i < 256; i += 4) { setColor(255 - i, i, 0); delay(15); }  // red -> green
  for (int i = 0; i < 256; i += 4) { setColor(0, 255 - i, i); delay(15); }  // green -> blue
  for (int i = 0; i < 256; i += 4) { setColor(i, 0, 255 - i); delay(15); }  // blue -> red
}
`,
        (p) => {
          p.circuit = b.doc;
          p.view = { x: 330, y: 330, zoom: 1.2 };
        },
      );
    },
  },
  {
    id: 'serial-uart',
    title: 'Serial (UART) Console',
    summary: 'Control an LED by typing commands in the Serial Monitor: "on", "off", "blink <n>". Demonstrates UART receive and transmit.',
    tags: ['UART', 'serial', 'communication'],
    build: (r) => {
      const { b, uno, bb } = base(r);
      const { outCol } = ledOnBoard(b, bb, 10, 'white');
      b.wire(bb, `j${outCol}`, uno, '13', WIRE.green);
      return project(
        'Serial Console',
        'UART command interpreter controlling an LED.',
        `// Serial (UART) console. Open the Serial Monitor and type:
//   on        -> LED on
//   off       -> LED off
//   blink 5   -> blink 5 times
//   status    -> report LED state and uptime

const int LED_PIN = 13;
String line;

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(115200);
  Serial.println("Ready. Commands: on, off, blink <n>, status");
}

void handle(String cmd) {
  cmd.trim();
  if (cmd == "on") { digitalWrite(LED_PIN, HIGH); Serial.println("LED is ON"); }
  else if (cmd == "off") { digitalWrite(LED_PIN, LOW); Serial.println("LED is OFF"); }
  else if (cmd.startsWith("blink")) {
    int n = cmd.substring(5).toInt();
    if (n <= 0) n = 3;
    for (int i = 0; i < n; i++) {
      digitalWrite(LED_PIN, HIGH); delay(150);
      digitalWrite(LED_PIN, LOW); delay(150);
    }
    Serial.print("Blinked "); Serial.print(n); Serial.println(" times");
  }
  else if (cmd == "status") {
    Serial.print("LED="); Serial.print(digitalRead(LED_PIN) ? "ON" : "OFF");
    Serial.print(" uptime="); Serial.print(millis()); Serial.println(" ms");
  }
  else { Serial.print("Unknown command: "); Serial.println(cmd); }
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\\n' || c == '\\r') {
      if (line.length()) handle(line);
      line = "";
    } else {
      line += c;
    }
  }
}
`,
        (p) => {
          p.circuit = b.doc;
          p.view = { x: 260, y: 330, zoom: 1.15 };
        },
      );
    },
  },
  {
    id: 'light-meter',
    title: 'Light Meter (LDR)',
    summary: 'A photoresistor in a voltage divider is read on A0. The LED turns on when it gets dark. Change the light level in the Inspector.',
    tags: ['sensor', 'analog input', 'voltage divider'],
    build: (r) => {
      const b = new CircuitBuilder(r);
      const uno = b.add('evlab.arduino-uno', 0, 0);
      const ldr = b.add('evlab.photoresistor', 320, 60, { lux: 300 });
      const res = b.add('evlab.resistor', 340, 150, { resistance: '10k' });
      b.wire(ldr, '1', uno, '5V', WIRE.red, [{ x: b.pin(ldr, '1').x, y: 230.4 }, { x: 160, y: 230.4 }]);
      b.wire(ldr, '2', res, '1', WIRE.yellow);
      b.wire(res, '1', uno, 'A0', WIRE.blue, [{ x: b.pin(res, '1').x, y: 220.8 }, { x: 208, y: 220.8 }]);
      b.wire(res, '2', uno, 'GND.2', WIRE.black, [{ x: b.pin(res, '2').x, y: 240 }, { x: 169.5, y: 240 }]);
      const led = b.add('evlab.led', 150, -110, { color: 'white' });
      const rl = b.add('evlab.resistor', 0, 0, { resistance: '220' }, 90);
      const pa = b.pin(led, 'A');
      const p1 = b.pin(rl, '1');
      rl.x += pa.x + 28.8 - p1.x;
      rl.y += -96 - p1.y;
      b.wire(led, 'A', rl, '1', WIRE.green);
      b.wire(rl, '2', uno, '13', WIRE.green);
      b.wire(led, 'C', uno, 'GND.1', WIRE.black);
      return project(
        'Light Meter',
        'LDR voltage divider with a night-light LED.',
        `// Light meter with a photoresistor (LDR) and a 10k resistor.
// 5V -- LDR -- A0 -- 10k -- GND : brighter light => lower LDR resistance => higher voltage.

const int SENSOR = A0;
const int LED_PIN = 13;
const int DARK_THRESHOLD = 300;

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int level = analogRead(SENSOR);
  digitalWrite(LED_PIN, level < DARK_THRESHOLD ? HIGH : LOW);
  Serial.print("light:");
  Serial.println(level);
  delay(100);
}
`,
        (p) => {
          p.circuit = b.doc;
          p.view = { x: 250, y: 300, zoom: 1.1 };
        },
      );
    },
  },
  {
    id: 'thermometer',
    title: 'NTC Thermometer',
    summary: 'Measure temperature with a 10 kΩ NTC thermistor and the Steinhart–Hart (β) equation. Change the temperature in the Inspector.',
    tags: ['sensor', 'temperature', 'math', 'serial plotter'],
    build: (r) => {
      const b = new CircuitBuilder(r);
      const uno = b.add('evlab.arduino-uno', 0, 0);
      const ntc = b.add('evlab.ntc-thermistor', 320, 60, { temperature: 25 });
      const res = b.add('evlab.resistor', 340, 150, { resistance: '10k' });
      b.wire(ntc, '1', uno, '5V', WIRE.red, [{ x: b.pin(ntc, '1').x, y: 230.4 }, { x: 160, y: 230.4 }]);
      b.wire(ntc, '2', res, '1', WIRE.yellow);
      b.wire(res, '1', uno, 'A0', WIRE.blue, [{ x: b.pin(res, '1').x, y: 220.8 }, { x: 208, y: 220.8 }]);
      b.wire(res, '2', uno, 'GND.2', WIRE.black, [{ x: b.pin(res, '2').x, y: 240 }, { x: 169.5, y: 240 }]);
      return project(
        'NTC Thermometer',
        'Thermistor temperature measurement.',
        `// NTC thermometer: 5V -- NTC -- A0 -- 10k -- GND

const float R_FIXED = 10000.0;
const float R25 = 10000.0;   // NTC resistance at 25 C
const float BETA = 3950.0;

void setup() {
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(A0);
  float v = raw * 5.0 / 1023.0;
  float rNtc = R_FIXED * (5.0 - v) / v;
  float kelvin = 1.0 / (1.0 / 298.15 + log(rNtc / R25) / BETA);
  float celsius = kelvin - 273.15;
  Serial.print("temperature:");
  Serial.println(celsius, 1);
  delay(250);
}
`,
        (p) => {
          p.circuit = b.doc;
          p.view = { x: 250, y: 300, zoom: 1.1 };
        },
      );
    },
  },
  {
    id: 'transistor',
    title: 'Transistor Switch',
    summary: 'Pin 9 drives a 2N2222 NPN transistor through a 1 kΩ base resistor; the transistor switches an LED from the 5 V rail.',
    tags: ['transistor', 'BJT', 'switching', 'intermediate'],
    build: (r) => {
      const b = new CircuitBuilder(r);
      const uno = b.add('evlab.arduino-uno', 0, 0);
      const q = b.add('evlab.2n2222', 330, 40);
      const rb = b.add('evlab.resistor', 300, -60, { resistance: '1k' });
      const led = b.add('evlab.led', 420, -100, { color: 'red' });
      const rc = b.add('evlab.resistor', 460, -150, { resistance: '220' });
      b.wire(uno, '9', rb, '1', WIRE.orange, [{ x: 163, y: -40 }]);
      b.wire(rb, '2', q, 'B', WIRE.orange);
      b.wire(q, 'C', led, 'C', WIRE.yellow);
      b.wire(led, 'A', rc, '1', WIRE.yellow);
      b.wire(rc, '2', uno, '5V', WIRE.red, [{ x: 560, y: b.pin(rc, '2').y }, { x: 560, y: 230.4 }, { x: 160, y: 230.4 }]);
      b.wire(q, 'E', uno, 'GND.2', WIRE.black, [{ x: b.pin(q, 'E').x, y: 240 }, { x: 169.5, y: 240 }]);
      return project(
        'Transistor Switch',
        'NPN low-side switch for an LED.',
        `// A transistor lets a small pin current switch a larger load current.
// Pin 9 -> 1k -> base. Collector -> LED -> 220R -> 5V. Emitter -> GND.

const int DRIVE = 9;

void setup() {
  pinMode(DRIVE, OUTPUT);
}

void loop() {
  digitalWrite(DRIVE, HIGH);  // transistor saturates, LED on
  delay(700);
  digitalWrite(DRIVE, LOW);   // transistor off
  delay(700);
}
`,
        (p) => {
          p.circuit = b.doc;
          p.view = { x: 160, y: 300, zoom: 1.05 };
        },
      );
    },
  },
  {
    id: 'mosfet',
    title: 'MOSFET + External Supply',
    summary: 'A logic-level IRLZ44N MOSFET switches an LED powered from a separate 9 V battery, with a shared ground.',
    tags: ['MOSFET', 'power', 'external supply', 'intermediate'],
    build: (r) => {
      const b = new CircuitBuilder(r);
      const uno = b.add('evlab.arduino-uno', 0, 0);
      const fet = b.add('evlab.irlz44n', 340, 20);
      const bat = b.add('evlab.battery-9v', 470, -120);
      const led = b.add('evlab.led', 380, -130, { color: 'green' });
      const rl = b.add('evlab.resistor', 360, -180, { resistance: '470' });
      const rg = b.add('evlab.resistor', 230, -40, { resistance: '100' });
      b.wire(uno, '9', rg, '1', WIRE.orange, [{ x: 163, y: -20 }]);
      b.wire(rg, '2', fet, 'G', WIRE.orange);
      b.wire(fet, 'D', led, 'C', WIRE.yellow);
      b.wire(led, 'A', rl, '1', WIRE.yellow);
      b.wire(rl, '2', bat, '+', WIRE.red);
      b.wire(fet, 'S', bat, '-', WIRE.black);
      b.wire(fet, 'S', uno, 'GND.2', WIRE.black, [{ x: b.pin(fet, 'S').x, y: 240 }, { x: 169.5, y: 240 }]);
      return project(
        'MOSFET Switch',
        'Low-side MOSFET switch with an external supply.',
        `// The LED runs from a 9 V battery; the Uno only drives the MOSFET gate.
// The battery's negative terminal must share ground with the Uno.

const int GATE = 9;

void setup() {
  pinMode(GATE, OUTPUT);
}

void loop() {
  for (int duty = 0; duty <= 255; duty += 15) { analogWrite(GATE, duty); delay(60); }
  for (int duty = 255; duty >= 0; duty -= 15) { analogWrite(GATE, duty); delay(60); }
}
`,
        (p) => {
          p.circuit = b.doc;
          p.view = { x: 140, y: 320, zoom: 1.0 };
        },
      );
    },
  },
];
