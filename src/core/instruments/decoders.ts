/**
 * Protocol decoders operating on piecewise-constant digital captures
 * (interleaved [t, v] samples, v ∈ {0, 1, 0.5 = floating}).
 */

/**
 * Bytes to text, one character per byte (as `String.fromCharCode(...bytes)`),
 * in chunks so a large burst (max-speed serial output) cannot overflow the stack.
 */
export function bytesToText(bytes: ArrayLike<number>): string {
  const CHUNK = 8192;
  if (bytes.length <= CHUNK) return String.fromCharCode.apply(null, Array.from(bytes));
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) parts.push(String.fromCharCode.apply(null, Array.prototype.slice.call(bytes, i, i + CHUNK)));
  return parts.join('');
}

export interface DecodedFrame {
  start: number;
  end: number;
  value: number;
  error?: 'framing' | 'parity';
}

export interface Capture {
  data: Float64Array | number[];
  length: number;
}

/** Logic level at time t (last sample at or before t). */
export function levelAt(c: Capture, t: number): number {
  const n = c.length / 2;
  if (!n || c.data[0] > t) return NaN;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (c.data[mid * 2] <= t) lo = mid;
    else hi = mid - 1;
  }
  return c.data[lo * 2 + 1];
}

/** First sample index with time >= t. */
export function indexAtOrAfter(c: Capture, t: number): number {
  let lo = 0;
  let hi = c.length / 2;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (c.data[mid * 2] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Asynchronous serial (8N1 by default, idle high). Bits are sampled at
 * their centres; a missing stop bit is reported as a framing error.
 */
export function decodeUart(c: Capture, baud: number, from = -Infinity, to = Infinity, dataBits = 8): DecodedFrame[] {
  const frames: DecodedFrame[] = [];
  const bit = 1 / baud;
  const n = c.length / 2;
  let i = Math.max(1, indexAtOrAfter(c, from));
  let busyUntil = -Infinity;
  for (; i < n; i++) {
    const t = c.data[i * 2];
    if (t > to) break;
    if (t < busyUntil) continue;
    const prev = c.data[i * 2 - 1];
    const cur = c.data[i * 2 + 1];
    if (!(prev === 1 && cur === 0)) continue; // falling edge = start bit
    if (levelAt(c, t + bit * 0.5) !== 0) continue; // glitch, not a start bit
    let value = 0;
    for (let b = 0; b < dataBits; b++) if (levelAt(c, t + bit * (1.5 + b)) === 1) value |= 1 << b;
    const stopOk = levelAt(c, t + bit * (1.5 + dataBits)) === 1;
    const end = t + bit * (1 + dataBits + 1);
    frames.push({ start: t, end, value, error: stopOk ? undefined : 'framing' });
    busyUntil = t + bit * (1.5 + dataBits);
  }
  return frames;
}

/** Value Change Dump export of digital captures. */
export function toVcd(channels: { name: string; capture: Capture }[], timescaleNs = 1): string {
  const ids = channels.map((_, i) => String.fromCharCode(33 + i));
  const lines = [
    `$date ${new Date().toISOString()} $end`,
    '$version Embedded Systems Virtual Lab $end',
    `$timescale ${timescaleNs}ns $end`,
    '$scope module lab $end',
    ...channels.map((ch, i) => `$var wire 1 ${ids[i]} ${ch.name.replace(/\s+/g, '_')} $end`),
    '$upscope $end',
    '$enddefinitions $end',
  ];
  const events: { t: number; id: string; v: string }[] = [];
  channels.forEach((ch, i) => {
    for (let k = 0; k < ch.capture.length / 2; k++) {
      const v = ch.capture.data[k * 2 + 1];
      events.push({ t: Math.round((ch.capture.data[k * 2] * 1e9) / timescaleNs), id: ids[i], v: v === 1 ? '1' : v === 0 ? '0' : 'z' });
    }
  });
  events.sort((a, b) => a.t - b.t);
  let last = -1;
  for (const e of events) {
    if (e.t !== last) {
      lines.push(`#${e.t}`);
      last = e.t;
    }
    lines.push(`${e.v}${e.id}`);
  }
  return lines.join('\n') + '\n';
}
