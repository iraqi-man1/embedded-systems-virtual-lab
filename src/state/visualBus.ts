/**
 * Applies per-frame visual state from the simulation directly to component
 * elements, bypassing React reconciliation (frames arrive ~30x per second).
 * Several listeners can follow one component (its element and the overlays
 * of the simulation-control layer).
 */
type Applier = (state: Record<string, unknown> | undefined) => void;

const appliers = new Map<string, Set<Applier>>();
const lastState = new Map<string, Record<string, unknown>>();

export const visualBus = {
  register(componentId: string, apply: Applier): () => void {
    if (!appliers.has(componentId)) appliers.set(componentId, new Set());
    appliers.get(componentId)!.add(apply);
    const last = lastState.get(componentId);
    if (last) apply(last);
    return () => {
      const set = appliers.get(componentId);
      set?.delete(apply);
      if (set && !set.size) appliers.delete(componentId);
    };
  },
  apply(visuals: Record<string, Record<string, unknown>>) {
    for (const [id, state] of Object.entries(visuals)) {
      lastState.set(id, state);
      for (const apply of appliers.get(id) ?? []) apply(state);
    }
  },
  /** Simulation stopped: return every element to its idle look. */
  reset() {
    lastState.clear();
    for (const set of appliers.values()) for (const apply of set) apply(undefined);
  },
  get(componentId: string) {
    return lastState.get(componentId);
  },
};
