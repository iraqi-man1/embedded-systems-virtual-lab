// Drives the desktop application through the flows that once left the window
// empty: the parts guide and every way back from it (its Back button, Esc,
// Alt+←, the mouse's Back button), the start screen, New project, the
// floating code editor and a dropped Wokwi project, in English and Arabic.
// After each step the window must show the expected page (checked in the page
// and on a screenshot), and at the end no problem may be recorded in
// Help › Report a Problem.
// Screenshots go to .toolchain/e2e/.
//
//   node tools/e2e-desktop.mjs --exe src-tauri/target/release/evlab.exe   (Windows: the real app and its WebView2)
//   node tools/e2e-desktop.mjs --url http://localhost:1420/              (development: any Chromium)
//
// Needs playwright-core (or playwright); --url also needs a Chromium build.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const require = createRequire(import.meta.url);
let chromium;
for (const name of ['playwright-core', 'playwright']) {
  try {
    ({ chromium } = require(name));
    break;
  } catch {
    /* try the next one */
  }
}
if (!chromium) {
  console.error('Playwright is not installed (npm i --no-save playwright-core).');
  process.exit(2);
}

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const exe = arg('--exe');
const url = arg('--url');
/** Only the parts guide round trips (they also exist in older versions, to compare). */
const guideOnly = process.argv.includes('--guide-only');
if (!exe === !url) {
  console.error('Usage: node tools/e2e-desktop.mjs --exe <app.exe> | --url <dev server>');
  process.exit(2);
}
const out = resolve(import.meta.dirname, '..', '.toolchain', 'e2e');
mkdirSync(out, { recursive: true });

let failures = 0;
const log = [];
function check(name, ok, detail = '') {
  const line = `${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`;
  console.log(line);
  log.push(line);
  if (!ok) failures++;
}

// ------------------------------------------------------------------ connect
let app;
let browser;
let page;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A step that hangs (a frozen page, an unanswered call) fails the test instead of the build.
const watchdog = setTimeout(() => {
  console.error('FAIL the test did not finish within 8 minutes');
  if (process.platform === 'win32') windowsDiagnostics();
  app?.kill();
  process.exit(1);
}, 8 * 60_000);

/** Windows: what is on the screen and which WebView2 is installed, when the app cannot be reached. */
function windowsDiagnostics() {
  const ps = (script) => {
    try {
      return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 30000 }).trim();
    } catch (e) {
      return `(failed: ${e.message.split('\n')[0]})`;
    }
  };
  console.log('WebView2 runtime:', ps(`(Get-ItemProperty 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}' -ErrorAction SilentlyContinue).pv`));
  console.log('Processes:', ps("Get-Process | Where-Object { $_.ProcessName -match 'evlab|msedgewebview2|WerFault' } | ForEach-Object { $_.ProcessName + ' ' + $_.Id + ' ' + $_.MainWindowTitle } | Out-String"));
  const shot = join(out, 'desktop.png').replace(/\//g, '\\');
  console.log(
    'Desktop screenshot:',
    ps(
      `Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b=[System.Windows.Forms.SystemInformation]::VirtualScreen; $bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height; $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Left,$b.Top,0,0,$bmp.Size); $bmp.Save('${shot}'); "$($b.Width)x$($b.Height) saved"`,
    ),
  );
}

