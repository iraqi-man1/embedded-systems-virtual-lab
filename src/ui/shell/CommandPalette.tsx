/**
 * Command palette (Ctrl+Shift+P), quick-add (Ctrl+K, or double-click on
 * empty canvas) and Find (Ctrl+F): fuzzy search over every application
 * command, every library part, or everything in the circuit, keyboard first.
 */
import { useMemo, useState } from 'react';
import { Command } from 'cmdk';
import { registry } from '../../app/registry';
import { tr, type MessageKey } from '../../i18n';
import { rich, useT } from '../../i18n/react';
import { useEditor } from '../../state/editor';
import { commands } from '../commands';
import { Icon } from '../common/Icon';
import { addComponentAt, addComponentAtCenter, revealRect } from '../workspace/actions';
import { lookup } from '../../app/registry';
import { annotationBounds } from '../../core/circuit/annotations';
import { componentBounds } from '../../core/circuit/geometry';
import { useNetlist } from '../../state/derived';
import { useProject } from '../../state/project';
import { partName } from '../guide/guideModel';
import { searchParts } from '../library/LibraryPanel';
import { selectionBounds, wirePolyline } from '../workspace/geometry';

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
    if (query.trim()) return searchParts(query).slice(0, 60);
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
          <span className="text">{partName(d)}</span>
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

type Rect = { x: number; y: number; width: number; height: number };

function union(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  const x1 = Math.min(...rects.map((r) => r.x));
  const y1 = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.width));
  const y2 = Math.max(...rects.map((r) => r.y + r.height));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** Selects what was found and brings it into view. */
function reveal(components: string[], wires: string[], notes: string[], bounds: Rect | null) {
  close();
  useEditor.getState().select(components, wires, notes);
  if (bounds) revealRect(bounds);
}

/** Find ranks exact names first (R3 before "Arduino Uno R3"), then prefixes, then any mention. */
function findScore(_value: string, search: string, keywords?: string[]): number {
  const q = search.trim().toLowerCase();
  if (!q) return 1;
  const [name = '', ...rest] = (keywords ?? []).map((k) => k.toLowerCase());
  if (name === q) return 1;
  if (name.startsWith(q)) return 0.9;
  if (name.includes(q)) return 0.7;
  const hay = `${name} ${rest.join(' ')}`;
  if (hay.includes(q)) return 0.5;
  return q.split(/\s+/).every((w) => hay.includes(w)) ? 0.3 : 0;
}

/** Everything in the circuit that has a name: parts, nets, wire labels and notes. */
function FindList() {
  const t = useT();
  const circuit = useProject((s) => s.project.circuit);
  const netlist = useNetlist();
  const items = useMemo(() => {
    const out: { key: string; icon: string; text: string; meta: string; words: string[]; pick: () => void }[] = [];
    for (const c of circuit.components) {
      const def = lookup(c.type);
      if (!def || (def.pins.length && def.pins.every((p) => p.kind === 'socket') && !c.label)) continue;
      out.push({
        key: `part:${c.id}`,
        icon: 'box',
        text: c.label,
        meta: partName(def),
        words: [def.name, partName(def), def.type],
        pick: () => reveal([c.id], [], [], componentBounds(c, def)),
      });
    }
    const wireRect = (ids: string[]) =>
      union(
        circuit.wires
          .filter((w) => ids.includes(w.id))
          .flatMap((w) => wirePolyline(circuit, w) ?? [])
          .map((p) => ({ x: p.x, y: p.y, width: 0, height: 0 })),
      );
    for (const net of netlist.nets) {
      if (net.activePinCount < 2) continue;
      const wires = circuit.wires.filter((w) => netlist.netOf(w.from) === net.id).map((w) => w.id);
      const parts = [...new Set(net.pins.map((p) => p.componentId))].filter((id) => lookup(circuit.components.find((c) => c.id === id)?.type ?? '')?.pins.some((p) => p.kind !== 'socket'));
      const pins = net.pins
        .map((p) => {
          const inst = circuit.components.find((c) => c.id === p.componentId);
          const pin = inst && lookup(inst.type)?.pins.find((x) => x.id === p.pinId);
          return inst && pin && pin.kind !== 'socket' ? `${inst.label}.${pin.label ?? pin.id}` : '';
        })
        .filter(Boolean);
      out.push({
        key: `net:${net.id}`,
        icon: 'cable',
        text: net.name,
        meta: t('net · {n} pins', { n: pins.length }),
        words: pins,
        pick: () => reveal(wires.length ? [] : parts, wires, [], wires.length ? wireRect(wires) : selectionBounds(circuit, parts)),
      });
    }
    for (const w of circuit.wires) {
      if (!w.label) continue;
      out.push({ key: `wire:${w.id}`, icon: 'tag', text: w.label, meta: t('wire label'), words: [], pick: () => reveal([], [w.id], [], wireRect([w.id])) });
    }
    for (const a of circuit.annotations ?? []) {
      const text = a.kind === 'text' ? a.text : a.kind === 'rect' ? a.title : '';
      if (!text) continue;
      out.push({
        key: `note:${a.id}`,
        icon: a.kind === 'text' ? 'type' : 'frame',
        text: text.split('\n')[0],
        meta: a.kind === 'text' ? t('Text note') : t('Frame'),
        words: [text],
        pick: () => reveal([], [], [a.id], annotationBounds(a)),
      });
    }
    return out;
  }, [circuit, netlist, t]);
  return (
    <>
      <Command.Empty>{circuit.components.length ? t('Nothing in the circuit matches.') : t('The circuit is empty.')}</Command.Empty>
      {items.map((it) => (
        <Command.Item key={it.key} value={`${it.key} ${it.text}`} keywords={[it.text, it.meta, ...it.words]} onSelect={it.pick}>
          <Icon name={it.icon} />
          <span className="text" dir="auto">
            {it.text}
          </span>
          <span className="meta">{it.meta}</span>
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
  const finding = palette.mode === 'find';
  return (
    <Command.Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      label={adding ? t('Add a part') : finding ? t('Find on the canvas') : t('Command palette')}
      shouldFilter={!adding}
      filter={finding ? findScore : undefined}
      loop
      overlayClassName="cmdk-overlay"
      contentClassName="cmdk-dialog"
    >
      <div className="cmdk-head">
        <Icon name={adding ? 'plus' : finding ? 'search' : 'command'} />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder={adding ? (palette.at ? t('Add a part here…') : t('Add a part…')) : finding ? t('Find a part, net, label or note (e.g. R1, GND, LED)…') : t('Type a command…')}
          autoFocus
        />
        <span className="cmdk-mode">{adding ? t('Parts') : finding ? t('Find') : t('Commands')}</span>
      </div>
      <Command.List>{adding ? <PartList query={query} at={palette.at} /> : finding ? <FindList /> : <CommandList />}</Command.List>
      <div className="cmdk-foot">
        <span>{rich(t('{keys} choose'), { keys: <><kbd>↑</kbd><kbd>↓</kbd></> })}</span>
        <span>{rich(adding ? t('{key} add') : finding ? t('{key} show') : t('{key} run'), { key: <kbd>Enter</kbd> })}</span>
        <span>{rich(t('{key} close'), { key: <kbd>Esc</kbd> })}</span>
        <span className="grow" />
        <span>{finding ? t('Ctrl+Shift+P: commands') : adding ? t('Ctrl+Shift+P: commands') : t('Ctrl+K: add a part')}</span>
      </div>
    </Command.Dialog>
  );
}
