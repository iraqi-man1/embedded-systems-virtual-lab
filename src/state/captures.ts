/**
 * High-rate instrument data kept outside React: probe sample streams and
 * serial-plotter series. Instruments read these from their own animation
 * loops; `version` lets them skip redraws when nothing changed.
 */

const MAX_SAMPLES = 400_000; // interleaved t,v pairs per probe

export interface ProbeStream {
  /** Interleaved [t0, v0, t1, v1...] (simulation seconds, volts or logic). */
  data: Float64Array;
  length: number;
}

export const captures = {
  version: 0,
  probes: new Map<string, ProbeStream>(),
  /** Latest simulation time (for extending the last sample to "now"). */
  simTime: 0,
  plotter: { series: new Map<string, number[]>(), x: 0, version: 0 },

  appendProbe(id: string, samples: number[]) {
    let s = this.probes.get(id);
    if (!s) {
      s = { data: new Float64Array(4096), length: 0 };
      this.probes.set(id, s);
    }
    if (s.length + samples.length > s.data.length) {
      if (s.data.length < MAX_SAMPLES) {
        const grown = new Float64Array(Math.min(MAX_SAMPLES, Math.max(s.data.length * 2, s.length + samples.length)));
        grown.set(s.data.subarray(0, s.length));
        s.data = grown;
      }
      if (s.length + samples.length > s.data.length) {
        // Drop the oldest half (keep pairs aligned).
        const keep = Math.floor(s.length / 4) * 2;
        s.data.copyWithin(0, s.length - keep, s.length);
        s.length = keep;
      }
    }
    s.data.set(samples, s.length);
    s.length += samples.length;
    this.version++;
  },

  clearProbes() {
    this.probes.clear();
    this.version++;
  },

  /** Value of a probe at time t (piecewise constant). */
  valueAt(id: string, t: number): number {
    const s = this.probes.get(id);
    if (!s || !s.length) return NaN;
    let lo = 0;
    let hi = s.length / 2 - 1;
    if (s.data[0] > t) return NaN;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (s.data[mid * 2] <= t) lo = mid;
      else hi = mid - 1;
    }
    return s.data[lo * 2 + 1];
  },

  pushPlotterLine(line: string) {
    const parts = line.trim().split(/[\s,\t]+/).filter(Boolean);
    if (!parts.length) return;
    let idx = 0;
    let any = false;
    for (const part of parts) {
      const m = /^(?:([^:]+):)?(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)$/i.exec(part);
      if (!m) continue;
      const name = m[1] ?? `value ${++idx}`;
      let arr = this.plotter.series.get(name);
      if (!arr) this.plotter.series.set(name, (arr = []));
      arr.push(parseFloat(m[2]));
      if (arr.length > 2000) arr.splice(0, arr.length - 2000);
      any = true;
    }
    if (any) {
      this.plotter.x++;
      this.plotter.version++;
    }
  },

  clearPlotter() {
    this.plotter.series.clear();
    this.plotter.x = 0;
    this.plotter.version++;
  },
};
