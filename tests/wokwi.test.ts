/**
 * Wokwi projects: diagram.json in and out of the lab. Parts, values, wires and
 * their routes, breadboard holes, the Pico and MicroPython, the code, and a
 * round trip of every example that keeps the circuit connected the same way.
 */
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { lookup, registry } from '../src/app/registry';
import { pinWorld } from '../src/core/circuit/geometry';
import { buildNetlist } from '../src/core/circuit/netlist';
import type { CircuitDocument, Point } from '../src/core/model/circuit';
import type { Project } from '../src/core/project/schema';
import { breadboardPinIn, breadboardPinOut, fromWokwi, parseDiagram, routeOut, routePoints, toWokwi, wokwiLibraries, wokwiTypeOf, WOKWI_MICROPYTHON, type WokwiDiagram } from '../src/core/project/wokwi';
import { isZip, unzip } from '../src/core/project/zip';
import { ALL_EXAMPLES } from '../src/examples/all';
import { orthogonalPath } from '../src/ui/workspace/geometry';

const all = registry.all();
const load = (d: WokwiDiagram, files: { name: string; text: string }[] = []) => fromWokwi(parseDiagram(JSON.stringify(d)), files, lookup, all, 'Test');
const partOf = (p: Project, type: string) => p.circuit.components.find((c) => c.type === type)!;
const sameNet = (c: CircuitDocument, a: [string, string], b: [string, string]) => {
  const n = buildNetlist(c, lookup);
  const na = n.netOf({ componentId: a[0], pinId: a[1] });
  return na !== undefined && na === n.netOf({ componentId: b[0], pinId: b[1] });
};
const pinAt = (c: CircuitDocument, id: string, pin: string) => {
  const inst = c.components.find((x) => x.id === id)!;
  const def = lookup(inst.type)!;
  return pinWorld(inst, def, def.pins.find((p) => p.id === pin)!);
};

describe('wire placement', () => {
  it('follows Wokwi’s instructions: from the source, then from the target last one first', () => {
    // The example of Wokwi's documentation.
    expect(routePoints({ x: 0, y: 0 }, { x: 100, y: 100 }, ['v10', 'h5', '*', 'v-15', 'h10'])).toEqual([
      { x: 0, y: 10 },
      { x: 5, y: 10 },
      { x: 110, y: 85 },
      { x: 110, y: 100 },
    ]);
    expect(routePoints({ x: 0, y: 0 }, { x: 50, y: 20 }, ['v0'])).toEqual([]);
    expect(routePoints({ x: 0, y: 0 }, { x: 50, y: 20 }, ['h-19.2', 'v48', 'h19.2'])).toEqual([
      { x: -19.2, y: 0 },
      { x: -19.2, y: 48 },
      { x: 0, y: 48 },
    ]);
  });

  it('writes the lab’s route so that Wokwi draws the same path', () => {
    const a = { x: 10, y: 10 };
    const b = { x: 200, y: 140 };
    for (const points of [[], [{ x: 60, y: 80 }], [{ x: 60, y: 10 }, { x: 60, y: 140 }], [{ x: 40, y: 30 }, { x: 300, y: 90 }]] as Point[][]) {
      const back = routePoints(a, b, routeOut(a, b, points));
      const path = (pts: Point[]) => simplify(orthogonalPath([a, ...pts, b]));
      expect(path(back)).toEqual(path(points));
    }
  });
});

/** A polyline without repeated or straight-through vertices. */
function simplify(pts: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of pts) {
    if (out.length && Math.abs(out[out.length - 1].x - p.x) < 0.01 && Math.abs(out[out.length - 1].y - p.y) < 0.01) continue;
    if (out.length >= 2) {
      const [o, q] = [out[out.length - 2], out[out.length - 1]];
      if ((Math.abs(o.x - q.x) < 0.01 && Math.abs(q.x - p.x) < 0.01) || (Math.abs(o.y - q.y) < 0.01 && Math.abs(q.y - p.y) < 0.01)) out.pop();
    }
    out.push({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 });
  }
  return out;
}

describe('breadboard holes', () => {
  it('names holes and rail holes as Wokwi does', () => {
    expect(breadboardPinIn('12t.c')).toBe('c12');
    expect(breadboardPinIn('3b.h')).toBe('h3');
    expect(breadboardPinIn('tp.1')).toBe('tp.1');
    expect(breadboardPinIn('bn.6')).toBe('bn.7');
    expect(breadboardPinOut('j30')).toBe('30b.j');
    expect(breadboardPinOut('tn.13')).toBe('tn.11');
  });

  it('maps every hole of the lab’s breadboards there and back', () => {
    for (const type of ['evlab.breadboard-full', 'evlab.breadboard-half', 'evlab.breadboard-mini']) {
      for (const pin of lookup(type)!.pins) expect(breadboardPinIn(breadboardPinOut(pin.id)!)).toBe(pin.id);
    }
  });
});

