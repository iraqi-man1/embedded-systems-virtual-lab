/** Examples open named and described in the interface's language; their circuit and code stay as they are. */
import { afterEach, describe, expect, it } from 'vitest';
import { registry } from '../src/app/registry';
import { EXAMPLES, exampleForUser } from '../src/examples';
import { exampleSummary, exampleTitle, setLanguage } from '../src/i18n';

afterEach(() => setLanguage('en'));

describe('opening an example', () => {
  it('takes the Arabic title and summary in Arabic', () => {
    setLanguage('ar');
    const translated = EXAMPLES.filter((ex) => exampleTitle(ex) !== ex.title);
    expect(translated.length).toBe(EXAMPLES.length);
    for (const ex of translated) {
      const p = exampleForUser(ex);
      expect(p.meta.name).toBe(exampleTitle(ex));
      expect(p.meta.description).toBe(exampleSummary(ex));
      const original = ex.build(registry);
      expect(p.circuit).toEqual(original.circuit);
      expect(p.firmware).toEqual(original.firmware);
    }
  });

  it('stays as it is in English', () => {
    for (const ex of EXAMPLES) {
      const { name, description } = ex.build(registry).meta;
      expect(exampleForUser(ex).meta).toMatchObject({ name, description });
    }
  });
});
