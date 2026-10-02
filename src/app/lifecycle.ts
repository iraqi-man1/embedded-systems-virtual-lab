/**
 * Desktop window lifecycle: unsaved-changes prompt on close, crash-recovery
 * autosave, the native window title, and project files opened from the
 * operating system (double-click, second launch, drag and drop).
 */
import { t } from '../i18n';
import { isTauri, launch } from '../platform';
import { useEditor } from '../state/editor';
import { useProject } from '../state/project';
import { askSaveChanges, dialogOpen } from '../ui/common/Dialog';
import { clearAutosave, offerRestore, startAutosave, startFileAutosave } from './autosave';
import { openDroppedFile, openPath, saveDocument, saveQuietly } from './fileOps';

export function windowTitle(name: string, dirty: boolean) {
  return `${dirty ? '● ' : ''}${t('{name} — Embedded Systems Virtual Lab', { name })}`;
}

/** Keeps the document and native window titles in sync with the project. */
function installTitleSync(): () => void {
  let last = '';
  const apply = () => {
    const { project, dirty } = useProject.getState();
    const title = windowTitle(project.meta.name, dirty);
    if (title === last) return;
    last = title;
    document.title = title;
    if (isTauri) {
      void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().setTitle(title)).catch(() => undefined);
    }
  };
  apply();
  const offProject = useProject.subscribe(apply);
  // The title is translated too.
  const offEditor = useEditor.subscribe((s, prev) => s.language !== prev.language && apply());
  return () => {
    offProject();
    offEditor();
  };
}

/** Asks Save / Don't save / Cancel when the window is closed with unsaved changes. */
async function installCloseGuard(): Promise<() => void> {
  if (!isTauri) {
    // Browser (development): the browser's own "leave site?" prompt.
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (useProject.getState().dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();
  let asking = false;
  return win.onCloseRequested(async (event) => {
    if (!useProject.getState().dirty) {
      await clearAutosave();
      return; // closes
    }
    event.preventDefault();
    if (asking || dialogOpen()) return;
    asking = true;
    try {
      const choice = await askSaveChanges({ message: t('Your project has unsaved changes. Save them before closing?'), discardLabel: t("Don't save") });
      if (choice === 'cancel') return;
      if (choice === 'save' && !(await saveDocument())) return;
      await clearAutosave();
      await win.destroy();
    } finally {
      asking = false;
    }
  });
}

/**
 * Project files dropped anywhere on the window open the project. Other drags
 * (parts from the library) are left to their own targets.
 */
function installFileDrop(): () => void {
  const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
  const over = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
  };
  const drop = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    const file = e.dataTransfer!.files[0];
    if (file) void openDroppedFile(file);
  };
  window.addEventListener('dragover', over);
  window.addEventListener('drop', drop);
  return () => {
    window.removeEventListener('dragover', over);
    window.removeEventListener('drop', drop);
  };
}

/** Called once at start-up. Returns a cleanup function. */
export function installLifecycle(): () => void {
  const cleanups: (() => void)[] = [installTitleSync(), installFileDrop()];
  let disposed = false;
  const keep = (off: () => void) => (disposed ? off() : cleanups.push(off));
  void installCloseGuard().then(keep);
  void launch.onOpenFile((path) => void openPath(path)).then(keep);
  // Offer to restore a crash copy before autosave may overwrite it; a project
  // the app was launched with opens next (asking to keep a restored copy).
  void offerRestore().then(async () => {
    if (disposed) return;
    cleanups.push(startAutosave(), startFileAutosave(saveQuietly));
    const file = await launch.takeLaunchFile().catch(() => null);
    if (file && !disposed) await openPath(file);
  });
  return () => {
    disposed = true;
    for (const c of cleanups) c();
  };
}
