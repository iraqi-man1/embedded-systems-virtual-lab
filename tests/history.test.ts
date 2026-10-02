/** Version history: a copy per run or save, none when nothing changed, the newest 30, and restore. */
import { describe, expect, it } from 'vitest';
import { KEEP, memoryStore, projectKey, snapshot } from '../src/app/history';
import { newProject } from '../src/core/project/schema';

describe('version history', () => {
  it('keeps a copy when something changed, newest first', async () => {
    const store = memoryStore();
    const p = newProject('Blink');
    expect(await snapshot(store, p, 'run', 1000)).toBe(true);
    // The same project again (only its time stamp differs): no copy.
    expect(await snapshot(store, { ...p, meta: { ...p.meta, modified: 'later' } }, 'save', 2000)).toBe(false);
    const changed = { ...p, firmware: { ...p.firmware, files: [{ name: 'sketch.ino', content: 'void setup(){}' }] } };
    expect(await snapshot(store, changed, 'save', 3000)).toBe(true);
    const list = await store.list(projectKey(p));
    expect(list.map((s) => [s.reason, s.at])).toEqual([
      ['save', 3000],
      ['run', 1000],
    ]);
    expect(JSON.parse(list[0].text).firmware.files[0].content).toBe('void setup(){}');
  });

  it('keeps the newest 30 copies of each project, apart from other projects', async () => {
    const store = memoryStore();
    const a = newProject('A');
    const b = { ...newProject('B'), meta: { ...newProject('B').meta, created: 'another time' } };
    for (let i = 0; i < 40; i++) await snapshot(store, { ...a, meta: { ...a.meta, description: `v${i}` } }, 'run', i);
    await snapshot(store, b, 'run', 100);
    const list = await store.list(projectKey(a));
    expect(list).toHaveLength(KEEP);
    expect(list[0].at).toBe(39);
    expect(list.at(-1)!.at).toBe(10);
    expect(await store.list(projectKey(b))).toHaveLength(1);
  });

  it('follows a project through renames', async () => {
    const store = memoryStore();
    const p = newProject('Old name');
    await snapshot(store, p, 'save', 1);
    const renamed = { ...p, meta: { ...p.meta, name: 'New name' } };
    await snapshot(store, renamed, 'save', 2);
    expect((await store.list(projectKey(renamed))).map((s) => s.name)).toEqual(['New name', 'Old name']);
  });
});
