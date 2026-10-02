/**
 * File › Export Image (Ctrl+Shift+E): the circuit, or the selection, as a
 * PNG at 1–8× (96–768 DPI, for reports and print) or as a vector SVG, with a
 * live preview. Copy puts the PNG on the clipboard for pasting into a
 * document.
 */
import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../i18n/react';
import { storage } from '../../platform';
import { useEditor } from '../../state/editor';
import { useProject } from '../../state/project';
import { ModalFrame } from '../common/Dialog';
import { Segmented, Switch } from '../common/Controls';
import { Icon } from '../common/Icon';
import { copyPng } from './copy';
import { buildExportSvg, maxScale, renderPng, scaledSvg, type ExportBackground } from './exportImage';

const SCALES = [1, 2, 4, 8] as const;

type Format = 'png' | 'svg';

interface Saved {
  format: Format;
  scale: number;
  background: ExportBackground;
  labels: boolean;
  notes: boolean;
  grid: boolean;
}

const KEY = 'evlab.export.v1';
const DEFAULTS: Saved = { format: 'png', scale: 4, background: 'white', labels: true, notes: true, grid: false };

function loadSaved(): Saved {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

const fileBase = () => (useProject.getState().project.meta.name || 'circuit').replace(/[\\/:*?"<>|]+/g, '-');

export function ExportDialog() {
  const t = useT();
  const circuit = useProject((s) => s.project.circuit);
  const selComponents = useEditor((s) => s.selectedComponents);
  const selWires = useEditor((s) => s.selectedWires);
  const selNotes = useEditor((s) => s.selectedAnnotations);
  const selected = useMemo(() => ({ components: selComponents, wires: selWires, notes: selNotes }), [selComponents, selWires, selNotes]);
  const hasSelection = selected.components.length + selected.notes.length > 0;
  const [opts, setOpts] = useState<Saved>(loadSaved);
  const [onlySelection, setOnlySelection] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Saved>) =>
    setOpts((o) => {
      const next = { ...o, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* not remembered */
      }
      return next;
    });
  const close = () => useEditor.getState().set({ dialog: null });

  // The image itself, rebuilt when an option changes (reads the live canvas).
  const image = useMemo(
    () =>
      buildExportSvg(circuit, {
        selection: onlySelection && hasSelection ? selected : null,
        background: opts.background,
        labels: opts.labels,
        notes: opts.notes,
        grid: opts.grid,
      }),
    [circuit, onlySelection, hasSelection, selected, opts.background, opts.labels, opts.notes, opts.grid],
  );
  const [preview, setPreview] = useState('');
  useEffect(() => {
    if (!image) return setPreview('');
    const url = URL.createObjectURL(new Blob([image.svg], { type: 'image/svg+xml' }));
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const limit = image ? maxScale(image.width, image.height) : 8;
  const scale = Math.min(opts.scale, limit);
  // Isolated so the width stays first in Arabic.
  const px = image ? `\u2066${Math.round(image.width * scale)} × ${Math.round(image.height * scale)}\u2069` : '';

  const run = async (action: 'save' | 'copy') => {
    if (!image) return;
    setBusy(true);
    const ed = useEditor.getState();
    try {
      if (opts.format === 'svg' && action === 'save') {
        const path = await storage.exportText(scaledSvg(image, 1), `${fileBase()}.svg`, { name: t('SVG image'), extensions: ['svg'] });
        if (path) ed.notify(t('Saved the image to {path}', { path }), 'success');
      } else {
        const png = await renderPng(image, action === 'copy' ? Math.min(scale, 4) : scale);
        if (action === 'copy') {
          await copyPng(png);
          ed.notify(t('Copied the circuit as an image. Paste it into a document or chat.'), 'success');
        } else {
          const path = await storage.exportBinary(png, `${fileBase()}.png`, { name: t('PNG image'), extensions: ['png'] }, 'image/png');
          if (path) ed.notify(t('Saved the image to {path}', { path }), 'success');
        }
      }
      close();
    } catch (err) {
      ed.notify(t('Could not export the image: {error}', { error: String((err as Error).message ?? err) }), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalFrame
      title={t('Export image')}
      wide
      onClose={close}
      footer={
        <>
          <button className="btn" disabled={!image || busy} onClick={() => void run('copy')}>
            <Icon name="copy" /> {t('Copy to clipboard')}
          </button>
          <button className="btn primary" disabled={!image || busy} onClick={() => void run('save')}>
            <Icon name="save" /> {busy ? t('Exporting…') : t('Save…')}
          </button>
        </>
      }
    >
      <div className="export">
        <div className={`export-preview${opts.background === 'transparent' ? ' checker' : ''}`}>
          {preview ? <img src={preview} alt={t('Preview of the exported image')} /> : <div className="empty-note">{t('Nothing to export: the circuit is empty.')}</div>}
        </div>
        <div className="export-options">
          <div className="set-row">
            <div className="set-text">
              <div className="set-label">{t('Format')}</div>
              <div className="set-desc">{opts.format === 'png' ? t('PNG: a picture for documents, slides and chat.') : t('SVG: a vector drawing that stays sharp at any size; edit it in Inkscape or Illustrator.')}</div>
            </div>
            <div className="set-control">
              <Segmented
                value={opts.format}
                label={t('Format')}
                options={[
                  { value: 'png', label: 'PNG' },
                  { value: 'svg', label: 'SVG' },
                ]}
                onChange={(format) => set({ format })}
              />
            </div>
          </div>
          {opts.format === 'png' && (
            <div className="set-row">
              <div className="set-text">
                <div className="set-label">{t('Resolution')}</div>
                <div className="set-desc ltr-nums">
                  {t('{size} pixels · {dpi} DPI', { size: px, dpi: Math.round(96 * scale) })}
                  {opts.scale > limit && <span className="warn"> — {t('reduced: the largest possible for this circuit is {n}×', { n: Math.floor(limit * 10) / 10 })}</span>}
                </div>
              </div>
              <div className="set-control">
                <Segmented value={String(opts.scale)} label={t('Resolution')} options={SCALES.map((s) => ({ value: String(s), label: `\u2066${s}×\u2069` }))} onChange={(v) => set({ scale: Number(v) })} />
              </div>
            </div>
          )}
          <div className="set-row">
            <div className="set-text">
              <div className="set-label">{t('Background')}</div>
              <div className="set-desc">{t('White prints best; transparent suits slides with their own colour.')}</div>
            </div>
            <div className="set-control">
              <Segmented
                value={opts.background}
                label={t('Background')}
                options={[
                  { value: 'white', label: t('White') },
                  { value: 'theme', label: t('Theme') },
                  { value: 'transparent', label: t('Transparent') },
                ]}
                onChange={(background) => set({ background })}
              />
            </div>
          </div>
          <div className="export-checks">
            <label>
              <Switch checked={opts.labels} label={t('Part labels (R1, U1…)')} onChange={(labels) => set({ labels })} /> {t('Part labels (R1, U1…)')}
            </label>
            <label>
              <Switch checked={opts.notes} label={t('Notes, arrows and frames')} onChange={(notes) => set({ notes })} /> {t('Notes, arrows and frames')}
            </label>
            <label>
              <Switch checked={opts.grid} label={t('Grid dots')} onChange={(grid) => set({ grid })} /> {t('Grid dots')}
            </label>
            <label className={hasSelection ? '' : 'disabled'}>
              <Switch checked={onlySelection && hasSelection} label={t('Only the selection')} onChange={(v) => hasSelection && setOnlySelection(v)} /> {t('Only the selection')}
            </label>
          </div>
        </div>
      </div>
    </ModalFrame>
  );
}
