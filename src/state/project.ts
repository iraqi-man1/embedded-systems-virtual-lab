/**
 * Project store: the open document, its file path, dirty flag and undo/redo
 * history of the circuit. Mutations go through `edit()` which uses Immer;
 * continuous gestures (dragging) are grouped with `begin()`/`end()`.
 */
import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import { nanoid } from 'nanoid';
import type { CircuitDocument, ComponentInstance, PropValue, Wire } from '../core/model/circuit';
import type { ComponentDefinition } from '../core/model/component';
import { newProject, type Project, type SourceFile } from '../core/project/schema';
import { defaultProps } from '../core/sim/setup';
import { snapComponentPosition } from '../core/circuit/geometry';

const HISTORY_LIMIT = 200;

interface ProjectState {
  project: Project;
  filePath: string | null;
  dirty: boolean;
  /** Increments on every circuit change (cheap change detection). */
  revision: number;
  past: CircuitDocument[];
  future: CircuitDocument[];
  txBase: CircuitDocument | null;

  load(project: Project, path: string | null): void;
  markSaved(path: string): void;
  /** Mutates the circuit. Creates an undo step unless inside a transaction. */
  edit(fn: (c: Draft<CircuitDocument>) => void): void;
  begin(): void;
  end(): void;
  cancel(): void;
  undo(): void;
  redo(): void;
  updateProject(fn: (p: Draft<Project>) => void, markDirty?: boolean): void;
  setFile(name: string, content: string): void;
  addFile(name: string): void;
  removeFile(name: string): void;
  /** Renames a source file (the main sketch keeps its name). */
  renameFile(from: string, to: string): void;
}

export const useProject = create<ProjectState>((set, get) => ({
  project: newProject(),
  filePath: null,
  dirty: false,
  revision: 0,
  past: [],
  future: [],
  txBase: null,

  load(project, path) {
    set({ project, filePath: path, dirty: false, past: [], future: [], txBase: null, revision: get().revision + 1 });
  },
  markSaved(path) {
    set({ filePath: path, dirty: false });
  },
  edit(fn) {
    const { project, txBase, past } = get();
    const next = produce(project.circuit, fn);
    if (next === project.circuit) return;
    set({
      project: { ...project, circuit: next },
      dirty: true,
      revision: get().revision + 1,
      ...(txBase ? {} : { past: [...past, project.circuit].slice(-HISTORY_LIMIT), future: [] }),
    });
  },
  begin() {
    if (!get().txBase) set({ txBase: get().project.circuit });
  },
  end() {
    const { txBase, project, past } = get();
    if (!txBase) return;
    if (txBase !== project.circuit) set({ past: [...past, txBase].slice(-HISTORY_LIMIT), future: [], txBase: null });
    else set({ txBase: null });
  },
  cancel() {
    const { txBase, project } = get();
    if (!txBase) return;
    set({ project: { ...project, circuit: txBase }, txBase: null, revision: get().revision + 1 });
  },
  undo() {
    const { past, future, project } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({
      project: { ...project, circuit: prev },
      past: past.slice(0, -1),
      future: [project.circuit, ...future],
      dirty: true,
      revision: get().revision + 1,
    });
  },
  redo() {
    const { past, future, project } = get();
    if (!future.length) return;
    set({
      project: { ...project, circuit: future[0] },
      past: [...past, project.circuit],
      future: future.slice(1),
      dirty: true,
      revision: get().revision + 1,
    });
  },
  updateProject(fn, markDirty = true) {
    set({ project: produce(get().project, fn), ...(markDirty ? { dirty: true } : {}) });
  },
  setFile(name, content) {
    get().updateProject((p) => {
      const f = p.firmware.files.find((x) => x.name === name);
      if (f) f.content = content;
    });
  },
  addFile(name) {
    get().updateProject((p) => {
      if (!p.firmware.files.some((f) => f.name === name)) p.firmware.files.push({ name, content: '' } as SourceFile);
    });
  },
  removeFile(name) {
    get().updateProject((p) => {
      p.firmware.files = p.firmware.files.filter((f) => f.name !== name || f.name === 'sketch.ino');
    });
  },
  renameFile(from, to) {
    get().updateProject((p) => {
      if (from === 'sketch.ino' || from === to || p.firmware.files.some((f) => f.name === to)) return;
      const f = p.firmware.files.find((x) => x.name === from);
      if (f) f.name = to;
    });
  },
}));

// ------------------------------------------------- coalesced interactions
let coalesce: ReturnType<typeof setTimeout> | null = null;

/**
 * Edit from a continuous interaction without discrete start/end (mouse-wheel
 * knob turns, keyboard slider steps): edits arriving within `ms` of each other
 * form one undo step.
 */
export function coalescedEdit(fn: (c: Draft<CircuitDocument>) => void, ms = 500) {
  const p = useProject.getState();
  if (!coalesce) {
    if (p.txBase) {
      // Already inside another gesture (e.g. a drag): it owns the undo step.
      p.edit(fn);
      return;
    }
    p.begin();
  } else clearTimeout(coalesce);
  coalesce = setTimeout(flushCoalesced, ms);
  p.edit(fn);
}

/** Closes a pending coalesced undo step now (before undo/redo). */
export function flushCoalesced() {
  if (!coalesce) return;
  clearTimeout(coalesce);
  coalesce = null;
  useProject.getState().end();
}

// ---------------------------------------------------------------- helpers

/** Next free reference designator for a prefix (R1, R2, ...). */
export function nextLabel(circuit: CircuitDocument, prefix: string): string {
  let max = 0;
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`);
  for (const c of circuit.components) {
    const m = re.exec(c.label);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${max + 1}`;
}

export function createInstance(def: ComponentDefinition, x: number, y: number, circuit: CircuitDocument): ComponentInstance {
  const inst: ComponentInstance = {
    id: nanoid(10),
    type: def.type,
    x,
    y,
    rotation: 0,
    label: nextLabel(circuit, def.designator),
    props: defaultProps(def),
  };
  const p = snapComponentPosition(inst, def, x, y);
  inst.x = p.x;
  inst.y = p.y;
  return inst;
}

export function createWire(from: Wire['from'], to: Wire['to'], points: Wire['points'], color: string): Wire {
  return { id: nanoid(10), from, to, points, color };
}

export function setProp(id: string, key: string, value: PropValue) {
  useProject.getState().edit((c) => {
    const inst = c.components.find((x) => x.id === id);
    if (inst) inst.props[key] = value;
  });
}
