import type { CircuitDocument, PinRef, PropValue } from '../model/circuit';
import type { ComponentDefinition } from '../model/component';
import type { DefinitionLookup, Netlist } from '../circuit/netlist';
import type { ProbeSetup, SimComponentSetup, SimSetup } from './types';
import type { ScriptProgram } from './mcu/mcu';

export interface ProbeRequest {
  id: string;
  target: PinRef;
  kind: 'digital' | 'analog';
}

export function defaultProps(def: ComponentDefinition): Record<string, PropValue> {
  const out: Record<string, PropValue> = {};
  for (const p of def.properties) out[p.key] = p.default;
  return out;
}

/**
 * Translates the document into the plain-data setup consumed by the engine.
 * Visual-only parts are excluded (they are electrically inert by definition).
 */
export function buildSimSetup(
  doc: CircuitDocument,
  lookup: DefinitionLookup,
  netlist: Netlist,
  firmware: Record<string, string | undefined>,
  probes: ProbeRequest[] = [],
  programs: Record<string, ScriptProgram | undefined> = {},
): SimSetup {
  const components: SimComponentSetup[] = [];
  for (const inst of doc.components) {
    const def = lookup(inst.type);
    if (!def || def.simulation.support === 'visual-only' || !def.simulation.model) continue;
    const pins: Record<string, number> = {};
    const pinKinds: Record<string, string> = {};
    const pinSignals: Record<string, string[]> = {};
    for (const p of def.pins) {
      pins[p.id] = netlist.netOf({ componentId: inst.id, pinId: p.id }) ?? -1;
      pinKinds[p.id] = p.kind;
      if (p.signals?.length) pinSignals[p.id] = p.signals;
    }
    components.push({
      id: inst.id,
      type: inst.type,
      label: inst.label,
      model: def.simulation.model,
      props: { ...defaultProps(def), ...inst.props },
      pins,
      pinKinds,
      pinSignals,
      params: def.simulation.params ?? {},
      mcu: def.mcu,
      firmware: def.mcu ? firmware[inst.id] : undefined,
      program: def.mcu?.runtime ? programs[inst.id] : undefined,
    });
  }
  const probeSetups: ProbeSetup[] = probes.map((p) => ({ id: p.id, net: netlist.netOf(p.target) ?? -1, kind: p.kind }));
  return {
    netCount: netlist.nets.length,
    netNames: netlist.nets.map((n) => n.name),
    groundNets: netlist.nets.filter((n) => n.hasGround).map((n) => n.id),
    netPinCount: netlist.nets.map((n) => n.activePinCount),
    components,
    probes: probeSetups,
  };
}
