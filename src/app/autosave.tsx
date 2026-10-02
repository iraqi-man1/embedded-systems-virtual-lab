/**
 * Crash recovery. While the project has unsaved changes it is copied to the
 * app-data folder every 30 s and whenever the window loses focus; the copy
 * is removed once the project is saved or deliberately discarded. On start
 * the user is offered to restore a copy left behind by a crash.
 */
import { parseProject, serializeProject } from '../core/project/schema';
import { intlLocale, t } from '../i18n';
import { rich } from '../i18n/react';
import { autosaveStore } from '../platform';
import { useEditor } from '../state/editor';
import { useProject } from '../state/project';
import { choose } from '../ui/common/Dialog';

const INTERVAL_MS = 30_000;

/** Project object last written (identity), or 'clean' once the copy was removed. */
let written: unknown = null;
let busy = false;

export async function autosaveNow(): Promise<void> {
  if (busy) return;
  const { project, dirty, filePath } = useProject.getState();
  busy = true;
  try {
    if (!dirty) {
      if (written !== 'clean') {
        await autosaveStore.clear();
        written = 'clean';
      }
      return;
    }
    if (project === written) return;
    const text = serializeProject({ ...project, view: useEditor.getState().viewport });
    await autosaveStore.write(text, { sourcePath: filePath, savedAt: new Date().toISOString(), name: project.meta.name });
    written = project;
  } catch (e) {
    console.warn('Autosave failed', e);
  } finally {
    busy = false;
  }
}

/** The project was saved or deliberately discarded: the recovery copy is obsolete. */
export async function clearAutosave(): Promise<void> {
  written = 'clean';
  try {
    await autosaveStore.clear();
  } catch (e) {
    console.warn('Could not remove the autosave copy', e);
  }
}

/** Starts periodic autosaving. Call after `offerRestore()` so a pending copy is not overwritten. */
export function startAutosave(): () => void {
  const timer = setInterval(() => void autosaveNow(), INTERVAL_MS);
  const onBlur = () => void autosaveNow();
  const onHidden = () => document.visibilityState === 'hidden' && void autosaveNow();
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onHidden);
  return () => {
    clearInterval(timer);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onHidden);
  };
}

function describeAge(iso?: string) {
  if (!iso) return t('an earlier session');
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return t('an earlier session');
  return when.toLocaleString(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' });
}

/** If a recovery copy exists, asks whether to restore it. Resolves when the question is settled. */
export async function offerRestore(): Promise<void> {
  let found: Awaited<ReturnType<typeof autosaveStore.read>> = null;
  try {
    found = await autosaveStore.read();
  } catch (e) {
    console.warn('Could not read the autosave copy', e);
  }
  if (!found) return;
  const { text, meta } = found;
  const answer = await choose({
    title: t('Restore unsaved work?'),
    message: (
      <>
        <p style={{ marginTop: 0 }}>
          {rich(t('The application closed unexpectedly while {name} had unsaved changes. A copy was saved automatically at {when}.'), {
            name: <b>{meta.name ?? t('a project')}</b>,
            when: describeAge(meta.savedAt),
          })}
        </p>
        <p style={{ marginBottom: 0, color: 'var(--text-2)', fontSize: 12 }}>
          {meta.sourcePath ? t('Original file: {path}', { path: meta.sourcePath }) : t('The project had not been saved to a file yet.')}
        </p>
      </>
    ),
    buttons: [
      { id: 'discard', label: t('Discard copy'), variant: 'danger' },
      { id: 'restore', label: t('Restore'), variant: 'primary' },
    ],
    cancelId: 'later',
    defaultId: 'restore',
  });
  if (answer === 'later') return; // keep the copy; it is offered again next start
  if (answer === 'discard') {
    await clearAutosave();
    return;
  }
  try {
    const project = parseProject(text);
    useProject.getState().load(project, meta.sourcePath ?? null);
    // Restored work is unsaved until the user saves it.
    useProject.setState({ dirty: true });
    useEditor.getState().set({ viewport: project.view, selectedComponents: [], selectedWires: [] });
    useEditor.getState().notify(t('Unsaved work restored. Save it to keep it.'), 'success');
  } catch (e) {
    useEditor.getState().notify(t('The autosaved copy could not be read: {error}', { error: (e as Error).message }), 'error');
  }
}