if (exe) {
  const port = 9333;
  app = spawn(resolve(exe), [], {
    // The app opens the WebView2 DevTools port for this variable (src-tauri/src/lib.rs, main_window).
    env: { ...process.env, EVLAB_WEBVIEW_DEBUG_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  app.stdout.on('data', (d) => process.stdout.write(`[app] ${d}`));
  app.stderr.on('data', (d) => process.stdout.write(`[app] ${d}`));
  app.on('exit', (code) => console.log(`[app] exited with ${code}`));
  let ready = false;
  for (let i = 0; i < 120 && !ready; i++) {
    ready = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.ok, () => false);
    if (!ready) await sleep(500);
  }
  if (!ready) {
    console.error(`The application did not open its WebView2 debugging port (still running: ${app.exitCode === null}).`);
    windowsDiagnostics();
    app.kill();
    process.exit(1);
  }
  console.log('→ connecting to the WebView2 of the application');
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 30000 });
  for (let i = 0; i < 60 && !page; i++) {
    page = browser
      .contexts()
      .flatMap((c) => c.pages())
      .find((p) => /tauri\.localhost|tauri:\/\//.test(p.url()));
    if (!page) await sleep(500);
  }
  if (!page) {
    console.error('No application page found:', browser.contexts().flatMap((c) => c.pages()).map((p) => p.url()));
    windowsDiagnostics();
    app.kill();
    process.exit(1);
  }
} else {
  browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.goto(url);
  // A first start: no settings, no recent projects.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

const pageErrors = [];
page.setDefaultTimeout(15000);
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && pageErrors.push(m.text()));
const cdp = await page.context().newCDPSession(page);

// ------------------------------------------------------------------ checks
let shotNo = 0;

/** Fails a call that does not answer in time (a frozen page would otherwise hang the test). */
const within = (promise, ms, what) => Promise.race([promise, sleep(ms).then(() => Promise.reject(new Error(`${what} did not answer in ${ms / 1000} s`)))]);

/** The window shows `what` ('home' | 'guide' | 'editor'), on top and inside the window, and is not an empty picture. */
async function showing(what, step) {
  console.log(`→ ${step}`);
  await sleep(350);
  const name = `${String(++shotNo).padStart(2, '0')}-${step.replace(/\W+/g, '-').toLowerCase()}`;
  const png = await within(page.screenshot(), 20000, 'screenshot').catch(() => null);
  if (png) writeFileSync(join(out, `${name}.png`), png);
  const state = await within(
    page.evaluate(
      async ({ what, b64 }) => {
        const vw = innerWidth;
        const vh = innerHeight;
        const shown = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return `${sel} missing`;
          const r = el.getBoundingClientRect();
          if (r.width < 20 || r.height < 10 || r.bottom <= 0 || r.right <= 0 || r.top >= vh || r.left >= vw) return `${sel} outside the window (${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)})`;
          const x = Math.min(vw - 1, Math.max(0, r.left + Math.min(r.width / 2, 40)));
          const y = Math.min(vh - 1, Math.max(0, r.top + Math.min(r.height / 2, 12)));
          const top = document.elementFromPoint(x, y);
          if (!top || !(el.contains(top) || top.contains(el))) return `${sel} covered by ${top ? top.className || top.tagName : 'nothing'}`;
          return '';
        };
        const need = {
          home: ['.home .home-top', '.home-tabs'],
          guide: ['.guide .home-top', '.guide-nav', '.guide-main'],
          editor: ['.menubar', '.toolbar', '.workspace', '.statusbar'],
        }[what];
        const problems = need.map(shown).filter(Boolean);
        if (what === 'editor' && document.querySelector('.home')) problems.push('a page still covers the editor');
        const frame = [document.scrollingElement, document.body, document.getElementById('root'), document.querySelector('.app')]
          .filter(Boolean)
          .map((el) => el.scrollTop + el.scrollLeft);
        if (frame.some(Boolean)) problems.push(`window frame scrolled (${frame.join(',')})`);
        // A blank picture has (almost) one colour.
        let colours = -1;
        if (b64) {
          const img = new Image();
          img.src = `data:image/png;base64,${b64}`;
          await img.decode();
          const c = document.createElement('canvas');
          c.width = 96;
          c.height = 64;
          const g = c.getContext('2d');
          g.drawImage(img, 0, 0, c.width, c.height);
          const d = g.getImageData(0, 0, c.width, c.height).data;
          const set = new Set();
          for (let i = 0; i < d.length; i += 4) set.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4));
          colours = set.size;
        }
        return { problems, colours, href: location.href };
      },
      { what, b64: png ? png.toString('base64') : null },
    ),
    20000,
    'the page',
  ).catch((e) => ({ problems: [`page not reachable: ${e.message}`], colours: -1, href: page.url() }));
  if (state.colours >= 0 && state.colours < 8) state.problems.push(`the window is empty (${state.colours} colours)`);
  if (!/tauri\.localhost|tauri:\/\/|localhost:\d+/.test(state.href)) state.problems.push(`the window left the application: ${state.href}`);
  check(`${step}: ${what} shown`, !state.problems.length, state.problems.join('; '));
  return !state.problems.length;
}

