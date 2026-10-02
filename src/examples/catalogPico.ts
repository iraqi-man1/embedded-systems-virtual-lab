/**
 * MicroPython examples on the Raspberry Pi Pico. Layout: the Pico at the
 * bottom with its top pin row on the grid, a half breadboard above it whose
 * column c sits straight above the Pico's top pin c (GP0 under column 1), so
 * most jumpers drop straight down. The breadboard's bottom − rail is GND.
 */
import type { ComponentRegistry } from '../core/registry/registry';
import { newProject, type Project } from '../core/project/schema';
import { CircuitBuilder, WIRE } from './builder';
import { ledOnBoard, type ExampleInfo } from './catalog';

const P = 9.6;
/** Height of the lane between the breadboard and the Pico used by jumpers that run sideways. */
const LANE = -19.2;

export function picoBase(r: ComponentRegistry) {
  const b = new CircuitBuilder(r);
  const pico = b.add('evlab.rpi-pico', -2.4, -4.8);
  const bb = b.add('evlab.breadboard-half', -9.6, -240);
  b.wire(pico, 'GND.7', bb, 'bn.8', WIRE.black);
  return { b, pico, bb };
}

function project(name: string, description: string, main: string, b: CircuitBuilder): Project {
  const p = newProject(name);
  p.meta.description = description;
  p.firmware = { language: 'micropython', files: [{ name: 'main.py', content: main }], target: null };
  p.circuit = b.doc;
  return p;
}

