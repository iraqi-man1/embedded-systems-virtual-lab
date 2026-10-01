import { useEffect, useRef, useState } from 'react';
import { WIRE_COLORS } from '../../core/model/circuit';
import { useEditor } from '../../state/editor';
import { useProject } from '../../state/project';
import { setSimulationSettings, useSim } from '../../state/sim';
import { commands } from '../commands';
import { Icon } from '../common/Icon';
import { setWireColor } from '../workspace/actions';

function Btn({ id, label, className = '', active }: { id: string; label?: string; className?: string; active?: boolean }) {
  const c = commands[id];
  useSim((s) => s.state); // re-render on simulation state changes
  useProject((s) => s.revision);
  useEditor((s) => s.selectedComponents.length + s.selectedWires.length);
  const enabled = !c.enabled || c.enabled();
  return (
    <button className={`tb-btn ${className}${active ? ' active' : ''}`} disabled={!enabled} onClick={c.run} title={`${c.label}${c.shortcut ? ` (${c.shortcut})` : ''}`}>
      {c.icon && <Icon name={c.icon} />}
      {label && <span className="label">{label}</span>}
    </button>
  );
}

function Dropdown({ icon, title, children }: { icon: string; title: string; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, []);
  return (
    <div className="menu-root" ref={ref} style={{ position: 'relative' }}>
      <button className="tb-btn" title={title} onClick={() => setOpen(!open)}>
        <Icon name={icon} />
        <Icon name="chevron-down" size={11} />
      </button>
      {open && <div className="dropdown" style={{ minWidth: 200 }}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

function formatClock(t: number) {
  const ms = Math.floor(t * 1000);
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}

export function Toolbar() {
  const simState = useSim((s) => s.state);
  const simTime = useSim((s) => s.simTime);
  const speed = useSim((s) => s.speed);
  const compiling = useSim((s) => s.compile.status === 'compiling');
  const starting = useSim((s) => s.starting);
  const settings = useProject((s) => s.project.simulation);
  const tool = useEditor((s) => s.tool);
  const wireColor = useEditor((s) => s.wireColor);
  const selectedWires = useEditor((s) => s.selectedWires);
  const theme = useEditor((s) => s.theme);
  const panels = useEditor((s) => [s.showLibrary, s.showCode, s.showDock, s.showInspector].join());
  const [showLibrary, showCode, showDock, showInspector] = panels.split(',').map((x) => x === 'true');

  return (
    <div className="toolbar">
      <div className="group">
        <Btn id="new" />
        <Btn id="open" />
        <Btn id="save" />
        <Btn id="examples" label="Examples" />
      </div>
      <div className="divider" />
      <div className="group">
        <Btn id="undo" />
        <Btn id="redo" />
      </div>
      <div className="divider" />
      <div className="group">
        <Btn id="rotate" />
        <Btn id="flip" />
        <Btn id="duplicate" />
        <Btn id="delete" />
        <Dropdown icon="align-left" title="Align & distribute">
          {(close) =>
            ['alignLeft', 'alignCenter', 'alignRight', 'alignTop', 'alignMiddle', 'alignBottom', 'distH', 'distV'].map((id) => {
              const c = commands[id];
              return (
                <button key={id} className="item" disabled={c.enabled && !c.enabled()} onClick={() => (close(), c.run())}>
                  <Icon name={c.icon!} /> {c.label}
                </button>
              );
            })
          }
        </Dropdown>
        <Dropdown icon="cable" title="Wire colour (new wires and selection)">
          {(close) => (
            <div className="swatches" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 8, width: 180 }}>
              {WIRE_COLORS.map((c) => (
                <button
                  key={c.value}
                  className={`swatch${wireColor === c.value ? ' active' : ''}`}
                  style={{ background: c.value }}
                  title={c.label}
                  onClick={() => {
                    if (selectedWires.length) setWireColor(selectedWires, c.value);
                    else useEditor.getState().setPrefs({ wireColor: c.value });
                    close();
                  }}
                />
              ))}
            </div>
          )}
        </Dropdown>
      </div>
      <div className="divider" />
      <div className="group">
        <button
          className={`tb-btn${tool === 'probe-logic' ? ' active' : ''}`}
          title="Logic analyzer probe: click pins to add channels"
          onClick={() => useEditor.getState().set({ tool: tool === 'probe-logic' ? 'select' : 'probe-logic' })}
        >
          <Icon name="activity" />
        </button>
        <button
          className={`tb-btn${tool === 'probe-scope' ? ' active' : ''}`}
          title="Oscilloscope probe: click a pin to add a channel"
          onClick={() => useEditor.getState().set({ tool: tool === 'probe-scope' ? 'select' : 'probe-scope' })}
        >
          <Icon name="waves" />
        </button>
        <button
          className={`tb-btn${tool === 'probe-meter-red' ? ' active' : ''}`}
          title="Multimeter: place the red probe"
          onClick={() => useEditor.getState().set({ tool: tool === 'probe-meter-red' ? 'select' : 'probe-meter-red' })}
        >
          <Icon name="gauge" />
        </button>
      </div>
      <div className="divider" />
      <div className="group">
        <Btn id="compile" label={compiling ? 'Compiling…' : 'Compile'} />
        {simState === 'running' ? (
          <Btn id="pause" label="Pause" />
        ) : (
          <button className="tb-btn run primary" onClick={commands.run.run} disabled={starting || compiling} title="Compile if needed and run (F5)">
            <Icon name="play" fill="currentColor" />
            <span className="label">{simState === 'paused' ? 'Resume' : starting ? 'Starting…' : 'Run'}</span>
          </button>
        )}
        <Btn id="step" />
        <Btn id="reset" />
        <Btn id="stop" className="stop" />
      </div>
      <div className="divider" />
      <div className="group">
        <select
          className="tb-select"
          title="Simulation speed"
          value={settings.realtime ? String(settings.speed) : 'max'}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'max') setSimulationSettings(settings.speed, false);
            else setSimulationSettings(Number(v), true);
          }}
        >
          <option value="0.01">0.01× (slow motion)</option>
          <option value="0.1">0.1×</option>
          <option value="0.25">0.25×</option>
          <option value="0.5">0.5×</option>
          <option value="1">1× real time</option>
          <option value="2">2×</option>
          <option value="4">4×</option>
          <option value="max">Max speed</option>
        </select>
        <span className="sim-clock" title="Simulated time · achieved speed">
          {formatClock(simTime)}
          {simState === 'running' ? ` · ${Math.round(speed * 100)}%` : ''}
        </span>
      </div>
      <div className="spacer" />
      <div className="group">
        <button className="tb-btn" title="Toggle theme" onClick={commands.theme.run}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
        <Btn id="toggleLibrary" active={showLibrary} />
        <Btn id="toggleCode" active={showCode} />
        <Btn id="toggleDock" active={showDock} />
        <Btn id="toggleInspector" active={showInspector} />
      </div>
    </div>
  );
}
