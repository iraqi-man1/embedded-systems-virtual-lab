import { fileTitle, openRecent } from '../../app/fileOps';
import type { MessageKey } from '../../i18n';
import { useT } from '../../i18n/react';
import { useEditor } from '../../state/editor';
import { useProject } from '../../state/project';
import { commands } from '../commands';
import { MenuBarMenu, MenuBarRoot, MenuCheckItem, MenuItem, MenuSeparator, SubMenu } from '../common/Menu';
import { Tip } from '../common/Tooltip';
import { setZoom } from '../workspace/actions';
import { setTheme } from '../commands';
import { THEMES, themeInfo } from '../themes';
import { AlignItems, SpeedItems, WireColorItems } from './Toolbar';

type Entry = string | '-' | { sub: MessageKey; icon?: string; render: () => React.ReactNode };

const ZOOMS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3];

/** Zoom presets (View › Zoom and the canvas zoom control). */
export function ZoomItems() {
  const zoom = useEditor((s) => s.viewport.zoom);
  return (
    <>
      {ZOOMS.map((z) => (
        <MenuCheckItem key={z} label={<span className="ltr">{z * 100}%</span>} checked={Math.abs(zoom - z) < 1e-3} onSelect={() => setZoom(z)} />
      ))}
    </>
  );
}

/** View › Theme: every theme, plus following the system setting. */
export function ThemeItems() {
  const t = useT();
  const pref = useEditor((s) => s.theme);
  return (
    <>
      <MenuCheckItem label={t('Follow system (light/dark)')} checked={pref === 'system'} onSelect={() => setTheme('system')} />
      <MenuSeparator />
      {THEMES.map((th) => (
        <MenuCheckItem key={th.id} label={t(th.label)} checked={pref === th.id} onSelect={() => setTheme(th.id)} />
      ))}
    </>
  );
}

function RecentItems() {
  const t = useT();
  const recent = useEditor((s) => s.recentProjects);
  if (!recent.length) return <MenuItem label={t('No recent projects')} disabled onSelect={() => {}} />;
  return (
    <>
      {recent.map((r, i) => (
        <MenuItem key={r.path} label={`${i + 1}  ${fileTitle(r.path)}`} shortcut={r.name !== fileTitle(r.path) ? r.name : undefined} onSelect={() => void openRecent(r.path)} />
      ))}
      <MenuSeparator />
      <MenuItem label={t('Clear recent list')} icon="trash" onSelect={() => useEditor.getState().forgetProject()} />
    </>
  );
}

const MENUS: { name: MessageKey; items: Entry[] }[] = [
  { name: 'File', items: ['home', '-', 'new', 'open', { sub: 'Open Recent', icon: 'history', render: () => <RecentItems /> }, '-', 'save', 'saveAs', '-', 'examples', '-', 'settings'] },
  { name: 'Edit', items: ['undo', 'redo', '-', 'cut', 'copy', 'paste', 'duplicate', 'delete', '-', 'selectAll', '-', 'rotate', 'rotateCcw', 'flip', '-', 'quickAdd', 'palette'] },
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
    items: ['zoomIn', 'zoomOut', 'zoomReset', 'fit', 'zoomSelection', { sub: 'Zoom', render: () => <ZoomItems /> }, '-', 'grid', 'snap', 'logicLevels', 'voltages', '-', 'toggleLibrary', 'toggleInspector', 'toggleCode', 'toggleDock', 'focusCanvas', '-', 'sound', { sub: 'Theme', icon: 'palette', render: () => <ThemeItems /> }, 'theme', 'language'],
  },
  {
    name: 'Simulation',
    items: ['compile', '-', 'run', 'pause', 'step', 'stepInstr', 'reset', 'stop', '-', { sub: 'Speed', icon: 'gauge', render: () => <SpeedItems /> }, '-', 'probeLogic', 'probeScope', '-', 'toolchain'],
  },
  { name: 'Help', items: ['guide', '-', 'palette', 'quickAdd', '-', 'examples', 'shortcuts', '-', 'about'] },
];

const TOGGLES: Record<string, () => boolean> = {
  grid: () => useEditor.getState().showGrid,
  snap: () => useEditor.getState().snap,
  theme: () => themeInfo(useEditor.getState().appliedTheme).base === 'dark',
  sound: () => useEditor.getState().sound,
  logicLevels: () => useEditor.getState().showLogicLevels,
  voltages: () => useEditor.getState().showVoltages,
  toggleLibrary: () => useEditor.getState().showLibrary,
  toggleInspector: () => useEditor.getState().showInspector,
  toggleCode: () => useEditor.getState().showCode,
  toggleDock: () => useEditor.getState().showDock,
};

function CommandEntry({ id }: { id: string }) {
  useT();
  const c = commands[id];
  // Toggles reflect the current preferences.
  useEditor((s) => [s.showGrid, s.snap, s.appliedTheme, s.sound, s.showLibrary, s.showInspector, s.showCode, s.showDock, s.showLogicLevels, s.showVoltages].join());
  const disabled = !!c.enabled && !c.enabled();
  if (TOGGLES[id]) return <MenuCheckItem label={c.label} checked={TOGGLES[id]()} shortcut={c.shortcut} disabled={disabled} onSelect={c.run} />;
  return <MenuItem label={c.label} icon={c.icon} shortcut={c.shortcut} disabled={disabled} onSelect={c.run} />;
}

export function MenuBar() {
  const t = useT();
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
        {t('Virtual Lab')}
      </div>
      <MenuBarRoot>
        {MENUS.map((m) => (
          <MenuBarMenu key={m.name} label={t(m.name)}>
            {m.items.map((it, i) =>
              it === '-' ? (
                <MenuSeparator key={i} />
              ) : typeof it === 'string' ? (
                <CommandEntry key={it} id={it} />
              ) : (
                <SubMenu key={it.sub} label={t(it.sub)} icon={it.icon}>
                  {it.render()}
                </SubMenu>
              ),
            )}
          </MenuBarMenu>
        ))}
      </MenuBarRoot>
      <Tip content={path ?? t('Not saved yet')} align="end" direct>
        <div className="menu-title">
          {name}
          {dirty ? ' •' : ''}
          {path ? ` — ${path}` : ` — ${t('unsaved')}`}
        </div>
      </Tip>
    </div>
  );
}
