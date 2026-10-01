/**
 * Desktop window lifecycle: unsaved-changes prompt on close, crash-recovery
 * autosave, and the native window title.
 */
import { isTauri } from '../platform';
import { useProject } from '../state/project';
import { askSaveChanges, dialogOpen } from '../ui/common/Dialog';
import { clearAutosave, offerRestore, startAutosave } from './autosave';
import { saveDocument } from './fileOps';

export function windowTitle(name: string, dirty: boolean) {
  return `${dirty ? '● ' : ''}${name} — Embedded Systems Virtual Lab`;
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
  return useProject.subscribe(apply);
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
      const choice = await askSaveChanges({ message: 'Your project has unsaved changes. Save them before closing?', discardLabel: "Don't save" });
      if (choice === 'cancel') return;
      if (choice === 'save' && !(await saveDocument())) return;
      await clearAutosave();
      await win.destroy();
    } finally {
      asking = false;
    }
  });
}

/** Called once at start-up. Returns a cleanup function. */
export function installLifecycle(): () => void {
  const cleanups: (() => void)[] = [installTitleSync()];
  let disposed = false;
  void installCloseGuard().then((off) => (disposed ? off() : cleanups.push(off)));
  // Offer to restore a crash copy before autosave may overwrite it.
  void offerRestore().then(() => {
    if (!disposed) cleanups.push(startAutosave());
  });
  return () => {
    disposed = true;
    for (const c of cleanups) c();
  };
}
