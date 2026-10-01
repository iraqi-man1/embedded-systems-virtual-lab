/**
 * Editing commands shared by the toolbar, menus, context menus and keyboard
 * shortcuts. They operate on the project/editor stores.
 */
import { nanoid } from 'nanoid';
import type { CircuitDocument, ComponentInstance, Rotation, Wire } from '../../core/model/circuit';
import { GRID } from '../../core/model/component';
import { componentBounds, snapComponentPosition } from '../../core/circuit/geometry';
import { lookup, registry } from '../../app/registry';
import { useEditor } from '../../state/editor';
import { createInstance, nextLabel, useProject } from '../../state/project';
import { autoRoute, selectionBounds } from './geometry';

const ed = () => useEditor.getState();
const proj = () => useProject.getState();

export function addComponentAt(type: string, x: number, y: number, centered = true) {
  const def = registry.get(type);
  if (!def) return null;
  const circuit = proj().project.circuit;
  const inst = createInstance(def, centered ? x - def.size.width / 2 : x, centered ? y - def.size.height / 2 : y, circuit);
  proj().edit((c) => {
    c.components.push(inst);
  });
  ed().select([inst.id]);
  ed().pushRecent(type);
  return inst;
}

/** Adds a component at the centre of the visible canvas. */
export function addComponentAtCenter(type: string) {
  const { viewport } = ed();
  const el = document.querySelector('.workspace') as HTMLElement | null;
  const w = el?.clientWidth ?? 800;
  const h = el?.clientHeight ?? 600;
  // Nudge successive placements so parts don't stack exactly.
  const n = proj().project.circuit.components.length % 6;
  return addComponentAt(type, (w / 2 - viewport.x) / viewport.zoom + n * 19.2, (h / 2 - viewport.y) / viewport.zoom + n * 19.2);
}

export function deleteSelection() {
  const { selectedComponents, selectedWires } = ed();
  if (!selectedComponents.length && !selectedWires.length) return;
  const comps = new Set(selectedComponents);
  const wires = new Set(selectedWires);
  proj().edit((c) => {
    c.components = c.components.filter((x) => !comps.has(x.id));
    c.wires = c.wires.filter((w) => !wires.has(w.id) && !comps.has(w.from.componentId) && !comps.has(w.to.componentId));
  });
  ed().clearSelection();
}

export function rotateSelection(delta: 90 | -90 = 90) {
  const ids = new Set(ed().selectedComponents);
  if (!ids.size) return;
  proj().edit((c) => {
    for (const inst of c.components) {
      if (!ids.has(inst.id)) continue;
      const def = lookup(inst.type);
      inst.rotation = (((inst.rotation + delta) % 360) + 360) % 360 as Rotation;
      if (def) Object.assign(inst, snapComponentPosition(inst as ComponentInstance, def, inst.x, inst.y));
    }
  });
}

export function flipSelection() {
  const ids = new Set(ed().selectedComponents);
  if (!ids.size) return;
  proj().edit((c) => {
    for (const inst of c.components) {
      if (!ids.has(inst.id)) continue;
      inst.flip = !inst.flip;
      const def = lookup(inst.type);
      if (def) Object.assign(inst, snapComponentPosition(inst as ComponentInstance, def, inst.x, inst.y));
    }
  });
}

export function selectAll() {
  const c = proj().project.circuit;
  ed().select(
    c.components.map((x) => x.id),
    c.wires.map((w) => w.id),
  );
}

function selectionAsDocument(): CircuitDocument | null {
  const { selectedComponents } = ed();
  if (!selectedComponents.length) return null;
  const c = proj().project.circuit;
  const ids = new Set(selectedComponents);
  return {
    components: c.components.filter((x) => ids.has(x.id)),
    // Copy wires whose both ends are copied (selected or not).
    wires: c.wires.filter((w) => ids.has(w.from.componentId) && ids.has(w.to.componentId)),
  };
}

export function copySelection() {
  const doc = selectionAsDocument();
  if (doc) ed().set({ clipboard: structuredClone(doc) });
}

export function cutSelection() {
  copySelection();
  deleteSelection();
}

/** Pastes the clipboard offset by `offset` (or at `at`, top-left of the group). */
export function paste(at?: { x: number; y: number }) {
  const clip = ed().clipboard;
  if (!clip?.components.length) return;
  pasteDocument(clip, at);
}

export function duplicateSelection() {
  const doc = selectionAsDocument();
  if (doc) pasteDocument(doc);
}

function pasteDocument(doc: CircuitDocument, at?: { x: number; y: number }) {
  const minX = Math.min(...doc.components.map((c) => c.x));
  const minY = Math.min(...doc.components.map((c) => c.y));
  const dx = at ? at.x - minX : GRID * 3;
  const dy = at ? at.y - minY : GRID * 3;
  const idMap = new Map<string, string>();
  const current = structuredClone(proj().project.circuit);
  const newComps: ComponentInstance[] = doc.components.map((c) => {
    const id = nanoid(10);
    idMap.set(c.id, id);
    const def = lookup(c.type);
    const inst: ComponentInstance = { ...structuredClone(c), id, x: c.x + dx, y: c.y + dy, label: nextLabel(current, def?.designator ?? 'U') };
    current.components.push(inst);
    return inst;
  });
  const newWires: Wire[] = doc.wires.map((w) => ({
    ...structuredClone(w),
    id: nanoid(10),
    from: { componentId: idMap.get(w.from.componentId)!, pinId: w.from.pinId },
    to: { componentId: idMap.get(w.to.componentId)!, pinId: w.to.pinId },
    points: w.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
  }));
  proj().edit((c) => {
    c.components.push(...newComps);
    c.wires.push(...newWires);
  });
  ed().select(
    newComps.map((c) => c.id),
    newWires.map((w) => w.id),
  );
}

