/**
 * Serial monitor log helpers: per-line timestamps (simulation time at which
 * each line began) and the hex dump view.
 */

export const countLines = (text: string) => {
  let n = 0;
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) n++;
  return n;
};

/** Records the time of every line that `added` starts after `before`. */
export function stampLines(before: string, added: string, stamps: number[], t: number) {
  if (!added) return;
  if (!before || before.endsWith('\n')) stamps.push(t);
  for (let i = added.indexOf('\n'); i >= 0 && i < added.length - 1; i = added.indexOf('\n', i + 1)) stamps.push(t);
}

/** The hex view shows the most recent bytes only. */
export const HEX_LIMIT = 16 * 1024;

const stamp = (t: number | undefined) => `[${(t ?? 0).toFixed(3).padStart(8)} s] `;

/** Output with each line prefixed by the simulation time it began at. */
export function withTimestamps(text: string, stamps: number[]): string {
  const lines = text.split('\n');
  const last = lines.length - 1;
  return lines.map((l, i) => (i === last && !l ? '' : stamp(stamps[i]) + l)).join('\n');
}

/** Classic hex dump: offset, 16 bytes, printable characters. */
export function hexDump(text: string, limit = HEX_LIMIT): string {
  const start = Math.max(0, text.length - limit);
  const rows: string[] = [];
  for (let i = start - (start % 16); i < text.length; i += 16) {
    const hex: string[] = [];
    let ascii = '';
    for (let j = i; j < i + 16; j++) {
      if (j < start || j >= text.length) {
        hex.push('  ');
        ascii += ' ';
        continue;
      }
      const c = text.charCodeAt(j) & 0xff;
      hex.push(c.toString(16).padStart(2, '0'));
      ascii += c >= 0x20 && c < 0x7f ? text[j] : '·';
    }
    rows.push(`${i.toString(16).padStart(6, '0')}  ${hex.slice(0, 8).join(' ')}  ${hex.slice(8).join(' ')}  |${ascii}|`);
  }
  return rows.join('\n');
}