const ARDUINO: WokwiDiagram = {
  version: 1,
  author: 'A student',
  editor: 'wokwi',
  parts: [
    { type: 'wokwi-arduino-uno', id: 'uno', top: 0, left: 0, attrs: {} },
    { type: 'wokwi-led', id: 'led1', top: -96, left: 140, attrs: { color: 'limegreen', flip: '1' } },
    { type: 'wokwi-resistor', id: 'r1', top: -30, left: 200, rotate: 90, attrs: { value: '330' } },
    { type: 'wokwi-pushbutton', id: 'btn1', top: -120, left: 300, attrs: {} },
    { type: 'wokwi-potentiometer', id: 'pot1', top: -140, left: 420, attrs: { value: '512' } },
    { type: 'wokwi-lcd1602', id: 'lcd1', top: 260, left: 20, attrs: { pins: 'i2c', i2cAddress: '0x3f' } },
    { type: 'wokwi-logic-analyzer', id: 'logic1', top: 300, left: 400, attrs: {} },
    { type: 'wokwi-text', id: 'text1', top: -180, left: 0, attrs: { text: 'Traffic light' } },
  ],
  connections: [
    ['uno:13', 'led1:A', 'green', ['v-20', 'h40', '*', 'v10']],
    ['led1:C', 'r1:1', 'black', []],
    ['r1:2', 'uno:GND.1', 'black', ['v0']],
    ['btn1:1.l', 'uno:2', 'blue', []],
    ['pot1:SIG', 'uno:A0', 'orange', []],
    ['lcd1:SDA', 'uno:A4', 'purple', []],
    ['lcd1:VCC', 'uno:5V', 'red', []],
    ['logic1:D0', 'uno:13', 'gray', []],
    ['uno:13', 'led1:NOPE', 'green', []],
    ['$serialMonitor:RX', 'uno:1', '', []],
  ],
};

describe('importing a Wokwi project', () => {
  const { project, skipped, lost } = load(ARDUINO, [
    { name: 'sketch.ino', text: 'void setup() {\r\n  pinMode(13, OUTPUT);\r\n}\r\nvoid loop() {}\r\n' },
    { name: 'helpers.h', text: '#pragma once\n' },
    { name: 'libraries.txt', text: 'LiquidCrystal I2C\n' },
    { name: 'wokwi-project.txt', text: 'Downloaded from https://wokwi.com/projects/123456789\n' },
  ]);
  const c = project.circuit;

  it('brings each part as the lab’s part, with its values and Wokwi’s defaults', () => {
    expect(c.components.map((x) => x.type)).toEqual(['evlab.arduino-uno', 'evlab.led', 'evlab.resistor', 'evlab.pushbutton', 'evlab.potentiometer', 'evlab.lcd1602-i2c']);
    expect(partOf(project, 'evlab.led').props.color).toBe('green');
    expect(partOf(project, 'evlab.led').flip).toBe(true);
    expect(partOf(project, 'evlab.resistor').props.resistance).toBe('330');
    expect(partOf(project, 'evlab.resistor').rotation).toBe(90);
    // A button without a colour is red on Wokwi.
    expect(partOf(project, 'evlab.pushbutton').props.color).toBe('red');
    expect(partOf(project, 'evlab.potentiometer').props.position).toBeCloseTo(0.5, 2);
    expect(partOf(project, 'evlab.lcd1602-i2c').props.address).toBe('0x3F');
    expect(new Set(c.components.map((x) => x.label)).size).toBe(c.components.length);
  });

  it('places parts drawn the same way exactly where Wokwi has them', () => {
    const led = partOf(project, 'evlab.led');
    expect([led.x, led.y]).toEqual([140, -96]);
  });

  it('keeps the wires, their colours and routes, and says what it could not bring', () => {
    const uno = partOf(project, 'evlab.arduino-uno');
    const led = partOf(project, 'evlab.led');
    const w = c.wires.find((x) => x.from.componentId === uno.id && x.from.pinId === '13')!;
    expect(w.to).toEqual({ componentId: led.id, pinId: 'A' });
    expect(w.color).toBe('#2ecc71');
    const a = pinAt(c, uno.id, '13');
    const b = pinAt(c, led.id, 'A');
    expect(w.points).toEqual(routePoints(a, b, ['v-20', 'h40', '*', 'v10']));
    expect(w.points[0]).toEqual({ x: a.x, y: Math.round((a.y - 20) * 100) / 100 });
    expect(c.wires).toHaveLength(7);
    expect(sameNet(c, [uno.id, '13'], [led.id, 'A'])).toBe(true);
    expect(skipped).toEqual([{ id: 'logic1', type: 'wokwi-logic-analyzer', instrument: true }]);
    // Connections to a part left out go with it; a pin the part does not have is reported.
    expect(lost).toEqual(['uno:13 → led1:NOPE']);
  });

  it('keeps text, the code and where the project came from', () => {
    expect(c.annotations).toEqual([expect.objectContaining({ kind: 'text', text: 'Traffic light', x: 0, y: -180 })]);
    expect(project.firmware.files.map((f) => f.name)).toEqual(['sketch.ino', 'helpers.h']);
    expect(project.firmware.files[0].content).toBe('void setup() {\n  pinMode(13, OUTPUT);\n}\nvoid loop() {}\n');
    expect(project.firmware.language).toBe('arduino');
    expect(project.meta.description).toContain('https://wokwi.com/projects/123456789');
    expect(project.meta.author).toBe('A student');
  });

  it('keeps sketch.ino as the main sketch when the project has other .ino files', () => {
    const files = load(ARDUINO, [
      { name: 'notes.ino', text: '// other\n' },
      { name: 'sketch.ino', text: '// main\n' },
    ]).project.firmware.files;
    expect(files).toEqual([{ name: 'sketch.ino', content: '// main\n' }]);
  });

  it('starts an empty sketch when only the diagram comes', () => {
    const only = load(ARDUINO).project;
    expect(only.firmware.files.map((f) => f.name)).toEqual(['sketch.ino']);
    expect(only.firmware.files[0].content).toContain('void loop()');
  });

  it('refuses what is not a diagram', () => {
    expect(() => parseDiagram('{"version": 1}')).toThrow(/parts/);
    expect(() => parseDiagram('not json')).toThrow(/JSON/);
  });
});

