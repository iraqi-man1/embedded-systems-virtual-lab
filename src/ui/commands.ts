/** Application commands shared by menus, toolbar and keyboard shortcuts. */
import { newDocument, openDocument, saveDocument } from '../app/fileOps';
import { useEditor } from '../state/editor';
import { useProject } from '../state/project';
import {
  compileFirmware,
  pauseSimulation,
  resetSimulation,
  startSimulation,
  stepSimulation,
  stopSimulation,
  useSim,
} from '../state/sim';
import {
  alignSelection,
  copySelection,
  cycleWireColor,
  pickWireColor,
  setZoom,
  cutSelection,
  deleteSelection,
  duplicateSelection,
  fitView,
  flipSelection,
  nudgeSelection,
  paste,
  rotateSelection,
  selectAll,
  zoomBy,
} from './workspace/actions';

export interface Command {
  id: string;
  label: string;
  icon?: string;
  /** Display form, e.g. "Ctrl+S". */
  shortcut?: string;
  run: () => void;
  enabled?: () => boolean;
}

const ed = () => useEditor.getState();
const hasSelection = () => ed().selectedComponents.length + ed().selectedWires.length > 0;
const simState = () => useSim.getState().state;

export const commands: Record<string, Command> = {
  new: { id: 'new', label: 'New Project', icon: 'new', shortcut: 'Ctrl+N', run: newDocument },
  open: { id: 'open', label: 'Open Project…', icon: 'open', shortcut: 'Ctrl+O', run: () => void openDocument() },
  save: { id: 'save', label: 'Save', icon: 'save', shortcut: 'Ctrl+S', run: () => void saveDocument() },
  saveAs: { id: 'saveAs', label: 'Save As…', shortcut: 'Ctrl+Shift+S', run: () => void saveDocument(true) },
  examples: { id: 'examples', label: 'Examples & Templates…', icon: 'book', run: () => ed().set({ dialog: 'examples' }) },
  undo: { id: 'undo', label: 'Undo', icon: 'undo', shortcut: 'Ctrl+Z', run: () => useProject.getState().undo(), enabled: () => useProject.getState().past.length > 0 },
  redo: { id: 'redo', label: 'Redo', icon: 'redo', shortcut: 'Ctrl+Y', run: () => useProject.getState().redo(), enabled: () => useProject.getState().future.length > 0 },
  cut: { id: 'cut', label: 'Cut', icon: 'cut', shortcut: 'Ctrl+X', run: cutSelection, enabled: () => ed().selectedComponents.length > 0 },
  copy: { id: 'copy', label: 'Copy', icon: 'copy', shortcut: 'Ctrl+C', run: copySelection, enabled: () => ed().selectedComponents.length > 0 },
  paste: { id: 'paste', label: 'Paste', icon: 'paste', shortcut: 'Ctrl+V', run: () => paste(), enabled: () => !!ed().clipboard },
  duplicate: { id: 'duplicate', label: 'Duplicate', icon: 'duplicate', shortcut: 'Ctrl+D', run: duplicateSelection, enabled: () => ed().selectedComponents.length > 0 },
  delete: { id: 'delete', label: 'Delete', icon: 'trash', shortcut: 'Del', run: deleteSelection, enabled: hasSelection },
  selectAll: { id: 'selectAll', label: 'Select All', shortcut: 'Ctrl+A', run: selectAll },
  rotate: { id: 'rotate', label: 'Rotate 90° CW', icon: 'rotate', shortcut: 'R', run: () => rotateSelection(90), enabled: () => ed().selectedComponents.length > 0 },
  rotateCcw: { id: 'rotateCcw', label: 'Rotate 90° CCW', icon: 'rotate-ccw', shortcut: 'Shift+R', run: () => rotateSelection(-90), enabled: () => ed().selectedComponents.length > 0 },
  flip: { id: 'flip', label: 'Flip Horizontal', icon: 'flip', shortcut: 'H', run: flipSelection, enabled: () => ed().selectedComponents.length > 0 },
  cycleWireColor: { id: 'cycleWireColor', label: 'Cycle Wire Colour', icon: 'palette', shortcut: 'C', run: cycleWireColor },
  alignLeft: { id: 'alignLeft', label: 'Align Left', icon: 'align-left', run: () => alignSelection('left'), enabled: () => ed().selectedComponents.length > 1 },
  alignCenter: { id: 'alignCenter', label: 'Align Centers', icon: 'align-center', run: () => alignSelection('center'), enabled: () => ed().selectedComponents.length > 1 },
  alignRight: { id: 'alignRight', label: 'Align Right', icon: 'align-right', run: () => alignSelection('right'), enabled: () => ed().selectedComponents.length > 1 },
  alignTop: { id: 'alignTop', label: 'Align Top', icon: 'align-top', run: () => alignSelection('top'), enabled: () => ed().selectedComponents.length > 1 },
  alignMiddle: { id: 'alignMiddle', label: 'Align Middles', icon: 'align-middle', run: () => alignSelection('middle'), enabled: () => ed().selectedComponents.length > 1 },
  alignBottom: { id: 'alignBottom', label: 'Align Bottom', icon: 'align-bottom', run: () => alignSelection('bottom'), enabled: () => ed().selectedComponents.length > 1 },
  distH: { id: 'distH', label: 'Distribute Horizontally', icon: 'dist-h', run: () => alignSelection('hdist'), enabled: () => ed().selectedComponents.length > 2 },
  distV: { id: 'distV', label: 'Distribute Vertically', icon: 'dist-v', run: () => alignSelection('vdist'), enabled: () => ed().selectedComponents.length > 2 },
  zoomIn: { id: 'zoomIn', label: 'Zoom In', icon: 'zoom-in', shortcut: '+', run: () => zoomBy(1.2) },
  zoomOut: { id: 'zoomOut', label: 'Zoom Out', icon: 'zoom-out', shortcut: '−', run: () => zoomBy(1 / 1.2) },
  zoomReset: { id: 'zoomReset', label: 'Actual Size (100%)', shortcut: '0', run: () => setZoom(1) },
  fit: { id: 'fit', label: 'Fit to Window', icon: 'fit', shortcut: 'F', run: fitView },
  grid: { id: 'grid', label: 'Show Grid', icon: 'grid', shortcut: 'G', run: () => ed().setPrefs({ showGrid: !ed().showGrid }) },
  snap: { id: 'snap', label: 'Snap to Grid', icon: 'magnet', run: () => ed().setPrefs({ snap: !ed().snap }) },
  sound: { id: 'sound', label: 'Sound (buzzers)', run: () => ed().setPrefs({ sound: !ed().sound }) },
  theme: { id: 'theme', label: 'Toggle Dark Theme', icon: 'moon', run: () => ed().setPrefs({ theme: ed().theme === 'dark' ? 'light' : 'dark' }) },
  toggleLibrary: { id: 'toggleLibrary', label: 'Component Library', icon: 'panel-left', run: () => ed().setPrefs({ showLibrary: !ed().showLibrary }) },
  toggleInspector: { id: 'toggleInspector', label: 'Inspector', icon: 'panel-right', run: () => ed().setPrefs({ showInspector: !ed().showInspector }) },
  toggleCode: { id: 'toggleCode', label: 'Code Editor', icon: 'code', run: () => ed().setPrefs({ showCode: !ed().showCode }) },
  toggleDock: { id: 'toggleDock', label: 'Instruments Panel', icon: 'panel-bottom', run: () => ed().setPrefs({ showDock: !ed().showDock }) },
  compile: { id: 'compile', label: 'Compile Firmware', icon: 'build', shortcut: 'Ctrl+B', run: () => void compileFirmware(), enabled: () => useSim.getState().compile.status !== 'compiling' },
  run: {
    id: 'run',
    label: 'Run / Resume',
    icon: 'play',
    shortcut: 'F5',
    run: () => void startSimulation(),
    enabled: () => simState() !== 'running' && !useSim.getState().starting,
  },
  pause: { id: 'pause', label: 'Pause', icon: 'pause', shortcut: 'F6', run: pauseSimulation, enabled: () => simState() === 'running' },
  step: { id: 'step', label: 'Step 1 ms', icon: 'step', shortcut: 'F10', run: () => stepSimulation('1ms'), enabled: () => simState() !== 'running' },
  stepInstr: { id: 'stepInstr', label: 'Step One Instruction', shortcut: 'F11', run: () => stepSimulation('instruction'), enabled: () => simState() !== 'running' },
  reset: { id: 'reset', label: 'Reset Board', icon: 'reset', shortcut: 'Ctrl+F5', run: resetSimulation, enabled: () => simState() !== 'stopped' },
  stop: { id: 'stop', label: 'Stop Simulation', icon: 'stop', shortcut: 'Shift+F5', run: stopSimulation, enabled: () => simState() !== 'stopped' },
  probeLogic: { id: 'probeLogic', label: 'Probe with Logic Analyzer', icon: 'activity', run: () => ed().set({ tool: 'probe-logic' }) },
  probeScope: { id: 'probeScope', label: 'Probe with Oscilloscope', icon: 'waves', run: () => ed().set({ tool: 'probe-scope' }) },
  toolchain: { id: 'toolchain', label: 'Firmware Toolchain…', icon: 'wrench', run: () => ed().set({ dialog: 'toolchain' }) },
  shortcuts: { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: 'keyboard', shortcut: '?', run: () => ed().set({ dialog: 'shortcuts' }) },
  about: { id: 'about', label: 'About', icon: 'info', run: () => ed().set({ dialog: 'about' }) },
};

