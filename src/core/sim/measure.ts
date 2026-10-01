/**
 * Ohmmeter: measures the resistance between two nets of the *unpowered*
 * circuit, like a real multimeter. Every model contributes its stamps; all
 * independent sources are removed (supplies and MCU pins become open
 * circuits), diodes are treated as open (the meter's test voltage is below
 * their knee), then a 1 mA test current is injected between the probes.
 */
import { StampCollector, solve } from './analog/solver';
import { getModelFactory, type ModelContext, type SimModel } from './model';
import type { SimSetup } from './types';

export type ResistanceReading = { kind: 'ohms'; value: number } | { kind: 'open' } | { kind: 'invalid'; reason: string };

const TEST_CURRENT = 1e-3;
const OPEN_THRESHOLD = 40e6;

export function measureResistance(setup: SimSetup, netA: number, netB: number): ResistanceReading {
  if (netA < 0 || netB < 0) return { kind: 'invalid', reason: 'Probe not connected' };
  if (netA === netB) return { kind: 'ohms', value: 0 };
  const models: SimModel[] = [];
  for (const comp of setup.components) {
    const f = getModelFactory(comp.model);
    if (!f || comp.mcu) continue; // a board is unpowered: its pins are high impedance
    const ctx: ModelContext = {
      setup: comp,
      net: (p) => comp.pins[p] ?? -1,
      now: () => 0,
      invalidate: () => undefined,
      solveNow: () => undefined,
      schedule: () => undefined,
      serialOut: () => undefined,
      models: () => models,
      netPinCount: (n) => setup.netPinCount[n] ?? 0,
      isDriven: () => false,
    };
    try {
      models.push(f(ctx));
    } catch {
      /* models that cannot exist unpowered are skipped */
    }
  }
  const s = new StampCollector();
  for (const m of models) m.stamp(s);
  // Remove sources together with their internal resistance: an unpowered supply
  // is treated as open for continuity purposes.
  const passive = new StampCollector();
  for (const c of s.conductances) if (!s.sourceConductances.has(c)) passive.conductance(c.a, c.b, c.g);
  passive.currentSource(netB, netA, TEST_CURRENT);
  const r = solve(setup.netCount, passive, [netB]);
  if (r.island[netA] < 0 || r.island[netA] !== r.island[netB]) return { kind: 'open' };
  const v = r.voltages[netA] - r.voltages[netB];
  const ohms = v / TEST_CURRENT;
  if (!Number.isFinite(ohms) || ohms > OPEN_THRESHOLD) return { kind: 'open' };
  return { kind: 'ohms', value: Math.max(0, ohms) };
}
