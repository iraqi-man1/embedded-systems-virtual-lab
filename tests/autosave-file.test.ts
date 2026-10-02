// @vitest-environment happy-dom
/** The project file saves itself a moment after changes: once per burst, only with a file, only when switched on. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startFileAutosave } from '../src/app/autosave';
import { newProject } from '../src/core/project/schema';
import { useEditor } from '../src/state/editor';
import { useProject } from '../src/state/project';

let stop: () => void;
const save = vi.fn(async () => true);
const change = (name: string) => useProject.getState().updateProject((p) => void (p.meta.name = name));

beforeEach(() => {
  vi.useFakeTimers();
  save.mockClear();
  useProject.getState().load(newProject('Auto'), 'C:\\Users\\me\\auto.evlab');
  useEditor.getState().setPrefs({ autosaveFile: true });
  stop = startFileAutosave(save);
});
afterEach(() => {
  stop();
  vi.useRealTimers();
});

describe('saving the project file by itself', () => {
  it('saves once, a moment after a burst of changes', () => {
    change('a');
    vi.advanceTimersByTime(1000);
    change('ab');
    vi.advanceTimersByTime(1000);
    change('abc');
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(save).toHaveBeenCalledOnce();
  });

  it('waits for a first save to a file', () => {
    useProject.getState().load(newProject('New'), null);
    change('x');
    vi.advanceTimersByTime(5000);
    expect(save).not.toHaveBeenCalled();
  });

  it('can be switched off', () => {
    useEditor.getState().setPrefs({ autosaveFile: false });
    change('y');
    vi.advanceTimersByTime(5000);
    expect(save).not.toHaveBeenCalled();
  });
});
