/**
 * Editing commands shared by the toolbar, menus, context menus and keyboard
 * shortcuts. They operate on the project/editor stores.
 */
import { nanoid } from 'nanoid';
import { WIRE_COLORS, type CircuitDocument, type ComponentInstance, type Rotation, type Wire } from '../../core/model/circuit';
import { GRID } from '../../core/model/component';
import { componentBounds, snapComponentPosition } from '../../core/circuit/geometry';
import { carriedComponents } from '../../core/circuit/netlist';
import { lookup, registry } from '../../app/registry';
import { t } from '../../i18n';
import { getNetlist } from '../../state/derived';
import { useEditor } from '../../state/editor';
import { createInstance, nextLabel, useProject } from '../../state/project';
import { autoRoute, selectionBounds } from './geometry';
import { annotationBounds, movedFrom, translateAnnotation } from '../../core/circuit/annotations';
import type { Annotation, TextNote } from '../../core/model/circuit';

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

/** Locked parts among `ids`. */
function lockedOf(ids: Iterable<string>): ComponentInstance[] {
  const set = new Set(ids);
  return proj().project.circuit.components.filter((c) => c.locked && set.has(c.id));
}

/** The parts among `ids` that may move or change (locked ones stay). */
export function unlockedOf(ids: Iterable<string>): string[] {
  const locked = new Set(lockedOf(ids).map((c) => c.id));
  return [...ids].filter((id) => !locked.has(id));
}

/** Says (once in a while) that locked parts stayed where they are. */
let lockNoticeAt = 0;
export function noticeLocked(parts: ComponentInstance[]) {
  if (!parts.length || Date.now() - lockNoticeAt < 4000) return;
  lockNoticeAt = Date.now();
  ed().notify(t('{parts} locked: unlock with Ctrl+L to move or delete', { parts: parts.map((c) => c.label).join(', ') }), 'info');
}

/** Locks the selected parts, or unlocks them when they all are locked already. */
export function toggleLockSelection() {
  const ids = new Set(ed().selectedComponents);
  if (!ids.size) return;
  const parts = proj().project.circuit.components.filter((c) => ids.has(c.id));
  const lock = parts.some((c) => !c.locked);
  proj().edit((c) => {
    for (const inst of c.components) {
      if (!ids.has(inst.id)) continue;
      if (lock) inst.locked = true;
      else delete inst.locked;
    }
  });
}

export function deleteSelection() {
  const { selectedComponents, selectedWires, selectedAnnotations } = ed();
  if (!selectedComponents.length && !selectedWires.length && !selectedAnnotations.length) return;
  const locked = lockedOf(selectedComponents);
  noticeLocked(locked);
  const comps = new Set(unlockedOf(selectedComponents));
  const wires = new Set(selectedWires);
  const notes = new Set(selectedAnnotations);
  proj().edit((c) => {
    c.components = c.components.filter((x) => !comps.has(x.id));
    c.wires = c.wires.filter((w) => !wires.has(w.id) && !comps.has(w.from.componentId) && !comps.has(w.to.componentId));
    if (notes.size && c.annotations) c.annotations = c.annotations.filter((a) => !notes.has(a.id));
  });
  // Locked parts stay, still selected (Ctrl+L unlocks them).
  if (locked.length) ed().select(locked.map((c) => c.id));
  else ed().clearSelection();
}

export function rotateSelection(delta: 90 | -90 = 90) {
  noticeLocked(lockedOf(ed().selectedComponents));
  const ids = new Set(unlockedOf(ed().selectedComponents));
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
  noticeLocked(lockedOf(ed().selectedComponents));
  const ids = new Set(unlockedOf(ed().selectedComponents));
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
    (c.annotations ?? []).map((a) => a.id),
  );
}

