// DEVELOPMENT ONLY. Floating-UI regression check: opens every menu, submenu,
// popover and context menu (incl. near each window edge, both themes, narrow
// window) against the running dev server and asserts that each one is fully
// inside the window. Screenshots go to .toolchain/ui-check/.
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
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
let failures = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function visible(selector, name) {
  const loc = page.locator(selector).last();
  const box = await loc.boundingBox({ timeout: 2000 }).catch(() => null);
  const vp = page.viewportSize();
  const inside = !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width + 0.5 && box.y + box.height <= vp.height + 0.5;
  // The element must also be the topmost thing at its centre (nothing renders above it).
  const onTop =
    !!box &&
    (await page.evaluate(
      ([x, y, sel]) => {
        const el = document.elementFromPoint(x, y);
        return !!el && [...document.querySelectorAll(sel)].some((m) => m.contains(el));
      },
      [box.x + box.width / 2, box.y + Math.min(box.height / 2, 14), selector],
    ));
  check(name, inside && onTop, box ? `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}×${Math.round(box.height)}${onTop ? '' : ' (covered)'}` : 'not shown');
  return box;
}

const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });
const closeAll = async () => {
  for (let i = 0; i < 3; i++) await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
};

await page.goto(url);
await page.waitForSelector('.toolbar');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.click('text=Load the Blink example');
await page.waitForTimeout(700);

for (const theme of ['light', 'dark']) {
  await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForTimeout(200);

  // Toolbar menus.
  for (const label of ['Align & distribute', 'Wire colour (selected and new wires)']) {
    await page.click(`[aria-label="${label}"]`);
    await page.waitForTimeout(150);
    await visible('.dropdown', `[${theme}] toolbar menu: ${label}`);
    await shot(`${theme}-toolbar-${label.split(' ')[0].toLowerCase()}`);
    await closeAll();
  }

  // Every menu-bar menu and every submenu.
  const menus = await page.locator('.menu-trigger').allTextContents();
  for (const m of menus) {
    await page.click(`.menu-trigger:has-text("${m}")`);
    await page.waitForTimeout(150);
    await visible('.dropdown', `[${theme}] menu ${m}`);
    const subs = await page.locator('.dropdown [aria-haspopup="menu"]').allTextContents();
    for (const s of subs) {
      await page.hover(`.dropdown [aria-haspopup="menu"]:has-text("${s}")`);
      await page.waitForTimeout(350);
      await visible('.dropdown', `[${theme}] menu ${m} › ${s}`);
      await shot(`${theme}-menu-${m}-${s.replace(/\W+/g, '_')}`);
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
    await visible('.ctxmenu', `[${theme}] canvas context menu ${name}`);
    await closeAll();
  }

  // Wire: floating toolbar, context menu with submenu.
  const wire = await page.locator('.wires path.wire-hit').first().boundingBox();
  await page.mouse.click(wire.x + wire.width / 2, wire.y + wire.height / 2);
  await page.waitForTimeout(200);
  await visible('.float-bar', `[${theme}] floating wire toolbar`);
  await page.mouse.click(wire.x + wire.width / 2, wire.y + wire.height / 2, { button: 'right' });
  await page.waitForTimeout(200);
  await visible('.ctxmenu', `[${theme}] wire context menu`);
  await page.hover('.ctxmenu [aria-haspopup="menu"]');
  await page.waitForTimeout(350);
  await visible('.dropdown, .ctxmenu', `[${theme}] wire context submenu`);
  await shot(`${theme}-wire-context`);
  await closeAll();
  await page.keyboard.press('Escape');

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
  await visible('.lib-tooltip', `[${theme}] library info card near the bottom`);
  await page.mouse.move(800, 400);

  // Narrow window: overflow menu.
  await page.setViewportSize({ width: 760, height: 640 });
  await page.waitForTimeout(300);
  const fits = await page.evaluate(() => {
    const t = document.querySelector('.toolbar');
    return t.scrollWidth <= t.clientWidth;
  });
  check(`[${theme}] toolbar fits a narrow window`, fits);
  await page.click('[aria-label="More tools"]');
  await page.waitForTimeout(200);
  await visible('.dropdown', `[${theme}] overflow menu`);
  await shot(`${theme}-overflow`);
  await closeAll();
}

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(failures ? `${failures} check(s) failed` : 'all floating-UI checks passed', `— screenshots in ${out}`);
process.exit(failures ? 1 : 0);
