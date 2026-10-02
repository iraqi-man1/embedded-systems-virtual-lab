// @vitest-environment happy-dom
/**
 * Moving between the start screen, the parts guide and the editor: New
 * project really creates a project, and the guide's Back button returns to
 * where the guide was opened, on the same start-screen tab.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { lastTemplate, newFromTemplate } from '../src/examples';
import { TEMPLATES } from '../src/examples/templates';
import { useEditor } from '../src/state/editor';
import { useProject } from '../src/state/project';
import { closeGuide, openGuide } from '../src/ui/guide/open';

const ed = () => useEditor.getState();

beforeEach(() => {
  useProject.setState({ dirty: false });
  ed().set({ page: 'home', homeTab: null, guideType: null, guideReturn: null, dialog: null });
  ed().setPrefs({ newTemplate: '' });
});

describe('New project', () => {
  it('creates the project and opens the editor', async () => {
    useProject.getState().updateProject((p) => void (p.meta.name = 'Old one'));
    useProject.setState({ dirty: false });
    expect(await newFromTemplate(undefined, '  Traffic light ')).toBe(true);
    expect(ed().page).toBeNull();
    const { project, dirty, filePath } = useProject.getState();
    expect(project.meta.name).toBe('Traffic light');
    expect(dirty).toBe(false);
    expect(filePath).toBeNull();
  });

  it('starts from the template used last, and remembers a new choice', async () => {
    expect(lastTemplate().id).toBe('blank');
    expect(ed().newTemplate).toBe('');
    const uno = TEMPLATES.find((x) => x.id === 'uno-breadboard')!;
    await newFromTemplate(uno);
    expect(ed().newTemplate).toBe('uno-breadboard');
    expect(lastTemplate()).toBe(uno);
    // The next New project (Ctrl+N, File › New, the start screen button) starts from it.
    ed().set({ page: 'home' });
    await newFromTemplate();
    expect(useProject.getState().project.circuit.components.map((c) => c.type)).toEqual(expect.arrayContaining(['evlab.arduino-uno', 'evlab.breadboard-half']));
    expect(useProject.getState().project.meta.name).toBe('Untitled');
  });

  it('falls back to the empty project for an unknown template', () => {
    ed().setPrefs({ newTemplate: 'no-such-template' });
    expect(lastTemplate()).toBe(TEMPLATES[0]);
  });
});

describe('parts guide', () => {
  it('Back returns to the start screen on the same tab', () => {
    ed().set({ homeTab: 'examples' });
    openGuide();
    openGuide('evlab.led');
    openGuide('evlab.resistor');
    expect(ed().page).toBe('guide');
    expect(ed().guideReturn).toBe('home');
    closeGuide();
    expect(ed().page).toBe('home');
    expect(ed().homeTab).toBe('examples');
    expect(ed().guideType).toBeNull();
  });

  it('Back returns to the editor when opened from it', () => {
    ed().set({ page: null });
    openGuide('evlab.led');
    closeGuide();
    expect(ed().page).toBeNull();
  });
});
