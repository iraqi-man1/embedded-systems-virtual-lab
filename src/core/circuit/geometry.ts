import type { ComponentDefinition, PinDefinition } from '../model/component';
import { GRID } from '../model/component';
import type { ComponentInstance, Point } from '../model/circuit';

/** Rotates a local point about the component centre (clockwise, screen coords). */
export function localToWorld(inst: ComponentInstance, def: ComponentDefinition, p: Point): Point {
  const { width: w, height: h } = def.size;
  const cx = w / 2;
  const cy = h / 2;
  let dx = (inst.flip ? w - p.x : p.x) - cx;
  let dy = p.y - cy;
  switch (inst.rotation) {
    case 90:
      [dx, dy] = [-dy, dx];
      break;
    case 180:
      [dx, dy] = [-dx, -dy];
      break;
    case 270:
      [dx, dy] = [dy, -dx];
      break;
  }
  return { x: inst.x + cx + dx, y: inst.y + cy + dy };
}

/** Inverse of `localToWorld`: a world point in the component's unrotated local frame. */
export function worldToLocal(inst: ComponentInstance, def: ComponentDefinition, p: Point): Point {
  const { width: w, height: h } = def.size;
  const cx = w / 2;
  const cy = h / 2;
  let dx = p.x - (inst.x + cx);
  let dy = p.y - (inst.y + cy);
  switch (inst.rotation) {
    case 90:
      [dx, dy] = [dy, -dx];
      break;
    case 180:
      [dx, dy] = [-dx, -dy];
      break;
    case 270:
      [dx, dy] = [-dy, dx];
      break;
  }
  const x = dx + cx;
  return { x: inst.flip ? w - x : x, y: dy + cy };
}

export function pinWorld(inst: ComponentInstance, def: ComponentDefinition, pin: PinDefinition): Point {
  return localToWorld(inst, def, pin);
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Axis-aligned bounds after rotation. */
export function componentBounds(inst: ComponentInstance, def: ComponentDefinition): Rect {
  const { width: w, height: h } = def.size;
  const swap = inst.rotation === 90 || inst.rotation === 270;
  const bw = swap ? h : w;
  const bh = swap ? w : h;
  return { x: inst.x + w / 2 - bw / 2, y: inst.y + h / 2 - bh / 2, width: bw, height: bh };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export const snap = (v: number, grid = GRID) => Math.round(v / grid) * grid;

/**
 * Snaps a component so that its first pin sits on the 0.1" grid; all other
 * pins (at 0.1" multiples) then line up with breadboard holes.
 */
export function snapComponentPosition(
  inst: ComponentInstance,
  def: ComponentDefinition,
  x: number,
  y: number,
  grid = GRID,
): Point {
  const anchor = def.pins[0];
  if (!anchor) return { x: snap(x, grid), y: snap(y, grid) };
  const probe = { ...inst, x, y };
  const p = pinWorld(probe, def, anchor);
  return { x: x + snap(p.x, grid) - p.x, y: y + snap(p.y, grid) - p.y };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Distance from point p to segment ab. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}
