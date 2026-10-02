import { confirmDiscard, showProject } from '../app/fileOps';
import { registry } from '../app/registry';
import { exampleTitle, t } from '../i18n';
import { useEditor } from '../state/editor';
import { fitView } from '../ui/workspace/actions';
import { ALL_EXAMPLES } from './all';
import { TEMPLATES, type TemplateInfo } from './templates';

export const EXAMPLES = ALL_EXAMPLES;

export async function loadExample(id: string) {
  const ex = EXAMPLES.find((e) => e.id === id);
  if (!ex) return;
  useEditor.getState().set({ dialog: null });
  if (!(await confirmDiscard(t('Your project has unsaved changes. Save them before opening the example?')))) return;
  showProject(ex.build(registry), null);
  setTimeout(() => fitView({ instant: true }), 0);
  useEditor.getState().notify(t('Opened example "{title}". Press Run (F5) to compile and simulate.', { title: exampleTitle(ex) }), 'info');
}

/** The template New Project starts from: the one used last, at first the empty project. */
export function lastTemplate(): TemplateInfo {
  return TEMPLATES.find((x) => x.id === useEditor.getState().newTemplate) ?? TEMPLATES[0];
}

/**
 * Starts a new project from a template (default: the one used last) and shows
 * it in the editor, after offering to save unsaved changes. Resolves true when
 * the project was created.
 */
export async function newFromTemplate(tpl: TemplateInfo = lastTemplate(), name = ''): Promise<boolean> {
  useEditor.getState().set({ dialog: null });
  if (!(await confirmDiscard())) return false;
  showProject(tpl.build(registry, name.trim() || t('Untitled')), null);
  useEditor.getState().setPrefs({ newTemplate: tpl.id });
  setTimeout(() => {
    fitView({ instant: true });
    document.querySelector<HTMLElement>('.workspace')?.focus({ preventScroll: true });
  }, 0);
  return true;
}
