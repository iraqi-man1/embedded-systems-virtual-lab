import { useEditor } from '../../state/editor';
import { useProject } from '../../state/project';
import { commands } from '../commands';
import { MenuBarMenu, MenuBarRoot, MenuCheckItem, MenuItem, MenuSeparator, SubMenu } from '../common/Menu';
import { setZoom } from '../workspace/actions';
import { AlignItems, SpeedItems, WireColorItems } from './Toolbar';

type Entry = string | '-' | { sub: string; icon?: string; render: () => React.ReactNode };

const ZOOMS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3];

function ZoomItems() {
  const zoom = useEditor((s) => s.viewport.zoom);
  return (
    <>
      {ZOOMS.map((z) => (
        <MenuCheckItem key={z} label={`${z * 100}%`} checked={Math.abs(zoom - z) < 1e-3} onSelect={() => setZoom(z)} />
      ))}
    </>
  );
}

const MENUS: { name: string; items: Entry[] }[] = [
  { name: 'File', items: ['new', 'open', '-', 'save', 'saveAs', '-', 'examples'] },
  { name: 'Edit', items: ['undo', 'redo', '-', 'cut', 'copy', 'paste', 'duplicate', 'delete', '-', 'selectAll', '-', 'rotate', 'rotateCcw', 'flip'] },
  {
    name: 'Arrange',
    items: [
      { sub: 'Align & distribute', icon: 'align-left', render: () => <AlignItems /> },
      '-',
      { sub: 'Wire colour', icon: 'cable', render: () => <WireColorItems /> },
      'cycleWireColor',
    ],
  },
  {
    name: 'View',
    items: ['zoomIn', 'zoomOut', 'zoomReset', 'fit', { sub: 'Zoom', render: () => <ZoomItems /> }, '-', 'grid', 'snap', '-', 'toggleLibrary', 'toggleCode', 'toggleInspector', 'toggleDock', '-', 'sound', 'theme'],
  },
  {
    name: 'Simulation',
    items: ['compile', '-', 'run', 'pause', 'step', 'stepInstr', 'reset', 'stop', '-', { sub: 'Speed', icon: 'gauge', render: () => <SpeedItems /> }, '-', 'probeLogic', 'probeScope', '-', 'toolchain'],
  },
  { name: 'Help', items: ['examples', 'shortcuts', '-', 'about'] },
];

const TOGGLES: Record<string, () => boolean> = {
  grid: () => useEditor.getState().showGrid,
  snap: () => useEditor.getState().snap,
  theme: () => useEditor.getState().theme === 'dark',
  sound: () => useEditor.getState().sound,
  toggleLibrary: () => useEditor.getState().showLibrary,
  toggleInspector: () => useEditor.getState().showInspector,
  toggleCode: () => useEditor.getState().showCode,
  toggleDock: () => useEditor.getState().showDock,
};

function CommandEntry({ id }: { id: string }) {
  const c = commands[id];
  // Toggles reflect the current preferences.
  useEditor((s) => [s.showGrid, s.snap, s.theme, s.sound, s.showLibrary, s.showInspector, s.showCode, s.showDock].join());
  const disabled = !!c.enabled && !c.enabled();
  if (TOGGLES[id]) return <MenuCheckItem label={c.label} checked={TOGGLES[id]()} shortcut={c.shortcut} disabled={disabled} onSelect={c.run} />;
  return <MenuItem label={c.label} icon={c.icon} shortcut={c.shortcut} disabled={disabled} onSelect={c.run} />;
}

export function MenuBar() {
  const name = useProject((s) => s.project.meta.name);
  const dirty = useProject((s) => s.dirty);
  const path = useProject((s) => s.filePath);
  return (
    <div className="menubar">
      <div className="brand">
        <svg viewBox="0 0 512 512">
          <rect width="512" height="512" rx="96" fill="#0f2a3d" />
          <rect x="136" y="136" width="240" height="240" rx="24" fill="#1d4f6e" stroke="#5ad1ff" strokeWidth="14" />
          <path d="M190 300l44-88 40 64 22-36 26 60" fill="none" stroke="#ffd166" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Virtual Lab
      </div>
      <MenuBarRoot>
        {MENUS.map((m) => (
          <MenuBarMenu key={m.name} label={m.name}>
            {m.items.map((it, i) =>
              it === '-' ? (
                <MenuSeparator key={i} />
              ) : typeof it === 'string' ? (
                <CommandEntry key={it} id={it} />
              ) : (
                <SubMenu key={it.sub} label={it.sub} icon={it.icon}>
                  {it.render()}
                </SubMenu>
              ),
            )}
          </MenuBarMenu>
        ))}
      </MenuBarRoot>
      <div className="menu-title" title={path ?? 'Not saved yet'}>
        {name}
        {dirty ? ' •' : ''}
        {path ? ` — ${path}` : ' — unsaved'}
      </div>
    </div>
  );
}
