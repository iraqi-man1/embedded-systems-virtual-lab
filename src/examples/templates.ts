/**
 * Starting points for a new project (start screen › New): a board, usually a
 * breadboard with its power rails already wired, and a sketch skeleton.
 * Built from real part geometry like the examples.
 */
import type { ComponentInstance } from '../core/model/circuit';
import type { ComponentRegistry } from '../core/registry/registry';
import { newProject, type Project } from '../core/project/schema';
import type { MessageKey } from '../i18n';
import { DEFAULT_MAIN_PY, EMPTY_SKETCH } from '../core/project/firmware';
import { CircuitBuilder, WIRE } from './builder';
import { picoBase } from './catalogPico';

export interface TemplateInfo {
  id: string;
  title: MessageKey;
  description: MessageKey;
  /** Icon shown when no preview is available. */
  icon: string;
  build: (registry: ComponentRegistry, name: string) => Project;
}

const SKETCH = EMPTY_SKETCH;

const SERIAL_SKETCH = `void setup() {
  // Runs once when the board starts.
  Serial.begin(9600);
  Serial.println("Hello from the virtual lab!");
}

void loop() {
  // Runs over and over again.
}
`;

function project(name: string, sketch: string, b?: CircuitBuilder): Project {
  const p = newProject(name);
  p.firmware.files = [{ name: 'sketch.ino', content: sketch }];
  if (b) p.circuit = b.doc;
  return p;
}

function pythonProject(name: string, main: string, b: CircuitBuilder): Project {
  const p = newProject(name);
  p.firmware = { language: 'micropython', files: [{ name: 'main.py', content: main }], target: null };
  p.circuit = b.doc;
  return p;
}

/** Column of a breadboard rail hole straight above or below a point. */
function railHole(b: CircuitBuilder, bb: ComponentInstance, rail: 'tp' | 'tn' | 'bp' | 'bn', x: number): string {
  const first = b.pin(bb, `${rail}.1`).x;
  const col = Math.max(1, Math.min(30, Math.round((x - first) / 9.6) + 1));
  return `${rail}.${col}`;
}

export const TEMPLATES: TemplateInfo[] = [
  {
    id: 'blank',
    title: 'Empty project',
    description: 'A blank canvas. Add a board and parts from the library.',
    icon: 'new',
    build: (_r, name) => project(name, SKETCH),
  },
  {
    id: 'uno',
    title: 'Arduino Uno',
    description: 'An Arduino Uno and a sketch that greets you on the serial monitor.',
    icon: 'chip',
    build: (r, name) => {
      const b = new CircuitBuilder(r);
      b.add('evlab.arduino-uno', 0, 0);
      return project(name, SERIAL_SKETCH, b);
    },
  },
  {
    id: 'uno-breadboard',
    title: 'Arduino Uno + breadboard',
    description: 'Uno with a half breadboard whose bottom rails carry 5 V and GND.',
    icon: 'grid',
    build: (r, name) => {
      const b = new CircuitBuilder(r);
      const uno = b.add('evlab.arduino-uno', 0, 0);
      const bb = b.add('evlab.breadboard-half', -48, -240);
      const gnd = b.pin(uno, 'GND.1');
      b.wire(uno, 'GND.1', bb, railHole(b, bb, 'bn', gnd.x), WIRE.black);
      // 5 V comes from the power header under the board: around the left side to the + rail.
      const v5 = b.pin(uno, '5V');
      const plus = b.pin(bb, 'bp.1');
      b.wire(uno, '5V', bb, 'bp.1', WIRE.red, [
        { x: v5.x, y: v5.y + 38.4 },
        { x: plus.x - 38.4, y: v5.y + 38.4 },
        { x: plus.x - 38.4, y: plus.y },
      ]);
      return project(name, SERIAL_SKETCH, b);
    },
  },
  {
    id: 'nano-breadboard',
    title: 'Arduino Nano + breadboard',
    description: 'A compact Nano next to a breadboard with 5 V and GND on the rails.',
    icon: 'grid',
    build: (r, name) => {
      const b = new CircuitBuilder(r);
      const bb = b.add('evlab.breadboard-half', 0, 0);
      // Turned so its power pins face the breadboard's bottom rails.
      const nano = b.add('evlab.arduino-nano', 72, 240, {}, 180);
      for (const [pin, rail, color] of [
        ['5V', 'bp', WIRE.red],
        ['GND.1', 'bn', WIRE.black],
      ] as const) {
        const p = b.pin(nano, pin);
        b.wire(nano, pin, bb, railHole(b, bb, rail, p.x), color);
      }
      return project(name, SERIAL_SKETCH, b);
    },
  },
  {
    id: 'pico-breadboard',
    title: 'Raspberry Pi Pico + MicroPython',
    description: 'A Pico under a breadboard with 3.3 V and GND on the bottom rails, and a main.py that blinks its LED.',
    icon: 'code',
    build: (r, name) => {
      const { b, pico, bb } = picoBase(r);
      // 3V3 is on the bottom pin row: around the left side up to the + rail.
      const v33 = b.pin(pico, '3V3');
      const plus = b.pin(bb, 'bp.1');
      const x = plus.x - 38.4;
      b.wire(pico, '3V3', bb, 'bp.1', WIRE.red, [
        { x: v33.x, y: v33.y + 19.2 },
        { x, y: v33.y + 19.2 },
        { x, y: plus.y },
      ]);
      return pythonProject(name, DEFAULT_MAIN_PY, b);
    },
  },
  {
    id: 'logic',
    title: 'Digital logic (no microcontroller)',
    description: 'A breadboard powered by a 5 V bench supply, for gates, switches and LEDs.',
    icon: 'zap',
    build: (r, name) => {
      const b = new CircuitBuilder(r);
      const bb = b.add('evlab.breadboard-half', 0, 0);
      const psu = b.add('evlab.bench-supply', -170, 120, { voltage: 5 });
      for (const [pin, rail, color] of [
        ['+', 'bp', WIRE.red],
        ['-', 'bn', WIRE.black],
      ] as const) {
        const p = b.pin(psu, pin);
        const hole = b.pin(bb, `${rail}.1`);
        b.wire(psu, pin, bb, `${rail}.1`, color, [{ x: hole.x - 28.8 - (rail === 'bn' ? 9.6 : 0), y: p.y }, { x: hole.x - 28.8 - (rail === 'bn' ? 9.6 : 0), y: hole.y }]);
      }
      return project(
        name,
        `// No microcontroller: build the circuit from gates, switches and LEDs.
// Press Run (F5) to power it and click the switches.
void setup() {}
void loop() {}
`,
        b,
      );
    },
  },
];
