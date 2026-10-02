// DEVELOPMENT ONLY. Floating-UI regression check: opens every menu, submenu,
// popover, context menu and dialog (incl. near each window edge, a light and a
// dark theme, Arabic right-to-left, narrow window, over the floating code
// editor) against the running dev server and asserts that each one is fully
// inside the window and on top.
// Screenshots go to .toolchain/ui-check/.
//
//   npm run dev                      # in another terminal
//   node tools/ui-floating-check.mjs [url]
//
// Needs Playwright with a Chromium build (npm i -g playwright && npx playwright install chromium).
// PW_CHROMIUM=/path/to/chrome selects a specific browser binary.
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright is not installed (npm i -g playwright, then set NODE_PATH to the global node_modules).');
  process.exit(2);
}

const url = process.argv[2] ?? 'http://localhost:1420/';
const out = resolve(import.meta.dirname, '..', '.toolchain', 'ui-check');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, locale: 'en-US' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
let failures = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

/** `passive`: the element ignores the mouse on purpose (hover cards); stacking is checked with it made hit-testable. */
async function visible(selector, name, { passive = false } = {}) {
  const loc = page.locator(selector).last();
  const box = await loc.boundingBox({ timeout: 2000 }).catch(() => null);
  const vp = page.viewportSize();
  const inside = !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width + 0.5 && box.y + box.height <= vp.height + 0.5;
  // The element must also be the topmost thing at its centre (nothing renders above it).
  const onTop =
    !!box &&
    (await page.evaluate(
      ([x, y, sel, passive]) => {
        const all = [...document.querySelectorAll(sel)];
        // Passive overlays (and their positioning wrapper) ignore the pointer with !important.
        const hit = passive ? all.flatMap((m) => [m, m.closest('[data-radix-popper-content-wrapper]')]).filter(Boolean) : [];
        const saved = hit.map((m) => [m, m.style.getPropertyValue('pointer-events'), m.style.getPropertyPriority('pointer-events')]);
        for (const m of hit) m.style.setProperty('pointer-events', 'auto', 'important');
        const el = document.elementFromPoint(x, y);
        for (const [m, v, prio] of saved) m.style.setProperty('pointer-events', v, prio);
        return !!el && all.some((m) => m.contains(el));
      },
      [box.x + box.width / 2, box.y + Math.min(box.height / 2, 14), selector, passive],
    ));
  check(name, inside && onTop, box ? `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}×${Math.round(box.height)}${onTop ? '' : ' (covered)'}` : 'not shown');
  return box;
}

const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });
const closeAll = async () => {
  for (let i = 0; i < 3; i++) await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
};

/** A UI string in the interface's current language (the app's own `t()`). */
const label = (key) =>
  page.evaluate(async (key) => {
    const src = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/src/i18n/index.ts')) ?? '/src/i18n/index.ts';
    return (await import(src)).t(key);
  }, key);

await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
// The start screen opens first.
await page.waitForSelector('.home');
await visible('.home', 'start screen');
await page.click('text=Go to the editor');
await page.click('text=Load the Blink example');
await page.waitForTimeout(700);
// On a first start the tour starts by itself (a popover too): Esc ends it.
if (await page.waitForSelector('.tour-callout', { timeout: 3000 }).then(() => true, () => false)) {
  await visible('.tour-callout', 'first-run tour');
  await shot('tour');
  await page.keyboard.press('Escape');
}

const passes = [
  { name: 'light', theme: 'light', arabic: false },
  { name: 'dark', theme: 'dark', arabic: false },
  { name: 'arabic', theme: 'midnight', arabic: true },
];

