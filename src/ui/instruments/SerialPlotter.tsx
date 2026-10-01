import { useState } from 'react';
import { captures } from '../../state/captures';
import { clearSerial } from '../../state/sim';
import { Icon } from '../common/Icon';
import { cssVar, useCanvas } from './useCanvas';
import { CHANNEL_COLORS } from './probes';

export function SerialPlotter() {
  const [windowSize, setWindow] = useState(500);
  const [, force] = useState(0);
  const ref = useCanvas(
    (ctx, w, h) => {
      const series = [...captures.plotter.series.entries()];
      ctx.fillStyle = cssVar('--bg-panel-2');
      ctx.fillRect(0, 0, w, h);
      const pad = { l: 52, r: 12, t: 26, b: 18 };
      const pw = w - pad.l - pad.r;
      const ph = h - pad.t - pad.b;
      let min = Infinity;
      let max = -Infinity;
      for (const [, arr] of series) {
        for (let i = Math.max(0, arr.length - windowSize); i < arr.length; i++) {
          min = Math.min(min, arr[i]);
          max = Math.max(max, arr[i]);
        }
      }
      if (!isFinite(min)) {
        ctx.fillStyle = cssVar('--text-3');
        ctx.font = '12px Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Print numbers with Serial.println(value) or "name:value" pairs to plot them.', w / 2, h / 2);
        return;
      }
      if (max === min) {
        max += 1;
        min -= 1;
      }
      const span = max - min;
      min -= span * 0.05;
      max += span * 0.05;
      ctx.strokeStyle = cssVar('--border');
      ctx.fillStyle = cssVar('--text-3');
      ctx.font = '10px Cascadia Mono, Consolas, monospace';
      ctx.textAlign = 'right';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 5; i++) {
        const y = pad.t + (ph * i) / 5;
        ctx.beginPath();
        ctx.moveTo(pad.l, y + 0.5);
        ctx.lineTo(w - pad.r, y + 0.5);
        ctx.stroke();
        const v = max - ((max - min) * i) / 5;
        ctx.fillText(Math.abs(v) >= 1000 ? v.toFixed(0) : +v.toFixed(2) + '', pad.l - 6, y + 3);
      }
      series.forEach(([name, arr], si) => {
        const color = CHANNEL_COLORS[si % CHANNEL_COLORS.length];
        const start = Math.max(0, arr.length - windowSize);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = start; i < arr.length; i++) {
          const x = pad.l + ((i - start) / Math.max(1, windowSize - 1)) * pw;
          const y = pad.t + ((max - arr[i]) / (max - min)) * ph;
          if (i === start) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.textAlign = 'left';
        ctx.font = '11px Segoe UI, sans-serif';
        const last = arr[arr.length - 1];
        ctx.fillText(`■ ${name}: ${+last.toFixed(3)}`, pad.l + 4 + si * 150, 16);
      });
    },
    () => `${captures.plotter.version}-${windowSize}`,
  );
  return (
    <div className="dock-body">
      <div className="inst-bar">
        <span style={{ color: 'var(--text-2)' }}>Plots numbers printed on the serial port, one line per sample.</span>
        <span className="grow" />
        <label>
          Window
          <select className="tb-select" value={windowSize} onChange={(e) => setWindow(Number(e.target.value))}>
            {[100, 250, 500, 1000, 2000].map((n) => (
              <option key={n} value={n}>
                {n} samples
              </option>
            ))}
          </select>
        </label>
        <button
          className="tb-btn"
          onClick={() => {
            clearSerial();
            force((n) => n + 1);
          }}
        >
          <Icon name="eraser" />
          <span className="label">Clear</span>
        </button>
      </div>
      <div className="canvas-host">
        <canvas ref={ref} />
      </div>
    </div>
  );
}
