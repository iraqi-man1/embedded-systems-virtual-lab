import { useEffect, useState } from 'react';
import { rich, useT } from '../../i18n/react';
import { isTauri, toolchain } from '../../platform';
import { useEditor } from '../../state/editor';
import { refreshToolchain, useSim } from '../../state/sim';
import { registry } from '../../app/registry';
import { APP_VERSION } from '../../app/version';
import { commands } from '../commands';
import { ModalFrame } from '../common/Dialog';
import { Icon } from '../common/Icon';
import { ExampleGallery } from '../home/ExampleGallery';
import { SettingsDialog } from './SettingsDialog';

function Modal({ title, small, wide, children, footer }: { title: string; small?: boolean; wide?: boolean; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <ModalFrame title={title} small={small} wide={wide} footer={footer} onClose={() => useEditor.getState().set({ dialog: null })}>
      {children}
    </ModalFrame>
  );
}

function ExamplesDialog() {
  const t = useT();
  return (
    <Modal title={t('Examples & Templates')} wide>
      <p style={{ marginTop: 0, color: 'var(--text-2)' }}>
        {t('Each example opens a complete project — circuit and firmware.')} {rich(t('Press {key} to compile and simulate.'), { key: <kbd>F5</kbd> })}
      </p>
      <ExampleGallery autoFocus />
    </Modal>
  );
}

function ToolchainDialog() {
  const t = useT();
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
      useEditor.getState().notify(t('Firmware toolchain installed.'), 'success');
    } catch (e) {
      setLog((l) => l + `\nERROR: ${(e as Error).message ?? e}\n`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={t('Firmware Toolchain')}
      small
      footer={
        <>
          <button className="btn" onClick={() => void refreshToolchain()} disabled={busy}>
            <Icon name="reset" /> {t('Re-check')}
          </button>
          {isTauri && (
            <button className="btn primary" onClick={install} disabled={busy}>
              <Icon name="package" /> {status?.installed ? t('Reinstall / update') : t('Install toolchain')}
            </button>
          )}
        </>
      }
    >
      <p style={{ marginTop: 0 }}>
        {rich(
          t(
            'Firmware is compiled locally by {pio} (Apache-2.0) with the official AVR GCC toolchain and Arduino core. After a one-time installation (internet required), compilation works fully offline.',
          ),
          { pio: <b>PlatformIO Core</b> },
        )}
      </p>
      <table className="kbd-table">
        <tbody>
          <tr>
            <td>{t('Status')}</td>
            <td style={{ color: status?.installed ? 'var(--ok)' : 'var(--warn)' }}>{status ? (status.installed ? t('Installed') : t('Not installed')) : t('Unknown')}</td>
          </tr>
          <tr>
            <td>PlatformIO</td>
            <td>{status?.pioVersion ?? '—'}</td>
          </tr>
          <tr>
            <td>{t('Platforms')}</td>
            <td>{status?.platforms.join(', ') || '—'}</td>
          </tr>
          <tr>
            <td>{t('Location')}</td>
            <td className="ltr" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, wordBreak: 'break-all' }}>
              {status?.root ?? '—'}
            </td>
          </tr>
        </tbody>
      </table>
      {!isTauri && (
        <p className="note" style={{ marginTop: 10 }}>
          {t("Running in development (browser) mode: the dev server's local toolchain is used.")}
        </p>
      )}
      {isTauri && (
        <p style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
          {t('Installation needs Python 3.9+ on the PATH. It creates a private environment; nothing is installed system-wide.')}
        </p>
      )}
      {(busy || log) && <div className="log-box">{log || t('Starting…')}</div>}
    </Modal>
  );
}

