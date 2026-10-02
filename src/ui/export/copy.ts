/** Copying the circuit as a picture (Ctrl+Shift+C, the Export dialog). */
import { t as translate } from '../../i18n';
import { useEditor } from '../../state/editor';
import { useProject } from '../../state/project';
import { buildExportSvg, maxScale, renderPng } from './exportImage';

/** Puts a PNG on the clipboard. */
export async function copyPng(bytes: Uint8Array) {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([bytes as BlobPart], { type: 'image/png' }) })]);
}

/** Copies the selection (or the whole circuit) as a 2× PNG: Ctrl+Shift+C. */
export async function copyCircuitImage() {
  const ed = useEditor.getState();
  const sel = ed.selectedComponents.length + ed.selectedAnnotations.length ? { components: ed.selectedComponents, wires: ed.selectedWires, notes: ed.selectedAnnotations } : null;
  const e = buildExportSvg(useProject.getState().project.circuit, { selection: sel, background: 'white', labels: true, notes: true, grid: false });
  if (!e) return;
  try {
    await copyPng(await renderPng(e, Math.min(2, maxScale(e.width, e.height))));
    ed.notify(translate('Copied the circuit as an image. Paste it into a document or chat.'), 'success');
  } catch (err) {
    ed.notify(translate('Could not copy the image: {error}', { error: String((err as Error).message ?? err) }), 'error');
  }
}
