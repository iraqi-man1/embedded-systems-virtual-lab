/** File › Export Code and Import Code: the project's code with the Arduino IDE or Thonny. */
import { exportedFiles, importedName } from '../core/project/codeFiles';
import { t } from '../i18n';
import { storage } from '../platform';
import { useEditor } from '../state/editor';
import { useProject } from '../state/project';
import { targetLanguage } from '../state/sim';
import { confirmDialog } from '../ui/common/Dialog';

const notify = (message: string, kind?: 'info' | 'success' | 'warning' | 'error') => useEditor.getState().notify(message, kind);

/** Saves the code of the board's language: the main file where the user chooses, the others next to it. */
export async function exportCode() {
  const { project } = useProject.getState();
  const language = targetLanguage(project);
  const files = exportedFiles(project, language);
  if (!files.length) return notify(t('The project has no code to export.'), 'info');
  try {
    const path = await storage.exportFiles(files, language === 'arduino' ? { name: t('Arduino sketch'), extensions: ['ino'] } : { name: 'MicroPython', extensions: ['py'] });
    if (path) notify(t('Code saved: {files}', { files: files.map((f) => f.name).join(', ') }), 'success');
  } catch (e) {
    notify(t('Could not save the code: {error}', { error: (e as Error).message ?? String(e) }), 'error');
  }
}

/** Adds code files to the project (a sketch or main.py replaces the main file, after asking). */
export async function importCode() {
  let picked: { name: string; text: string }[];
  try {
    picked = await storage.openTextFiles({ name: t('Code'), extensions: ['ino', 'h', 'hpp', 'c', 'cpp', 'py'] });
  } catch (e) {
    return notify(t('Could not open the files: {error}', { error: (e as Error).message ?? String(e) }), 'error');
  }
  if (!picked.length) return;
  const plan = picked.map((f) => ({ ...f, to: importedName(f.name) }));
  const usable = plan.filter((p): p is typeof p & { to: string } => !!p.to);
  const skipped = plan.filter((p) => !p.to).map((p) => p.name);
  const current = useProject.getState().project.firmware.files;
  const replaced = [...new Set(usable.filter((p) => current.some((f) => f.name === p.to && f.content.trim() && f.content !== p.text)).map((p) => p.to))];
  if (
    replaced.length &&
    !(await confirmDialog({
      title: t('Replace code?'),
      message: t('The imported files replace {files} in the project.', { files: replaced.join(', ') }),
      confirmLabel: t('Replace'),
      danger: true,
    }))
  )
    return;
  useProject.getState().updateProject((p) => {
    for (const f of usable) {
      const existing = p.firmware.files.find((x) => x.name === f.to);
      if (existing) existing.content = f.text;
      else p.firmware.files.push({ name: f.to, content: f.text });
    }
  });
  if (usable.length) {
    useEditor.getState().setPrefs({ showCode: true });
    notify(t('Imported: {files}', { files: [...new Set(usable.map((f) => f.to))].join(', ') }), 'success');
  }
  if (skipped.length) notify(t('Not code files the lab can use: {files}', { files: skipped.join(', ') }), 'warning');
}
