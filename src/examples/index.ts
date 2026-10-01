import { confirmDiscard, showProject } from '../app/fileOps';
import { registry } from '../app/registry';
import { useEditor } from '../state/editor';
import { fitView } from '../ui/workspace/actions';
import { ALL_EXAMPLES } from './all';

export const EXAMPLES = ALL_EXAMPLES;

export async function loadExample(id: string) {
  const ex = EXAMPLES.find((e) => e.id === id);
  if (!ex) return;
  useEditor.getState().set({ dialog: null });
  if (!(await confirmDiscard('Your project has unsaved changes. Save them before opening the example?'))) return;
  showProject(ex.build(registry), null);
  setTimeout(fitView, 0);
  useEditor.getState().notify(`Opened example "${ex.title}". Press Run (F5) to compile and simulate.`, 'info');
}