function ShortcutsDialog() {
  const t = useT();
  const rows: [string, string][] = [
    [t('Run / resume (compiles if needed)'), 'F5'],
    [t('Pause'), 'F6'],
    [t('Stop'), 'Shift+F5'],
    [t('Reset board'), 'Ctrl+F5'],
    [t('Step 1 ms / one instruction'), 'F10 / F11'],
    [t('Compile (while running: flash the board)'), 'Ctrl+B'],
    [t('Command palette'), 'Ctrl+Shift+P'],
    [t('Add a part'), t('Ctrl+K or double-click the canvas')],
    [t('Search the library'), '/'],
    [t('New / Open / Save'), 'Ctrl+N / Ctrl+O / Ctrl+S'],
    [t('Undo / Redo'), 'Ctrl+Z / Ctrl+Y'],
    [t('Copy / Cut / Paste / Duplicate'), 'Ctrl+C / X / V / D'],
    [t('Delete selection'), 'Del'],
    [t('Rotate CW / CCW'), 'R / Shift+R'],
    [t('Flip horizontally'), 'H'],
    [t('Nudge (×5 with Shift)'), t('Arrow keys')],
    [t('Move the view (nothing selected)'), t('Arrow keys')],
    [t('Zoom in / out / 100%'), '+ / − / 0'],
    [t('Fit circuit to window / zoom to selection'), 'F / Shift+F'],
    [t('Focus the canvas (hide panels)'), 'Ctrl+`'],
    [t('Toggle grid'), 'G'],
    [t('Show or hide the minimap'), 'M'],
    [t('Show voltages on wires'), 'V'],
    [t('Wire colour (selected / new wire)'), t('1–9, C cycles')],
    [t('Pan'), t('Right-drag, middle-drag, or Space + drag')],
    [t('Zoom at cursor'), t('Mouse wheel')],
    [t('Scroll sideways'), t('Shift + mouse wheel')],
    [t('Zoom on a touchpad'), t('Pinch, or Ctrl + scroll')],
    [t('Part information'), t('Rest the mouse on a part · F1')],
    [t('Start a wire'), t('Click a pin (or drag from it)')],
    [t('Add a bend while wiring'), t('Click empty canvas')],
    [t('Cancel wire / probe / selection'), t('Esc or right-click')],
    [t('Junction on a wire'), t('Finish a wire on another wire')],
    [t('Add bend to a wire'), t('Double-click or drag the selected wire')],
    [t('Multi-select'), t('Shift+click or drag a box')],
    [t('Interact while simulating'), t('Click buttons, drag/scroll knobs')],
    [t('Move a part while simulating'), t('Alt + drag')],
  ];
  return (
    <Modal title={t('Keyboard & Mouse')} small>
      <table className="kbd-table">
        <tbody>
          {rows.map(([a, b]) => (
            <tr key={a}>
              <td>{a}</td>
              <td style={{ textAlign: 'end' }}>
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
  const t = useT();
  const all = registry.all();
  return (
    <Modal
      title={t('Embedded Systems Virtual Lab')}
      small
      footer={
        <button className="btn" onClick={commands.shortcuts.run}>
          {t('Shortcuts')}
        </button>
      }
    >
      <p style={{ marginTop: 0 }}>{t('Version {version} — an offline desktop laboratory for designing, programming and simulating embedded systems.', { version: APP_VERSION })}</p>
      <p>
        {t('Component library: {n} parts ({full} fully simulated, {partial} partially, {visual} visual-only).', {
          n: all.length,
          full: all.filter((d) => d.simulation.support === 'full').length,
          partial: all.filter((d) => d.simulation.support === 'partial').length,
          visual: all.filter((d) => d.simulation.support === 'visual-only').length,
        })}
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-2)' }}>
        {t(
          'Built on open-source technology: Tauri, React, avr8js and @wokwi/elements (Wokwi, MIT), Monaco Editor (MIT), PlatformIO Core (Apache-2.0), AVR GCC (GPL with runtime exception, invoked as a separate program). See docs/01-technology-research.md for the full licence survey.',
        )}
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
  if (dialog === 'settings') return <SettingsDialog />;
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
