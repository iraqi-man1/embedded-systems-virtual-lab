import { createElement, memo, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentDefinition } from '../../core/model/component';
import { registry } from '../../app/registry';
import { tr, type MessageKey } from '../../i18n';
import { useT } from '../../i18n/react';
import { useEditor } from '../../state/editor';
import { addComponentAtCenter } from '../workspace/actions';
import { guideEntry } from '../../components/builtin/guide';
import { partName, partWhat, pick } from '../guide/guideModel';
import { openGuide } from '../guide/open';
import { Prose } from '../guide/Prose';
import { Icon } from '../common/Icon';
import { Tip } from '../common/Tooltip';

const SUPPORT_LABEL: Record<ComponentDefinition['simulation']['support'], MessageKey> = { full: 'Simulated', partial: 'Partial', 'visual-only': 'Visual only' };

/** Transparent drag image (the canvas shows its own preview). */
const EMPTY_DRAG_IMAGE = (() => {
  const img = new Image(1, 1);
  img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  return img;
})();

export const CATEGORY_ICON: Record<string, string> = {
  Boards: 'chip',
  Prototyping: 'grid',
  Power: 'zap',
  Passive: 'waves',
  Semiconductors: 'cpu',
  Output: 'bulb',
  Input: 'crosshair',
  Sensors: 'activity',
  Actuators: 'settings',
  'Integrated Circuits': 'cpu',
  Communication: 'cable',
};

const CATEGORY_ORDER = ['Boards', 'Prototyping', 'Power', 'Passive', 'Semiconductors', 'Input', 'Output', 'Sensors', 'Actuators', 'Integrated Circuits', 'Communication'];

/** Library categories in teaching order (boards first, communication modules last). */
export function sortedCategories() {
  return registry.categories().sort((a, b) => (CATEGORY_ORDER.indexOf(a.name) + 1 || 99) - (CATEGORY_ORDER.indexOf(b.name) + 1 || 99));
}

/** Library search, also by the Arabic names and uses from the parts guide. */
function searchParts(query: string): ComponentDefinition[] {
  const found = registry.search(query);
  if (!/[\u0600-\u06ff]/.test(query)) return found;
  const words = query.trim().split(/\s+/);
  const seen = new Set(found.map((d) => d.type));
  const arabic = registry.all().filter((d) => {
    const g = guideEntry(d.type);
    const hay = g ? [g.ar, g.what[1], ...g.uses.map((u) => u[1])].join(' ') : '';
    return !seen.has(d.type) && words.every((w) => hay.includes(w));
  });
  // Name matches first.
  arabic.sort((a, b) => Number(!guideEntry(a.type)!.ar.includes(words[0])) - Number(!guideEntry(b.type)!.ar.includes(words[0])));
  return [...found, ...arabic];
}

/** Small preview: inline SVG as an image, Wokwi elements rendered lazily and scaled down. */
const Thumb = memo(function Thumb({ def }: { def: ComponentDefinition }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: '100px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const scale = Math.min(28 / def.size.width, 22 / def.size.height);
  let content: React.ReactNode = <Icon name={CATEGORY_ICON[def.category] ?? 'box'} />;
  if (visible && def.visual.kind === 'svg') {
    content = <img alt="" src={`data:image/svg+xml;utf8,${encodeURIComponent(def.visual.svg)}`} />;
  } else if (visible && def.visual.kind === 'wokwi') {
    content = (
      <div style={{ width: def.size.width, height: def.size.height, transform: `scale(${scale})`, transformOrigin: 'center', flex: 'none', pointerEvents: 'none' }}>
        {createElement(def.visual.tag)}
      </div>
    );
  }
  return (
    <div className="thumb" ref={ref}>
      {content}
    </div>
  );
});

interface ItemProps {
  def: ComponentDefinition;
  fav: boolean;
  /** Highlighted by keyboard navigation in search results. */
  active?: boolean;
}

