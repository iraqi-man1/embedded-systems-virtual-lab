// Sweeps the interface for errors the way a class uses it: every example is
// opened and run, with the instruments opened one by one, the language and
// the theme switched while it runs, the code editor floated and docked back,
// and a part hovered, double-clicked and right-clicked; examples alternate
// between English and Arabic and go through the themes. Then the pages and
// dialogs. Fails on any page error, any problem the lab records (Help ›
// Report a Problem) and any window left without the editor. Screenshots and a
// report go to .toolchain/sweep/.
//
//   node tools/ui-sweep.mjs --url http://localhost:1420/                  (npm run dev)
//   node tools/ui-sweep.mjs --url http://localhost:4173/ --channel msedge (vite preview, Windows CI)
//   --examples N   only the first N examples (a quick run)
//
// Compiling is answered with a prebuilt test firmware (tests/fixtures/blink.hex):
// the sweep checks the interface; tests/examples-run.test.ts checks the sketches.
// Needs playwright-core (or playwright) and a Chromium, or Edge with --channel.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
const url = arg('--url') ?? 'http://localhost:1420/';
const channel = arg('--channel');
const limit = Number(arg('--examples') ?? Infinity);
const root = resolve(import.meta.dirname, '..');
const out = join(root, '.toolchain', 'sweep');
mkdirSync(out, { recursive: true });
const HEX = readFileSync(join(root, 'tests', 'fixtures', 'blink.hex'), 'utf8');

let failures = 0;
const log = [];
function check(name, ok, detail = '') {
  const line = `${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`;
  console.log(line);
  log.push(line);
  if (!ok) failures++;
}

const watchdog = setTimeout(() => {
  console.error('FAIL the sweep did not finish within 25 minutes');
  process.exit(1);
}, 25 * 60_000);

const browser = await chromium.launch(channel ? { channel } : process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin }).catch(() => undefined);
const page = await context.newPage();
page.setDefaultTimeout(10000);

// The development services of the browser build: a toolchain that compiles everything into the test firmware.
await page.route('**/__evlab/toolchain/status', (r) => r.fulfill({ json: { installed: true, root: '', pioVersion: 'sweep', platforms: ['atmelavr'] } }));
await page.route('**/__evlab/compile', (r) => r.fulfill({ json: { success: true, hex: HEX, log: 'test firmware', diagnostics: [], flashBytes: 1000, ramBytes: 100, durationMs: 1 } }));

