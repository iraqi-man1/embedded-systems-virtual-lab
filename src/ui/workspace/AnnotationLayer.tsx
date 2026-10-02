/**
 * Canvas notes: frames are drawn under the parts (they group them), text and
 * arrows above everything. Lives inside the zoomed world, so positions are
 * world pixels. Hit areas carry `data-annot` (and `data-annot-handle` for the
 * resize handles of a single selected note); the Workspace does the dragging.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Annotation, ArrowNote, FrameNote, TextNote } from '../../core/model/circuit';
import { useT } from '../../i18n/react';
import { useEditor } from '../../state/editor';
import { finishTextNote } from './actions';

/** Note colour, or the theme's text colour when none is set. */
export const noteColor = (c: string) => c || 'var(--text)';

function arrowHead(a: ArrowNote, atEnd: boolean): string {
  const [tx, ty, fx, fy] = atEnd ? [a.x2, a.y2, a.x1, a.y1] : [a.x1, a.y1, a.x2, a.y2];
  const ang = Math.atan2(ty - fy, tx - fx);
  const len = 8 + a.width * 2.6;
  const spread = 0.42;
  const p = (d: number) => `${tx - len * Math.cos(ang + d)},${ty - len * Math.sin(ang + d)}`;
  return `${tx},${ty} ${p(spread)} ${p(-spread)}`;
}

/**
 * The line and the heads of an arrow (also used by the image export). The
 * line stops inside a head so the tip stays sharp.
 */
export function arrowGeometry(a: ArrowNote) {
  const len = Math.hypot(a.x2 - a.x1, a.y2 - a.y1) || 1;
  const cut = Math.min(len / 3, 4 + a.width * 1.6);
  const ux = (a.x2 - a.x1) / len;
  const uy = (a.y2 - a.y1) / len;
  const end = a.heads !== 'none';
  const start = a.heads === 'both';
  return {
    shaft: { x1: a.x1 + (start ? ux * cut : 0), y1: a.y1 + (start ? uy * cut : 0), x2: a.x2 - (end ? ux * cut : 0), y2: a.y2 - (end ? uy * cut : 0) },
    heads: [...(end ? [arrowHead(a, true)] : []), ...(start ? [arrowHead(a, false)] : [])],
  };
}

function Arrow({ a, selected }: { a: ArrowNote; selected: boolean }) {
  const color = noteColor(a.color);
  const { shaft: s, heads } = arrowGeometry(a);
  return (
    <g className={`annot-arrow${selected ? ' selected' : ''}`}>
      {selected && <line className="annot-glow" x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} strokeWidth={a.width + 8} />}
      <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={color} strokeWidth={a.width} strokeLinecap="round" strokeDasharray={a.dashed ? `${a.width * 3} ${a.width * 2.2}` : undefined} />
      {heads.map((h) => (
        <polygon key={h} points={h} fill={color} />
      ))}
      {/* Wide invisible line: easy to grab. */}
      <line className="annot-hit" data-annot={a.id} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} strokeWidth={Math.max(12, a.width + 10)} />
    </g>
  );
}

function Frame({ a, selected }: { a: FrameNote; selected: boolean }) {
  const color = noteColor(a.color);
  const band = 10;
  return (
    <div className={`annot-frame${selected ? ' selected' : ''}`} style={{ left: a.x, top: a.y, width: a.w, height: a.h, borderColor: color, borderStyle: a.dashed ? 'dashed' : 'solid', ['--frame' as string]: color }}>
      {/* The inside stays clickable for the parts; only the border grabs the frame. */}
      <div className="annot-band" data-annot={a.id} style={{ left: -band / 2, top: -band / 2, right: -band / 2, height: band }} />
      <div className="annot-band" data-annot={a.id} style={{ left: -band / 2, bottom: -band / 2, right: -band / 2, height: band }} />
      <div className="annot-band" data-annot={a.id} style={{ left: -band / 2, top: -band / 2, bottom: -band / 2, width: band }} />
      <div className="annot-band" data-annot={a.id} style={{ right: -band / 2, top: -band / 2, bottom: -band / 2, width: band }} />
    </div>
  );
}

