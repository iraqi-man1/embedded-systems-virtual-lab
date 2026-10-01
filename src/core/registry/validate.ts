import type { ComponentDefinition } from '../model/component';

/** Structural validation for definitions coming from packages (incl. untrusted JSON). */
export function validateDefinition(def: ComponentDefinition): string[] {
  const errors: string[] = [];
  if (!def || typeof def !== 'object') return ['definition is not an object'];
  if (!def.type || !/^[a-z0-9_.-]+$/i.test(def.type)) errors.push('invalid "type"');
  if (!def.name) errors.push('missing "name"');
  if (!def.category) errors.push('missing "category"');
  if (!def.visual || !['wokwi', 'svg', 'builtin'].includes(def.visual.kind)) errors.push('invalid "visual"');
  if (!def.size || !(def.size.width > 0) || !(def.size.height > 0)) errors.push('invalid "size"');
  if (!Array.isArray(def.pins)) errors.push('"pins" must be an array');
  else {
    const ids = new Set<string>();
    for (const p of def.pins) {
      if (!p.id) errors.push('pin without id');
      else if (ids.has(p.id)) errors.push(`duplicate pin "${p.id}"`);
      ids.add(p.id);
      if (typeof p.x !== 'number' || typeof p.y !== 'number') errors.push(`pin "${p.id}" lacks coordinates`);
    }
    for (const group of def.internalConnections ?? []) {
      for (const id of group) if (!ids.has(id)) errors.push(`internal connection references unknown pin "${id}"`);
    }
  }
  if (!def.simulation || !['full', 'partial', 'visual-only'].includes(def.simulation.support)) {
    errors.push('invalid "simulation.support"');
  } else if (def.simulation.support !== 'visual-only' && !def.simulation.model) {
    errors.push('simulated component must name a "simulation.model"');
  }
  if (!Array.isArray(def.properties)) errors.push('"properties" must be an array');
  if (!def.docs?.summary) errors.push('missing "docs.summary"');
  if (def.visual?.kind === 'svg' && /<script|javascript:|\son\w+=/i.test(def.visual.svg)) {
    errors.push('inline SVG may not contain scripts or event handlers');
  }
  return errors;
}