const Item = memo(function Item({ def, fav, active }: ItemProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  return (
    <Tip content={<InfoCard def={def} />} card side="right" align="start" delay={500} direct>
      <div
        ref={ref}
        className={`lib-item${active ? ' active' : ''}`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('application/x-evlab-component', def.type);
          e.dataTransfer.effectAllowed = 'copy';
          // The canvas draws a full-size ghost where the part will land.
          e.dataTransfer.setDragImage(EMPTY_DRAG_IMAGE, 0, 0);
          useEditor.getState().set({ dragType: def.type });
        }}
        onDragEnd={() => useEditor.getState().set({ dragType: null })}
        onDoubleClick={() => addComponentAtCenter(def.type)}
      >
        <Thumb def={def} />
        <span className="name">{partName(def)}</span>
        <span className={`dot ${def.simulation.support}`} aria-label={t(SUPPORT_LABEL[def.simulation.support])} />
        <button
          className="icon-btn guide-btn"
          aria-label={t('Open in Parts Guide')}
          onClick={(e) => {
            e.stopPropagation();
            openGuide(def.type);
          }}
        >
          <Icon name="help" size={13} />
        </button>
        <button
          className={`icon-btn star${fav ? ' on' : ''}`}
          aria-label={fav ? t('Remove from favourites') : t('Add to favourites')}
          onClick={(e) => {
            e.stopPropagation();
            useEditor.getState().toggleFavorite(def.type);
          }}
        >
          <Icon name="star" size={13} fill={fav ? 'currentColor' : 'none'} />
        </button>
      </div>
    </Tip>
  );
});

