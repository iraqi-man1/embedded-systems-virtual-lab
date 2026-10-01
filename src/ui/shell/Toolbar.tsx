import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { WIRE_COLORS } from '../../core/model/circuit';
import { useEditor } from '../../state/editor';
import { useProject } from '../../state/project';
import { setSimulationSettings, useSim } from '../../state/sim';
import { commands } from '../commands';
import { Icon } from '../common/Icon';
import { DropdownMenu, MenuCheckItem, MenuItem, MenuLabel, MenuSeparator, MenuSwatches, SubMenu } from '../common/Menu';
import { Tip } from '../common/Tooltip';
import { cycleWireColor, setWireColor } from '../workspace/actions';

function useCommandRefresh() {
  useSim((s) => s.state); // re-render on simulation state changes
  useProject((s) => s.revision);
  useEditor((s) => s.selectedComponents.length + s.selectedWires.length);
}

function Btn({ id, label, className = '', active }: { id: string; label?: string; className?: string; active?: boolean }) {
  const c = commands[id];
  useCommandRefresh();
  const enabled = !c.enabled || c.enabled();
  return (
    <Tip content={c.label} shortcut={c.shortcut}>
      <button className={`tb-btn ${className}${active ? ' active' : ''}`} disabled={!enabled} onClick={c.run} aria-label={c.label}>
        {c.icon && <Icon name={c.icon} />}
        {label && <span className="label">{label}</span>}
      </button>
    </Tip>
  );
}

/** Toolbar button that opens a menu. */
function MenuButton({ icon, title, children, extra }: { icon: string; title: string; children: ReactNode; extra?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Tip content={title} suppress={open}>
      <DropdownMenu
        onOpenChange={setOpen}
        trigger={
          <button className="tb-btn" aria-label={title}>
            <Icon name={icon} />
            {extra}
            <Icon name="chevron-down" size={11} />
          </button>
        }
      >
        {children}
      </DropdownMenu>
    </Tip>
  );
}

const ALIGN_IDS = ['alignLeft', 'alignCenter', 'alignRight', 'alignTop', 'alignMiddle', 'alignBottom', 'distH', 'distV'];
const SPEEDS: { value: string; label: string }[] = [
  { value: '0.01', label: '0.01× (slow motion)' },
  { value: '0.1', label: '0.1×' },
  { value: '0.25', label: '0.25×' },
  { value: '0.5', label: '0.5×' },
  { value: '1', label: '1× real time' },
  { value: '2', label: '2×' },
  { value: '4', label: '4×' },
  { value: 'max', label: 'Max speed' },
];

function applySpeed(v: string) {
  const s = useProject.getState().project.simulation;
  if (v === 'max') setSimulationSettings(s.speed, false);
  else setSimulationSettings(Number(v), true);
}

function CmdItem({ id }: { id: string }) {
  const c = commands[id];
  return <MenuItem label={c.label} icon={c.icon} shortcut={c.shortcut} disabled={c.enabled && !c.enabled()} onSelect={c.run} />;
}

function AlignItems() {
  return (
    <>
      {ALIGN_IDS.map((id) => (
        <CmdItem key={id} id={id} />
      ))}
    </>
  );
}

function WireColorItems() {
  const wireColor = useEditor((s) => s.wireColor);
  const selectedWires = useEditor((s) => s.selectedWires);
  const wires = useProject((s) => s.project.circuit.wires);
  const selColor = selectedWires.length === 1 ? wires.find((w) => w.id === selectedWires[0])?.color : undefined;
  return (
    <>
      {selectedWires.length > 0 && (
        <>
          <MenuLabel>Selected wire{selectedWires.length > 1 ? `s (${selectedWires.length})` : ''}</MenuLabel>
          <MenuSwatches colors={WIRE_COLORS} active={selColor} onPick={(c) => setWireColor(selectedWires, c)} />
          <MenuSeparator />
        </>
      )}
      <MenuLabel>New wires</MenuLabel>
      <MenuSwatches colors={WIRE_COLORS} active={wireColor} onPick={(c) => useEditor.getState().setPrefs({ wireColor: c })} />
      <MenuSeparator />
      <MenuItem label={selectedWires.length ? 'Cycle colour of selection' : 'Cycle colour for new wires'} icon="palette" shortcut="C" onSelect={cycleWireColor} />
    </>
  );
}

