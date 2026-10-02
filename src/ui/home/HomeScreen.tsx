/**
 * Start screen: continue recent work, start from a template, open an example
 * or learn the basics. Shown over the editor (which stays mounted) at launch
 * and from the Home button; opening any project returns to the editor.
 */
import { useEffect, useMemo, useState } from 'react';
import { confirmDiscard, fileTitle, openDocument, openRecent, showProject } from '../../app/fileOps';
import { registry } from '../../app/registry';
import { APP_VERSION } from '../../app/version';
import { parseProject, type Project } from '../../core/project/schema';
import { EXAMPLES, loadExample } from '../../examples';
import { TEMPLATES, type TemplateInfo } from '../../examples/templates';
import { formatRelative, LANGUAGES, t as translate } from '../../i18n';
import { rich, useT } from '../../i18n/react';
import { isTauri, storage } from '../../platform';
import { useEditor, type RecentProject } from '../../state/editor';
import { useProject } from '../../state/project';
import { refreshToolchain, useSim } from '../../state/sim';
import { commands } from '../commands';
import { Icon } from '../common/Icon';
import { DropdownMenu } from '../common/Menu';
import { Tip } from '../common/Tooltip';
import { ThemeItems } from '../shell/MenuBar';
import { fitView } from '../workspace/actions';
import { CircuitPreview } from './CircuitPreview';
import { ExampleGallery } from './ExampleGallery';
import { openGuide } from '../guide/open';

type Tab = 'recent' | 'new' | 'examples' | 'learn';

const leave = () => useEditor.getState().set({ page: null });

/** Brand mark (same drawing as the app icon). */
function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} aria-hidden>
      <rect width="512" height="512" rx="96" fill="#0f2a3d" />
      <rect x="136" y="136" width="240" height="240" rx="24" fill="#1d4f6e" stroke="#5ad1ff" strokeWidth="14" />
      <path d="M190 300l44-88 40 64 22-36 26 60" fill="none" stroke="#ffd166" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The hero's signature: a PWM signal fading up, drawn like an oscilloscope trace. */
function ScopeTrace() {
  const path = useMemo(() => {
    const period = 46;
    let x = 0;
    let d = 'M0 78';
    for (let i = 0; x < 640; i++) {
      const duty = 0.12 + 0.76 * (0.5 - 0.5 * Math.cos((i / 13) * Math.PI));
      const hi = Math.round(period * duty);
      d += ` L${x} 30 L${x + hi} 30 L${x + hi} 78 L${x + period} 78`;
      x += period;
    }
    return d;
  }, []);
  return (
    <svg className="scope-trace" viewBox="0 0 640 108" preserveAspectRatio="none" aria-hidden>
      {Array.from({ length: 11 }, (_, i) => (
        <line key={`v${i}`} x1={i * 64} x2={i * 64} y1="0" y2="108" className="scope-grid" />
      ))}
      {[0, 27, 54, 81, 108].map((y) => (
        <line key={`h${y}`} x1="0" x2="640" y1={y} y2={y} className="scope-grid" />
      ))}
      <path d={path} className="scope-glow" pathLength={1} />
      <path d={path} className="scope-line" pathLength={1} />
    </svg>
  );
}

// ------------------------------------------------------------------ recent
type Loaded = { status: 'ok'; project: Project } | { status: 'missing' };
const loaded = new Map<string, Promise<Loaded>>();

/** Reads a recent project for its preview (cached per file and save time). */
function loadRecent(r: RecentProject): Promise<Loaded> {
  const key = `${r.path}\u0000${r.at}`;
  let p = loaded.get(key);
  if (!p) {
    p = storage
      .readProject(r.path)
      .then((text): Loaded => ({ status: 'ok', project: parseProject(text) }))
      .catch((): Loaded => ({ status: 'missing' }));
    loaded.set(key, p);
  }
  return p;
}

