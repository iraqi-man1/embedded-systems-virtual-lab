import { newProject, parseProject, serializeProject } from '../core/project/schema';
import { storage } from '../platform';
import { useEditor } from '../state/editor';
import { useProject } from '../state/project';
import { stopSimulation, useSim } from '../state/sim';
import { lookup } from './registry';

function confirmDiscard(): boolean {
  const p = useProject.getState();
  return !p.dirty || confirm('You have unsaved changes. Discard them?');
}

function resetForNewDocument() {
  if (useSim.getState().state !== 'stopped') stopSimulation();
  useSim.setState({ compile: { status: 'idle', log: '', diagnostics: [], hex: {}, hash: null, flashBytes: null, ramBytes: null, durationMs: null }, serial: {}, diagnostics: [] });
}

export function newDocument() {
  if (!confirmDiscard()) return;
  resetForNewDocument();
  const p = newProject();
  useProject.getState().load(p, null);
  useEditor.getState().set({ viewport: p.view, selectedComponents: [], selectedWires: [], wiring: null });
}

export async function openDocument() {
  if (!confirmDiscard()) return;
  try {
    const file = await storage.openProject();
    if (!file) return;
    const project = parseProject(file.text);
    const missing = [...new Set(project.circuit.components.filter((c) => !lookup(c.type)).map((c) => c.type))];
    resetForNewDocument();
    useProject.getState().load(project, file.path);
    useEditor.getState().set({ viewport: project.view, selectedComponents: [], selectedWires: [], wiring: null });
    if (missing.length) useEditor.getState().notify(`Missing component packages for: ${missing.join(', ')}`, 'warning');
    else useEditor.getState().notify(`Opened ${project.meta.name}`, 'success');
  } catch (e) {
    useEditor.getState().notify(`Could not open project: ${(e as Error).message}`, 'error');
  }
}

export async function saveDocument(saveAs = false): Promise<boolean> {
  const { project, filePath } = useProject.getState();
  // Persist the current view with the project.
  const view = useEditor.getState().viewport;
  const text = serializeProject({ ...project, view });
  try {
    const path = await storage.saveProject(text, saveAs ? null : filePath, project.meta.name.replace(/[^\w\- ]+/g, '').trim() || 'project');
    if (!path) return false;
    useProject.getState().markSaved(path);
    useEditor.getState().notify(`Saved ${path.split(/[\\/]/).pop()}`, 'success');
    return true;
  } catch (e) {
    useEditor.getState().notify(`Save failed: ${(e as Error).message}`, 'error');
    return false;
  }
}
