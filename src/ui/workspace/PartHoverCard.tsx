/**
 * Resting the mouse on a part for a moment shows a small card: its name, its
 * main values, what it is and what it is for. F1 opens its page in the parts
 * guide. The card never takes the mouse (the canvas keeps working under it)
 * and hides as soon as anything else happens.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentInstance } from '../../core/model/circuit';
import type { ComponentDefinition, PropertyDefinition } from '../../core/model/component';
import { formatEngineering, parseEngineering } from '../../core/model/units';
import { guideEntry } from '../../components/builtin/guide';
import { tr } from '../../i18n';
import { rich, useT } from '../../i18n/react';
import { useEditor } from '../../state/editor';
import { AnchoredPopover } from '../common/Popover';
import { partName, partWhat, pick } from '../guide/guideModel';
import { setHoveredPart } from '../guide/open';
import { Prose } from '../guide/Prose';

/** How long the pointer rests on a part before the card appears. */
const DELAY_MS = 700;

interface Card {
  id: string;
  x: number;
  y: number;
}

export function usePartHover() {
  const [card, setCard] = useState<Card | null>(null);
  const pending = useRef<Card | null>(null);
  /** Where the pointer was when the wait started: moving away restarts it. */
  const start = useRef<{ x: number; y: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const cancel = useCallback(() => {
    window.clearTimeout(timer.current);
    pending.current = null;
    start.current = null;
    setHoveredPart(null);
    setCard(null);
  }, []);

  /** Pointer over a part (or over none: `id` null). */
  const track = useCallback(
    (id: string | null, x: number, y: number, type: string | null) => {
      if (!id) {
        if (pending.current || card) cancel();
        return;
      }
      if (card?.id === id) return;
      if (card) {
        setCard(null);
        setHoveredPart(null);
      }
      const s = start.current;
      if (pending.current?.id !== id || !s || Math.hypot(x - s.x, y - s.y) > 8) {
        start.current = { x, y };
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          if (!pending.current) return;
          setCard(pending.current);
          setHoveredPart(type);
        }, DELAY_MS);
      }
      pending.current = { id, x, y };
    },
    [card, cancel],
  );

  // Anything else the user does hides it: a click, the wheel, a key (except F1), the view moving.
  useEffect(() => {
    if (!card && !pending.current) return;
    const key = (e: KeyboardEvent) => e.key !== 'F1' && cancel();
    window.addEventListener('pointerdown', cancel, true);
    window.addEventListener('wheel', cancel, true);
    window.addEventListener('keydown', key, true);
    const unsub = useEditor.subscribe((s, prev) => s.viewport !== prev.viewport && cancel());
    return () => {
      window.removeEventListener('pointerdown', cancel, true);
      window.removeEventListener('wheel', cancel, true);
      window.removeEventListener('keydown', key, true);
      unsub();
    };
  });

  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { card, track, cancel };
}

/** A property worth showing on the card, formatted like the Inspector. */
function propText(p: PropertyDefinition, v: unknown): string | null {
  if (p.type === 'boolean' || p.live) return null;
  if (p.type === 'enum') {
    const o = p.options?.find((x) => x.value === v);
    return o ? tr(o.label) : null;
  }
  if (p.type === 'color') return tr(String(v).charAt(0).toUpperCase() + String(v).slice(1));
  if (p.engineering) {
    const n = parseEngineering(String(v));
    return Number.isFinite(n) ? formatEngineering(n, p.unit ?? '') : String(v);
  }
  if (p.type === 'number') return `${v}${p.unit ? ` ${p.unit}` : ''}`;
  return String(v) || null;
}

export function PartHoverCard({ card, inst, def, simulating }: { card: Card; inst: ComponentInstance; def: ComponentDefinition; simulating: boolean }) {
  const t = useT();
  const g = guideEntry(def.type);
  const values = def.properties
    .map((p) => ({ p, text: propText(p, inst.props[p.key] ?? p.default) }))
    .filter((x): x is { p: PropertyDefinition; text: string } => !!x.text)
    .slice(0, 3);
  return (
    <AnchoredPopover anchor={{ x: card.x, y: card.y }} side="bottom" align="start" sideOffset={18} className="part-card" passive>
      <div className="part-card-head">
        <span className="ref ltr">{inst.label}</span>
        <span className="name">{partName(def)}</span>
        {def.simulation.support !== 'full' && <span className={`badge ${def.simulation.support}`}>{t(def.simulation.support === 'partial' ? 'Partial' : simulating ? 'not simulated' : 'Visual only')}</span>}
      </div>
      {values.length > 0 && (
        <div className="part-card-values">
          {values.map(({ p, text }) => (
            <span key={p.key}>
              <span className="k">{tr(p.label)}</span> <b className="ltr">{text}</b>
            </span>
          ))}
        </div>
      )}
      <p className="part-card-what">
        <Prose text={partWhat(def)} />
      </p>
      {g && g.uses.length > 0 && (
        <p className="part-card-uses">
          <span className="k">{t('Used for:')}</span> <Prose text={g.uses.slice(0, 2).map(pick).join(' · ')} />
        </p>
      )}
      <div className="part-card-foot">{rich(t('{key} opens its page in the parts guide'), { key: <kbd>F1</kbd> })}</div>
    </AnchoredPopover>
  );
}
