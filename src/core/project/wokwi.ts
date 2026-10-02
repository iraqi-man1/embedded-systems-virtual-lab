/**
 * Wokwi projects (wokwi.com) in and out of the lab: their diagram.json (the
 * parts, where they are, the wires and their colours) and the code.
 *
 * Most of the lab's parts are drawn with the same Wokwi elements, so their
 * pins have the same names and places and a diagram carries over exactly,
 * wire routes included. A few are drawn differently (the Pico, breadboards,
 * some modules): their pins are renamed where needed, they are placed by
 * their centre and their wires are routed again. Breadboards: Wokwi names
 * holes "12t.c" and rail holes "tp.3"; parts standing in holes (Wokwi's
 * "$bb" connections) are moved onto the lab's holes. Values carry over where
 * both sides have them (a resistor's resistance, an LED's colour, a sensor's
 * reading), with Wokwi's defaults where the diagram leaves them out.
 */
import { nanoid } from 'nanoid';
import { newText } from '../circuit/annotations';
import { pinWorld } from '../circuit/geometry';
import { buildNetlist, type DefinitionLookup } from '../circuit/netlist';
import type { Annotation, CircuitDocument, ComponentInstance, Point, PropValue, Rotation, Wire } from '../model/circuit';
import type { ComponentDefinition } from '../model/component';
import { formatEngineering, parseEngineering } from '../model/units';
import { defaultProps } from '../sim/setup';
import { detectLibraries } from '../toolchain/libraries';
import { importedName } from './codeFiles';
import { DEFAULT_MAIN_PY, EMPTY_SKETCH, languageOf, MAIN_FILE, sourcesFor, type FirmwareLanguage } from './firmware';
import { newProject, type Project, type SourceFile } from './schema';

// ------------------------------------------------------------------ format

export interface WokwiPart {
  type: string;
  id: string;
  top?: number;
  left?: number;
  rotate?: number;
  hide?: boolean;
  attrs?: Record<string, unknown>;
}

/** Source "part:pin", target "part:pin", colour ("" hides the wire), placement instructions. */
export type WokwiConnection = [string, string, string?, string[]?];

export interface WokwiDiagram {
  version: number;
  author?: string;
  editor?: string;
  parts: WokwiPart[];
  connections: WokwiConnection[];
  dependencies?: Record<string, string>;
}

/** A value on one line, spaced as Wokwi writes it: { "id": "led1", "attrs": {} }, [ "v10", "h5" ]. */
function inline(v: unknown): string {
  if (Array.isArray(v)) return v.length ? `[ ${v.map(inline).join(', ')} ]` : '[]';
  if (v && typeof v === 'object') {
    const entries = Object.entries(v).filter(([, x]) => x !== undefined);
    return entries.length ? `{ ${entries.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')} }` : '{}';
  }
  return JSON.stringify(v);
}

/** diagram.json laid out like Wokwi's own: one part or connection per line. */
export function formatDiagram(d: WokwiDiagram): string {
  const list = (items: unknown[]) => (items.length ? `[\n${items.map((i) => `    ${inline(i)}`).join(',\n')}\n  ]` : '[]');
  return `{\n  "version": ${d.version},\n  "author": ${JSON.stringify(d.author ?? '')},\n  "editor": ${JSON.stringify(d.editor ?? 'wokwi')},\n  "parts": ${list(d.parts)},\n  "connections": ${list(d.connections)},\n  "dependencies": ${inline(d.dependencies ?? {})}\n}\n`;
}

/** Reads a diagram.json; throws an Error saying what is wrong when it is not one. */
export function parseDiagram(text: string): WokwiDiagram {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch (e) {
    throw new Error(`diagram.json is not valid JSON (${(e as Error).message})`);
  }
  const d = raw as Partial<WokwiDiagram> | null;
  if (!d || typeof d !== 'object' || !Array.isArray(d.parts)) throw new Error('diagram.json has no "parts" list');
  const parts = d.parts.filter((p): p is WokwiPart => !!p && typeof p === 'object' && typeof p.type === 'string' && typeof p.id === 'string');
  const connections = (Array.isArray(d.connections) ? d.connections : []).filter(
    (c): c is WokwiConnection => Array.isArray(c) && typeof c[0] === 'string' && typeof c[1] === 'string',
  );
  return { ...d, version: Number(d.version ?? 1), parts, connections };
}

// ------------------------------------------------------------------ parts

type Attrs = Record<string, unknown>;
type Props = Record<string, PropValue>;

