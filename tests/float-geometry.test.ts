/** The floating code editor: always inside the window, resized from any edge, docked from either side. */
import { describe, expect, it } from 'vitest';
import { clampRect, detachedRect, FLOAT_MIN, movedRect, overDockEdge, resizedRect, tornOffRect } from '../src/ui/common/floatGeometry';

const win = { w: 1440, h: 860 };
const inside = (r: { x: number; y: number; w: number; h: number }, size = win) => r.x >= 0 && r.y >= 0 && r.x + r.w <= size.w && r.y + r.h <= size.h;

describe('floating panel geometry', () => {
  it('keeps the panel inside the window, at least its minimum size', () => {
    expect(clampRect({ x: -200, y: -50, w: 500, h: 400 }, win)).toEqual({ x: 0, y: 0, w: 500, h: 400 });
    expect(clampRect({ x: 1300, y: 800, w: 500, h: 400 }, win)).toEqual({ x: 940, y: 460, w: 500, h: 400 });
    expect(clampRect({ x: 10, y: 10, w: 100, h: 50 }, win)).toMatchObject({ w: FLOAT_MIN.w, h: FLOAT_MIN.h });
    // A window smaller than the panel: the panel shrinks to the window.
    const small = { w: 600, h: 300 };
    const r = clampRect({ x: 400, y: 200, w: 900, h: 700 }, small);
    expect(r).toEqual({ x: 0, y: 0, w: 600, h: 300 });
  });

  it('detaches next to its place, toward the canvas', () => {
    const docked = { x: 980, y: 68, w: 460, h: 527 };
    const ltr = detachedRect(docked, false, win);
    expect(ltr.x).toBeLessThan(docked.x);
    expect(ltr.y).toBeGreaterThan(docked.y);
    expect(inside(ltr)).toBe(true);
    const rtlDocked = { x: 0, y: 68, w: 460, h: 527 };
    const rtl = detachedRect(rtlDocked, true, win);
    expect(rtl.x).toBeGreaterThan(rtlDocked.x);
    expect(inside(rtl)).toBe(true);
  });

  it('tears off with the grabbed point under the pointer', () => {
    const docked = { x: 980, y: 68, w: 460, h: 527 };
    const grab = { x: 200, y: 15 };
    const r = tornOffRect({ x: 700, y: 300 }, grab, docked, win);
    expect(r).toMatchObject({ x: 500, y: 285, w: 460 });
    expect(r.h).toBeLessThanOrEqual(560);
  });

  it('moves with the pointer but never out of the window', () => {
    const r = { x: 100, y: 100, w: 500, h: 400 };
    expect(movedRect(r, { x: 400, y: 300 }, { x: 50, y: 10 }, win)).toEqual({ x: 350, y: 290, w: 500, h: 400 });
    expect(inside(movedRect(r, { x: 5000, y: -300 }, { x: 50, y: 10 }, win))).toBe(true);
  });

  it('resizes from each edge and corner, keeping the opposite edge', () => {
    const r = { x: 300, y: 200, w: 500, h: 400 };
    expect(resizedRect(r, 'se', 100, 50, win)).toEqual({ x: 300, y: 200, w: 600, h: 450 });
    expect(resizedRect(r, 'nw', 100, 50, win)).toEqual({ x: 400, y: 250, w: 400, h: 350 });
    expect(resizedRect(r, 'w', -100, 0, win)).toEqual({ x: 200, y: 200, w: 600, h: 400 });
    expect(resizedRect(r, 'n', 0, 30, win)).toEqual({ x: 300, y: 230, w: 500, h: 370 });
    // Not below the minimum: the opposite (right/bottom) edge stays put.
    const tiny = resizedRect(r, 'nw', 400, 400, win);
    expect(tiny).toEqual({ x: 800 - FLOAT_MIN.w, y: 600 - FLOAT_MIN.h, w: FLOAT_MIN.w, h: FLOAT_MIN.h });
    // The window's edges stop it.
    expect(resizedRect(r, 'se', 5000, 5000, win)).toEqual({ x: 300, y: 200, w: 1140, h: 660 });
    expect(resizedRect(r, 'nw', -5000, -5000, win)).toEqual({ x: 0, y: 0, w: 800, h: 600 });
  });

  it('docks near the edge of its area: the right one, or the left one right to left', () => {
    const area = { x: 280, y: 68, w: 1160, h: 527 };
    expect(overDockEdge({ x: 1430, y: 300 }, area, false)).toBe(true);
    expect(overDockEdge({ x: 1300, y: 300 }, area, false)).toBe(false);
    expect(overDockEdge({ x: 1430, y: 700 }, area, false)).toBe(false); // below the area (over the instruments)
    const rtlArea = { x: 0, y: 68, w: 1160, h: 527 };
    expect(overDockEdge({ x: 20, y: 300 }, rtlArea, true)).toBe(true);
    expect(overDockEdge({ x: 1430, y: 300 }, rtlArea, true)).toBe(false);
  });
});
