import type { ComponentDefinition, PinDefinition, PinKind, PropertyDefinition } from '../../core/model/component';
import geometry from './wokwi-geometry.json';

interface WokwiGeometry {
  width: number;
  height: number;
  pins: { name: string; x: number; y: number; signals: string[]; description?: string }[];
}

const GEOM = geometry as Record<string, WokwiGeometry>;

export function wokwiGeometry(tag: string): WokwiGeometry {
  const g = GEOM[tag];
  if (!g) throw new Error(`No measured geometry for ${tag} (re-run tools/measure-wokwi.html)`);
  return g;
}

const GROUND = /^(GND|VSS)(\.\d+)?$/i;
const POWER = /^(VCC|VDD|V\+|5V|3V3|3\.3V|VIN)(\.\d+)?$/i;

/**
 * Pins of a Wokwi element using the measured coordinates. `kinds` overrides
 * the inferred electrical kind per pin; `fallback` is used otherwise.
 * Note: modules' VCC/GND pins are *inputs* (kind 'passive' with label), not
 * supplies — only boards and sources declare `power` pins that drive a rail.
 */
export function wokwiPins(
  tag: string,
  fallback: PinKind,
  kinds: Record<string, PinKind> = {},
  extra: Partial<Record<string, Partial<PinDefinition>>> = {},
): PinDefinition[] {
  return wokwiGeometry(tag).pins.map((p) => {
    const inferred: PinKind = GROUND.test(p.name) ? 'ground' : fallback;
    return {
      id: p.name,
      x: p.x,
      y: p.y,
      kind: kinds[p.name] ?? inferred,
      description: p.description,
      signals: p.signals.length ? p.signals : undefined,
      ...extra[p.name],
    };
  });
}

export function wokwiSize(tag: string) {
  const g = wokwiGeometry(tag);
  return { width: g.width, height: g.height };
}

export const isPowerName = (n: string) => POWER.test(n);

/** Common property definitions. */
export const P = {
  color(def: string, options: string[]): PropertyDefinition {
    return {
      key: 'color',
      label: 'Color',
      type: 'enum',
      default: def,
      options: options.map((o) => ({ value: o, label: o[0].toUpperCase() + o.slice(1) })),
    };
  },
  resistance(def: string, label = 'Resistance'): PropertyDefinition {
    return { key: 'resistance', label, type: 'string', default: def, unit: 'Ω', engineering: true };
  },
};

/** Visual-only component skeleton for catalog breadth. */
export function visualOnly(
  def: Omit<ComponentDefinition, 'simulation' | 'properties'> & {
    properties?: PropertyDefinition[];
    notes?: string;
  },
): ComponentDefinition {
  const { notes, properties, ...rest } = def;
  return {
    ...rest,
    properties: properties ?? [],
    simulation: { support: 'visual-only', notes: notes ?? 'Simulation model not implemented yet.' },
  };
}
