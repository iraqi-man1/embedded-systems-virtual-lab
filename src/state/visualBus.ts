/**
 * Applies per-frame visual state from the simulation directly to component
 * elements, bypassing React reconciliation (frames arrive ~30x per second).
 */
type Applier = (state: Record<string, unknown> | undefined) => void;

const appliers = new Map<string, Applier>();
const lastState = new Map<string, Record<string, unknown>>();

export const visualBus = {
  register(componentId: string, apply: Applier): () => void {
    appliers.set(componentId, apply);
    const last = lastState.get(componentId);
    if (last) apply(last);
    return () => {
      if (appliers.get(componentId) === apply) appliers.delete(componentId);
    };
  },
  apply(visuals: Record<string, Record<string, unknown>>) {
    for (const [id, state] of Object.entries(visuals)) {
      lastState.set(id, state);
      appliers.get(id)?.(state);
    }
  },
  /** Simulation stopped: return every element to its idle look. */
  reset() {
    lastState.clear();
    for (const apply of appliers.values()) apply(undefined);
  },
  get(componentId: string) {
    return lastState.get(componentId);
  },
};