interface PartMap {
  /** Wokwi part types; the first one is written on export. */
  wokwi: string[];
  /** The lab's part type. */
  ours: string;
  /** For a Wokwi type two lab parts share: whether this one fits the attributes. */
  when?: (attrs: Attrs) => boolean;
  /** Wokwi pin name → the lab's pin id, for the pins named differently. */
  pins?: Record<string, string>;
  /** Size of Wokwi's drawing (px) when the lab draws the part differently: it is placed by its centre. */
  size?: { width: number; height: number };
  /** The lab's rotation minus Wokwi's (the lab draws the part turned). */
  turn?: Rotation;
  /** Wokwi attributes → the lab's properties (Wokwi's default for a missing attribute). */
  read?: (attrs: Attrs, def: ComponentDefinition) => Props;
  /** The lab's properties → Wokwi attributes. */
  write?: (props: Props, language: FirmwareLanguage) => Attrs;
  breadboard?: boolean;
  /** Read only: the lab writes its connections instead (ground symbols). */
  importOnly?: boolean;
}

const MM = 96 / 25.4;
const mm = (width: number, height: number) => ({ width: width * MM, height: height * MM });

const has = (v: unknown) => v !== undefined && v !== null && v !== '';
const num = (v: unknown, fallback: number) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fallback;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round2 = (v: number) => Math.round(v * 100) / 100;

/** A colour attribute among the part's colour options (Wokwi allows any CSS colour). */
const COLOR_NAMES: Record<string, string> = { lime: 'green', limegreen: 'green', darkgreen: 'green', cyan: 'blue', aqua: 'blue', navy: 'blue', gold: 'yellow', violet: 'purple', magenta: 'purple', fuchsia: 'purple', pink: 'purple', darkorange: 'orange' };
function colorOption(def: ComponentDefinition, v: unknown, fallback: string): string {
  const options = def.properties.find((p) => p.key === 'color')?.options?.map((o) => o.value) ?? [];
  const c = String(v ?? '').trim().toLowerCase();
  const name = options.includes(c) ? c : COLOR_NAMES[c];
  return name && options.includes(name) ? name : fallback;
}

const ohms = (v: unknown) => formatEngineering(parseEngineering(String(v))).replace(/\s+/g, '');
const hexAddress = (v: unknown, fallback: string) => {
  const m = /^0x([0-9a-f]{1,2})$/i.exec(String(v ?? '').trim());
  return m ? `0x${m[1].toUpperCase().padStart(2, '0')}` : fallback;
};
/** Wokwi's threshold voltages as the lab's fraction of the supply (5 V). */
const fraction = (v: unknown, fallbackVolts: number) => round2(clamp(num(v, fallbackVolts) / 5, 0, 1));

/** Colour of an LED or a button. */
const colored = (wokwi: string, ours: string, fallback: string): PartMap => ({
  wokwi: [wokwi],
  ours,
  read: (a, def) => ({ color: colorOption(def, a.color, fallback) }),
  write: (p) => ({ color: String(p.color) }),
});

/** Position of a potentiometer: Wokwi 0–1023, the lab 0–1. */
const knob = (wokwi: string, ours: string): PartMap => ({
  wokwi: [wokwi],
  ours,
  read: (a) => ({ position: round2(clamp(num(a.value, 0) / 1023, 0, 1)) }),
  write: (p) => ({ value: String(Math.round(num(p.position, 0) * 1023)) }),
});

const PICO_GROUNDS = { 'GND.1': 'GND.2', 'GND.2': 'GND.7', 'GND.3': 'GND.12', 'GND.4': 'GND.17', 'GND.5': 'GND.b2', 'GND.6': 'GND.b7', 'GND.7': 'AGND', 'GND.8': 'GND.b17' };
/** MicroPython firmware Wokwi runs on the Pico (one Wokwi hosts). */
export const WOKWI_MICROPYTHON = 'micropython-20231227-v1.22.0';

