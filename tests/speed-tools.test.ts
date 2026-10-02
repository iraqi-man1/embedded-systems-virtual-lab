/**
 * Speed tools: firmware build state (status bar), source file renaming and
 * the recent-projects list.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { newProject } from '../src/core/project/schema';
import { useEditor } from '../src/state/editor';
import { useProject } from '../src/state/project';
import { buildStateOf, EMPTY_COMPILE, findTargetBoard, sourceHash, type CompileState } from '../src/state/sim';
import { CircuitBuilder } from './helpers';

function projectWithUno() {
  const b = new CircuitBuilder();
  b.add('evlab.arduino-uno', 0, 0);
  const p = newProject();
  return { ...p, circuit: b.doc };
}

function builtFor(project: ReturnType<typeof projectWithUno>): CompileState {
  const board = findTargetBoard(project)!;
  return {
    ...EMPTY_COMPILE,
    status: 'success',
    hex: { [board.id]: ':00000001FF' },
    hash: sourceHash(project, board),
    built: Object.fromEntries(project.firmware.files.map((f) => [f.name, f.content])),
  };
}

describe('build state', () => {
  it('is hidden without a programmable board', () => {
    expect(buildStateOf(newProject(), EMPTY_COMPILE)).toBe('none');
  });

  it('follows compile → edit → undo', () => {
    const project = projectWithUno();
    expect(buildStateOf(project, EMPTY_COMPILE)).toBe('unbuilt');
    expect(buildStateOf(project, { ...EMPTY_COMPILE, status: 'compiling' })).toBe('compiling');
    const compile = builtFor(project);
    expect(buildStateOf(project, compile)).toBe('built');
    const edited = { ...project, firmware: { ...project.firmware, files: [{ name: 'sketch.ino', content: 'void setup(){}' }] } };
    expect(buildStateOf(edited, compile)).toBe('modified');
    expect(buildStateOf(project, compile)).toBe('built');
    expect(buildStateOf(project, { ...compile, status: 'error' })).toBe('failed');
  });
});

describe('source files', () => {
  beforeEach(() => useProject.getState().load(newProject(), null));

  it('renames files but never the main sketch or onto an existing name', () => {
    const s = useProject.getState();
    s.addFile('a.h');
    s.addFile('b.h');
    s.renameFile('a.h', 'pins.h');
    s.renameFile('b.h', 'pins.h');
    s.renameFile('sketch.ino', 'main.cpp');
    expect(useProject.getState().project.firmware.files.map((f) => f.name)).toEqual(['sketch.ino', 'pins.h', 'b.h']);
  });
});

describe('recent projects', () => {
  beforeEach(() => useEditor.getState().forgetProject());

  it('moves reopened files to the top and keeps at most 10', () => {
    const e = useEditor.getState();
    for (let i = 0; i < 12; i++) e.rememberProject(`C:/p/${i}.evlab`, `P${i}`);
    e.rememberProject('C:/p/5.evlab', 'Renamed');
    const list = useEditor.getState().recentProjects;
    expect(list).toHaveLength(10);
    expect(list[0]).toMatchObject({ path: 'C:/p/5.evlab', name: 'Renamed' });
    expect(list.filter((r) => r.path === 'C:/p/5.evlab')).toHaveLength(1);
    useEditor.getState().forgetProject('C:/p/5.evlab');
    expect(useEditor.getState().recentProjects.some((r) => r.path === 'C:/p/5.evlab')).toBe(false);
  });
});

describe('toolchain libraries', () => {
  it('the installer pre-fetches every library the include map can request', async () => {
    const { readFileSync } = await import('node:fs');
    const { LIBRARY_MAP } = await import('../src/core/toolchain/libraries');
    const rust = readFileSync(new URL('../src-tauri/src/toolchain.rs', import.meta.url), 'utf8');
    const curated = rust.slice(rust.indexOf('CURATED_LIBRARIES'), rust.indexOf('];', rust.indexOf('CURATED_LIBRARIES')));
    for (const lib of new Set(Object.values(LIBRARY_MAP).flat())) expect(curated, lib).toContain(`"${lib}"`);
  });
});

describe('release', () => {
  it('package.json, tauri.conf.json and Cargo.toml carry the same version', async () => {
    const { readFileSync } = await import('node:fs');
    const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
    const npm = JSON.parse(read('package.json')).version;
    expect(JSON.parse(read('src-tauri/tauri.conf.json')).version).toBe(npm);
    expect(read('src-tauri/Cargo.toml')).toMatch(new RegExp(`^version = "${npm.replace(/\./g, '\\.')}"`, 'm'));
  });
});
