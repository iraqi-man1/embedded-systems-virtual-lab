import { useRef, useState } from 'react';
import { useT } from '../../i18n/react';
import { captures } from '../../state/captures';
import { useEditor } from '../../state/editor';
import { useProject } from '../../state/project';
import { useSim } from '../../state/sim';
import { indexAtOrAfter } from '../../core/instruments/decoders';
import { formatEngineering } from '../../core/model/units';
import { Icon } from '../common/Icon';
import { Tip } from '../common/Tooltip';
import { cssVar, formatTime, TIME_DIVS, useCanvas } from './useCanvas';
import { removeChannel } from './probes';

const V_DIVS = [0.1, 0.2, 0.5, 1, 2, 5];
const DIVS_X = 10;
const DIVS_Y = 8;

interface Measure {
  vmin: number;
  vmax: number;
  vavg: number;
  freq: number | null;
  duty: number | null;
}

function measure(id: string, t0: number, t1: number): Measure | null {
  const c = captures.probes.get(id);
  if (!c || !c.length) return null;
  let vmin = Infinity;
  let vmax = -Infinity;
  let area = 0;
  let span = 0;
  const start = Math.max(0, indexAtOrAfter(c, t0) - 1);
  const n = c.length / 2;
  for (let i = start; i < n; i++) {
    const ta = Math.max(t0, c.data[i * 2]);
    const tb = Math.min(t1, i + 1 < n ? c.data[(i + 1) * 2] : t1);
    if (ta >= t1) break;
    if (tb <= ta) continue;
    const v = c.data[i * 2 + 1];
    if (Number.isNaN(v)) continue;
    vmin = Math.min(vmin, v);
    vmax = Math.max(vmax, v);
    area += v * (tb - ta);
    span += tb - ta;
  }
  if (!span) return null;
  const mid = (vmin + vmax) / 2;
  const rises: number[] = [];
  let highTime = 0;
  for (let i = start + 1; i < n; i++) {
    const t = c.data[i * 2];
    if (t > t1) break;
    if (t < t0) continue;
    if (c.data[i * 2 - 1] < mid && c.data[i * 2 + 1] >= mid) rises.push(t);
  }
  let freq: number | null = null;
  let duty: number | null = null;
  if (rises.length >= 2 && vmax - vmin > 0.2) {
    freq = (rises.length - 1) / (rises[rises.length - 1] - rises[0]);
    for (let i = start; i < n; i++) {
      const ta = Math.max(rises[0], c.data[i * 2]);
      const tb = Math.min(rises[rises.length - 1], i + 1 < n ? c.data[(i + 1) * 2] : t1);
      if (ta >= rises[rises.length - 1]) break;
      if (tb > ta && c.data[i * 2 + 1] >= mid) highTime += tb - ta;
    }
    duty = highTime / (rises[rises.length - 1] - rises[0]);
  }
  return { vmin, vmax, vavg: area / span, freq, duty };
}