const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || !!t.closest('.monaco-editor'));
};

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
    // Work everywhere (including the code editor).
    if (ctrl && k.toLowerCase() === 's') return run(e.shiftKey ? 'saveAs' : 'save');
    if (ctrl && k.toLowerCase() === 'o') return run('open');
    if (ctrl && k.toLowerCase() === 'n') return run('new');
    if (ctrl && k.toLowerCase() === 'b') return run('compile');
    if (k === 'F5') return run(ctrl ? 'reset' : e.shiftKey ? 'stop' : 'run');
    if (k === 'F6') return run('pause');
    if (k === 'F10') return run('step');
    if (k === 'F11') return run('stepInstr');
    // Block browser reload/print shortcuts inside the desktop app.
    if (ctrl && (k.toLowerCase() === 'r' || k.toLowerCase() === 'p')) return e.preventDefault();
    if (isTyping(e) || inMenu(e)) return;
    if (ctrl && !e.shiftKey && k.toLowerCase() === 'z') return run('undo');
    if (ctrl && (k.toLowerCase() === 'y' || (e.shiftKey && k.toLowerCase() === 'z'))) return run('redo');
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
        return run('fit');
      case 'g':
      case 'G':
        return run('grid');
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
        if (!editor.selectedComponents.length) return;
        const step = e.shiftKey ? 9.6 * 5 : 9.6;
        nudgeSelection(k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0, k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0);
        return e.preventDefault();
      }
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}
