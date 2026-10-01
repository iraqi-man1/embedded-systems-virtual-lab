import { useErc } from '../../state/derived';
import { useEditor, type DockTab } from '../../state/editor';
import { useProject } from '../../state/project';
import { useSim } from '../../state/sim';
import { zoomToComponents } from '../workspace/actions';
import { Icon } from '../common/Icon';
import { LogicAnalyzer } from './LogicAnalyzer';
import { McuPanel } from './McuPanel';
import { Multimeter } from './Multimeter';
import { Oscilloscope } from './Oscilloscope';
import { SerialMonitor } from './SerialMonitor';
import { SerialPlotter } from './SerialPlotter';

function useProblems() {
  const erc = useErc();
  const sim = useSim((s) => s.diagnostics);
  const compile = useSim((s) => s.compile.diagnostics);
  return { erc, sim, compile };
}

/** Selects the parts a problem refers to and brings them into view. */
function revealComponents(ids?: string[]) {
  if (!ids?.length) return;
  const existing = new Set(useProject.getState().project.circuit.components.map((c) => c.id));
  const sel = ids.filter((id) => existing.has(id));
  if (!sel.length) return;
  useEditor.getState().select(sel);
  zoomToComponents(sel, 1.4);
}

function ProblemsPanel() {
  const { erc, sim, compile } = useProblems();
  const items = [
    ...compile.map((d) => ({
      severity: d.severity,
      message: d.message,
      where: `${d.file}:${d.line}:${d.column}`,
      source: 'compiler',
      onClick: () => useEditor.getState().set({ revealLine: { file: d.file, line: d.line, nonce: Math.random() }, showCode: true }),
    })),
    ...sim.map((d) => ({ severity: d.severity, message: d.message, where: '', source: 'simulation', onClick: () => revealComponents(d.componentIds) })),
    ...erc.map((d) => ({ severity: d.severity, message: d.message, where: '', source: 'circuit check', onClick: () => revealComponents(d.componentIds) })),
  ];
  const rank = { error: 0, warning: 1, info: 2, note: 2 } as Record<string, number>;
  items.sort((a, b) => rank[a.severity] - rank[b.severity]);
  if (!items.length) {
    return (
      <div className="empty-state">
        <div>
          <Icon name="ok" size={22} />
          <br />
          No problems detected. Circuit checks run continuously; simulation checks (over-current, floating inputs…) appear while running.
        </div>
      </div>
    );
  }
  return (
    <div className="problems">
      {items.map((p, i) => (
        <div key={i} className="problem" onClick={p.onClick}>
          <span className={`sev-${p.severity}`}>
            <Icon name={p.severity === 'error' ? 'error' : p.severity === 'warning' ? 'warning' : 'info'} />
          </span>
          <span className="msg">
            {p.message}
            {p.where && <span style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginLeft: 8 }}>{p.where}</span>}
          </span>
          <span className="src">{p.source}</span>
        </div>
      ))}
    </div>
  );
}

function BuildOutput() {
  const compile = useSim((s) => s.compile);
  return (
    <div className="dock-body">
      <div className="inst-bar">
        <span style={{ color: compile.status === 'error' ? 'var(--err)' : compile.status === 'success' ? 'var(--ok)' : 'var(--text-2)' }}>
          {compile.status === 'idle' && 'No build yet. Press Compile (Ctrl+B) or Run (F5).'}
          {compile.status === 'compiling' && 'Compiling with PlatformIO…'}
          {compile.status === 'success' &&
            `Build succeeded in ${((compile.durationMs ?? 0) / 1000).toFixed(1)} s — flash ${compile.flashBytes ?? '?'} bytes, RAM ${compile.ramBytes ?? '?'} bytes`}
          {compile.status === 'error' && 'Build failed.'}
        </span>
        <span className="grow" />
        <button className="tb-btn" onClick={() => navigator.clipboard?.writeText(compile.log)}>
          <Icon name="copy" />
          <span className="label">Copy log</span>
        </button>
      </div>
      <pre className="build-log">{compile.log || ' '}</pre>
    </div>
  );
}

const TABS: { id: DockTab; label: string; icon: string }[] = [
  { id: 'serial', label: 'Serial Monitor', icon: 'terminal' },
  { id: 'plotter', label: 'Serial Plotter', icon: 'chart' },
  { id: 'scope', label: 'Oscilloscope', icon: 'waves' },
  { id: 'logic', label: 'Logic Analyzer', icon: 'activity' },
  { id: 'meter', label: 'Multimeter', icon: 'gauge' },
  { id: 'mcu', label: 'MCU', icon: 'cpu' },
  { id: 'problems', label: 'Problems', icon: 'warning' },
  { id: 'output', label: 'Build Output', icon: 'build' },
];

export function BottomDock() {
  const tab = useEditor((s) => s.dockTab);
  const { erc, sim, compile } = useProblems();
  const all = [...erc, ...sim, ...compile];
  const errors = all.filter((d) => d.severity === 'error').length;
  const warnings = all.filter((d) => d.severity === 'warning').length;
  return (
    <div className="panel" style={{ height: '100%' }}>
      <div className="dock-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`dock-tab${tab === t.id ? ' active' : ''}`} onClick={() => useEditor.getState().set({ dockTab: t.id })}>
            <Icon name={t.icon} />
            {t.label}
            {t.id === 'problems' && errors > 0 && <span className="count err">{errors}</span>}
            {t.id === 'problems' && !errors && warnings > 0 && <span className="count warn">{warnings}</span>}
          </button>
        ))}
        <span className="spacer" />
        <button className="icon-btn" style={{ alignSelf: 'center', marginRight: 6 }} title="Hide panel" onClick={() => useEditor.getState().setPrefs({ showDock: false })}>
          <Icon name="panel-bottom" />
        </button>
      </div>
      {tab === 'serial' && <SerialMonitor />}
      {tab === 'plotter' && <SerialPlotter />}
      {tab === 'scope' && <Oscilloscope />}
      {tab === 'logic' && <LogicAnalyzer />}
      {tab === 'meter' && <Multimeter />}
      {tab === 'mcu' && <McuPanel />}
      {tab === 'problems' && <ProblemsPanel />}
      {tab === 'output' && <BuildOutput />}
    </div>
  );
}

export function useProblemCounts() {
  const { erc, sim, compile } = useProblems();
  const all = [...erc, ...sim, ...compile];
  return { errors: all.filter((d) => d.severity === 'error').length, warnings: all.filter((d) => d.severity === 'warning').length };
}
