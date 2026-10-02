/** Editor/UI state: selection, viewport, tools, panels, preferences. */
import { create } from 'zustand';
import type { CircuitDocument, PinRef, Point, TextNote } from '../core/model/circuit';
import { detectLanguage, setLanguage, type Lang } from '../i18n';
import { resolveTheme, systemPrefersDark, type ThemeId, type ThemePref } from '../ui/themes';

export type Tool = 'select' | 'probe-logic' | 'probe-scope' | 'probe-meter-red' | 'probe-meter-black' | NoteTool;
/** Drawing a text note, an arrow or a frame on the canvas. */
export type NoteTool = 'text' | 'arrow' | 'rect';
export type DockTab = 'serial' | 'plotter' | 'scope' | 'logic' | 'meter' | 'mcu' | 'problems' | 'output';
export type Theme = ThemePref;

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

/** What the canvas context menu was opened on (the menu positions itself at the pointer). */
export type ContextMenuState = { kind: 'component'; id: string } | { kind: 'wire'; id: string } | { kind: 'annotation'; id: string } | { kind: 'canvas'; world: { x: number; y: number } };

/** A project file opened or saved recently (File › Open Recent). */
export interface RecentProject {
  path: string;
  name: string;
  /** ISO timestamp of the last open/save. */
  at: string;
}

const MAX_RECENT_PROJECTS = 10;

interface Prefs {
  /** Interface language (Arabic switches the layout to right-to-left). */
  language: Lang;
  /** Colour theme, or 'system' to follow the operating system. */
  theme: Theme;
  /** Last light and dark themes chosen (the quick light/dark toggle switches between them). */
  themeLight: ThemeId;
  themeDark: ThemeId;
  /** Code editor font size (px) and soft wrapping of long lines. */
  editorFontSize: number;
  editorWordWrap: boolean;
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
  /** Open on the start screen (recent projects, templates, examples). */
  showStartScreen: boolean;
  /** Resting the mouse on a part shows what it is and what it is for. */
  hoverCards: boolean;
  /** Overview of the whole circuit in the corner of the canvas (key M). */
  showMinimap: boolean;
  /** What the mouse wheel does: zoom (Shift scrolls sideways) or scroll (Ctrl zooms, for touchpads). */
  wheelAction: 'zoom' | 'scroll';
}

const PREFS_KEY = 'evlab.prefs.v1';

/** Preferences of a fresh installation. Every key here is persisted. */
export function defaultPrefs(): Prefs {
  return {
    language: detectLanguage(),
    theme: 'system',
    themeLight: 'light',
    themeDark: 'dark',
    editorFontSize: 13,
    editorWordWrap: false,
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
    showStartScreen: true,
    hoverCards: true,
    showMinimap: true,
    wheelAction: 'zoom',
  };
}

const PREF_KEYS = Object.keys(defaultPrefs()) as (keyof Prefs)[];

function loadPrefs(): Prefs {
  const defaults = defaultPrefs();
  let prefs = defaults;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) prefs = { ...defaults, ...JSON.parse(raw) };
  } catch {
    /* unreadable: defaults */
  }
  setLanguage(prefs.language);
  return prefs;
}

interface EditorState extends Prefs {
  /** Theme currently shown (resolves 'system'). */
  appliedTheme: ThemeId;
  /** Full-window page shown over the editor (null = the editor). */
  page: null | 'home' | 'guide';
  /** Part shown in the parts guide (null: the overview). */
  guideType: string | null;
  /** Where the guide's Back button goes. */
  guideReturn: null | 'home';
  selectedComponents: string[];
  selectedWires: string[];
  /** Selected canvas notes (text, arrows, frames). */
  selectedAnnotations: string[];
  /** Text note being typed (a new one is not in the document until it has text). */
  editingNote: TextNote | null;
  viewport: { x: number; y: number; zoom: number };
  hoverPin: PinRef | null;
  /** Wire being drawn: start pin and waypoints placed so far. */
  wiring: { from: PinRef; points: Point[] } | null;
  cursor: { x: number; y: number };
  tool: Tool;
  dockTab: DockTab;
  clipboard: CircuitDocument | null;
  contextMenu: ContextMenuState | null;
  dialog: null | 'examples' | 'toolchain' | 'shortcuts' | 'about' | 'project' | 'settings' | 'export';
  toasts: Toast[];
  /** Open command palette: run commands, or add a part (optionally at a canvas point). */
  palette: null | { mode: 'commands' | 'add' | 'find'; at?: { x: number; y: number } };
  /** Component type being dragged from the library (drop preview). */
  dragType: string | null;
  /** Line to reveal in the code editor (set by the Problems panel). */
  revealLine: { file: string; line: number; nonce: number } | null;

  set(partial: Partial<EditorState>): void;
  setPrefs(partial: Partial<Prefs>): void;
  /** Restores default settings; keeps the language, favourites and recent lists. */
  resetPrefs(): void;
  select(components: string[], wires?: string[], annotations?: string[]): void;
  clearSelection(): void;
  toggleFavorite(type: string): void;
  pushRecent(type: string): void;
  rememberProject(path: string, name: string): void;
  forgetProject(path?: string): void;
  notify(message: string, kind?: Toast['kind']): void;
  dismissToast(id: number): void;
}

let toastSeq = 0;

const initialPrefs = loadPrefs();

export const useEditor = create<EditorState>((set, get) => ({
  ...initialPrefs,
  appliedTheme: resolveTheme(initialPrefs.theme, systemPrefersDark()),
  page: initialPrefs.showStartScreen ? 'home' : null,
  guideType: null,
  guideReturn: null,
  selectedComponents: [],
  selectedWires: [],
  selectedAnnotations: [],
  editingNote: null,
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
    if (partial.language && partial.language !== get().language) setLanguage(partial.language);
    set(partial);
    const s = get();
    const prefs = Object.fromEntries(PREF_KEYS.map((k) => [k, s[k]])) as unknown as Prefs;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable: preferences stay in memory */
    }
  },
  resetPrefs() {
    const { language, favorites, recent, recentProjects } = get();
    get().setPrefs({ ...defaultPrefs(), language, favorites, recent, recentProjects });
  },
  select(components, wires = [], annotations = []) {
    set({ selectedComponents: components, selectedWires: wires, selectedAnnotations: annotations });
  },
  clearSelection() {
    const s = get();
    if (s.selectedComponents.length || s.selectedWires.length || s.selectedAnnotations.length) set({ selectedComponents: [], selectedWires: [], selectedAnnotations: [] });
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
