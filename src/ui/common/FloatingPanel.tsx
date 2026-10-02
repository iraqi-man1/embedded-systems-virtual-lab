/**
 * A panel that sits in its place in the layout, or floats over the window as
 * a small window of its own, resized from its edges and corners. What it
 * shows stays mounted when it switches between the two, so an editor inside
 * keeps its text, cursor and undo history.
 */
import type { CSSProperties, ReactNode } from 'react';
import { resizedRect, type Edge, type Rect } from './floatGeometry';

const EDGES: Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

export function FloatingPanel({
  floating,
  rect,
  docked,
  label,
  className = '',
  onResize,
  children,
}: {
  floating: boolean;
  /** Where it floats (already inside the window). */
  rect: Rect;
  /** Its style in its place in the layout. */
  docked: CSSProperties;
  /** Name of the floating window for assistive technology. */
  label: string;
  className?: string;
  /** While resizing (`done` false) and at the end (`done` true). */
  onResize: (rect: Rect, done: boolean) => void;
  children: ReactNode;
}) {
  const startResize = (edge: Edge) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY };
    let last = rect;
    document.body.classList.add('panel-resizing');
    const move = (ev: PointerEvent) => {
      last = resizedRect(rect, edge, ev.clientX - start.x, ev.clientY - start.y, { w: window.innerWidth, h: window.innerHeight });
      onResize(last, false);
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      document.body.classList.remove('panel-resizing');
      onResize(last, true);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };

  return (
    <div
      className={`float-slot ${className}${floating ? ' floating' : ''}`}
      style={floating ? { left: rect.x, top: rect.y, width: rect.w, height: rect.h } : docked}
      role={floating ? 'region' : undefined}
      aria-label={floating ? label : undefined}
    >
      {children}
      {floating && EDGES.map((edge) => <div key={edge} className={`float-rs ${edge}`} onPointerDown={startResize(edge)} aria-hidden />)}
    </div>
  );
}
