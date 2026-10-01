import { useEffect, useState } from 'react';
import { useEditor } from '../state/editor';
import { useProject } from '../state/project';
import { refreshToolchain } from '../state/sim';
import { installShortcuts } from './commands';
import { CodeEditor } from './editor/CodeEditor';
import { Inspector } from './inspector/Inspector';
import { BottomDock } from './instruments/BottomDock';
import { LibraryPanel } from './library/LibraryPanel';
import { ContextMenu } from './shell/ContextMenu';
import { Dialogs, Toasts } from './shell/Dialogs';
import { MenuBar } from './shell/MenuBar';
import { StatusBar } from './shell/StatusBar';
import { Toolbar } from './shell/Toolbar';
import { Workspace } from './workspace/Workspace';

type SizeKey = 'libraryWidth' | 'inspectorWidth' | 'codeWidth' | 'dockHeight';

function Splitter({ k, dir, invert, min, max }: { k: SizeKey; dir: 'v' | 'h'; invert?: boolean; min: number; max: number }) {
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const start = dir === 'v' ? e.clientX : e.clientY;
    const startSize = useEditor.getState()[k];
    const move = (ev: PointerEvent) => {
      const d = (dir === 'v' ? ev.clientX : ev.clientY) - start;
      const size = Math.max(min, Math.min(max, startSize + (invert ? -d : d)));
      useEditor.getState().set({ [k]: size } as never);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      useEditor.getState().setPrefs({});
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return <div className={dir === 'v' ? 'splitter-v' : 'splitter-h'} onPointerDown={onPointerDown} />;
}

export function App() {
  const theme = useEditor((s) => s.theme);
  const showLibrary = useEditor((s) => s.showLibrary);
  const showInspector = useEditor((s) => s.showInspector);
  const showCode = useEditor((s) => s.showCode);
  const showDock = useEditor((s) => s.showDock);
  const libraryWidth = useEditor((s) => s.libraryWidth);
  const inspectorWidth = useEditor((s) => s.inspectorWidth);
  const codeWidth = useEditor((s) => s.codeWidth);
  const dockHeight = useEditor((s) => s.dockHeight);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Clamp panel sizes to the window so the canvas always keeps usable space.
  const [win, setWin] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setWin({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const libW = Math.min(libraryWidth, Math.max(200, win.w * 0.2));
  const inspW = Math.min(inspectorWidth, Math.max(220, win.w * 0.22));
  const center = win.w - (showLibrary ? libW : 0) - (showInspector ? inspW : 0);
  const codeW = Math.min(codeWidth, Math.max(280, center * 0.5));
  const dockH = Math.min(dockHeight, Math.max(120, win.h * 0.45));

  useEffect(() => {
    const off = installShortcuts();
    void refreshToolchain();
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (useProject.getState().dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      off();
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, []);

  return (
    <div className="app">
      <MenuBar />
      <Toolbar />
      <div className="main">
        {showLibrary && (
          <>
            <div style={{ width: libW, flex: 'none', minHeight: 0 }}>
              <LibraryPanel />
            </div>
            <Splitter k="libraryWidth" dir="v" min={200} max={460} />
          </>
        )}
        <div className="center">
          <div className="center-top">
            <Workspace />
            {showCode && (
              <>
                <Splitter k="codeWidth" dir="v" invert min={320} max={1100} />
                <div style={{ width: codeW, flex: 'none', display: 'flex', minHeight: 0 }}>
                  <CodeEditor />
                </div>
              </>
            )}
          </div>
          {showDock && (
            <>
              <Splitter k="dockHeight" dir="h" invert min={120} max={700} />
              <div className="dock" style={{ height: dockH }}>
                <BottomDock />
              </div>
            </>
          )}
        </div>
        {showInspector && (
          <>
            <Splitter k="inspectorWidth" dir="v" invert min={240} max={520} />
            <div style={{ width: inspW, flex: 'none', minHeight: 0 }}>
              <Inspector />
            </div>
          </>
        )}
      </div>
      <StatusBar />
      <ContextMenu />
      <Dialogs />
      <Toasts />
    </div>
  );
}