function SpeedItems() {
  const settings = useProject((s) => s.project.simulation);
  const current = settings.realtime ? String(settings.speed) : 'max';
  return (
    <>
      {SPEEDS.map((s) => (
        <MenuCheckItem key={s.value} label={s.label} checked={current === s.value} onSelect={() => applySpeed(s.value)} />
      ))}
    </>
  );
}

function formatClock(t: number) {
  const ms = Math.floor(t * 1000);
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}

function ProbeButton({ tool, icon, title }: { tool: 'probe-logic' | 'probe-scope' | 'probe-meter-red'; icon: string; title: string }) {
  const current = useEditor((s) => s.tool);
  return (
    <Tip content={title}>
      <button
        className={`tb-btn${current === tool ? ' active' : ''}`}
        aria-label={title}
        onClick={() => useEditor.getState().set({ tool: current === tool ? 'select' : tool })}
      >
        <Icon name={icon} />
      </button>
    </Tip>
  );
}

const PROBES = [
  { tool: 'probe-logic' as const, icon: 'activity', title: 'Logic analyzer probe: click pins to add channels' },
  { tool: 'probe-scope' as const, icon: 'waves', title: 'Oscilloscope probe: click a pin to add a channel' },
  { tool: 'probe-meter-red' as const, icon: 'gauge', title: 'Multimeter: place the red probe' },
];
const VIEW_TOGGLES = ['toggleLibrary', 'toggleCode', 'toggleDock', 'toggleInspector'] as const;

/** Order in which groups move into the overflow menu when the window is narrow. */
const HIDE_ORDER = ['probes', 'arrange', 'view', 'file', 'edit', 'speed'];

