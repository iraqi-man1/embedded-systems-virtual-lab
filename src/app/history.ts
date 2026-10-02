/**
 * Version history: a copy of the project each time it is run or saved (the
 * last 30 per project), kept by the app (IndexedDB), so an earlier version
 * can be looked at and brought back (File › Version History).
 */
import { parseProject, serializeProject, type Project } from '../core/project/schema';
import { useEditor } from '../state/editor';
import { useProject } from '../state/project';
import { useSim } from '../state/sim';

export type SnapshotReason = 'run' | 'save' | 'restore';

export interface Snapshot {
  id?: number;
  /** The project it belongs to (when it was created: stays the same through renames and saves). */
  key: string;
  at: number;
  reason: SnapshotReason;
  name: string;
  parts: number;
  wires: number;
  /** Serialized project. */
  text: string;
}

/** Where snapshots are kept (IndexedDB in the app; memory where that is missing, as in tests). */
export interface SnapshotStore {
  add(s: Snapshot): Promise<void>;
  list(key: string): Promise<Snapshot[]>;
  remove(ids: number[]): Promise<void>;
}

export const KEEP = 30;

export const projectKey = (p: Project) => p.meta.created || p.meta.name;

/** Projects compare without their time stamps (saving updates `modified`). */
const comparable = (text: string) => text.replace(/"modified":\s*"[^"]*"/, '');

/** Adds a copy unless it equals the newest one; keeps the newest `KEEP`. Returns whether one was added. */
export async function snapshot(store: SnapshotStore, project: Project, reason: SnapshotReason, now = Date.now()): Promise<boolean> {
  const key = projectKey(project);
  const text = serializeProject(project);
  const list = await store.list(key);
  if (list[0] && comparable(list[0].text) === comparable(text)) return false;
  await store.add({ key, at: now, reason, name: project.meta.name, parts: project.circuit.components.length, wires: project.circuit.wires.length, text });
  const old = list.slice(KEEP - 1).flatMap((s) => (s.id === undefined ? [] : [s.id]));
  if (old.length) await store.remove(old);
  return true;
}

export function memoryStore(): SnapshotStore {
  let seq = 0;
  const all: Snapshot[] = [];
  return {
    async add(s) {
      all.push({ ...s, id: ++seq });
    },
    async list(key) {
      return all.filter((s) => s.key === key).sort((a, b) => b.at - a.at || (b.id ?? 0) - (a.id ?? 0));
    },
    async remove(ids) {
      for (let i = all.length - 1; i >= 0; i--) if (ids.includes(all[i].id!)) all.splice(i, 1);
    },
  };
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export function indexedDbStore(name = 'evlab-history'): SnapshotStore {
  let db: Promise<IDBDatabase> | null = null;
  const open = () =>
    (db ??= new Promise((resolve, reject) => {
      const r = indexedDB.open(name, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('snapshots', { keyPath: 'id', autoIncrement: true }).createIndex('key', 'key');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    }));
  const tx = async (mode: IDBTransactionMode) => (await open()).transaction('snapshots', mode).objectStore('snapshots');
  return {
    async add(s) {
      await request((await tx('readwrite')).add(s));
    },
    async list(key) {
      const rows = (await request((await tx('readonly')).index('key').getAll(key))) as Snapshot[];
      return rows.sort((a, b) => b.at - a.at || (b.id ?? 0) - (a.id ?? 0));
    },
    async remove(ids) {
      const store = await tx('readwrite');
      await Promise.all(ids.map((id) => request(store.delete(id))));
    },
  };
}

let store: SnapshotStore | null = null;
export const historyStore = () => (store ??= typeof indexedDB !== 'undefined' ? indexedDbStore() : memoryStore());

/** The current project, with its view, as it would be saved. */
const current = () => ({ ...useProject.getState().project, view: useEditor.getState().viewport });

export function snapshotNow(reason: SnapshotReason) {
  void snapshot(historyStore(), current(), reason).catch((e) => console.warn('Version history: could not keep a copy', e));
}

/** Keeps a copy when the simulation starts and when the project is saved. Returns the cleanup. */
export function installHistory(): () => void {
  const offSim = useSim.subscribe((s, prev) => {
    if (prev.state === 'stopped' && s.state !== 'stopped') snapshotNow('run');
  });
  const offSave = useProject.subscribe((s, prev) => {
    if (prev.dirty && !s.dirty && s.filePath && s.project === prev.project) snapshotNow('save');
  });
  return () => {
    offSim();
    offSave();
  };
}

/** Brings an earlier version back (the version being replaced is kept first, so this can be undone the same way). */
export async function restoreSnapshot(s: Snapshot) {
  await snapshot(historyStore(), current(), 'restore');
  const p = parseProject(s.text);
  const { filePath } = useProject.getState();
  useProject.getState().load(p, filePath);
  useProject.setState({ dirty: true });
  useEditor.getState().set({ viewport: p.view, selectedComponents: [], selectedWires: [], selectedAnnotations: [] });
}