async function click(selector, step) {
  try {
    await page.locator(selector).first().click({ timeout: 5000 });
    return true;
  } catch (e) {
    check(`${step}: click ${selector}`, false, e.message.split('\n')[0]);
    return false;
  }
}

async function mouseBack() {
  const [w, h] = await page.evaluate(() => [innerWidth, innerHeight]);
  const at = { x: Math.round(w / 2), y: Math.round(h / 2), button: 'back', clickCount: 1 };
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...at });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...at });
}

/** In the guide: open several parts from the overview and the side list. */
async function browseParts(step) {
  // F1 opens the selected part's page: start from the overview.
  await page.waitForSelector('.guide-nav-item.overview', { timeout: 10000 });
  await page.locator('.guide-nav-item.overview').click();
  await page.waitForSelector('.guide-tile', { timeout: 10000 });
  await page.locator('.guide-tile').nth(3).click();
  await page.waitForSelector('.guide-part');
  await page.locator('.guide-nav-item').nth(40).click();
  await page.locator('.guide-nav-item').nth(90).click();
  await page.locator('.guide-nav-item').last().click();
  await page.waitForSelector('.guide-part');
  return showing('guide', `${step}: a part page`);
}

/** The code editor: detached with its button, moved by its tab bar, then dragged back to its place. */
async function floatingEditor(step) {
  await click('.code-bar-btn', `${step}: detach`);
  await sleep(300);
  const floating = await page.evaluate(() => {
    const slot = document.querySelector('.code-slot.floating');
    if (!slot) return 'not floating';
    const r = slot.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + 12);
    if (!slot.contains(top)) return `covered by ${top?.className}`;
    if (r.left < 0 || r.top < 0 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5) return 'outside the window';
    return document.querySelector('.code-slot .monaco-editor') ? '' : 'the editor is missing';
  });
  check(`${step}: the editor floats on top, inside the window`, !floating, floating);
  const bar = await page.locator('.code-tabs-fill').boundingBox();
  const [w, h, rtl] = await page.evaluate(() => [innerWidth, innerHeight, document.documentElement.dir === 'rtl']);
  await page.mouse.move(bar.x + 8, bar.y + 8);
  await page.mouse.down();
  await page.mouse.move(w / 2, h / 2, { steps: 6 });
  await page.mouse.up();
  await showing('editor', `${step}: moved`);
  // Back to its place: drag the bar to the edge (left in Arabic).
  const bar2 = await page.locator('.code-tabs-fill').boundingBox();
  const area = await page.locator('.center-top').boundingBox();
  await page.mouse.move(bar2.x + 8, bar2.y + 8);
  await page.mouse.down();
  await page.mouse.move(rtl ? area.x + 10 : area.x + area.width - 10, area.y + area.height / 2, { steps: 8 });
  const preview = await page.locator('.dock-preview').count();
  await page.mouse.up();
  await sleep(300);
  const docked = await page.evaluate(() => !!document.querySelector('.code-slot:not(.floating) .monaco-editor'));
  check(`${step}: dragged back, it docks in its place`, preview === 1 && docked, `preview ${preview}, docked ${docked}`);
  await showing('editor', `${step}: docked`);
}

/** A zip archive of deflated files, as Wokwi's project download. */
function zip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const raw = Buffer.from(f.text);
    const data = deflateRawSync(raw);
    const name = Buffer.from(f.name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt32LE(offset, 42);
    chunks.push(local, name, data);
    central.push(dir, name);
    offset += 30 + name.length + data.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.reduce((n, c) => n + c.length, 0), 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, ...central, end]);
}

