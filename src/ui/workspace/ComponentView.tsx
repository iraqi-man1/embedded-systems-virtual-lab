import { createElement, memo, useEffect, useRef } from 'react';
import type { ComponentInstance, PropValue } from '../../core/model/circuit';
import type { ComponentDefinition } from '../../core/model/component';
import { parseEngineering } from '../../core/model/units';
import { visualBus } from '../../state/visualBus';
import { audio } from '../audio';
import { renderBuiltin } from './renderers';

type AnyElement = HTMLElement & Record<string, unknown>;

/** Maps instance properties onto element properties for Wokwi elements. */
function applyBindings(el: AnyElement, inst: ComponentInstance, def: ComponentDefinition) {
  if (def.visual.kind !== 'wokwi') return;
  for (const [k, v] of Object.entries(def.visual.attrs ?? {})) el[k] = v;
  for (const [prop, target] of Object.entries(def.visual.propBindings ?? {})) {
    const pdef = def.properties.find((p) => p.key === prop);
    let value: PropValue | undefined = inst.props[prop] ?? pdef?.default;
    if (value === undefined) continue;
    if (pdef?.engineering) {
      const n = parseEngineering(String(value));
      value = Number.isFinite(n) ? String(n) : String(value);
    }
    el[target] = value;
  }
}

function WokwiElement({ inst, def, tag }: { inst: ComponentInstance; def: ComponentDefinition; tag: string }) {
  const ref = useRef<AnyElement>(null);

  useEffect(() => {
    if (ref.current) applyBindings(ref.current, inst, def);
  }, [inst.props, def, inst]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const originals = new Map<string, unknown>();
    return visualBus.register(inst.id, (state) => {
      if (!state) {
        for (const [k, v] of originals) el[k] = v;
        originals.clear();
        clearCommands(el);
        applyBindings(el, inst, def);
        audio.stop(inst.id);
        return;
      }
      if ('frequency' in state) audio.set(inst.id, state.hasSignal ? Number(state.frequency) : 0);
      for (const [k, v] of Object.entries(state)) {
        // `_key`: data for overlays only; `$key`: element commands (below).
        if (k === 'frequency' || k[0] === '_') continue;
        if (k[0] === '$') {
          applyCommand(el, k, v);
          continue;
        }
        if (!originals.has(k)) originals.set(k, el[k]);
        if (el[k] !== v) el[k] = v;
      }
    });
    // Re-register only when the component identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inst.id, def]);

  return createElement(tag, { ref });
}

type Rgb = { r: number; g: number; b: number };

/**
 * Element commands from visual state:
 *  - `$pixels`: RGB (0..1) per LED for rings (`setPixel(i, rgb)`) and matrices (`setPixel(row, col, rgb)`);
 *  - `$imageData`: RGBA bytes for displays exposing `imageData` + `redraw()` (SSD1306).
 */
function applyCommand(el: AnyElement, key: string, value: unknown) {
  if (key === '$pixels' && Array.isArray(value)) {
    const setPixel = el.setPixel as ((...args: unknown[]) => void) | undefined;
    if (!setPixel) return;
    const cols = Number(el.cols ?? 0);
    (value as Rgb[]).forEach((rgb, i) => {
      if (el.tagName === 'WOKWI-NEOPIXEL-MATRIX' && cols > 0) setPixel.call(el, Math.floor(i / cols), i % cols, rgb);
      else setPixel.call(el, i, rgb);
    });
  } else if (key === '$imageData' && value instanceof Uint8ClampedArray) {
    const img = el.imageData as ImageData | undefined;
    if (!img || img.data.length !== value.length) return;
    img.data.set(value);
    (el.redraw as (() => void) | undefined)?.call(el);
  }
}

/** Restores element commands' effect when the simulation stops. */
function clearCommands(el: AnyElement) {
  const setPixel = el.setPixel as ((...args: unknown[]) => void) | undefined;
  const off = { r: 0, g: 0, b: 0 };
  if (setPixel && el.tagName === 'WOKWI-NEOPIXEL-MATRIX') {
    for (let r = 0; r < Number(el.rows ?? 0); r++) for (let c = 0; c < Number(el.cols ?? 0); c++) setPixel.call(el, r, c, off);
  } else if (setPixel) for (let i = 0; i < Number(el.pixels ?? 0); i++) setPixel.call(el, i, off);
  const img = el.imageData as ImageData | undefined;
  if (img) {
    img.data.fill(0);
    (el.redraw as (() => void) | undefined)?.call(el);
  }
}

function SvgVisual({ svg }: { svg: string }) {
  // Inline SVG comes from validated component definitions (scripts are rejected by the registry).
  return <div dangerouslySetInnerHTML={{ __html: svg }} style={{ lineHeight: 0 }} />;
}

interface Props {
  inst: ComponentInstance;
  def: ComponentDefinition;
  selected: boolean;
  /** Visual-only part while the simulation runs (drawn dimmed). */
  inert?: boolean;
}

/** `$rotate` in the visual state turns the part's body (e.g. a tilt switch being tilted). */
function useBodyRotation(id: string, active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    let last: unknown;
    return visualBus.register(id, (state) => {
      const r = state?.$rotate;
      if (r === last || !ref.current) return;
      last = r;
      ref.current.style.transform = typeof r === 'number' && r ? `rotate(${r}deg)` : '';
    });
  }, [id, active]);
  return ref;
}

export const ComponentView = memo(function ComponentView({ inst, def, selected, inert }: Props) {
  const { width, height } = def.size;
  const transform = `rotate(${inst.rotation}deg)${inst.flip ? ' scaleX(-1)' : ''}`;
  const bodyRef = useBodyRotation(inst.id, !!def.simulation.model);
  let body;
  if (def.visual.kind === 'wokwi') body = <WokwiElement inst={inst} def={def} tag={def.visual.tag} />;
  else if (def.visual.kind === 'svg') body = <SvgVisual svg={def.visual.svg} />;
  else body = renderBuiltin(def.visual.renderer, inst, def);
  return (
    <div
      className={`comp${selected ? ' selected' : ''}${inert ? ' inert' : ''}`}
      data-comp={inst.id}
      style={{ left: inst.x, top: inst.y, width, height, transform }}
    >
      <div className="body" ref={bodyRef}>
        {body}
      </div>
    </div>
  );
});