const PARTS: PartMap[] = [
  { wokwi: ['wokwi-resistor'], ours: 'evlab.resistor', read: (a) => ({ resistance: ohms(has(a.value) ? a.value : '1000') }), write: (p) => ({ value: String(parseEngineering(String(p.resistance))) }) },
  colored('wokwi-led', 'evlab.led', 'red'),
  colored('wokwi-pushbutton', 'evlab.pushbutton', 'red'),
  colored('wokwi-pushbutton-6mm', 'evlab.pushbutton-6mm', 'red'),
  knob('wokwi-potentiometer', 'evlab.potentiometer'),
  knob('wokwi-slide-potentiometer', 'evlab.slide-potentiometer'),
  { wokwi: ['wokwi-slide-switch'], ours: 'evlab.slide-switch', read: (a) => ({ position: has(a.value) && a.value !== '0' ? 1 : 0 }), write: (p) => ({ value: num(p.position, 0) ? '1' : '' }) },
  { wokwi: ['wokwi-rgb-led'], ours: 'evlab.rgb-led', read: (a) => ({ common: a.common === 'cathode' ? 'cathode' : 'anode' }), write: (p) => ({ common: String(p.common) }) },
  {
    wokwi: ['wokwi-7segment'],
    ours: 'evlab.7segment',
    when: (a) => !has(a.digits) || String(a.digits) === '1',
    read: (a) => ({ common: a.common === 'cathode' ? 'cathode' : 'anode' }),
    write: (p) => ({ common: String(p.common) }),
  },
  { wokwi: ['wokwi-lcd1602'], ours: 'evlab.lcd1602-i2c', when: (a) => a.pins === 'i2c', read: (a) => ({ address: hexAddress(a.i2cAddress, '0x27') }), write: (p) => ({ pins: 'i2c', i2cAddress: String(p.address) }) },
  { wokwi: ['wokwi-lcd1602'], ours: 'evlab.lcd1602', when: (a) => a.pins !== 'i2c' },
  { wokwi: ['wokwi-lcd2004'], ours: 'evlab.lcd2004', when: (a) => a.pins !== 'i2c' },
  { wokwi: ['wokwi-ssd1306'], ours: 'evlab.ssd1306', read: (a) => ({ address: hexAddress(a.i2cAddress, '0x3C') }), write: (p) => ({ i2cAddress: String(p.address).toLowerCase() }) },
  { wokwi: ['board-ssd1306'], ours: 'evlab.ssd1306', pins: { SDA: 'DATA', SCL: 'CLK', VCC: 'VIN' }, size: mm(27.7, 22.6), read: (a) => ({ address: hexAddress(a.i2cAddress, '0x3C') }) },
  {
    wokwi: ['wokwi-dht22'],
    ours: 'evlab.dht22',
    read: (a) => ({ temperature: num(a.temperature, 24), humidity: clamp(num(a.humidity, 40), 0, 100) }),
    write: (p) => ({ temperature: String(p.temperature), humidity: String(p.humidity) }),
  },
  { wokwi: ['wokwi-hc-sr04'], ours: 'evlab.hc-sr04', read: (a) => ({ distance: clamp(num(a.distance, 400), 2, 450) }), write: (p) => ({ distance: String(p.distance) }) },
  { wokwi: ['wokwi-ntc-temperature-sensor'], ours: 'evlab.ntc-module', read: (a) => ({ temperature: num(a.temperature, 24) }), write: (p) => ({ temperature: String(p.temperature) }) },
  {
    wokwi: ['wokwi-photoresistor-sensor'],
    ours: 'evlab.ldr-module',
    read: (a) => ({ lux: clamp(num(a.lux, 500), 0.1, 100000), threshold: fraction(a.threshold, 2.5) }),
    write: (p) => ({ lux: String(p.lux), threshold: String(round2(num(p.threshold, 0.5) * 5)) }),
  },
  { wokwi: ['wokwi-gas-sensor'], ours: 'evlab.mq2', read: (a) => ({ threshold: fraction(a.threshold, 4.4) }), write: (p) => ({ threshold: String(round2(num(p.threshold, 0.88) * 5)) }) },
  { wokwi: ['wokwi-pir-motion-sensor'], ours: 'evlab.pir', read: (a) => ({ holdTime: clamp(num(a.delayTime, 5), 0.5, 300) }), write: (p) => ({ delayTime: String(p.holdTime) }) },
  {
    wokwi: ['wokwi-mpu6050'],
    ours: 'evlab.mpu6050',
    read: (a) => ({ gx: num(a.rotationX, 0), gy: num(a.rotationY, 0), gz: num(a.rotationZ, 0), temperature: num(a.temperature, 24) }),
    write: (p) => ({ rotationX: String(p.gx), rotationY: String(p.gy), rotationZ: String(p.gz), temperature: String(p.temperature) }),
  },
  {
    wokwi: ['wokwi-ds1307'],
    ours: 'evlab.ds1307',
    read: (a) => ({ startTime: has(a.initTime) && !['now', '0'].includes(String(a.initTime)) ? String(a.initTime) : '' }),
    write: (p) => ({ initTime: String(p.startTime || 'now') }),
  },
  { wokwi: ['wokwi-relay-module'], ours: 'evlab.relay-module', read: (a) => ({ trigger: a.transistor === 'pnp' ? 'low' : 'high' }), write: (p) => ({ transistor: p.trigger === 'low' ? 'pnp' : 'npn' }) },
  {
    wokwi: ['wokwi-74hc595'],
    ours: 'evlab.74hc595',
    pins: { Q0: 'QA', Q1: 'QB', Q2: 'QC', Q3: 'QD', Q4: 'QE', Q5: 'QF', Q6: 'QG', Q7: 'QH', DS: 'SER', SHCP: 'SRCLK', STCP: 'RCLK', MR: 'SRCLR', Q7S: "QH'" },
  },
  {
    wokwi: ['wokwi-74hc165'],
    ours: 'evlab.74hc165',
    pins: { D0: 'A', D1: 'B', D2: 'C', D3: 'D', D4: 'E', D5: 'F', D6: 'G', D7: 'H', PL: 'SH/LD', CP: 'CLK', CE: 'CLKINH', Q7: 'QH', Q7_N: "QH'", DS: 'SER' },
  },
  { wokwi: ['wokwi-a4988'], ours: 'evlab.a4988', pins: { ENABLE: 'EN', RESET: 'RST', SLEEP: 'SLP', 'GND.1': 'GND' } },
  {
    wokwi: ['wokwi-pi-pico', 'board-pi-pico-w', 'board-pi-pico-2', 'board-pi-pico-2w'],
    ours: 'evlab.rpi-pico',
    pins: PICO_GROUNDS,
    size: mm(20.9, 52.75),
    turn: 270,
    write: (_p, language) => (language === 'micropython' ? { env: WOKWI_MICROPYTHON } : {}),
  },
  { wokwi: ['wokwi-ds18b20', 'board-ds18b20'], ours: 'evlab.ds18b20', size: mm(8.564, 13.388) },
  { wokwi: ['board-bmp180'], ours: 'evlab.bmp180', size: mm(18.04, 12.38) },
  { wokwi: ['board-mfrc522'], ours: 'evlab.rc522', size: mm(59.496, 39.964) },
  { wokwi: ['wokwi-attiny85'], ours: 'evlab.attiny85' },
  { wokwi: ['wokwi-max7219-matrix'], ours: 'evlab.max7219-matrix' },
  { wokwi: ['wokwi-breadboard'], ours: 'evlab.breadboard-full', breadboard: true },
  { wokwi: ['wokwi-breadboard-half'], ours: 'evlab.breadboard-half', breadboard: true },
  { wokwi: ['wokwi-breadboard-mini'], ours: 'evlab.breadboard-mini', breadboard: true },
  { wokwi: ['wokwi-gnd'], ours: 'evlab.ground', importOnly: true },
];

