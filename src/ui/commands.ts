/** Application commands shared by menus, toolbar and keyboard shortcuts. */
import { openDocument, saveDocument } from '../app/fileOps';
import { newFromTemplate } from '../examples';
import { t, type MessageKey } from '../i18n';
import { themeInfo, type ThemePref } from './themes';
import { useEditor, type NoteTool } from '../state/editor';
import { flushCoalesced, useProject } from '../state/project';
import {
  compileFirmware,
  pauseSimulation,
  resetSimulation,
  startSimulation,
  stepSimulation,
  stopSimulation,
  targetLanguage,
  useSim,
} from '../state/sim';
import {
  alignSelection,
  copySelection,
  cycleWireColor,
  pickWireColor,
  setZoom,
  zoomToSelection,
  cutSelection,
  deleteSelection,
  duplicateSelection,
  fitView,
  flipSelection,
  nudgeSelection,
  panBy,
  paste,
  rotateSelection,
  selectAll,
  zoomBy,
} from './workspace/actions';
import { closeGuide, openGuideForContext } from './guide/open';
import { toggleCodeFloat } from './editor/codeDock';
import { copyCircuitImage } from './export/copy';

export interface Command {
  id: string;
  /** Translated name (menus, palette, tooltips). */
  label: string;
  /** English name (the palette also matches it while the interface is in Arabic). */
  en?: string;
  /** One-line explanation shown when hovering the command's button. */
  description?: string;
  icon?: string;
  /** Display form, e.g. "Ctrl+S". */
  shortcut?: string;
  run: () => void;
  enabled?: () => boolean;
}

const ed = () => useEditor.getState();

type PanelState = Pick<ReturnType<typeof ed>, 'showLibrary' | 'showInspector' | 'showCode' | 'showDock'>;
let beforeFocus: PanelState | null = null;
/** Hides every panel around the canvas; the second call restores them. */
function toggleFocusCanvas() {
  const { showLibrary, showInspector, showCode, showDock } = ed();
  const anyShown = showLibrary || showInspector || showCode || showDock;
  if (anyShown) {
    beforeFocus = { showLibrary, showInspector, showCode, showDock };
    ed().setPrefs({ showLibrary: false, showInspector: false, showCode: false, showDock: false });
  } else {
    ed().setPrefs(beforeFocus ?? { showLibrary: true, showInspector: true, showCode: true, showDock: true });
    beforeFocus = null;
  }
}
const hasSelection = () => ed().selectedComponents.length + ed().selectedWires.length + ed().selectedAnnotations.length > 0;

/** Chooses a drawing tool for notes; choosing it again goes back to selecting. */
function pickTool(tool: NoteTool) {
  ed().set({ tool: ed().tool === tool ? 'select' : tool, wiring: null });
}

/** Chooses a theme and remembers it as the light or dark choice of the quick toggle. */
export function setTheme(pref: ThemePref) {
  if (pref === 'system') return ed().setPrefs({ theme: pref });
  ed().setPrefs({ theme: pref, ...(themeInfo(pref).base === 'dark' ? { themeDark: pref } : { themeLight: pref }) });
}

/** Switches between the last light and the last dark theme. */
function toggleDark() {
  const s = ed();
  setTheme(themeInfo(s.appliedTheme).base === 'dark' ? s.themeLight : s.themeDark);
}
const simState = () => useSim.getState().state;

/** A command whose label and description follow the interface language. */
function cmd(id: string, label: MessageKey, description: MessageKey | null, rest: Omit<Command, 'id' | 'label' | 'description'>): Command {
  return {
    id,
    en: label,
    get label() {
      return t(label);
    },
    get description() {
      return description ? t(description) : undefined;
    },
    ...rest,
  };
}

/** One command whose name and explanation follow the language of the target board. */
function byLanguage(arduino: Command, python: Command): Command {
  const pick = () => (targetLanguage(useProject.getState().project) === 'micropython' ? python : arduino);
  return {
    ...arduino,
    get label() {
      return pick().label;
    },
    get description() {
      return pick().description;
    },
  };
}

const oneSelected = () => ed().selectedComponents.length + ed().selectedAnnotations.length > 0;
const partSelected = () => ed().selectedComponents.length > 0;

