/** Items of the canvas context menu (the menu itself is opened by the workspace). */
import { WIRE_COLORS } from '../../core/model/circuit';
import { lookup } from '../../app/registry';
import { useEditor } from '../../state/editor';
import { useProject } from '../../state/project';
import { commands } from '../commands';
import { MenuItem, MenuLabel, MenuSeparator, MenuSwatches, SubMenu } from '../common/Menu';
import { assignProbe } from '../instruments/probes';
import { autoRouteWires, bringToFront, clearWirePoints, paste, setNetWireColor, setWireColor } from '../workspace/actions';

function Cmd({ id }: { id: string }) {
  const c = commands[id];
  return <MenuItem label={c.label} icon={c.icon} shortcut={c.shortcut} disabled={c.enabled && !c.enabled()} onSelect={c.run} />;
}

export function CanvasMenuItems() {
  const menu = useEditor((s) => s.contextMenu);
  const selectedWires = useEditor((s) => s.selectedWires);
  const circuit = useProject((s) => s.project.circuit);
  if (!menu) return null;

  if (menu.kind === 'component') {
    const inst = circuit.components.find((c) => c.id === menu.id);
    const def = inst && lookup(inst.type);
    return (
      <>
        <MenuLabel>
          {inst?.label} · {def?.name}
        </MenuLabel>
        <Cmd id="rotate" />
        <Cmd id="rotateCcw" />
        <Cmd id="flip" />
        <MenuSeparator />
        <Cmd id="copy" />
        <Cmd id="cut" />
        <Cmd id="duplicate" />
        <MenuSeparator />
        <MenuItem label="Bring to Front" icon="front" onSelect={() => inst && bringToFront(inst.id, true)} />
        <MenuItem label="Send to Back" icon="back" onSelect={() => inst && bringToFront(inst.id, false)} />
        <MenuSeparator />
        <MenuItem label="Properties…" icon="settings" onSelect={() => useEditor.getState().setPrefs({ showInspector: true })} />
        <Cmd id="delete" />
      </>
    );
  }

  if (menu.kind === 'wire') {
    const ids = selectedWires.length ? selectedWires : [menu.id];
    const wire = circuit.wires.find((x) => x.id === menu.id);
    return (
      <>
        <MenuLabel>{ids.length > 1 ? `Colour of ${ids.length} wires` : 'Wire colour'}</MenuLabel>
        <MenuSwatches colors={WIRE_COLORS} active={ids.length === 1 ? wire?.color : undefined} onPick={(c) => setWireColor(ids, c)} />
        <SubMenu label="Colour whole net" icon="cable">
          <MenuLabel>Every wire on this net</MenuLabel>
          <MenuSwatches colors={WIRE_COLORS} onPick={(c) => setNetWireColor(menu.id, c)} />
        </SubMenu>
        <MenuSeparator />
        <MenuItem label="Auto-route around parts" icon="route" onSelect={() => autoRouteWires(ids)} />
        <MenuItem label="Remove bends" icon="minus" onSelect={() => clearWirePoints(ids)} />
        <MenuItem label="Probe with logic analyzer" icon="activity" onSelect={() => wire && assignProbe('probe-logic', wire.from)} />
        <MenuItem label="Probe with oscilloscope" icon="waves" onSelect={() => wire && assignProbe('probe-scope', wire.from)} />
        <MenuSeparator />
        <Cmd id="delete" />
      </>
    );
  }

  const world = menu.world;
  return (
    <>
      <MenuItem label="Paste here" icon="paste" disabled={!useEditor.getState().clipboard} onSelect={() => paste(world)} />
      <Cmd id="selectAll" />
      <MenuSeparator />
      <Cmd id="fit" />
      <Cmd id="grid" />
      <MenuSeparator />
      <Cmd id="examples" />
    </>
  );
}