describe('parts in breadboard holes', () => {
  const diagram: WokwiDiagram = {
    version: 1,
    parts: [
      { type: 'wokwi-breadboard-half', id: 'bb1', top: 0, left: 0, attrs: {} },
      // Wokwi's breadboard is drawn a little differently: these positions are a few pixels off the lab's holes.
      { type: 'wokwi-led', id: 'led1', top: 3, left: 101, attrs: { color: 'red' } },
      { type: 'wokwi-resistor', id: 'r1', top: 60, left: 113, rotate: 90, attrs: { value: '220' } },
      { type: 'wokwi-arduino-uno', id: 'uno', top: 250, left: 0, attrs: {} },
    ],
    connections: [
      ['led1:A', 'bb1:12t.c', '', ['$bb']],
      ['led1:C', 'bb1:11t.c', '', ['$bb']],
      ['r1:1', 'bb1:12t.e', '', ['$bb']],
      // 0.6" from row e across the channel: row i.
      ['r1:2', 'bb1:12b.i', '', ['$bb']],
      ['bb1:11t.a', 'uno:GND.1', 'black', ['v0']],
      ['bb1:12b.j', 'uno:13', 'green', ['v0']],
      ['bb1:tp.1', 'uno:5V', 'red', []],
    ],
  };
  const { project, lost } = load(diagram);
  const c = project.circuit;
  const led = partOf(project, 'evlab.led');
  const r = partOf(project, 'evlab.resistor');
  const uno = partOf(project, 'evlab.arduino-uno');
  const bb = partOf(project, 'evlab.breadboard-half');

  it('stands the parts in the lab’s holes', () => {
    const ins = buildNetlist(c, lookup).insertions.map((i) => `${i.pin.componentId}:${i.pin.pinId}>${i.socket.pinId}`);
    expect(ins).toEqual(expect.arrayContaining([`${led.id}:A>c12`, `${led.id}:C>c11`, `${r.id}:1>e12`, `${r.id}:2>i12`]));
    const a = pinAt(c, led.id, 'A');
    const hole = pinAt(c, bb.id, 'c12');
    expect(Math.hypot(a.x - hole.x, a.y - hole.y)).toBeLessThan(0.01);
    expect(lost).toEqual([]);
  });

  it('connects them as on Wokwi', () => {
    expect(sameNet(c, [uno.id, '13'], [r.id, '2'])).toBe(true);
    expect(sameNet(c, [led.id, 'A'], [r.id, '1'])).toBe(true);
    expect(sameNet(c, [led.id, 'C'], [uno.id, 'GND.1'])).toBe(true);
    expect(sameNet(c, [bb.id, 'tp.29'], [uno.id, '5V'])).toBe(true);
    // Only the three drawn wires: the holes are not wires.
    expect(c.wires).toHaveLength(3);
  });

  it('wires a leg that cannot stand in its hole to it', () => {
    const odd = structuredClone(diagram);
    odd.connections[3] = ['r1:2', 'bb1:12b.h', '', ['$bb']];
    const back = load(odd).project;
    const res = partOf(back, 'evlab.resistor');
    const board = partOf(back, 'evlab.breadboard-half');
    expect(back.circuit.wires).toHaveLength(4);
    expect(back.circuit.wires).toContainEqual(expect.objectContaining({ from: { componentId: res.id, pinId: '2' }, to: { componentId: board.id, pinId: 'h12' } }));
  });
});

