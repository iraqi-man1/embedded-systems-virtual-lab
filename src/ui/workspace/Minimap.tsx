/**
 * Overview of the whole circuit in the corner of the canvas (key M), shown
 * while part of the circuit is out of view. The framed area is what the
 * canvas shows: click anywhere to go there, or drag the frame to move around.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { componentBounds } from '../../core/circuit/geometry';
import { lookup } from '../../app/registry';
import { useT } from '../../i18n/react';
import { useEditor } from '../../state/editor';
import { useProject } from '../../state/project';
import { centerOn } from './actions';
import { wirePolyline } from './geometry';

const W = 196;
const H = 128;

export function Minimap() {
  const t = useT();
  const circuit = useProject((s) => s.project.circuit);
  const viewport = useEditor((s) => s.viewport);
  const host = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const grab = useRef<{ dx: number; dy: number } | null>(null);
  const [canvas, setCanvas] = useState({ w: 800, h: 600 });

  useEffect(() => {
    const el = host.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => setCanvas({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const parts = useMemo(
    () =>
      circuit.components.flatMap((c) => {
        const def = lookup(c.type);
        if (!def) return [];
        const board = def.pins.length > 0 && def.pins.every((p) => p.kind === 'socket');
        return [{ id: c.id, b: componentBounds(c, def), board }];
      }),
    [circuit.components],
  );
  const wires = useMemo(() => circuit.wires.map((w) => ({ id: w.id, color: w.color, pts: wirePolyline(circuit, w) ?? [] })), [circuit]);

  if (!parts.length) return null;

  const view = { x: -viewport.x / viewport.zoom, y: -viewport.y / viewport.zoom, w: canvas.w / viewport.zoom, h: canvas.h / viewport.zoom };
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const { b } of parts) {
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.width);
    y2 = Math.max(y2, b.y + b.height);
  }
  // Everything is on screen: nothing to navigate to.
  if (!grab.current && x1 >= view.x && y1 >= view.y && x2 <= view.x + view.w && y2 <= view.y + view.h) return null;
  x1 = Math.min(x1, view.x);
  y1 = Math.min(y1, view.y);
  x2 = Math.max(x2, view.x + view.w);
  y2 = Math.max(y2, view.y + view.h);
  const pad = Math.max(x2 - x1, y2 - y1) * 0.04;
  const box = { x: x1 - pad, y: y1 - pad, w: x2 - x1 + pad * 2, h: y2 - y1 + pad * 2 };

  const toWorld = (e: React.PointerEvent) => {
    const m = svg.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };

  return (
    <div
      ref={host}
      className="canvas-minimap"
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.button !== 0) return;
        const p = toWorld(e);
        if (!p) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const cx = view.x + view.w / 2;
        const cy = view.y + view.h / 2;
        const inside = p.x >= view.x && p.x <= view.x + view.w && p.y >= view.y && p.y <= view.y + view.h;
        // Dragging the frame keeps the grab point under the pointer; a click elsewhere jumps there.
        grab.current = inside ? { dx: p.x - cx, dy: p.y - cy } : { dx: 0, dy: 0 };
        if (!inside) centerOn(p.x, p.y, true);
      }}
      onPointerMove={(e) => {
        if (!grab.current) return;
        const p = toWorld(e);
        if (p) centerOn(p.x - grab.current.dx, p.y - grab.current.dy);
      }}
      onPointerUp={() => (grab.current = null)}
      onPointerCancel={() => (grab.current = null)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <svg ref={svg} width={W} height={H} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={t('Minimap')}>
        {parts.map(({ id, b, board }) => (
          <rect key={id} className={board ? 'mm-board' : 'mm-part'} x={b.x} y={b.y} width={b.width} height={b.height} rx={Math.min(b.width, b.height) * 0.06} />
        ))}
        {wires.map((w) =>
          w.pts.length > 1 ? <polyline key={w.id} className="mm-wire" points={w.pts.map((p) => `${p.x},${p.y}`).join(' ')} style={{ stroke: w.color }} /> : null,
        )}
        <rect className="mm-view" x={view.x} y={view.y} width={view.w} height={view.h} />
      </svg>
    </div>
  );
}
