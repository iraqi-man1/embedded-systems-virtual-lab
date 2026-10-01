/** Memoised derived data (netlist, static ERC) keyed on circuit identity. */
import type { CircuitDocument } from '../core/model/circuit';
import { buildNetlist, type Netlist } from '../core/circuit/netlist';
import { runStaticErc } from '../core/circuit/erc';
import type { Diagnostic } from '../core/circuit/diagnostics';
import { lookup } from '../app/registry';
import { useProject } from './project';

let cache: { circuit: CircuitDocument; netlist: Netlist; erc: Diagnostic[] } | null = null;

function compute(circuit: CircuitDocument) {
  if (cache?.circuit === circuit) return cache;
  const netlist = buildNetlist(circuit, lookup);
  cache = { circuit, netlist, erc: runStaticErc(circuit, netlist, lookup) };
  return cache;
}

export const getNetlist = (circuit: CircuitDocument) => compute(circuit).netlist;
export const getErc = (circuit: CircuitDocument) => compute(circuit).erc;

export function useNetlist(): Netlist {
  const circuit = useProject((s) => s.project.circuit);
  return getNetlist(circuit);
}

export function useErc(): Diagnostic[] {
  const circuit = useProject((s) => s.project.circuit);
  return getErc(circuit);
}