function Text({ a, selected }: { a: TextNote; selected: boolean }) {
  return (
    <div
      className={`annot-text${selected ? ' selected' : ''}`}
      data-annot={a.id}
      dir="auto"
      style={{ left: a.x, top: a.y, fontSize: a.size, color: noteColor(a.color), fontWeight: a.bold ? 700 : 400 }}
    >
      {a.text}
    </div>
  );
}

/** A frame's title tab, drawn above the parts so a part inside the frame never hides it. */
function FrameTitle({ a }: { a: FrameNote }) {
  return (
    <div className="annot-frame-title" data-annot={a.id} style={{ left: a.x + 12, top: a.y, background: noteColor(a.color) }} dir="auto">
      {a.title}
    </div>
  );
}

/** In-place text box for a note being typed. Enter adds a line; Esc, Ctrl+Enter or a click elsewhere finishes. */
function TextEditor({ note }: { note: TextNote }) {
  const t = useT();
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    finishTextNote(ref.current?.value ?? '');
  };
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.width = '0px';
    el.style.height = '0px';
    el.style.width = `${Math.max(note.size * 4, el.scrollWidth + 4)}px`;
    el.style.height = `${el.scrollHeight}px`;
  };
  useLayoutEffect(fit);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);
  return (
    <textarea
      ref={ref}
      className="annot-editor"
      dir="auto"
      defaultValue={note.text}
      placeholder={t('Type a note')}
      spellCheck={false}
      style={{ left: note.x, top: note.y, fontSize: note.size, color: noteColor(note.color), fontWeight: note.bold ? 700 : 400 }}
      onInput={fit}
      onBlur={finish}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          finish();
        }
      }}
    />
  );
}

/** Resize handles of the one selected note. */
function Handles({ a, zoom }: { a: Annotation; zoom: number }) {
  const r = 5 / zoom;
  const pts: [string, number, number][] =
    a.kind === 'arrow'
      ? [
          ['p1', a.x1, a.y1],
          ['p2', a.x2, a.y2],
        ]
      : a.kind === 'rect'
        ? [
            ['nw', a.x, a.y],
            ['ne', a.x + a.w, a.y],
            ['sw', a.x, a.y + a.h],
            ['se', a.x + a.w, a.y + a.h],
          ]
        : [];
  return (
    <>
      {pts.map(([h, x, y]) => (
        <circle key={h} className={`annot-handle h-${h}`} data-annot={a.id} data-annot-handle={h} cx={x} cy={y} r={r} strokeWidth={1.5 / zoom} />
      ))}
    </>
  );
}

/** Frames, under the parts. */
export function FrameLayer({ notes, selected }: { notes: Annotation[]; selected: Set<string> }) {
  return (
    <>
      {notes.map((a) => (a.kind === 'rect' ? <Frame key={a.id} a={a} selected={selected.has(a.id)} /> : null))}
    </>
  );
}

/** Text, arrows, the note being typed, the shape being drawn and the handles, above everything. */
export function NoteLayer({ notes, selected, zoom, draft }: { notes: Annotation[]; selected: Set<string>; zoom: number; draft: Annotation | null }) {
  const editing = useEditor((s) => s.editingNote);
  const single = selected.size === 1 ? notes.find((a) => selected.has(a.id)) : undefined;
  return (
    <>
      <svg className="annot-svg">
        {notes.map((a) => (a.kind === 'arrow' ? <Arrow key={a.id} a={a} selected={selected.has(a.id)} /> : null))}
        {draft?.kind === 'arrow' && <Arrow a={draft} selected={false} />}
        {draft?.kind === 'rect' && <rect className="annot-draft" x={draft.x} y={draft.y} width={draft.w} height={draft.h} strokeWidth={1.5 / zoom} />}
        {single && !editing && <Handles a={single} zoom={zoom} />}
      </svg>
      {notes.map((a) => (a.kind === 'rect' && a.title ? <FrameTitle key={a.id} a={a} /> : null))}
      {notes.map((a) => (a.kind === 'text' && a.id !== editing?.id ? <Text key={a.id} a={a} selected={selected.has(a.id)} /> : null))}
      {editing && <TextEditor key={editing.id} note={editing} />}
    </>
  );
}
