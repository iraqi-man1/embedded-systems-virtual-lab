/**
 * Breadboard geometry. Holes are `socket` pins; internal connectivity
 * (5-hole terminal strips and power rails) is expressed with
 * `internalConnections`, so the netlist builder needs no breadboard logic.
 */
import type { PinDefinition } from '../../core/model/component';
import { GRID as P } from '../../core/model/component';

export type BreadboardSize = 'full' | 'half' | 'mini';

export interface BreadboardLayout {
  columns: number;
  rails: boolean;
  width: number;
  height: number;
  pins: PinDefinition[];
  internalConnections: string[][];
  /** Row letter -> y, for rendering labels. */
  rowY: Record<string, number>;
  colX: (c: number) => number;
  railY: { tn: number; tp: number; bp: number; bn: number } | null;
}

const ROWS_TOP = ['a', 'b', 'c', 'd', 'e'];
const ROWS_BOT = ['f', 'g', 'h', 'i', 'j'];

export function breadboardLayout(size: BreadboardSize): BreadboardLayout {
  const columns = size === 'full' ? 63 : size === 'half' ? 30 : 17;
  const rails = size !== 'mini';
  const x0 = 2 * P;
  const colX = (c: number) => x0 + (c - 1) * P;
  // Vertical layout in pitches. e→f is 3 pitches so DIP ICs straddle the channel.
  const off = rails ? 4 : 1.5;
  const rowY: Record<string, number> = {};
  ROWS_TOP.forEach((r, i) => (rowY[r] = (off + i) * P));
  ROWS_BOT.forEach((r, i) => (rowY[r] = (off + 7 + i) * P));
  const railY = rails ? { tn: 1 * P, tp: 2 * P, bp: (off + 14) * P, bn: (off + 15) * P } : null;
  const height = (rails ? off + 17 : off + 13.5) * P;
  const width = 2 * x0 + (columns - 1) * P;

  const pins: PinDefinition[] = [];
  const internal: string[][] = [];
  for (let c = 1; c <= columns; c++) {
    const top: string[] = [];
    const bot: string[] = [];
    for (const r of ROWS_TOP) {
      pins.push({ id: `${r}${c}`, x: colX(c), y: rowY[r], kind: 'socket' });
      top.push(`${r}${c}`);
    }
    for (const r of ROWS_BOT) {
      pins.push({ id: `${r}${c}`, x: colX(c), y: rowY[r], kind: 'socket' });
      bot.push(`${r}${c}`);
    }
    internal.push(top, bot);
  }
  if (railY) {
    for (const rail of ['tn', 'tp', 'bp', 'bn'] as const) {
      const group: string[] = [];
      for (let c = 1; c <= columns; c++) {
        // Rail holes come in groups of five with a gap, like real boards.
        if (c % 6 === 0) continue;
        const id = `${rail}.${c}`;
        pins.push({
          id,
          x: colX(c),
          y: railY[rail],
          kind: 'socket',
          description: rail.endsWith('p') ? 'Power rail (+)' : 'Power rail (−)',
        });
        group.push(id);
      }
      internal.push(group);
    }
  }
  return { columns, rails, width, height, pins, internalConnections: internal, rowY, colX, railY };
}
