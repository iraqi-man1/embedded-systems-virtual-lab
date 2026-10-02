import { useRef, useState } from 'react';
import { storage } from '../../platform';
import { captures } from '../../state/captures';
import { useEditor } from '../../state/editor';
import { useProject } from '../../state/project';
import { useSim } from '../../state/sim';
import { decodeUart, indexAtOrAfter, toVcd } from '../../core/instruments/decoders';
import { Icon } from '../common/Icon';
import { Tip } from '../common/Tooltip';
import { cssVar, formatTime, TIME_DIVS, useCanvas } from './useCanvas';
import { removeChannel } from './probes';

const ROW = 34;

export function LogicAnalyzer() {
  const channels = useProject((s) => s.project.instruments.logic);
  const simState = useSim((s) => s.state);
  const [timeDiv, setTimeDiv] = useState(1e-3);
  const [follow, setFollow] = useState(true);
  const [end, setEnd] = useState(0);
  const [decoders, setDecoders] = useState<Record<string, number>>({});
  const drag = useRef<{ x: number; end: number } | null>(null);
  const [hoverT, setHoverT] = useState<number | null>(null);

  const ref = useCanvas(
    (ctx, w, h) => {
      ctx.fillStyle = cssVar('--bg-panel-2');
      ctx.fillRect(0, 0, w, h);
      const window = timeDiv * 10;
      const tEnd = follow ? captures.simTime : end;
      const t0 = tEnd - window;
      const xOf = (t: number) => ((t - t0) / window) * w;
      ctx.strokeStyle = cssVar('--border');
      ctx.fillStyle = cssVar('--text-3');
      ctx.font = '10px Cascadia Mono, Consolas, monospace';
      for (let i = 0; i <= 10; i++) {
        const x = Math.round((i * w) / 10) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
        if (i < 10) ctx.fillText(formatTime(t0 + i * timeDiv), x + 3, h - 4);
      }
      channels.forEach((ch, ci) => {
        const top = 8 + ci * ROW;
        const hi = top + 4;
        const lo = top + ROW - 12;
        const c = captures.probes.get(`logic:${ch.id}`);
        ctx.strokeStyle = cssVar('--border');
        ctx.beginPath();
        ctx.moveTo(0, top + ROW - 4.5);
        ctx.lineTo(w, top + ROW - 4.5);
        ctx.stroke();
        if (!c || !c.length) return;
        ctx.strokeStyle = ch.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const n = c.length / 2;
        let i = Math.max(0, indexAtOrAfter(c, t0) - 1);
        let first = true;
        let prevY = 0;
        for (; i < n; i++) {
          const t = Math.max(t0, c.data[i * 2]);
          if (t > tEnd) break;
          const v = c.data[i * 2 + 1];
          const tn = i + 1 < n ? Math.min(tEnd, c.data[(i + 1) * 2]) : tEnd;
          const y = v === 1 ? hi : v === 0 ? lo : (hi + lo) / 2;
          const x = xOf(t);
          if (first) {
            ctx.moveTo(x, y);
            first = false;
          } else {
            ctx.lineTo(x, prevY);
            ctx.lineTo(x, y);
          }
          ctx.lineTo(xOf(tn), y);
          prevY = y;
        }
        ctx.stroke();
        ctx.lineWidth = 1;
        const baud = decoders[ch.id];
        if (baud) {
          const frames = decodeUart(c, baud, t0 - 12 / baud, tEnd);
          ctx.font = '10px Cascadia Mono, Consolas, monospace';
          for (const f of frames) {
            const x1 = xOf(f.start);
            const x2 = xOf(f.end);
            if (x2 < 0 || x1 > w) continue;
            ctx.fillStyle = f.error ? 'rgba(220,60,60,0.25)' : 'rgba(80,150,255,0.18)';
            ctx.fillRect(x1, hi - 2, x2 - x1, lo - hi + 4);
            if (x2 - x1 > 18) {
              ctx.fillStyle = f.error ? cssVar('--err') : cssVar('--text');
              const ch2 = f.value >= 32 && f.value < 127 ? `'${String.fromCharCode(f.value)}'` : `0x${f.value.toString(16).padStart(2, '0')}`;
              ctx.fillText(ch2, x1 + 3, (hi + lo) / 2 + 3);
            }
          }
        }
      });
      if (hoverT !== null && hoverT >= t0 && hoverT <= tEnd) {
        const x = xOf(hoverT);
        ctx.strokeStyle = cssVar('--accent');
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = cssVar('--accent');
        ctx.fillText(formatTime(hoverT), x + 4, 10);
      }
    },
    () => `${captures.version}-${captures.simTime}-${timeDiv}-${follow}-${end}-${channels.length}-${JSON.stringify(decoders)}-${hoverT}`,
  );

  const exportVcd = () => {
    const vcd = toVcd(
      channels
        .map((c) => ({ name: c.label, capture: captures.probes.get(`logic:${c.id}`) }))
        .filter((c): c is { name: string; capture: NonNullable<typeof c.capture> } => !!c.capture),
    );
    void storage
      .exportText(vcd, 'capture.vcd', { name: 'Value Change Dump', extensions: ['vcd'] })
      .then((path) => path && useEditor.getState().notify(`Saved ${path.split(/[\\/]/).pop()}`, 'success'))
      .catch((e) => useEditor.getState().notify(`Could not save the capture: ${(e as Error).message ?? e}`, 'error'));
  };

  const timeAt = (clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const window = timeDiv * 10;
    const tEnd = follow ? captures.simTime : end;
    return tEnd - window + ((clientX - r.left) / r.width) * window;
  };

  return (
    <div className="dock-body">
      <div className="inst-bar">
        <Tip content="Then click pins on the canvas to add channels" direct>
          <button className="tb-btn" onClick={() => useEditor.getState().set({ tool: 'probe-logic' })}>
            <Icon name="probe" />
            <span className="label">Add probe</span>
          </button>
        </Tip>
        <label>
          Time
          <select className="tb-select" value={timeDiv} onChange={(e) => setTimeDiv(Number(e.target.value))}>
            {TIME_DIVS.map((t) => (
              <option key={t} value={t}>
                {formatTime(t)}/div
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={follow}
            onChange={(e) => {
              setFollow(e.target.checked);
              setEnd(captures.simTime);
            }}
          />{' '}
          Follow live
        </label>
        <Tip content="Export a Value Change Dump (open with PulseView or GTKWave)">
          <button className="tb-btn" onClick={exportVcd} disabled={!channels.length}>
            <Icon name="save" />
            <span className="label">Export VCD</span>
          </button>
        </Tip>
        <span className="grow" />
        <span style={{ color: 'var(--text-3)', fontSize: 11 }}>
          {simState === 'stopped' ? 'Start the simulation to capture. ' : ''}Drag to pan · wheel to zoom when not following
        </span>
      </div>
      <div className="row-fill">
        <div className="chan-list">
          {channels.length === 0 && (
            <div style={{ padding: 10, color: 'var(--text-3)', lineHeight: 1.5 }}>
              No channels. Click <b>Add probe</b> and then pins on the canvas (up to 8).
            </div>
          )}
          {channels.map((c) => (
            <div key={c.id} className="chan" style={{ height: ROW, borderBottom: '1px solid var(--border)' }}>
              <span className="probe-dot" style={{ background: c.color }} />
              <Tip content={c.label} direct>
                <span className="nm">{c.label}</span>
              </Tip>
              <select
                className="tb-select"
                style={{ width: 62, height: 22, fontSize: 10.5 }}
                value={decoders[c.id] ?? 0}
                aria-label="Protocol decoder"
                onChange={(e) => setDecoders({ ...decoders, [c.id]: Number(e.target.value) })}
              >
                <option value={0}>raw</option>
                {[9600, 19200, 38400, 57600, 115200].map((b) => (
                  <option key={b} value={b}>
                    UART {b}
                  </option>
                ))}
              </select>
              <Tip content="Remove channel" direct>
                <button className="icon-btn" aria-label="Remove channel" onClick={() => removeChannel('logic', c.id)}>
                  <Icon name="x" size={12} />
                </button>
              </Tip>
            </div>
          ))}
        </div>
        <div
          className="canvas-host"
          onPointerDown={(e) => {
            if (follow) return;
            drag.current = { x: e.clientX, end };
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            setHoverT(timeAt(e.clientX, e.currentTarget));
            if (!drag.current) return;
            const r = e.currentTarget.getBoundingClientRect();
            setEnd(drag.current.end - ((e.clientX - drag.current.x) / r.width) * timeDiv * 10);
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerLeave={() => setHoverT(null)}
          onWheel={(e) => {
            const i = TIME_DIVS.indexOf(timeDiv);
            const next = TIME_DIVS[Math.max(0, Math.min(TIME_DIVS.length - 1, i + (e.deltaY > 0 ? 1 : -1)))];
            setTimeDiv(next);
          }}
        >
          <canvas ref={ref} />
        </div>
      </div>
    </div>
  );
}