/** A Wokwi project (its zip) dropped on the window opens: parts in breadboard holes, wires and the code. */
async function wokwiProject(step) {
  const diagram = {
    version: 1,
    author: 'e2e',
    editor: 'wokwi',
    parts: [
      { type: 'wokwi-breadboard-half', id: 'bb1', top: -70, left: -10, attrs: {} },
      { type: 'wokwi-arduino-uno', id: 'uno', top: 160, left: 0, attrs: {} },
      { type: 'wokwi-led', id: 'led1', top: -45, left: 90, attrs: { color: 'yellow' } },
      { type: 'wokwi-resistor', id: 'r1', top: 10, left: 105, rotate: 90, attrs: { value: '220' } },
    ],
    connections: [
      ['led1:A', 'bb1:12t.c', '', ['$bb']],
      ['led1:C', 'bb1:11t.c', '', ['$bb']],
      ['r1:1', 'bb1:12t.e', '', ['$bb']],
      ['r1:2', 'bb1:12b.i', '', ['$bb']],
      ['bb1:11t.a', 'uno:GND.1', 'black', ['v-10', 'h-40', '*', 'v-20']],
      ['bb1:12b.j', 'uno:13', 'green', ['v20']],
    ],
  };
  const bytes = zip([
    { name: 'diagram.json', text: JSON.stringify(diagram) },
    { name: 'sketch.ino', text: 'void setup() {\n  pinMode(13, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(13, !digitalRead(13));\n  delay(300);\n}\n' },
  ]);
  if (exe) {
    // File › Wokwi › Open Wokwi Project… reads the chosen files through the application.
    const file = join(out, 'wokwi-project.zip');
    writeFileSync(file, bytes);
    const read = await within(
      page.evaluate(async (path) => {
        const b = new Uint8Array(await window.__TAURI_INTERNALS__.invoke('read_binary_file', { path }));
        return [b.length, b[0], b[1], b[b.length - 22]];
      }, file),
      10000,
      'reading the zip',
    ).catch((e) => [e.message]);
    check(`${step}: the application reads a zip`, read[0] === bytes.length && read[1] === 0x50 && read[2] === 0x4b && read[3] === 0x50, JSON.stringify(read));
  }
  await page.evaluate((b64) => {
    const dt = new DataTransfer();
    dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'wokwi-project.zip', { type: 'application/zip' }));
    window.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, bytes.toString('base64'));
  const opened = await page
    .waitForFunction(() => document.querySelectorAll('.workspace .comp').length === 4 && /wokwi-project/.test(document.querySelector('.menu-title')?.textContent ?? ''), null, { timeout: 8000 })
    .then(
      () => true,
      () => false,
    );
  check(`${step}: the dropped project opens with its parts`, opened, `${await page.locator('.workspace .comp').count()} parts, title ${await page.locator('.menu-title').textContent()}`);
  await showing('editor', `${step}: opened`);
}