function selectionAsDocument(): CircuitDocument | null {
  const { selectedComponents, selectedAnnotations } = ed();
  if (!selectedComponents.length && !selectedAnnotations.length) return null;
  const c = proj().project.circuit;
  const ids = new Set(selectedComponents);
  const notes = new Set(selectedAnnotations);
  return {
    components: c.components.filter((x) => ids.has(x.id)),
    // Copy wires whose both ends are copied (selected or not).
    wires: c.wires.filter((w) => ids.has(w.from.componentId) && ids.has(w.to.componentId)),
    annotations: (c.annotations ?? []).filter((a) => notes.has(a.id)),
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
  if (!clip?.components.length && !clip?.annotations?.length) return;
  pasteDocument(clip, at);
}

export function duplicateSelection() {
  const doc = selectionAsDocument();
  if (doc) pasteDocument(doc);
}

function pasteDocument(doc: CircuitDocument, at?: { x: number; y: number }) {
  const notes = doc.annotations ?? [];
  const noteBoxes = notes.map(annotationBounds);
  const minX = Math.min(...doc.components.map((c) => c.x), ...noteBoxes.map((b) => b.x));
  const minY = Math.min(...doc.components.map((c) => c.y), ...noteBoxes.map((b) => b.y));
  const dx = at ? at.x - minX : GRID * 3;
  const dy = at ? at.y - minY : GRID * 3;
  const idMap = new Map<string, string>();
  const current = structuredClone(proj().project.circuit);
  const newComps: ComponentInstance[] = doc.components.map((c) => {
    const id = nanoid(10);
    idMap.set(c.id, id);
    const def = lookup(c.type);
    const inst: ComponentInstance = { ...structuredClone(c), id, x: c.x + dx, y: c.y + dy, label: nextLabel(current, def?.designator ?? 'U') };
    // A copy is free to move.
    delete inst.locked;
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
  const newNotes = notes.map((a) => movedFrom({ ...a, id: nanoid(10) }, dx, dy));
  proj().edit((c) => {
    c.components.push(...newComps);
    c.wires.push(...newWires);
    if (newNotes.length) (c.annotations ??= []).push(...newNotes);
  });
  ed().select(
    newComps.map((c) => c.id),
    newWires.map((w) => w.id),
    newNotes.map((a) => a.id),
  );
}

/**
 * The selected components plus everything plugged into them: moving a
 * breadboard (or any part with sockets) carries the parts inserted into it,
 * transitively, so they stay connected.
 */
export function withCarried(ids: Iterable<string>): Set<string> {
  return carriedComponents(getNetlist(proj().project.circuit), ids);
}

export function nudgeSelection(dx: number, dy: number) {
  noticeLocked(lockedOf(ed().selectedComponents));
  const ids = new Set(unlockedOf(withCarried(unlockedOf(ed().selectedComponents))));
  const notes = new Set(ed().selectedAnnotations);
  if (!ids.size && !notes.size) return;
  proj().edit((c) => {
    for (const a of c.annotations ?? []) if (notes.has(a.id)) translateAnnotation(a, dx, dy);
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
  noticeLocked(lockedOf(ed().selectedComponents));
  const ids = unlockedOf(ed().selectedComponents);
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
  // Effective (snapped) moves, then parts plugged into moved boards follow their board.
  const effective = new Map<string, { dx: number; dy: number }>();
  for (const inst of c.components) {
    const m = moves.get(inst.id);
    if (!m) continue;
    const p = snapComponentPosition(inst, lookup(inst.type)!, inst.x + m.dx, inst.y + m.dy);
    effective.set(inst.id, { dx: p.x - inst.x, dy: p.y - inst.y });
  }
  for (const id of carriedComponents(getNetlist(c), effective.keys())) {
    if (effective.has(id)) continue;
    // Plugged-in parts follow the board they sit in.
    const board = getNetlist(c).insertions.find((i) => i.pin.componentId === id && effective.has(i.socket.componentId));
    if (board) effective.set(id, effective.get(board.socket.componentId)!);
  }
  proj().edit((doc) => {
    for (const inst of doc.components) {
      const m = effective.get(inst.id);
      if (!m) continue;
      inst.x += m.dx;
      inst.y += m.dy;
    }
    for (const w of doc.wires) {
      const a = effective.get(w.from.componentId);
      const b = effective.get(w.to.componentId);
      if (a && b && a.dx === b.dx && a.dy === b.dy) for (const p of w.points) {
        p.x += a.dx;
        p.y += a.dy;
      }
    }
  });
}

/** Recolours existing wires (one undo step). The default for new wires is unchanged. */
export function setWireColor(ids: string[], color: string) {
  const set = new Set(ids);
  proj().edit((c) => {
    for (const w of c.wires) if (set.has(w.id)) w.color = color;
  });
}

/** Wires electrically connected to `wireId` (same net, including through breadboard strips). */
export function netWireIds(wireId: string): string[] {
  const circuit = proj().project.circuit;
  const w = circuit.wires.find((x) => x.id === wireId);
  if (!w) return [];
  const netlist = getNetlist(circuit);
  const net = netlist.netOf(w.from);
  if (net === undefined) return [wireId];
  return circuit.wires.filter((x) => netlist.netOf(x.from) === net || netlist.netOf(x.to) === net).map((x) => x.id);
}

/** Recolours every wire of the net the given wire belongs to (e.g. all GND wires black). */
export function setNetWireColor(wireId: string, color: string) {
  const ids = netWireIds(wireId);
  setWireColor(ids, color);
  if (ids.length > 1) ed().notify(t('Recoloured {n} wires on this net.', { n: ids.length }), 'info');
}

/**
 * Keyboard colour picking: applies to the selected wires, or to the wire being
 * drawn (and later new wires) when nothing is selected.
 */
export function pickWireColor(index: number) {
  const c = WIRE_COLORS[index];
  if (!c) return;
  const { selectedWires, wiring } = ed();
  if (selectedWires.length && !wiring) setWireColor(selectedWires, c.value);
  else ed().setPrefs({ wireColor: c.value });
}

/** Cycles the colour of the selected wires (or the default for new wires) through the palette. */
export function cycleWireColor() {
  const { selectedWires, wiring, wireColor } = ed();
  const wires = proj().project.circuit.wires;
  const current = selectedWires.length && !wiring ? (wires.find((w) => w.id === selectedWires[0])?.color ?? wireColor) : wireColor;
  const i = WIRE_COLORS.findIndex((c) => c.value === current);
  pickWireColor((i + 1) % WIRE_COLORS.length);
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
  if (routes.size < ids.length) ed().notify(t('Some wires could not be routed around parts automatically.'), 'warning');
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

type Viewport = { x: number; y: number; zoom: number };

const canvasSize = () => {
  const el = document.querySelector('.workspace') as HTMLElement | null;
  return { w: el?.clientWidth || 800, h: el?.clientHeight || 600, el };
};

let animation = 0;

/**
 * Moves the view smoothly to `target` (zoom changes geometrically around a
 * gliding centre, so the motion looks straight). Instant with reduced motion,
 * and abandoned as soon as anything else moves the view.
 */
export function animateViewport(target: Viewport, ms = 220) {
  cancelAnimationFrame(animation);
  const from = ed().viewport;
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || ms <= 0 || (from.x === target.x && from.y === target.y && from.zoom === target.zoom)) {
    ed().set({ viewport: target });
    return;
  }
  const { w, h } = canvasSize();
  const centre = (v: Viewport) => ({ x: (w / 2 - v.x) / v.zoom, y: (h / 2 - v.y) / v.zoom });
  const c0 = centre(from);
  const c1 = centre(target);
  const t0 = performance.now();
  let last = from;
  const step = (now: number) => {
    if (ed().viewport !== last) return; // the user took over (wheel, pan…)
    const k = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    const zoom = k >= 1 ? target.zoom : Math.exp(Math.log(from.zoom) + (Math.log(target.zoom) - Math.log(from.zoom)) * e);
    const cx = c0.x + (c1.x - c0.x) * e;
    const cy = c0.y + (c1.y - c0.y) * e;
    last = k >= 1 ? target : { zoom, x: w / 2 - cx * zoom, y: h / 2 - cy * zoom };
    ed().set({ viewport: last });
    if (k < 1) animation = requestAnimationFrame(step);
  };
  animation = requestAnimationFrame(step);
}

/** Fits the whole circuit in the canvas (`instant` when a project has just been opened). */
export function fitView(opts?: { instant?: boolean }) {
  zoomToComponents(
    proj().project.circuit.components.map((x) => x.id),
    1.6,
    !opts?.instant,
  );
}

/** Zooms to the selection (Shift+F), or to the whole circuit when nothing is selected. */
export function zoomToSelection() {
  const sel = ed().selectedComponents;
  if (sel.length) zoomToComponents(sel, 1.6);
  else fitView();
}

/** Centres the given parts in the canvas at the largest zoom (≤ maxZoom) that shows them all. */
export function zoomToComponents(ids: string[], maxZoom = 1.6, animate = true) {
  const c = proj().project.circuit;
  const { w, h, el } = canvasSize();
  if (!el) return;
  const b = selectionBounds(c, ids, true);
  const go = (v: Viewport) => (animate ? animateViewport(v) : ed().set({ viewport: v }));
  if (!b) {
    go({ x: 80, y: 60, zoom: 1 });
    return;
  }
  const pad = 60;
  const zoom = Math.max(0.15, Math.min(maxZoom, Math.min((w - pad * 2) / b.width, (h - pad * 2) / b.height)));
  go({ zoom, x: w / 2 - (b.x + b.width / 2) * zoom, y: h / 2 - (b.y + b.height / 2) * zoom });
}

/** Sets the zoom level, keeping the centre of the canvas in place. */
export function setZoom(level: number) {
  const { w, h } = canvasSize();
  const { viewport } = ed();
  const cx = w / 2;
  const cy = h / 2;
  const zoom = Math.max(0.1, Math.min(6, level));
  animateViewport({ zoom, x: cx - (cx - viewport.x) * (zoom / viewport.zoom), y: cy - (cy - viewport.y) * (zoom / viewport.zoom) }, 160);
}

export function zoomBy(factor: number) {
  setZoom(ed().viewport.zoom * factor);
}

/** Moves the view by a number of screen pixels (arrow keys). */
export function panBy(dx: number, dy: number) {
  cancelAnimationFrame(animation);
  const v = ed().viewport;
  ed().set({ viewport: { ...v, x: v.x + dx, y: v.y + dy } });
}

/** Centres the view on a world point, keeping the zoom (minimap). */
export function centerOn(x: number, y: number, animate = false) {
  const { w, h } = canvasSize();
  const { zoom } = ed().viewport;
  const v = { zoom, x: w / 2 - x * zoom, y: h / 2 - y * zoom };
  if (animate) animateViewport(v, 180);
  else {
    cancelAnimationFrame(animation);
    ed().set({ viewport: v });
  }
}

// ------------------------------------------------------------ canvas notes

/** Adds a note and selects it. */
export function addNote(a: Annotation) {
  proj().edit((c) => {
    (c.annotations ??= []).push(a);
  });
  ed().select([], [], [a.id]);
}

/** Changes a note's properties (one undo step per call). */
export function updateNote(id: string, patch: Partial<Annotation>) {
  proj().edit((c) => {
    const a = c.annotations?.find((x) => x.id === id);
    if (a) Object.assign(a, patch);
  });
}

/** Starts typing in a text note (an existing one, or a new one at a point). */
export function editTextNote(note: TextNote) {
  ed().set({ editingNote: structuredClone(note), tool: 'select' });
}

/** Ends typing: saves the text, or removes the note when it was left empty. */
export function finishTextNote(text: string) {
  const note = ed().editingNote;
  if (!note) return;
  ed().set({ editingNote: null });
  const trimmed = text.replace(/\s+$/, '');
  const existing = proj().project.circuit.annotations?.find((a) => a.id === note.id);
  if (!existing) {
    if (trimmed) addNote({ ...note, text: trimmed });
    return;
  }
  if (!trimmed) {
    proj().edit((c) => {
      c.annotations = c.annotations?.filter((a) => a.id !== note.id);
    });
    ed().clearSelection();
  } else if (existing.kind === 'text' && existing.text !== trimmed) updateNote(note.id, { text: trimmed });
}

/** Puts a note above (or below) the other notes. */
export function noteToFront(id: string, front = true) {
  proj().edit((c) => {
    const list = c.annotations;
    const i = list?.findIndex((a) => a.id === id) ?? -1;
    if (!list || i < 0) return;
    const [a] = list.splice(i, 1);
    if (front) list.push(a);
    else list.unshift(a);
  });
}

/**
 * Brings a world rectangle into view (Find): glides to it at the current
 * zoom when it fits, otherwise zooms out just enough to show it.
 */
export function revealRect(r: { x: number; y: number; width: number; height: number }) {
  const { w, h } = canvasSize();
  const { zoom } = ed().viewport;
  const pad = 80;
  const fit = Math.min((w - pad * 2) / Math.max(1, r.width), (h - pad * 2) / Math.max(1, r.height));
  const z = Math.max(0.15, Math.min(zoom, fit, 2));
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  animateViewport({ zoom: z, x: w / 2 - cx * z, y: h / 2 - cy * z }, 260);
}
