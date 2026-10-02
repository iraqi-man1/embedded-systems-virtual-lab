/**
 * Parts guide (F1): every part in the library with what it is, what it is
 * for, how to wire it step by step, its pins with the suggested Arduino Uno
 * and Raspberry Pi Pico connections, tips, and the examples that use it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentDefinition } from '../../core/model/component';
import { registry } from '../../app/registry';
import { guideEntry } from '../../components/builtin/guide';
import { EXAMPLES } from '../../examples';
import type { ExampleInfo } from '../../examples/catalog';
import { tr, type MessageKey } from '../../i18n';
import { useT } from '../../i18n/react';
import { useEditor } from '../../state/editor';
import { Icon } from '../common/Icon';
import { Tip } from '../common/Tooltip';
import { ExampleCard, exampleProject } from '../home/ExampleGallery';
import { CircuitPreview } from '../home/CircuitPreview';
import { CATEGORY_ICON, sortedCategories } from '../library/LibraryPanel';
import { addComponentAtCenter } from '../workspace/actions';
import { boardPins, partName, partWhat, pick, pinFunction, pinGroups, pinSignals, showsBoardColumns, isSocketBoard } from './guideModel';
import { closeGuide } from './open';
import { PartFigure } from './PartFigure';
import { Prose } from './Prose';

const SUPPORT: Record<ComponentDefinition['simulation']['support'], { label: MessageKey; text: MessageKey }> = {
  full: { label: 'Simulated', text: 'Simulated: it behaves like the real part, within the limits below.' },
  partial: { label: 'Partially simulated', text: 'Partly simulated: the main behaviour works; the limits are listed below.' },
  'visual-only': { label: 'Visual only', text: 'Drawn and wired only: it is not simulated yet, so it does nothing while the circuit runs.' },
};

const showPart = (type: string | null) => useEditor.getState().set({ guideType: type });

/** Examples whose circuit contains each part type (built once, on first use). */
let usage: Map<string, ExampleInfo[]> | null = null;
function examplesUsing(type: string): ExampleInfo[] {
  if (!usage) {
    usage = new Map();
    for (const ex of EXAMPLES) {
      for (const c of new Set(exampleProject(ex).circuit.components.map((x) => x.type))) {
        if (!usage.has(c)) usage.set(c, []);
        usage.get(c)!.push(ex);
      }
    }
  }
  return usage.get(type) ?? [];
}

