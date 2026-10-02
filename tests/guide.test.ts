import { describe, expect, it } from 'vitest';
import { registry } from '../src/app/registry';
import { GUIDE, type GuideEntry, type L } from '../src/components/builtin/guide';
import { boardPins, pinFunction, pinGroups } from '../src/ui/guide/guideModel';

const ARABIC = /[؀-ۿ]/;
const BIDI_CONTROLS = /[‎‏‪-‮⁦-⁩]/;

function texts(g: GuideEntry): L[] {
  return [g.what, ...g.uses, ...(g.steps ?? []), ...(g.tips ?? []), ...Object.values(g.pins ?? {})];
}

describe('parts guide', () => {
  it('covers every part in the library, and only those', () => {
    const types = registry.all().map((d) => d.type);
    expect(types.filter((t) => !GUIDE[t])).toEqual([]);
    expect(Object.keys(GUIDE).filter((t) => !registry.get(t))).toEqual([]);
  });

  it('has English and Arabic for every text', () => {
    const bad: string[] = [];
    for (const [type, g] of Object.entries(GUIDE)) {
      if (!ARABIC.test(g.ar)) bad.push(`${type}: name`);
      if (!g.uses.length) bad.push(`${type}: uses`);
      for (const [en, ar] of texts(g)) {
        if (!en.trim() || ARABIC.test(en)) bad.push(`${type}: en "${en}"`);
        if (!ARABIC.test(ar)) bad.push(`${type}: ar "${ar}"`);
        if (BIDI_CONTROLS.test(en + ar + g.ar)) bad.push(`${type}: invisible direction marks in "${ar}"`);
        // `code` spans: balanced, and the same code in both languages.
        const code = (x: string) => x.split('`').filter((_, i) => i % 2);
        if ((en.split('`').length - 1) % 2 || code(en).join('|') !== code(ar).join('|')) bad.push(`${type}: code spans differ in "${en}"`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('gives simulated parts wiring steps', () => {
    const missing = registry
      .all()
      .filter((d) => d.simulation.support !== 'visual-only' && !GUIDE[d.type].steps?.length)
      .map((d) => d.type);
    expect(missing).toEqual([]);
  });

  it('only describes pins that exist', () => {
    const bad: string[] = [];
    for (const [type, g] of Object.entries(GUIDE)) {
      const def = registry.get(type)!;
      const names = new Set([...def.pins.map((p) => p.id), ...pinGroups(def).map((x) => x.name)]);
      for (const k of [...Object.keys(g.pins ?? {}), ...Object.keys(g.board ?? {})]) if (!names.has(k)) bad.push(`${type}: ${k}`);
    }
    expect(bad).toEqual([]);
  });

  it('suggests real Uno and Pico pins', () => {
    const uno = /^(|D([0-9]|1[0-3])\b.*|A[0-5]\b.*|5V\b.*|3\.3V|GND|VIN)$/;
    const pico = /^(|GP([0-9]|1[0-9]|2[0-8])\b.*|3V3|VBUS\b.*|VSYS|GND)$/;
    const bad: string[] = [];
    for (const def of registry.all()) {
      for (const group of pinGroups(def)) {
        const b = boardPins(def, group);
        if (!b) continue;
        if (!uno.test(b[0])) bad.push(`${def.type} ${group.name} Uno "${b[0]}"`);
        if (!pico.test(b[1])) bad.push(`${def.type} ${group.name} Pico "${b[1]}"`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('explains every pin of the simulated parts', () => {
    const bad: string[] = [];
    for (const def of registry.all()) {
      if (def.simulation.support === 'visual-only' || def.pins.length > 60) continue;
      for (const group of pinGroups(def)) if (!pinFunction(def, group)) bad.push(`${def.type} ${group.name}`);
    }
    expect(bad).toEqual([]);
  });
});
