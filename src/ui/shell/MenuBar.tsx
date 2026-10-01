import { useEffect, useRef, useState } from 'react';
import { useEditor } from '../../state/editor';
import { useProject } from '../../state/project';
import { commands } from '../commands';
import { Icon } from '../common/Icon';

type Entry = string | '-' | { label: string; items: string[] };

const MENUS: { name: string; items: Entry[] }[] = [
  { name: 'File', items: ['new', 'open', '-', 'save', 'saveAs', '-', 'examples'] },
  { name: 'Edit', items: ['undo', 'redo', '-', 'cut', 'copy', 'paste', 'duplicate', 'delete', '-', 'selectAll', '-', 'rotate', 'rotateCcw', 'flip'] },
  { name: 'Arrange', items: ['alignLeft', 'alignCenter', 'alignRight', '-', 'alignTop', 'alignMiddle', 'alignBottom', '-', 'distH', 'distV'] },
  { name: 'View', items: ['zoomIn', 'zoomOut', 'zoomReset', 'fit', '-', 'grid', 'snap', '-', 'toggleLibrary', 'toggleCode', 'toggleInspector', 'toggleDock', '-', 'sound', 'theme'] },
  { name: 'Simulation', items: ['compile', '-', 'run', 'pause', 'step', 'stepInstr', 'reset', 'stop', '-', 'probeLogic', 'probeScope', '-', 'toolchain'] },
  { name: 'Help', items: ['examples', 'shortcuts', '-', 'about'] },
];

function MenuItem({ id, close }: { id: string; close: () => void }) {
  const c = commands[id];
  const showGrid = useEditor((s) => s.showGrid);
  const snap = useEditor((s) => s.snap);
  const editor = useEditor();
  const enabled = !c.enabled || c.enabled();
  const checked =
    (id === 'grid' && showGrid) ||
    (id === 'snap' && snap) ||
    (id === 'theme' && editor.theme === 'dark') ||
    (id === 'sound' && editor.sound) ||
    (id === 'toggleLibrary' && editor.showLibrary) ||
    (id === 'toggleInspector' && editor.showInspector) ||
    (id === 'toggleCode' && editor.showCode) ||
    (id === 'toggleDock' && editor.showDock);
  const isToggle = ['grid', 'snap', 'sound', 'theme', 'toggleLibrary', 'toggleInspector', 'toggleCode', 'toggleDock'].includes(id);
  return (
    <button
      className="item"
      disabled={!enabled}
      onClick={() => {
        close();
        c.run();
      }}
    >
      {isToggle ? <span style={{ width: 14, textAlign: 'center' }}>{checked ? '✓' : ''}</span> : c.icon ? <Icon name={c.icon} /> : <span style={{ width: 14 }} />}
      {c.label}
      {c.shortcut && <span className="kbd">{c.shortcut}</span>}
    </button>
  );
}

export function MenuBar() {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const name = useProject((s) => s.project.meta.name);
  const dirty = useProject((s) => s.dirty);
  const path = useProject((s) => s.filePath);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, []);
  useEffect(() => {
    document.title = `${dirty ? '● ' : ''}${name} — Embedded Systems Virtual Lab`;
  }, [name, dirty]);
  return (
    <div className="menubar" ref={ref}>
      <div className="brand">
        <svg viewBox="0 0 512 512">
          <rect width="512" height="512" rx="96" fill="#0f2a3d" />
          <rect x="136" y="136" width="240" height="240" rx="24" fill="#1d4f6e" stroke="#5ad1ff" strokeWidth="14" />
          <path d="M190 300l44-88 40 64 22-36 26 60" fill="none" stroke="#ffd166" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Virtual Lab
      </div>
      {MENUS.map((m) => (
        <div key={m.name} className={`menu-root${open === m.name ? ' open' : ''}`}>
          <button onMouseDown={() => setOpen(open === m.name ? null : m.name)} onMouseEnter={() => open && setOpen(m.name)}>
            {m.name}
          </button>
          {open === m.name && (
            <div className="dropdown">
              {m.items.map((it, i) =>
                it === '-' ? <div key={i} className="sep" /> : typeof it === 'string' ? <MenuItem key={it} id={it} close={() => setOpen(null)} /> : null,
              )}
            </div>
          )}
        </div>
      ))}
      <div className="menu-title" title={path ?? 'Not saved yet'}>
        {name}
        {dirty ? ' •' : ''}
        {path ? ` — ${path}` : ' — unsaved'}
      </div>
    </div>
  );
}
