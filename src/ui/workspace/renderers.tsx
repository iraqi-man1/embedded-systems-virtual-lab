/** Built-in renderers for components drawn by the application itself. */
import { memo, type ReactElement } from 'react';
import type { ComponentInstance } from '../../core/model/circuit';
import type { ComponentDefinition } from '../../core/model/component';
import { breadboardLayout, type BreadboardSize } from '../../components/visuals/breadboard';

const Breadboard = memo(function Breadboard({ size }: { size: BreadboardSize }) {
  const l = breadboardLayout(size);
  const holes: ReactElement[] = [];
  for (const p of l.pins) {
    holes.push(<rect key={p.id} x={p.x - 2.6} y={p.y - 2.6} width={5.2} height={5.2} rx={0.8} className="bb-hole" />);
  }
  const labels: ReactElement[] = [];
  for (const [r, y] of Object.entries(l.rowY)) {
    labels.push(
      <text key={`l${r}`} x={l.colX(1) - 10} y={y + 2.2} className="bb-text" textAnchor="middle">{r}</text>,
      <text key={`r${r}`} x={l.colX(l.columns) + 10} y={y + 2.2} className="bb-text" textAnchor="middle">{r}</text>,
    );
  }
  for (let c = 1; c <= l.columns; c++) {
    if (c === 1 || c % 5 === 0) {
      labels.push(
        <text key={`t${c}`} x={l.colX(c)} y={l.rowY.a - 6} className="bb-text" textAnchor="middle">{c}</text>,
        <text key={`b${c}`} x={l.colX(c)} y={l.rowY.j + 10} className="bb-text" textAnchor="middle">{c}</text>,
      );
    }
  }
  const rails = l.railY;
  const x1 = l.colX(1) - 6;
  const x2 = l.colX(l.columns) + 6;
  const channelY = (l.rowY.e + l.rowY.f) / 2;
  return (
    <svg width={l.width} height={l.height} viewBox={`0 0 ${l.width} ${l.height}`} style={{ display: 'block' }}>
      <rect x={0.5} y={0.5} width={l.width - 1} height={l.height - 1} rx={5} className="bb-body" />
      <rect x={4} y={channelY - 4.5} width={l.width - 8} height={9} rx={2} className="bb-channel" />
      {rails && (
        <g>
          <line x1={x1} x2={x2} y1={rails.tn - 6} y2={rails.tn - 6} stroke="#3b78d8" strokeWidth={1.2} />
          <line x1={x1} x2={x2} y1={rails.tp + 6} y2={rails.tp + 6} stroke="#d94141" strokeWidth={1.2} />
          <line x1={x1} x2={x2} y1={rails.bp - 6} y2={rails.bp - 6} stroke="#d94141" strokeWidth={1.2} />
          <line x1={x1} x2={x2} y1={rails.bn + 6} y2={rails.bn + 6} stroke="#3b78d8" strokeWidth={1.2} />
          <text x={x1 - 5} y={rails.tn + 2.5} className="bb-rail neg" textAnchor="middle">−</text>
          <text x={x1 - 5} y={rails.tp + 2.5} className="bb-rail pos" textAnchor="middle">+</text>
          <text x={x1 - 5} y={rails.bp + 2.5} className="bb-rail pos" textAnchor="middle">+</text>
          <text x={x1 - 5} y={rails.bn + 2.5} className="bb-rail neg" textAnchor="middle">−</text>
        </g>
      )}
      {labels}
      {holes}
    </svg>
  );
});

function Junction() {
  return (
    <svg width={9.6} height={9.6} style={{ display: 'block', overflow: 'visible' }}>
      <circle cx={4.8} cy={4.8} r={3.2} fill="var(--symbol)" />
    </svg>
  );
}

function NetLabel({ inst, def }: { inst: ComponentInstance; def: ComponentDefinition }) {
  const name = String(inst.props.name ?? 'NET');
  const { width: w, height: h } = def.size;
  return (
    <svg width={w} height={h} style={{ display: 'block', overflow: 'visible', color: 'var(--symbol)' }}>
      <path d={`M4.8 ${h / 2} L11.5 ${h / 2 - 6} H${Math.max(w - 2, 18 + name.length * 4.2)} V${h / 2 + 6} H11.5 Z`} fill="var(--bg-panel-2)" stroke="currentColor" strokeWidth={1.3} />
      <text x={14} y={h / 2 + 2.6} fontSize={7.5} fill="currentColor" fontFamily="var(--font-mono)">{name}</text>
    </svg>
  );
}

function Placeholder({ def }: { def: ComponentDefinition }) {
  return (
    <svg width={def.size.width} height={def.size.height} style={{ display: 'block' }}>
      <rect x={0.5} y={0.5} width={def.size.width - 1} height={def.size.height - 1} rx={3} fill="var(--bg-panel-2)" stroke="var(--border-strong)" strokeDasharray="3 2" />
      <text x={def.size.width / 2} y={def.size.height / 2 + 3} fontSize={8} textAnchor="middle" fill="var(--text-3)">{def.name}</text>
    </svg>
  );
}

export function renderBuiltin(renderer: string, inst: ComponentInstance, def: ComponentDefinition): ReactElement {
  if (renderer.startsWith('breadboard-')) return <Breadboard size={renderer.slice(11) as BreadboardSize} />;
  if (renderer === 'junction') return <Junction />;
  if (renderer === 'net-label') return <NetLabel inst={inst} def={def} />;
  return <Placeholder def={def} />;
}