export const commands: Record<string, Command> = {
  home: cmd('home', 'Start Screen', 'Recent projects, templates, examples and getting started.', { icon: 'home', run: () => ed().set({ page: 'home', wiring: null }) }),
  new: cmd('new', 'New Project', 'Start a new project from the template you used last (at first, an empty project). Asks to save the current one.', { icon: 'new', shortcut: 'Ctrl+N', run: () => void newFromTemplate() }),
  open: cmd('open', 'Open Project…', 'Open a .evlab project file.', { icon: 'open', shortcut: 'Ctrl+O', run: () => void openDocument() }),
  save: cmd('save', 'Save', 'Save the project (circuit, code and instrument setup).', { icon: 'save', shortcut: 'Ctrl+S', run: () => void saveDocument() }),
  saveAs: cmd('saveAs', 'Save As…', 'Save the project under a new name or folder.', { shortcut: 'Ctrl+Shift+S', run: () => void saveDocument(true) }),
  examples: cmd('examples', 'Examples & Templates…', 'Open a ready-made project: circuit and code that run as they are.', { icon: 'book', run: () => ed().set({ dialog: 'examples' }) }),
  undo: cmd('undo', 'Undo', 'Undo the last change to the circuit.', {
    icon: 'undo',
    shortcut: 'Ctrl+Z',
    run: () => (flushCoalesced(), useProject.getState().undo()),
    enabled: () => useProject.getState().past.length > 0 || !!useProject.getState().txBase,
  }),
  redo: cmd('redo', 'Redo', 'Redo the change that was undone.', {
    icon: 'redo',
    shortcut: 'Ctrl+Y',
    run: () => (flushCoalesced(), useProject.getState().redo()),
    enabled: () => useProject.getState().future.length > 0,
  }),
  cut: cmd('cut', 'Cut', 'Copy the selected parts to the clipboard and remove them.', { icon: 'cut', shortcut: 'Ctrl+X', run: cutSelection, enabled: oneSelected }),
  copy: cmd('copy', 'Copy', 'Copy the selected parts and the wires between them.', { icon: 'copy', shortcut: 'Ctrl+C', run: copySelection, enabled: oneSelected }),
  paste: cmd('paste', 'Paste', 'Paste the copied parts.', { icon: 'paste', shortcut: 'Ctrl+V', run: () => paste(), enabled: () => !!ed().clipboard }),
  duplicate: cmd('duplicate', 'Duplicate', 'Make a copy of the selected parts next to them.', { icon: 'duplicate', shortcut: 'Ctrl+D', run: duplicateSelection, enabled: oneSelected }),
  delete: cmd('delete', 'Delete', 'Remove the selected parts and wires.', { icon: 'trash', shortcut: 'Del', run: deleteSelection, enabled: hasSelection }),
  selectAll: cmd('selectAll', 'Select All', null, { shortcut: 'Ctrl+A', run: selectAll }),
  rotate: cmd('rotate', 'Rotate 90° CW', 'Turn the selected parts a quarter turn clockwise.', { icon: 'rotate', shortcut: 'R', run: () => rotateSelection(90), enabled: partSelected }),
  rotateCcw: cmd('rotateCcw', 'Rotate 90° CCW', 'Turn the selected parts a quarter turn counter-clockwise.', { icon: 'rotate-ccw', shortcut: 'Shift+R', run: () => rotateSelection(-90), enabled: partSelected }),
  flip: cmd('flip', 'Flip Horizontal', 'Mirror the selected parts left to right.', { icon: 'flip', shortcut: 'H', run: flipSelection, enabled: partSelected }),
  cycleWireColor: cmd('cycleWireColor', 'Cycle Wire Colour', 'Give the selected wires (or new wires) the next colour.', { icon: 'palette', shortcut: 'C', run: cycleWireColor }),
  alignLeft: cmd('alignLeft', 'Align Left', null, { icon: 'align-left', run: () => alignSelection('left'), enabled: () => ed().selectedComponents.length > 1 }),
  alignCenter: cmd('alignCenter', 'Align Centers', null, { icon: 'align-center', run: () => alignSelection('center'), enabled: () => ed().selectedComponents.length > 1 }),
  alignRight: cmd('alignRight', 'Align Right', null, { icon: 'align-right', run: () => alignSelection('right'), enabled: () => ed().selectedComponents.length > 1 }),
  alignTop: cmd('alignTop', 'Align Top', null, { icon: 'align-top', run: () => alignSelection('top'), enabled: () => ed().selectedComponents.length > 1 }),
  alignMiddle: cmd('alignMiddle', 'Align Middles', null, { icon: 'align-middle', run: () => alignSelection('middle'), enabled: () => ed().selectedComponents.length > 1 }),
  alignBottom: cmd('alignBottom', 'Align Bottom', null, { icon: 'align-bottom', run: () => alignSelection('bottom'), enabled: () => ed().selectedComponents.length > 1 }),
  distH: cmd('distH', 'Distribute Horizontally', null, { icon: 'dist-h', run: () => alignSelection('hdist'), enabled: () => ed().selectedComponents.length > 2 }),
  distV: cmd('distV', 'Distribute Vertically', null, { icon: 'dist-v', run: () => alignSelection('vdist'), enabled: () => ed().selectedComponents.length > 2 }),
  zoomIn: cmd('zoomIn', 'Zoom In', null, { icon: 'zoom-in', shortcut: '+', run: () => zoomBy(1.2) }),
  zoomOut: cmd('zoomOut', 'Zoom Out', null, { icon: 'zoom-out', shortcut: '−', run: () => zoomBy(1 / 1.2) }),
  zoomReset: cmd('zoomReset', 'Actual Size (100%)', null, { shortcut: '0', run: () => setZoom(1) }),
  fit: cmd('fit', 'Fit to Window', 'Zoom so the whole circuit fits in the canvas.', { icon: 'fit', shortcut: 'F', run: () => fitView() }),
  zoomSelection: cmd('zoomSelection', 'Zoom to Selection', null, { icon: 'zoom-in', shortcut: 'Shift+F', run: zoomToSelection }),
  toolText: cmd('toolText', 'Text Note', 'Click the canvas to write a note (Arabic or English).', { icon: 'type', shortcut: 'T', run: () => pickTool('text') }),
  toolArrow: cmd('toolArrow', 'Arrow', 'Drag on the canvas to draw an arrow that points something out.', { icon: 'arrow', shortcut: 'A', run: () => pickTool('arrow') }),
  toolFrame: cmd('toolFrame', 'Frame', 'Drag on the canvas to draw a titled frame around a group of parts.', { icon: 'frame', shortcut: 'B', run: () => pickTool('rect') }),
  minimap: cmd('minimap', 'Show Minimap', 'An overview of the whole circuit: click or drag in it to move around.', { icon: 'map', shortcut: 'M', run: () => ed().setPrefs({ showMinimap: !ed().showMinimap }) }),
  grid: cmd('grid', 'Show Grid', 'Dots every 0.1 inch (the breadboard pitch) on the canvas.', { icon: 'grid', shortcut: 'G', run: () => ed().setPrefs({ showGrid: !ed().showGrid }) }),
  snap: cmd('snap', 'Snap to Grid', 'Parts and wire bends land on the 0.1 inch grid.', { icon: 'magnet', run: () => ed().setPrefs({ snap: !ed().snap }) }),
  sound: cmd('sound', 'Sound (buzzers)', 'Play the tones of buzzers and speakers while simulating.', { run: () => ed().setPrefs({ sound: !ed().sound }) }),
  logicLevels: cmd('logicLevels', 'Show Logic Levels on Pins', 'While simulating, mark chip pins high, low or floating.', { run: () => ed().setPrefs({ showLogicLevels: !ed().showLogicLevels }) }),
  voltages: cmd('voltages', 'Show Voltages on Wires', 'While simulating, show the voltage of each net on its wires.', { icon: 'zap', shortcut: 'V', run: () => ed().setPrefs({ showVoltages: !ed().showVoltages }) }),
  language: cmd('language', 'Interface language: English / العربية', 'Switch the interface between English and Arabic (right-to-left).', {
    icon: 'languages',
    run: () => ed().setPrefs({ language: ed().language === 'ar' ? 'en' : 'ar' }),
  }),
  theme: cmd('theme', 'Toggle Dark Theme', 'Switch between your light and dark themes.', { icon: 'moon', run: toggleDark }),
  settings: cmd('settings', 'Settings…', 'Language, theme, mouse and canvas behaviour, code editor and simulation options.', {
    icon: 'settings',
    shortcut: 'Ctrl+,',
    run: () => ed().set({ dialog: 'settings' }),
  }),
  toggleLibrary: cmd('toggleLibrary', 'Component Library', 'Show or hide the list of parts you can drag onto the canvas.', { icon: 'panel-left', run: () => ed().setPrefs({ showLibrary: !ed().showLibrary }) }),
  toggleInspector: cmd('toggleInspector', 'Properties Panel', 'Show or hide the properties of the selected part or wire.', { icon: 'settings', run: () => ed().setPrefs({ showInspector: !ed().showInspector }) }),
  focusCanvas: cmd('focusCanvas', 'Focus Canvas (hide/restore panels)', 'Hide every panel around the canvas; run again to bring them back.', { icon: 'fit', shortcut: 'Ctrl+`', run: toggleFocusCanvas }),
  toggleCode: cmd('toggleCode', 'Code Editor', 'Show or hide the firmware code editor.', { icon: 'code', run: () => ed().setPrefs({ showCode: !ed().showCode }) }),
  floatCode: cmd('floatCode', 'Floating Code Editor', 'Take the code editor out into a window you can move anywhere; run again to put it back beside the canvas.', { icon: 'float', run: toggleCodeFloat }),
  toggleDock: cmd('toggleDock', 'Instruments Panel', 'Show or hide the serial monitor, oscilloscope, logic analyzer and other instruments.', { icon: 'panel-bottom', run: () => ed().setPrefs({ showDock: !ed().showDock }) }),
  compile: byLanguage(
    cmd('compile', 'Compile Firmware', 'Build the code for the board with the real compiler and show any errors. While running, flashes the new build.', {
      icon: 'build',
      shortcut: 'Ctrl+B',
      run: () => void compileFirmware(),
      enabled: () => useSim.getState().compile.status !== 'compiling',
    }),
    cmd('compile', 'Upload Code to Board', 'MicroPython needs no compiling: copies the .py files to the running board and restarts it, or starts the simulation.', {
      run: () => void compileFirmware(),
    }),
  ),
  run: cmd('run', 'Run / Resume', 'Compile if needed and start the simulation (or continue after a pause).', {
    icon: 'play',
    shortcut: 'F5',
    run: () => void startSimulation(),
    enabled: () => simState() !== 'running' && !useSim.getState().starting,
  }),
  pause: cmd('pause', 'Pause', 'Freeze the simulation; the circuit keeps its state.', { icon: 'pause', shortcut: 'F6', run: pauseSimulation, enabled: () => simState() === 'running' }),
  step: cmd('step', 'Step 1 ms', 'Advance a paused simulation by one millisecond.', { icon: 'step', shortcut: 'F10', run: () => stepSimulation('1ms'), enabled: () => simState() !== 'running' }),
  stepInstr: cmd('stepInstr', 'Step One Instruction', 'Execute a single machine instruction (watch the MCU tab).', { shortcut: 'F11', run: () => stepSimulation('instruction'), enabled: () => simState() !== 'running' }),
  reset: cmd('reset', 'Reset Board', 'Restart the firmware as if the reset button was pressed.', { icon: 'reset', shortcut: 'Ctrl+F5', run: resetSimulation, enabled: () => simState() !== 'stopped' }),
  stop: cmd('stop', 'Stop Simulation', 'End the simulation and return to editing.', { icon: 'stop', shortcut: 'Shift+F5', run: stopSimulation, enabled: () => simState() !== 'stopped' }),
  probeLogic: cmd('probeLogic', 'Probe with Logic Analyzer', 'Click pins to record their digital signals in the logic analyzer.', { icon: 'activity', run: () => ed().set({ tool: 'probe-logic' }) }),
  probeScope: cmd('probeScope', 'Probe with Oscilloscope', 'Click a pin to show its voltage over time on the oscilloscope.', { icon: 'waves', run: () => ed().set({ tool: 'probe-scope' }) }),
  toolchain: cmd('toolchain', 'Firmware Toolchain…', 'Install or check the compiler used to build Arduino code.', { icon: 'wrench', run: () => ed().set({ dialog: 'toolchain' }) }),
  palette: cmd('palette', 'Command Palette…', 'Search and run any command by name.', { icon: 'command', shortcut: 'Ctrl+Shift+P', run: () => ed().set({ palette: { mode: 'commands' } }) }),
  exportImage: cmd('exportImage', 'Export Image…', 'Save the circuit as a high-resolution PNG (up to 768 DPI) or a vector SVG.', { icon: 'image', shortcut: 'Ctrl+Shift+E', run: () => ed().set({ dialog: 'export' }) }),
  copyImage: cmd('copyImage', 'Copy as Image', 'Copy the selection, or the whole circuit, as a picture to paste into a document.', { icon: 'copy', shortcut: 'Ctrl+Shift+C', run: () => void copyCircuitImage() }),
  find: cmd('find', 'Find on Canvas…', 'Find a part, net, wire label or note by name and jump to it.', { icon: 'search', shortcut: 'Ctrl+F', run: () => ed().set({ palette: { mode: 'find' } }) }),
  quickAdd: cmd('quickAdd', 'Add a Part…', 'Type a part name and add it to the canvas.', { icon: 'plus', shortcut: 'Ctrl+K', run: () => ed().set({ palette: { mode: 'add' } }) }),
  guide: cmd('guide', 'Parts Guide', 'What each part is, what it is for and how to connect it.', { icon: 'book', shortcut: 'F1', run: () => openGuideForContext() }),
  shortcuts: cmd('shortcuts', 'Keyboard Shortcuts', 'Every mouse gesture and keyboard shortcut.', { icon: 'keyboard', shortcut: '?', run: () => ed().set({ dialog: 'shortcuts' }) }),
  report: cmd('report', 'Report a Problem…', 'The problems the lab recorded, with the details to copy into a report for your teacher or the developers.', { icon: 'bug', run: () => ed().set({ dialog: 'report' }) }),
  about: cmd('about', 'About', null, { icon: 'info', run: () => ed().set({ dialog: 'about' }) }),
};