export function Toolbar() {
  const simState = useSim((s) => s.state);
  const simTime = useSim((s) => s.simTime);
  const speed = useSim((s) => s.speed);
  const compiling = useSim((s) => s.compile.status === 'compiling');
  const starting = useSim((s) => s.starting);
  const settings = useProject((s) => s.project.simulation);
  const wireColor = useEditor((s) => s.wireColor);
  const theme = useEditor((s) => s.theme);
  const panels = useEditor((s) => [s.showLibrary, s.showCode, s.showDock, s.showInspector].join());
  const panelOn = Object.fromEntries(panels.split(',').map((x, i) => [VIEW_TOGGLES[i], x === 'true'])) as Record<string, boolean>;
  useCommandRefresh();

  // ---- overflow: groups that don't fit move into the "»" menu instead of being clipped.
  const barRef = useRef<HTMLDivElement>(null);
  const widths = useRef(new Map<string, number>());
  const overflowW = useRef(56);
  const [hidden, setHidden] = useState<string[]>([]);
  const recompute = useCallback(() => {
    const bar = barRef.current;
    if (!bar) return;
    for (const el of bar.querySelectorAll<HTMLElement>('[data-group]')) widths.current.set(el.dataset.group!, el.getBoundingClientRect().width);
    const more = bar.querySelector<HTMLElement>('[data-overflow]');
    if (more) overflowW.current = more.getBoundingClientRect().width;
    const style = getComputedStyle(bar);
    const gap = parseFloat(style.columnGap) || 0;
    const avail = bar.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    // Flex children: every group plus the spacer (and the overflow button once used).
    const need = (groups: string[], overflow: boolean) =>
      groups.reduce((a, g) => a + (widths.current.get(g) ?? 0), 0) + gap * groups.length + (overflow ? overflowW.current + gap : 0);
    const visible = [...widths.current.keys()];
    const next: string[] = [];
    for (const g of HIDE_ORDER) {
      if (need(visible.filter((v) => !next.includes(v)), next.length > 0) <= avail) break;
      next.push(g);
    }
    setHidden((prev) => (prev.join() === next.join() ? prev : next));
  }, []);
  useLayoutEffect(recompute);
  useEffect(() => {
    const ro = new ResizeObserver(recompute);
    ro.observe(barRef.current!);
    return () => ro.disconnect();
  }, [recompute]);
  const shown = (g: string) => !hidden.includes(g);

  return (
    <div className="toolbar" ref={barRef} role="toolbar" aria-label="Main toolbar">
      {shown('file') && (
        <div className="group" data-group="file">
          <Btn id="new" />
          <Btn id="open" />
          <Btn id="save" />
          <Btn id="examples" label="Examples" />
        </div>
      )}
      {shown('edit') && (
        <div className="group" data-group="edit">
          <div className="divider" />
          <Btn id="undo" />
          <Btn id="redo" />
        </div>
      )}
      {shown('arrange') && (
        <div className="group" data-group="arrange">
          <div className="divider" />
          <Btn id="rotate" />
          <Btn id="flip" />
          <Btn id="duplicate" />
          <Btn id="delete" />
          <MenuButton icon="align-left" title="Align & distribute">
            <AlignItems />
          </MenuButton>
          <MenuButton icon="cable" title="Wire colour (selected and new wires)" extra={<span className="color-dot" style={{ background: wireColor }} />}>
            <WireColorItems />
          </MenuButton>
        </div>
      )}
      {shown('probes') && (
        <div className="group" data-group="probes">
          <div className="divider" />
          {PROBES.map((p) => (
            <ProbeButton key={p.tool} {...p} />
          ))}
        </div>
      )}
      <div className="group" data-group="sim">
        <div className="divider" />
        <Btn id="compile" label={compiling ? 'Compiling…' : 'Compile'} />
        {simState === 'running' ? (
          <Btn id="pause" label="Pause" />
        ) : (
          <Tip content="Compile if needed and run" shortcut="F5">
            <button className="tb-btn run primary" onClick={commands.run.run} disabled={starting || compiling}>
              <Icon name="play" fill="currentColor" />
              <span className="label">{simState === 'paused' ? 'Resume' : starting ? 'Starting…' : 'Run'}</span>
            </button>
          </Tip>
        )}
        <Btn id="step" />
        <Btn id="reset" />
        <Btn id="stop" className="stop" />
      </div>
      {shown('speed') && (
        <div className="group" data-group="speed">
          <div className="divider" />
          <Tip content="Simulation speed">
            <select className="tb-select" aria-label="Simulation speed" value={settings.realtime ? String(settings.speed) : 'max'} onChange={(e) => applySpeed(e.target.value)}>
              {SPEEDS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Tip>
          <Tip content="Simulated time · achieved speed">
            <span className="sim-clock">
              {formatClock(simTime)}
              {simState === 'running' ? ` · ${Math.round(speed * 100)}%` : ''}
            </span>
          </Tip>
        </div>
      )}
      <div className="spacer" />
      {shown('view') && (
        <div className="group" data-group="view">
          <Tip content={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
            <button className="tb-btn" aria-label="Toggle theme" onClick={commands.theme.run}>
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
          </Tip>
          {VIEW_TOGGLES.map((id) => (
            <Btn key={id} id={id} active={panelOn[id]} />
          ))}
        </div>
      )}
      {hidden.length > 0 && (
        <div className="group" data-overflow>
          <MenuButton icon="chevrons-right" title="More tools">
            {hidden.includes('file') && (
              <>
                {['new', 'open', 'save', 'examples'].map((id) => (
                  <CmdItem key={id} id={id} />
                ))}
                <MenuSeparator />
              </>
            )}
            {hidden.includes('edit') && (
              <>
                <CmdItem id="undo" />
                <CmdItem id="redo" />
                <MenuSeparator />
              </>
            )}
            {hidden.includes('arrange') && (
              <>
                {['rotate', 'flip', 'duplicate', 'delete'].map((id) => (
                  <CmdItem key={id} id={id} />
                ))}
                <SubMenu label="Align & distribute" icon="align-left">
                  <AlignItems />
                </SubMenu>
                <SubMenu label="Wire colour" icon="cable">
                  <WireColorItems />
                </SubMenu>
                <MenuSeparator />
              </>
            )}
            {hidden.includes('probes') && (
              <>
                {PROBES.map((p) => (
                  <MenuItem key={p.tool} label={p.title.split(':')[0]} icon={p.icon} onSelect={() => useEditor.getState().set({ tool: p.tool })} />
                ))}
                <MenuSeparator />
              </>
            )}
            {hidden.includes('speed') && (
              <SubMenu label="Simulation speed" icon="gauge">
                <SpeedItems />
              </SubMenu>
            )}
            {hidden.includes('view') && (
              <>
                <MenuSeparator />
                <MenuCheckItem label="Dark theme" checked={theme === 'dark'} onSelect={commands.theme.run} />
                {VIEW_TOGGLES.map((id) => (
                  <MenuCheckItem key={id} label={commands[id].label} checked={panelOn[id]} onSelect={commands[id].run} />
                ))}
              </>
            )}
          </MenuButton>
        </div>
      )}
    </div>
  );
}

export { SpeedItems, WireColorItems, AlignItems };
