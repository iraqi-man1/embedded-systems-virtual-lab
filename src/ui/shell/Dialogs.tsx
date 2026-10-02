import { useEffect, useState } from 'react';
import { EXAMPLES, loadExample } from '../../examples';
import { isTauri, toolchain } from '../../platform';
import { useEditor } from '../../state/editor';
import { refreshToolchain, useSim } from '../../state/sim';
import { registry } from '../../app/registry';
import { APP_VERSION } from '../../app/version';
import { commands } from '../commands';
import { ModalFrame } from '../common/Dialog';
import { Icon } from '../common/Icon';

function Modal({ title, small, children, footer }: { title: string; small?: boolean; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <ModalFrame title={title} small={small} footer={footer} onClose={() => useEditor.getState().set({ dialog: null })}>
      {children}
    </ModalFrame>
  );
}

/** Tags shared by several examples, most common first (the filter chips). */
const EXAMPLE_TAGS = (() => {
  const count = new Map<string, number>();
  for (const ex of EXAMPLES) for (const t of ex.tags) count.set(t, (count.get(t) ?? 0) + 1);
  return [...count].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
})();

function ExamplesDialog() {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const shown = EXAMPLES.filter(
    (ex) => (!tag || ex.tags.includes(tag)) && (!q || [ex.title, ex.summary, ...ex.tags].some((t) => t.toLowerCase().includes(q))),
  );
  return (
    <Modal title="Examples & Templates">
      <p style={{ marginTop: 0, color: 'var(--text-2)' }}>
        Each example opens a complete project — circuit and firmware. Press <kbd>F5</kbd> to compile and simulate.
      </p>
      <div className="examples-filter">
        <div className="search-box">
          <Icon name="search" />
          <input autoFocus placeholder="Search examples (e.g. sensor, I2C, PWM)" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search examples" />
        </div>
        <span className="count">
          {shown.length} of {EXAMPLES.length}
        </span>
      </div>
      <div className="chips examples-tags">
        <button className={`chip${tag === null ? ' active' : ''}`} aria-pressed={tag === null} onClick={() => setTag(null)}>
          All
        </button>
        {EXAMPLE_TAGS.map((t) => (
          <button key={t} className={`chip${tag === t ? ' active' : ''}`} aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="examples">
        {shown.map((ex) => (
          <div
            key={ex.id}
            className="example"
            role="button"
            tabIndex={0}
            onClick={() => loadExample(ex.id)}
            onKeyDown={(e) => e.key === 'Enter' && loadExample(ex.id)}
          >
            <h4>{ex.title}</h4>
            <p>{ex.summary}</p>
            <div className="tags">
              {ex.tags.map((t) => (
                <span key={t} className={`chip${tag === t ? ' active' : ''}`}>
                  {t}
                </span>
              ))}
            </div>
          </div>
        ))}
        {!shown.length && <div className="empty-note">No example matches. Try another word or tag.</div>}
      </div>
    </Modal>
  );
}

function ToolchainDialog() {
  const status = useSim((s) => s.toolchain);
  const [log, setLog] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void refreshToolchain();
  }, []);
  const install = async () => {
    setBusy(true);
    setLog('');
    try {
      await toolchain.install((line) => setLog((l) => (l + line + '\n').slice(-40000)));
      await refreshToolchain();
      useEditor.getState().notify('Firmware toolchain installed.', 'success');
    } catch (e) {
      setLog((l) => l + `\nERROR: ${(e as Error).message ?? e}\n`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Firmware Toolchain"
      small
      footer={
        <>
          <button className="btn" onClick={() => void refreshToolchain()} disabled={busy}>
            <Icon name="reset" /> Re-check
          </button>
          {isTauri && (
            <button className="btn primary" onClick={install} disabled={busy}>
              <Icon name="package" /> {status?.installed ? 'Reinstall / update' : 'Install toolchain'}
            </button>
          )}
        </>
      }
    >
      <p style={{ marginTop: 0 }}>
        Firmware is compiled locally by <b>PlatformIO Core</b> (Apache-2.0) with the official AVR GCC toolchain and Arduino core. After a
        one-time installation (internet required), compilation works fully offline.
      </p>
      <table className="kbd-table">
        <tbody>
          <tr>
            <td>Status</td>
            <td style={{ color: status?.installed ? 'var(--ok)' : 'var(--warn)' }}>{status ? (status.installed ? 'Installed' : 'Not installed') : 'Unknown'}</td>
          </tr>
          <tr>
            <td>PlatformIO</td>
            <td>{status?.pioVersion ?? '—'}</td>
          </tr>
          <tr>
            <td>Platforms</td>
            <td>{status?.platforms.join(', ') || '—'}</td>
          </tr>
          <tr>
            <td>Location</td>
            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, wordBreak: 'break-all' }}>{status?.root ?? '—'}</td>
          </tr>
        </tbody>
      </table>
      {!isTauri && <p className="note" style={{ marginTop: 10 }}>Running in development (browser) mode: the dev server's local toolchain is used.</p>}
      {isTauri && <p style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Installation needs Python 3.9+ on the PATH. It creates a private environment; nothing is installed system-wide.</p>}
      {(busy || log) && <div className="log-box">{log || 'Starting…'}</div>}
    </Modal>
  );
}

function ShortcutsDialog() {
  const rows: [string, string][] = [
    ['Run / resume (compiles if needed)', 'F5'],
    ['Pause', 'F6'],
    ['Stop', 'Shift+F5'],
    ['Reset board', 'Ctrl+F5'],
    ['Step 1 ms / one instruction', 'F10 / F11'],
    ['Compile (while running: flash the board)', 'Ctrl+B'],
    ['Command palette', 'Ctrl+Shift+P'],
    ['Add a part', 'Ctrl+K or double-click the canvas'],
    ['Search the library', '/'],
    ['New / Open / Save', 'Ctrl+N / Ctrl+O / Ctrl+S'],
    ['Undo / Redo', 'Ctrl+Z / Ctrl+Y'],
    ['Copy / Cut / Paste / Duplicate', 'Ctrl+C / X / V / D'],
    ['Delete selection', 'Del'],
    ['Rotate CW / CCW', 'R / Shift+R'],
    ['Flip horizontally', 'H'],
    ['Nudge (×5 with Shift)', 'Arrow keys'],
    ['Zoom in / out / 100%', '+ / − / 0'],
    ['Fit circuit to window / zoom to selection', 'F / Shift+F'],
    ['Focus the canvas (hide panels)', 'Ctrl+`'],
    ['Toggle grid', 'G'],
    ['Show voltages on wires', 'V'],
    ['Wire colour (selected / new wire)', '1–9, C cycles'],
    ['Pan', 'Right-drag, middle-drag, or Space + drag'],
    ['Zoom at cursor', 'Mouse wheel'],
    ['Start a wire', 'Click a pin (or drag from it)'],
    ['Add a bend while wiring', 'Click empty canvas'],
    ['Cancel wire / probe / selection', 'Esc or right-click'],
    ['Junction on a wire', 'Finish a wire on another wire'],
    ['Add bend to a wire', 'Double-click or drag the selected wire'],
    ['Multi-select', 'Shift+click or drag a box'],
    ['Interact while simulating', 'Click buttons, drag/scroll knobs'],
    ['Move a part while simulating', 'Alt + drag'],
  ];
  return (
    <Modal title="Keyboard & Mouse" small>
      <table className="kbd-table">
        <tbody>
          {rows.map(([a, b]) => (
            <tr key={a}>
              <td>{a}</td>
              <td style={{ textAlign: 'right' }}>
                <kbd>{b}</kbd>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

function AboutDialog() {
  const all = registry.all();
  return (
    <Modal title="Embedded Systems Virtual Lab" small footer={<button className="btn" onClick={commands.shortcuts.run}>Shortcuts</button>}>
      <p style={{ marginTop: 0 }}>Version {APP_VERSION} — an offline desktop laboratory for designing, programming and simulating embedded systems.</p>
      <p>
        Component library: {all.length} parts ({all.filter((d) => d.simulation.support === 'full').length} fully simulated,{' '}
        {all.filter((d) => d.simulation.support === 'partial').length} partially, {all.filter((d) => d.simulation.support === 'visual-only').length}{' '}
        visual-only).
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-2)' }}>
        Built on open-source technology: Tauri, React, avr8js and @wokwi/elements (Wokwi, MIT), Monaco Editor (MIT), PlatformIO Core (Apache-2.0),
        AVR GCC (GPL with runtime exception, invoked as a separate program). See docs/01-technology-research.md for the full licence survey.
      </p>
    </Modal>
  );
}

export function Dialogs() {
  const dialog = useEditor((s) => s.dialog);
  if (dialog === 'examples') return <ExamplesDialog />;
  if (dialog === 'toolchain') return <ToolchainDialog />;
  if (dialog === 'shortcuts') return <ShortcutsDialog />;
  if (dialog === 'about') return <AboutDialog />;
  return null;
}

export function Toasts() {
  const toasts = useEditor((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => useEditor.getState().dismissToast(t.id)}>
          <Icon name={t.kind === 'error' ? 'error' : t.kind === 'warning' ? 'warning' : t.kind === 'success' ? 'ok' : 'info'} />
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
