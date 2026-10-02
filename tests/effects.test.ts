/**
 * React calls whatever an effect returns as its cleanup. In 0.3.0 the parts
 * guide had `useEffect(() => el.scrollIntoView(...))`; newer WebView2 returns
 * a promise from scrollIntoView, so React later called the promise and
 * crashed, leaving the window empty. An effect written as a single
 * expression may therefore only set state or return a cleanup.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

/** Single-expression effect bodies that are safe: a state setter, a cleanup function, an unsubscribe. */
const SAFE = [/^set[A-Z]\w*\(/, /^\(\) =>/, /\.subscribe\(/];

describe('effects', () => {
  it('only return cleanups', () => {
    const root = join(__dirname, '..', 'src');
    const bad: string[] = [];
    for (const file of sources(root)) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/use(?:Layout)?Effect\(\(\) => (?!\{)([^\n]*)/g)) {
        if (!SAFE.some((re) => re.test(m[1]))) bad.push(`${relative(root, file)}: ${m[0].trim()}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
