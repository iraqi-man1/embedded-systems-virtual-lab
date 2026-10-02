/**
 * Arabic catalogue: complete, consistent placeholders, no dead entries.
 * (Missing translations of literal UI strings are compile errors already.)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ALL_EXAMPLES } from '../src/examples/all';
import { AR } from '../src/i18n/ar';
import { AR_DATA, EXAMPLES_AR } from '../src/i18n/arData';
import { exampleTitle, formatRelative, setLanguage, t, tr } from '../src/i18n';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(ts|tsx)$/.test(name) && !p.includes(join('src', 'i18n', 'ar')) ? [p] : [];
  });
}

afterEach(() => setLanguage('en'));

describe('Arabic catalogue', () => {
  it('translates every key with the same placeholders', () => {
    for (const [key, value] of Object.entries(AR)) {
      expect(value.trim(), key).not.toBe('');
      expect(placeholders(value), key).toEqual(placeholders(key));
    }
  });

  it('has no entries that the code no longer uses', () => {
    const code = sources(join(__dirname, '..', 'src'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    const unused = Object.keys(AR).filter((k) => !code.includes(`'${k}'`) && !code.includes(`"${k}"`));
    expect(unused).toEqual([]);
  });

  it('covers every example project', () => {
    for (const ex of ALL_EXAMPLES) {
      expect(EXAMPLES_AR[ex.id]?.title, ex.id).toBeTruthy();
      expect(EXAMPLES_AR[ex.id]?.summary, ex.id).toBeTruthy();
    }
  });

  it('data entries are non-empty', () => {
    for (const [k, v] of Object.entries(AR_DATA)) expect(v.trim(), k).not.toBe('');
  });
});

describe('t / tr', () => {
  it('returns English keys unchanged and fills placeholders', () => {
    setLanguage('en');
    expect(t('Saved {file}', { file: 'a.evlab' })).toBe('Saved a.evlab');
    expect(tr('Boards')).toBe('Boards');
  });

  it('switches to Arabic', () => {
    setLanguage('ar');
    expect(t('Save')).toBe('حفظ');
    expect(t('Saved {file}', { file: 'a.evlab' })).toBe('تم حفظ a.evlab');
    expect(tr('Boards')).toBe('اللوحات');
    // Unknown data text stays as it is (e.g. a third-party package).
    expect(tr('Flux capacitor')).toBe('Flux capacitor');
    expect(exampleTitle({ id: 'no-such-example', title: 'Kept' })).toBe('Kept');
  });

  it('formats relative times with Latin digits in Arabic', () => {
    setLanguage('ar');
    const s = formatRelative(Date.now() - 3 * 3600 * 1000);
    expect(s).toMatch(/3/);
    expect(s).not.toMatch(/[٠-٩]/);
  });
});
