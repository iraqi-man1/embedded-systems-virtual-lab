/**
 * Command palette (Ctrl+Shift+P) and quick-add (Ctrl+K, or double-click on
 * empty canvas): fuzzy search over every application command or every
 * library part, keyboard first.
 */
import { useMemo, useState } from 'react';
import { Command } from 'cmdk';
import { registry } from '../../app/registry';
import { tr, type MessageKey } from '../../i18n';
import { rich, useT } from '../../i18n/react';
import { useEditor } from '../../state/editor';
import { commands } from '../commands';
import { Icon } from '../common/Icon';
import { addComponentAt, addComponentAtCenter } from '../workspace/actions';

/** Extra words people type for a command. */
const SYNONYMS: Record<string, string[]> = {
  fit: ['zoom to fit', 'zoom extents', 'show all'],
  zoomReset: ['zoom 100', 'reset zoom'],
  run: ['start simulation', 'play'],
  reset: ['restart'],
  compile: ['build', 'verify'],
  palette: ['commands'],
  quickAdd: ['insert part', 'new component'],
};

const SUPPORT: Record<'full' | 'partial' | 'visual-only', MessageKey> = { full: 'simulated', partial: 'partial', 'visual-only': 'visual only' };

function close() {
  useEditor.getState().set({ palette: null });
}

function CommandList() {
  const t = useT();
  const list = Object.values(commands);
  return (
    <>
      <Command.Empty>{t('No matching command.')}</Command.Empty>
      {list.map((c) => {
        const enabled = !c.enabled || c.enabled();
        return (
          <Command.Item
            key={c.id}
            value={`${c.label} ${c.id}`}
            keywords={[...(SYNONYMS[c.id] ?? []), ...(c.en && c.en !== c.label ? [c.en] : [])]}
            disabled={!enabled}
            onSelect={() => {
              close();
              c.run();
            }}
          >
            {c.icon ? <Icon name={c.icon} /> : <span className="icon-space" />}
            <span className="text">{c.label}</span>
            {c.shortcut && <kbd>{c.shortcut}</kbd>}
          </Command.Item>
        );
      })}
    </>
  );
}

function PartList({ query, at }: { query: string; at?: { x: number; y: number } }) {
  const t = useT();
  const recent = useEditor((s) => s.recent);
  const favorites = useEditor((s) => s.favorites);
  const results = useMemo(() => {
    if (query.trim()) return registry.search(query).slice(0, 60);
    // No query yet: recently used and favourite parts first.
    const seen = new Set<string>();
    return [...recent, ...favorites]
      .map((t) => registry.get(t))
      .filter((d): d is NonNullable<typeof d> => !!d && !seen.has(d.type) && !!seen.add(d.type));
  }, [query, recent, favorites]);
  return (
    <>
      <Command.Empty>{t('No part matches “{query}”.', { query })}</Command.Empty>
      {!query.trim() && results.length > 0 && <div className="cmdk-hint">{t('Recently used and favourites — type to search all {n} parts', { n: registry.all().length })}</div>}
      {results.map((d) => (
        <Command.Item
          key={d.type}
          value={d.type}
          onSelect={() => {
            close();
            if (at) addComponentAt(d.type, at.x, at.y);
            else addComponentAtCenter(d.type);
          }}
        >
          <Icon name="box" />
          <span className="text">{d.name}</span>
          <span className="meta">
            {tr(d.category)}
            {d.subcategory ? ` › ${tr(d.subcategory)}` : ''}
          </span>
          <span className={`dot ${d.simulation.support}`} role="img" aria-label={t(SUPPORT[d.simulation.support])} />
        </Command.Item>
      ))}
    </>
  );
}

export function CommandPalette() {
  const palette = useEditor((s) => s.palette);
  // Mounted per opening so the query starts empty every time.
  return palette ? <Palette key={`${palette.mode}:${palette.at?.x ?? ''}:${palette.at?.y ?? ''}`} palette={palette} /> : null;
}

function Palette({ palette }: { palette: NonNullable<ReturnType<typeof useEditor.getState>['palette']> }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const adding = palette.mode === 'add';
  return (
    <Command.Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      label={adding ? t('Add a part') : t('Command palette')}
      shouldFilter={!adding}
      loop
      overlayClassName="cmdk-overlay"
      contentClassName="cmdk-dialog"
    >
      <div className="cmdk-head">
        <Icon name={adding ? 'plus' : 'command'} />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder={adding ? (palette.at ? t('Add a part here…') : t('Add a part…')) : t('Type a command…')}
          autoFocus
        />
        <span className="cmdk-mode">{adding ? t('Parts') : t('Commands')}</span>
      </div>
      <Command.List>{adding ? <PartList query={query} at={palette.at} /> : <CommandList />}</Command.List>
      <div className="cmdk-foot">
        <span>{rich(t('{keys} choose'), { keys: <><kbd>↑</kbd><kbd>↓</kbd></> })}</span>
        <span>{rich(adding ? t('{key} add') : t('{key} run'), { key: <kbd>Enter</kbd> })}</span>
        <span>{rich(t('{key} close'), { key: <kbd>Esc</kbd> })}</span>
        <span className="grow" />
        <span>{adding ? t('Ctrl+Shift+P: commands') : t('Ctrl+K: add a part')}</span>
      </div>
    </Command.Dialog>
  );
}
