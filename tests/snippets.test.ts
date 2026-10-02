/**
 * Code snippets work: the Arduino ones compile (against a small stand-in for
 * the Arduino API, when a C++ compiler is installed), the MicroPython ones run
 * on the simulated Pico without a traceback.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildNetlist } from '../src/core/circuit/netlist';
import { newProject } from '../src/core/project/schema';
import { SimulationEngine } from '../src/core/sim/engine/engine';
import { buildSimSetup } from '../src/core/sim/setup';
import type { SimEvent } from '../src/core/sim/types';
import { CircuitBuilder, WIRE } from '../src/examples/builder';
import { SNIPPETS, snippetsFor } from '../src/examples/snippets';
import { lookup, registry } from './helpers';

const compiler = (() => {
  for (const cxx of ['g++', 'clang++']) {
    try {
      execFileSync(cxx, ['--version'], { stdio: 'ignore' });
      return cxx;
    } catch {
      /* not installed */
    }
  }
  return null;
})();

describe('code snippets', () => {
  it('each language has its own set, with unique ids', () => {
    for (const lang of ['arduino', 'micropython'] as const) {
      const ids = snippetsFor(lang).map((s) => s.id);
      expect(ids.length).toBeGreaterThanOrEqual(8);
      expect(new Set(ids).size).toBe(ids.length);
    }
    for (const s of SNIPPETS) expect(s.code.trim().split('\n')[0], s.id).toMatch(s.language === 'arduino' ? /^\/\/ / : /^# /);
  });

  describe.skipIf(!compiler)('Arduino snippets compile', () => {
    const dir = mkdtempSync(join(tmpdir(), 'evlab-snippets-'));
    for (const s of snippetsFor('arduino')) {
      it(s.id, () => {
        const body = s.where === 'top' ? `${s.code}\nvoid setup() {}\nvoid loop() {}\n` : `void setup() {}\nvoid loop() {\n${s.code}\n}\n`;
        const file = join(dir, `${s.id}.cpp`);
        writeFileSync(file, `#include <Arduino.h>\nHardwareSerial Serial;\n${body}`);
        execFileSync(compiler!, ['-fsyntax-only', '-std=gnu++11', '-Wall', '-Werror', '-Wno-unused-variable', '-I', join(__dirname, 'fixtures', 'arduino-stub'), file], { stdio: 'pipe' });
      });
    }
  });

  describe('MicroPython snippets run on the Pico', () => {
    const image = new Uint8Array(readFileSync(join(__dirname, '..', 'public', 'firmware', 'micropython-rpi-pico.uf2')));
    /** Calls that exercise the functions a snippet defines. */
    const USE: Record<string, string> = {
      debounce: 'print(button_pressed())',
      servo: 'angle(45)',
      'adc-average': 'print(read_average())',
    };
    for (const s of snippetsFor('micropython')) {
      it(s.id, () => {
        const b = new CircuitBuilder(registry);
        const pico = b.add('evlab.rpi-pico', 0, 0);
        if (s.id === 'i2c-scan') {
          // The scan needs a module on the wires: an I2C LCD (address 0x27).
          const lcd = b.add('evlab.lcd1602-i2c', 300, 200);
          b.wire(pico, 'GP4', lcd, 'SDA', WIRE.blue);
          b.wire(pico, 'GP5', lcd, 'SCL', WIRE.yellow);
          b.wire(pico, 'VBUS', lcd, 'VCC', WIRE.red);
          b.wire(pico, 'GND.b2', lcd, 'GND', WIRE.black);
        }
        const p = newProject('Snippet');
        p.circuit = b.doc;
        const main = `${s.code}\n${USE[s.id] ?? ''}\nprint("snippet done")\n`;
        const setup = buildSimSetup(p.circuit, lookup, buildNetlist(p.circuit, lookup), {}, [], { [pico.id]: { kind: 'micropython', image, files: [{ name: 'main.py', content: main }] } });
        const events: SimEvent[] = [];
        const engine = new SimulationEngine(setup, { speed: 1, realtime: true }, (e) => events.push(e));
        engine.start();
        engine.pause();
        const serial = () =>
          events
            .filter((e): e is Extract<SimEvent, { type: 'frame' }> => e.type === 'frame')
            .flatMap((f) => f.serial.flatMap((x) => x.data))
            .map((c) => String.fromCharCode(c))
            .join('');
        const end = engine.now() + 2;
        while (engine.now() < end && !/snippet done|Traceback/.test(serial())) {
          engine.advance(Math.min(end, engine.now() + 0.01));
          engine.emitFrame();
        }
        engine.stop();
        expect(serial(), s.id).not.toContain('Traceback');
        // Snippets with an endless loop never print the last line; the others do.
        if (!/while True:/.test(s.code)) expect(serial(), s.id).toContain('snippet done');
        if (s.id === 'i2c-scan') expect(serial()).toContain("['0x27']");
      });
    }
  });
});
