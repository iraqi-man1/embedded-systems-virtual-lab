/** Engineering-notation parsing/formatting ("4.7k" <-> 4700). */

const PREFIX: Record<string, number> = {
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  µ: 1e-6,
  m: 1e-3,
  '': 1,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  G: 1e9,
};

/**
 * Parses "10k", "4k7", "2.2M", "100", "47u", "1.5 kΩ". Returns NaN if invalid.
 * Note "m" is milli and "M" is mega, as in SPICE-like conventions.
 */
export function parseEngineering(input: string | number): number {
  if (typeof input === 'number') return input;
  const s = input.trim().replace(/\s+/g, '').replace(/(ohms?|Ω|F|H|V|A|Hz)$/i, '');
  // "4k7" style
  const rkm = /^(\d+)([pnuµmkKMG])(\d+)$/.exec(s);
  if (rkm) return parseFloat(`${rkm[1]}.${rkm[3]}`) * PREFIX[rkm[2]];
  const m = /^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)([pnuµmkKMG]?)$/.exec(s);
  if (!m) return NaN;
  return parseFloat(m[1]) * PREFIX[m[2]];
}

export function formatEngineering(value: number, unit = '', digits = 3): string {
  if (!isFinite(value)) return `${value}${unit}`;
  if (value === 0) return `0 ${unit}`.trim();
  const abs = Math.abs(value);
  const table: [number, string][] = [
    [1e9, 'G'],
    [1e6, 'M'],
    [1e3, 'k'],
    [1, ''],
    [1e-3, 'm'],
    [1e-6, 'µ'],
    [1e-9, 'n'],
    [1e-12, 'p'],
  ];
  for (const [scale, prefix] of table) {
    if (abs >= scale * 0.9995) {
      const v = value / scale;
      return `${parseFloat(v.toPrecision(digits))} ${prefix}${unit}`.trim();
    }
  }
  return `${value.toExponential(2)} ${unit}`.trim();
}
