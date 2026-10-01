/**
 * On-canvas simulation controls and visual feedback, driven entirely by the
 * `controls` and `indicators` of component definitions (so JSON packages get
 * them too). Rendered in world space on top of the parts:
 *
 *  - controls on the part itself (keys, thumbsticks, rotary knobs) and in
 *    front of it (distance targets) rotate with the part;
 *  - chips under the part (sliders, selectors, tilt pad, action buttons,
 *    readouts) keep a readable size at any zoom.
 *
 * Property controls edit live properties with one undo step per gesture;
 * the simulation picks the change up immediately (set-prop). Other controls
 * send model inputs.
 */
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ComponentInstance, Point, PropValue } from '../../core/model/circuit';
import type { ComponentDefinition, IndicatorDefinition, LocalDirection, LocalPoint, PropertyDefinition, SimControl } from '../../core/model/component';
import { componentBounds, worldToLocal } from '../../core/circuit/geometry';
import { formatEngineering } from '../../core/model/units';
import { lookup } from '../../app/registry';
import { coalescedEdit, useProject } from '../../state/project';
import { sendInput } from '../../state/sim';
import { visualBus } from '../../state/visualBus';
import { Icon } from '../common/Icon';
import { Tip } from '../common/Tooltip';

type ToWorld = (clientX: number, clientY: number) => Point;

// ----------------------------------------------------------------- helpers
const DIR: Record<LocalDirection, Point> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

function editProp(id: string, key: string, value: PropValue, mode: 'gesture' | 'coalesce') {
  const apply = (c: { components: ComponentInstance[] }) => {
    const inst = c.components.find((x) => x.id === id);
    if (inst && inst.props[key] !== value) inst.props[key] = value;
  };
  if (mode === 'coalesce') coalescedEdit(apply);
  else useProject.getState().edit(apply);
}

function propDef(def: ComponentDefinition, key: string): PropertyDefinition | undefined {
  return def.properties.find((p) => p.key === key);
}

function numericProp(inst: ComponentInstance, def: ComponentDefinition, key: string): number {
  const v = inst.props[key] ?? propDef(def, key)?.default;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

/** Stops canvas handlers (selection, marquee, panning) for events handled by a control. */
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/** Compact en-US number (never locale digits): 12 345 → 12.3k, 3.14159 → 3.14. */
export function formatNumber(v: number, digits = 3) {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 10000) return formatEngineering(v, '', digits).trim();
  const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return String(parseFloat(v.toFixed(Math.min(decimals, Math.max(0, digits - 1)))));
}

/** Value of an indicator source: a visual-state key or `prop:<key>`. */
function sourceValue(src: string, inst: ComponentInstance, def: ComponentDefinition, visual: Record<string, unknown> | undefined): unknown {
  if (src.startsWith('prop:')) {
    const key = src.slice(5);
    return inst.props[key] ?? propDef(def, key)?.default;
  }
  return visual?.[src];
}

/** Follows the model's visual state for the keys an overlay needs (re-renders only on change). */
function useVisual(id: string, keys: string[]): Record<string, unknown> | undefined {
  const [state, setState] = useState<Record<string, unknown> | undefined>(() => visualBus.get(id));
  const keyList = keys.join('|');
  useEffect(() => {
    const wanted = keyList ? keyList.split('|') : [];
    let last: unknown[] = [];
    return visualBus.register(id, (s) => {
      const next = wanted.map((k) => s?.[k]);
      if (next.length === last.length && next.every((v, i) => v === last[i] || (Array.isArray(v) && JSON.stringify(v) === JSON.stringify(last[i])))) return;
      last = next;
      setState(s);
    });
  }, [id, keyList]);
  return state;
}

/** Pointer position in the part's local frame. */
function localPoint(e: { clientX: number; clientY: number }, inst: ComponentInstance, def: ComponentDefinition, toWorld: ToWorld) {
  return worldToLocal(inst, def, toWorld(e.clientX, e.clientY));
}

