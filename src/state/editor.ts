/** Editor/UI state: selection, viewport, tools, panels, preferences. */
import { create } from 'zustand';
import type { CircuitDocument, PinRef, Point } from '../core/model/circuit';

export type Tool = 'select' | 'probe-logic' | 'probe-scope' | 'probe-meter-red' | 'probe-meter-black';
export type DockTab = 'serial' | 'plotter' | 'scope' | 'logic' | 'meter' | 'mcu' | 'problems' | 'output';
export type Theme = 'light' | 'dark';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

/** What the canvas context menu was opened on (the menu positions itself at the pointer). */
export type ContextMenuState = { kind: 'component'; id: string } | { kind: 'wire'; id: string } | { kind: 'canvas'; world: { x: number; y: number } };

/** A project file opened or saved recently (File › Open Recent). */
export interface RecentProject {
  path: string;
  name: string;
  /** ISO timestamp of the last open/save. */
  at: string;
}

const MAX_RECENT_PROJECTS = 10;

interface Prefs {
  theme: Theme;
  favorites: string[];
  recent: string[];
  recentProjects: RecentProject[];
  showGrid: boolean;
  snap: boolean;
  libraryWidth: number;
  /** Height of the Properties panel under the component library. */
  inspectorHeight: number;
  codeWidth: number;
  dockHeight: number;
  showLibrary: boolean;
  showInspector: boolean;
  showCode: boolean;
  showDock: boolean;
  wireColor: string;
  sound: boolean;
  /** Coloured dots on IC/MCU pins while simulating (high/low/floating). */
  showLogicLevels: boolean;
  /** Voltage badges on wires while simulating. */
  showVoltages: boolean;
  /** Serial monitor: clear the output when a simulation starts. */
  serialClearOnRun: boolean;
  /** Serial monitor: prefix lines with the simulation time. */
  serialTimestamps: boolean;
  /** Serial monitor: text or hex dump. */
  serialView: 'text' | 'hex';
  /** Collapsed library categories ('__fav', '__recent' for the pinned sections). */
  libraryCollapsed: string[];
  /** Library shows simulated parts only. */
  librarySimOnly: boolean;
  /** Dragging with the right mouse button pans the canvas (a click still opens the menu). */
  rightDragPan: boolean;
}

const PREFS_KEY = 'evlab.prefs.v1';

function loadPrefs(): Prefs {
  const dark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
  const defaults: Prefs = {
    theme: dark ? 'dark' : 'light',
    favorites: ['evlab.arduino-uno', 'evlab.breadboard-half', 'evlab.resistor', 'evlab.led', 'evlab.pushbutton', 'evlab.potentiometer'],
    recent: [],
    recentProjects: [],
    showGrid: true,
    snap: true,
    libraryWidth: 280,
    inspectorHeight: 340,
    codeWidth: 460,
    dockHeight: 240,
    showLibrary: true,
    showInspector: true,
    showCode: true,
    showDock: true,
    wireColor: '#2ecc71',
    sound: true,
    showLogicLevels: false,
    showVoltages: false,
    serialClearOnRun: true,
    serialTimestamps: false,
    serialView: 'text',
    libraryCollapsed: ['Communication', 'Integrated Circuits', 'Actuators', 'Sensors'],
    librarySimOnly: false,
    rightDragPan: true,
  };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch {
    return defaults;
  }
}

interface EditorState extends Prefs {
  selectedComponents: string[];
  selectedWires: string[];
  viewport: { x: number; y: number; zoom: number };
  hoverPin: PinRef | null;
  /** Wire being drawn: start pin and waypoints placed so far. */
  wiring: { from: PinRef; points: Point[] } | null;
  cursor: { x: number; y: number };
  tool: Tool;
  dockTab: DockTab;
  clipboard: CircuitDocument | null;
  contextMenu: ContextMenuState | null;
  dialog: null | 'examples' | 'toolchain' | 'shortcuts' | 'about' | 'project';
  toasts: Toast[];
  /** Open command palette: run commands, or add a part (optionally at a canvas point). */
  palette: null | { mode: 'commands' | 'add'; at?: { x: number; y: number } };
  /** Component type being dragged from the library (drop preview). */
  dragType: string | null;
  /** Line to reveal in the code editor (set by the Problems panel). */
  revealLine: { file: string; line: number; nonce: number } | null;

  set(partial: Partial<EditorState>): void;
  setPrefs(partial: Partial<Prefs>): void;
  select(components: string[], wires?: string[]): void;
  clearSelection(): void;
  toggleFavorite(type: string): void;
  pushRecent(type: string): void;
  rememberProject(path: string, name: string): void;
  forgetProject(path?: string): void;
  notify(message: string, kind?: Toast['kind']): void;
  dismissToast(id: number): void;
}

let toastSeq = 0;

export const useEditor = create<EditorState>((set, get) => ({
  ...loadPrefs(),
  selectedComponents: [],
  selectedWires: [],
  viewport: { x: 80, y: 60, zoom: 1 },
  hoverPin: null,
  wiring: null,
  cursor: { x: 0, y: 0 },
  tool: 'select',
  dockTab: 'serial',
  clipboard: null,
  contextMenu: null,
  dialog: null,
  toasts: [],
  dragType: null,
  palette: null,
  revealLine: null,

  set: (partial) => set(partial),
  setPrefs(partial) {
    set(partial);
    const s = get();
    const prefs: Prefs = {
      theme: s.theme,
      favorites: s.favorites,
      recent: s.recent,
      recentProjects: s.recentProjects,
      showGrid: s.showGrid,
      snap: s.snap,
      libraryWidth: s.libraryWidth,
      inspectorHeight: s.inspectorHeight,
      codeWidth: s.codeWidth,
      dockHeight: s.dockHeight,
      showLibrary: s.showLibrary,
      showInspector: s.showInspector,
      showCode: s.showCode,
      showDock: s.showDock,
      wireColor: s.wireColor,
      sound: s.sound,
      showLogicLevels: s.showLogicLevels,
      showVoltages: s.showVoltages,
      serialClearOnRun: s.serialClearOnRun,
      serialTimestamps: s.serialTimestamps,
      serialView: s.serialView,
      libraryCollapsed: s.libraryCollapsed,
      librarySimOnly: s.librarySimOnly,
      rightDragPan: s.rightDragPan,
    };
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable: preferences stay in memory */
    }
  },
  select(components, wires = []) {
    set({ selectedComponents: components, selectedWires: wires });
  },
  clearSelection() {
    if (get().selectedComponents.length || get().selectedWires.length) set({ selectedComponents: [], selectedWires: [] });
  },
  toggleFavorite(type) {
    const f = get().favorites;
    get().setPrefs({ favorites: f.includes(type) ? f.filter((t) => t !== type) : [...f, type] });
  },
  pushRecent(type) {
    get().setPrefs({ recent: [type, ...get().recent.filter((t) => t !== type)].slice(0, 12) });
  },
  rememberProject(path, name) {
    const entry = { path, name, at: new Date().toISOString() };
    get().setPrefs({ recentProjects: [entry, ...get().recentProjects.filter((r) => r.path !== path)].slice(0, MAX_RECENT_PROJECTS) });
  },
  forgetProject(path) {
    get().setPrefs({ recentProjects: path ? get().recentProjects.filter((r) => r.path !== path) : [] });
  },
  notify(message, kind = 'info') {
    const id = ++toastSeq;
    set({ toasts: [...get().toasts, { id, kind, message }] });
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 8000 : 4000);
  },
  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));
