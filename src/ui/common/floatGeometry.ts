/**
 * Geometry of floating panels, in window pixels (pure functions). A floating
 * panel always stays inside the window, so its bar can always be reached.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Size {
  w: number;
  h: number;
}
export interface Point {
  x: number;
  y: number;
}
/** An edge or a corner (physical directions, also in right-to-left layouts). */
export type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const FLOAT_MIN: Size = { w: 320, h: 200 };
/** A floating panel opens no larger than this (it can be resized afterwards). */
const OPEN_MAX: Size = { w: 640, h: 560 };
/** How close to the edge of its area the pointer docks a dragged panel. */
export const DOCK_EDGE = 56;

const round = (r: Rect): Rect => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });

/** No smaller than the minimum, no larger than the window, and inside it. */
export function clampRect(r: Rect, win: Size, min: Size = FLOAT_MIN): Rect {
  const w = Math.max(Math.min(min.w, win.w), Math.min(r.w, win.w));
  const h = Math.max(Math.min(min.h, win.h), Math.min(r.h, win.h));
  return round({ x: Math.min(Math.max(0, r.x), win.w - w), y: Math.min(Math.max(0, r.y), win.h - h), w, h });
}

/** Detached with its button: just off its place, toward the canvas (left of it, or right in right-to-left layouts). */
export function detachedRect(docked: Rect, rtl: boolean, win: Size): Rect {
  const w = Math.min(docked.w, OPEN_MAX.w);
  const h = Math.min(docked.h - 64, OPEN_MAX.h);
  const x = rtl ? docked.x + 32 : docked.x + docked.w - w - 32;
  return clampRect({ x, y: docked.y + 32, w, h }, win);
}

/** Torn off its place by a drag: the point that was grabbed stays under the pointer. */
export function tornOffRect(pointer: Point, grab: Point, docked: Rect, win: Size): Rect {
  const w = Math.min(docked.w, OPEN_MAX.w);
  const h = Math.min(docked.h, OPEN_MAX.h);
  const gx = Math.min(grab.x, w - 24);
  return clampRect({ x: pointer.x - gx, y: pointer.y - grab.y, w, h }, win);
}

/** Moved by its bar to follow the pointer. */
export function movedRect(r: Rect, pointer: Point, grab: Point, win: Size): Rect {
  return clampRect({ ...r, x: pointer.x - grab.x, y: pointer.y - grab.y }, win);
}

/** Resized by dragging an edge or corner by (dx, dy): the opposite edge stays where it is. */
export function resizedRect(r: Rect, edge: Edge, dx: number, dy: number, win: Size, min: Size = FLOAT_MIN): Rect {
  let { x, y, w, h } = r;
  const n = edge.includes('n');
  const wst = edge.includes('w');
  if (edge.includes('e')) w = r.w + dx;
  if (edge.includes('s')) h = r.h + dy;
  if (wst) {
    w = r.w - dx;
    x = r.x + dx;
  }
  if (n) {
    h = r.h - dy;
    y = r.y + dy;
  }
  if (w < min.w) {
    if (wst) x -= min.w - w;
    w = min.w;
  }
  if (h < min.h) {
    if (n) y -= min.h - h;
    h = min.h;
  }
  // The window's edges stop it.
  if (x < 0) {
    w += x;
    x = 0;
  }
  if (y < 0) {
    h += y;
    y = 0;
  }
  w = Math.min(w, win.w - x);
  h = Math.min(h, win.h - y);
  return round({ x, y, w, h });
}

/**
 * Whether a dragged panel is over its place: the pointer near (or past) the
 * edge of the area it docks into (the right edge, or the left one in
 * right-to-left layouts).
 */
export function overDockEdge(pointer: Point, area: Rect, rtl: boolean, edge = DOCK_EDGE): boolean {
  if (pointer.y < area.y || pointer.y > area.y + area.h) return false;
  return rtl ? pointer.x <= area.x + edge : pointer.x >= area.x + area.w - edge;
}