/** Text that stays upright on rotated/flipped parts. */
function Upright({ x, y, inst, children, className, anchor = 'middle' }: { x: number; y: number; inst: ComponentInstance; children: ReactNode; className?: string; anchor?: 'start' | 'middle' | 'end' }) {
  const t = `rotate(${-inst.rotation} ${x} ${y})${inst.flip ? ` translate(${2 * x} 0) scale(-1 1)` : ''}`;
  return (
    <text x={x} y={y} className={className} textAnchor={anchor} transform={t}>
      {children}
    </text>
  );
}

// ------------------------------------------------------- world-space controls
type RangeTargetControl = Extract<SimControl, { kind: 'range-target' }>;
/** Canvas length of the beam at 100 % scale (square-root mapping: more resolution up close). */
const RANGE_SPAN = 150;
const RANGE_GAP = 12;

/** Distance from the sensor face (local px) at which the obstacle is drawn for `value`. */
export function rangeTargetOffset(c: RangeTargetControl, value: number) {
  const t = Math.max(0, (Math.min(value, c.max * 1.15) - c.min) / (c.max - c.min));
  return RANGE_GAP + RANGE_SPAN * c.scale * Math.sqrt(t);
}

/** Inverse of `rangeTargetOffset`, rounded to whole units. */
export function rangeTargetValue(c: RangeTargetControl, offset: number) {
  const t = Math.max(0, (offset - RANGE_GAP) / (RANGE_SPAN * c.scale));
  return Math.round(Math.max(c.min, Math.min(c.max * 1.15, c.min + t * t * (c.max - c.min))));
}
function RangeTarget({ inst, def, c, toWorld, editable }: { inst: ComponentInstance; def: ComponentDefinition; c: Extract<SimControl, { kind: 'range-target' }>; toWorld: ToWorld; editable: boolean }) {
  const visual = useVisual(inst.id, c.pingKey ? [c.pingKey] : []);
  const value = Math.max(c.min, Math.min(c.max * 1.15, numericProp(inst, def, c.prop)));
  const d = DIR[c.direction];
  const perp = { x: -d.y, y: d.x };
  const dist = rangeTargetOffset(c, value);
  const target = { x: c.origin.x + d.x * dist, y: c.origin.y + d.y * dist };
  const half = 30;
  const beam = [
    { x: c.origin.x + perp.x * 22, y: c.origin.y + perp.y * 22 },
    { x: target.x + perp.x * half, y: target.y + perp.y * half },
    { x: target.x - perp.x * half, y: target.y - perp.y * half },
    { x: c.origin.x - perp.x * 22, y: c.origin.y - perp.y * 22 },
  ];
  const out = value > c.max;
  const pings = c.pingKey ? Number(visual?.[c.pingKey] ?? 0) : 0;
  const drag = useRef<boolean>(false);
  const setFrom = (e: React.PointerEvent) => {
    const p = localPoint(e, inst, def, toWorld);
    const along = (p.x - c.origin.x) * d.x + (p.y - c.origin.y) * d.y;
    editProp(inst.id, c.prop, rangeTargetValue(c, along), 'gesture');
  };
  // Obstacle: a wall across the beam at the measured distance.
  const vertical = d.x === 0;
  const wall = vertical ? { x: target.x - half, y: target.y - 5, w: half * 2, h: 10 } : { x: target.x - 5, y: target.y - half, w: 10, h: half * 2 };
  return (
    <svg className="simctl-svg" width={1} height={1}>
      <polygon className={`beam${out ? ' out' : ''}`} points={beam.map((p) => `${p.x},${p.y}`).join(' ')} />
      {pings > 0 && (
        <circle key={pings} className="echo" cx={c.origin.x} cy={c.origin.y} r={dist} />
      )}
      <rect
        className={`target${editable ? ' editable' : ''}`}
        x={wall.x}
        y={wall.y}
        width={wall.w}
        height={wall.h}
        rx={3}
        onPointerDown={(e) => {
          if (!editable || e.button !== 0 || e.altKey) return;
          stop(e);
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          drag.current = true;
          useProject.getState().begin();
        }}
        onPointerMove={(e) => drag.current && setFrom(e)}
        onPointerUp={() => {
          if (!drag.current) return;
          drag.current = false;
          useProject.getState().end();
        }}
      />
      <Upright x={target.x + d.x * 16} y={target.y + d.y * 16 + 3} inst={inst} className="target-label">
        {out ? `> ${c.max} ${c.unit} (no echo)` : `${value} ${c.unit}`}
      </Upright>
    </svg>
  );
}

