import type { CircuitDocument } from '../model/circuit';
import { pinKey } from '../model/circuit';
import type { Diagnostic } from './diagnostics';
import type { DefinitionLookup, Netlist } from './netlist';

/**
 * Static electrical rule check: problems that can be determined from
 * connectivity alone, before (or without) running the simulation.
 * Dynamic problems (over-current, floating inputs being read, reverse bias)
 * are reported by the simulation engine, which knows actual voltages.
 */
export function runStaticErc(doc: CircuitDocument, netlist: Netlist, lookup: DefinitionLookup): Diagnostic[] {
  const out: Diagnostic[] = [];

  for (const net of netlist.nets) {
    const supplies = new Set(net.powerPins);
    if (net.hasGround && net.powerVoltages.some((v) => v > 0)) {
      out.push({
        code: 'supply-shorted-to-ground',
        severity: 'error',
        message: `Short circuit: supply pin ${[...supplies].join(', ')} is connected directly to GND (net ${net.name}).`,
        componentIds: [...new Set(net.pins.map((p) => p.componentId))],
        netIds: [net.id],
        source: 'erc',
      });
    } else if (net.powerVoltages.length > 1) {
      out.push({
        code: 'supply-conflict',
        severity: 'error',
        message: `Supplies with different voltages tied together (${net.powerVoltages.map((v) => `${v} V`).join(' / ')}): ${[...supplies].join(', ')}.`,
        componentIds: [...new Set(net.pins.map((p) => p.componentId))],
        netIds: [net.id],
        source: 'erc',
      });
    }
  }

  for (const inst of doc.components) {
    const def = lookup(inst.type);
    if (!def) {
      out.push({
        code: 'unknown-component',
        severity: 'error',
        message: `${inst.label}: component type "${inst.type}" is not installed.`,
        componentIds: [inst.id],
        source: 'erc',
      });
      continue;
    }
    // Is anything attached to this part at all?
    let connectedPins = 0;
    const unconnectedRequired: string[] = [];
    for (const pin of def.pins) {
      if (pin.kind === 'socket' || pin.kind === 'nc') continue;
      const net = netlist.nets[netlist.pinNet.get(pinKey({ componentId: inst.id, pinId: pin.id }))!];
      // Pins of the same component joined internally don't count as a connection.
      const external = net.pins.some((p) => p.componentId !== inst.id && isActive(p, lookup, doc));
      if (external) connectedPins++;
      else if (pin.required) unconnectedRequired.push(pin.label ?? pin.id);
    }
    const isPassiveBoard = def.pins.every((p) => p.kind === 'socket');
    if (isPassiveBoard) continue;
    if (connectedPins > 0 && unconnectedRequired.length) {
      out.push({
        code: 'required-pin-unconnected',
        severity: 'warning',
        message: `${inst.label} (${def.name}): ${unconnectedRequired.join(', ')} not connected.`,
        componentIds: [inst.id],
        source: 'erc',
      });
    }
    if (def.simulation.support === 'visual-only' && connectedPins > 0) {
      out.push({
        code: 'visual-only',
        severity: 'info',
        message: `${inst.label} (${def.name}) is visual-only: it is drawn and wired but not simulated yet.`,
        componentIds: [inst.id],
        source: 'erc',
      });
    }
  }
  return out;
}

function isActive(ref: { componentId: string; pinId: string }, lookup: DefinitionLookup, doc: CircuitDocument) {
  const inst = doc.components.find((c) => c.id === ref.componentId);
  const def = inst && lookup(inst.type);
  const pin = def?.pins.find((p) => p.id === ref.pinId);
  return !!pin && pin.kind !== 'socket';
}
