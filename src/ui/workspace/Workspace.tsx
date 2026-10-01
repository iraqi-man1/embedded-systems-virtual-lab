/**
 * The circuit workspace: infinite pan/zoom canvas with components, wires,
 * breadboard insertion, selection, wiring, probing and live interaction
 * with simulated parts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PinRef, Point, Wire } from '../../core/model/circuit';
import { GRID } from '../../core/model/component';
import { componentBounds, pinWorld, snap, snapComponentPosition } from '../../core/circuit/geometry';
import { defaultProps } from '../../core/sim/setup';
import { lookup, registry } from '../../app/registry';
import { useEditor } from '../../state/editor';
import { coalescedEdit, createInstance, createWire, useProject } from '../../state/project';
import { sendInput, useSim } from '../../state/sim';
import { useErc, useNetlist } from '../../state/derived';
import { formatEngineering } from '../../core/model/units';
import { ComponentView } from './ComponentView';
import { WireLayer, type Overlay } from './WireLayer';
import { hitPin, insertionPreview, marqueeSelection, nearestSegment, pinIndex, pinPosition, pointAlong, polylineLength, wirePolyline, type IndexedPin } from './geometry';
import { addComponentAt, fitView, withCarried, zoomBy, zoomToSelection } from './actions';
import { assignProbe, probeMarkers } from '../instruments/probes';
import { Icon } from '../common/Icon';
import { ContextMenu, DropdownMenu, MenuItem, MenuSeparator } from '../common/Menu';
import { AnchoredPopover } from '../common/Popover';
import { Tip } from '../common/Tooltip';
import { CanvasMenuItems } from '../shell/ContextMenu';
import { ZoomItems } from '../shell/MenuBar';
import { loadExample } from '../../examples';
import { fileTitle, openRecent } from '../../app/fileOps';
import { SimControlsLayer } from './SimControls';
import { useWireToolbarVisible, WireToolbar } from './WireToolbar';

type Drag =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'move'; start: Point; orig: Map<string, Point>; wires: Map<string, Point[]>; anchor: string; moved: boolean }
  | { kind: 'marquee'; start: Point; base: string[]; baseWires: string[] }
  | { kind: 'handle'; wireId: string; index: number }
  | { kind: 'interact'; id: string; mode: 'momentary' | 'slider'; input: string; prop?: string; sx: number; sy: number; v0: number }
  | { kind: 'pin'; pin: IndexedPin; sx: number; sy: number; dragging: boolean }
  | { kind: 'wire-end'; wireId: string; end: 'from' | 'to' };

const DRAG_THRESHOLD = 4;

function wireColorFor(a: IndexedPin | undefined, b: IndexedPin | undefined, fallback: string) {
  const kinds = [a?.pin.kind, b?.pin.kind];
  if (kinds.includes('ground')) return '#222222';
  if (kinds.includes('power')) return '#e74c3c';
  return fallback;
}

/** Recently opened projects on the empty canvas. */
function RecentProjects() {
  const recent = useEditor((s) => s.recentProjects);
  if (!recent.length) return null;
  return (
    <div className="recent-projects">
      <h4>Recent projects</h4>
      {recent.slice(0, 5).map((r) => (
        <Tip key={r.path} content={r.path} side="right" direct>
          <button className="recent-item" onClick={() => void openRecent(r.path)}>
            <Icon name="history" />
            <span className="name">{fileTitle(r.path)}</span>
            <span className="when">{new Date(r.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          </button>
        </Tip>
      ))}
    </div>
  );
}

export function Workspace() {
  const circuit = useProject((s) => s.project.circuit);
  const instruments = useProject((s) => s.project.instruments);
  const viewport = useEditor((s) => s.viewport);
  const selectedComponents = useEditor((s) => s.selectedComponents);
  const selectedWires = useEditor((s) => s.selectedWires);
  const showGrid = useEditor((s) => s.showGrid);
  const snapOn = useEditor((s) => s.snap);
  const tool = useEditor((s) => s.tool);
  const wiring = useEditor((s) => s.wiring);
  const simState = useSim((s) => s.state);
  const voltages = useSim((s) => s.voltages);
  const driven = useSim((s) => s.driven);
  const mcus = useSim((s) => s.mcus);
  const netlist = useNetlist();
  const erc = useErc();
  const simDiagnostics = useSim((s) => s.diagnostics);
  // Worst problem per part, for outlines and badges on the canvas.
  const problems = useMemo(() => {
    const m = new Map<string, { severity: 'error' | 'warning'; messages: string[] }>();
    for (const d of [...erc, ...simDiagnostics]) {
      if (d.severity !== 'error' && d.severity !== 'warning') continue;
      for (const id of d.componentIds ?? []) {
        const cur = m.get(id) ?? { severity: d.severity, messages: [] };
        if (d.severity === 'error') cur.severity = 'error';
        cur.messages.push(d.message);
        m.set(id, cur);
      }
    }
    return m;
  }, [erc, simDiagnostics]);

  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const space = useRef(false);
  const [hover, setHover] = useState<IndexedPin | null>(null);
  const [cursor, setCursor] = useState<Point>({ x: 0, y: 0 });
  const [marquee, setMarquee] = useState<Overlay['marquee']>(null);
  const [dragging, setDragging] = useState(false);
  const [ghost, setGhost] = useState<{ type: string; x: number; y: number } | null>(null);
  const libraryDrag = useEditor((s) => s.dragType);
  useEffect(() => {
    if (!libraryDrag) setGhost(null);
  }, [libraryDrag]);

  const index = pinIndex(circuit);
  const simulating = simState !== 'stopped';
  // Breadboards (socket-only parts) are drawn first so parts plugged into them stay visible and clickable.
  const renderOrder = useMemo(() => {
    const isBoard = (type: string) => {
      const def = lookup(type);
      return !!def && def.pins.length > 0 && def.pins.every((p) => p.kind === 'socket');
    };
    return [...circuit.components.filter((c) => isBoard(c.type)), ...circuit.components.filter((c) => !isBoard(c.type))];
  }, [circuit.components]);
  const selectedSet = useMemo(() => new Set(selectedComponents), [selectedComponents]);

  const toWorld = useCallback(
    (clientX: number, clientY: number): Point => {
      const r = ref.current!.getBoundingClientRect();
      const { x, y, zoom } = useEditor.getState().viewport;
      return { x: (clientX - r.left - x) / zoom, y: (clientY - r.top - y) / zoom };
    },
    [],
  );
  const snapPt = (p: Point): Point => (useEditor.getState().snap ? { x: snap(p.x, GRID / 2), y: snap(p.y, GRID / 2) } : p);

  // ------------------------------------------------------------ wiring
  const finishWire = useCallback((to: IndexedPin) => {
    const ed = useEditor.getState();
    const w = ed.wiring;
    if (!w) return;
    if (w.from.componentId === to.ref.componentId && w.from.pinId === to.ref.pinId) return;
    const c = useProject.getState().project.circuit;
    const idx = pinIndex(c);
    const exists = c.wires.some(
      (x) =>
        (x.from.componentId === w.from.componentId && x.from.pinId === w.from.pinId && x.to.componentId === to.ref.componentId && x.to.pinId === to.ref.pinId) ||
        (x.to.componentId === w.from.componentId && x.to.pinId === w.from.pinId && x.from.componentId === to.ref.componentId && x.from.pinId === to.ref.pinId),
    );
    if (!exists) {
      const color = wireColorFor(idx.byKey.get(`${w.from.componentId}:${w.from.pinId}`), to, ed.wireColor);
      const wire = createWire(w.from, to.ref, w.points, color);
      useProject.getState().edit((d) => {
        d.wires.push(wire);
      });
    }
    ed.set({ wiring: null });
  }, []);

  /** Clicking a wire while drawing: split it with a junction and connect there. */
  const finishOnWire = useCallback((wireId: string, at: Point) => {
    const ed = useEditor.getState();
    const draft = ed.wiring;
    const c = useProject.getState().project.circuit;
    const w = c.wires.find((x) => x.id === wireId);
    const jdef = registry.get('evlab.junction');
    if (!draft || !w || !jdef) return;
    const pts = wirePolyline(c, w)!;
    const seg = nearestSegment(pts, at);
    const a = pts[seg];
    const b = pts[seg + 1];
    const p = Math.abs(a.y - b.y) < 0.5 ? { x: snap(at.x), y: a.y } : Math.abs(a.x - b.x) < 0.5 ? { x: a.x, y: snap(at.y) } : snapPt(at);
    const junction = createInstance(jdef, p.x - 4.8, p.y - 4.8, c);
    junction.x = p.x - 4.8;
    junction.y = p.y - 4.8;
    const jref: PinRef = { componentId: junction.id, pinId: 'J' };
    // Waypoints before the clicked segment stay on the first half.
    const before = w.points.filter((wp) => pts.findIndex((q) => q.x === wp.x && q.y === wp.y) <= seg);
    const after = w.points.slice(before.length);
    const w1: Wire = { ...w, to: jref, points: before };
    const w2 = createWire(jref, w.to, after, w.color);
    const fresh = createWire(draft.from, jref, draft.points, w.color);
    useProject.getState().edit((d) => {
      d.components.push(junction);
      const i = d.wires.findIndex((x) => x.id === w.id);
      d.wires.splice(i, 1, w1, w2, fresh);
    });
    ed.set({ wiring: null });
  }, []);

  // ----------------------------------------------------------- pointer
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    // Overlay controls (hint buttons, zoom bar) handle their own clicks.
    if ((e.target as Element).closest('button, .canvas-hint .btns')) return;
    const el = ref.current!;
    el.focus();
    const ed = useEditor.getState();
    if (e.button === 1 || (e.button === 0 && space.current)) {
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: ed.viewport.x, vy: ed.viewport.y };
      el.setPointerCapture(e.pointerId);
      setDragging(true);
      return;
    }
    const world = toWorld(e.clientX, e.clientY);
    const zoom = ed.viewport.zoom;
    const hit = hitPin(index, world, Math.max(4.5, 7 / zoom));
    const target = e.target as Element;
    const wireEl = target.closest('[data-wire]');
    const handleAttr = target.getAttribute('data-handle');
    const compEl = target.closest('[data-comp]');
    const compId = compEl?.getAttribute('data-comp') ?? null;

    if (ed.tool !== 'select') {
      if (hit) assignProbe(ed.tool, hit.ref);
      if (!e.shiftKey) ed.set({ tool: 'select' });
      return;
    }

    // Live interaction with simulated parts (buttons, knobs, switches).
    if (simulating && compId && !e.altKey && !ed.wiring) {
      const inst = circuit.components.find((c) => c.id === compId);
      const def = inst && lookup(inst.type);
      if (inst && def?.interaction && def.simulation.support !== 'visual-only') {
        ed.select([compId]);
        const it = def.interaction;
        if (it.kind === 'momentary') {
          sendInput(compId, it.input ?? 'pressed', true);
          drag.current = { kind: 'interact', id: compId, mode: 'momentary', input: it.input ?? 'pressed', sx: e.clientX, sy: e.clientY, v0: 0 };
        } else if (it.kind === 'toggle') {
          sendInput(compId, it.input ?? 'toggle', true);
        } else {
          const prop = it.property ?? 'position';
          useProject.getState().begin();
          drag.current = { kind: 'interact', id: compId, mode: 'slider', input: it.input ?? 'value', prop, sx: e.clientX, sy: e.clientY, v0: Number(inst.props[prop] ?? 0.5) };
        }
        el.setPointerCapture(e.pointerId);
        return;
      }
    }

    // Endpoint handle of a selected wire: drag it to another pin to re-attach.
    const endAttr = target.getAttribute('data-end');
    if (endAttr && wireEl && !ed.wiring) {
      useProject.getState().begin();
      drag.current = { kind: 'wire-end', wireId: wireEl.getAttribute('data-wire')!, end: endAttr === 'to' ? 'to' : 'from' };
      el.setPointerCapture(e.pointerId);
      setDragging(true);
      return;
    }

    if (ed.wiring) {
      if (hit) finishWire(hit);
      else if (wireEl && handleAttr === null) finishOnWire(wireEl.getAttribute('data-wire')!, world);
      else ed.set({ wiring: { ...ed.wiring, points: [...ed.wiring.points, snapPt(world)] } });
      return;
    }

    if (hit) {
      drag.current = { kind: 'pin', pin: hit, sx: e.clientX, sy: e.clientY, dragging: false };
      el.setPointerCapture(e.pointerId);
      return;
    }

    if (handleAttr !== null && wireEl) {
      const wireId = wireEl.getAttribute('data-wire')!;
      ed.select([], [wireId]);
      useProject.getState().begin();
      drag.current = { kind: 'handle', wireId, index: Number(handleAttr) };
      el.setPointerCapture(e.pointerId);
      setDragging(true);
      return;
    }

    if (wireEl) {
      const wireId = wireEl.getAttribute('data-wire')!;
      if (e.shiftKey) {
        const s = new Set(ed.selectedWires);
        if (s.has(wireId)) s.delete(wireId);
        else s.add(wireId);
        ed.select(ed.selectedComponents, [...s]);
      } else if (ed.selectedWires.length === 1 && ed.selectedWires[0] === wireId) {
        // Dragging a selected wire inserts a waypoint and moves it.
        const w = circuit.wires.find((x) => x.id === wireId)!;
        const pts = wirePolyline(circuit, w)!;
        const seg = nearestSegment(pts, world);
        const insertAt = w.points.filter((wp) => pts.findIndex((q) => q.x === wp.x && q.y === wp.y) <= seg).length;
        useProject.getState().begin();
        useProject.getState().edit((d) => {
          d.wires.find((x) => x.id === wireId)!.points.splice(insertAt, 0, snapPt(world));
        });
        drag.current = { kind: 'handle', wireId, index: insertAt };
        el.setPointerCapture(e.pointerId);
        setDragging(true);
      } else ed.select([], [wireId]);
      return;
    }

    if (compId) {
      let sel = ed.selectedComponents;
      if (e.shiftKey || e.ctrlKey) {
        sel = sel.includes(compId) ? sel.filter((x) => x !== compId) : [...sel, compId];
        ed.select(sel, ed.selectedWires);
        if (!sel.includes(compId)) return;
      } else if (!sel.includes(compId)) {
        sel = [compId];
        ed.select(sel);
      }
      // Parts plugged into a moved breadboard travel with it.
      const moving = withCarried(sel);
      const orig = new Map<string, Point>();
      for (const c of circuit.components) if (moving.has(c.id)) orig.set(c.id, { x: c.x, y: c.y });
      const wires = new Map<string, Point[]>();
      for (const w of circuit.wires) {
        if (orig.has(w.from.componentId) && orig.has(w.to.componentId)) wires.set(w.id, w.points.map((p) => ({ ...p })));
      }
      useProject.getState().begin();
      drag.current = { kind: 'move', start: world, orig, wires, anchor: compId, moved: false };
      el.setPointerCapture(e.pointerId);
      return;
    }

    if (!e.shiftKey) ed.clearSelection();
    drag.current = { kind: 'marquee', start: world, base: e.shiftKey ? ed.selectedComponents : [], baseWires: e.shiftKey ? ed.selectedWires : [] };
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const world = toWorld(e.clientX, e.clientY);
    const ed = useEditor.getState();
    setCursor(world);
    ed.set({ cursor: world });
    const d = drag.current;
    if (!d || d.kind === 'pin' || d.kind === 'wire-end') {
      const h = hitPin(index, world, Math.max(4.5, 7 / ed.viewport.zoom));
      if (h !== hover) setHover(h);
    }
    if (!d) return;
    switch (d.kind) {
      case 'pan':
        ed.set({ viewport: { ...ed.viewport, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy } });
        break;
      case 'move': {
        const dx = world.x - d.start.x;
        const dy = world.y - d.start.y;
        if (!d.moved && Math.hypot(dx, dy) * ed.viewport.zoom < DRAG_THRESHOLD) return;
        if (!d.moved) setDragging(true);
        d.moved = true;
        const anchorInst = circuit.components.find((c) => c.id === d.anchor);
        const anchorDef = anchorInst && lookup(anchorInst.type);
        const o = d.orig.get(d.anchor)!;
        let cx = 0;
        let cy = 0;
        if (anchorInst && anchorDef && ed.snap) {
          const s = snapComponentPosition(anchorInst, anchorDef, o.x + dx, o.y + dy);
          cx = s.x - (o.x + dx);
          cy = s.y - (o.y + dy);
        }
        const mx = dx + cx;
        const my = dy + cy;
        useProject.getState().edit((doc) => {
          for (const inst of doc.components) {
            const p = d.orig.get(inst.id);
            if (p) {
              inst.x = p.x + mx;
              inst.y = p.y + my;
            }
          }
          for (const w of doc.wires) {
            const pts = d.wires.get(w.id);
            if (pts) w.points = pts.map((p) => ({ x: p.x + mx, y: p.y + my }));
          }
        });
        break;
      }
      case 'marquee': {
        const x = Math.min(d.start.x, world.x);
        const y = Math.min(d.start.y, world.y);
        const w = Math.abs(world.x - d.start.x);
        const h = Math.abs(world.y - d.start.y);
        setMarquee({ x, y, w, h, crossing: world.x < d.start.x });
        break;
      }
      case 'handle':
        useProject.getState().edit((doc) => {
          const w = doc.wires.find((x) => x.id === d.wireId);
          if (w && w.points[d.index]) w.points[d.index] = snapPt(world);
        });
        break;
      case 'interact':
        if (d.mode === 'slider' && d.prop) {
          const v = Math.max(0, Math.min(1, d.v0 + (e.clientX - d.sx - (e.clientY - d.sy)) / 160));
          sendInput(d.id, d.input, v);
          const prop = d.prop;
          useProject.getState().edit((doc) => {
            const inst = doc.components.find((c) => c.id === d.id);
            if (inst) inst.props[prop] = Math.round(v * 1000) / 1000;
          });
        }
        break;
      case 'pin':
        if (!d.dragging && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > DRAG_THRESHOLD) {
          d.dragging = true;
          ed.set({ wiring: { from: d.pin.ref, points: [] } });
        }
        break;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d) return;
    const ed = useEditor.getState();
    const world = toWorld(e.clientX, e.clientY);
    switch (d.kind) {
      case 'move':
      case 'handle':
        useProject.getState().end();
        break;
      case 'marquee': {
        setMarquee(null);
        const x1 = Math.min(d.start.x, world.x);
        const y1 = Math.min(d.start.y, world.y);
        const rect = { x: x1, y: y1, width: Math.abs(world.x - d.start.x), height: Math.abs(world.y - d.start.y) };
        if (rect.width * ed.viewport.zoom < 3 && rect.height * ed.viewport.zoom < 3) break;
        const hit = marqueeSelection(circuit, rect, world.x < d.start.x);
        ed.select([...new Set([...d.base, ...hit.components])], [...new Set([...d.baseWires, ...hit.wires])]);
        break;
      }
      case 'interact':
        if (d.mode === 'momentary') sendInput(d.id, d.input, false);
        else useProject.getState().end();
        break;
      case 'wire-end': {
        const h = hitPin(index, world, Math.max(4.5, 7 / ed.viewport.zoom));
        const w = circuit.wires.find((x) => x.id === d.wireId);
        const other = w && (d.end === 'from' ? w.to : w.from);
        if (h && w && other && !(h.ref.componentId === other.componentId && h.ref.pinId === other.pinId)) {
          useProject.getState().edit((doc) => {
            const target = doc.wires.find((x) => x.id === d.wireId);
            if (target) target[d.end] = { ...h.ref };
          });
        }
        useProject.getState().end();
        break;
      }
      case 'pin': {
        if (!d.dragging) {
          // Click on a pin starts a wire (click-click mode).
          ed.set({ wiring: { from: d.pin.ref, points: [] } });
        } else {
          const h = hitPin(index, world, Math.max(4.5, 7 / ed.viewport.zoom));
          if (h && !(h.ref.componentId === d.pin.ref.componentId && h.ref.pinId === d.pin.ref.pinId)) finishWire(h);
        }
        break;
      }
    }
  };

  // Records what was right-clicked; the context menu (a portal) then opens at the pointer.
  const onContextMenu = (e: React.MouseEvent) => {
    const ed = useEditor.getState();
    if (ed.wiring || ed.tool !== 'select') {
      // Right-click cancels wiring/probing instead of opening the menu.
      e.preventDefault();
      ed.set({ wiring: null, tool: 'select' });
      return;
    }
    const target = e.target as Element;
    if (target.closest('.zoom-ctl, .canvas-hint .btns')) {
      e.preventDefault();
      return;
    }
    const wireId = target.closest('[data-wire]')?.getAttribute('data-wire');
    const compId = target.closest('[data-comp]')?.getAttribute('data-comp');
    if (wireId) {
      if (!ed.selectedWires.includes(wireId)) ed.select([], [wireId]);
      ed.set({ contextMenu: { kind: 'wire', id: wireId } });
    } else if (compId) {
      if (!ed.selectedComponents.includes(compId)) ed.select([compId]);
      ed.set({ contextMenu: { kind: 'component', id: compId } });
    } else {
      ed.set({ contextMenu: { kind: 'canvas', world: toWorld(e.clientX, e.clientY) } });
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const target = e.target as Element;
    const wireId = target.closest('[data-wire]')?.getAttribute('data-wire');
    const world = toWorld(e.clientX, e.clientY);
    if (wireId && !useEditor.getState().wiring) {
      const w = circuit.wires.find((x) => x.id === wireId)!;
      const pts = wirePolyline(circuit, w)!;
      const seg = nearestSegment(pts, world);
      const insertAt = w.points.filter((wp) => pts.findIndex((q) => q.x === wp.x && q.y === wp.y) <= seg).length;
      useProject.getState().edit((d) => {
        d.wires.find((x) => x.id === wireId)!.points.splice(insertAt, 0, snapPt(world));
      });
    } else if (target.closest('[data-comp]')) {
      useEditor.getState().setPrefs({ showInspector: true });
    } else if (!target.closest('button, .simctl-chip, .simctl-key, .canvas-hint') && !useEditor.getState().wiring) {
      // Double-click on empty canvas: add a part right here.
      useEditor.getState().set({ palette: { mode: 'add', at: world } });
    }
  };

  // Wheel: zoom at cursor, or turn a knob while simulating.
  useEffect(() => {
    const el = ref.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const ed = useEditor.getState();
      if (useSim.getState().state !== 'stopped') {
        const compId = (e.target as Element).closest('[data-comp]')?.getAttribute('data-comp');
        const inst = compId ? useProject.getState().project.circuit.components.find((c) => c.id === compId) : undefined;
        const def = inst && lookup(inst.type);
        if (inst && def?.interaction?.kind === 'slider') {
          const prop = def.interaction.property ?? 'position';
          const v = Math.max(0, Math.min(1, Number(inst.props[prop] ?? 0.5) - Math.sign(e.deltaY) * 0.02));
          sendInput(inst.id, def.interaction.input ?? 'value', v);
          // A run of wheel ticks is one undo step.
          coalescedEdit((d) => {
            const i = d.components.find((c) => c.id === inst.id);
            if (i) i.props[prop] = Math.round(v * 1000) / 1000;
          });
          return;
        }
      }
      const r = el.getBoundingClientRect();
      const cx = e.clientX - r.left;
      const cy = e.clientY - r.top;
      const { x, y, zoom } = ed.viewport;
      if (e.shiftKey && !e.ctrlKey) {
        ed.set({ viewport: { zoom, x: x - e.deltaY, y } });
        return;
      }
      const nz = Math.max(0.1, Math.min(6, zoom * Math.pow(1.0015, -e.deltaY)));
      ed.set({ viewport: { zoom: nz, x: cx - (cx - x) * (nz / zoom), y: cy - (cy - y) * (nz / zoom) } });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement).closest('input,textarea,.monaco-editor')) space.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Drag & drop from the component library.
  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/x-evlab-component')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const type = useEditor.getState().dragType;
    const def = type ? registry.get(type) : undefined;
    if (!def) return;
    // Same placement as the drop: centred on the cursor, first pin on the grid.
    const w = toWorld(e.clientX, e.clientY);
    const probe = { id: 'ghost', type: def.type, x: 0, y: 0, rotation: 0 as const, label: '', props: {} };
    const p = snapComponentPosition(probe, def, w.x - def.size.width / 2, w.y - def.size.height / 2);
    if (!ghost || ghost.type !== def.type || ghost.x !== p.x || ghost.y !== p.y) setGhost({ type: def.type, x: p.x, y: p.y });
  };
  const onDrop = (e: React.DragEvent) => {
    setGhost(null);
    const type = e.dataTransfer.getData('application/x-evlab-component');
    useEditor.getState().set({ dragType: null });
    if (!type) return;
    e.preventDefault();
    const w = toWorld(e.clientX, e.clientY);
    addComponentAt(type, w.x, w.y);
    ref.current?.focus();
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (!ref.current?.contains(e.relatedTarget as Node)) setGhost(null);
  };

  // ------------------------------------------------------------ overlay
  const hoverNet = hover ? netlist.netOf(hover.ref) : undefined;
  const netPinPositions = useCallback(
    (nets: Iterable<number>, skip?: PinRef) => {
      const out: Point[] = [];
      for (const n of nets) {
        const net = netlist.nets[n];
        if (!net || net.pins.length > 400) continue;
        for (const p of net.pins) {
          if (skip && p.componentId === skip.componentId && p.pinId === skip.pinId) continue;
          const ip = index.byKey.get(`${p.componentId}:${p.pinId}`);
          if (ip) out.push({ x: ip.x, y: ip.y });
        }
      }
      return out;
    },
    [netlist, index],
  );
  const netPins = useMemo(() => (hoverNet === undefined ? [] : netPinPositions([hoverNet], hover?.ref)), [hoverNet, netPinPositions, hover]);
  // Nets of the selected wires (or of the pin a wire is being drawn from) stay highlighted.
  const stickyNetPins = useMemo(() => {
    const nets = new Set<number>();
    for (const id of selectedWires) {
      const w = circuit.wires.find((x) => x.id === id);
      const n = w && netlist.netOf(w.from);
      if (n !== undefined && n !== null) nets.add(n);
    }
    if (wiring) {
      const n = netlist.netOf(wiring.from);
      if (n !== undefined) nets.add(n);
    }
    return nets.size ? netPinPositions(nets) : [];
  }, [selectedWires, wiring, circuit.wires, netlist, netPinPositions]);

  // Logic levels on IC and MCU pins (View › Show Logic Levels).
  const showLevels = useEditor((s) => s.showLogicLevels) && simulating;
  const levels = useMemo(() => {
    if (!showLevels) return [];
    const out: Overlay['levels'] = [];
    for (const ip of index.pins) {
      const k = ip.pin.kind;
      if (k !== 'io' && k !== 'analog' && k !== 'input' && k !== 'output') continue;
      if (!ip.def.mcu && ip.def.category !== 'Integrated Circuits') continue;
      const net = netlist.netOf(ip.ref);
      if (net === undefined || netlist.nets[net].activePinCount < 2) continue;
      const vcc = ip.def.mcu?.vcc ?? 5;
      const v = voltages[net];
      const level = !driven[net] ? 'float' : v >= 0.6 * vcc ? 'high' : v <= 0.3 * vcc ? 'low' : 'mid';
      out.push({ x: ip.x, y: ip.y, level });
    }
    return out;
  }, [showLevels, index, netlist, voltages, driven]);

  // One voltage badge per net, on the middle of its longest wire (View › Show Voltages).
  const showVoltages = useEditor((s) => s.showVoltages) && simulating;
  const voltageBadges = useMemo(() => {
    if (!showVoltages || !voltages.length) return [];
    const best = new Map<number, { len: number; at: Point }>();
    for (const w of circuit.wires) {
      const net = netlist.netOf(w.from);
      const pts = net === undefined ? null : wirePolyline(circuit, w);
      if (net === undefined || !pts) continue;
      const len = polylineLength(pts);
      if ((best.get(net)?.len ?? -1) < len) best.set(net, { len, at: pointAlong(pts, len / 2) });
    }
    return [...best].map(([net, { at }]) => {
      const v = voltages[net];
      const float = !driven[net];
      return { x: at.x, y: at.y, float, text: float ? 'float' : `${Math.abs(v) < 0.005 ? '0' : v.toFixed(2)} V` };
    });
  }, [showVoltages, circuit, netlist, voltages, driven]);

  // Where legs will plug in: the part being dropped from the library, or the parts being moved.
  const ghostInst = useMemo(
    () => (ghost ? { id: '__ghost', type: ghost.type, x: ghost.x, y: ghost.y, rotation: 0 as const, label: '', props: defaultProps(registry.get(ghost.type)!) } : null),
    [ghost],
  );
  const moveDrag = drag.current?.kind === 'move' && drag.current.moved ? drag.current : null;
  const insertion = useMemo(() => {
    if (ghostInst) {
      const def = registry.get(ghostInst.type)!;
      const pts = def.pins.filter((p) => p.kind !== 'socket').map((p) => pinWorld(ghostInst, def, p));
      return insertionPreview(circuit, netlist, pts, new Set());
    }
    if (moveDrag) {
      const moving = new Set(moveDrag.orig.keys());
      const pts = index.pins.filter((ip) => moving.has(ip.ref.componentId) && ip.pin.kind !== 'socket').map((ip) => ({ x: ip.x, y: ip.y }));
      return insertionPreview(circuit, netlist, pts, moving);
    }
    return null;
  }, [ghostInst, moveDrag, circuit, netlist, index]);

  // Re-attaching a wire end: dashed line from the fixed end to the cursor.
  const endDrag = drag.current?.kind === 'wire-end' ? drag.current : null;
  let endDragOverlay: Overlay['endDrag'] = null;
  if (endDrag) {
    const w = circuit.wires.find((x) => x.id === endDrag.wireId);
    const fixed = w && pinPosition(circuit, endDrag.end === 'from' ? w.to : w.from);
    if (w && fixed) endDragOverlay = { from: fixed, to: hover ? { x: hover.x, y: hover.y } : cursor, color: w.color };
  }

  const draftFrom = wiring ? pinPosition(circuit, wiring.from) : null;
  const overlay: Overlay = {
    draft: wiring && draftFrom
      ? {
          points: [draftFrom, ...wiring.points],
          cursor: hover ? { x: hover.x, y: hover.y } : snapOn ? { x: snap(cursor.x, GRID / 2), y: snap(cursor.y, GRID / 2) } : cursor,
          color: useEditor.getState().wireColor,
        }
      : null,
    marquee,
    hoverPin: hover && !dragging ? { x: hover.x, y: hover.y } : wiring && hover ? { x: hover.x, y: hover.y } : null,
    netPins: dragging ? [] : netPins,
    stickyNetPins: dragging ? [] : stickyNetPins,
    insertion,
    endDrag: endDragOverlay,
    probes: probeMarkers(circuit, instruments),
    levels,
    voltages: voltageBadges,
  };

  // Pin tooltip with live values.
  let tip: React.ReactNode = null;
  if (hover && !dragging && !marquee) {
    const net = hoverNet !== undefined ? netlist.nets[hoverNet] : undefined;
    const v = hoverNet !== undefined && driven[hoverNet] ? voltages[hoverNet] : undefined;
    const mcu = mcus.find((m) => m.componentId === hover.ref.componentId);
    const drive = mcu?.pins[hover.ref.pinId];
    const r = ref.current?.getBoundingClientRect();
    const sx = (r?.left ?? 0) + hover.x * viewport.zoom + viewport.x;
    const sy = (r?.top ?? 0) + hover.y * viewport.zoom + viewport.y;
    const pad = 6 * Math.max(1, viewport.zoom);
    tip = (
      <AnchoredPopover anchor={{ x: sx - pad, y: sy - pad, width: pad * 2, height: pad * 2 }} side="top" align="start" sideOffset={6} className="pin-tip" passive>
        <b>
          {hover.inst.label}.{hover.pin.label ?? hover.pin.id}
        </b>
        {hover.pin.description ? ` — ${hover.pin.description}` : ''}
        {net && <span style={{ color: 'var(--text-3)' }}> · net {net.name}</span>}
        {simulating && (
          <span className="v">
            {' '}
            · {v !== undefined ? formatEngineering(v, 'V') : 'floating'}
            {drive ? ` (${drive})` : ''}
          </span>
        )}
      </AnchoredPopover>
    );
  }

  // Floating wire toolbar anchored above the selected wires.
  const wireBarVisible = useWireToolbarVisible() && !dragging && !marquee;
  let wireBar: React.ReactNode = null;
  if (wireBarVisible && ref.current) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const id of selectedWires) {
      const w = circuit.wires.find((x) => x.id === id);
      for (const p of (w && wirePolyline(circuit, w)) ?? []) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
    }
    if (Number.isFinite(minX)) {
      const r = ref.current.getBoundingClientRect();
      const toScreen = (x: number, y: number) => ({ x: r.left + x * viewport.zoom + viewport.x, y: r.top + y * viewport.zoom + viewport.y });
      const a = toScreen(minX, minY);
      const b = toScreen(maxX, maxY);
      // Keep the anchor inside the visible canvas so the bar never floats over other panels.
      const x1 = Math.max(r.left, Math.min(r.right, a.x));
      const x2 = Math.max(r.left, Math.min(r.right, b.x));
      const y1 = Math.max(r.top, Math.min(r.bottom, a.y));
      const y2 = Math.max(r.top, Math.min(r.bottom, b.y));
      wireBar = <WireToolbar anchor={{ x: x1, y: y1, width: x2 - x1, height: y2 - y1 }} ids={selectedWires} />;
    }
  }

  const labels = circuit.components.map((c) => {
    const def = lookup(c.type);
    if (!def || def.visual.kind === 'builtin' && (def.visual.renderer === 'junction' || def.visual.renderer === 'net-label')) return null;
    if (def.pins.length && def.pins.every((p) => p.kind === 'socket')) return null;
    const b = componentBounds(c, def);
    const p = problems.get(c.id);
    return (
      <div key={c.id} className="comp-label" style={{ left: b.x + b.width / 2, top: b.y }}>
        {p && (
          <Tip content={<span style={{ whiteSpace: 'pre-line' }}>{p.messages.join('\n')}</span>} side="top" direct>
            <span
              className={`comp-badge ${p.severity}`}
              role="button"
              aria-label={p.messages.join('; ')}
              onPointerDown={(e) => {
                e.stopPropagation();
                useEditor.getState().select([c.id]);
                useEditor.getState().set({ dockTab: 'problems' });
                useEditor.getState().setPrefs({ showDock: true });
              }}
            >
              !
            </span>
          </Tip>
        )}
        {c.label}
        {def.simulation.support === 'visual-only' &&
          (simulating ? <span className="vo-tag">not simulated</span> : <span className="vo"> (visual)</span>)}
      </div>
    );
  });

  const gridSize = GRID * viewport.zoom * (viewport.zoom < 0.5 ? 5 : 1);
  const canvas = (
    <div
      ref={ref}
      tabIndex={0}
      className={[
        'workspace',
        showGrid && 'grid',
        dragging && drag.current?.kind === 'pan' && 'panning',
        dragging && drag.current?.kind === 'move' && 'moving',
        (tool !== 'select' || wiring) && 'probe',
        hover && !dragging && 'on-pin',
        simulating && `sim-${simState}`,
      ]
        .filter(Boolean)
        .join(' ')}
      style={showGrid ? { backgroundSize: `${gridSize}px ${gridSize}px`, backgroundPosition: `${viewport.x}px ${viewport.y}px` } : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => setHover(null)}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="world" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}>
        {renderOrder.map((c) => {
          const def = lookup(c.type);
          return def ? (
            <ComponentView
              key={c.id}
              inst={c}
              def={def}
              selected={selectedSet.has(c.id)}
              inert={simulating && def.simulation.support === 'visual-only'}
              problem={problems.get(c.id)?.severity}
            />
          ) : null;
        })}
        {labels}
        {ghostInst && (
          <div className="ghost">
            <ComponentView inst={ghostInst} def={registry.get(ghostInst.type)!} selected={false} />
          </div>
        )}
        <WireLayer circuit={circuit} selectedWires={selectedWires} zoom={viewport.zoom} overlay={overlay} />
        <SimControlsLayer components={circuit.components} simulating={simulating} selected={selectedSet} zoom={viewport.zoom} toWorld={toWorld} />
      </div>
      {!circuit.components.length && (
        <div className="canvas-hint">
          <h3>Start building your circuit</h3>
          Drag parts from the library on the left onto this canvas. Click a pin to start a wire, click another pin to finish it.
          Legs dropped onto breadboard holes connect automatically.
          <div className="btns">
            <button className="btn primary" onClick={() => loadExample('blink')}>
              <Icon name="sparkles" /> Load the Blink example
            </button>
            <button className="btn" onClick={() => useEditor.getState().set({ dialog: 'examples' })}>
              <Icon name="book" /> Browse examples
            </button>
          </div>
          <RecentProjects />
        </div>
      )}
      {/* Running/paused: a slim frame around the canvas (details in the status bar). */}
      {simulating && <div className={`sim-frame ${simState}`} />}
      {wiring && (
        <div className="sim-banner">
          Drawing wire — click a pin to finish, click the canvas to add a bend, Esc or right-click to cancel
        </div>
      )}
      <div className="zoom-ctl" onPointerDown={(e) => e.stopPropagation()}>
        <Tip content="Zoom out" shortcut="−" side="top">
          <button className="icon-btn" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.2)}>
            <Icon name="zoom-out" />
          </button>
        </Tip>
        <DropdownMenu
          side="top"
          align="center"
          trigger={
            <button className="zoom-level" aria-label="Zoom presets">
              {Math.round(viewport.zoom * 100)}%
            </button>
          }
        >
          <ZoomItems />
          <MenuSeparator />
          <MenuItem label="Fit to window" icon="fit" shortcut="F" onSelect={fitView} />
          <MenuItem label="Zoom to selection" icon="zoom-in" shortcut="Shift+F" onSelect={zoomToSelection} disabled={!selectedComponents.length} />
        </DropdownMenu>
        <Tip content="Zoom in" shortcut="+" side="top">
          <button className="icon-btn" aria-label="Zoom in" onClick={() => zoomBy(1.2)}>
            <Icon name="zoom-in" />
          </button>
        </Tip>
        <Tip content="Fit to view" shortcut="F" side="top">
          <button className="icon-btn" aria-label="Fit to view" onClick={fitView}>
            <Icon name="fit" />
          </button>
        </Tip>
      </div>
    </div>
  );
  return (
    <>
      <ContextMenu trigger={canvas} onOpenChange={(open) => !open && useEditor.getState().set({ contextMenu: null })}>
        <CanvasMenuItems />
      </ContextMenu>
      {tip}
      {wireBar}
    </>
  );
}
