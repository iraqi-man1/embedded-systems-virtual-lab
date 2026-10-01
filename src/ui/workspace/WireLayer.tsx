import { memo } from 'react';
import type { CircuitDocument, Point, Wire } from '../../core/model/circuit';
import { orthogonalPath, polylineToPath, wirePolyline } from './geometry';

interface WireProps {
  circuit: CircuitDocument;
  wire: Wire;
  selected: boolean;
  zoom: number;
}

const WireView = memo(function WireView({ circuit, wire, selected, zoom }: WireProps) {
  const pts = wirePolyline(circuit, wire);
  if (!pts) return null;
  const d = polylineToPath(pts);
  const width = 2.4;
  const mid = pts[Math.floor(pts.length / 2)];
  const prev = pts[Math.floor(pts.length / 2) - 1] ?? mid;
  return (
    <g data-wire={wire.id}>
      {selected && <path className="wire-selected" d={d} strokeWidth={width + 6} />}
      <path className="wire-outline" d={d} strokeWidth={width + 1.4} />
      <path className="wire" d={d} stroke={wire.color} strokeWidth={width} />
      <path className="wire-hit" d={d} strokeWidth={Math.max(8, 10 / zoom)} data-wire={wire.id} />
      <circle className="endpoint" cx={pts[0].x} cy={pts[0].y} r={2.2} stroke={wire.color} />
      <circle className="endpoint" cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={2.2} stroke={wire.color} />
      {wire.label && (
        <text className="wire-label" x={(mid.x + prev.x) / 2} y={(mid.y + prev.y) / 2 - 4} textAnchor="middle">
          {wire.label}
        </text>
      )}
      {selected &&
        wire.points.map((p, i) => (
          <rect
            key={i}
            className="handle"
            data-wire={wire.id}
            data-handle={i}
            x={p.x - 4 / zoom}
            y={p.y - 4 / zoom}
            width={8 / zoom}
            height={8 / zoom}
            strokeWidth={1.5 / zoom}
          />
        ))}
    </g>
  );
});

export interface Overlay {
  /** Wire being drawn: anchor points and current cursor. */
  draft: { points: Point[]; cursor: Point; color: string } | null;
  marquee: { x: number; y: number; w: number; h: number } | null;
  hoverPin: Point | null;
  netPins: Point[];
  probes: { x: number; y: number; color: string; label: string }[];
}

interface Props {
  circuit: CircuitDocument;
  selectedWires: string[];
  zoom: number;
  overlay: Overlay;
}

export function WireLayer({ circuit, selectedWires, zoom, overlay }: Props) {
  const sel = new Set(selectedWires);
  return (
    <svg className="wires" width={1} height={1}>
      {circuit.wires.map((w) => (
        <WireView key={w.id} circuit={circuit} wire={w} selected={sel.has(w.id)} zoom={zoom} />
      ))}
      {overlay.netPins.map((p, i) => (
        <circle key={i} className="net-pin" cx={p.x} cy={p.y} r={2.4} />
      ))}
      {overlay.draft && (
        <path
          d={polylineToPath(orthogonalPath([...overlay.draft.points, overlay.draft.cursor]))}
          stroke={overlay.draft.color}
          strokeWidth={2.4}
          strokeDasharray="5 3"
          fill="none"
          strokeLinecap="round"
        />
      )}
      {overlay.hoverPin && <circle className="pin-hover" cx={overlay.hoverPin.x} cy={overlay.hoverPin.y} r={5} strokeWidth={2 / zoom} />}
      {overlay.probes.map((p, i) => (
        <g key={i}>
          <circle className="probe-mark" cx={p.x} cy={p.y} r={4.2} fill={p.color} />
          <text x={p.x + 6} y={p.y - 5} fontSize={8} fontFamily="var(--font-mono)" fill={p.color} style={{ paintOrder: 'stroke', stroke: 'var(--bg-canvas)', strokeWidth: 3 }}>
            {p.label}
          </text>
        </g>
      ))}
      {overlay.marquee && (
        <rect className="marquee" x={overlay.marquee.x} y={overlay.marquee.y} width={overlay.marquee.w} height={overlay.marquee.h} strokeWidth={1 / zoom} />
      )}
    </svg>
  );
}
