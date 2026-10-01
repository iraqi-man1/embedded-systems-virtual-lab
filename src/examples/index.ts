import { registry } from '../app/registry';
import { useEditor } from '../state/editor';
import { useProject } from '../state/project';
import { stopSimulation, useSim } from '../state/sim';
import { fitView } from '../ui/workspace/actions';
import { ALL_EXAMPLES } from './all';

export const EXAMPLES = ALL_EXAMPLES;

export function loadExample(id: string) {
  const ex = EXAMPLES.find((e) => e.id === id);
  if (!ex) return;
  const proj = useProject.getState();
  if (proj.dirty && proj.project.circuit.components.length && !confirm('Discard unsaved changes and open the example?')) return;
  if (useSim.getState().state !== 'stopped') stopSimulation();
  const project = ex.build(registry);
  proj.load(project, null);
  useEditor.getState().set({ viewport: project.view, selectedComponents: [], selectedWires: [], dialog: null, wiring: null });
  setTimeout(fitView, 0);
  useEditor.getState().notify(`Opened example "${ex.title}". Press Run (F5) to compile and simulate.`, 'info');
}
