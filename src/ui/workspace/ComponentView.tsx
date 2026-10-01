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
        applyBindings(el, inst, def);
        audio.stop(inst.id);
        return;
      }
      if ('frequency' in state) audio.set(inst.id, state.hasSignal ? Number(state.frequency) : 0);
      for (const [k, v] of Object.entries(state)) {
        if (k === 'frequency') continue;
        if (!originals.has(k)) originals.set(k, el[k]);
        if (el[k] !== v) el[k] = v;
      }
    });
    // Re-register only when the component identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inst.id, def]);

  return createElement(tag, { ref });
}

function SvgVisual({ svg }: { svg: string }) {
  // Inline SVG comes from validated component definitions (scripts are rejected by the registry).
  return <div dangerouslySetInnerHTML={{ __html: svg }} style={{ lineHeight: 0 }} />;
}

interface Props {
  inst: ComponentInstance;
  def: ComponentDefinition;
  selected: boolean;
}

export const ComponentView = memo(function ComponentView({ inst, def, selected }: Props) {
  const { width, height } = def.size;
  const transform = `rotate(${inst.rotation}deg)${inst.flip ? ' scaleX(-1)' : ''}`;
  let body;
  if (def.visual.kind === 'wokwi') body = <WokwiElement inst={inst} def={def} tag={def.visual.tag} />;
  else if (def.visual.kind === 'svg') body = <SvgVisual svg={def.visual.svg} />;
  else body = renderBuiltin(def.visual.renderer, inst, def);
  return (
    <div
      className={`comp${selected ? ' selected' : ''}`}
      data-comp={inst.id}
      style={{ left: inst.x, top: inst.y, width, height, transform }}
    >
      <div className="body">{body}</div>
    </div>
  );
});
