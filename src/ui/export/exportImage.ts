/**
 * Circuit image export. Builds a standalone SVG from what the canvas shows:
 * each part's drawing is copied from the live canvas with its styles written
 * inline (Wokwi elements live in shadow DOM and use stylesheets, screens are
 * <canvas> pixels), wires, labels and notes are drawn from the model. PNG is
 * the SVG rasterised at 1–8× with the resolution recorded in the file.
 */
import type { Annotation, CircuitDocument, ComponentInstance } from '../../core/model/circuit';
import { annotationBounds, textExtent } from '../../core/circuit/annotations';
import { componentBounds } from '../../core/circuit/geometry';
import { lookup } from '../../app/registry';
import { wirePolyline } from '../workspace/geometry';
import type { Rect } from '../../core/circuit/annotations';
import { arrowGeometry } from '../workspace/AnnotationLayer';

export type ExportBackground = 'white' | 'theme' | 'transparent';

export interface ExportOptions {
  /** Only the selected parts, wires and notes (and the wires between selected parts). */
  selection: { components: string[]; wires: string[]; notes: string[] } | null;
  background: ExportBackground;
  /** Reference labels (R1, U1…) above the parts. */
  labels: boolean;
  /** Text notes, arrows and frames. */
  notes: boolean;
  /** Dots every 0.1 inch, as on the canvas. */
  grid: boolean;
}