const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || !!t.closest('.monaco-editor'));
};

const BROWSER_CTRL_KEYS = new Set(['r', 'p', 'f', 'g', 'h', 'j', 'u', 'l', 'w', 't']);

/** Reload, print, find, history, view-source, navigation, caret browsing… */
function isBrowserShortcut(e: KeyboardEvent): boolean {
  const ctrl = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (ctrl && BROWSER_CTRL_KEYS.has(k)) return !(k === 'f' && isTyping(e)); // Ctrl+F stays the editor's find
  if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || k === 'home')) return true;
  return e.key === 'F3' || e.key === 'F7' || e.key === 'BrowserBack' || e.key === 'BrowserForward' || e.key === 'BrowserRefresh';
}

/** Focus is inside a menu, menu bar or dialog: let it handle plain keys. */
const inMenu = (e: KeyboardEvent) => !!(e.target as Element | null)?.closest?.('[role="menu"],[role="menubar"],[role="dialog"]');

/** Global keyboard handling. Returns a cleanup function. */
export function installShortcuts(): () => void {
  const handler = (e: KeyboardEvent) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key;
    const run = (id: string) => {
      const c = commands[id];
      if (!c.enabled || c.enabled()) c.run();
      e.preventDefault();
    };
    // F1: the parts guide, on the part under the mouse or the selected one (the code editor keeps its own F1).
    if (k === 'F1' && !(e.target as HTMLElement | null)?.closest?.('.monaco-editor')) {
      if (ed().page !== 'guide') openGuideForContext();
      return e.preventDefault();
    }
    // Back (Alt+← or a keyboard's Back key) leaves the guide like its Back button.
    if (((e.altKey && k === 'ArrowLeft') || k === 'BrowserBack') && ed().page === 'guide') {
      closeGuide();
      return e.preventDefault();
    }
    // A full-window page (start screen, guide) covers the editor: only its own keys apply.
    if (ed().page) {
      if (ctrl && k.toLowerCase() === 'o') return run('open');
      if (ctrl && k.toLowerCase() === 'n') return run('new');
      if (ctrl && k === ',') return run('settings');
      if (ctrl && e.shiftKey && k.toLowerCase() === 'p') return run('palette');
      if (isBrowserShortcut(e) || k === 'F5') return e.preventDefault();
      if (k === 'Escape' && !ed().dialog && !ed().palette && !inMenu(e)) {
        if (ed().page === 'guide') closeGuide();
        else ed().set({ page: null });
        return e.preventDefault();
      }
      return;
    }
    // Work everywhere (including the code editor).
    if (ctrl && k.toLowerCase() === 's') return run(e.shiftKey ? 'saveAs' : 'save');
    if (ctrl && k.toLowerCase() === 'o') return run('open');
    if (ctrl && k.toLowerCase() === 'n') return run('new');
    if (ctrl && k.toLowerCase() === 'b') return run('compile');
    if (ctrl && e.shiftKey && k.toLowerCase() === 'e') return run('exportImage');
    if (ctrl && e.shiftKey && k.toLowerCase() === 'p') return run('palette');
    if (ctrl && !e.shiftKey && k.toLowerCase() === 'k') return run('quickAdd');
    // Ctrl+F finds in the circuit; in the code editor it stays the editor's own find.
    if (ctrl && !e.shiftKey && k.toLowerCase() === 'f' && !isTyping(e)) return run('find');
    if (ctrl && (e.code === 'Backquote' || k === '`')) return run('focusCanvas');
    if (ctrl && k === ',') return run('settings');
    if (k === 'F5') return run(ctrl ? 'reset' : e.shiftKey ? 'stop' : 'run');
    if (k === 'F6') return run('pause');
    if (k === 'F10') return run('step');
    if (k === 'F11') return run('stepInstr');
    // Browser shortcuts that would reload, navigate away, print or open browser UI
    // over the application (the packaged app also disables them in WebView2).
    if (isBrowserShortcut(e)) return e.preventDefault();
    if (isTyping(e) || inMenu(e)) return;
    if (ctrl && !e.shiftKey && k.toLowerCase() === 'z') return run('undo');
    if (ctrl && (k.toLowerCase() === 'y' || (e.shiftKey && k.toLowerCase() === 'z'))) return run('redo');
    if (ctrl && e.shiftKey && k.toLowerCase() === 'c') return run('copyImage');
    if (ctrl && k.toLowerCase() === 'c') return run('copy');
    if (ctrl && k.toLowerCase() === 'x') return run('cut');
    if (ctrl && k.toLowerCase() === 'v') return run('paste');
    if (ctrl && k.toLowerCase() === 'd') return run('duplicate');
    if (ctrl && k.toLowerCase() === 'a') return run('selectAll');
    if (ctrl) return;
    const editor = ed();
    switch (k) {
      case 'Delete':
      case 'Backspace':
        return run('delete');
      case 'Escape':
        if (editor.wiring) editor.set({ wiring: null });
        else if (editor.tool !== 'select') editor.set({ tool: 'select' });
        else if (editor.dialog) editor.set({ dialog: null });
        else editor.clearSelection();
        return e.preventDefault();
      case 'r':
      case 'R':
        return run(e.shiftKey ? 'rotateCcw' : 'rotate');
      case 'h':
      case 'H':
        return run('flip');
      case 'f':
      case 'F':
        return run(e.shiftKey ? 'zoomSelection' : 'fit');
      case 'g':
      case 'G':
        return run('grid');
      case 'm':
      case 'M':
        return run('minimap');
      case 't':
      case 'T':
        return run('toolText');
      case 'a':
      case 'A':
        return run('toolArrow');
      case 'b':
      case 'B':
        return run('toolFrame');
      case 'v':
      case 'V':
        return run('voltages');
      case '+':
      case '=':
        return run('zoomIn');
      case '-':
      case '_':
        return run('zoomOut');
      case '0':
        return run('zoomReset');
      case '?':
        return run('shortcuts');
      case '/': {
        // Jump to the component search.
        if (!editor.showLibrary) editor.setPrefs({ showLibrary: true });
        setTimeout(() => (document.querySelector('.lib-search input') as HTMLInputElement | null)?.focus(), 0);
        return e.preventDefault();
      }
      case 'c':
      case 'C':
        return run('cycleWireColor');
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
      case '9':
        if (!editor.selectedWires.length && !editor.wiring) return;
        pickWireColor(Number(k) - 1);
        return e.preventDefault();
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        if (!editor.selectedComponents.length && !editor.selectedAnnotations.length) {
          // Nothing selected: the arrows move the view (faster with Shift).
          const d = e.shiftKey ? 240 : 48;
          panBy(k === 'ArrowLeft' ? d : k === 'ArrowRight' ? -d : 0, k === 'ArrowUp' ? d : k === 'ArrowDown' ? -d : 0);
          return e.preventDefault();
        }
        const step = e.shiftKey ? 9.6 * 5 : 9.6;
        nudgeSelection(k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0, k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0);
        return e.preventDefault();
      }
    }
  };
  // The mouse's Back and Forward buttons would make the webview navigate away from the
  // application (an empty window); Back leaves the guide like its Back button instead.
  const mouse = (e: MouseEvent) => {
    if (e.button !== 3 && e.button !== 4) return;
    e.preventDefault();
    if (e.type === 'mouseup' && e.button === 3 && ed().page === 'guide') closeGuide();
  };
  window.addEventListener('keydown', handler);
  window.addEventListener('mousedown', mouse, true);
  window.addEventListener('mouseup', mouse, true);
  return () => {
    window.removeEventListener('keydown', handler);
    window.removeEventListener('mousedown', mouse, true);
    window.removeEventListener('mouseup', mouse, true);
  };
}
