/** Properties of a canvas note: text, size and colour; arrow style; frame title. */
import { useEffect, useState } from 'react';
import type { Annotation } from '../../core/model/circuit';
import { NOTE_COLORS, NOTE_SIZES } from '../../core/circuit/annotations';
import { tr, type MessageKey } from '../../i18n';
import { useT } from '../../i18n/react';
import { Segmented, Switch } from '../common/Controls';
import { Icon } from '../common/Icon';
import { Tip } from '../common/Tooltip';
import { deleteSelection, duplicateSelection, editTextNote, updateNote } from '../workspace/actions';

/** Colour names (from the shared colour vocabulary); '' is the theme's text colour. */
const COLOR_NAMES: Record<string, string> = {
  '#e74c3c': 'Red',
  '#e67e22': 'Orange',
  '#2e9e5b': 'Green',
  '#2f80ed': 'Blue',
  '#9b51e0': 'Purple',
};

function Colors({ value, onPick }: { value: string; onPick: (c: string) => void }) {
  const t = useT();
  return (
    <div className="note-swatches" role="radiogroup" aria-label={t('Colour')}>
      {NOTE_COLORS.map((c) => (
        <Tip key={c || 'ink'} content={c ? tr(COLOR_NAMES[c]) : t('Text colour of the theme')} direct>
          <button
            type="button"
            role="radio"
            aria-checked={value === c}
            aria-label={c ? tr(COLOR_NAMES[c]) : t('Text colour of the theme')}
            className={`swatch${c ? '' : ' ink'}${value === c ? ' active' : ''}`}
            style={c ? { background: c } : undefined}
            onClick={() => onPick(c)}
          />
        </Tip>
      ))}
    </div>
  );
}

/** A text field that saves when it loses focus (one undo step per edit). */
function TextField({ value, onCommit, multiline, placeholder }: { value: string; onCommit: (v: string) => void; multiline?: boolean; placeholder?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => text !== value && onCommit(text);
  const common = {
    className: 'input',
    dir: 'auto' as const,
    value: text,
    placeholder,
    onBlur: commit,
  };
  return multiline ? (
    <textarea {...common} rows={3} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && (e.target as HTMLTextAreaElement).blur()} />
  ) : (
    <input {...common} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
  );
}

const TITLE: Record<Annotation['kind'], MessageKey> = { text: 'Text note', arrow: 'Arrow', rect: 'Frame' };

export function NoteInspector({ note }: { note: Annotation }) {
  const t = useT();
  const set = (patch: Partial<Annotation>) => updateNote(note.id, patch);
  let body: React.ReactNode = null;
  if (note.kind === 'text') {
    body = (
      <>
        <div className="field">
          <label>{t('Text')}</label>
          <TextField value={note.text} multiline onCommit={(text) => text.trim() && set({ text })} />
        </div>
        <div className="field">
          <label>{t('Size')}</label>
          <Segmented
            value={String(note.size)}
            label={t('Size')}
            options={NOTE_SIZES.map((n, i) => ({ value: String(n), label: ['S', 'M', 'L', 'XL'][i] }))}
            onChange={(v) => set({ size: Number(v) })}
          />
        </div>
        <div className="field">
          <label>{t('Bold')}</label>
          <Switch checked={!!note.bold} label={t('Bold')} onChange={(bold) => set({ bold })} />
        </div>
      </>
    );
  } else if (note.kind === 'arrow') {
    body = (
      <>
        <div className="field">
          <label>{t('Line width')}</label>
          <Segmented
            value={String(note.width)}
            label={t('Line width')}
            options={[
              { value: '2', label: t('Thin') },
              { value: '3', label: t('Medium') },
              { value: '5', label: t('Thick') },
            ]}
            onChange={(v) => set({ width: Number(v) })}
          />
        </div>
        <div className="field">
          <label>{t('Heads')}</label>
          <Segmented
            value={note.heads}
            label={t('Heads')}
            options={[
              { value: 'end', label: '→' },
              { value: 'both', label: '↔' },
              { value: 'none', label: '—' },
            ]}
            onChange={(heads) => set({ heads })}
          />
        </div>
        <div className="field">
          <label>{t('Dashed')}</label>
          <Switch checked={!!note.dashed} label={t('Dashed')} onChange={(dashed) => set({ dashed })} />
        </div>
      </>
    );
  } else {
    body = (
      <>
        <div className="field">
          <label>{t('Title')}</label>
          <TextField value={note.title} placeholder={t('e.g. Power supply')} onCommit={(title) => set({ title })} />
        </div>
        <div className="field">
          <label>{t('Dashed')}</label>
          <Switch checked={!!note.dashed} label={t('Dashed')} onChange={(dashed) => set({ dashed })} />
        </div>
      </>
    );
  }
  return (
    <>
      <div className="insp-head">
        <h3>{t(TITLE[note.kind])}</h3>
        <div className="sub">{t('A note for people reading the circuit; the simulation ignores it.')}</div>
      </div>
      <div className="insp-sec">
        {body}
        <div className="field">
          <label>{t('Colour')}</label>
          <Colors value={note.color} onPick={(color) => set({ color })} />
        </div>
        <div className="btn-row" style={{ marginTop: 8 }}>
          {note.kind === 'text' && (
            <button className="btn" onClick={() => editTextNote(note)}>
              <Icon name="pencil" /> {t('Edit on canvas')}
            </button>
          )}
          <Tip content={t('Duplicate')} shortcut="Ctrl+D" direct>
            <button className="btn" onClick={duplicateSelection} aria-label={t('Duplicate')}>
              <Icon name="duplicate" />
            </button>
          </Tip>
          <Tip content={t('Delete')} shortcut="Del" direct>
            <button className="btn danger" onClick={deleteSelection} aria-label={t('Delete')}>
              <Icon name="trash" />
            </button>
          </Tip>
        </div>
      </div>
    </>
  );
}
