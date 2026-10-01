import type { CircuitDocument, ComponentInstance, PinRef, Point, Wire } from '../../core/model/circuit';
import type { ComponentDefinition, PinDefinition } from '../../core/model/component';
import { GRID } from '../../core/model/component';
import { componentBounds, localToWorld, pinWorld, rectsIntersect, type Rect } from '../../core/circuit/geometry';
import { lookup } from '../../app/registry';

export interface IndexedPin {
  ref: PinRef;
  x: number;
  y: number;
  pin: PinDefinition;
  inst: ComponentInstance;
  def: ComponentDefinition;
}

export interface PinIndex {
  pins: IndexedPin[];
  byKey: Map<string, IndexedPin>;
  cells: Map<string, IndexedPin[]>;
}

const CELL = 24;

let cached: { circuit: CircuitDocument; index: PinIndex } | null = null;

export function pinIndex(circuit: CircuitDocument): PinIndex {
  if (cached?.circuit === circuit) return cached.index;
  const pins: IndexedPin[] = [];
  const byKey = new Map<string, IndexedPin>();
  const cells = new Map<string, IndexedPin[]>();
  for (const inst of circuit.components) {
    const def = lookup(inst.type);
    if (!def) continue;
    for (const pin of def.pins) {
      const p = pinWorld(inst, def, pin);
      const ip: IndexedPin = { ref: { componentId: inst.id, pinId: pin.id }, x: p.x, y: p.y, pin, inst, def };
      pins.push(ip);
      byKey.set(`${inst.id}:${pin.id}`, ip);
      const k = `${Math.floor(p.x / CELL)},${Math.floor(p.y / CELL)}`;
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k)!.push(ip);
    }
  }
  const index = { pins, byKey, cells };
  cached = { circuit, index };
  return index;
}

/**
 * Nearest pin within `radius`. Non-socket pins win over sockets so that a
 * leg inserted into a breadboard hole is picked rather than the hole.
 */
export function hitPin(index: PinIndex, p: Point, radius: number): IndexedPin | null {
  let best: IndexedPin | null = null;
  let bestScore = Infinity;
  const cx = Math.floor(p.x / CELL);
  const cy = Math.floor(p.y / CELL);
  const r = Math.ceil(radius / CELL);
  for (let ix = cx - r; ix <= cx + r; ix++) {
    for (let iy = cy - r; iy <= cy + r; iy++) {
      for (const ip of index.cells.get(`${ix},${iy}`) ?? []) {
        const d = Math.hypot(ip.x - p.x, ip.y - p.y);
        // Holes only react near their centre so the board stays draggable between them.
        if (d > (ip.pin.kind === 'socket' ? Math.min(radius, 3.4) : radius)) continue;
        const score = d + (ip.pin.kind === 'socket' ? radius * 0.6 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = ip;
        }
      }
    }
  }
  return best;
}

export function pinPosition(circuit: CircuitDocument, ref: PinRef): Point | null {
  const ip = pinIndex(circuit).byKey.get(`${ref.componentId}:${ref.pinId}`);
  return ip ? { x: ip.x, y: ip.y } : null;
}

/** Orthogonal polyline through the anchor points (horizontal-first elbows). */
export function orthogonalPath(anchors: Point[]): Point[] {
  if (anchors.length < 2) return anchors;
  const out: Point[] = [anchors[0]];
  for (let i = 1; i < anchors.length; i++) {
    const p = out[out.length - 1];
    const q = anchors[i];
    if (Math.abs(p.x - q.x) > 0.5 && Math.abs(p.y - q.y) > 0.5) {
      // For the final leg into a pin, arrive vertically if the previous leg was horizontal.
      const horizontalFirst = i < anchors.length - 1 || Math.abs(q.x - p.x) >= Math.abs(q.y - p.y);
      out.push(horizontalFirst ? { x: q.x, y: p.y } : { x: p.x, y: q.y });
    }
    out.push(q);
  }
  return out;
}

export function polylineLength(pts: Point[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

/** Point at distance `d` along a polyline. */
export function pointAlong(pts: Point[], d: number): Point {
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (d <= seg && seg > 0) {
      const k = d / seg;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k };
    }
    d -= seg;
  }
  return pts[pts.length - 1];
}

export function wirePolyline(circuit: CircuitDocument, w: Wire): Point[] | null {
  const a = pinPosition(circuit, w.from);
  const b = pinPosition(circuit, w.to);
  if (!a || !b) return null;
  return orthogonalPath([a, ...w.points, b]);
}

