import { GRID } from '../../core/model/component';
import type { MessageKey } from '../../i18n';
import { useT } from '../../i18n/react';
import { useEditor } from '../../state/editor';
import { useProject } from '../../state/project';
import { compileFirmware, useBuildState, useSim, type BuildState } from '../../state/sim';
import { isTauri } from '../../platform';
import { Icon } from '../common/Icon';
import { Tip } from '../common/Tooltip';
import { useProblemCounts } from '../instruments/BottomDock';

const BUILD: Record<Exclude<BuildState, 'none'>, { text: MessageKey; icon: string; tip: MessageKey }> = {
  unbuilt: { text: 'Not built', icon: 'build', tip: 'Firmware not compiled yet — click to compile (Ctrl+B)' },
  compiling: { text: 'Compiling…', icon: 'build', tip: 'Compiling the firmware' },
  built: { text: 'Built', icon: 'ok', tip: 'Firmware is up to date with the code' },
  modified: { text: 'Modified', icon: 'pencil', tip: 'Code changed since the last build — click to compile (Ctrl+B)' },
  failed: { text: 'Build failed', icon: 'error', tip: 'The last build failed — click to show the problems' },
};

/** Firmware build state: up to date, modified since the build, failed or compiling. */
function BuildItem() {
  const t = useT();
  const state = useBuildState();
  const compile = useSim((s) => s.compile);
  if (state === 'none') return null;
  const b = BUILD[state];
  const sizes =
    state === 'built' && compile.flashBytes != null
      ? t(' · flash {flash} B, RAM {ram} B', { flash: compile.flashBytes.toLocaleString('en-US'), ram: (compile.ramBytes ?? 0).toLocaleString('en-US') })
      : '';
  return (
    <Tip content={t(b.tip) + sizes} side="top" direct>
      <span
        className={`item clickable build-${state}`}
        role="button"
        onClick={() => {
          if (state === 'failed') useEditor.getState().set({ dockTab: 'problems', showDock: true });
          else if (state !== 'compiling') void compileFirmware();
        }}
      >
        {state === 'compiling' ? <span className="spinner" /> : <Icon name={b.icon} />}
        {t(b.text)}
      </span>
    </Tip>
  );
}

export function StatusBar() {
  const t = useT();
  const state = useSim((s) => s.state);
  const mcus = useSim((s) => s.mcus);
  const toolchain = useSim((s) => s.toolchain);
  const cursor = useEditor((s) => s.cursor);
  const zoom = useEditor((s) => s.viewport.zoom);
  const tool = useEditor((s) => s.tool);
  const comps = useProject((s) => s.project.circuit.components.length);
  const wires = useProject((s) => s.project.circuit.wires.length);
  const { errors, warnings } = useProblemCounts();
  const mcu = mcus[0];
  return (
    <div className="statusbar">
      <span className={`item state-${state}`}>
        <Icon name={state === 'running' ? 'play' : state === 'paused' ? 'pause' : 'stop'} />
        {state === 'running' ? t('Running') : state === 'paused' ? t('Paused') : t('Stopped')}
      </span>
      {mcu && state !== 'stopped' && (
        <Tip content={t('CPU cycles · program counter (MCU tab for details)')} side="top" direct>
          <span className="item mono clickable" role="button" onClick={() => useEditor.getState().set({ dockTab: 'mcu', showDock: true })}>
            <Icon name="cpu" /> {t('{cycles} cycles · PC {pc}', { cycles: mcu.cycles.toLocaleString('en-US'), pc: `0x${(mcu.pc * 2).toString(16).padStart(4, '0')}` })}
          </span>
        </Tip>
      )}
      <BuildItem />
      <span className="item clickable" onClick={() => useEditor.getState().set({ dockTab: 'problems', showDock: true })}>
        <Icon name="error" />
        <span style={{ color: errors ? 'var(--err)' : undefined }}>{errors}</span>
        <Icon name="warning" />
        <span style={{ color: warnings ? 'var(--warn)' : undefined }}>{warnings}</span>
      </span>
      {tool !== 'select' && <span className="item" style={{ color: 'var(--accent)' }}>{t('Probe mode — click a pin (Esc to cancel)')}</span>}
      {tool === 'select' && state !== 'stopped' && <span className="item hint">{t('Click parts to interact · Alt+drag moves them')}</span>}
      <span className="spacer" />
      <span className="item">{t('{parts} parts · {wires} wires', { parts: comps, wires })}</span>
      <span className="item mono">
        X {(cursor.x / GRID).toFixed(1)} Y {(cursor.y / GRID).toFixed(1)} (0.1″)
      </span>
      <span className="item mono">{Math.round(zoom * 100)}%</span>
      <Tip content={toolchain ? `${toolchain.pioVersion ?? t('PlatformIO not found')} · ${toolchain.root}` : t('Toolchain status unknown')} side="top" align="end" direct>
        <span className="item clickable" role="button" onClick={() => useEditor.getState().set({ dialog: 'toolchain' })}>
          <Icon name="wrench" />
          {toolchain?.installed ? t('PlatformIO ready') : toolchain ? t('Toolchain not installed') : t('Toolchain: checking…')}
        </span>
      </Tip>
      <span className="item">{isTauri ? t('Desktop') : t('Dev (browser)')}</span>
    </div>
  );
}
