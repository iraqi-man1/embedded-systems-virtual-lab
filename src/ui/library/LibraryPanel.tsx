import { createElement, memo, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentDefinition } from '../../core/model/component';
import { registry } from '../../app/registry';
import { useEditor } from '../../state/editor';
import { addComponentAtCenter } from '../workspace/actions';
import { Icon } from '../common/Icon';
import { Tip } from '../common/Tooltip';

const SUPPORT_LABEL = { full: 'Simulated', partial: 'Partial', 'visual-only': 'Visual only' } as const;

/** Transparent drag image (the canvas shows its own preview). */
const EMPTY_DRAG_IMAGE = (() => {
  const img = new Image(1, 1);
  img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  return img;
})();

const CATEGORY_ICON: Record<string, string> = {
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
        <span className="name">{def.name}</span>
        <span className={`dot ${def.simulation.support}`} aria-label={SUPPORT_LABEL[def.simulation.support]} />
        <button
          className={`icon-btn star${fav ? ' on' : ''}`}
          aria-label={fav ? 'Remove from favourites' : 'Add to favourites'}
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
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [simOnly, setSimOnly] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(['Communication', 'Integrated Circuits', 'Actuators', 'Sensors']));
  const favorites = useEditor((s) => s.favorites);
  const recent = useEditor((s) => s.recent);
  const [, force] = useState(0);
  useEffect(() => registry.subscribe(() => force((n) => n + 1)), []);

  const favSet = new Set(favorites);
  const filter = (d: ComponentDefinition) => !simOnly || d.simulation.support !== 'visual-only';
  const results = useMemo(() => (query ? registry.search(query).filter(filter) : []), [query, simOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  const cats = registry.categories();
  const order = ['Boards', 'Prototyping', 'Power', 'Passive', 'Semiconductors', 'Input', 'Output', 'Sensors', 'Actuators', 'Integrated Circuits', 'Communication'];
  cats.sort((a, b) => (order.indexOf(a.name) + 1 || 99) - (order.indexOf(b.name) + 1 || 99));
  const toggle = (name: string) => {
    const s = new Set(collapsed);
    if (s.has(name)) s.delete(name);
    else s.add(name);
    setCollapsed(s);
  };
  const total = registry.all().length;
  const simulated = registry.all().filter((d) => d.simulation.support !== 'visual-only').length;

  return (
    <div className="panel" style={{ height: '100%' }}>
      <div className="panel-header">
        <span className="title">Components</span>
        <span style={{ color: 'var(--text-3)', fontSize: 11 }} title={`${simulated} of ${total} parts have simulation models`}>
          {total} parts · {simulated} simulated
        </span>
      </div>
      <div className="lib-search">
        <div className="search-box">
          <Icon name="search" />
          <input
            placeholder="Search parts (e.g. led, sensor, i2c)…  /"
            aria-label="Search parts"
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
            <button className="icon-btn" onClick={() => setQuery('')}>
              <Icon name="x" />
            </button>
          )}
        </div>
        <div className="chips">
          <button className={`chip${simOnly ? ' active' : ''}`} onClick={() => setSimOnly(!simOnly)} title="Hide visual-only parts">
            Simulated only
          </button>
          <span className="chip" style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'default' }}>
            <span className="dot full" /> full <span className="dot partial" /> partial <span className="dot visual-only" /> visual
          </span>
        </div>
      </div>
      <div className="lib-list">
        {query ? (
          <>
            <div className="lib-section">
              Results <span className="count">{results.length}</span>
            </div>
            {results.map((d, i) => (
              <Item key={d.type} def={d} fav={favSet.has(d.type)} active={i === active} />
            ))}
            {results.length > 0 && <div className="lib-sub">↑/↓ to choose · Enter adds to the canvas</div>}
            {!results.length && <div className="lib-sub">No parts match “{query}”.</div>}
          </>
        ) : (
          <>
            {favorites.length > 0 && (
              <>
                <div className="lib-section" onClick={() => toggle('__fav')}>
                  <Icon name={collapsed.has('__fav') ? 'chevron-right' : 'chevron-down'} /> Favourites <span className="count">{favorites.length}</span>
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
                  <Icon name={collapsed.has('__recent') ? 'chevron-right' : 'chevron-down'} /> Recently used
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
                    <Icon name={open ? 'chevron-down' : 'chevron-right'} /> {cat.name} <span className="count">{cat.count}</span>
                  </div>
                  {open &&
                    [...cat.subcategories.entries()].map(([sub, defs]) => {
                      const shown = defs.filter(filter);
                      if (!shown.length) return null;
                      return (
                        <div key={sub}>
                          {cat.subcategories.size > 1 && <div className="lib-sub">{sub}</div>}
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
  const pins = def.pins.filter((p) => p.kind !== 'socket');
  return (
    <div className="lib-tooltip">
      <h4>{def.name}</h4>
      <span className={`badge ${def.simulation.support}`}>{SUPPORT_LABEL[def.simulation.support]}</span>
      <p>{def.docs.summary}</p>
      {def.simulation.notes && <p style={{ fontSize: 11 }}>{def.simulation.notes}</p>}
      {pins.length > 0 && (
        <div className="pins">
          Pins: {pins.slice(0, 40).map((p) => p.label ?? p.id).join(', ')}
          {pins.length > 40 ? ` … (+${pins.length - 40})` : ''}
        </div>
      )}
      {def.pins.some((p) => p.kind === 'socket') && <div className="pins">{def.pins.length} holes</div>}
      <div className="hint">Drag onto the canvas or double-click to add</div>
    </div>
  );
}
