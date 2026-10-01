import { newProject, parseProject, PROJECT_EXTENSION, serializeProject, type Project } from '../core/project/schema';
import { isTauri, storage } from '../platform';
import { useEditor } from '../state/editor';
import { useProject } from '../state/project';
import { EMPTY_COMPILE, stopSimulation, useSim } from '../state/sim';
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
  useSim.setState({ compile: EMPTY_COMPILE, serial: {}, diagnostics: [] });
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

/** File name without folders and extension. */
export const fileTitle = (path: string) => path.split(/[\\/]/).pop()!.replace(/\.evlab$/i, '');

/** Adds a file to File › Open Recent. */
function remember(path: string, name: string, text: string) {
  const editor = useEditor.getState();
  editor.rememberProject(path, name);
  storage.keepRecentCopy(path, text, useEditor.getState().recentProjects.map((r) => r.path));
}

/** Opens project text read from `path` (dialog, launch argument or dropped file; null = no known location). */
export function openProjectText(text: string, path: string | null) {
  try {
    const project = parseProject(text);
    const missing = [...new Set(project.circuit.components.filter((c) => !lookup(c.type)).map((c) => c.type))];
    showProject(project, path);
    if (path) remember(path, project.meta.name, text);
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

/** Opens a project by path (launch argument, a second launch, the recent list). */
export async function openPath(path: string) {
  if (!(await confirmDiscard())) return;
  try {
    openProjectText(await storage.readProject(path), path);
  } catch (e) {
    useEditor.getState().notify(`Could not open ${path}: ${(e as Error).message ?? e}`, 'error');
  }
}

/** Opens a project file dropped onto the window. */
export async function openDroppedFile(file: File) {
  if (!file.name.toLowerCase().endsWith(`.${PROJECT_EXTENSION}`)) {
    useEditor.getState().notify(`${file.name} is not a Virtual Lab project (.${PROJECT_EXTENSION})`, 'warning');
    return;
  }
  if (!(await confirmDiscard())) return;
  // The desktop webview doesn't reveal where a dropped file lives: Save asks for a location.
  openProjectText(await file.text(), isTauri ? null : file.name);
}

/** Reopens a project from the recent list; entries whose file is gone are dropped. */
export async function openRecent(path: string) {
  if (!(await confirmDiscard())) return;
  let text: string;
  try {
    text = await storage.readProject(path);
  } catch (e) {
    useEditor.getState().forgetProject(path);
    useEditor.getState().notify(`Could not open ${path.split(/[\\/]/).pop()} — removed from the recent list (${(e as Error).message ?? e})`, 'error');
    return;
  }
  openProjectText(text, path);
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
    remember(path, project.meta.name, text);
    if (!unchanged) useProject.setState({ dirty: true });
    else void clearAutosave();
    useEditor.getState().notify(`Saved ${path.split(/[\\/]/).pop()}`, 'success');
    return true;
  } catch (e) {
    useEditor.getState().notify(`Save failed: ${(e as Error).message}`, 'error');
    return false;
  }
}