for (const pass of passes) {
  const p = pass.name;
  await page.setViewportSize({ width: 1600, height: 900 });
  if (pass.arabic) {
    await page.click(`[aria-label="${await label('Interface language: English / العربية')}"]`);
    await page.waitForTimeout(300);
    check(`[${p}] layout is right-to-left`, (await page.evaluate(() => document.documentElement.dir)) === 'rtl');
  }
  // Through the app's settings, so the code editor and instruments follow the theme too.
  await page.evaluate(async (theme) => {
    const src = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/src/state/editor.ts')) ?? '/src/state/editor.ts';
    (await import(src)).useEditor.getState().setPrefs({ theme });
  }, pass.theme);
  await page.waitForTimeout(200);

  // Toolbar menus.
  for (const key of ['Align & distribute', 'Wire colour (selected and new wires)']) {
    await page.click(`[aria-label="${await label(key)}"]`);
    await page.waitForTimeout(150);
    await visible('.dropdown', `[${p}] toolbar menu: ${key}`);
    await shot(`${p}-toolbar-${key.split(' ')[0].toLowerCase()}`);
    await closeAll();
  }

  // Every menu-bar menu and every submenu.
  const menus = await page.locator('.menu-trigger').allTextContents();
  for (const m of menus) {
    await page.click(`.menu-trigger:has-text("${m}")`);
    await page.waitForTimeout(150);
    await visible('.dropdown', `[${p}] menu ${m}`);
    const subs = await page.locator('.dropdown [aria-haspopup="menu"]').allTextContents();
    for (const s of subs) {
      await page.hover(`.dropdown [aria-haspopup="menu"]:has-text("${s}")`);
      await page.waitForTimeout(350);
      await visible('.dropdown', `[${p}] menu ${m} › ${s}`);
      await shot(`${p}-menu-${m}-${s.replace(/\W+/g, '_')}`);
    }
    await closeAll();
  }

  // Canvas context menu at the four window edges.
  const ws = await page.locator('.workspace').boundingBox();
  const spots = {
    'top-left': [ws.x + 6, ws.y + 6],
    'top-right': [ws.x + ws.width - 6, ws.y + 6],
    'bottom-left': [ws.x + 6, ws.y + ws.height - 6],
    'bottom-right': [ws.x + ws.width - 220, ws.y + ws.height - 6],
  };
  for (const [name, [x, y]] of Object.entries(spots)) {
    await page.mouse.click(x, y, { button: 'right' });
    await page.waitForTimeout(200);
    await visible('.ctxmenu', `[${p}] canvas context menu ${name}`);
    await closeAll();
  }

  // Wire: floating toolbar, context menu with submenu.
  const wire = await page.locator('.wires path.wire-hit').first().boundingBox();
  await page.mouse.click(wire.x + wire.width / 2, wire.y + wire.height / 2);
  await page.waitForTimeout(200);
  await visible('.float-bar', `[${p}] floating wire toolbar`);
  await page.mouse.click(wire.x + wire.width / 2, wire.y + wire.height / 2, { button: 'right' });
  await page.waitForTimeout(200);
  await visible('.ctxmenu', `[${p}] wire context menu`);
  await page.hover('.ctxmenu [aria-haspopup="menu"]');
  await page.waitForTimeout(350);
  await visible('.dropdown, .ctxmenu', `[${p}] wire context submenu`);
  await shot(`${p}-wire-context`);
  await closeAll();
  await page.keyboard.press('Escape');

  // Hover card of a part (rest the mouse on the LED).
  const part = await page.locator('.workspace .comp').last().boundingBox();
  if (part) {
    await page.mouse.move(part.x + part.width / 2, part.y + part.height / 2);
    await page.waitForTimeout(1100);
    await visible('.part-card', `[${p}] part hover card`, { passive: true });
    await shot(`${p}-part-card`);
    await page.mouse.move(ws.x + 20, ws.y + ws.height / 2);
    await page.waitForTimeout(200);
  } else check(`[${p}] part hover card`, false, 'no part on the canvas');

  // Command palette, quick-add and Find (modal layer, above everything else).
  await page.keyboard.press('Control+Shift+P');
  await page.waitForTimeout(200);
  await visible('.cmdk-dialog', `[${p}] command palette`);
  await shot(`${p}-palette`);
  await closeAll();
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(200);
  await visible('.cmdk-dialog', `[${p}] quick add`);
  await closeAll();
  await page.keyboard.press('Control+f');
  await page.waitForTimeout(200);
  await visible('.cmdk-dialog', `[${p}] find`);
  await closeAll();

  // Export dialog.
  await page.keyboard.press('Control+Shift+E');
  await page.waitForTimeout(600);
  await visible('.export', `[${p}] export dialog`);
  await shot(`${p}-export`);
  await closeAll();

  // Library info card for an item at the bottom of the window.
  const items = page.locator('.lib-item');
  const count = await items.count();
  for (let i = count - 1; i >= 0; i--) {
    const b = await items.nth(i).boundingBox();
    if (b && b.y + b.height < 880) {
      await items.nth(i).hover();
      break;
    }
  }
  await page.waitForTimeout(800);
  await visible('.lib-tooltip', `[${p}] library info card near the bottom`);
  await page.mouse.move(800, 400);

  // Floating code editor: above the canvas, below menus, dialogs and pages.
  await page.click('.code-bar-btn');
  await page.waitForTimeout(250);
  const bar = await page.locator('.code-tabs-fill').boundingBox();
  await page.mouse.move(bar.x + 8, bar.y + 8);
  await page.mouse.down();
  await page.mouse.move(380, 90, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  await visible('.code-slot.floating', `[${p}] floating code editor`);
  await shot(`${p}-floating-editor`);
  const menus2 = await page.locator('.menu-trigger').allTextContents();
  await page.click(`.menu-trigger:has-text("${menus2[0]}")`);
  await page.waitForTimeout(150);
  await visible('.dropdown', `[${p}] menu over the floating code editor`);
  await closeAll();
  await page.keyboard.press('Control+Shift+P');
  await page.waitForTimeout(200);
  await visible('.cmdk-dialog', `[${p}] command palette over the floating code editor`);
  await closeAll();
  await page.click('.code-bar-btn');
  await page.waitForTimeout(250);
  check(`[${p}] code editor docked again`, (await page.locator('.code-slot.floating').count()) === 0);

  // Narrow window: overflow menu.
  await page.setViewportSize({ width: 760, height: 640 });
  await page.waitForTimeout(300);
  const fits = await page.evaluate(() => {
    const t = document.querySelector('.toolbar');
    return t.scrollWidth <= t.clientWidth;
  });
  check(`[${p}] toolbar fits a narrow window`, fits);
  await page.click(`[aria-label="${await label('More tools')}"]`);
  await page.waitForTimeout(200);
  await visible('.dropdown', `[${p}] overflow menu`);
  await shot(`${p}-overflow`);
  await closeAll();
  await page.keyboard.press('Control+Shift+P');
  await page.waitForTimeout(200);
  await visible('.cmdk-dialog', `[${p}] command palette in a narrow window`);
  await closeAll();
}

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(failures ? `${failures} check(s) failed` : 'all floating-UI checks passed', `— screenshots in ${out}`);
process.exit(failures ? 1 : 0);
