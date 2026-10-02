/** Geometry and defaults of canvas notes (text, arrows, frames). */
import type { Annotation, ArrowNote, FrameNote, Point, TextNote } from '../model/circuit';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Text sizes offered in the Properties panel (world pixels). */
export const NOTE_SIZES = [12, 16, 24, 36] as const;
export const NOTE_COLORS = ['', '#e74c3c', '#e67e22', '#2e9e5b', '#2f80ed', '#9b51e0'] as const;

/** Approximate size of a text note; the canvas measures the real one. */
export function textExtent(n: Pick<TextNote, 'text' | 'size'>): { width: number; height: number } {
  const lines = n.text.split('\n');
  const longest = Math.max(1, ...lines.map((l) => l.length));
  return { width: Math.max(n.size, longest * n.size * 0.56), height: lines.length * n.size * 1.3 };
}

export function annotationBounds(a: Annotation): Rect {
  switch (a.kind) {
    case 'text': {
      const e = textExtent(a);
      return { x: a.x, y: a.y, width: e.width, height: e.height };
    }
    case 'arrow':
      return { x: Math.min(a.x1, a.x2), y: Math.min(a.y1, a.y2), width: Math.abs(a.x2 - a.x1), height: Math.abs(a.y2 - a.y1) };
    case 'rect':
      return { x: a.x, y: a.y, width: a.w, height: a.h };
  }
}

/** Moves a note (in place; works on Immer drafts). */
export function translateAnnotation(a: Annotation, dx: number, dy: number) {
  if (a.kind === 'arrow') {
    a.x1 += dx;
    a.y1 += dy;
    a.x2 += dx;
    a.y2 += dy;
  } else {
    a.x += dx;
    a.y += dy;
  }
}

/** The note moved by (dx, dy) from `orig` (dragging keeps the original for exact offsets). */
export function movedFrom<T extends Annotation>(orig: T, dx: number, dy: number): T {
  const c = structuredClone(orig);
  translateAnnotation(c, dx, dy);
  return c;
}

const intersects = (a: Rect, b: Rect) => a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;
const contains = (outer: Rect, r: Rect) => r.x >= outer.x && r.y >= outer.y && r.x + r.width <= outer.x + outer.width && r.y + r.height <= outer.y + outer.height;

/** Notes inside a selection box (or touching it, for a right-to-left "crossing" box). */
export function annotationsIn(list: Annotation[] | undefined, rect: Rect, crossing: boolean): string[] {
  return (list ?? []).filter((a) => (crossing ? intersects(annotationBounds(a), rect) : contains(rect, annotationBounds(a)))).map((a) => a.id);
}

export const newText = (id: string, at: Point): TextNote => ({ id, kind: 'text', x: at.x, y: at.y, text: '', size: 16, color: '' });

/** An arrow from `a` to `b`; a click without dragging gives a short arrow to the right. */
export function newArrow(id: string, a: Point, b: Point): ArrowNote {
  const short = Math.hypot(b.x - a.x, b.y - a.y) < 8;
  return { id, kind: 'arrow', x1: a.x, y1: a.y, x2: short ? a.x + 96 : b.x, y2: short ? a.y : b.y, color: '#e74c3c', width: 3, heads: 'end' };
}

/** A frame spanning two corners; a click gives a default size. */
export function newFrame(id: string, a: Point, b: Point): FrameNote {
  const small = Math.abs(b.x - a.x) < 8 && Math.abs(b.y - a.y) < 8;
  const x2 = small ? a.x + 192 : b.x;
  const y2 = small ? a.y + 128 : b.y;
  return { id, kind: 'rect', x: Math.min(a.x, x2), y: Math.min(a.y, y2), w: Math.abs(x2 - a.x), h: Math.abs(y2 - a.y), color: '#2f80ed', title: '', dashed: true };
}

export type NoteHandle = 'p1' | 'p2' | 'nw' | 'ne' | 'sw' | 'se';

/** Drags one handle of a note from its original shape to `p` (frames never turn inside out). */
export function dragHandle(orig: Annotation, handle: NoteHandle, p: Point): Annotation {
  if (orig.kind === 'arrow') return handle === 'p1' ? { ...orig, x1: p.x, y1: p.y } : { ...orig, x2: p.x, y2: p.y };
  if (orig.kind !== 'rect') return orig;
  const left = handle === 'nw' || handle === 'sw';
  const top = handle === 'nw' || handle === 'ne';
  const fixedX = left ? orig.x + orig.w : orig.x;
  const fixedY = top ? orig.y + orig.h : orig.y;
  const min = 24;
  const x = left ? Math.min(p.x, fixedX - min) : fixedX;
  const y = top ? Math.min(p.y, fixedY - min) : fixedY;
  const w = left ? fixedX - x : Math.max(min, p.x - fixedX);
  const h = top ? fixedY - y : Math.max(min, p.y - fixedY);
  return { ...orig, x, y, w, h };
}