describe('the Pico and MicroPython', () => {
  const diagram: WokwiDiagram = {
    version: 1,
    parts: [
      { type: 'wokwi-pi-pico', id: 'pico', top: 0, left: 0, attrs: { env: WOKWI_MICROPYTHON } },
      { type: 'wokwi-led', id: 'led1', top: 40, left: 120, attrs: { color: 'blue' } },
    ],
    connections: [
      ['pico:GP15', 'led1:A', 'green', ['h-20', 'v40']],
      ['pico:GND.4', 'led1:C', 'black', []],
    ],
  };
  const main = 'from machine import Pin\nled = Pin(15, Pin.OUT)\nled.on()\n';
  const { project } = load(diagram, [{ name: 'main.py', text: main }, { name: 'tools.py', text: 'X = 1\n' }]);
  const c = project.circuit;
  const pico = partOf(project, 'evlab.rpi-pico');
  const led = partOf(project, 'evlab.led');

  it('brings the board turned like Wokwi’s, its ground pins renamed, at the same place', () => {
    expect(pico.rotation).toBe(270);
    expect(sameNet(c, [pico.id, 'GND.17'], [led.id, 'C'])).toBe(true);
    // Centred where Wokwi's Pico is (20.9 × 52.75 mm).
    const def = lookup(pico.type)!;
    expect(pico.x + def.size.width / 2).toBeCloseTo((20.9 * 96) / 25.4 / 2, 1);
    expect(pico.y + def.size.height / 2).toBeCloseTo((52.75 * 96) / 25.4 / 2, 1);
    // Drawn differently: its wires are routed again.
    expect(c.wires.every((w) => w.points.length === 0)).toBe(true);
  });

  it('says when Wokwi’s code is for the other language', () => {
    const arduinoOnPico = load(diagram, [{ name: 'sketch.ino', text: 'void setup() {}\nvoid loop() {}\n' }]);
    expect(arduinoOnPico.otherLanguage).toBe(true);
    expect(arduinoOnPico.project.firmware.files.map((f) => f.name)).toEqual(['main.py', 'sketch.ino']);
    expect(load(diagram, [{ name: 'main.py', text: main }]).otherLanguage).toBe(false);
  });

  it('keeps main.py and its modules, for MicroPython', () => {
    expect(project.firmware.language).toBe('micropython');
    expect(project.firmware.files).toEqual([
      { name: 'main.py', content: main },
      { name: 'tools.py', content: 'X = 1\n' },
    ]);
  });

  it('writes the Pico back with Wokwi’s MicroPython', () => {
    const out = toWokwi(project, lookup);
    expect(out.diagram.parts[0]).toMatchObject({ type: 'wokwi-pi-pico', attrs: { env: WOKWI_MICROPYTHON } });
    expect(out.diagram.parts[0].rotate).toBeUndefined();
    expect(out.files.map((f) => f.name)).toEqual(['diagram.json', 'main.py', 'tools.py']);
    expect(out.diagram.connections).toContainEqual(['u1:GND.4', 'led1:C', 'black', []]);
  });
});

