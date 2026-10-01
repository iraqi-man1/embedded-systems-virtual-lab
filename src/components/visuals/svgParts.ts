/**
 * Procedural SVG visuals for parts without a Wokwi element. Every generator
 * returns markup + size + pins on the 0.1" (9.6 px) grid so parts insert into
 * breadboards correctly.
 */
import type { PinDefinition, PinKind } from '../../core/model/component';
import { GRID as P } from '../../core/model/component';

export interface GeneratedVisual {
  svg: string;
  size: { width: number; height: number };
  pins: PinDefinition[];
}

export type PinSpec = string | { id: string; kind?: PinKind; label?: string; voltage?: number; description?: string };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function spec(p: PinSpec, fallback: PinKind): { id: string; kind: PinKind; label: string; voltage?: number; description?: string } {
  if (typeof p === 'string') return { id: p, kind: inferKind(p, fallback), label: p };
  return { kind: inferKind(p.id, fallback), label: p.id, ...p } as never;
}

function inferKind(id: string, fallback: PinKind): PinKind {
  return /^(GND|VSS)(\.\d+)?$/i.test(id) ? 'ground' : fallback;
}

const svgOpen = (w: number, h: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Segoe UI, Arial, sans-serif">`;

function pinDef(s: ReturnType<typeof spec>, x: number, y: number): PinDefinition {
  return { id: s.id, label: s.label, x, y, kind: s.kind, voltage: s.voltage, description: s.description };
}

// ------------------------------------------------------------------- DIP IC
export function dipIc(opts: { label: string; pins: PinSpec[]; sublabel?: string; fallback?: PinKind }): GeneratedVisual {
  const n = opts.pins.length;
  if (n % 2) throw new Error('DIP needs an even pin count');
  const half = n / 2;
  const w = half * P;
  const h = 4 * P;
  const yTop = 0.5 * P;
  const yBot = 3.5 * P;
  const pins: PinDefinition[] = [];
  let legs = '';
  let labels = '';
  for (let i = 0; i < n; i++) {
    const s = spec(opts.pins[i], opts.fallback ?? 'io');
    const bottom = i < half;
    const col = bottom ? i : n - 1 - i;
    const x = (col + 0.5) * P;
    const y = bottom ? yBot : yTop;
    pins.push(pinDef(s, x, y));
    legs += `<rect x="${x - 1.6}" y="${bottom ? y - 5 : y - 1}" width="3.2" height="6" fill="#c9c9c9"/>`;
    labels += `<text x="${x}" y="${bottom ? y - 7.2 : y + 10}" font-size="3.6" fill="#ddd" text-anchor="middle">${esc(s.label.slice(0, 5))}</text>`;
  }
  const body = `<rect x="1" y="${yTop + 4}" width="${w - 2}" height="${yBot - yTop - 8}" rx="1.5" fill="#262626"/>
  <path d="M1 ${h / 2 - 3.5} a3.5 3.5 0 0 1 0 7" fill="#555"/>
  <circle cx="5" cy="${yBot - 9}" r="1.3" fill="#555"/>`;
  const text = `<text x="${w / 2}" y="${h / 2 + 2}" font-size="${Math.min(7, (w - 8) / Math.max(4, opts.label.length) * 1.6)}" fill="#eee" text-anchor="middle" font-weight="600">${esc(opts.label)}</text>${
    opts.sublabel ? `<text x="${w / 2}" y="${h / 2 + 8}" font-size="3.6" fill="#aaa" text-anchor="middle">${esc(opts.sublabel)}</text>` : ''
  }`;
  return { svg: `${svgOpen(w, h)}${legs}${body}${labels}${text}</svg>`, size: { width: w, height: h }, pins };
}

// ---------------------------------------------------------- 3-lead packages
export function to92(opts: { label: string; pins: [PinSpec, PinSpec, PinSpec] }): GeneratedVisual {
  const w = 3 * P;
  const h = 3.6 * P;
  const pins = opts.pins.map((p, i) => pinDef(spec(p, 'passive'), (i + 0.5) * P, h - 2));
  const legs = pins.map((p) => `<rect x="${p.x - 0.9}" y="${P * 1.6}" width="1.8" height="${h - P * 1.6 - 1}" fill="#bbb"/>`).join('');
  const names = pins
    .map((p) => `<text x="${p.x}" y="${h - 5}" font-size="3.4" fill="#888" text-anchor="middle">${esc(p.label ?? p.id)}</text>`)
    .join('');
  const body = `<path d="M2 ${P * 1.8} L2 6 A12.4 9 0 0 1 ${w - 2} 6 L${w - 2} ${P * 1.8} Z" fill="#2b2b2b"/>
  <text x="${w / 2}" y="${P * 1.2}" font-size="4" fill="#ddd" text-anchor="middle">${esc(opts.label)}</text>`;
  return { svg: `${svgOpen(w, h)}${legs}${body}${names}</svg>`, size: { width: w, height: h }, pins };
}

export function to220(opts: { label: string; pins: [PinSpec, PinSpec, PinSpec] }): GeneratedVisual {
  const w = 4 * P;
  const h = 7 * P;
  const pins = opts.pins.map((p, i) => pinDef(spec(p, 'passive'), (i + 1) * P, h - 2));
  const legs = pins.map((p) => `<rect x="${p.x - 1.2}" y="${P * 4.2}" width="2.4" height="${h - P * 4.2 - 1}" fill="#bbb"/>`).join('');
  const names = pins
    .map((p) => `<text x="${p.x}" y="${h - 4}" font-size="3.4" fill="#888" text-anchor="middle">${esc(p.label ?? p.id)}</text>`)
    .join('');
  const body = `<rect x="2" y="1" width="${w - 4}" height="${P * 1.7}" fill="#b8b8b8"/><circle cx="${w / 2}" cy="${P * 0.85}" r="4" fill="#888"/>
  <rect x="2" y="${P * 1.7}" width="${w - 4}" height="${P * 2.6}" fill="#2b2b2b"/>
  <text x="${w / 2}" y="${P * 3.2}" font-size="4.4" fill="#ddd" text-anchor="middle">${esc(opts.label)}</text>`;
  return { svg: `${svgOpen(w, h)}${legs}${body}${names}</svg>`, size: { width: w, height: h }, pins };
}

// ------------------------------------------------------------- 2-lead parts
/** Axial part (diode, inductor): leads 0.4" apart, horizontal. */
export function axial(opts: {
  label: string;
  body: string;
  band?: string;
  pins: [PinSpec, PinSpec];
  spanPitches?: number;
}): GeneratedVisual {
  const span = (opts.spanPitches ?? 4) * P;
  const w = span;
  const h = 1.2 * P;
  const y = h / 2;
  const pins = [pinDef(spec(opts.pins[0], 'passive'), 0, y), pinDef(spec(opts.pins[1], 'passive'), span, y)];
  const bodyW = span * 0.5;
  const bx = (w - bodyW) / 2;
  const svg = `${svgOpen(w, h)}<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="#aaa" stroke-width="1.4"/>
  <rect x="${bx}" y="${y - 4}" width="${bodyW}" height="8" rx="2" fill="${opts.body}"/>
  ${opts.band ? `<rect x="${bx + bodyW - 4}" y="${y - 4}" width="2.4" height="8" fill="${opts.band}"/>` : ''}
  <text x="${w / 2}" y="${y + 2}" font-size="3.6" fill="#fff" text-anchor="middle">${esc(opts.label)}</text></svg>`;
  return { svg, size: { width: w, height: h }, pins };
}

/** Radial part (electrolytic/ceramic capacitor, crystal): leads at the bottom. */
export function radial(opts: {
  label: string;
  shape: 'electrolytic' | 'ceramic' | 'crystal';
  pins: [PinSpec, PinSpec];
  spanPitches?: number;
}): GeneratedVisual {
  const span = (opts.spanPitches ?? 1) * P;
  const w = Math.max(span + P, 2.2 * P);
  const h = 4 * P;
  const x0 = (w - span) / 2;
  const pins = [pinDef(spec(opts.pins[0], 'passive'), x0, h - 1), pinDef(spec(opts.pins[1], 'passive'), x0 + span, h - 1)];
  let body = '';
  if (opts.shape === 'electrolytic') {
    body = `<rect x="1.5" y="1" width="${w - 3}" height="${h * 0.62}" rx="3" fill="#1f3c88"/>
    <rect x="${w - 7}" y="1" width="4" height="${h * 0.62}" fill="#9fb3e8"/>
    <text x="${w - 5}" y="${h * 0.38}" font-size="5" fill="#1f3c88" text-anchor="middle">−</text>`;
  } else if (opts.shape === 'ceramic') {
    body = `<ellipse cx="${w / 2}" cy="${h * 0.32}" rx="${w / 2 - 1.5}" ry="${h * 0.28}" fill="#d9a441"/>`;
  } else {
    body = `<rect x="1" y="4" width="${w - 2}" height="${h * 0.5}" rx="5" fill="#c0c0c0" stroke="#888"/>`;
  }
  const legs = pins.map((p) => `<line x1="${p.x}" y1="${h * 0.6}" x2="${p.x}" y2="${h}" stroke="#aaa" stroke-width="1.3"/>`).join('');
  const svg = `${svgOpen(w, h)}${legs}${body}<text x="${w / 2}" y="${h * 0.36}" font-size="3.8" fill="#fff" text-anchor="middle">${esc(opts.label)}</text></svg>`;
  return { svg, size: { width: w, height: h }, pins };
}

// ----------------------------------------------------------- header modules
export interface ModuleOptions {
  title: string;
  subtitle?: string;
  pcb?: string;
  text?: string;
  /** Pins along the bottom edge (left -> right). */
  bottom?: PinSpec[];
  /** Pins along the top edge (left -> right). */
  top?: PinSpec[];
  /** Pins along the left edge (top -> bottom). */
  left?: PinSpec[];
  /** Pins along the right edge (top -> bottom). */
  right?: PinSpec[];
  /** Board size in pitches (auto if omitted). */
  widthPitches?: number;
  heightPitches?: number;
  /** Draw a chip/feature in the middle. */
  chip?: { label: string; w: number; h: number; color?: string };
  fallback?: PinKind;
  /** Extra decorative SVG in board coordinates. */
  decoration?: string;
}

/** Breakout board / dev board with 0.1" headers on any edge. */
export function headerModule(o: ModuleOptions): GeneratedVisual {
  const fb = o.fallback ?? 'io';
  const nTop = o.top?.length ?? 0;
  const nBot = o.bottom?.length ?? 0;
  const nL = o.left?.length ?? 0;
  const nR = o.right?.length ?? 0;
  const wp = o.widthPitches ?? Math.max(nTop, nBot, 6) + 2;
  const hp = o.heightPitches ?? Math.max(nL, nR, 5) + 2;
  const w = wp * P;
  const h = hp * P;
  const pcb = o.pcb ?? '#1d6b3a';
  const txt = o.text ?? '#f2f2f2';
  const pins: PinDefinition[] = [];
  let pads = '';
  let labels = '';
  const pad = (x: number, y: number) =>
    `<rect x="${x - 3.6}" y="${y - 3.6}" width="7.2" height="7.2" rx="1" fill="#1a1a1a"/><circle cx="${x}" cy="${y}" r="2" fill="#d4af37"/>`;
  const place = (list: PinSpec[] | undefined, edge: 'top' | 'bottom' | 'left' | 'right') => {
    if (!list) return;
    const n = list.length;
    list.forEach((p, i) => {
      const s = spec(p, fb);
      let x: number;
      let y: number;
      if (edge === 'top' || edge === 'bottom') {
        const start = Math.round((wp - n) / 2);
        x = (start + i + 0.5) * P;
        y = edge === 'top' ? 0.5 * P : h - 0.5 * P;
        labels += `<text x="${x}" y="${edge === 'top' ? y + 9 : y - 6}" font-size="3.6" fill="${txt}" text-anchor="middle">${esc(s.label.slice(0, 6))}</text>`;
      } else {
        const start = Math.round((hp - n) / 2);
        y = (start + i + 0.5) * P;
        x = edge === 'left' ? 0.5 * P : w - 0.5 * P;
        labels += `<text x="${edge === 'left' ? x + 6.5 : x - 6.5}" y="${y + 1.3}" font-size="3.6" fill="${txt}" text-anchor="${edge === 'left' ? 'start' : 'end'}">${esc(s.label.slice(0, 7))}</text>`;
      }
      pads += pad(x, y);
      pins.push(pinDef(s, x, y));
    });
  };
  place(o.top, 'top');
  place(o.bottom, 'bottom');
  place(o.left, 'left');
  place(o.right, 'right');
  const chip = o.chip
    ? `<rect x="${w / 2 - o.chip.w / 2}" y="${h / 2 - o.chip.h / 2}" width="${o.chip.w}" height="${o.chip.h}" rx="2" fill="${o.chip.color ?? '#222'}"/>
       <text x="${w / 2}" y="${h / 2 + 1.5}" font-size="4.2" fill="#ccc" text-anchor="middle">${esc(o.chip.label)}</text>`
    : '';
  const titleY = o.chip ? h / 2 - (o.chip.h / 2) - 4 : h / 2 - (o.subtitle ? 2 : -2);
  const svg = `${svgOpen(w, h)}<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="3" fill="${pcb}" stroke="rgba(0,0,0,.35)"/>
  ${o.decoration ?? ''}${chip}${pads}${labels}
  <text x="${w / 2}" y="${titleY}" font-size="6" fill="${txt}" text-anchor="middle" font-weight="600">${esc(o.title)}</text>
  ${o.subtitle ? `<text x="${w / 2}" y="${titleY + 7}" font-size="4" fill="${txt}" opacity=".8" text-anchor="middle">${esc(o.subtitle)}</text>` : ''}
  </svg>`;
  return { svg, size: { width: w, height: h }, pins };
}

/** Schematic-style symbol with one pin (power/ground/net label). */
export function symbolPin(kind: 'ground' | 'vcc' | 'label', text: string): GeneratedVisual {
  const w = 4 * P;
  const h = 4 * P;
  const cx = w / 2;
  let body = '';
  let pin: PinDefinition;
  if (kind === 'ground') {
    pin = { id: 'GND', x: cx, y: 0.5 * P, kind: 'ground' };
    body = `<line x1="${cx}" y1="${pin.y}" x2="${cx}" y2="${h * 0.55}" stroke="currentColor" stroke-width="1.6"/>
    <line x1="${cx - 12}" y1="${h * 0.55}" x2="${cx + 12}" y2="${h * 0.55}" stroke="currentColor" stroke-width="1.8"/>
    <line x1="${cx - 8}" y1="${h * 0.68}" x2="${cx + 8}" y2="${h * 0.68}" stroke="currentColor" stroke-width="1.8"/>
    <line x1="${cx - 4}" y1="${h * 0.81}" x2="${cx + 4}" y2="${h * 0.81}" stroke="currentColor" stroke-width="1.8"/>`;
  } else if (kind === 'vcc') {
    pin = { id: 'VCC', x: cx, y: h - 0.5 * P, kind: 'passive' };
    body = `<line x1="${cx}" y1="${pin.y}" x2="${cx}" y2="${h * 0.4}" stroke="currentColor" stroke-width="1.6"/>
    <path d="M${cx - 10} ${h * 0.4} L${cx} ${h * 0.22} L${cx + 10} ${h * 0.4} Z" fill="none" stroke="currentColor" stroke-width="1.6"/>
    <text x="${cx}" y="${h * 0.16}" font-size="7" fill="currentColor" text-anchor="middle">${esc(text)}</text>`;
  } else {
    pin = { id: 'NET', x: 0.5 * P, y: h / 2, kind: 'passive' };
    body = `<path d="M${pin.x} ${h / 2} L${P * 1.2} ${h / 2 - 6} H${w - 2} V${h / 2 + 6} H${P * 1.2} Z" fill="none" stroke="currentColor" stroke-width="1.4"/>
    <text x="${P * 2.3}" y="${h / 2 + 2.5}" font-size="6.5" fill="currentColor">${esc(text)}</text>`;
  }
  return { svg: `${svgOpen(w, h)}${body}</svg>`, size: { width: w, height: h }, pins: [pin] };
}