export const polylineToPath = (pts: Point[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');

/** Index of the segment of `pts` closest to `p`. */
export function nearestSegment(pts: Point[], p: Point): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Grows a part's bounds by on-canvas controls drawn outside it (distance-sensor obstacles). */
function withControlExtents(inst: ComponentInstance, def: ComponentDefinition, b: Rect): Rect {
  let r = b;
  for (const c of def.controls ?? []) {
    if (c.kind !== 'range-target') continue;
    const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[c.direction];
    const far = localToWorld(inst, def, { x: c.origin.x + d[0] * (170 * c.scale + 20), y: c.origin.y + d[1] * (170 * c.scale + 20) });
    const x1 = Math.min(r.x, far.x - 35);
    const y1 = Math.min(r.y, far.y - 35);
    const x2 = Math.max(r.x + r.width, far.x + 35);
    const y2 = Math.max(r.y + r.height, far.y + 35);
    r = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }
  return r;
}

/** Bounds of the given parts; `withControls` adds controls drawn outside them (for fitting the view). */
export function selectionBounds(circuit: CircuitDocument, ids: string[], withControls = false): Rect | null {
  let r: Rect | null = null;
  for (const inst of circuit.components) {
    if (!ids.includes(inst.id)) continue;
    const def = lookup(inst.type);
    if (!def) continue;
    const b = withControls ? withControlExtents(inst, def, componentBounds(inst, def)) : componentBounds(inst, def);
    if (!r) r = { ...b };
    else {
      const x2 = Math.max(r.x + r.width, b.x + b.width);
      const y2 = Math.max(r.y + r.height, b.y + b.height);
      r.x = Math.min(r.x, b.x);
      r.y = Math.min(r.y, b.y);
      r.width = x2 - r.x;
      r.height = y2 - r.y;
    }
  }
  return r;
}

/**
 * Grid A* router: finds an orthogonal path from `a` to `b` that avoids the
 * bodies of components (except the two being connected and breadboards,
 * which wires legitimately cross). Returns waypoints (without endpoints),
 * or null if no route was found within the search budget.
 */
export function autoRoute(circuit: CircuitDocument, w: Wire): Point[] | null {
  const a = pinPosition(circuit, w.from);
  const b = pinPosition(circuit, w.to);
  if (!a || !b) return null;
  const obstacles: Rect[] = [];
  for (const inst of circuit.components) {
    const def = lookup(inst.type);
    if (!def || inst.id === w.from.componentId || inst.id === w.to.componentId) continue;
    if (def.pins.length && def.pins.every((p) => p.kind === 'socket')) continue;
    const r = componentBounds(inst, def);
    obstacles.push({ x: r.x - GRID / 2, y: r.y - GRID / 2, width: r.width + GRID, height: r.height + GRID });
  }
  const g = GRID;
  const toCell = (p: Point) => ({ x: Math.round(p.x / g), y: Math.round(p.y / g) });
  const s = toCell(a);
  const t = toCell(b);
  const margin = 12;
  const minX = Math.min(s.x, t.x) - margin;
  const maxX = Math.max(s.x, t.x) + margin;
  const minY = Math.min(s.y, t.y) - margin;
  const maxY = Math.max(s.y, t.y) + margin;
  const blocked = (x: number, y: number) => {
    if ((x === s.x && y === s.y) || (x === t.x && y === t.y)) return false;
    const px = x * g;
    const py = y * g;
    return obstacles.some((o) => px > o.x && px < o.x + o.width && py > o.y && py < o.y + o.height);
  };
  type Node = { x: number; y: number; dir: number; g: number; f: number; parent: Node | null };
  const key = (x: number, y: number, d: number) => `${x},${y},${d}`;
  const open: Node[] = [{ x: s.x, y: s.y, dir: -1, g: 0, f: Math.abs(t.x - s.x) + Math.abs(t.y - s.y), parent: null }];
  const best = new Map<string, number>();
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  let iterations = 0;
  while (open.length && iterations++ < 40000) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur.x === t.x && cur.y === t.y) {
      // Reconstruct and keep only corners.
      const cells: Point[] = [];
      for (let n: Node | null = cur; n; n = n.parent) cells.unshift({ x: n.x * g, y: n.y * g });
      const corners: Point[] = [];
      for (let i = 1; i < cells.length - 1; i++) {
        const p = cells[i - 1];
        const c = cells[i];
        const n = cells[i + 1];
        if ((p.x === c.x) !== (c.x === n.x)) corners.push(c);
      }
      return corners;
    }
    for (let d = 0; d < 4; d++) {
      const nx = cur.x + dirs[d][0];
      const ny = cur.y + dirs[d][1];
      if (nx < minX || nx > maxX || ny < minY || ny > maxY || blocked(nx, ny)) continue;
      const turn = cur.dir !== -1 && cur.dir !== d ? 3 : 0;
      const ng = cur.g + 1 + turn;
      const k = key(nx, ny, d);
      if ((best.get(k) ?? Infinity) <= ng) continue;
      best.set(k, ng);
      open.push({ x: nx, y: ny, dir: d, g: ng, f: ng + Math.abs(t.x - nx) + Math.abs(t.y - ny), parent: cur });
    }
  }
  return null;
}