describe('exporting to Wokwi', () => {
  it('writes the code under Wokwi’s names and the libraries it includes', () => {
    const files = [{ name: 'sketch.ino', content: '#include <LiquidCrystal_I2C.h>\n#include <DHT.h>\n#include <Wire.h>\n#include "helpers.h"\n' }, { name: 'helpers.h', content: '' }];
    expect(wokwiLibraries(files)).toEqual(['LiquidCrystal I2C', 'DHT sensor library', 'Adafruit Unified Sensor']);
  });

  it('names parts after their labels and leaves out what Wokwi does not have', () => {
    const ex = ALL_EXAMPLES.find((e) => e.build(registry).circuit.components.some((c) => lookup(c.type)?.simulation.support !== 'visual-only'))!;
    const out = toWokwi(ex.build(registry), lookup);
    const ids = out.diagram.parts.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[a-z0-9_-]+$/.test(id))).toBe(true);
    expect(JSON.parse(out.files[0].text)).toEqual(out.diagram);
  });

  // Every example: written for Wokwi and read back, the parts Wokwi has keep their
  // values and stay connected exactly as before (no connection lost, none added).
  for (const ex of ALL_EXAMPLES) {
    it(`round trip: ${ex.id}`, () => {
      const original = ex.build(registry);
      const out = toWokwi(original, lookup);
      const back = fromWokwi(parseDiagram(out.files[0].text), out.files.slice(1), lookup, all, original.meta.name);
      expect(back.skipped).toEqual([]);
      expect(back.lost).toEqual([]);
      const kept = original.circuit.components.filter((c) => wokwiTypeOf(lookup(c.type)!));
      expect(out.skipped).toEqual(original.circuit.components.filter((c) => !wokwiTypeOf(lookup(c.type)!) && lookup(c.type)!.simulation.model !== 'connector').map((c) => `${c.label} (${lookup(c.type)!.name})`));
      expect(back.project.circuit.components.map((c) => c.type)).toEqual(kept.map((c) => c.type));
      const idOf = new Map(kept.map((c, i) => [c.id, back.project.circuit.components[i].id]));
      for (const [i, c] of kept.entries()) {
        const b = back.project.circuit.components[i];
        expect(b.props).toEqual(c.props);
        expect(b.rotation).toBe(c.rotation);
        // In place (a part in a breadboard may settle into its hole by a few pixels).
        expect(Math.abs(b.x - c.x)).toBeLessThan(4);
        expect(Math.abs(b.y - c.y)).toBeLessThan(4);
      }
      // Connectivity among the kept parts: same nets before and after.
      const before = buildNetlist(original.circuit, lookup);
      const after = buildNetlist(back.project.circuit, lookup);
      const keys = kept.flatMap((c) => lookup(c.type)!.pins.map((p) => ({ componentId: c.id, pinId: p.id })));
      const netBefore = (k: (typeof keys)[number]) => before.netOf(k);
      const netAfter = (k: (typeof keys)[number]) => after.netOf({ componentId: idOf.get(k.componentId)!, pinId: k.pinId });
      const pairs = new Map<number, number>();
      const reverse = new Map<number, number>();
      for (const k of keys) {
        const nb = netBefore(k)!;
        const na = netAfter(k)!;
        expect(pairs.get(nb) ?? na).toBe(na);
        expect(reverse.get(na) ?? nb).toBe(nb);
        pairs.set(nb, na);
        reverse.set(na, nb);
      }
      expect(back.project.firmware.files.map((f) => f.content)).toEqual(original.firmware.files.filter((f) => out.files.some((o) => o.name === f.name)).map((f) => f.content));
    });
  }
});

/** A zip archive (stored or deflated entries), as Wokwi's project download. */
function zip(files: { name: string; text: string; deflate?: boolean }[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const raw = enc.encode(f.text);
    const data = f.deflate ? new Uint8Array(deflateRawSync(raw)) : raw;
    const name = enc.encode(f.name);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, f.deflate ? 8 : 0, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, name.length, true);
    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(10, f.deflate ? 8 : 0, true);
    dir.setUint32(20, data.length, true);
    dir.setUint32(24, raw.length, true);
    dir.setUint16(28, name.length, true);
    dir.setUint32(42, offset, true);
    chunks.push(new Uint8Array(local.buffer), name, data);
    central.push(new Uint8Array(dir.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  const parts = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

describe('a project downloaded from Wokwi (zip)', () => {
  it('reads stored and deflated files', async () => {
    const diagram = JSON.stringify(ARDUINO);
    const bytes = zip([
      { name: 'diagram.json', text: diagram, deflate: true },
      { name: 'sketch.ino', text: 'void setup(){}\nvoid loop(){}\n' },
      { name: 'libraries.txt', text: '# none\n', deflate: true },
    ]);
    expect(isZip(bytes)).toBe(true);
    const files = await unzip(bytes);
    const text = new TextDecoder();
    expect(files.map((f) => [f.name, text.decode(f.bytes)])).toEqual([
      ['diagram.json', diagram],
      ['sketch.ino', 'void setup(){}\nvoid loop(){}\n'],
      ['libraries.txt', '# none\n'],
    ]);
  });

  it('refuses what is not a zip', async () => {
    expect(isZip(new TextEncoder().encode('{"parts": []}'))).toBe(false);
    await expect(unzip(new Uint8Array(40))).rejects.toThrow(/zip/);
  });
});