function KeyRegions({ inst, def, c }: { inst: ComponentInstance; def: ComponentDefinition; c: Extract<SimControl, { kind: 'keys' }> }) {
  const visual = useVisual(inst.id, c.pressedKey ? [c.pressedKey] : []);
  const [held, setHeld] = useState<string | null>(null);
  const pressed = new Set<string>([...(c.pressedKey && Array.isArray(visual?.[c.pressedKey]) ? (visual![c.pressedKey] as string[]) : []), ...(held ? [held] : [])]);
  return (
    <>
      {c.keys.map((k) => {
        const on = k.prop ? !!(inst.props[k.prop] ?? propDef(def, k.prop)?.default) : pressed.has(k.id);
        const input = k.input ?? `key:${k.id}`;
        return (
          <Tip key={k.id} content={k.label ?? k.id} side="top" direct>
            <div
              className={`simctl-key${k.round ? ' round' : ''}${on ? ' on' : ''}`}
              style={{ left: k.x, top: k.y, width: k.w, height: k.h }}
              onPointerDown={(e) => {
                if (e.button !== 0 || e.altKey) return;
                stop(e);
                if (k.prop) {
                  editProp(inst.id, k.prop, !on, 'gesture');
                  return;
                }
                (e.currentTarget as Element).setPointerCapture(e.pointerId);
                setHeld(k.id);
                sendInput(inst.id, input, true);
              }}
              onPointerUp={() => {
                if (k.prop || held !== k.id) return;
                setHeld(null);
                sendInput(inst.id, input, false);
              }}
              onPointerCancel={() => {
                if (held === k.id) {
                  setHeld(null);
                  sendInput(inst.id, input, false);
                }
              }}
            />
          </Tip>
        );
      })}
    </>
  );
}

function Stick({ inst, def, c, toWorld }: { inst: ComponentInstance; def: ComponentDefinition; c: Extract<SimControl, { kind: 'stick' }>; toWorld: ToWorld }) {
  const [pos, setPos] = useState<Point | null>(null);
  const start = useRef<{ moved: boolean } | null>(null);
  const restX = numericProp(inst, def, c.xProp);
  const restY = numericProp(inst, def, c.yProp);
  const shown = pos ?? { x: (c.invertX ? 0.5 - restX : restX - 0.5) * 2, y: (c.invertY ? 0.5 - restY : restY - 0.5) * 2 };
  const update = (e: React.PointerEvent) => {
    const p = localPoint(e, inst, def, toWorld);
    let dx = (p.x - c.center.x) / c.radius;
    let dy = (p.y - c.center.y) / c.radius;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    if (start.current && len > 0.12) start.current.moved = true;
    setPos({ x: dx, y: dy });
    sendInput(inst.id, c.xProp, c.invertX ? 0.5 - dx / 2 : 0.5 + dx / 2);
    sendInput(inst.id, c.yProp, c.invertY ? 0.5 - dy / 2 : 0.5 + dy / 2);
  };
  const release = () => {
    if (!start.current) return;
    if (!start.current.moved && c.pressInput) {
      sendInput(inst.id, c.pressInput, true);
      setTimeout(() => sendInput(inst.id, c.pressInput!, false), 120);
    }
    start.current = null;
    setPos(null);
    // Springs back: the model returns to the resting position from the properties.
    sendInput(inst.id, 'release', true);
  };
  return (
    <Tip content="Drag to move the stick · click to press" side="top" direct>
      <div
        className="simctl-stick"
        style={{ left: c.center.x - c.radius, top: c.center.y - c.radius, width: c.radius * 2, height: c.radius * 2 }}
        onPointerDown={(e) => {
          if (e.button !== 0 || e.altKey) return;
          stop(e);
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          start.current = { moved: false };
        }}
        onPointerMove={(e) => start.current && update(e)}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <span className="dot" style={{ left: `${50 + shown.x * 50}%`, top: `${50 + shown.y * 50}%` }} />
      </div>
    </Tip>
  );
}

