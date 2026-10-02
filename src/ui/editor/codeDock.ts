/**
 * The code editor beside the canvas, or floating over the window. Detach it
 * with its button, a double-click on its tab bar or by dragging the tab bar
 * away; move it by its tab bar; put it back with the button, a double-click,
 * or by dragging it back to the edge of the canvas where it belongs.
 */
import { isRtl } from '../../i18n';
import { useEditor } from '../../state/editor';
import { clampRect, detachedRect, movedRect, overDockEdge, tornOffRect, type Rect } from '../common/floatGeometry';

const ed = () => useEditor.getState();
const windowSize = () => ({ w: window.innerWidth, h: window.innerHeight });

function rectOf(selector: string): Rect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/** Floats the editor where it was left last time, or just off its place. */
export function floatCode() {
  const docked = rectOf('.code-slot');
  const rect = ed().codeFloatRect ?? (docked ? detachedRect(docked, isRtl(), windowSize()) : clampRect({ x: 160, y: 120, w: 520, h: 480 }, windowSize()));
  ed().setPrefs({ showCode: true, codeFloating: true, codeFloatRect: rect });
}

/** Back in its place beside the canvas (the floating position is kept for next time). */
export function dockCode() {
  ed().set({ codeDocking: false });
  ed().setPrefs({ showCode: true, codeFloating: false });
}

export const toggleCodeFloat = () => (ed().codeFloating ? dockCode() : floatCode());

/** The tab bar's free space (not a tab, a button or a field) moves the editor. */
const isBarSpace = (target: EventTarget | null) => !(target as HTMLElement | null)?.closest?.('.code-tab, button, input, select, [role="button"]');

/** Double-click on the tab bar's free space: detach, or put back. */
export function onCodeBarDoubleClick(e: React.MouseEvent) {
  if (isBarSpace(e.target)) toggleCodeFloat();
}

/**
 * Pointer down on the tab bar: dragging moves the floating editor, or tears
 * the docked one off its place. Letting go over the edge of the canvas where
 * it belongs docks it again.
 */
export function startCodeBarDrag(e: React.PointerEvent<HTMLElement>) {
  if (e.button !== 0 || !isBarSpace(e.target)) return;
  const panel = rectOf('.code-slot');
  if (!panel) return;
  const bar = e.currentTarget;
  const pointerId = e.pointerId;
  const start = { x: e.clientX, y: e.clientY };
  let grab = { x: e.clientX - panel.x, y: e.clientY - panel.y };
  /** Where it floated before this drag: kept if the drag ends in its place. */
  const before = ed().codeFloatRect;
  let dragging = false;

  const move = (ev: PointerEvent) => {
    const p = { x: ev.clientX, y: ev.clientY };
    if (!dragging) {
      if (Math.hypot(p.x - start.x, p.y - start.y) < 6) return;
      dragging = true;
      bar.setPointerCapture(pointerId);
      document.body.classList.add('panel-dragging');
      if (!ed().codeFloating) {
        const torn = tornOffRect(p, grab, panel, windowSize());
        grab = { x: p.x - torn.x, y: p.y - torn.y };
        ed().set({ codeFloating: true, codeFloatRect: torn });
      }
    }
    const r = ed().codeFloatRect;
    if (!r) return;
    const area = rectOf('.center-top');
    ed().set({ codeFloatRect: movedRect(r, p, grab, windowSize()), codeDocking: !!area && overDockEdge(p, area, isRtl()) });
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    document.body.classList.remove('panel-dragging');
    if (!dragging) return;
    if (ed().codeDocking) {
      // Docked by dragging it back: the next detach opens where it floated before.
      ed().set({ codeFloatRect: before });
      dockCode();
    } else ed().setPrefs({});
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}