/** Parts the lab has as an instrument instead (not a part on the canvas). */
const INSTRUMENTS = new Set(['wokwi-logic-analyzer']);

/** The map for a Wokwi part: the table first, then any lab part drawn with that Wokwi element. */
function mapOf(type: string, attrs: Attrs, lookup: DefinitionLookup, all: ComponentDefinition[]): PartMap | null {
  const listed = PARTS.filter((m) => m.wokwi.includes(type));
  if (listed.length) return listed.find((m) => !m.when || m.when(attrs)) ?? null;
  const def = all.find((d) => d.visual.kind === 'wokwi' && d.visual.tag === type && !PARTS.some((m) => m.ours === d.type));
  return def && lookup(def.type) ? { wokwi: [type], ours: def.type } : null;
}

/** The map a lab part is exported with (null: Wokwi has no such part). */
function exportMapOf(def: ComponentDefinition): PartMap | null {
  const listed = PARTS.find((m) => m.ours === def.type);
  if (listed) return listed.importOnly ? null : listed;
  return def.visual.kind === 'wokwi' ? { wokwi: [def.visual.tag], ours: def.type } : null;
}

/** The Wokwi part a lab part is written as (null: none; ground symbols, net labels and junctions become connections). */
export const wokwiTypeOf = (def: ComponentDefinition) => exportMapOf(def)?.wokwi[0] ?? null;

/** Same drawing on both sides: positions, pins and wire routes carry over exactly. */
const sameDrawing = (def: ComponentDefinition, wokwiType: string) => def.visual.kind === 'wokwi' && def.visual.tag === wokwiType;

// ------------------------------------------------------------------ pins

/** Wokwi breadboard pin → the lab's: "12t.c" → "c12", "3b.h" → "h3", "tp.6" (6th hole of the rail) → "tp.7" (column 7). */
export function breadboardPinIn(name: string): string | null {
  const hole = /^(\d+)[tb]\.([a-j])$/.exec(name);
  if (hole) return `${hole[2]}${hole[1]}`;
  const rail = /^([tb][pn])\.(\d+)$/.exec(name);
  if (!rail) return null;
  const n = Number(rail[2]);
  // Rail holes come in groups of five; the lab numbers them by the column they are in.
  return `${rail[1]}.${n + Math.floor((n - 1) / 5)}`;
}

/** The lab's breadboard pin → Wokwi's (inverse of `breadboardPinIn`). */
export function breadboardPinOut(id: string): string | null {
  const hole = /^([a-j])(\d+)$/.exec(id);
  if (hole) return `${hole[2]}${'abcde'.includes(hole[1]) ? 't' : 'b'}.${hole[1]}`;
  const rail = /^([tb][pn])\.(\d+)$/.exec(id);
  if (!rail) return null;
  const c = Number(rail[2]);
  return `${rail[1]}.${c - Math.floor(c / 6)}`;
}

function pinIn(map: PartMap, def: ComponentDefinition, name: string): string | null {
  const id = map.breadboard ? breadboardPinIn(name) : (map.pins?.[name] ?? name);
  return id && def.pins.some((p) => p.id === id) ? id : null;
}

function pinOut(map: PartMap, id: string): string | null {
  if (map.breadboard) return breadboardPinOut(id);
  const renamed = Object.entries(map.pins ?? {}).find(([, ours]) => ours === id);
  return renamed ? renamed[0] : id;
}