function RecentCard({ r }: { r: RecentProject }) {
  const t = useT();
  const [state, setState] = useState<Loaded | null>(null);
  useEffect(() => {
    let alive = true;
    void loadRecent(r).then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, [r]);
  const folder = r.path.replace(/[\\/][^\\/]*$/, '');
  const missing = state?.status === 'missing';
  return (
    <div className={`proj-card${missing ? ' missing' : ''}`}>
      <button type="button" className="proj-open" onClick={() => void openRecent(r.path)} aria-label={t('Open {name}', { name: r.name })}>
        <span className="card-canvas">
          <CircuitPreview
            circuit={state?.status === 'ok' ? state.project.circuit : null}
            empty={<span className="card-canvas-note">{missing ? t('File not found') : state?.status === 'ok' ? t('Empty circuit') : ''}</span>}
          />
        </span>
        <span className="card-body">
          <span className="card-title" dir="auto">
            {r.name || fileTitle(r.path)}
          </span>
          <span className="card-path ltr" title={r.path}>
            {fileTitle(r.path)}.evlab{folder && folder !== r.path ? ` — ${folder}` : ''}
          </span>
          <span className="card-meta">
            <Icon name="clock" size={12} /> {formatRelative(r.at)}
          </span>
        </span>
      </button>
      <Tip content={t('Remove from the list (the file is kept)')} direct>
        <button type="button" className="icon-btn proj-remove" aria-label={t('Remove from the list (the file is kept)')} onClick={() => useEditor.getState().forgetProject(r.path)}>
          <Icon name="x" />
        </button>
      </Tip>
    </div>
  );
}

function RecentTab({ goto }: { goto: (tab: Tab) => void }) {
  const t = useT();
  const recent = useEditor((s) => s.recentProjects);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = recent.filter((r) => !q || r.name.toLowerCase().includes(q) || r.path.toLowerCase().includes(q));
  if (!recent.length) {
    return (
      <div className="home-empty">
        <Icon name="history" size={30} />
        <h3>{t('No recent projects yet')}</h3>
        <p>{t('Projects you open or save appear here. Start from a template or open a ready-made example.')}</p>
        <div className="btn-row">
          <button className="btn primary" onClick={() => goto('new')}>
            <Icon name="plus" /> {t('Start a new project')}
          </button>
          <button className="btn" onClick={() => goto('examples')}>
            <Icon name="book" /> {t('Browse examples')}
          </button>
        </div>
      </div>
    );
  }
  return (
    <>
      {recent.length > 4 && (
        <div className="examples-filter">
          <div className="search-box">
            <Icon name="search" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search recent projects')} aria-label={t('Search recent projects')} />
          </div>
        </div>
      )}
      <div className="card-grid">
        {shown.map((r) => (
          <RecentCard key={r.path} r={r} />
        ))}
        {!shown.length && <div className="empty-note">{t('No recent project matches “{query}”.', { query })}</div>}
      </div>
    </>
  );
}

// --------------------------------------------------------------- templates
const templateProjects = new Map<string, Project>();
function templatePreview(tpl: TemplateInfo) {
  let p = templateProjects.get(tpl.id);
  if (!p) templateProjects.set(tpl.id, (p = tpl.build(registry, '')));
  return p.circuit;
}

async function createFromTemplate(tpl: TemplateInfo, name: string) {
  if (!(await confirmDiscard())) return;
  showProject(tpl.build(registry, name.trim() || translate('Untitled')), null);
  setTimeout(() => fitView({ instant: true }), 0);
}

function NewTab() {
  const t = useT();
  const [name, setName] = useState('');
  return (
    <>
      <div className="new-name">
        <label htmlFor="new-project-name">{t('Project name')}</label>
        <input
          id="new-project-name"
          className="input"
          dir="auto"
          value={name}
          placeholder={t('Untitled')}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void createFromTemplate(TEMPLATES[0], name)}
        />
        <span className="hint">{t('Choose what to start with:')}</span>
      </div>
      <div className="card-grid">
        {TEMPLATES.map((tpl) => (
          <button key={tpl.id} type="button" className="tpl-card" onClick={() => void createFromTemplate(tpl, name)}>
            <span className="card-canvas">
              <CircuitPreview circuit={templatePreview(tpl)} empty={<Icon name={tpl.icon} size={34} />} />
            </span>
            <span className="card-body">
              <span className="card-title">{t(tpl.title)}</span>
              <span className="card-text">{t(tpl.description)}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

// ------------------------------------------------------------------- learn
function LearnTab() {
  const t = useT();
  const steps: { icon: string; title: string; text: string }[] = [
    { icon: 'box', title: t('Place parts'), text: t('Drag parts from the library onto the canvas, or double-click the canvas and type a name.') },
    { icon: 'cable', title: t('Wire them'), text: t('Click a pin, then another pin. Legs dropped into breadboard holes connect by themselves.') },
    { icon: 'code', title: t('Write the code'), text: t('Program the board in the code editor: Arduino C++ for the Uno and Nano.') },
    { icon: 'play', title: t('Run and interact'), text: t('Press F5. Click buttons, turn knobs and watch the serial monitor and instruments.') },
  ];
  const keys: [string, string][] = [
    [t('Move around the canvas'), t('Drag with the right mouse button')],
    [t('Zoom'), t('Mouse wheel')],
    [t('Add a part'), t('Double-click the canvas, or Ctrl+K')],
    [t('Start a wire'), t('Click a pin')],
    [t('Rotate / delete the selection'), 'R / Del'],
    [t('Run / stop the simulation'), 'F5 / Shift+F5'],
    [t('Learn about a part'), t('Rest the mouse on it, or press F1')],
    [t('Find any command'), 'Ctrl+Shift+P'],
  ];
  return (
    <div className="learn">
      <ol className="learn-steps">
        {steps.map((s) => (
          <li key={s.title}>
            <span className="step-icon">
              <Icon name={s.icon} size={18} />
            </span>
            <span className="step-title">{s.title}</span>
            <span className="step-text">{s.text}</span>
          </li>
        ))}
      </ol>
      <div className="learn-cols">
        <section>
          <h3>{t('Mouse and keyboard essentials')}</h3>
          <table className="kbd-table">
            <tbody>
              {keys.map(([a, b]) => (
                <tr key={a}>
                  <td>{a}</td>
                  <td style={{ textAlign: 'end' }}>
                    <kbd>{b}</kbd>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="learn-actions">
          <h3>{t('Try it')}</h3>
          <button className="btn primary" onClick={() => void loadExample('blink')}>
            <Icon name="sparkles" /> {t('Open the Blink example')}
          </button>
          <button className="btn" onClick={() => openGuide()}>
            <Icon name="book" /> {t('Parts guide: what each part does and how to wire it')}
          </button>
          <button className="btn" onClick={commands.shortcuts.run}>
            <Icon name="keyboard" /> {t('All keyboard shortcuts')}
          </button>
          <p className="hint">{rich(t('Every button explains itself when you hover it. Press {key} for the list of commands.'), { key: <kbd>Ctrl+Shift+P</kbd> })}</p>
        </section>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------- side
function ToolchainCard() {
  const t = useT();
  const status = useSim((s) => s.toolchain);
  useEffect(() => {
    void refreshToolchain();
  }, []);
  const ready = !!status?.installed;
  return (
    <div className={`side-card tc ${ready ? 'ok' : status ? 'warn' : ''}`}>
      <div className="side-card-head">
        <Icon name={ready ? 'ok' : 'wrench'} size={15} />
        <span>{t('Arduino compiler')}</span>
      </div>
      <p>{ready ? t('Ready. Code compiles offline with PlatformIO {version}.', { version: status?.pioVersion ?? '' }) : status ? t('Not installed yet. Install it once (needs internet) to compile Arduino code.') : t('Checking…')}</p>
      {!ready && status && isTauri && (
        <button className="btn" onClick={() => useEditor.getState().set({ dialog: 'toolchain' })}>
          <Icon name="package" /> {t('Install…')}
        </button>
      )}
    </div>
  );
}

function ContinueCard() {
  const t = useT();
  const project = useProject((s) => s.project);
  const dirty = useProject((s) => s.dirty);
  const path = useProject((s) => s.filePath);
  if (!project.circuit.components.length && !dirty && !path) return null;
  return (
    <button type="button" className="side-card continue" onClick={leave}>
      <span className="card-canvas small">
        <CircuitPreview circuit={project.circuit} padding={8} />
      </span>
      <span className="continue-text">
        <span className="side-label">{t('Continue')}</span>
        <span className="card-title" dir="auto">
          {project.meta.name}
          {dirty ? ' •' : ''}
        </span>
      </span>
      <Icon name="chevron-right" />
    </button>
  );
}

export function HomeScreen() {
  const t = useT();
  const recentCount = useEditor((s) => s.recentProjects.length);
  const language = useEditor((s) => s.language);
  const showAtStart = useEditor((s) => s.showStartScreen);
  const [tab, setTab] = useState<Tab>(recentCount ? 'recent' : 'new');
  const parts = registry.all();
  const tabs: { id: Tab; label: string; icon: string; count?: number }[] = [
    { id: 'recent', label: t('Recent'), icon: 'history', count: recentCount || undefined },
    { id: 'new', label: t('New project'), icon: 'plus' },
    { id: 'examples', label: t('Examples'), icon: 'book', count: EXAMPLES.length },
    { id: 'learn', label: t('Learn'), icon: 'bulb' },
  ];
  return (
    <div className="home" role="region" aria-label={t('Start screen')}>
      <header className="home-top">
        <div className="home-brand">
          <Logo size={22} />
          <span>{t('Virtual Lab')}</span>
          <span className="version ltr">v{APP_VERSION}</span>
        </div>
        <div className="home-top-actions">
          <div className="segmented small" role="radiogroup" aria-label={t('Language')}>
            {LANGUAGES.map((l) => (
              <button key={l.id} type="button" role="radio" aria-checked={language === l.id} className={language === l.id ? 'on' : ''} onClick={() => useEditor.getState().setPrefs({ language: l.id })}>
                {l.native}
              </button>
            ))}
          </div>
          <DropdownMenu
            align="end"
            trigger={
              <button className="tb-btn" aria-label={t('Theme')}>
                <Icon name="palette" />
                <span className="label">{t('Theme')}</span>
              </button>
            }
          >
            <ThemeItems />
          </DropdownMenu>
          <Tip content={commands.settings.label} shortcut={commands.settings.shortcut}>
            <button className="tb-btn" aria-label={commands.settings.label} onClick={commands.settings.run}>
              <Icon name="settings" />
            </button>
          </Tip>
          <Tip content={commands.shortcuts.label} shortcut="?">
            <button className="tb-btn" aria-label={commands.shortcuts.label} onClick={commands.shortcuts.run}>
              <Icon name="keyboard" />
            </button>
          </Tip>
          <button className="btn" onClick={leave}>
            {t('Go to the editor')} <Icon name="chevron-right" />
          </button>
        </div>
      </header>
      <div className="home-scroll">
        <section className="home-hero">
          <div className="hero-text">
            <h1>{t('Embedded Systems Virtual Lab')}</h1>
            <p>{t('Design circuits, write the firmware and watch it run — all on your computer, offline.')}</p>
            <p className="hero-facts ltr-nums">
              {t('{parts} parts · {simulated} simulated · {examples} example projects', {
                parts: parts.length,
                simulated: parts.filter((d) => d.simulation.support !== 'visual-only').length,
                examples: EXAMPLES.length,
              })}
            </p>
          </div>
          <ScopeTrace />
        </section>
        <div className="home-body">
          <aside className="home-side">
            <button className="btn primary big" onClick={() => setTab('new')}>
              <Icon name="plus" /> {t('New project')}
            </button>
            <Tip content={commands.open.description} shortcut="Ctrl+O" side="right">
              <button className="btn big" onClick={() => void openDocument()}>
                <Icon name="open" /> {t('Open project…')}
              </button>
            </Tip>
            <ContinueCard />
            <ToolchainCard />
            <label className="side-check">
              <input type="checkbox" checked={showAtStart} onChange={(e) => useEditor.getState().setPrefs({ showStartScreen: e.target.checked })} />
              {t('Show this screen when the app starts')}
            </label>
          </aside>
          <main className="home-main">
            <div className="home-tabs" role="tablist" aria-label={t('Start screen')}>
              {tabs.map((x) => (
                <button key={x.id} role="tab" aria-selected={tab === x.id} className={`home-tab${tab === x.id ? ' on' : ''}`} onClick={() => setTab(x.id)}>
                  <Icon name={x.icon} size={15} />
                  {x.label}
                  {x.count !== undefined && <span className="count">{x.count}</span>}
                </button>
              ))}
            </div>
            <div className="home-panel" role="tabpanel">
              {tab === 'recent' && <RecentTab goto={setTab} />}
              {tab === 'new' && <NewTab />}
              {tab === 'examples' && <ExampleGallery />}
              {tab === 'learn' && <LearnTab />}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
