// Drives the desktop application through the flows that once left the window
// empty: the parts guide and every way back from it (its Back button, Esc,
// Alt+←, the mouse's Back button), the start screen and New project, in
// English and Arabic. After each step the window must show the expected page
// (checked in the page and on a screenshot), and at the end no problem may be
// recorded in Help › Report a Problem. Screenshots go to .toolchain/e2e/.
//
//   node tools/e2e-desktop.mjs --exe src-tauri/target/release/evlab.exe   (Windows: the real app and its WebView2)
//   node tools/e2e-desktop.mjs --url http://localhost:1420/              (development: any Chromium)
//
// Needs playwright-core (or playwright); --url also needs a Chromium build.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

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

if (exe) {
  const port = 9333;
  app = spawn(resolve(exe), [], {
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` },
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
    console.error('The application did not open its WebView2 debugging port.');
    app.kill();
    process.exit(1);
  }
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  for (let i = 0; i < 60 && !page; i++) {
    page = browser
      .contexts()
      .flatMap((c) => c.pages())
      .find((p) => /tauri\.localhost|tauri:\/\//.test(p.url()));
    if (!page) await sleep(500);
  }
  if (!page) {
    console.error('No application page found.');
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
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && pageErrors.push(m.text()));
const cdp = await page.context().newCDPSession(page);

// ------------------------------------------------------------------ checks
let shotNo = 0;

/** The window shows `what` ('home' | 'guide' | 'editor'), on top and inside the window, and is not an empty picture. */
async function showing(what, step) {
  await sleep(350);
  const name = `${String(++shotNo).padStart(2, '0')}-${step.replace(/\W+/g, '-').toLowerCase()}`;
  const png = await page.screenshot().catch(() => null);
  if (png) writeFileSync(join(out, `${name}.png`), png);
  const state = await page
    .evaluate(
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
    )
    .catch((e) => ({ problems: [`page not reachable: ${e.message}`], colours: -1, href: page.url() }));
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
  await click('.btn.new-project', 'new project');
  await page.waitForSelector('.home', { state: 'detached', timeout: 10000 }).catch(() => undefined);
  await showing('editor', 'new project');

  // Editor › F1 › parts › each way back: the editor, whole.
  const ways = [
    ['the Back button', () => click('.guide .home-top .btn', 'guide back')],
    ['Esc', () => page.keyboard.press('Escape')],
    ['Alt+←', () => page.keyboard.press('Alt+ArrowLeft')],
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

  // Add to canvas from a part page.
  await page.keyboard.press('F1');
  await browseParts('add to canvas');
  await click('.guide-head-row .btn.primary', 'add to canvas');
  await showing('editor', 'after Add to canvas');

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
} catch (e) {
  check('steps ran to the end', false, e.message.split('\n')[0]);
  await showing('editor', 'after the failure').catch(() => undefined);
}

// ------------------------------------------------------------------ problems recorded
const recorded = await page.evaluate(() => localStorage.getItem('evlab.errors.v1')).catch(() => null);
const problems = recorded ? JSON.parse(recorded) : [];
check('no problem recorded by the application', problems.length === 0, problems.map((p) => `[${p.area}] ${p.message}`).join(' | '));
check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
writeFileSync(join(out, 'report.txt'), `${log.join('\n')}\n\nRecorded problems:\n${JSON.stringify(problems, null, 2)}\n\nPage errors:\n${pageErrors.join('\n')}\n`);

await browser.close().catch(() => undefined);
if (app) app.kill();
console.log(failures ? `${failures} check(s) failed` : 'all desktop checks passed', `— screenshots in ${out}`);
process.exit(failures ? 1 : 0);
