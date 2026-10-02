/**
 * Quick value editor: double-click a part (or press Enter on the selected
 * one) to change its main value right there: a resistor's resistance (with
 * the usual kit values and its colour bands), an LED's colour, a sensor's
 * reading, a supply's voltage. Enter or a click applies (one undo step), Esc
 * closes, More properties opens the Properties panel.
 */
import { useEffect, useRef, useState } from 'react';
import type { CircuitDocument, ComponentInstance, PropValue } from '../../core/model/circuit';
import { resistorBands } from '../../core/model/colorCode';
import type { ComponentDefinition, PropertyDefinition } from '../../core/model/component';
import { formatEngineering, parseEngineering } from '../../core/model/units';
import { lookup } from '../../app/registry';
import { t, tr } from '../../i18n';
import { useT } from '../../i18n/react';
import { useEditor } from '../../state/editor';
import { useProject } from '../../state/project';
import { sendInput, useSim } from '../../state/sim';
import { Icon } from '../common/Icon';
import { AnchoredPopover } from '../common/Popover';
import { partName } from '../guide/guideModel';

/** The values worth editing quickly: the first non-switch property, or all the switches (DIP switch). */
export function quickProperties(def: ComponentDefinition): PropertyDefinition[] {
  const first = def.properties.find((p) => p.type !== 'boolean');
  return first ? [first] : def.properties.filter((p) => p.type === 'boolean');
}

/** Values found in a student kit, offered as one-click choices. */
const SUGGESTIONS: Record<string, string[]> = {
  'evlab.resistor': ['100', '220', '330', '470', '1k', '2.2k', '4.7k', '10k', '47k', '100k'],
  'evlab.potentiometer': ['1k', '5k', '10k', '50k', '100k'],
  'evlab.slide-potentiometer': ['1k', '5k', '10k', '50k', '100k'],
  'evlab.capacitor-ceramic': ['10p', '22p', '100p', '1n', '10n', '100n'],
  'evlab.capacitor-electrolytic': ['1u', '4.7u', '10u', '47u', '100u', '470u', '1000u'],
};

/** Opens the editor for a part at a point of the window (none: the part has nothing to edit). */
export function openQuickEdit(id: string, x: number, y: number): boolean {
  const inst = useProject.getState().project.circuit.components.find((c) => c.id === id);
  const def = inst && lookup(inst.type);
  if (!def || !quickProperties(def).length) return false;
  useEditor.getState().set({ quickEdit: { id, x, y }, contextMenu: null });
  return true;
}

const close = () => useEditor.getState().set({ quickEdit: null });

function apply(inst: ComponentInstance, def: ComponentDefinition, p: PropertyDefinition, v: PropValue) {
  useProject.getState().edit((c: CircuitDocument) => {
    const i = c.components.find((x) => x.id === inst.id);
    if (i) i.props[p.key] = v;
  });
  // Interactive values also drive the running model at once.
  if (useSim.getState().state !== 'stopped' && def.interaction?.property === p.key) sendInput(inst.id, def.interaction.input ?? 'value', v);
}

function Bands({ ohms }: { ohms: number }) {
  useT();
  const bands = resistorBands(ohms);
  if (!bands) return null;
  return (
    <div className="qe-bands" aria-label={t('Colour bands')}>
      <span className="qe-resistor" aria-hidden>
        {bands.map((b, i) => (
          <span key={i} className="qe-band" style={{ background: b.css }} />
        ))}
      </span>
      <span className="qe-band-names">{bands.map((b) => t(b.name)).join(' · ')}</span>
    </div>
  );
}

