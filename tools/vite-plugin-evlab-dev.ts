/**
 * DEVELOPMENT ONLY. Mirrors the Rust toolchain commands (src-tauri/src/toolchain.rs)
 * over HTTP so the UI can be exercised in a regular browser via `npm run dev`.
 * The packaged desktop application never uses this: it calls Tauri commands.
 */
import type { Plugin } from 'vite';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '.toolchain');
const PIO = process.platform === 'win32' ? join(ROOT, 'penv', 'Scripts', 'pio.exe') : join(ROOT, 'penv', 'bin', 'pio');

interface CompileRequest {
  platform: string;
  board: string;
  framework: string;
  files: { name: string; content: string }[];
  buildFlags?: string[];
  libDeps?: string[];
}

const ident = (s: string) => /^[A-Za-z0-9_-]+$/.test(s);
const safeName = (s: string) => /^[^/\\:.][^/\\:]*\.(ino|cpp|c|h|hpp|S)$/.test(s);

function run(args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((res) => {
    const p = spawn(PIO, args, {
      env: {
        ...process.env,
        PLATFORMIO_CORE_DIR: join(ROOT, 'pio-core'),
        PLATFORMIO_SETTING_ENABLE_TELEMETRY: 'No',
        PLATFORMIO_SETTING_CHECK_PLATFORMIO_INTERVAL: '3650',
        PLATFORMIO_DISABLE_PROGRESSBAR: 'true',
        PLATFORMIO_NO_ANSI: 'true',
        PYTHONIOENCODING: 'utf-8',
      },
      windowsHide: true,
    });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => res({ code: code ?? 1, out }));
    p.on('error', (e) => res({ code: 1, out: String(e) }));
  });
}

export function parseDiagnostics(log: string, userFiles: string[]) {
  const re = /^((?:[A-Za-z]:)?[^:\r\n]+):(\d+):(?:(\d+):)? (fatal error|error|warning|note): (.*?)\r?$/gm;
  const out = [];
  for (const m of log.matchAll(re)) {
    const raw = m[1].trim();
    let base = raw.split(/[\\/]/).pop()!;
    if (base.endsWith('.ino.cpp')) base = base.slice(0, -4);
    out.push({
      file: userFiles.includes(base) ? base : raw,
      line: Number(m[2]),
      column: m[3] ? Number(m[3]) : 1,
      severity: m[4] === 'fatal error' ? 'error' : m[4],
      message: m[5],
    });
  }
  return out;
}

let queue: Promise<unknown> = Promise.resolve();

async function compile(req: CompileRequest) {
  const started = Date.now();
  if (![req.platform, req.board, req.framework].every(ident)) throw new Error('Invalid identifier');
  if (!req.files?.length || !req.files.every((f) => safeName(f.name))) throw new Error('Invalid source files');
  const dir = join(ROOT, 'builds', `${req.platform}-${req.board}-${req.framework}`);
  const src = join(dir, 'src');
  mkdirSync(src, { recursive: true });
  for (const f of readdirSync(src)) if (statSync(join(src, f)).isFile()) rmSync(join(src, f));
  for (const f of req.files) writeFileSync(join(src, f.name), f.content);
  let ini = `[platformio]\nsrc_dir = src\n\n[env:sim]\nplatform = ${req.platform}\nboard = ${req.board}\nframework = ${req.framework}\n`;
  if (req.buildFlags?.length) ini += `build_flags = ${req.buildFlags.join(' ')}\n`;
  if (req.libDeps?.length) ini += `lib_deps =\n${req.libDeps.map((l) => `    ${l}`).join('\n')}\n`;
  writeFileSync(join(dir, 'platformio.ini'), ini);
  const { code, out } = await run(['run', '-e', 'sim', '-d', dir]);
  const hexPath = join(dir, '.pio', 'build', 'sim', 'firmware.hex');
  const success = code === 0 && existsSync(hexPath);
  const usage = (what: string) => {
    const m = new RegExp(`${what}:.*?used (\\d+) bytes`).exec(out);
    return m ? Number(m[1]) : null;
  };
  return {
    success,
    hex: success ? readFileSync(hexPath, 'utf8') : null,
    log: out,
    diagnostics: parseDiagnostics(out, req.files.map((f) => f.name)),
    flashBytes: usage('Flash'),
    ramBytes: usage('RAM'),
    durationMs: Date.now() - started,
  };
}

export function evlabDevToolchain(): Plugin {
  return {
    name: 'evlab-dev-toolchain',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__evlab/toolchain/status', async (_req, res) => {
        const installed = existsSync(PIO);
        const platforms = existsSync(join(ROOT, 'pio-core', 'platforms')) ? readdirSync(join(ROOT, 'pio-core', 'platforms')) : [];
        let pioVersion: string | null = null;
        if (installed) pioVersion = (await run(['--version'])).out.trim();
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ installed: installed && platforms.length > 0, root: ROOT, pioVersion, platforms }));
      });
      // Saves the output of tools/measure-wokwi.html (fixed destination).
      server.middlewares.use('/__evlab/dev/save-wokwi-geometry', (req, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          const data = JSON.parse(body);
          const dest = resolve(import.meta.dirname, '..', 'src', 'components', 'builtin', 'wokwi-geometry.json');
          mkdirSync(resolve(dest, '..'), { recursive: true });
          writeFileSync(dest, JSON.stringify(data, null, 1));
          res.end('saved');
        });
      });
      server.middlewares.use('/__evlab/compile', (req, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          const job = queue.then(() => compile(JSON.parse(body)));
          queue = job.catch(() => undefined);
          job
            .then((r) => {
              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify(r));
            })
            .catch((e) => {
              res.statusCode = 400;
              res.end(String(e?.message ?? e));
            });
        });
      });
    },
  };
}
