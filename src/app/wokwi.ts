/**
 * File › Wokwi: opens a project from wokwi.com (its downloaded zip, or its
 * diagram.json with the code files) and saves or copies the open project for
 * Wokwi.
 */
import { fromWokwi, parseDiagram, toWokwi, type WokwiImport } from '../core/project/wokwi';
import { isZip, unzip } from '../core/project/zip';
import { t } from '../i18n';
import { storage } from '../platform';
import { useEditor } from '../state/editor';
import { useProject } from '../state/project';
import { fitView } from '../ui/workspace/actions';
import { confirmDiscard, showProject } from './fileOps';
import { lookup, registry } from './registry';

const notify = (message: string, kind?: 'info' | 'success' | 'warning' | 'error') => useEditor.getState().notify(message, kind);
const errorText = (e: unknown) => String((e as Error)?.message ?? e);

/** Files a Wokwi project may come as. */
export const WOKWI_EXTENSIONS = ['zip', 'json', 'ino', 'h', 'hpp', 'c', 'cpp', 'py', 'txt'];

/** True when dropped or picked files look like a Wokwi project (a zip or a diagram.json). */
export const isWokwiProject = (names: string[]) => names.some((n) => /(^|[\\/])diagram\.json$/i.test(n) || /\.zip$/i.test(n));

/** The project's files, with the files of a zip taken out of it (folders inside the zip flattened). */
async function expand(files: { name: string; bytes: Uint8Array }[]) {
  const text = new TextDecoder();
  const out: { name: string; text: string }[] = [];
  let title = '';
  for (const f of files) {
    if (isZip(f.bytes)) {
      title ||= f.name.replace(/\.zip$/i, '');
      for (const e of await unzip(f.bytes)) out.push({ name: e.name.split('/').pop()!, text: text.decode(e.bytes) });
    } else out.push({ name: f.name, text: text.decode(f.bytes) });
  }
  return { files: out, title };
}

/** Shows what an import brought and what it could not. */
function report(r: WokwiImport) {
  const c = r.project.circuit;
  notify(t('Opened the Wokwi project: {parts} parts, {wires} wires.', { parts: c.components.length, wires: c.wires.length }), 'success');
  const parts = r.skipped.filter((s) => !s.instrument).map((s) => `${s.id} (${s.type})`);
  if (parts.length) notify(t('The lab has no part for: {parts}. They were left out.', { parts: parts.join(', ') }), 'warning');
  if (r.skipped.some((s) => s.instrument)) notify(t('The logic analyzer is one of the lab’s instruments (bottom panel): it needs no part.'), 'info');
  if (r.otherLanguage)
    notify(
      r.project.firmware.language === 'micropython'
        ? t('The Pico runs MicroPython in the lab: the Arduino code was kept as a file, and a main.py was added to start from.')
        : t('This board runs Arduino code: the Python files were kept, and an empty sketch was added.'),
      'info',
    );
  if (r.lost.length) notify(t('Connections that could not be made: {list}', { list: r.lost.slice(0, 6).join('; ') + (r.lost.length > 6 ? '…' : '') }), 'warning');
}

/** Opens a Wokwi project from its files (a zip, or diagram.json and the code). Resolves true when it was opened. */
export async function openWokwiFiles(picked: { name: string; bytes: Uint8Array }[]): Promise<boolean> {
  let files: { name: string; text: string }[];
  let title: string;
  try {
    ({ files, title } = await expand(picked));
  } catch (e) {
    notify(t('Could not read {file}: {error}', { file: picked.map((p) => p.name).join(', '), error: errorText(e) }), 'error');
    return false;
  }
  const jsons = files.filter((f) => /\.json$/i.test(f.name));
  const diagramFile = files.find((f) => f.name.toLowerCase() === 'diagram.json') ?? (jsons.length === 1 ? jsons[0] : undefined);
  if (!diagramFile) {
    notify(t('No diagram.json: choose the Wokwi project’s zip, or its diagram.json together with its code.'), 'warning');
    return false;
  }
  let result: WokwiImport;
  try {
    result = fromWokwi(parseDiagram(diagramFile.text), files, lookup, registry.all(), title || t('Wokwi project'));
  } catch (e) {
    notify(t('Could not open the Wokwi project: {error}', { error: errorText(e) }), 'error');
    return false;
  }
  useEditor.getState().set({ dialog: null });
  if (!(await confirmDiscard())) return false;
  showProject(result.project, null);
  setTimeout(() => fitView({ instant: true }), 0);
  report(result);
  return true;
}

/** File › Wokwi › Open Wokwi Project… */
export async function importWokwi() {
  let picked: { name: string; bytes: Uint8Array }[];
  try {
    picked = await storage.openFiles({ name: t('Wokwi project'), extensions: WOKWI_EXTENSIONS });
  } catch (e) {
    return notify(t('Could not open the files: {error}', { error: errorText(e) }), 'error');
  }
  if (picked.length) await openWokwiFiles(picked);
}

const current = () => toWokwi({ ...useProject.getState().project, view: useEditor.getState().viewport }, lookup);

function warnSkipped(skipped: string[]) {
  if (skipped.length) notify(t('Wokwi has no part for: {parts}. They were left out; their connections to the other parts are kept.', { parts: skipped.join(', ') }), 'warning');
}

/** File › Wokwi › Save for Wokwi…: diagram.json where the user chooses, the code and libraries.txt next to it. */
export async function exportWokwi() {
  const out = current();
  try {
    const path = await storage.exportFiles(out.files, { name: 'Wokwi diagram.json', extensions: ['json'] });
    if (!path) return;
    notify(t('Saved for Wokwi: {files}. On wokwi.com, start a project for the same board and paste each file into the tab of the same name.', { files: out.files.map((f) => f.name).join(', ') }), 'success');
    warnSkipped(out.skipped);
  } catch (e) {
    notify(t('Could not save: {error}', { error: errorText(e) }), 'error');
  }
}

/** File › Wokwi › Copy diagram.json: to paste into the diagram.json tab on wokwi.com. */
export async function copyWokwiDiagram() {
  const out = current();
  try {
    await navigator.clipboard.writeText(out.files[0].text);
    notify(t('diagram.json copied: paste it into the diagram.json tab of a Wokwi project.'), 'success');
    warnSkipped(out.skipped);
  } catch (e) {
    notify(t('Could not copy: {error}', { error: errorText(e) }), 'error');
  }
}