function Field({ inst, def, p, autoFocus }: { inst: ComponentInstance; def: ComponentDefinition; p: PropertyDefinition; autoFocus: boolean }) {
  useT();
  const value = inst.props[p.key] ?? p.default;
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) input.current?.select();
  }, [autoFocus]);

  if (p.type === 'enum') {
    return (
      <div className="qe-chips" role="radiogroup" aria-label={tr(p.label)}>
        {p.options?.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={`chip${value === o.value ? ' active' : ''}`}
            onClick={() => {
              apply(inst, def, p, o.value);
              close();
            }}
          >
            {tr(o.label)}
          </button>
        ))}
      </div>
    );
  }
  if (p.type === 'boolean') {
    return (
      <label className="qe-check">
        <input type="checkbox" checked={!!value} onChange={(e) => apply(inst, def, p, e.target.checked)} />
        {tr(p.label)}
      </label>
    );
  }

  const number = p.type === 'number';
  const parsed = p.engineering ? parseEngineering(text) : number ? Number(text) : NaN;
  const invalid = (p.engineering || number) && (!text.trim() || !Number.isFinite(parsed) || (p.min !== undefined && parsed < p.min) || (p.max !== undefined && parsed > p.max));
  const commit = (v: string = text) => {
    if (p.engineering || number) {
      const n = p.engineering ? parseEngineering(v) : Number(v);
      if (!v.trim() || !Number.isFinite(n) || (p.min !== undefined && n < p.min) || (p.max !== undefined && n > p.max)) return;
      apply(inst, def, p, number ? n : v.trim());
    } else apply(inst, def, p, v);
    close();
  };
  const suggestions = p.engineering ? SUGGESTIONS[def.type] : undefined;
  return (
    <>
      <div className="qe-row">
        <input
          ref={input}
          className={`input ltr${invalid ? ' invalid' : ''}`}
          value={text}
          aria-label={tr(p.label)}
          aria-invalid={invalid}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
        />
        {p.unit && <span className="unit ltr">{p.unit}</span>}
        <button className="btn primary" disabled={invalid} onClick={() => commit()}>
          {t('Apply')}
        </button>
      </div>
      {number && p.min !== undefined && p.max !== undefined && (
        <input
          type="range"
          className="qe-range"
          min={p.min}
          max={p.max}
          step={p.step ?? (p.max - p.min) / 100}
          value={Number.isFinite(parsed) ? parsed : Number(value)}
          aria-label={tr(p.label)}
          onChange={(e) => {
            setText(e.target.value);
            if (p.live) apply(inst, def, p, Number(e.target.value));
          }}
        />
      )}
      {p.engineering && !invalid && <div className="qe-value ltr">= {formatEngineering(parsed, p.unit ?? '')}</div>}
      {def.type === 'evlab.resistor' && p.key === 'resistance' && !invalid && <Bands ohms={parsed} />}
      {suggestions && (
        <div className="qe-chips">
          {suggestions.map((s) => (
            <button key={s} type="button" className={`chip ltr${parseEngineering(s) === parseEngineering(String(value)) ? ' active' : ''}`} onClick={() => commit(s)}>
              {formatEngineering(parseEngineering(s), p.unit ?? '')}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export function QuickEdit() {
  useT();
  const quick = useEditor((s) => s.quickEdit);
  const inst = useProject((s) => (quick ? s.project.circuit.components.find((c) => c.id === quick.id) : undefined));
  const box = useRef<HTMLDivElement>(null);

  // Closes on Esc, a click elsewhere, the view moving, or the part going away.
  useEffect(() => {
    if (!quick) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      close();
    };
    const down = (e: PointerEvent) => !(e.target as Element | null)?.closest?.('.quick-edit') && close();
    window.addEventListener('keydown', key, true);
    window.addEventListener('pointerdown', down, true);
    const unsub = useEditor.subscribe((s, prev) => s.viewport !== prev.viewport && close());
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('pointerdown', down, true);
      unsub();
    };
  }, [quick]);
  useEffect(() => {
    if (quick && !inst) close();
  }, [quick, inst]);

  const def = inst && lookup(inst.type);
  if (!quick || !inst || !def) return null;
  const props = quickProperties(def);
  return (
    <AnchoredPopover anchor={{ x: quick.x, y: quick.y }} side="bottom" align="start" sideOffset={10} className="quick-edit">
      <div ref={box} onKeyDown={(e) => e.stopPropagation()}>
        <div className="qe-head">
          <span className="ref ltr">{inst.label}</span>
          <span className="name">{partName(def)}</span>
        </div>
        {props.length === 1 && <div className="qe-label">{tr(props[0].label)}</div>}
        {props.map((p, i) => (
          <Field key={p.key} inst={inst} def={def} p={p} autoFocus={i === 0} />
        ))}
        <div className="qe-foot">
          <button
            className="btn ghost"
            onClick={() => {
              useEditor.getState().select([inst.id]);
              useEditor.getState().setPrefs({ showInspector: true });
              close();
            }}
          >
            <Icon name="settings" /> {t('More properties')}
          </button>
          <span className="hint">{t('Enter applies · Esc closes')}</span>
        </div>
      </div>
    </AnchoredPopover>
  );
}