// ------------------------------------------------------------------ marquee
function segmentHitsRect(a: Point, b: Point, r: Rect): boolean {
  const inside = (p: Point) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
  if (inside(a) || inside(b)) return true;
  // Wire segments are axis-aligned or short diagonals: test against the rectangle edges.
  const edges: [Point, Point][] = [
    [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y }],
    [{ x: r.x + r.width, y: r.y }, { x: r.x + r.width, y: r.y + r.height }],
    [{ x: r.x + r.width, y: r.y + r.height }, { x: r.x, y: r.y + r.height }],
    [{ x: r.x, y: r.y + r.height }, { x: r.x, y: r.y }],
  ];
  const cross = (p: Point, q: Point, s: Point) => (q.x - p.x) * (s.y - p.y) - (q.y - p.y) * (s.x - p.x);
  return edges.some(([c, d]) => cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0);
}

/**
 * Box selection, CAD convention: dragging left→right ("window") selects what
 * lies completely inside the box; right→left ("crossing") selects everything
 * the box touches.
 */
export function marqueeSelection(circuit: CircuitDocument, rect: Rect, crossing: boolean): { components: string[]; wires: string[] } {
  const contains = (b: Rect) => b.x >= rect.x && b.y >= rect.y && b.x + b.width <= rect.x + rect.width && b.y + b.height <= rect.y + rect.height;
  const components = circuit.components
    .filter((c) => {
      const def = lookup(c.type);
      if (!def) return false;
      const b = componentBounds(c, def);
      return crossing ? rectsIntersect(b, rect) : contains(b);
    })
    .map((c) => c.id);
  const wires = circuit.wires
    .filter((w) => {
      const pts = wirePolyline(circuit, w);
      if (!pts) return false;
      if (!crossing) return pts.every((p) => contains({ x: p.x, y: p.y, width: 0, height: 0 }));
      for (let i = 0; i + 1 < pts.length; i++) if (segmentHitsRect(pts[i], pts[i + 1], rect)) return true;
      return false;
    })
    .map((w) => w.id);
  return { components, wires };
}

// -------------------------------------------------------- insertion preview
/**
 * Breadboard holes (socket pins) that legs at `points` would plug into, and
 * the other holes of the same strips. Sockets of `exclude`d parts (the ones
 * being moved) are ignored.
 */
export function insertionPreview(
  circuit: CircuitDocument,
  netlist: { netOf(ref: PinRef): number | undefined; nets: { pins: PinRef[] }[] },
  points: Point[],
  exclude: Set<string>,
  tolerance = 3.6,
): { holes: Point[]; strips: Point[] } {
  const index = pinIndex(circuit);
  const holes: Point[] = [];
  const holeKeys = new Set<string>();
  const nets = new Set<number>();
  for (const p of points) {
    const cx = Math.floor(p.x / CELL);
    const cy = Math.floor(p.y / CELL);
    let best: IndexedPin | null = null;
    let bestD = tolerance;
    for (let ix = cx - 1; ix <= cx + 1; ix++) {
      for (let iy = cy - 1; iy <= cy + 1; iy++) {
        for (const ip of index.cells.get(`${ix},${iy}`) ?? []) {
          if (ip.pin.kind !== 'socket' || exclude.has(ip.ref.componentId)) continue;
          const d = Math.hypot(ip.x - p.x, ip.y - p.y);
          if (d <= bestD) {
            bestD = d;
            best = ip;
          }
        }
      }
    }
    if (!best) continue;
    const key = `${best.ref.componentId}:${best.ref.pinId}`;
    if (holeKeys.has(key)) continue;
    holeKeys.add(key);
    holes.push({ x: best.x, y: best.y });
    const n = netlist.netOf(best.ref);
    if (n !== undefined) nets.add(n);
  }
  const strips: Point[] = [];
  for (const n of nets) {
    for (const ref of netlist.nets[n]?.pins ?? []) {
      const key = `${ref.componentId}:${ref.pinId}`;
      if (holeKeys.has(key) || exclude.has(ref.componentId)) continue;
      const ip = index.byKey.get(key);
      if (ip && ip.pin.kind === 'socket') strips.push({ x: ip.x, y: ip.y });
    }
  }
  return { holes, strips };
}