let step = 'start';
const errors = [];
page.on('pageerror', (e) => errors.push(`[${step}] ${String(e).split('\n')[0]}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`[${step}] console: ${m.text().split('\n')[0]}`));
let reported = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const menu = (n) => page.locator('.menubar .menu-trigger').nth(n);
const MENU = { file: 0, edit: 1, arrange: 2, view: 3, simulation: 4, help: 5 };

/** Runs a menu command by its id (data-id), language-independent. */
async function command(menuName, id, sub) {
  await menu(MENU[menuName]).click();
  const item = page.locator(`.dropdown [data-id="${id}"]`);
  if (!sub) return item.click();
  // A click opens a submenu even when the mouse already rests on it (hovering would not move it);
  // the mouse then slides over to the item as a hand does (a jump would leave the submenu's path).
  await page.locator(`.dropdown [data-id="${sub}"]`).click();
  await item.waitFor();
  const box = await item.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function closeAll() {
  for (let i = 0; i < 3; i++) await page.keyboard.press('Escape');
  await sleep(120);
}

/** A "Save changes?" question: don't save. */
async function dontSave() {
  const b = page.locator('[role="dialog"] [data-id="discard"]');
  if (await b.count()) await b.click();
}

/** The editor is whole: its bars and canvas are there and no part of it shows the error message instead. */
async function healthy(name) {
  const state = await page.evaluate(() => {
    const missing = ['.menubar', '.toolbar', '.workspace', '.statusbar'].filter((s) => {
      const r = document.querySelector(s)?.getBoundingClientRect();
      return !r || r.width < 20 || r.height < 10;
    });
    const crashed = [...document.querySelectorAll('.crash')].map((c) => c.textContent?.slice(0, 120));
    return { missing, crashed, recorded: JSON.parse(localStorage.getItem('evlab.errors.v1') ?? '[]') };
  });
  const fresh = state.recorded.slice(reported);
  reported = state.recorded.length;
  const problems = [...state.missing.map((m) => `${m} missing`), ...state.crashed.map((c) => `error shown: ${c}`), ...fresh.map((p) => `recorded [${p.area}] ${p.message}`), ...errors.splice(0)];
  check(name, !problems.length, problems.join(' | '));
  return !problems.length;
}

/** Runs a step; a step that throws fails and the sweep goes on. */
async function attempt(name, fn) {
  step = name;
  try {
    await fn();
  } catch (e) {
    // The first lines name the action and what it waited for.
    const what = String(e.message ?? e).split('\n').filter((l) => l.trim() && !l.includes('Call log')).slice(0, 3).join(' / ');
    check(`${name}: steps ran`, false, what);
    await page.screenshot({ path: join(out, `failed-${name.replace(/\W+/g, '-').toLowerCase().slice(0, 60)}.png`) }).catch(() => undefined);
    await closeAll().catch(() => undefined);
  }
}

const isRtl = () => page.evaluate(() => document.documentElement.dir === 'rtl');
async function language(arabic) {
  if ((await isRtl()) !== arabic) await page.locator('.toolbar [data-id="language"]').click();
  await page.waitForFunction((a) => (document.documentElement.dir === 'rtl') === a, arabic, { timeout: 5000 });
}

let themes = [];
async function theme(id) {
  await command('view', `theme-${id}`, 'Theme');
  await sleep(150);
}

// ------------------------------------------------------------------ start
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('.home', { timeout: 30000 });

await attempt('start screen tabs', async () => {
  const tabs = await page.locator('.home-tab').count();
  for (let i = 0; i < tabs; i++) {
    await page.locator('.home-tab').nth(i).click();
    await sleep(150);
  }
  check('start screen: every tab opens', tabs >= 4, `${tabs} tabs`);
  // New project: the editor.
  await page.locator('.btn.new-project').click();
  await page.waitForSelector('.home', { state: 'detached' });
  // The first-run tour: shown once, Esc ends it.
  if (await page.waitForSelector('.tour-callout', { timeout: 4000 }).then(() => true, () => false)) await page.keyboard.press('Escape');
  await healthy('start screen: new project opens the editor');
});

await attempt('themes', async () => {
  await menu(MENU.view).click();
  await page.locator('.dropdown [data-id="Theme"]').click();
  await page.waitForSelector('.dropdown [data-id^="theme-"]');
  themes = (await page.locator('.dropdown [data-id^="theme-"]').evaluateAll((els) => els.map((e) => e.dataset.id.slice(6)))).filter((t) => t !== 'system');
  await closeAll();
  check('themes listed', themes.length >= 2, themes.join(', '));
});

// ------------------------------------------------------------------ examples
await command('file', 'examples');
const exampleCount = Math.min(limit, await page.locator('[role="dialog"] .ex-card').count());
await closeAll();
check('examples listed', exampleCount > 0, `${exampleCount} examples`);

for (let i = 0; i < exampleCount; i++) {
  const arabic = i % 2 === 1;
  const th = themes.length ? themes[i % themes.length] : null;
  let title = `example ${i + 1}`;
  await attempt(title, async () => {
    await language(arabic);
    if (th) await theme(th);
    await command('file', 'examples');
    const card = page.locator('[role="dialog"] .ex-card').nth(i);
    title = `example ${i + 1} “${await card.locator('.card-title').textContent()}” (${arabic ? 'ar' : 'en'}, ${th})`;
    step = title;
    await card.click();
    await sleep(300);
    await dontSave();
    await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 5000 }).catch(() => undefined);
    await page.locator('.workspace').click({ position: { x: 12, y: 12 } });

    // Run, with every instrument.
    await page.keyboard.press('F5');
    const running = await page.waitForSelector('.statusbar .state-running', { timeout: 20000 }).then(() => true, () => false);
    check(`${title}: runs`, running, running ? '' : await page.locator('.toast').allTextContents().then((t) => t.join(' | ')));
    const tabs = await page.locator('.dock-tab').count();
    for (let k = 0; k < tabs; k++) {
      await page.locator('.dock-tab').nth(k).click();
      await sleep(180);
    }
    await page.locator('.dock-tab').first().click();

    // Language and theme switched while it runs.
    await language(!arabic);
    if (themes.length > 1) await theme(themes[(i + 1) % themes.length]);
    await sleep(300);
    await language(arabic);

    // The code editor floated and docked back.
    await command('view', 'floatCode');
    await page.waitForSelector('.code-slot.floating', { timeout: 3000 });
    await command('view', 'floatCode');
    await page.waitForSelector('.code-slot.floating', { state: 'detached', timeout: 3000 });

    // A part: hovered (live readings), double-clicked (its value), right-clicked (its menu).
    const parts = page.locator('.workspace .comp');
    const n = await parts.count();
    if (n) {
      const part = parts.nth(Math.min(1, n - 1));
      const box = await part.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await sleep(800);
        await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
        await sleep(200);
        await page.keyboard.press('Escape');
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
        await sleep(200);
        await page.keyboard.press('Escape');
      }
    }

    // Pause, go on, stop.
    await page.locator('.workspace').click({ position: { x: 12, y: 12 } });
    await page.keyboard.press('F6');
    await page.waitForSelector('.statusbar .state-paused', { timeout: 3000 }).catch(() => undefined);
    await page.keyboard.press('F5');
    await sleep(300);
    await page.keyboard.press('Shift+F5');
    const stopped = await page.waitForSelector('.statusbar .state-stopped', { timeout: 5000 }).then(() => true, () => false);
    check(`${title}: stops`, stopped);
    await page.screenshot({ path: join(out, `example-${String(i + 1).padStart(2, '0')}.png`) });
    await healthy(`${title}: no errors`);
  });
}

// ------------------------------------------------------------------ pages and dialogs
await attempt('dialogs', async () => {
  const focus = () => page.locator('.workspace').click({ position: { x: 12, y: 12 } });
  await focus();
  await page.keyboard.press('Control+Comma');
  await page.waitForSelector('[role="dialog"]');
  const stabs = await page.locator('.settings-tab').count();
  for (let k = 0; k < stabs; k++) {
    await page.locator('.settings-tab').nth(k).click();
    await sleep(120);
  }
  await closeAll();
  check('settings: every tab opens', stabs >= 3, `${stabs} tabs`);
  for (const [m, id] of [
    ['help', 'shortcuts'],
    ['help', 'about'],
    ['help', 'report'],
    ['file', 'history'],
    ['file', 'exportImage'],
    ['simulation', 'toolchain'],
  ]) {
    await command(m, id);
    const shown = await page.waitForSelector('[role="dialog"]', { timeout: 4000 }).then(() => true, () => false);
    check(`dialog ${id} opens`, shown);
    await closeAll();
  }
  for (const keys of ['Control+Shift+P', 'Control+K', 'Control+F']) {
    await focus();
    await page.keyboard.press(keys);
    await sleep(250);
    await closeAll();
  }
  await healthy('dialogs: no errors');
});

await attempt('wokwi', async () => {
  const saved = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await command('file', 'exportWokwi', 'Wokwi');
  check('save for Wokwi downloads diagram.json', (await saved)?.suggestedFilename() === 'diagram.json');
  await command('file', 'copyWokwi', 'Wokwi');
  await sleep(300);
  await healthy('wokwi: no errors');
});

await attempt('parts guide', async () => {
  await page.locator('.workspace').click({ position: { x: 12, y: 12 } });
  await page.keyboard.press('F1');
  await page.waitForSelector('.guide-nav-item.overview');
  await page.locator('.guide-nav-item.overview').click();
  for (const k of [0, 5, 12]) {
    await page.locator('.guide-tile').nth(k).click();
    await page.waitForSelector('.guide-part');
    await page.locator('.guide-nav-item.overview').click();
  }
  await page.locator('.guide .home-top .btn').click();
  await page.waitForSelector('.guide', { state: 'detached' });
  await healthy('parts guide: there and back');
});

await attempt('start screen', async () => {
  await command('file', 'home');
  await page.waitForSelector('.home');
  // Back to the editor through an example of the start screen.
  await page.locator('.home-tab').nth(2).click();
  await page.locator('.home .ex-card').first().click();
  await dontSave();
  await page.waitForSelector('.home', { state: 'detached', timeout: 5000 });
  await healthy('start screen: there and back');
});

clearTimeout(watchdog);
writeFileSync(join(out, 'report.txt'), `${log.join('\n')}\n`);
await browser.close();
console.log(failures ? `${failures} check(s) failed` : 'sweep passed', `— screenshots in ${out}`);
process.exit(failures ? 1 : 0);
