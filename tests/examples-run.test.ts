/**
 * End-to-end check of every example: compile its sketch with PlatformIO and
 * run it in the engine. Slow (tens of seconds); enabled with EVLAB_E2E=1.
 */
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ALL_EXAMPLES } from '../src/examples/all';
import { detectLibraries } from '../src/core/toolchain/libraries';
import { buildNetlist } from '../src/core/circuit/netlist';
import { buildSimSetup } from '../src/core/sim/setup';
import { SimulationEngine } from '../src/core/sim/engine/engine';
import type { SimEvent } from '../src/core/sim/types';
import { lookup, registry } from './helpers';

const root = resolve(__dirname, '..');
const tc = join(root, '.toolchain');
const pio = join(tc, 'penv', process.platform === 'win32' ? 'Scripts/pio.exe' : 'bin/pio');

function compile(files: { name: string; content: string }[], board: string): string {
  const dir = join(tc, 'builds', 'examples-e2e');
  mkdirSync(join(dir, 'src'), { recursive: true });
  for (const f of readdirSync(join(dir, 'src'))) rmSync(join(dir, 'src', f));
  for (const f of files) writeFileSync(join(dir, 'src', f.name), f.content);
  const libs = detectLibraries(files);
  writeFileSync(join(dir, 'platformio.ini'), `[env:e]\nplatform = atmelavr\nboard = ${board}\nframework = arduino\n${libs.length ? `lib_deps =\n${libs.map((l) => `    ${l}`).join('\n')}\n` : ''}`);
  const r = spawnSync(pio, ['run', '-d', dir], { env: { ...process.env, PLATFORMIO_CORE_DIR: join(tc, 'pio-core') }, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stdout + r.stderr);
  return readFileSync(join(dir, '.pio', 'build', 'e', 'firmware.hex'), 'utf8');
}

/** What each example should visibly do within its run time. */
const EXPECT: Record<string, { seconds: number; serial?: RegExp; visual?: (v: Record<string, Record<string, unknown>>) => boolean }> = {
  blink: { seconds: 0.3, visual: (v) => Object.values(v).some((s) => s.value === true) },
  button: { seconds: 0.2, serial: /Press the button/ },
  potentiometer: { seconds: 0.3, serial: /raw:5\d\d/ },
  'traffic-light': { seconds: 0.3, serial: /STOP/ },
  fade: { seconds: 0.5 },
  rgb: { seconds: 0.5 },
  'serial-uart': { seconds: 0.2, serial: /Ready/ },
  'light-meter': { seconds: 0.3, serial: /light:\d+/ },
  thermometer: { seconds: 0.6, serial: /temperature:2[45]\.\d/ },
  transistor: { seconds: 0.3, visual: (v) => Object.values(v).some((s) => s.value === true) },
  mosfet: { seconds: 0.6 },
  ultrasonic: { seconds: 0.4, serial: /distance_cm:(79|80|81)\.\d/ },
  dht22: { seconds: 2.3, serial: /temperature:22\.5 humidity:48\.0/ },
  servo: { seconds: 0.4, serial: /angle:(89|90)/ },
  lcd: { seconds: 0.4, visual: (v) => Object.values(v).some((s) => s.characters && String.fromCharCode(...Array.from(s.characters as Uint8Array).slice(0, 11)) === 'Hello, Lab!') },
  'i2c-lcd': { seconds: 1.5, visual: (v) => Object.values(v).some((s) => s.characters && String.fromCharCode(...Array.from(s.characters as Uint8Array).slice(0, 14)) === 'I2C LCD @ 0x27') },
  'spi-shift': { seconds: 0.3, visual: (v) => Object.values(v).some((s) => Array.isArray(s.values) && (s.values as number[]).some((x) => x === 1)) },
  buzzer: { seconds: 0.3, visual: (v) => Object.values(v).some((s) => s.hasSignal === true && Math.abs((s.frequency as number) - 262) < 3) },
  relay: { seconds: 0.3, serial: /Relay ON/, visual: (v) => Object.values(v).some((s) => s.value === true) },
  'half-adder': { seconds: 0.05 },
};

describe.skipIf(process.env.EVLAB_E2E !== '1')('examples end-to-end (compile + simulate)', () => {
  for (const ex of ALL_EXAMPLES) {
    it(ex.id, () => {
      const p = ex.build(registry);
      const board = p.circuit.components.find((c) => lookup(c.type)?.mcu);
      const firmware: Record<string, string> = {};
      if (board) firmware[board.id] = compile(p.firmware.files, lookup(board.type)!.mcu!.toolchain.board);
      const netlist = buildNetlist(p.circuit, lookup);
      const events: SimEvent[] = [];
      const engine = new SimulationEngine(buildSimSetup(p.circuit, lookup, netlist, firmware), { speed: 1, realtime: true }, (e) => events.push(e));
      engine.start();
      engine.pause();
      const exp = EXPECT[ex.id] ?? { seconds: 0.2 };
      const end = exp.seconds;
      while (engine.now() < end) {
        engine.advance(Math.min(end, engine.now() + 0.01));
        engine.emitFrame();
      }
      const frames = events.filter((e): e is Extract<SimEvent, { type: 'frame' }> => e.type === 'frame');
      const serial = frames.flatMap((f) => f.serial.flatMap((s) => s.data)).map((c) => String.fromCharCode(c)).join('');
      const diags = events.filter((e) => e.type === 'diagnostics').pop() as Extract<SimEvent, { type: 'diagnostics' }> | undefined;
      const errors = (diags?.diagnostics ?? []).filter((d) => d.severity === 'error');
      expect(errors, JSON.stringify(errors)).toEqual([]);
      if (exp.serial) expect(serial).toMatch(exp.serial);
      if (exp.visual) expect(frames.some((f) => exp.visual!(f.visuals))).toBe(true);
    }, 120_000);
  }
});