// ------------------------------------------------------------------ steps
try {
  await page.waitForSelector('.home', { timeout: 30000 });
  await showing('home', 'start');

  // Start screen › Learn › Parts guide › a part › Back: the start screen, same tab.
  await click('.home-tab:nth-child(4)', 'learn tab');
  await click('.learn-actions .btn:nth-child(4)', 'guide from learn');
  await browseParts('guide from the start screen');
  await click('.guide .home-top .btn', 'guide back');
  await showing('home', 'back from the guide to the start screen');
  check('the start screen is on the same tab', (await page.locator('.home-tab.on').count()) === 1 && (await page.locator('.home-tab:nth-child(4).on').count()) === 1);

  // New project: creates a project and opens the editor.
  await click(guideOnly ? 'text=Go to the editor' : '.btn.new-project', 'new project');
  await page.waitForSelector('.home', { state: 'detached', timeout: 10000 }).catch(() => undefined);
  await showing('editor', 'new project');

  // On a first start the tour starts by itself: it shows over the editor, and Esc ends it.
  const tour = await page.waitForSelector('.tour-callout', { timeout: 5000 }).then(
    () => true,
    () => false,
  );
  if (!guideOnly) check('the first-run tour starts', tour);
  if (tour) {
    await showing('editor', 'first-run tour');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.tour-callout', { state: 'detached', timeout: 3000 }).catch(() => undefined);
    check('Esc ends the tour', (await page.locator('.tour-callout').count()) === 0);
  }

  // Editor › F1 › parts › each way back: the editor, whole.
  const ways = [
    ['the Back button', () => click('.guide .home-top .btn', 'guide back')],
    ['Esc', () => page.keyboard.press('Escape')],
    ...(guideOnly ? [] : [['Alt+←', () => page.keyboard.press('Alt+ArrowLeft')]]),
    ['the mouse Back button', mouseBack],
  ];
  for (const [how, back] of ways) {
    await page.locator('.workspace').click({ position: { x: 30, y: 30 } });
    await page.keyboard.press('F1');
    await browseParts(`guide from the editor, back with ${how}`);
    await back();
    await showing('editor', `back with ${how}`);
  }

  // The mouse Back button elsewhere must not leave the application.
  await mouseBack();
  await showing('editor', 'mouse Back button in the editor');

  if (!guideOnly) await floatingEditor('code editor');
  if (!guideOnly) await wokwiProject('wokwi project');


  // Add to canvas from a part page.
  await page.keyboard.press('F1');
  await browseParts('add to canvas');
  await click('.guide-head-row .btn.primary', 'add to canvas');
  await showing('editor', 'after Add to canvas');

  // Interface size (the desktop app zooms its WebView): parts still take clicks where they are drawn.
  if (exe && !guideOnly) {
    const dpr0 = await page.evaluate(() => devicePixelRatio);
    await page.locator('.workspace').click({ position: { x: 30, y: 30 } });
    await page.keyboard.press('Control+Alt+Equal');
    await page.keyboard.press('Control+Alt+Equal');
    await sleep(500);
    const dpr1 = await page.evaluate(() => devicePixelRatio);
    check('Ctrl+Alt+= makes the interface larger', dpr1 > dpr0 * 1.2, `device pixel ratio ${dpr0} → ${dpr1}`);
    const part = page.locator('.workspace .comp').first();
    const pb = await part.boundingBox();
    if (pb) {
      await page.mouse.click(pb.x + pb.width / 2, pb.y + pb.height / 2);
      await sleep(200);
      check('a part takes a click where it is drawn at 125 %', (await part.getAttribute('class'))?.includes('selected'), await part.getAttribute('class'));
    }
    await showing('editor', 'interface at 125 %');
    await page.locator('.workspace').click({ position: { x: 30, y: 30 } });
    await page.keyboard.press('Control+Alt+Digit0');
    await sleep(400);
    check('Ctrl+Alt+0 puts the interface back to 100 %', Math.abs((await page.evaluate(() => devicePixelRatio)) - dpr0) < 0.01);
  }

  // Arabic, right to left: the same round trip.
  // View › Interface language (the toolbar may have moved it to its overflow menu).
  await page.locator('.menu-trigger').nth(3).click();
  await click('.dropdown .item:has-text("العربية")', 'language');
  await page.waitForFunction(() => document.documentElement.dir === 'rtl', null, { timeout: 5000 }).catch(() => undefined);
  check('the interface is right-to-left', (await page.evaluate(() => document.documentElement.dir)) === 'rtl');
  await page.keyboard.press('F1');
  await browseParts('arabic guide');
  await click('.guide .home-top .btn', 'guide back');
  await showing('editor', 'arabic: back from the guide');
  if (!guideOnly) await floatingEditor('arabic code editor');
} catch (e) {
  check('steps ran to the end', false, e.message.split('\n')[0]);
  await showing('editor', 'after the failure').catch(() => undefined);
}

// ------------------------------------------------------------------ problems recorded
const recorded = await within(
  page.evaluate(() => localStorage.getItem('evlab.errors.v1')),
  10000,
  'the page',
).catch(() => null);
const problems = recorded ? JSON.parse(recorded) : [];
check('no problem recorded by the application', problems.length === 0, problems.map((p) => `[${p.area}] ${p.message}`).join(' | '));
check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
writeFileSync(join(out, 'report.txt'), `${log.join('\n')}\n\nRecorded problems:\n${JSON.stringify(problems, null, 2)}\n\nPage errors:\n${pageErrors.join('\n')}\n`);

clearTimeout(watchdog);
await within(browser.close(), 10000, 'closing').catch(() => undefined);
if (app) app.kill();
console.log(failures ? `${failures} check(s) failed` : 'all desktop checks passed', `— screenshots in ${out}`);
process.exit(failures ? 1 : 0);
