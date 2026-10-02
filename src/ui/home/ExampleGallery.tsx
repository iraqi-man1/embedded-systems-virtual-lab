/** Searchable example projects with live circuit previews (start screen and Examples dialog). */
import { useState } from 'react';
import type { Project } from '../../core/project/schema';
import { registry } from '../../app/registry';
import { EXAMPLES, loadExample } from '../../examples';
import type { ExampleInfo } from '../../examples/catalog';
import { exampleSummary, exampleTitle, tr } from '../../i18n';
import { useT } from '../../i18n/react';
import { Icon } from '../common/Icon';
import { CircuitPreview } from './CircuitPreview';

/** Tags shared by several examples, most common first (the filter chips). */
const EXAMPLE_TAGS = (() => {
  const count = new Map<string, number>();
  for (const ex of EXAMPLES) for (const t of ex.tags) count.set(t, (count.get(t) ?? 0) + 1);
  return [...count].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
})();

const built = new Map<string, Project>();
/** The example's project, built once (previews only). */
export function exampleProject(ex: ExampleInfo): Project {
  let p = built.get(ex.id);
  if (!p) built.set(ex.id, (p = ex.build(registry)));
  return p;
}

const LEVELS = ['beginner', 'intermediate'] as const;

export function ExampleCard({ ex, activeTag }: { ex: ExampleInfo; activeTag?: string | null }) {
  const level = LEVELS.find((l) => ex.tags.includes(l));
  return (
    <button type="button" className="ex-card" onClick={() => void loadExample(ex.id)}>
      <span className="card-canvas">
        <CircuitPreview circuit={exampleProject(ex).circuit} />
        {level && <span className={`level ${level}`}>{tr(level)}</span>}
      </span>
      <span className="card-body">
        <span className="card-title">{exampleTitle(ex)}</span>
        <span className="card-text">{exampleSummary(ex)}</span>
        <span className="tags">
          {ex.tags
            .filter((x) => !(LEVELS as readonly string[]).includes(x))
            .slice(0, 4)
            .map((x) => (
              <span key={x} className={`chip${activeTag === x ? ' active' : ''}`}>
                {tr(x)}
              </span>
            ))}
        </span>
      </span>
    </button>
  );
}

export function ExampleGallery({ autoFocus }: { autoFocus?: boolean }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const shown = EXAMPLES.filter(
    (ex) =>
      (!tag || ex.tags.includes(tag)) &&
      (!q || [ex.title, ex.summary, exampleTitle(ex), exampleSummary(ex), ...ex.tags, ...ex.tags.map((x) => tr(x))].some((s) => s.toLowerCase().includes(q))),
  );
  return (
    <div className="ex-gallery">
      <div className="examples-filter">
        <div className="search-box">
          <Icon name="search" />
          <input
            autoFocus={autoFocus}
            placeholder={t('Search examples (e.g. sensor, I2C, PWM)')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) {
                setQuery('');
                e.stopPropagation();
              }
            }}
            aria-label={t('Search examples')}
          />
        </div>
        <span className="count">{t('{n} of {total}', { n: shown.length, total: EXAMPLES.length })}</span>
      </div>
      <div className="chips examples-tags">
        <button className={`chip${tag === null ? ' active' : ''}`} aria-pressed={tag === null} onClick={() => setTag(null)}>
          {t('All')}
        </button>
        {EXAMPLE_TAGS.map((x) => (
          <button key={x} className={`chip${tag === x ? ' active' : ''}`} aria-pressed={tag === x} onClick={() => setTag(tag === x ? null : x)}>
            {tr(x)}
          </button>
        ))}
      </div>
      <div className="card-grid">
        {shown.map((ex) => (
          <ExampleCard key={ex.id} ex={ex} activeTag={tag} />
        ))}
        {!shown.length && <div className="empty-note">{t('No example matches. Try another word or tag.')}</div>}
      </div>
    </div>
  );
}
