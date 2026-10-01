/** Probe management: instrument channels attached to pins on the workspace. */
import { nanoid } from 'nanoid';
import type { CircuitDocument, PinRef } from '../../core/model/circuit';
import type { Project } from '../../core/project/schema';
import { lookup } from '../../app/registry';
import { useEditor, type Tool } from '../../state/editor';
import { useProject } from '../../state/project';
import { pinPosition } from '../workspace/geometry';

export const CHANNEL_COLORS = ['#f5c400', '#00c2ff', '#ff4fa3', '#5ce65c', '#ff8c1a', '#b388ff', '#ff5252', '#26d7ae'];
export const METER_RED = '#e53935';
export const METER_BLACK = '#424242';

export function pinLabel(circuit: CircuitDocument, ref: PinRef): string {
  const inst = circuit.components.find((c) => c.id === ref.componentId);
  if (!inst) return '?';
  const pin = lookup(inst.type)?.pins.find((p) => p.id === ref.pinId);
  return `${inst.label}.${pin?.label ?? ref.pinId}`;
}

export function assignProbe(tool: Tool, ref: PinRef) {
  const { project, updateProject } = useProject.getState();
  const label = pinLabel(project.circuit, ref);
  const ed = useEditor.getState();
  updateProject((p) => {
    if (tool === 'probe-logic' || tool === 'probe-scope') {
      const list = tool === 'probe-logic' ? p.instruments.logic : p.instruments.scope;
      const max = tool === 'probe-logic' ? 8 : 4;
      if (list.some((c) => c.target.componentId === ref.componentId && c.target.pinId === ref.pinId)) return;
      if (list.length >= max) {
        ed.notify(`The ${tool === 'probe-logic' ? 'logic analyzer' : 'oscilloscope'} has ${max} channels.`, 'warning');
        return;
      }
      list.push({ id: nanoid(6), target: ref, label, color: CHANNEL_COLORS[list.length % CHANNEL_COLORS.length] });
    } else if (tool === 'probe-meter-red') p.instruments.meter.red = ref;
    else if (tool === 'probe-meter-black') p.instruments.meter.black = ref;
  });
  ed.set({ dockTab: tool === 'probe-logic' ? 'logic' : tool === 'probe-scope' ? 'scope' : 'meter', showDock: true });
}

export function removeChannel(kind: 'logic' | 'scope', id: string) {
  useProject.getState().updateProject((p) => {
    p.instruments[kind] = p.instruments[kind].filter((c) => c.id !== id);
  });
}

export function probeMarkers(circuit: CircuitDocument, instruments: Project['instruments']) {
  const out: { x: number; y: number; color: string; label: string }[] = [];
  const add = (ref: PinRef | null, color: string, label: string) => {
    if (!ref) return;
    const p = pinPosition(circuit, ref);
    if (p) out.push({ ...p, color, label });
  };
  instruments.logic.forEach((c, i) => add(c.target, c.color, `LA${i}`));
  instruments.scope.forEach((c, i) => add(c.target, c.color, `CH${i + 1}`));
  add(instruments.meter.red, METER_RED, 'V+');
  add(instruments.meter.black, METER_BLACK, 'COM');
  return out;
}
