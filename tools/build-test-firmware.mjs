// Compiles tests/fixtures/*.ino with the local PlatformIO toolchain into .hex files.
// A fixture can request libraries with header lines such as:
//   // lib_deps: adafruit/DHT sensor library, adafruit/Adafruit Unified Sensor
// Usage: node tools/build-test-firmware.mjs [fixture-name-prefix]
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const tc = join(root, '.toolchain');
const pio = join(tc, 'penv', process.platform === 'win32' ? 'Scripts/pio.exe' : 'bin/pio');
const dir = join(tc, 'builds', 'test-fixtures');
const fixtures = join(root, 'tests', 'fixtures');
const only = process.argv[2];
mkdirSync(join(dir, 'src'), { recursive: true });

for (const f of readdirSync(fixtures).filter((n) => n.endsWith('.ino') && (!only || n.startsWith(only)))) {
  const source = readFileSync(join(fixtures, f), 'utf8');
  const libs = [...source.matchAll(/^\/\/ lib_deps: (.+)$/gm)].flatMap((m) => m[1].split(',').map((x) => x.trim()));
  const libLines = libs.length ? `lib_deps =\n${libs.map((l) => `    ${l}`).join('\n')}\n` : '';
  writeFileSync(join(dir, 'platformio.ini'), `[env:uno]\nplatform = atmelavr\nboard = uno\nframework = arduino\n${libLines}`);
  for (const old of readdirSync(join(dir, 'src'))) rmSync(join(dir, 'src', old));
  copyFileSync(join(fixtures, f), join(dir, 'src', 'main.ino'));
  const r = spawnSync(pio, ['run', '-d', dir], {
    env: { ...process.env, PLATFORMIO_CORE_DIR: join(tc, 'pio-core'), PLATFORMIO_SETTING_ENABLE_TELEMETRY: 'No' },
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
    process.exit(1);
  }
  copyFileSync(join(dir, '.pio', 'build', 'uno', 'firmware.hex'), join(fixtures, f.replace('.ino', '.hex')));
  console.log('built', f, libs.length ? `(libs: ${libs.join(', ')})` : '');
}
