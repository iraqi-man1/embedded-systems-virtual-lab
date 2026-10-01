import { useEffect, useRef } from 'react';
import { WIRE_COLORS } from '../../core/model/circuit';
import { lookup } from '../../app/registry';
import { useEditor } from '../../state/editor';
import { useProject } from '../../state/project';
import { commands } from '../commands';
import { Icon } from '../common/Icon';
import { assignProbe } from '../instruments/probes';
import { autoRouteWires, bringToFront, clearWirePoints, paste, setWireColor } from '../workspace/actions';

function Item({ id, close }: { id: string; close: () => void }) {
  const c = commands[id];
  return (
    <button className="item" disabled={c.enabled && !c.enabled()} onClick={() => (close(), c.run())}>
      {c.icon ? <Icon name={c.icon} /> : <span style={{ width: 14 }} />} {c.label}
      {c.shortcut && <span className="kbd">{c.shortcut}</span>}
    </button>
  );
}

export function ContextMenu() {
  const menu = useEditor((s) => s.contextMenu);
  const selectedWires = useEditor((s) => s.selectedWires);
  const circuit = useProject((s) => s.project.circuit);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => useEditor.getState().set({ contextMenu: null });

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [menu]);

  if (!menu) return null;
  const left = Math.min(menu.x, window.innerWidth - 240);
  const top = Math.min(menu.y, window.innerHeight - 360);
  let body: React.ReactNode;
  if (menu.target.kind === 'component') {
    const inst = circuit.components.find((c) => c.id === (menu.target as { id: string }).id);
    const def = inst && lookup(inst.type);
    body = (
      <>
        <div className="label">
          {inst?.label} · {def?.name}
        </div>
        <Item id="rotate" close={close} />
        <Item id="rotateCcw" close={close} />
        <Item id="flip" close={close} />
        <div className="sep" />
        <Item id="copy" close={close} />
        <Item id="cut" close={close} />
        <Item id="duplicate" close={close} />
        <div className="sep" />
        <button className="item" onClick={() => (close(), inst && bringToFront(inst.id, true))}>
          <Icon name="front" /> Bring to Front
        </button>
        <button className="item" onClick={() => (close(), inst && bringToFront(inst.id, false))}>
          <Icon name="back" /> Send to Back
        </button>
        <div className="sep" />
        <button className="item" onClick={() => (close(), useEditor.getState().setPrefs({ showInspector: true }))}>
          <Icon name="settings" /> Properties…
        </button>
        <Item id="delete" close={close} />
      </>
    );
  } else if (menu.target.kind === 'wire') {
    const ids = selectedWires.length ? selectedWires : [menu.target.id];
    body = (
      <>
        <div className="label">Wire colour</div>
        <div className="swatches">
          {WIRE_COLORS.map((c) => (
            <button key={c.value} className="swatch" style={{ background: c.value }} title={c.label} onClick={() => (close(), setWireColor(ids, c.value))} />
          ))}
        </div>
        <div className="sep" />
        <button className="item" onClick={() => (close(), autoRouteWires(ids))}>
          <Icon name="route" /> Auto-route around parts
        </button>
        <button className="item" onClick={() => (close(), clearWirePoints(ids))}>
          <Icon name="minus" /> Remove bends
        </button>
        <button
          className="item"
          onClick={() => {
            close();
            const w = circuit.wires.find((x) => x.id === ids[0]);
            if (w) assignProbe('probe-logic', w.from);
          }}
        >
          <Icon name="activity" /> Probe with logic analyzer
        </button>
        <button
          className="item"
          onClick={() => {
            close();
            const w = circuit.wires.find((x) => x.id === ids[0]);
            if (w) assignProbe('probe-scope', w.from);
          }}
        >
          <Icon name="waves" /> Probe with oscilloscope
        </button>
        <div className="sep" />
        <Item id="delete" close={close} />
      </>
    );
  } else {
    const world = menu.target.world;
    body = (
      <>
        <button className="item" disabled={!useEditor.getState().clipboard} onClick={() => (close(), paste(world))}>
          <Icon name="paste" /> Paste here
        </button>
        <Item id="selectAll" close={close} />
        <div className="sep" />
        <Item id="fit" close={close} />
        <Item id="grid" close={close} />
        <div className="sep" />
        <Item id="examples" close={close} />
      </>
    );
  }
  return (
    <div ref={ref} className="ctxmenu" style={{ left, top }} onContextMenu={(e) => e.preventDefault()}>
      {body}
    </div>
  );
}