export function nudgeSelection(dx: number, dy: number) {
  const ids = new Set(ed().selectedComponents);
  if (!ids.size) return;
  proj().edit((c) => {
    for (const inst of c.components) if (ids.has(inst.id)) {
      inst.x += dx;
      inst.y += dy;
    }
    for (const w of c.wires) {
      if (ids.has(w.from.componentId) && ids.has(w.to.componentId)) for (const p of w.points) {
        p.x += dx;
        p.y += dy;
      }
    }
  });
}

export type Align = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'hdist' | 'vdist';

export function alignSelection(mode: Align) {
  const ids = ed().selectedComponents;
  if (ids.length < 2) return;
  const c = proj().project.circuit;
  const group = selectionBounds(c, ids)!;
  const items = c.components
    .filter((x) => ids.includes(x.id))
    .map((inst) => ({ inst, b: componentBounds(inst, lookup(inst.type)!) }));
  const moves = new Map<string, { dx: number; dy: number }>();
  if (mode === 'hdist' || mode === 'vdist') {
    const horiz = mode === 'hdist';
    items.sort((a, b) => (horiz ? a.b.x - b.b.x : a.b.y - b.b.y));
    const total = items.reduce((s, i) => s + (horiz ? i.b.width : i.b.height), 0);
    const gap = ((horiz ? group.width : group.height) - total) / (items.length - 1);
    let pos = horiz ? group.x : group.y;
    for (const i of items) {
      moves.set(i.inst.id, horiz ? { dx: pos - i.b.x, dy: 0 } : { dx: 0, dy: pos - i.b.y });
      pos += (horiz ? i.b.width : i.b.height) + gap;
    }
  } else {
    for (const { inst, b } of items) {
      let dx = 0;
      let dy = 0;
      if (mode === 'left') dx = group.x - b.x;
      if (mode === 'right') dx = group.x + group.width - (b.x + b.width);
      if (mode === 'center') dx = group.x + group.width / 2 - (b.x + b.width / 2);
      if (mode === 'top') dy = group.y - b.y;
      if (mode === 'bottom') dy = group.y + group.height - (b.y + b.height);
      if (mode === 'middle') dy = group.y + group.height / 2 - (b.y + b.height / 2);
      moves.set(inst.id, { dx, dy });
    }
  }
  proj().edit((doc) => {
    for (const inst of doc.components) {
      const m = moves.get(inst.id);
      if (!m) continue;
      const def = lookup(inst.type)!;
      Object.assign(inst, snapComponentPosition(inst as ComponentInstance, def, inst.x + m.dx, inst.y + m.dy));
    }
  });
}

export function setWireColor(ids: string[], color: string) {
  proj().edit((c) => {
    for (const w of c.wires) if (ids.includes(w.id)) w.color = color;
  });
  ed().setPrefs({ wireColor: color });
}

export function clearWirePoints(ids: string[]) {
  proj().edit((c) => {
    for (const w of c.wires) if (ids.includes(w.id)) w.points = [];
  });
}

export function autoRouteWires(ids: string[]) {
  const circuit = proj().project.circuit;
  const routes = new Map<string, { x: number; y: number }[]>();
  for (const w of circuit.wires) {
    if (!ids.includes(w.id)) continue;
    const r = autoRoute(circuit, w);
    if (r) routes.set(w.id, r);
  }
  proj().edit((c) => {
    for (const w of c.wires) {
      const r = routes.get(w.id);
      if (r) w.points = r;
    }
  });
  if (routes.size < ids.length) ed().notify('Some wires could not be routed around parts automatically.', 'warning');
}

export function bringToFront(id: string, front = true) {
  proj().edit((c) => {
    const i = c.components.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [inst] = c.components.splice(i, 1);
    if (front) c.components.push(inst);
    else c.components.unshift(inst);
  });
}

export function fitView() {
  const c = proj().project.circuit;
  const el = document.querySelector('.workspace') as HTMLElement | null;
  if (!el) return;
  const b = selectionBounds(
    c,
    c.components.map((x) => x.id),
  );
  if (!b) {
    ed().set({ viewport: { x: 80, y: 60, zoom: 1 } });
    return;
  }
  const pad = 60;
  const zoom = Math.max(0.15, Math.min(1.6, Math.min((el.clientWidth - pad * 2) / b.width, (el.clientHeight - pad * 2) / b.height)));
  ed().set({
    viewport: {
      zoom,
      x: el.clientWidth / 2 - (b.x + b.width / 2) * zoom,
      y: el.clientHeight / 2 - (b.y + b.height / 2) * zoom,
    },
  });
}

export function zoomBy(factor: number) {
  const el = document.querySelector('.workspace') as HTMLElement | null;
  const { viewport } = ed();
  const cx = (el?.clientWidth ?? 800) / 2;
  const cy = (el?.clientHeight ?? 600) / 2;
  const zoom = Math.max(0.1, Math.min(6, viewport.zoom * factor));
  ed().set({ viewport: { zoom, x: cx - (cx - viewport.x) * (zoom / viewport.zoom), y: cy - (cy - viewport.y) * (zoom / viewport.zoom) } });
}
