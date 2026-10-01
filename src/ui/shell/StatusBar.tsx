import { GRID } from '../../core/model/component';
import { useEditor } from '../../state/editor';
import { useProject } from '../../state/project';
import { useSim } from '../../state/sim';
import { isTauri } from '../../platform';
import { Icon } from '../common/Icon';
import { useProblemCounts } from '../instruments/BottomDock';

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
        <span className="item mono" title="CPU cycles · program counter">
          <Icon name="cpu" /> {mcu.cycles.toLocaleString()} cycles · PC 0x{(mcu.pc * 2).toString(16).padStart(4, '0')}
        </span>
      )}
      <span className="item clickable" onClick={() => useEditor.getState().set({ dockTab: 'problems', showDock: true })}>
        <Icon name="error" />
        <span style={{ color: errors ? 'var(--err)' : undefined }}>{errors}</span>
        <Icon name="warning" />
        <span style={{ color: warnings ? 'var(--warn)' : undefined }}>{warnings}</span>
      </span>
      {tool !== 'select' && <span className="item" style={{ color: 'var(--accent)' }}>Probe mode — click a pin (Esc to cancel)</span>}
      <span className="spacer" />
      <span className="item">
        {comps} parts · {wires} wires
      </span>
      <span className="item mono">
        X {(cursor.x / GRID).toFixed(1)} Y {(cursor.y / GRID).toFixed(1)} (0.1″)
      </span>
      <span className="item mono">{Math.round(zoom * 100)}%</span>
      <span
        className="item clickable"
        title={toolchain ? `${toolchain.pioVersion ?? 'PlatformIO not found'} · ${toolchain.root}` : 'Toolchain status unknown'}
        onClick={() => useEditor.getState().set({ dialog: 'toolchain' })}
      >
        <Icon name="wrench" />
        {toolchain?.installed ? 'PlatformIO ready' : toolchain ? 'Toolchain not installed' : 'Toolchain: checking…'}
      </span>
      <span className="item">{isTauri ? 'Desktop' : 'Dev (browser)'}</span>
    </div>
  );
}
