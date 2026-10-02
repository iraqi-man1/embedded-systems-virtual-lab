/**
 * A large drawing of one part with its pins marked. Pointing at a pin (here
 * or in the pin table) lights it up and names it, like a datasheet pinout.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentDefinition } from '../../core/model/component';
import { defaultProps } from '../../core/sim/setup';
import { ComponentView } from '../workspace/ComponentView';
import { isSocketBoard, pinBase, type PinGroup } from './guideModel';

const PAD = 34;

export function PartFigure({ def, groups, active, onActive }: { def: ComponentDefinition; groups: PinGroup[]; active: string | null; onActive: (name: string | null) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const inst = useMemo(() => ({ id: `guide-${def.type}`, type: def.type, x: 0, y: 0, rotation: 0 as const, label: '', props: defaultProps(def) }), [def]);
  const groupOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) for (const id of g.ids) m.set(id, g.name);
    return m;
  }, [groups]);

  let content = null;
  if (size && size.w > 0) {
    const { width, height } = def.size;
    const zoom = Math.max(0.2, Math.min(4, (size.w - PAD * 2) / width, (size.h - PAD * 2) / height));
    const x = (size.w - width * zoom) / 2;
    const y = (size.h - height * zoom) / 2;
    const pins = isSocketBoard(def) ? [] : def.pins.filter((p) => p.kind !== 'socket');
    const lit = pins.filter((p) => groupOf.get(p.id) === active);
    // Name the lit pin next to the first copy of it, on the side away from the part's centre.
    const first = lit[0];
    let tag = null;
    if (first) {
      const px = x + first.x * zoom;
      const py = y + first.y * zoom;
      const above = first.y < height / 2;
      tag = (
        <div className={`pf-tag ltr${above ? ' above' : ''}`} style={{ left: px, top: py }}>
          {active}
        </div>
      );
    }
    content = (
      <>
        <div className="world" style={{ transform: `translate(${x}px, ${y}px) scale(${zoom})` }}>
          <ComponentView inst={inst} def={def} selected={false} preview />
        </div>
        <svg className="pf-pins" width={size.w} height={size.h}>
          {pins.map((p) => {
            const name = groupOf.get(p.id) ?? pinBase(p.id);
            const on = name === active;
            return (
              <circle
                key={p.id}
                className={`pf-pin ${p.kind}${on ? ' on' : ''}`}
                cx={x + p.x * zoom}
                cy={y + p.y * zoom}
                r={on ? 7 : Math.max(3, Math.min(5, 2.2 * zoom))}
                onPointerEnter={() => onActive(name)}
                onPointerLeave={() => onActive(null)}
              >
                <title>{name}</title>
              </circle>
            );
          })}
        </svg>
        {tag}
      </>
    );
  }
  return (
    <div ref={host} className="pf card-canvas">
      {content}
    </div>
  );
}