// ------------------------------------------------------------------ wires

const WIRE_IN: Record<string, string> = {
  green: '#2ecc71',
  lime: '#2ecc71',
  limegreen: '#2ecc71',
  darkgreen: '#2ecc71',
  red: '#e74c3c',
  darkred: '#e74c3c',
  crimson: '#e74c3c',
  black: '#222222',
  blue: '#3498db',
  darkblue: '#3498db',
  navy: '#3498db',
  cyan: '#3498db',
  aqua: '#3498db',
  dodgerblue: '#3498db',
  yellow: '#f1c40f',
  gold: '#f1c40f',
  orange: '#e67e22',
  darkorange: '#e67e22',
  purple: '#9b59b6',
  violet: '#9b59b6',
  magenta: '#9b59b6',
  fuchsia: '#9b59b6',
  blueviolet: '#9b59b6',
  white: '#ecf0f1',
  gray: '#95a5a6',
  grey: '#95a5a6',
  silver: '#95a5a6',
  brown: '#8b5a2b',
};
const WIRE_OUT: Record<string, string> = Object.fromEntries(
  Object.entries({ green: '#2ecc71', red: '#e74c3c', black: '#222222', blue: '#3498db', gold: '#f1c40f', orange: '#e67e22', purple: '#9b59b6', white: '#ecf0f1', gray: '#95a5a6', brown: '#8b5a2b' }).map(([n, hex]) => [hex, n]),
);
/** Wokwi hides wires with no colour; the lab draws them grey. */
const HIDDEN_WIRE = '#95a5a6';

export function wireColorIn(color: string | undefined): string {
  const c = (color ?? '').trim().toLowerCase();
  if (!c) return HIDDEN_WIRE;
  return WIRE_IN[c] ?? (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(c) ? c : WIRE_IN.green);
}

export const wireColorOut = (color: string) => WIRE_OUT[color.toLowerCase()] ?? color;

const near = (a: Point, b: Point) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;

/**
 * Waypoints of a wire placed with Wokwi's instructions: "v10" / "h-5" move from
 * the source pin; those after "*" move from the target pin, last one first.
 */
export function routePoints(a: Point, b: Point, route: readonly string[] = []): Point[] {
  const star = route.indexOf('*');
  const walk = (from: Point, steps: readonly string[]) => {
    const out: Point[] = [];
    let p = from;
    for (const s of steps) {
      const m = /^([hv])\s*(-?\d+(?:\.\d+)?)$/.exec(String(s).trim());
      if (!m) continue;
      const d = Number(m[2]);
      p = m[1] === 'h' ? { x: p.x + d, y: p.y } : { x: p.x, y: p.y + d };
      out.push(p);
    }
    return out;
  };
  const head = walk(a, star < 0 ? route : route.slice(0, star));
  const tail = star < 0 ? [] : walk(b, route.slice(star + 1).reverse()).reverse();
  const out: Point[] = [];
  for (const p of [...head, ...tail]) if (!near(out[out.length - 1] ?? a, p)) out.push({ x: round2(p.x), y: round2(p.y) });
  while (out.length && near(out[out.length - 1], b)) out.pop();
  return out;
}

const move = (axis: 'h' | 'v', d: number) => `${axis}${round2(d)}`;

/**
 * Wokwi instructions that draw the lab's route: every leg, the elbows the lab
 * adds (horizontal first; into the pin, along the longer distance first), and
 * the last straight stretch left for Wokwi to finish.
 */
export function routeOut(a: Point, b: Point, points: readonly Point[]): string[] {
  const anchors = [a, ...points, b];
  const out: string[] = [];
  for (let i = 1; i < anchors.length; i++) {
    const p = anchors[i - 1];
    const q = anchors[i];
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const bothWays = Math.abs(dx) > 0.5 && Math.abs(dy) > 0.5;
    if (i === anchors.length - 1) {
      // Wokwi draws the remaining straight line itself.
      if (bothWays) out.push(Math.abs(dx) >= Math.abs(dy) ? move('h', dx) : move('v', dy));
    } else {
      if (Math.abs(dx) > 0.01) out.push(move('h', dx));
      if (Math.abs(dy) > 0.01) out.push(move('v', dy));
    }
  }
  return out;
}

// ------------------------------------------------------------------ import

export interface WokwiImport {
  project: Project;
  /** Wokwi parts the lab has no part for. */
  skipped: { id: string; type: string; instrument: boolean }[];
  /** Connections that could not be made ("from → to"): a pin the lab's part does not have, or a part the diagram does not list. */
  lost: string[];
  /** The code is all in the other language than the board runs (an Arduino sketch for the Pico, which runs MicroPython in the lab). */
  otherLanguage: boolean;
}

interface Placed {
  inst: ComponentInstance;
  def: ComponentDefinition;
  map: PartMap;
  exact: boolean;
}