/** Search over the names in both languages, the guide text, tags and pin names. */
function matches(def: ComponentDefinition, q: string): boolean {
  if (!q) return true;
  const g = guideEntry(def.type);
  const hay = [def.name, def.type, tr(def.category), def.subcategory ?? '', ...(def.tags ?? []), def.docs.summary, ...(g ? [g.ar, ...g.what, ...g.uses.flat()] : []), ...def.pins.map((p) => p.id)]
    .join(' ')
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

function useCategories(query: string, simOnly: boolean) {
  return useMemo(
    () =>
      sortedCategories()
        .map((cat) => ({
          name: cat.name,
          defs: [...cat.subcategories.values()].flat().filter((d) => (!simOnly || d.simulation.support !== 'visual-only') && matches(d, query.trim())),
        }))
        .filter((c) => c.defs.length),
    [query, simOnly],
  );
}

function Sidebar({ cats, current }: { cats: ReturnType<typeof useCategories>; current: string | null }) {
  const t = useT();
  const active = useRef<HTMLButtonElement>(null);
  useEffect(() => active.current?.scrollIntoView({ block: 'nearest' }), [current]);
  return (
    <nav className="guide-nav" aria-label={t('Parts')}>
      <button className={`guide-nav-item overview${current ? '' : ' on'}`} onClick={() => showPart(null)}>
        <Icon name="grid" /> {t('All parts')}
      </button>
      {cats.map((cat) => (
        <div key={cat.name} className="guide-nav-group">
          <div className="guide-nav-cat">
            <Icon name={CATEGORY_ICON[cat.name] ?? 'box'} size={13} /> {tr(cat.name)}
          </div>
          {cat.defs.map((d) => (
            <button key={d.type} ref={d.type === current ? active : undefined} className={`guide-nav-item${d.type === current ? ' on' : ''}`} onClick={() => showPart(d.type)}>
              <span className="name">{partName(d)}</span>
              <span className={`dot ${d.simulation.support}`} />
            </button>
          ))}
        </div>
      ))}
      {!cats.length && <div className="guide-empty">{t('No part matches. Try another word.')}</div>}
    </nav>
  );
}

/** Overview: every part as a tile, by category. */
function Overview({ cats }: { cats: ReturnType<typeof useCategories> }) {
  const t = useT();
  const all = registry.all();
  const simulated = all.filter((d) => d.simulation.support !== 'visual-only').length;
  return (
    <div className="guide-overview">
      <header className="guide-intro">
        <h1>{t('Parts guide')}</h1>
        <p>{t('What each part is, what it is for and how to connect it, with the pins to use on an Arduino Uno and a Raspberry Pi Pico.')}</p>
        <div className="guide-legend">
          <span>{t('{total} parts · {n} simulated', { total: all.length, n: simulated })}</span>
          <span>
            <span className="dot full" /> {t('Simulated')} <span className="dot partial" /> {t('Partially simulated')} <span className="dot visual-only" /> {t('Visual only')}
          </span>
        </div>
      </header>
      {cats.map((cat) => (
        <section key={cat.name} className="guide-cat">
          <h2>
            <Icon name={CATEGORY_ICON[cat.name] ?? 'box'} /> {tr(cat.name)} <span className="count">{cat.defs.length}</span>
          </h2>
          <div className="guide-tiles">
            {cat.defs.map((d) => (
              <button key={d.type} className="guide-tile" onClick={() => showPart(d.type)}>
                <span className="card-canvas">
                  <CircuitPreview circuit={{ components: [{ id: d.type, type: d.type, x: 0, y: 0, rotation: 0, label: '', props: {} }], wires: [] }} padding={12} maxZoom={1.6} />
                </span>
                <span className="guide-tile-name">
                  <span className={`dot ${d.simulation.support}`} />
                  {partName(d)}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="guide-code">
      <div className="guide-code-head">
        <span>{t('Example code')}</span>
        <button
          className="btn ghost"
          onClick={() => {
            void navigator.clipboard?.writeText(code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          <Icon name={copied ? 'check' : 'copy'} /> {copied ? t('Copied') : t('Copy')}
        </button>
      </div>
      <pre className="ltr">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function PartPage({ def }: { def: ComponentDefinition }) {
  const t = useT();
  const g = guideEntry(def.type);
  const groups = useMemo(() => pinGroups(def), [def]);
  const [pin, setPin] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setPin(null);
    scroller.current?.closest('.guide-main')?.scrollTo({ top: 0 });
  }, [def]);
  const support = SUPPORT[def.simulation.support];
  const columns = showsBoardColumns(def, g);
  const examples = examplesUsing(def.type);
  const english = partName(def) !== def.name;

  return (
    <article className="guide-part" ref={scroller}>
      <header className="guide-head">
        <div className="guide-eyebrow">
          {tr(def.category)}
          {def.subcategory ? ` › ${tr(def.subcategory)}` : ''}
        </div>
        <h1>{partName(def)}</h1>
        {english && (
          <div className="guide-en">
            <span className="ltr">{def.name}</span>
          </div>
        )}
        <div className="guide-head-row">
          <span className={`badge ${def.simulation.support}`}>{t(support.label)}</span>
          <button
            className="btn primary"
            onClick={() => {
              addComponentAtCenter(def.type);
              useEditor.getState().set({ page: null, guideType: null });
            }}
          >
            <Icon name="plus" /> {t('Add to canvas')}
          </button>
        </div>
      </header>

      <div className="guide-top">
        <figure className="guide-figure">
          <PartFigure def={def} groups={groups} active={pin} onActive={setPin} />
          {groups.length > 0 && !isSocketBoard(def) && <figcaption>{t('Point at a pin to find it in the table.')}</figcaption>}
        </figure>
        <div className="guide-about">
          <h2>{t('What it is')}</h2>
          <p className="guide-lede">
            <Prose text={partWhat(def)} />
          </p>
          {g && (
            <>
              <h2>{t('What it is used for')}</h2>
              <ul className="guide-uses">
                {g.uses.map((u, i) => (
                  <li key={i}>
                    <Prose text={pick(u)} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {(g?.steps?.length || g?.code) && (
        <section className="guide-sec">
          <h2>{t('How to connect it')}</h2>
          <div className={`guide-wiring${g.code ? ' with-code' : ''}`}>
            {g.steps?.length ? (
              <ol className="guide-steps">
                {g.steps.map((s, i) => (
                  <li key={i}>
                    <Prose text={pick(s)} />
                  </li>
                ))}
              </ol>
            ) : null}
            {g.code && <CodeBlock code={g.code} />}
          </div>
        </section>
      )}

      {groups.length > 0 && !isSocketBoard(def) && (
        <section className="guide-sec">
          <h2>
            {t('Pins')} <span className="count">{def.pins.length}</span>
          </h2>
          <div className="guide-table-wrap">
            <table className="guide-pins">
              <thead>
                <tr>
                  <th>{t('Pin')}</th>
                  <th>{t('Function')}</th>
                  {columns && <th className="board-col">Arduino Uno</th>}
                  {columns && <th className="board-col">Raspberry Pi Pico</th>}
                </tr>
              </thead>
              <tbody>
                {groups.map((gr) => {
                  const b = columns ? boardPins(def, gr, g) : null;
                  const signals = pinSignals(gr.pin);
                  return (
                    <tr key={gr.name} className={pin === gr.name ? 'on' : ''} onPointerEnter={() => setPin(gr.name)} onPointerLeave={() => setPin(null)}>
                      <td className="pin-name">
                        <span className={`kind ${gr.pin.kind}`} />
                        <span className="ltr">
                          {gr.name}
                          {gr.ids.length > 1 && <span className="times"> ×{gr.ids.length}</span>}
                        </span>
                      </td>
                      <td>
                        <Prose text={pinFunction(def, gr, g)} />
                        {signals.length > 0 && (
                          <span className="signals ltr">
                            {signals.map((s) => (
                              <span key={s} className="sig">
                                {s}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                      {columns && (
                        <td className="board-col">
                          <span className="ltr">{b?.[0] || '—'}</span>
                        </td>
                      )}
                      {columns && (
                        <td className="board-col">
                          <span className="ltr">{b?.[1] || '—'}</span>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {columns && <p className="guide-note">{t('The board columns are a suggestion that matches the example code; any free pin of the same kind works.')}</p>}
        </section>
      )}
      {isSocketBoard(def) && (
        <p className="guide-note">{t('{n} holes', { n: def.pins.length })}</p>
      )}

      {g?.tips?.length ? (
        <section className="guide-sec">
          <h2>{t('Tips and common mistakes')}</h2>
          <ul className="guide-tips">
            {g.tips.map((s, i) => (
              <li key={i}>
                <Icon name="info" size={14} />{' '}
                <span>
                  <Prose text={pick(s)} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="guide-sec">
        <h2>{t('In the simulator')}</h2>
        <div className={`guide-sim ${def.simulation.support}`}>
          <p>{t(support.text)}</p>
          {def.simulation.notes && (
            <p className="guide-sim-notes" dir="auto">
              {tr(def.simulation.notes)}
            </p>
          )}
        </div>
        {def.docs.datasheetUrl && (
          <p className="guide-note">
            {t('Datasheet:')} <span className="ltr guide-url">{def.docs.datasheetUrl}</span>
          </p>
        )}
      </section>

      {examples.length > 0 && (
        <section className="guide-sec">
          <h2>
            {t('Examples that use it')} <span className="count">{examples.length}</span>
          </h2>
          <div className="card-grid">
            {examples.map((ex) => (
              <ExampleCard key={ex.id} ex={ex} />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

export function PartsGuide() {
  const t = useT();
  const type = useEditor((s) => s.guideType);
  const back = useEditor((s) => s.guideReturn);
  const [query, setQuery] = useState('');
  const [simOnly, setSimOnly] = useState(false);
  const cats = useCategories(query, simOnly);
  const def = type ? registry.get(type) : undefined;
  const search = useRef<HTMLInputElement>(null);

  return (
    <div className="home guide" role="main">
      <div className="home-top">
        <Tip content={back === 'home' ? t('Back to the start screen') : t('Back to the editor')} shortcut="Esc" direct>
          <button className="btn" onClick={closeGuide}>
            <Icon name="chevron-left" /> {t('Back')}
          </button>
        </Tip>
        <div className="home-brand">
          <Icon name="book" /> {t('Parts guide')}
        </div>
        <div className="search-box guide-search">
          <Icon name="search" />
          <input
            ref={search}
            placeholder={t('Search parts, uses or pins…')}
            aria-label={t('Search parts')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) {
                setQuery('');
                e.stopPropagation();
              } else if (e.key === 'Enter' && cats[0]?.defs[0]) {
                showPart(cats[0].defs[0].type);
              }
            }}
          />
        </div>
        <div className="home-top-actions">
          <button className={`chip${simOnly ? ' active' : ''}`} aria-pressed={simOnly} onClick={() => setSimOnly(!simOnly)}>
            {t('Simulated only')}
          </button>
        </div>
      </div>
      <div className="guide-body">
        <Sidebar cats={cats} current={def ? def.type : null} />
        <div className="guide-main">{def ? <PartPage key={def.type} def={def} /> : <Overview cats={cats} />}</div>
      </div>
    </div>
  );
}
