/**
 * A static, scaled-down drawing of a circuit with the real part visuals (start
 * screen cards, the parts guide). Rendered only once it scrolls into view.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CircuitDocument } from '../../core/model/circuit';
import { lookup } from '../../app/registry';
import { ComponentView } from '../workspace/ComponentView';
import { selectionBounds, wirePolyline } from '../workspace/geometry';
import { WireLayer, type Overlay } from '../workspace/WireLayer';

const NO_OVERLAY: Overlay = {
  draft: null,
  marquee: null,
  hoverPin: null,
  netPins: [],
  stickyNetPins: [],
  insertion: null,
  endDrag: null,
  probes: [],
  levels: [],
  voltages: [],
};

/** Bounds of everything drawn: parts and wires. */
export function circuitBounds(circuit: CircuitDocument) {
  const b = selectionBounds(
    circuit,
    circuit.components.map((c) => c.id),
  );
  if (!b) return null;
  let x1 = b.x;
  let y1 = b.y;
  let x2 = b.x + b.width;
  let y2 = b.y + b.height;
  for (const w of circuit.wires) {
    for (const p of wirePolyline(circuit, w) ?? []) {
      x1 = Math.min(x1, p.x);
      y1 = Math.min(y1, p.y);
      x2 = Math.max(x2, p.x);
      y2 = Math.max(y2, p.y);
    }
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** Breadboards first, so parts plugged into them stay visible (as on the canvas). */
function drawOrder(circuit: CircuitDocument) {
  const board = (type: string) => {
    const def = lookup(type);
    return !!def && def.pins.length > 0 && def.pins.every((p) => p.kind === 'socket');
  };
  return [...circuit.components.filter((c) => board(c.type)), ...circuit.components.filter((c) => !board(c.type))];
}

export function CircuitPreview({ circuit, empty, padding = 14, maxZoom = 1 }: { circuit: CircuitDocument | null; empty?: ReactNode; padding?: number; maxZoom?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { rootMargin: '200px' });
    io.observe(el);
    return () => {
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  const bounds = useMemo(() => (circuit ? circuitBounds(circuit) : null), [circuit]);
  const order = useMemo(() => (circuit ? drawOrder(circuit) : []), [circuit]);

  let content: ReactNode = empty ?? null;
  if (circuit && bounds && size && seen && size.w > 0) {
    const zoom = Math.min(maxZoom, (size.w - padding * 2) / Math.max(1, bounds.width), (size.h - padding * 2) / Math.max(1, bounds.height));
    const x = size.w / 2 - (bounds.x + bounds.width / 2) * zoom;
    const y = size.h / 2 - (bounds.y + bounds.height / 2) * zoom;
    content = (
      <div className="world" style={{ transform: `translate(${x}px, ${y}px) scale(${zoom})` }}>
        {order.map((c) => {
          const def = lookup(c.type);
          return def ? <ComponentView key={c.id} inst={c} def={def} selected={false} preview /> : null;
        })}
        <WireLayer circuit={circuit} selectedWires={[]} zoom={zoom} overlay={NO_OVERLAY} />
      </div>
    );
  }
  return (
    <div ref={host} className="cpv" aria-hidden>
      {content}
    </div>
  );
}