/** Wokwi's own files in a project download (not code). */
const WOKWI_FILES = new Set(['diagram.json', 'libraries.txt', 'wokwi-project.txt', 'wokwi.toml']);

/** The lab's project for a Wokwi diagram and the project's other files (sketch.ino, main.py, libraries.txt…). */
export function fromWokwi(diagram: WokwiDiagram, files: { name: string; text: string }[], lookup: DefinitionLookup, all: ComponentDefinition[], name = 'Wokwi project'): WokwiImport {
  const project = newProject(name);
  const circuit: CircuitDocument = { components: [], wires: [], annotations: [] };
  const annotations: Annotation[] = [];
  const skipped: WokwiImport['skipped'] = [];
  const lost: string[] = [];
  const placed = new Map<string, Placed>();
  const labels = new Map<string, number>();

  for (const part of diagram.parts) {
    const attrs = (part.attrs && typeof part.attrs === 'object' ? part.attrs : {}) as Attrs;
    const left = num(part.left, 0);
    const top = num(part.top, 0);
    if (part.type === 'wokwi-text') {
      if (has(attrs.text)) annotations.push({ ...newText(nanoid(10), { x: left, y: top }), text: String(attrs.text) });
      continue;
    }
    const map = mapOf(part.type, attrs, lookup, all);
    const def = map && lookup(map.ours);
    if (!map || !def) {
      skipped.push({ id: part.id, type: part.type, instrument: INSTRUMENTS.has(part.type) });
      continue;
    }
    const rotation = ((((Math.round(num(part.rotate, 0) / 90) * 90 + (map.turn ?? 0)) % 360) + 360) % 360) as Rotation;
    // Placed by the centre when the two drawings differ in size.
    const x = map.size ? left + map.size.width / 2 - def.size.width / 2 : left;
    const y = map.size ? top + map.size.height / 2 - def.size.height / 2 : top;
    const n = (labels.get(def.designator) ?? 0) + 1;
    labels.set(def.designator, n);
    const inst: ComponentInstance = {
      id: nanoid(10),
      type: def.type,
      x: round2(x),
      y: round2(y),
      rotation,
      label: `${def.designator}${n}`,
      props: { ...defaultProps(def), ...map.read?.(attrs, def) },
    };
    if (part.type === 'wokwi-led' && has(attrs.flip) && attrs.flip !== '0') inst.flip = true;
    circuit.components.push(inst);
    placed.set(part.id, { inst, def, map, exact: sameDrawing(def, part.type) });
  }

  // Connections: wires, and parts standing in breadboard holes.
  const ends = (ref: string) => {
    const i = ref.indexOf(':');
    const partId = i < 0 ? ref : ref.slice(0, i);
    const pinName = i < 0 ? '' : ref.slice(i + 1);
    const at = placed.get(partId);
    const pinId = at ? pinIn(at.map, at.def, pinName) : null;
    return { partId, at, pinId };
  };
  const leftOut = new Set(skipped.map((p) => p.id));
  const inserted = new Map<Placed, { pinId: string; board: Placed; hole: string }[]>();
  const wires: { a: Placed; aPin: string; b: Placed; bPin: string; color: string; route: string[] }[] = [];
  for (const [from, to, color, route] of diagram.connections) {
    const a = ends(from);
    const b = ends(to);
    // The serial monitor and other Wokwi services: the lab has its own. Parts left out are reported already.
    if (a.partId.startsWith('$') || b.partId.startsWith('$') || leftOut.has(a.partId) || leftOut.has(b.partId)) continue;
    if (!a.at || !a.pinId || !b.at || !b.pinId) {
      lost.push(`${from} → ${to}`);
      continue;
    }
    const steps = Array.isArray(route) ? route.map(String) : [];
    if (steps.includes('$bb') && a.at.map.breadboard !== b.at.map.breadboard) {
      const [part, board] = a.at.map.breadboard ? [b, a] : [a, b];
      const list = inserted.get(part.at!) ?? [];
      list.push({ pinId: part.pinId!, board: board.at!, hole: board.pinId! });
      inserted.set(part.at!, list);
      continue;
    }
    wires.push({ a: a.at, aPin: a.pinId, b: b.at, bPin: b.pinId, color: wireColorIn(color), route: steps });
  }

  // Parts in breadboard holes: moved so that their legs stand in the lab's holes
  // (the two breadboard drawings differ slightly); a leg that still misses its
  // hole gets a wire to it.
  const pinOf = (p: Placed, id: string) => pinWorld(p.inst, p.def, p.def.pins.find((x) => x.id === id)!);
  for (const [part, legs] of inserted) {
    const first = legs[0];
    const hole = pinOf(first.board, first.hole);
    const leg = pinOf(part, first.pinId);
    part.inst.x = round2(part.inst.x + hole.x - leg.x);
    part.inst.y = round2(part.inst.y + hole.y - leg.y);
    for (const l of legs) {
      const h = pinOf(l.board, l.hole);
      const p = pinOf(part, l.pinId);
      if (Math.hypot(h.x - p.x, h.y - p.y) > 2) wires.push({ a: part, aPin: l.pinId, b: l.board, bPin: l.hole, color: HIDDEN_WIRE, route: [] });
    }
  }

  for (const w of wires) {
    // Routes are kept where both ends are drawn as on Wokwi (breadboard holes are close enough).
    const keep = (w.a.exact || w.a.map.breadboard) && (w.b.exact || w.b.map.breadboard);
    const wire: Wire = {
      id: nanoid(10),
      from: { componentId: w.a.inst.id, pinId: w.aPin },
      to: { componentId: w.b.inst.id, pinId: w.bPin },
      points: keep ? routePoints(pinOf(w.a, w.aPin), pinOf(w.b, w.bPin), w.route) : [],
      color: w.color,
    };
    circuit.wires.push(wire);
  }
  if (annotations.length) circuit.annotations = annotations;
  else delete circuit.annotations;

  // The code: the board's language decides which main file it needs.
  const board = circuit.components.map((c) => lookup(c.type)).find((d) => d?.mcu);
  const language = languageOf(board?.mcu);
  const code: SourceFile[] = [];
  // sketch.ino and main.py first: another .ino of the project does not replace the main sketch.
  const mainFirst = [...files].sort((x, y) => Number(!/(^|[\\/])(sketch\.ino|main\.py)$/i.test(x.name)) - Number(!/(^|[\\/])(sketch\.ino|main\.py)$/i.test(y.name)));
  for (const f of mainFirst) {
    const base = f.name.split(/[\\/]/).pop() ?? f.name;
    if (WOKWI_FILES.has(base.toLowerCase())) continue;
    const to = importedName(base);
    if (to && !code.some((c) => c.name === to)) code.push({ name: to, content: f.text.replace(/\r\n/g, '\n') });
  }
  const otherLanguage = code.length > 0 && !sourcesFor(language, code).length;
  if (!code.some((c) => c.name === MAIN_FILE[language])) code.unshift({ name: MAIN_FILE[language], content: language === 'micropython' ? DEFAULT_MAIN_PY : EMPTY_SKETCH });
  project.circuit = circuit;
  project.firmware = { language, files: code, target: null };
  const url = files.find((f) => /wokwi-project\.txt$/i.test(f.name))?.text.match(/https:\/\/wokwi\.com\/projects\/\d+/)?.[0];
  project.meta.description = url ? `Imported from Wokwi: ${url}` : 'Imported from Wokwi';
  project.meta.author = typeof diagram.author === 'string' ? diagram.author : '';
  return { project, skipped, lost, otherLanguage };
}

