import { newProject, parseProject, serializeProject, type Project } from '../core/project/schema';
import { storage } from '../platform';
import { useEditor } from '../state/editor';
import { useProject } from '../state/project';
import { stopSimulation, useSim } from '../state/sim';
import { askSaveChanges } from '../ui/common/Dialog';
import { clearAutosave } from './autosave';
import { lookup } from './registry';

/**
 * Before replacing the open project: offers Save / Don't save / Cancel when it
 * has unsaved changes. Resolves true when it is safe to continue.
 */
export async function confirmDiscard(message?: string): Promise<boolean> {
  if (!useProject.getState().dirty) return true;
  const choice = await askSaveChanges({ message });
  if (choice === 'cancel') return false;
  if (choice === 'save') return saveDocument();
  return true;
}

function resetForNewDocument() {
  if (useSim.getState().state !== 'stopped') stopSimulation();
  useSim.setState({ compile: { status: 'idle', log: '', diagnostics: [], hex: {}, hash: null, flashBytes: null, ramBytes: null, durationMs: null }, serial: {}, diagnostics: [] });
}

/** Replaces the open project (after the caller confirmed discarding changes). */
export function showProject(project: Project, path: string | null) {
  resetForNewDocument();
  useProject.getState().load(project, path);
  useEditor.getState().set({ viewport: project.view, selectedComponents: [], selectedWires: [], wiring: null });
  void clearAutosave();
}

export async function newDocument() {
  if (!(await confirmDiscard())) return;
  showProject(newProject(), null);
}

/** Opens project text read from `path` (dialog, launch argument or dropped file). */
export function openProjectText(text: string, path: string) {
  try {
    const project = parseProject(text);
    const missing = [...new Set(project.circuit.components.filter((c) => !lookup(c.type)).map((c) => c.type))];
    showProject(project, path);
    if (missing.length) useEditor.getState().notify(`Missing component packages for: ${missing.join(', ')}`, 'warning');
    else useEditor.getState().notify(`Opened ${project.meta.name}`, 'success');
    return true;
  } catch (e) {
    useEditor.getState().notify(`Could not open project: ${(e as Error).message}`, 'error');
    return false;
  }
}

export async function openDocument() {
  if (!(await confirmDiscard())) return;
  try {
    const file = await storage.openProject();
    if (file) openProjectText(file.text, file.path);
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
    // Edits made while the save dialog was open stay unsaved.
    const unchanged = useProject.getState().project === project;
    useProject.getState().markSaved(path);
    if (!unchanged) useProject.setState({ dirty: true });
    else void clearAutosave();
    useEditor.getState().notify(`Saved ${path.split(/[\\/]/).pop()}`, 'success');
    return true;
  } catch (e) {
    useEditor.getState().notify(`Save failed: ${(e as Error).message}`, 'error');
    return false;
  }
}
