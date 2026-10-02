import { GRID } from '../../core/model/component';
import { useEditor } from '../../state/editor';
import { useProject } from '../../state/project';
import { compileFirmware, useBuildState, useSim, type BuildState } from '../../state/sim';
import { isTauri } from '../../platform';
import { Icon } from '../common/Icon';
import { Tip } from '../common/Tooltip';
import { useProblemCounts } from '../instruments/BottomDock';

const BUILD: Record<Exclude<BuildState, 'none'>, { text: string; icon: string; tip: string }> = {
  unbuilt: { text: 'Not built', icon: 'build', tip: 'Firmware not compiled yet — click to compile (Ctrl+B)' },
  compiling: { text: 'Compiling…', icon: 'build', tip: 'Compiling the firmware' },
  built: { text: 'Built', icon: 'ok', tip: 'Firmware is up to date with the code' },
  modified: { text: 'Modified', icon: 'pencil', tip: 'Code changed since the last build — click to compile (Ctrl+B)' },
  failed: { text: 'Build failed', icon: 'error', tip: 'The last build failed — click to show the problems' },
};

/** Firmware build state: up to date, modified since the build, failed or compiling. */
function BuildItem() {
  const state = useBuildState();
  const compile = useSim((s) => s.compile);
  if (state === 'none') return null;
  const b = BUILD[state];
  const sizes = state === 'built' && compile.flashBytes != null ? ` · flash ${compile.flashBytes.toLocaleString('en-US')} B, RAM ${(compile.ramBytes ?? 0).toLocaleString('en-US')} B` : '';
  return (
    <Tip content={b.tip + sizes} side="top" direct>
      <span
        className={`item clickable build-${state}`}
        role="button"
        onClick={() => {
          if (state === 'failed') useEditor.getState().set({ dockTab: 'problems', showDock: true });
          else if (state !== 'compiling') void compileFirmware();
        }}
      >
        {state === 'compiling' ? <span className="spinner" /> : <Icon name={b.icon} />}
        {b.text}
      </span>
    </Tip>
  );
}

export function StatusBar() {
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
        {state === 'running' ? 'Running' : state === 'paused' ? 'Paused' : 'Stopped'}
      </span>
      {mcu && state !== 'stopped' && (
        <Tip content="CPU cycles · program counter (MCU tab for details)" side="top" direct>
          <span className="item mono clickable" role="button" onClick={() => useEditor.getState().set({ dockTab: 'mcu', showDock: true })}>
            <Icon name="cpu" /> {mcu.cycles.toLocaleString('en-US')} cycles · PC 0x{(mcu.pc * 2).toString(16).padStart(4, '0')}
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
      {tool !== 'select' && <span className="item" style={{ color: 'var(--accent)' }}>Probe mode — click a pin (Esc to cancel)</span>}
      {tool === 'select' && state !== 'stopped' && <span className="item hint">Click parts to interact · Alt+drag moves them</span>}
      <span className="spacer" />
      <span className="item">
        {comps} parts · {wires} wires
      </span>
      <span className="item mono">
        X {(cursor.x / GRID).toFixed(1)} Y {(cursor.y / GRID).toFixed(1)} (0.1″)
      </span>
      <span className="item mono">{Math.round(zoom * 100)}%</span>
      <Tip content={toolchain ? `${toolchain.pioVersion ?? 'PlatformIO not found'} · ${toolchain.root}` : 'Toolchain status unknown'} side="top" align="end" direct>
        <span className="item clickable" role="button" onClick={() => useEditor.getState().set({ dialog: 'toolchain' })}>
          <Icon name="wrench" />
          {toolchain?.installed ? 'PlatformIO ready' : toolchain ? 'Toolchain not installed' : 'Toolchain: checking…'}
        </span>
      </Tip>
      <span className="item">{isTauri ? 'Desktop' : 'Dev (browser)'}</span>
    </div>
  );
}