function Rotary({ inst, def, c, toWorld }: { inst: ComponentInstance; def: ComponentDefinition; c: Extract<SimControl, { kind: 'rotary' }>; toWorld: ToWorld }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ last: number; acc: number; moved: boolean } | null>(null);
  const step = 360 / c.detents;
  const angleOf = (e: { clientX: number; clientY: number }) => {
    const p = localPoint(e, inst, def, toWorld);
    return (Math.atan2(p.y - c.center.y, p.x - c.center.x) * 180) / Math.PI;
  };
  useEffect(() => {
    const el = ref.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      sendInput(inst.id, c.input, e.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [inst.id, c.input]);
  return (
    <Tip content="Drag around (or scroll) to turn · click to press" side="top" direct>
      <div
        ref={ref}
        className="simctl-rotary"
        style={{ left: c.center.x - c.radius, top: c.center.y - c.radius, width: c.radius * 2, height: c.radius * 2 }}
        onPointerDown={(e) => {
          if (e.button !== 0 || e.altKey) return;
          stop(e);
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          drag.current = { last: angleOf(e), acc: 0, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const a = angleOf(e);
          let delta = a - d.last;
          if (delta > 180) delta -= 360;
          if (delta < -180) delta += 360;
          d.last = a;
          d.acc += delta;
          while (Math.abs(d.acc) >= step) {
            const dir = Math.sign(d.acc);
            d.acc -= dir * step;
            d.moved = true;
            sendInput(inst.id, c.input, dir); // clockwise = +1
          }
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved && c.pressInput) {
            sendInput(inst.id, c.pressInput, true);
            setTimeout(() => sendInput(inst.id, c.pressInput!, false), 150);
          }
        }}
      />
    </Tip>
  );
}

// ---------------------------------------------------------------- indicators
function Indicators({ inst, def, list }: { inst: ComponentInstance; def: ComponentDefinition; list: IndicatorDefinition[] }) {
  const keys = list.map((i) => i.value).filter((v) => !v.startsWith('prop:'));
  const visual = useVisual(inst.id, keys);
  return (
    <svg className="simctl-svg" width={1} height={1}>
      {list.map((ind, i) => {
        const v = sourceValue(ind.value, inst, def, visual);
        const n = typeof v === 'number' ? v : v ? 1 : 0;
        switch (ind.kind) {
          case 'glow': {
            const max = ind.max ?? 1;
            const k = ind.log ? Math.log10(1 + Math.max(0, n)) / Math.log10(1 + max) : n / max;
            const a = Math.max(0, Math.min(1, k));
            return <circle key={i} cx={ind.at.x} cy={ind.at.y} r={ind.radius} fill={`url(#glow-${inst.id}-${i})`} opacity={a} className="glow" />;
          }
          case 'waves':
            return n > 0 ? (
              <g key={i} className="waves" style={{ color: ind.color }} transform={`translate(${ind.at.x} ${ind.at.y}) rotate(${{ up: -90, down: 90, left: 180, right: 0 }[ind.direction]})`}>
                {[0, 1, 2].map((w) => (
                  <path key={w} d="M0 -9 A12 12 0 0 1 0 9" className={`wave w${w}`} />
                ))}
              </g>
            ) : null;
          case 'cone': {
            const d = DIR[ind.direction];
            const perp = { x: -d.y, y: d.x };
            const end = { x: ind.origin.x + d.x * ind.length, y: ind.origin.y + d.y * ind.length };
            const w = Math.tan(((ind.spread / 2) * Math.PI) / 180) * ind.length;
            const pts = [ind.origin, { x: end.x + perp.x * w, y: end.y + perp.y * w }, { x: end.x - perp.x * w, y: end.y - perp.y * w }];
            return <polygon key={i} className={`cone${n > 0 ? ' on' : ''}`} points={pts.map((p) => `${p.x},${p.y}`).join(' ')} style={{ color: ind.color }} />;
          }
          case 'pulse':
            return v !== undefined ? <circle key={`${i}-${String(v)}`} className="pulse" cx={ind.at.x} cy={ind.at.y} r={7} style={{ color: ind.color }} /> : null;
          case 'rotor': {
            const angle = n;
            return (
              <g key={i} className="rotor" transform={`translate(${ind.at.x} ${ind.at.y})`}>
                <circle r={ind.radius} />
                <g transform={`rotate(${angle})`}>
                  <line x1={0} y1={0} x2={0} y2={-ind.radius + 2} />
                  <circle r={2.2} cy={-ind.radius + 4} />
                </g>
              </g>
            );
          }
          default:
            return null;
        }
      })}
      {list.map((ind, i) =>
        ind.kind === 'glow' ? (
          <defs key={`d${i}`}>
            <radialGradient id={`glow-${inst.id}-${i}`}>
              <stop offset="0%" stopColor={ind.color} stopOpacity={0.85} />
              <stop offset="100%" stopColor={ind.color} stopOpacity={0} />
            </radialGradient>
          </defs>
        ) : null,
      )}
    </svg>
  );
}

// --------------------------------------------------------------------- chips
function useWheel(onStep: (dir: 1 | -1) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onStep);
  cb.current = onStep;
  useEffect(() => {
    const el = ref.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      cb.current(e.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  return ref;
}

function SliderChip({ inst, def, c }: { inst: ComponentInstance; def: ComponentDefinition; c: Extract<SimControl, { kind: 'slider' }> }) {
  const p = propDef(def, c.prop);
  const min = c.min ?? p?.min ?? 0;
  const max = c.max ?? p?.max ?? 1;
  const step = c.step ?? p?.step ?? (max - min) / 100;
  const unit = c.unit ?? p?.unit ?? '';
  const value = Math.max(min, Math.min(max, numericProp(inst, def, c.prop)));
  const log = !!c.log && min > 0;
  const toPos = (v: number) => (log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min));
  const fromPos = (t: number) => {
    const raw = log ? min * Math.pow(max / min, t) : min + t * (max - min);
    const q = log ? parseFloat(raw.toPrecision(3)) : Math.round(raw / step) * step;
    return Math.max(min, Math.min(max, parseFloat(q.toFixed(6))));
  };
  const ref = useWheel((dir) => editProp(inst.id, c.prop, fromPos(Math.max(0, Math.min(1, toPos(value) + dir * 0.02))), 'coalesce'));
  return (
    <Tip content={`${c.label ?? p?.label ?? c.prop} — drag or scroll`} side="top" direct>
      <div ref={ref} className="simctl-chip slider" onPointerDown={stop} onDoubleClick={stop}>
        {c.icon && <Icon name={c.icon} />}
        {c.label && <span className="lbl">{c.label}</span>}
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(toPos(value) * 1000)}
          aria-label={c.label ?? p?.label ?? c.prop}
          onPointerDown={() => useProject.getState().begin()}
          onPointerUp={() => useProject.getState().end()}
          onChange={(e) => editProp(inst.id, c.prop, fromPos(Number(e.target.value) / 1000), useProject.getState().txBase ? 'gesture' : 'coalesce')}
        />
        <span className="val">
          {formatNumber(value)}
          {unit ? ` ${unit}` : ''}
        </span>
      </div>
    </Tip>
  );
}

function SelectChip({ inst, def, c }: { inst: ComponentInstance; def: ComponentDefinition; c: Extract<SimControl, { kind: 'select' }> }) {
  const p = propDef(def, c.prop);
  const value = String(inst.props[c.prop] ?? p?.default ?? '');
  return (
    <div className="simctl-chip" onPointerDown={stop} onDoubleClick={stop}>
      {c.icon && <Icon name={c.icon} />}
      {c.label && <span className="lbl">{c.label}</span>}
      <select value={value} aria-label={c.label ?? p?.label} onChange={(e) => editProp(inst.id, c.prop, e.target.value, 'gesture')}>
        {p?.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TiltChip({ inst, def, c }: { inst: ComponentInstance; def: ComponentDefinition; c: Extract<SimControl, { kind: 'tilt' }> }) {
  const pitch = numericProp(inst, def, c.pitchProp);
  const roll = numericProp(inst, def, c.rollProp);
  const pad = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const set = (e: React.PointerEvent) => {
    const r = pad.current!.getBoundingClientRect();
    const fx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    const fy = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    editProp(inst.id, c.rollProp, Math.round(fx * c.range), 'gesture');
    editProp(inst.id, c.pitchProp, Math.round(-fy * c.range), 'gesture');
  };
  return (
    <div className="simctl-chip tilt" onPointerDown={stop} onDoubleClick={stop}>
      <Tip content="Drag to tilt · double-click to level" side="top" direct>
        <div
          ref={pad}
          className="pad"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            (e.currentTarget as Element).setPointerCapture(e.pointerId);
            dragging.current = true;
            useProject.getState().begin();
            set(e);
          }}
          onPointerMove={(e) => dragging.current && set(e)}
          onPointerUp={() => {
            dragging.current = false;
            useProject.getState().end();
          }}
          onDoubleClick={() => {
            useProject.getState().begin();
            editProp(inst.id, c.rollProp, 0, 'gesture');
            editProp(inst.id, c.pitchProp, 0, 'gesture');
            useProject.getState().end();
          }}
        >
          <span className="dot" style={{ left: `${50 + (roll / c.range) * 50}%`, top: `${50 - (pitch / c.range) * 50}%` }} />
        </div>
      </Tip>
      <span className="val">
        {c.label ?? 'Tilt'}
        <br />
        pitch {pitch}°
        <br />
        roll {roll}°
      </span>
    </div>
  );
}

function ActionChip({ inst, c }: { inst: ComponentInstance; c: Extract<SimControl, { kind: 'action' }> }) {
  const [down, setDown] = useState(false);
  const momentary = c.mode !== 'trigger';
  return (
    <button
      className={`simctl-chip action${down ? ' on' : ''}`}
      onPointerDown={(e) => {
        stop(e);
        if (e.button !== 0) return;
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        setDown(true);
        sendInput(inst.id, c.input, true);
      }}
      onPointerUp={() => {
        setDown(false);
        if (momentary) sendInput(inst.id, c.input, false);
      }}
      onDoubleClick={stop}
    >
      {c.icon && <Icon name={c.icon} />}
      {c.label}
    </button>
  );
}

function Readouts({ inst, def, list }: { inst: ComponentInstance; def: ComponentDefinition; list: Extract<IndicatorDefinition, { kind: 'readout' }>[] }) {
  const visual = useVisual(
    inst.id,
    list.map((r) => r.value).filter((v) => !v.startsWith('prop:')),
  );
  return (
    <>
      {list.map((r, i) => {
        const v = sourceValue(r.value, inst, def, visual);
        if (v === undefined) return null;
        let text: string;
        if (r.map && String(v) in r.map) text = r.map[String(v)];
        else if (typeof v === 'number') {
          const x = v * (r.scale ?? 1);
          text = r.engineering ? formatEngineering(x, r.unit ?? '', r.digits ?? 3) : `${formatNumber(x, r.digits ?? 3)}${r.unit ? ` ${r.unit}` : ''}`;
        } else text = String(v);
        return (
          <span key={i} className="simctl-chip readout">
            {r.label && <span className="lbl">{r.label}</span>}
            {text}
          </span>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------- part
interface PartProps {
  inst: ComponentInstance;
  def: ComponentDefinition;
  simulating: boolean;
  selected: boolean;
  zoom: number;
  toWorld: ToWorld;
}

const PROPERTY_CONTROLS = new Set(['slider', 'select', 'range-target', 'tilt']);

const PartControls = memo(function PartControls({ inst, def, simulating, selected, zoom, toWorld }: PartProps) {
  // Running: everything. Stopped: property controls of the selected part (initial conditions).
  const controls = (def.controls ?? []).filter((c) => simulating || (selected && PROPERTY_CONTROLS.has(c.kind)));
  const indicators = simulating ? (def.indicators ?? []) : [];
  if (!controls.length && !indicators.length) return null;
  const onPart = controls.filter((c) => c.kind === 'range-target' || c.kind === 'keys' || c.kind === 'stick' || c.kind === 'rotary');
  const chips = controls.filter((c) => c.kind === 'slider' || c.kind === 'select' || c.kind === 'tilt' || c.kind === 'action');
  const readouts = indicators.filter((i): i is Extract<IndicatorDefinition, { kind: 'readout' }> => i.kind === 'readout');
  const drawn = indicators.filter((i) => i.kind !== 'readout');
  const { width, height } = def.size;
  const b = componentBounds(inst, def);
  // Chips keep a readable size: they shrink with the canvas only down to 75 % / up to 100 %.
  const screen = Math.max(0.75, Math.min(1, zoom));
  const top = readouts.filter((r) => r.anchor === 'top');
  const bottom = readouts.filter((r) => r.anchor !== 'top');
  return (
    <>
      {(onPart.length > 0 || drawn.length > 0) && (
        <div
          className="simctl-host"
          style={{ left: inst.x, top: inst.y, width, height, transform: `rotate(${inst.rotation}deg)${inst.flip ? ' scaleX(-1)' : ''}` }}
        >
          {drawn.length > 0 && <Indicators inst={inst} def={def} list={drawn} />}
          {onPart.map((c, i) => {
            switch (c.kind) {
              case 'range-target':
                return <RangeTarget key={i} inst={inst} def={def} c={c} toWorld={toWorld} editable={selected || simulating} />;
              case 'keys':
                return <KeyRegions key={i} inst={inst} def={def} c={c} />;
              case 'stick':
                return <Stick key={i} inst={inst} def={def} c={c} toWorld={toWorld} />;
              case 'rotary':
                return <Rotary key={i} inst={inst} def={def} c={c} toWorld={toWorld} />;
              default:
                return null;
            }
          })}
        </div>
      )}
      {top.length > 0 && (
        <div className="simctl-chips above" style={{ left: b.x + b.width / 2, top: b.y - 4, transform: `translate(-50%, -100%) scale(${screen / zoom})` }}>
          <Readouts inst={inst} def={def} list={top} />
        </div>
      )}
      {(chips.length > 0 || bottom.length > 0) && (
        <div className="simctl-chips" style={{ left: b.x + b.width / 2, top: b.y + b.height + 6, transform: `translateX(-50%) scale(${screen / zoom})` }}>
          <Readouts inst={inst} def={def} list={bottom} />
          {chips.map((c, i) => {
            switch (c.kind) {
              case 'slider':
                return <SliderChip key={i} inst={inst} def={def} c={c} />;
              case 'select':
                return <SelectChip key={i} inst={inst} def={def} c={c} />;
              case 'tilt':
                return <TiltChip key={i} inst={inst} def={def} c={c} />;
              case 'action':
                return <ActionChip key={i} inst={inst} c={c} />;
              default:
                return null;
            }
          })}
        </div>
      )}
    </>
  );
});

export function SimControlsLayer({
  components,
  simulating,
  selected,
  zoom,
  toWorld,
}: {
  components: ComponentInstance[];
  simulating: boolean;
  selected: Set<string>;
  zoom: number;
  toWorld: ToWorld;
}) {
  return (
    <div className="simctl-layer">
      {components.map((inst) => {
        const def = lookup(inst.type);
        if (!def || def.simulation.support === 'visual-only' || (!def.controls?.length && !def.indicators?.length)) return null;
        return <PartControls key={inst.id} inst={inst} def={def} simulating={simulating} selected={selected.has(inst.id) && selected.size === 1} zoom={zoom} toWorld={toWorld} />;
      })}
    </div>
  );
}

/** Local direction vector (exported for tests and models drawing in front of parts). */
export const directionVector = (d: LocalDirection): LocalPoint => DIR[d];
