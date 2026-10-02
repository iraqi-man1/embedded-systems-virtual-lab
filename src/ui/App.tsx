import { useEffect, useState } from 'react';
import { installLifecycle } from '../app/lifecycle';
import { isRtl } from '../i18n';
import { useT } from '../i18n/react';
import { useEditor } from '../state/editor';
import { refreshToolchain } from '../state/sim';
import { installShortcuts } from './commands';
import { CodeEditor } from './editor/CodeEditor';
import { Inspector } from './inspector/Inspector';
import { BottomDock } from './instruments/BottomDock';
import { LibraryPanel } from './library/LibraryPanel';
import { DialogHost } from './common/Dialog';
import { Tip, TooltipProvider } from './common/Tooltip';
import { CommandPalette } from './shell/CommandPalette';
import { Dialogs, Toasts } from './shell/Dialogs';
import { MenuBar } from './shell/MenuBar';
import { StatusBar } from './shell/StatusBar';
import { Toolbar } from './shell/Toolbar';
import { Workspace } from './workspace/Workspace';
import { HomeScreen } from './home/HomeScreen';
import { applyTheme, resolveTheme, systemPrefersDark } from './themes';

type SizeKey = 'libraryWidth' | 'inspectorHeight' | 'codeWidth' | 'dockHeight';

/** Drag to resize; double-click collapses the panel it belongs to. */
function Splitter({ k, dir, invert, min, max, onCollapse }: { k: SizeKey; dir: 'v' | 'h'; invert?: boolean; min: number; max: number; onCollapse: () => void }) {
  const t = useT();
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const start = dir === 'v' ? e.clientX : e.clientY;
    const startSize = useEditor.getState()[k];
    // Right-to-left layouts mirror the panels, so horizontal drags count the other way.
    const sign = dir === 'v' && isRtl() ? -1 : 1;
    const move = (ev: PointerEvent) => {
      const d = sign * ((dir === 'v' ? ev.clientX : ev.clientY) - start);
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
  return (
    <Tip content={t('Drag to resize · double-click to hide')} side={dir === 'v' ? 'right' : 'top'} delay={900} direct>
      <div
        className={dir === 'v' ? 'splitter-v' : 'splitter-h'}
        onPointerDown={onPointerDown}
        onDoubleClick={onCollapse}
        role="separator"
        aria-orientation={dir === 'v' ? 'vertical' : 'horizontal'}
      />
    </Tip>
  );
}

const CHROME_HEIGHT = 28 + 40 + 24; // menu bar + toolbar + status bar

/** Follows the theme preference (and the operating system's light/dark setting for 'system'). */
function useAppliedTheme() {
  const pref = useEditor((s) => s.theme);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const theme = resolveTheme(pref, systemDark);
  useEffect(() => {
    applyTheme(theme);
    if (useEditor.getState().appliedTheme !== theme) useEditor.getState().set({ appliedTheme: theme });
  }, [theme]);
}

export function App() {
  useT();
  useAppliedTheme();
  const showLibrary = useEditor((s) => s.showLibrary);
  const showInspector = useEditor((s) => s.showInspector);
  const showCode = useEditor((s) => s.showCode);
  const showDock = useEditor((s) => s.showDock);
  const libraryWidth = useEditor((s) => s.libraryWidth);
  const inspectorHeight = useEditor((s) => s.inspectorHeight);
  const codeWidth = useEditor((s) => s.codeWidth);
  const dockHeight = useEditor((s) => s.dockHeight);

  // Clamp panel sizes to the window so the canvas always keeps usable space.
  const [win, setWin] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setWin({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const showLeft = showLibrary || showInspector;
  const leftW = Math.min(libraryWidth, Math.max(220, win.w * 0.25));
  const center = win.w - (showLeft ? leftW : 0);
  const codeW = Math.min(codeWidth, Math.max(300, center * 0.5));
  const dockH = Math.min(dockHeight, Math.max(120, win.h * 0.45));
  const columnH = win.h - CHROME_HEIGHT;
  const inspH = showLibrary ? Math.max(140, Math.min(inspectorHeight, columnH - 160)) : columnH;

  useEffect(() => {
    const off = installShortcuts();
    const offLifecycle = installLifecycle();
    void refreshToolchain();
    return () => {
      off();
      offLifecycle();
    };
  }, []);

  const hide = (p: Partial<Record<'showLibrary' | 'showInspector' | 'showCode' | 'showDock', boolean>>) => () => useEditor.getState().setPrefs(p);
  const page = useEditor((s) => s.page);

  return (
    <TooltipProvider>
      <div className="app">
        <MenuBar />
        <Toolbar />
        <div className="main">
          {showLeft && (
            <>
              {/* Components on top, the selection's properties below. */}
              <div className="left-column" style={{ width: leftW }}>
                {showLibrary && (
                  <div className="left-top">
                    <LibraryPanel />
                  </div>
                )}
                {showLibrary && showInspector && (
                  <Splitter k="inspectorHeight" dir="h" invert min={140} max={Math.max(160, columnH - 160)} onCollapse={hide({ showInspector: false })} />
                )}
                {showInspector && (
                  <div className="left-bottom" style={{ height: showLibrary ? inspH : undefined, flex: showLibrary ? 'none' : 1 }}>
                    <Inspector />
                  </div>
                )}
              </div>
              <Splitter k="libraryWidth" dir="v" min={220} max={520} onCollapse={hide({ showLibrary: false, showInspector: false })} />
            </>
          )}
          <div className="center">
            <div className="center-top">
              <Workspace />
              {showCode && (
                <>
                  <Splitter k="codeWidth" dir="v" invert min={300} max={1100} onCollapse={hide({ showCode: false })} />
                  <div style={{ width: codeW, flex: 'none', display: 'flex', minHeight: 0 }}>
                    <CodeEditor />
                  </div>
                </>
              )}
            </div>
            {showDock && (
              <>
                <Splitter k="dockHeight" dir="h" invert min={120} max={700} onCollapse={hide({ showDock: false })} />
                <div className="dock" style={{ height: dockH }}>
                  <BottomDock />
                </div>
              </>
            )}
          </div>
        </div>
        <StatusBar />
        {page === 'home' && <HomeScreen />}
        <Dialogs />
        <DialogHost />
        <CommandPalette />
        <Toasts />
      </div>
    </TooltipProvider>
  );
}