export function LibraryPanel() {
  const t = useT();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  // Category collapse and the simulated-only filter persist between sessions.
  const simOnly = useEditor((s) => s.librarySimOnly);
  const setSimOnly = (v: boolean) => useEditor.getState().setPrefs({ librarySimOnly: v });
  const collapsedList = useEditor((s) => s.libraryCollapsed);
  const collapsed = useMemo(() => new Set(collapsedList), [collapsedList]);
  const favorites = useEditor((s) => s.favorites);
  const recent = useEditor((s) => s.recent);
  const [, force] = useState(0);
  useEffect(() => registry.subscribe(() => force((n) => n + 1)), []);

  const favSet = new Set(favorites);
  const filter = (d: ComponentDefinition) => !simOnly || d.simulation.support !== 'visual-only';
  const results = useMemo(() => (query ? searchParts(query).filter(filter) : []), [query, simOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  const cats = sortedCategories();
  const toggle = (name: string) => {
    const s = new Set(collapsed);
    if (s.has(name)) s.delete(name);
    else s.add(name);
    useEditor.getState().setPrefs({ libraryCollapsed: [...s] });
  };
  const total = registry.all().length;
  const simulated = registry.all().filter((d) => d.simulation.support !== 'visual-only').length;

  return (
    <div className="panel" style={{ height: '100%' }}>
      <div className="panel-header">
        <span className="title">{t('Components')}</span>
        <Tip content={t('{n} of {total} parts have simulation models', { n: simulated, total })} direct>
          <span style={{ color: 'var(--text-3)', fontSize: 11 }}>{t('{total} parts · {n} simulated', { total, n: simulated })}</span>
        </Tip>
      </div>
      <div className="lib-search">
        <div className="search-box">
          <Icon name="search" />
          <input
            placeholder={t('Search parts (e.g. led, sensor, i2c)…  /')}
            aria-label={t('Search parts')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const n = results.length;
                if (n) setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
              } else if (e.key === 'Enter' && results[active]) {
                e.preventDefault();
                addComponentAtCenter(results[active].type);
              } else if (e.key === 'Escape') {
                if (query) setQuery('');
                else (e.target as HTMLInputElement).blur();
                e.stopPropagation();
              }
            }}
          />
          {query && (
            <button className="icon-btn" aria-label={t('Clear search')} onClick={() => setQuery('')}>
              <Icon name="x" />
            </button>
          )}
        </div>
        <div className="chips">
          <Tip content={t('Hide visual-only parts')} direct>
            <button className={`chip${simOnly ? ' active' : ''}`} aria-pressed={simOnly} onClick={() => setSimOnly(!simOnly)}>
              {t('Simulated only')}
            </button>
          </Tip>
          {/* Legend for the dots on each part (text, not a control). */}
          <span className="lib-legend" aria-label={t('Simulation support legend')}>
            <span className="dot full" /> {t('full')} <span className="dot partial" /> {t('partial')} <span className="dot visual-only" /> {t('visual')}
          </span>
        </div>
      </div>
      <div className="lib-list">
        {query ? (
          <>
            <div className="lib-section">
              {t('Results')} <span className="count">{results.length}</span>
            </div>
            {results.map((d, i) => (
              <Item key={d.type} def={d} fav={favSet.has(d.type)} active={i === active} />
            ))}
            {results.length > 0 && <div className="lib-sub">{t('↑/↓ to choose · Enter adds to the canvas')}</div>}
            {!results.length && <div className="lib-sub">{t('No parts match “{query}”.', { query })}</div>}
          </>
        ) : (
          <>
            {favorites.length > 0 && (
              <>
                <div className="lib-section" onClick={() => toggle('__fav')}>
                  <Icon name={collapsed.has('__fav') ? 'chevron-right' : 'chevron-down'} className="chev" /> {t('Favourites')} <span className="count">{favorites.length}</span>
                </div>
                {!collapsed.has('__fav') &&
                  favorites
                    .map((t) => registry.get(t))
                    .filter((d): d is ComponentDefinition => !!d && filter(d))
                    .map((d) => <Item key={d.type} def={d} fav />)}
              </>
            )}
            {recent.length > 0 && (
              <>
                <div className="lib-section" onClick={() => toggle('__recent')}>
                  <Icon name={collapsed.has('__recent') ? 'chevron-right' : 'chevron-down'} className="chev" /> {t('Recently used')}
                </div>
                {!collapsed.has('__recent') &&
                  recent
                    .slice(0, 6)
                    .map((t) => registry.get(t))
                    .filter((d): d is ComponentDefinition => !!d && filter(d))
                    .map((d) => <Item key={`r-${d.type}`} def={d} fav={favSet.has(d.type)} />)}
              </>
            )}
            {cats.map((cat) => {
              const open = !collapsed.has(cat.name);
              return (
                <div key={cat.name}>
                  <div className="lib-section" onClick={() => toggle(cat.name)}>
                    <Icon name={open ? 'chevron-down' : 'chevron-right'} className="chev" /> {tr(cat.name)} <span className="count">{cat.count}</span>
                  </div>
                  {open &&
                    [...cat.subcategories.entries()].map(([sub, defs]) => {
                      const shown = defs.filter(filter);
                      if (!shown.length) return null;
                      return (
                        <div key={sub}>
                          {cat.subcategories.size > 1 && <div className="lib-sub">{tr(sub)}</div>}
                          {shown.map((d) => (
                            <Item key={d.type} def={d} fav={favSet.has(d.type)} />
                          ))}
                        </div>
                      );
                    })}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

function InfoCard({ def }: { def: ComponentDefinition }) {
  const t = useT();
  const pins = def.pins.filter((p) => p.kind !== 'socket');
  const g = guideEntry(def.type);
  return (
    <div className="lib-tooltip">
      <h4>{partName(def)}</h4>
      <span className={`badge ${def.simulation.support}`}>{t(SUPPORT_LABEL[def.simulation.support])}</span>
      <p>
        <Prose text={partWhat(def)} />
      </p>
      {g && g.uses.length > 0 && (
        <p>
          <b>{t('Used for:')}</b> <Prose text={g.uses.slice(0, 2).map(pick).join(' · ')} />
        </p>
      )}
      {def.simulation.notes && <p style={{ fontSize: 11 }}>{def.simulation.notes}</p>}
      {pins.length > 0 && (
        <div className="pins">
          {t('Pins:')} {pins.slice(0, 40).map((p) => p.label ?? p.id).join(', ')}
          {pins.length > 40 ? ` … (+${pins.length - 40})` : ''}
        </div>
      )}
      {def.pins.some((p) => p.kind === 'socket') && <div className="pins">{t('{n} holes', { n: def.pins.length })}</div>}
      <div className="hint">{t('Drag onto the canvas or double-click to add. The ? button opens the parts guide.')}</div>
    </div>
  );
}