export interface ExportSvg {
  svg: string;
  /** Size in canvas pixels (1× PNG size). */
  width: number;
  height: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const PAD = 18;

/** Largest PNG: browsers refuse bigger canvases (and the file would be huge). */
export const MAX_PNG_SIDE = 16384;
export const MAX_PNG_PIXELS = 120_000_000;

export function maxScale(width: number, height: number): number {
  return Math.max(0.25, Math.min(MAX_PNG_SIDE / width, MAX_PNG_SIDE / height, Math.sqrt(MAX_PNG_PIXELS / (width * height))));
}

// ---------------------------------------------------------------- styles

/** Inherited properties: written only where they differ from the parent. */
const INHERITED = [
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'letter-spacing',
  'word-spacing',
  'visibility',
  'color',
  'direction',
  'paint-order',
  'shape-rendering',
  'image-rendering',
  'white-space',
];
/** Non-inherited properties and their initial values (skipped when equal). */
const OWN: Record<string, string[]> = {
  opacity: ['1'],
  display: ['inline', 'block', 'inline-block'],
  transform: ['none'],
  'transform-origin': [],
  'transform-box': ['view-box'],
  'clip-path': ['none'],
  mask: ['none'],
  filter: ['none'],
  'stop-color': ['rgb(0, 0, 0)'],
  'stop-opacity': ['1'],
  'flood-color': ['rgb(0, 0, 0)'],
  'flood-opacity': ['1'],
  'marker-start': ['none'],
  'marker-mid': ['none'],
  'marker-end': ['none'],
  'mix-blend-mode': ['normal'],
};

/** Copies the computed style of `src` (and its subtree) onto the clone `dst` as inline styles. */
function inlineStyles(src: Element, dst: Element, parent: CSSStyleDeclaration | null) {
  const cs = getComputedStyle(src);
  const out: string[] = [];
  for (const p of INHERITED) {
    const v = cs.getPropertyValue(p);
    if (v && (!parent || parent.getPropertyValue(p) !== v)) out.push(`${p}:${v}`);
  }
  const hasTransform = cs.getPropertyValue('transform') !== 'none';
  for (const [p, initial] of Object.entries(OWN)) {
    if (p === 'transform-origin' && !hasTransform) continue;
    if (p === 'transform' && !parent) continue; // the outer <svg> is placed by the exporter
    const v = cs.getPropertyValue(p);
    if (v && !initial.includes(v)) out.push(`${p}:${v}`);
  }
  if (cs.display === 'none') out.push('display:none');
  dst.setAttribute('style', out.join(';'));
  dst.removeAttribute('class');
  const n = Math.min(src.children.length, dst.children.length);
  for (let i = 0; i < n; i++) inlineStyles(src.children[i], dst.children[i], cs);
}

/** Gives every id in the copy a unique prefix and updates the references to it. */
function prefixIds(root: Element, prefix: string) {
  const ids = new Map<string, string>();
  for (const el of root.querySelectorAll('[id]')) {
    const id = el.getAttribute('id')!;
    ids.set(id, `${prefix}${id}`);
    el.setAttribute('id', `${prefix}${id}`);
  }
  if (!ids.size) return;
  const fix = (v: string) => v.replace(/url\(\s*(["']?)#([^"')\s]+)\1\s*\)/g, (m, _q: string, id: string) => (ids.has(id) ? `url(#${ids.get(id)})` : m));
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const a of [...el.attributes]) {
      if ((a.name === 'href' || a.name === 'xlink:href') && a.value.startsWith('#') && ids.has(a.value.slice(1))) el.setAttribute(a.name, `#${ids.get(a.value.slice(1))}`);
      else if (a.value.includes('url(')) el.setAttribute(a.name, fix(a.value));
    }
  }
}

// ---------------------------------------------------------------- parts

/** Drawings that make up a part: <svg>, <canvas> and <img>, also inside shadow roots. */
function visuals(node: Node, out: Element[]) {
  for (const child of node.childNodes) {
    if (!(child instanceof Element)) continue;
    const tag = child.tagName.toLowerCase();
    if (tag === 'svg' || tag === 'canvas' || tag === 'img') out.push(child);
    else {
      if (child.shadowRoot) visuals(child.shadowRoot, out);
      visuals(child, out);
    }
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (v: number) => String(Math.round(v * 100) / 100);

/** One part as an SVG group, measured from the (temporarily untransformed) canvas element. */
function partGroup(inst: ComponentInstance, compEl: HTMLElement, index: number, bodyAngle: number): string {
  const def = lookup(inst.type);
  if (!def) return '';
  const { width: w, height: h } = def.size;
  const box = compEl.getBoundingClientRect();
  const found: Element[] = [];
  visuals(compEl, found);
  const parts: string[] = [];
  const ser = new XMLSerializer();
  found.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const x = num(r.left - box.left);
    const y = num(r.top - box.top);
    const tag = el.tagName.toLowerCase();
    if (tag === 'svg') {
      const copy = el.cloneNode(true) as SVGSVGElement;
      inlineStyles(el, copy, null);
      copy.querySelectorAll('style, script, foreignObject').forEach((n) => n.remove());
      prefixIds(copy, `p${index}-${i}-`);
      copy.setAttribute('x', x);
      copy.setAttribute('y', y);
      copy.setAttribute('width', num(r.width));
      copy.setAttribute('height', num(r.height));
      copy.setAttribute('overflow', 'visible');
      if (!copy.getAttribute('viewBox')) copy.setAttribute('viewBox', `0 0 ${num(r.width)} ${num(r.height)}`);
      parts.push(ser.serializeToString(copy).replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, ''));
    } else {
      let href = '';
      try {
        href = tag === 'canvas' ? (el as HTMLCanvasElement).toDataURL('image/png') : (el as HTMLImageElement).src;
      } catch {
        return; // a canvas we may not read
      }
      parts.push(`<image href="${esc(href)}" x="${x}" y="${y}" width="${num(r.width)}" height="${num(r.height)}" preserveAspectRatio="none" style="image-rendering:pixelated"/>`);
    }
  });
  const cx = w / 2;
  const cy = h / 2;
  let t = `translate(${num(inst.x)} ${num(inst.y)})`;
  if (inst.rotation || inst.flip) t += ` translate(${num(cx)} ${num(cy)}) rotate(${inst.rotation})${inst.flip ? ' scale(-1 1)' : ''} translate(${num(-cx)} ${num(-cy)})`;
  const body = bodyAngle ? `<g transform="rotate(${num(bodyAngle)} ${num(cx)} ${num(cy)})">${parts.join('')}</g>` : parts.join('');
  return `<g transform="${t}">${body}</g>`;
}

// ---------------------------------------------------------------- notes

/** A frame's title tab (drawn above the parts, like on the canvas). */
function frameTitleSvg(a: Annotation & { kind: 'rect' }, ink: string, titleWidth: number | undefined): string {
  if (!a.title) return '';
  const color = a.color || ink;
  const tw = titleWidth ?? a.title.length * 7.4 + 20;
  const rtl = /^[^A-Za-z\u00c0-\u024f]*[\u0590-\u08ff]/.test(a.title);
  const x = a.x + 12;
  return (
    `<path d="M${num(x)} ${num(a.y + 2)} v-17 a7 7 0 0 1 7 -7 h${num(tw - 14)} a7 7 0 0 1 7 7 v17 z" fill="${color}"/>` +
    `<text x="${num(rtl ? x + tw - 10 : x + 10)}" y="${num(a.y - 5)}" font-size="13" font-weight="600" font-family="Segoe UI, Tahoma, 'Noto Sans Arabic', sans-serif" fill="#fff"${rtl ? ' direction="rtl"' : ''}>${esc(a.title)}</text>`
  );
}

function noteSvg(a: Annotation, ink: string, measured: Map<string, { width: number; rtl: boolean }>): string {
  const color = a.color || ink;
  if (a.kind === 'rect') {
    const dash = a.dashed ? ' stroke-dasharray="8 6"' : '';
    return `<rect x="${num(a.x)}" y="${num(a.y)}" width="${num(a.w)}" height="${num(a.h)}" rx="10" fill="${color}" fill-opacity="0.05" stroke="${color}" stroke-width="2"${dash}/>`;
  }
  if (a.kind === 'arrow') {
    const g = arrowGeometry(a);
    const dash = a.dashed ? ` stroke-dasharray="${a.width * 3} ${a.width * 2.2}"` : '';
    let s = `<line x1="${num(g.shaft.x1)}" y1="${num(g.shaft.y1)}" x2="${num(g.shaft.x2)}" y2="${num(g.shaft.y2)}" stroke="${color}" stroke-width="${a.width}" stroke-linecap="round"${dash}/>`;
    for (const head of g.heads) s += `<polygon points="${head}" fill="${color}"/>`;
    return s;
  }
  const m = measured.get(a.id);
  const lines = a.text.split('\n');
  const rtl = m?.rtl ?? false;
  const width = m?.width ?? textExtent(a).width;
  const x = rtl ? a.x + 2 + width : a.x + 2;
  const weight = a.bold ? 700 : 400;
  const tspans = lines.map((l, i) => `<tspan x="${num(x)}" dy="${num(i === 0 ? a.size : a.size * 1.3)}">${esc(l) || ' '}</tspan>`).join('');
  return `<text y="${num(a.y)}" font-size="${a.size}" font-weight="${weight}" font-family="Segoe UI, Tahoma, 'Noto Sans Arabic', sans-serif" fill="${color}"${rtl ? ' direction="rtl"' : ''} xml:space="preserve">${tspans}</text>`;
}

// ---------------------------------------------------------------- whole image

/** Applies a theme for the duration of `fn` (synchronous: nothing is painted in between). */
function withTheme<T>(light: boolean, fn: () => T): T {
  const root = document.documentElement;
  const before = { theme: root.dataset.theme, base: root.dataset.base };
  if (light) {
    root.dataset.theme = 'light';
    root.dataset.base = 'light';
  }
  try {
    return fn();
  } finally {
    if (light) {
      root.dataset.theme = before.theme;
      root.dataset.base = before.base;
    }
  }
}

function union(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  const x1 = Math.min(...rects.map((r) => r.x));
  const y1 = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.width));
  const y2 = Math.max(...rects.map((r) => r.y + r.height));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** What is exported: everything, or the selection plus the wires between selected parts. */
function pick(circuit: CircuitDocument, opts: ExportOptions) {
  const sel = opts.selection;
  if (!sel) return { components: circuit.components, wires: circuit.wires, notes: opts.notes ? (circuit.annotations ?? []) : [] };
  const ids = new Set(sel.components);
  const wireIds = new Set(sel.wires);
  const noteIds = new Set(sel.notes);
  return {
    components: circuit.components.filter((c) => ids.has(c.id)),
    wires: circuit.wires.filter((w) => wireIds.has(w.id) || (ids.has(w.from.componentId) && ids.has(w.to.componentId))),
    notes: opts.notes ? (circuit.annotations ?? []).filter((a) => noteIds.has(a.id)) : [],
  };
}

/**
 * Builds the image as SVG text. Reads the live canvas, so the Workspace must
 * be mounted (it is, even behind the start screen). Returns null when there
 * is nothing to export.
 */
export function buildExportSvg(circuit: CircuitDocument, opts: ExportOptions): ExportSvg | null {
  const world = document.querySelector<HTMLElement>('.workspace .world');
  if (!world) return null;
  const { components, wires, notes } = pick(circuit, opts);
  if (!components.length && !wires.length && !notes.length) return null;

  return withTheme(opts.background === 'white', () => {
    const rootStyle = getComputedStyle(document.documentElement);
    const v = (name: string) => rootStyle.getPropertyValue(name).trim();
    const ink = v('--text') || '#1f2328';
    const canvasBg = v('--bg-canvas') || '#ffffff';
    const labelColor = v('--text-2') || '#555';
    const endpointFill = v('--bg-panel-2') || '#fff';
    const gridDot = v('--grid-dot') || 'rgba(0,0,0,0.15)';

    // Measure with the zoom and rotations removed, so element boxes are in part coordinates.
    const comps = new Map<string, HTMLElement>();
    for (const el of world.querySelectorAll<HTMLElement>(':scope > .comp[data-comp]')) comps.set(el.dataset.comp!, el);
    const saved: [HTMLElement, string][] = [[world, world.style.transform]];
    const angles = new Map<string, number>();
    world.style.transform = 'none';
    for (const [id, el] of comps) {
      saved.push([el, el.style.transform]);
      el.style.transform = 'none';
      const body = el.querySelector<HTMLElement>(':scope > .body');
      const m = body?.style.transform.match(/rotate\(([-\d.]+)deg\)/);
      if (body && m) {
        angles.set(id, Number(m[1]));
        saved.push([body, body.style.transform]);
        body.style.transform = 'none';
      }
    }
    const measured = new Map<string, { width: number; rtl: boolean }>();
    const titles = new Map<string, number>();
    for (const el of world.querySelectorAll<HTMLElement>('.annot-frame-title[data-annot]')) titles.set(el.dataset.annot!, el.getBoundingClientRect().width);
    for (const el of world.querySelectorAll<HTMLElement>('.annot-text[data-annot]')) {
      const text = el.textContent ?? '';
      measured.set(el.dataset.annot!, { width: el.getBoundingClientRect().width - 4, rtl: /^[^A-Za-zÀ-ɏ]*[֐-ࣿ]/.test(text) });
    }
    try {
      const wanted = new Set(components.map((c) => c.id));
      const byId = new Map(circuit.components.map((c) => [c.id, c]));
      // Parts in canvas order (breadboards under the parts plugged into them).
      const partSvg: string[] = [];
      let i = 0;
      for (const [id, el] of comps) {
        if (!wanted.has(id)) continue;
        partSvg.push(partGroup(byId.get(id)!, el, i++, angles.get(id) ?? 0));
      }

      const rects: Rect[] = [];
      for (const c of components) {
        const def = lookup(c.type);
        if (def) rects.push(componentBounds(c, def));
      }
      const wireSvg: string[] = [];
      for (const w of wires) {
        const pts = wirePolyline(circuit, w);
        if (!pts) continue;
        for (const p of pts) rects.push({ x: p.x - 3, y: p.y - 3, width: 6, height: 6 });
        const d = pts.map((p, k) => `${k ? 'L' : 'M'}${num(p.x)} ${num(p.y)}`).join(' ');
        wireSvg.push(
          `<path d="${d}" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/>` +
            `<path d="${d}" fill="none" stroke="${w.color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>` +
            [pts[0], pts[pts.length - 1]].map((p) => `<circle cx="${num(p.x)}" cy="${num(p.y)}" r="2.2" fill="${endpointFill}" stroke="${w.color}" stroke-width="1.5"/>`).join(''),
        );
        if (w.label) {
          const mid = pts[Math.floor(pts.length / 2)];
          const prev = pts[Math.floor(pts.length / 2) - 1] ?? mid;
          wireSvg.push(
            `<text x="${num((mid.x + prev.x) / 2)}" y="${num((mid.y + prev.y) / 2 - 4)}" text-anchor="middle" font-size="9" font-family="Consolas, monospace" fill="${ink}" stroke="${canvasBg}" stroke-width="3" paint-order="stroke">${esc(w.label)}</text>`,
          );
        }
      }
      const labelSvg: string[] = [];
      if (opts.labels) {
        for (const c of components) {
          const def = lookup(c.type);
          if (!def || !c.label || def.visual.kind === 'builtin' && (def.visual.renderer === 'junction' || def.visual.renderer === 'net-label')) continue;
          if (def.pins.length && def.pins.every((p) => p.kind === 'socket')) continue;
          const b = componentBounds(c, def);
          labelSvg.push(`<text x="${num(b.x + b.width / 2)}" y="${num(b.y - 4)}" text-anchor="middle" font-size="10" font-family="Cascadia Mono, Consolas, monospace" fill="${labelColor}">${esc(c.label)}</text>`);
          rects.push({ x: b.x + b.width / 2 - c.label.length * 3.5, y: b.y - 14, width: c.label.length * 7, height: 14 });
        }
      }
      const frames = notes.filter((a) => a.kind === 'rect');
      const others = notes.filter((a) => a.kind !== 'rect');
      for (const a of notes) {
        const b = annotationBounds(a);
        const m = measured.get(a.id);
        rects.push(a.kind === 'rect' && a.title ? { ...b, y: b.y - 22, height: b.height + 22 } : m ? { ...b, width: m.width + 4 } : b);
      }
      const box = union(rects);
      if (!box) return null;
      const x0 = Math.floor(box.x - PAD);
      const y0 = Math.floor(box.y - PAD);
      const width = Math.ceil(box.width + PAD * 2);
      const height = Math.ceil(box.height + PAD * 2);

      let bg = '';
      if (opts.background !== 'transparent') bg += `<rect x="${x0}" y="${y0}" width="${width}" height="${height}" fill="${opts.background === 'white' ? '#ffffff' : canvasBg}"/>`;
      if (opts.grid) {
        bg += `<defs><pattern id="evlab-grid" x="0" y="0" width="9.6" height="9.6" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r="0.9" fill="${gridDot}"/></pattern></defs>`;
        bg += `<rect x="${x0}" y="${y0}" width="${width}" height="${height}" fill="url(#evlab-grid)"/>`;
      }
      const svg =
        `<svg xmlns="${SVG_NS}" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="${x0} ${y0} ${width} ${height}">` +
        bg +
        frames.map((a) => noteSvg(a, ink, measured)).join('') +
        partSvg.join('') +
        labelSvg.join('') +
        wireSvg.join('') +
        others.map((a) => noteSvg(a, ink, measured)).join('') +
        frames.map((a) => (a.kind === 'rect' ? frameTitleSvg(a, ink, titles.get(a.id)) : '')).join('') +
        `</svg>`;
      return { svg, width, height };
    } finally {
      for (const [el, t] of saved) el.style.transform = t;
    }
  });
}

/** The SVG at a given scale (vector: the size only sets the default display size). */
export function scaledSvg(e: ExportSvg, scale: number): string {
  return e.svg.replace(/^<svg([^>]*?) width="[\d.]+" height="[\d.]+"/, `<svg$1 width="${Math.round(e.width * scale)}" height="${Math.round(e.height * scale)}"`);
}

// ---------------------------------------------------------------- PNG

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Records the resolution in a PNG (pHYs chunk after IHDR), so documents and printers use the right size. */
export function withDpi(png: Uint8Array, dpi: number): Uint8Array {
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  view.setUint32(8, ppm);
  view.setUint32(12, ppm);
  chunk[16] = 1; // unit: metre
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  const ihdrEnd = 8 + 25;
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, ihdrEnd));
  out.set(chunk, ihdrEnd);
  out.set(png.subarray(ihdrEnd), ihdrEnd + chunk.length);
  return out;
}

/** Rasterises the SVG at `scale` (1× = 96 DPI). */
export async function renderPng(e: ExportSvg, scale: number): Promise<Uint8Array> {
  const w = Math.max(1, Math.round(e.width * scale));
  const h = Math.max(1, Math.round(e.height * scale));
  const url = URL.createObjectURL(new Blob([scaledSvg(e, scale)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D canvas');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('The image is too large to create.');
    return withDpi(new Uint8Array(await blob.arrayBuffer()), Math.round(96 * scale));
  } finally {
    URL.revokeObjectURL(url);
  }
}
