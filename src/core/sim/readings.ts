/**
 * Live readings of a two-terminal part while simulating: the voltage across
 * it, the current through it, its power and how much of its rating that is
 * (a resistor's power rating, an LED's or a supply's maximum current).
 */
import type { ComponentInstance, PinRef } from '../model/circuit';
import type { ComponentDefinition } from '../model/component';
import { parseEngineering } from '../model/units';

/** Terminals of the parts that have readings, by simulation model (first minus second). */
const TERMINALS: Record<string, [string, string]> = {
  resistor: ['1', '2'],
  led: ['A', 'C'],
  diode: ['A', 'K'],
  'dc-source': ['+', '-'],
};

export interface Readings {
  /** Voltage across the part (first terminal minus second; a resistor's without sign); null when not driven. */
  volts: number | null;
  amps: number | null;
  watts: number | null;
  /** Share of the rating in use (1 = at the limit), and the limit. */
  load: { ratio: number; limit: number; unit: 'W' | 'A' } | null;
}

const num = (inst: ComponentInstance, def: ComponentDefinition, key: string) => {
  const v = inst.props[key] ?? def.properties.find((p) => p.key === key)?.default;
  return typeof v === 'number' ? v : parseEngineering(String(v ?? NaN));
};

export function partReadings(
  def: ComponentDefinition,
  inst: ComponentInstance,
  netOf: (pin: PinRef) => number | undefined,
  voltages: number[],
  driven: boolean[],
  visual: Record<string, unknown> | undefined,
): Readings | null {
  const model = def.simulation.model;
  const terms = model ? TERMINALS[model] : undefined;
  if (!model || !terms) return null;
  const a = netOf({ componentId: inst.id, pinId: terms[0] });
  const b = netOf({ componentId: inst.id, pinId: terms[1] });
  const known = a !== undefined && b !== undefined && (driven[a] || driven[b]);
  const across = known ? (voltages[a!] ?? 0) - (voltages[b!] ?? 0) : null;
  // A resistor has no polarity: its voltage has no sign.
  const volts = across !== null && model === 'resistor' ? Math.abs(across) : across;
  let amps: number | null = null;
  if (model === 'resistor') {
    const r = num(inst, def, 'resistance');
    amps = volts !== null && Number.isFinite(r) && r > 0 ? Math.abs(volts) / r : null;
  } else if (typeof visual?._amps === 'number') amps = visual._amps;
  const watts = amps !== null && volts !== null ? Math.abs(volts) * amps : null;
  let load: Readings['load'] = null;
  if (model === 'resistor') {
    const limit = num(inst, def, 'power');
    if (watts !== null && limit > 0) load = { ratio: watts / limit, limit, unit: 'W' };
  } else if (model === 'led' || model === 'dc-source') {
    const limit = num(inst, def, 'maxCurrent');
    if (amps !== null && limit > 0) load = { ratio: amps / limit, limit, unit: 'A' };
  }
  return { volts, amps, watts, load };
}