export function Oscilloscope() {
  const t = useT();
  const channels = useProject((s) => s.project.instruments.scope);
  const simState = useSim((s) => s.state);
  const [timeDiv, setTimeDiv] = useState(1e-3);
  const [vDiv, setVDiv] = useState<number[]>([1, 1, 1, 1]);
  const [trigLevel, setTrigLevel] = useState(2.5);
  const [trigEdge, setTrigEdge] = useState<'rising' | 'falling'>('rising');
  const [trigSrc, setTrigSrc] = useState(0);
  const [running, setRunning] = useState(true);
  const frozen = useRef<number | null>(null);
  const [measures, setMeasures] = useState<(Measure | null)[]>([]);
  const lastMeasure = useRef(0);

  const ref = useCanvas(
    (ctx, w, h) => {
      const bg = cssVar('--scope-bg');
      const grid = cssVar('--scope-grid');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      const dx = w / DIVS_X;
      const dy = h / DIVS_Y;
      ctx.strokeStyle = grid;
      ctx.lineWidth = 1;
      for (let i = 0; i <= DIVS_X; i++) {
        ctx.beginPath();
        ctx.moveTo(Math.round(i * dx) + 0.5, 0);
        ctx.lineTo(Math.round(i * dx) + 0.5, h);
        ctx.stroke();
      }
      for (let i = 0; i <= DIVS_Y; i++) {
        ctx.beginPath();
        ctx.moveTo(0, Math.round(i * dy) + 0.5);
        ctx.lineTo(w, Math.round(i * dy) + 0.5);
        ctx.stroke();
      }
      const window = timeDiv * DIVS_X;
      const now = captures.simTime;
      // Trigger search on the source channel (latest edge leaving a full window).
      let center = frozen.current ?? now - window / 2;
      let triggered = frozen.current !== null;
      const src = channels[trigSrc];
      if (running && src) {
        const c = captures.probes.get(`scope:${src.id}`);
        if (c && c.length >= 4) {
          for (let i = c.length / 2 - 1; i >= 1; i--) {
            const t = c.data[i * 2];
            if (t > now - window / 2) continue;
            if (t < now - window * 20) break;
            const a = c.data[i * 2 - 1];
            const b = c.data[i * 2 + 1];
            if ((trigEdge === 'rising' && a < trigLevel && b >= trigLevel) || (trigEdge === 'falling' && a > trigLevel && b <= trigLevel)) {
              center = t;
              triggered = true;
              break;
            }
          }
        }
      }
      if (running) frozen.current = null;
      else if (frozen.current === null) frozen.current = center;
      const t0 = center - window / 2;
      const t1 = center + window / 2;
      // Trigger marker
      ctx.fillStyle = '#f5c400';
      ctx.fillText('T', w / 2 - 3, 10);
      channels.forEach((ch, ci) => {
        const c = captures.probes.get(`scope:${ch.id}`);
        if (!c || !c.length) return;
        const vd = vDiv[ci] ?? 1;
        const yOf = (v: number) => h - (v / vd) * dy - dy; // 0 V one division above the bottom
        ctx.strokeStyle = ch.color;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        let started = false;
        let i = Math.max(0, indexAtOrAfter(c, t0) - 1);
        const n = c.length / 2;
        let prevY = 0;
        for (; i < n; i++) {
          const t = Math.max(t0, c.data[i * 2]);
          if (t > t1) break;
          const v = c.data[i * 2 + 1];
          const tn = i + 1 < n ? Math.min(t1, c.data[(i + 1) * 2]) : Math.min(t1, now);
          if (Number.isNaN(v)) {
            started = false;
            continue;
          }
          const x = ((t - t0) / window) * w;
          const xn = ((tn - t0) / window) * w;
          const y = yOf(v);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, prevY);
            ctx.lineTo(x, y);
          }
          ctx.lineTo(Math.max(x, xn), y);
          prevY = y;
        }
        ctx.stroke();
        ctx.fillStyle = ch.color;
        ctx.font = '10px Cascadia Mono, Consolas, monospace';
        ctx.fillText(`CH${ci + 1} ${vd} V/div`, 6 + ci * 110, h - 6);
        ctx.fillText('◄', w - 12, yOf(0) + 3);
      });
      ctx.fillStyle = cssVar('--scope-text');
      ctx.font = '10px Cascadia Mono, Consolas, monospace';
      ctx.fillText(`${formatTime(timeDiv)}/div   ${triggered ? 'TRIG' : 'AUTO'} ${trigEdge === 'rising' ? '↑' : '↓'} ${trigLevel} V`, 6, 12);
      // trigger level line
      if (src) {
        const vd = vDiv[trigSrc] ?? 1;
        const y = h - (trigLevel / vd) * dy - dy;
        ctx.strokeStyle = 'rgba(245,196,0,0.35)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const nowMs = performance.now();
      if (nowMs - lastMeasure.current > 300) {
        lastMeasure.current = nowMs;
        setMeasures(channels.map((ch) => measure(`scope:${ch.id}`, t0, t1)));
      }
    },
    () => `${captures.version}-${captures.simTime}-${timeDiv}-${vDiv.join()}-${trigLevel}-${trigEdge}-${trigSrc}-${running}-${channels.length}`,
  );

  return (
    <div className="dock-body">
      <div className="inst-bar">
        <Tip content={t('Then click a pin on the canvas to attach a channel')} direct>
          <button className="tb-btn" onClick={() => useEditor.getState().set({ tool: 'probe-scope' })}>
            <Icon name="probe" />
            <span className="label">{t('Add probe')}</span>
          </button>
        </Tip>
        <label>
          {t('Time')}
          <select className="tb-select" value={timeDiv} onChange={(e) => setTimeDiv(Number(e.target.value))}>
            {TIME_DIVS.map((d) => (
              <option key={d} value={d}>
                {formatTime(d)}/div
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('Trigger')}
          <select className="tb-select" value={trigSrc} onChange={(e) => setTrigSrc(Number(e.target.value))}>
            {channels.map((c, i) => (
              <option key={c.id} value={i}>
                CH{i + 1}
              </option>
            ))}
          </select>
          <select className="tb-select" value={trigEdge} onChange={(e) => setTrigEdge(e.target.value as 'rising' | 'falling')}>
            <option value="rising">↑ {t('rising')}</option>
            <option value="falling">↓ {t('falling')}</option>
          </select>
          <input className="input" style={{ width: 56 }} type="number" step={0.1} value={trigLevel} onChange={(e) => setTrigLevel(Number(e.target.value))} /> V
        </label>
        <button className={`tb-btn${running ? '' : ' active'}`} onClick={() => setRunning(!running)}>
          <Icon name={running ? 'pause' : 'play'} />
          <span className="label">{running ? t('Stop') : t('Run')}</span>
        </button>
        <span className="grow" />
        {simState === 'stopped' && <span style={{ color: 'var(--text-3)' }}>{t('Start the simulation to capture.')}</span>}
      </div>
      <div className="row-fill">
        <div className="chan-list">
          {channels.length === 0 && (
            <div style={{ padding: 10, color: 'var(--text-3)', lineHeight: 1.5 }}>
              {t('No channels. Click Add probe, then click a pin or breadboard hole.')}
            </div>
          )}
          {channels.map((c, i) => {
            const m = measures[i];
            return (
              <div key={c.id} className="chan" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="probe-dot" style={{ background: c.color }} />
                  <Tip content={c.label} direct>
                    <span className="nm">
                      CH{i + 1} {c.label}
                    </span>
                  </Tip>
                  <Tip content={t('Remove channel')} direct>
                    <button className="icon-btn" aria-label={t('Remove channel')} onClick={() => removeChannel('scope', c.id)}>
                      <Icon name="x" size={12} />
                    </button>
                  </Tip>
                </div>
                <select className="tb-select" value={vDiv[i] ?? 1} onChange={(e) => setVDiv(vDiv.map((v, k) => (k === i ? Number(e.target.value) : v)))}>
                  {V_DIVS.map((v) => (
                    <option key={v} value={v}>
                      {v} V/div
                    </option>
                  ))}
                </select>
                {m && (
                  <div className="ltr" style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-2)', lineHeight: 1.45 }}>
                    {t('max')} {formatEngineering(m.vmax, 'V')} · {t('min')} {formatEngineering(m.vmin, 'V')}
                    <br />
                    {t('avg')} {formatEngineering(m.vavg, 'V')}
                    {m.freq !== null && (
                      <>
                        <br />
                        f {formatEngineering(m.freq, 'Hz')} · {t('duty')} {((m.duty ?? 0) * 100).toFixed(1)}%
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="canvas-host">
          <canvas ref={ref} />
        </div>
      </div>
    </div>
  );
}