export const EXAMPLES_PICO: ExampleInfo[] = [
  {
    id: 'pico-blink',
    title: 'Pico Blink (MicroPython)',
    summary: 'Python on a Raspberry Pi Pico: the green LED on the board and an LED on GP15 take turns. Press Ctrl+C in the Serial Monitor to stop the program and type Python at the >>> prompt.',
    tags: ['beginner', 'MicroPython', 'Raspberry Pi Pico', 'digital output'],
    build: (r) => {
      const { b, pico, bb } = picoBase(r);
      const { outCol } = ledOnBoard(b, bb, 13, 'red');
      b.wire(bb, `j${outCol}`, pico, 'GP15', WIRE.green);
      return project(
        'Pico Blink',
        'The Pico’s own LED and an LED on GP15 blink in turn (MicroPython).',
        `# Blink with MicroPython on the Raspberry Pi Pico.
# The green LED on the board (GP25) and the LED on the breadboard
# (GP15, through a 220 ohm resistor to GND) take turns.
from machine import Pin
import time

board_led = Pin(25, Pin.OUT)
led = Pin(15, Pin.OUT)

print("Blinking! Ctrl+C in the Serial Monitor stops the program.")

while True:
    board_led.on()
    led.off()
    time.sleep(0.5)
    board_led.off()
    led.on()
    time.sleep(0.5)
`,
        b,
      );
    },
  },
  {
    id: 'pico-button',
    title: 'Pico Push Button (MicroPython)',
    summary: 'Read a push button on GP15 with Pin.PULL_UP and light the LED on GP14 while it is pressed. Click the button while simulating; print() reports each press.',
    tags: ['beginner', 'MicroPython', 'Raspberry Pi Pico', 'digital input', 'interactive'],
    build: (r) => {
      const { b, pico, bb } = picoBase(r);
      const { outCol } = ledOnBoard(b, bb, 12, 'green');
      b.wire(bb, `j${outCol}`, pico, 'GP14', WIRE.green);
      const btn = b.add('evlab.pushbutton', 0, 0, { color: 'blue' }, 90);
      b.insert(btn, '2.l', bb, 'd25');
      b.wire(bb, 'j25', bb, 'bn.25', WIRE.black);
      b.wire(bb, 'j27', pico, 'GP15', WIRE.blue, [
        { x: 27 * P, y: LANE },
        { x: 20 * P, y: LANE },
      ]);
      return project(
        'Pico Push Button',
        'An LED follows a push button read with Pin.PULL_UP (MicroPython).',
        `# Push button with the internal pull-up resistor.
# One side of the button goes to GP15, the other side to GND.
# Released: the pull-up reads 1. Pressed: the pin is pulled to 0.
from machine import Pin
import time

button = Pin(15, Pin.IN, Pin.PULL_UP)
led = Pin(14, Pin.OUT)

print("Press the button!")
last = False
while True:
    pressed = button.value() == 0
    led.value(pressed)
    if pressed != last:
        print("Button pressed" if pressed else "Button released")
        last = pressed
    time.sleep_ms(20)  # simple debounce
`,
        b,
      );
    },
  },
  {
    id: 'pico-potentiometer',
    title: 'Pico Potentiometer Dimmer (MicroPython)',
    summary: 'ADC(28).read_u16() reads a potentiometer and PWM sets the brightness of the LED on GP15. Turn the knob while simulating; values stream to the Serial Monitor and Plotter.',
    tags: ['beginner', 'MicroPython', 'Raspberry Pi Pico', 'analog input', 'ADC', 'PWM', 'interactive'],
    build: (r) => {
      const { b, pico, bb } = picoBase(r);
      const { outCol } = ledOnBoard(b, bb, 13, 'yellow');
      b.wire(bb, `j${outCol}`, pico, 'GP15', WIRE.orange);
      // Below the Pico, turned so its legs point up at the bottom pin row: VCC, wiper, GND
      // line up under 3V3, GP28 (ADC2) and AGND, so no jumper crosses another.
      const pot = b.add('evlab.potentiometer', 0, 0, { position: 0.5 }, 180);
      const sig = b.pin(pot, 'SIG');
      const adc = b.pin(pico, 'GP28');
      pot.x += adc.x - sig.x;
      pot.y += adc.y + 5 * P - sig.y;
      const lane = adc.y + 2 * P;
      for (const [pin, target, color] of [
        ['VCC', '3V3', WIRE.red],
        ['SIG', 'GP28', WIRE.blue],
        ['GND', 'AGND', WIRE.black],
      ] as const) {
        const from = b.pin(pot, pin);
        const to = b.pin(pico, target);
        b.wire(pot, pin, pico, target, color, Math.abs(from.x - to.x) < 0.1 ? [] : [{ x: from.x, y: lane }, { x: to.x, y: lane }]);
      }
      return project(
        'Pico Potentiometer Dimmer',
        'Reads a potentiometer with the ADC and dims an LED with PWM (MicroPython).',
        `# Potentiometer dimmer: the ADC reads the knob, PWM sets the LED brightness.
# The wiper (middle pin) goes to GP28 (ADC2), the ends to 3V3 and AGND.
from machine import ADC, Pin, PWM
import time

pot = ADC(28)
led = PWM(Pin(15), freq=1000)

while True:
    raw = pot.read_u16()      # 0 .. 65535 for 0 .. 3.3 V
    led.duty_u16(raw)         # same range: turn the knob, the LED gets brighter
    volts = raw * 3.3 / 65535
    print("raw:%d volts:%.2f" % (raw, volts))
    time.sleep(0.1)
`,
        b,
      );
    },
  },
  {
    id: 'pico-traffic-light',
    title: 'Pico Traffic Light (MicroPython)',
    summary: 'Three LEDs on GP6, GP13 and GP15 sequence through red, red+amber, green and amber, written as a small Python function.',
    tags: ['beginner', 'MicroPython', 'Raspberry Pi Pico', 'digital output', 'state machine'],
    build: (r) => {
      const { b, pico, bb } = picoBase(r);
      const red = ledOnBoard(b, bb, 2, 'red');
      const amber = ledOnBoard(b, bb, 10, 'yellow');
      const green = ledOnBoard(b, bb, 19, 'green');
      b.wire(bb, `j${red.outCol}`, pico, 'GP6', WIRE.red);
      b.wire(bb, `j${amber.outCol}`, pico, 'GP13', WIRE.yellow);
      b.wire(bb, `j${green.outCol}`, pico, 'GP15', WIRE.green, [
        { x: green.outCol * P, y: LANE },
        { x: 20 * P, y: LANE },
      ]);
      return project(
        'Pico Traffic Light',
        'A UK-style traffic light sequence on three LEDs (MicroPython).',
        `# Traffic light: red -> red+amber -> green -> amber -> red ...
from machine import Pin
import time

red = Pin(6, Pin.OUT)
amber = Pin(13, Pin.OUT)
green = Pin(15, Pin.OUT)


def lights(r, a, g):
    red.value(r)
    amber.value(a)
    green.value(g)


while True:
    print("STOP")
    lights(1, 0, 0)
    time.sleep(3)
    print("GET READY")
    lights(1, 1, 0)
    time.sleep(1)
    print("GO")
    lights(0, 0, 1)
    time.sleep(3)
    print("CAUTION")
    lights(0, 1, 0)
    time.sleep(1)
`,
        b,
      );
    },
  },
];
