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
  errors.push(...validateControls(def));
  return errors;
}

const DIRECTIONS = ['up', 'down', 'left', 'right'];
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const point = (p: unknown) => !!p && typeof p === 'object' && num((p as { x: unknown }).x) && num((p as { y: unknown }).y);

/** Controls and indicators must reference existing properties and use sane geometry. */
function validateControls(def: ComponentDefinition): string[] {
  const errors: string[] = [];
  const props = new Map((Array.isArray(def.properties) ? def.properties : []).map((p) => [p.key, p]));
  const needProp = (where: string, key: unknown, types: string[]) => {
    const p = typeof key === 'string' ? props.get(key) : undefined;
    if (!p) errors.push(`${where}: unknown property "${String(key)}"`);
    else if (!types.includes(p.type)) errors.push(`${where}: property "${p.key}" must be ${types.join('/')}`);
  };
  if (def.controls !== undefined && !Array.isArray(def.controls)) return ['"controls" must be an array'];
  for (const [i, c] of (def.controls ?? []).entries()) {
    const at = `controls[${i}] (${(c as { kind?: string })?.kind})`;
    switch (c?.kind) {
      case 'slider':
        needProp(at, c.prop, ['number']);
        if ((c.min !== undefined && !num(c.min)) || (c.max !== undefined && !num(c.max))) errors.push(`${at}: min/max must be numbers`);
        break;
      case 'select':
        needProp(at, c.prop, ['enum']);
        break;
      case 'range-target':
        needProp(at, c.prop, ['number']);
        if (!num(c.min) || !num(c.max) || !(c.max > c.min)) errors.push(`${at}: needs min < max`);
        if (!point(c.origin) || !DIRECTIONS.includes(c.direction) || !(c.scale > 0)) errors.push(`${at}: needs origin, direction and a positive scale`);
        break;
      case 'keys':
        if (!Array.isArray(c.keys) || !c.keys.length) errors.push(`${at}: needs keys`);
        for (const k of c.keys ?? []) {
          if (!k.id || !num(k.x) || !num(k.y) || !(k.w > 0) || !(k.h > 0)) errors.push(`${at}: key "${k.id}" needs id, x, y, w, h`);
          if (k.prop) needProp(`${at} key ${k.id}`, k.prop, ['boolean']);
        }
        break;
      case 'stick':
        needProp(at, c.xProp, ['number']);
        needProp(at, c.yProp, ['number']);
        if (!point(c.center) || !(c.radius > 0)) errors.push(`${at}: needs center and radius`);
        break;
      case 'rotary':
        if (!c.input || !point(c.center) || !(c.radius > 0) || !(c.detents > 0)) errors.push(`${at}: needs input, center, radius, detents`);
        break;
      case 'tilt':
        needProp(at, c.pitchProp, ['number']);
        needProp(at, c.rollProp, ['number']);
        if (!(c.range > 0)) errors.push(`${at}: needs a positive range`);
        break;
      case 'action':
        if (!c.input || !c.label) errors.push(`${at}: needs input and label`);
        break;
      default:
        errors.push(`${at}: unknown control kind`);
    }
  }
  if (def.indicators !== undefined && !Array.isArray(def.indicators)) return [...errors, '"indicators" must be an array'];
  for (const [i, ind] of (def.indicators ?? []).entries()) {
    const at = `indicators[${i}] (${(ind as { kind?: string })?.kind})`;
    if (!ind || typeof ind.value !== 'string' || !ind.value) {
      errors.push(`${at}: needs a value`);
      continue;
    }
    if (ind.value.startsWith('prop:') && !props.has(ind.value.slice(5))) errors.push(`${at}: unknown property "${ind.value.slice(5)}"`);
    switch (ind.kind) {
      case 'readout':
        break;
      case 'glow':
      case 'rotor':
        if (!point(ind.at) || !(ind.radius > 0)) errors.push(`${at}: needs at and radius`);
        break;
      case 'waves':
      case 'pulse':
        if (!point(ind.at)) errors.push(`${at}: needs at`);
        break;
      case 'cone':
        if (!point(ind.origin) || !DIRECTIONS.includes(ind.direction) || !(ind.length > 0)) errors.push(`${at}: needs origin, direction, length`);
        break;
      default:
        errors.push(`${at}: unknown indicator kind`);
    }
  }
  return errors;
}