// ------------------------------------------------------------------ export

export interface WokwiExport {
  diagram: WokwiDiagram;
  /** diagram.json first, then the code under the names Wokwi expects, and libraries.txt for the libraries the code includes. */
  files: { name: string; text: string }[];
  /** Parts Wokwi has no part for ("Q1 (2N2222 Transistor)"); their connections are kept where other parts share them. */
  skipped: string[];
}

class Groups {
  private parent = new Map<string, string>();
  find(k: string): string {
    let r = k;
    while (this.parent.has(r) && this.parent.get(r) !== r) r = this.parent.get(r)!;
    this.parent.set(k, r);
    return r;
  }
  join(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/** Library names for libraries.txt (Arduino's names, as Wokwi's Library Manager lists them). */
const LIBRARY_NAMES: Record<string, string> = { LiquidCrystal_I2C: 'LiquidCrystal I2C' };
export function wokwiLibraries(files: SourceFile[]): string[] {
  const names = detectLibraries(files).map((spec) => {
    const n = spec.replace(/@.*$/, '').split('/').pop()!;
    return LIBRARY_NAMES[n] ?? n;
  });
  return [...new Set(names)];
}

/** The project as a Wokwi project: diagram.json, the code and libraries.txt. */
export function toWokwi(project: Project, lookup: DefinitionLookup): WokwiExport {
  const { circuit } = project;
  const parts: WokwiPart[] = [];
  const skipped: string[] = [];
  const out = new Map<string, { id: string; map: PartMap; def: ComponentDefinition; exact: boolean }>();
  const ids = new Set<string>();
  /** Wokwi ids from the lab's labels (R1 → r1), unique. */
  const uniqueId = (label: string) => {
    const base = label.toLowerCase().replace(/[^a-z0-9_-]+/g, '') || 'part';
    let id = base;
    for (let n = 2; ids.has(id); n++) id = `${base}_${n}`;
    ids.add(id);
    return id;
  };
  // The board the code is for (the project's target, else the first board).
  const boards = circuit.components.filter((c) => lookup(c.type)?.mcu);
  const board = boards.find((b) => b.id === project.firmware.target) ?? boards[0];
  const language = languageOf(board && lookup(board.type)?.mcu);

  for (const inst of circuit.components) {
    const def = lookup(inst.type);
    const map = def && exportMapOf(def);
    // Ground symbols, net labels and junctions only join wires: their connections are written directly.
    if (def && !map && def.simulation.model === 'connector') continue;
    if (!def || !map) {
      skipped.push(`${inst.label} (${def?.name ?? inst.type})`);
      continue;
    }
    const id = uniqueId(inst.label);
    const rotate = (((inst.rotation - (map.turn ?? 0)) % 360) + 360) % 360;
    const left = map.size ? inst.x + def.size.width / 2 - map.size.width / 2 : inst.x;
    const top = map.size ? inst.y + def.size.height / 2 - map.size.height / 2 : inst.y;
    const attrs: Attrs = { ...map.write?.(inst.props, language) };
    if (inst.flip && map.wokwi[0] === 'wokwi-led') attrs.flip = '1';
    parts.push({ type: map.wokwi[0], id, top: round2(top), left: round2(left), ...(rotate ? { rotate } : {}), attrs });
    out.set(inst.id, { id, map, def, exact: sameDrawing(def, map.wokwi[0]) });
  }
  for (const a of circuit.annotations ?? []) {
    if (a.kind === 'text' && a.text.trim()) parts.push({ type: 'wokwi-text', id: uniqueId('text1'), top: round2(a.y), left: round2(a.x), attrs: { text: a.text } });
  }

  const connections: WokwiConnection[] = [];
  const groups = new Groups();
  const key = (componentId: string, pinId: string) => `${componentId}:${pinId}`;
  const ref = (componentId: string, pinId: string) => {
    const o = out.get(componentId);
    const name = o && pinOut(o.map, pinId);
    return o && name ? `${o.id}:${name}` : null;
  };
  // Pins the part joins inside (breadboard strips, a board's GND pins) are joined on Wokwi too.
  for (const inst of circuit.components) {
    const o = out.get(inst.id);
    for (const group of o?.def.internalConnections ?? []) for (const pin of group.slice(1)) groups.join(key(inst.id, group[0]), key(inst.id, pin));
  }
  const pinAt = (componentId: string, pinId: string) => {
    const inst = circuit.components.find((c) => c.id === componentId)!;
    const def = out.get(componentId)!.def;
    return pinWorld(inst, def, def.pins.find((p) => p.id === pinId)!);
  };
  for (const w of circuit.wires) {
    const a = ref(w.from.componentId, w.from.pinId);
    const b = ref(w.to.componentId, w.to.pinId);
    if (!a || !b) continue;
    const exact = out.get(w.from.componentId)!.exact && out.get(w.to.componentId)!.exact;
    const route = exact ? routeOut(pinAt(w.from.componentId, w.from.pinId), pinAt(w.to.componentId, w.to.pinId), w.points) : [];
    connections.push([a, b, wireColorOut(w.color), route]);
    groups.join(key(w.from.componentId, w.from.pinId), key(w.to.componentId, w.to.pinId));
  }
  const netlist = buildNetlist(circuit, lookup);
  for (const { pin, socket } of netlist.insertions) {
    const a = ref(pin.componentId, pin.pinId);
    const b = ref(socket.componentId, socket.pinId);
    if (!a || !b || !out.get(socket.componentId)!.map.breadboard) continue;
    connections.push([a, b, '', ['$bb']]);
    groups.join(key(pin.componentId, pin.pinId), key(socket.componentId, socket.pinId));
  }
  // Whatever else joins pins (ground symbols, net labels, junctions, parts Wokwi
  // does not have in between): hidden wires, so the circuit works the same.
  for (const net of netlist.nets) {
    const firstOf = new Map<string, string>();
    for (const p of net.pins) {
      const r = ref(p.componentId, p.pinId);
      if (!r) continue;
      const g = groups.find(key(p.componentId, p.pinId));
      if (!firstOf.has(g)) firstOf.set(g, r);
    }
    const [head, ...rest] = [...firstOf.values()];
    for (const r of rest) connections.push([head, r, '', []]);
  }

  const diagram: WokwiDiagram = { version: 1, author: project.meta.author || 'Virtual Lab', editor: 'wokwi', parts, connections, dependencies: {} };
  const code = sourcesFor(language, project.firmware.files);
  const main = code.find((f) => f.name === MAIN_FILE[language]);
  const files = [{ name: 'diagram.json', text: formatDiagram(diagram) }, ...[...(main ? [main] : []), ...code.filter((f) => f !== main)].map((f) => ({ name: f.name, text: f.content }))];
  const libraries = language === 'arduino' ? wokwiLibraries(code) : [];
  if (libraries.length) files.push({ name: 'libraries.txt', text: `# Wokwi Library List\n# See https://docs.wokwi.com/guides/libraries\n\n${libraries.join('\n')}\n` });
  return { diagram, files, skipped };
}
