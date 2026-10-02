import { useEffect, useState } from 'react';
import type { CircuitDocument, ComponentInstance, PropValue, Wire } from '../../core/model/circuit';
import { WIRE_COLORS } from '../../core/model/circuit';
import type { ComponentDefinition, PropertyDefinition } from '../../core/model/component';
import { formatEngineering, parseEngineering } from '../../core/model/units';
import { lookup, registry } from '../../app/registry';
import { tr, type MessageKey } from '../../i18n';
import { rich, useT } from '../../i18n/react';
import { useNetlist, useErc } from '../../state/derived';
import { useEditor } from '../../state/editor';
import { coalescedEdit, useProject } from '../../state/project';
import { sendInput, useSim } from '../../state/sim';
import { Icon } from '../common/Icon';
import { Tip } from '../common/Tooltip';
import { clearWirePoints, deleteSelection, flipSelection, rotateSelection, setNetWireColor, setWireColor, autoRouteWires, toggleLockSelection } from '../workspace/actions';
import { pinLabel } from '../instruments/probes';
import { openGuide } from '../guide/open';
import { NoteInspector } from './NoteInspector';

const SUPPORT_LABEL: Record<ComponentDefinition['simulation']['support'], MessageKey> = { full: 'Simulated', partial: 'Partially simulated', 'visual-only': 'Visual only' };

function PropertyField({ inst, def, p }: { inst: ComponentInstance; def: ComponentDefinition; p: PropertyDefinition }) {
  useT();
  const value = inst.props[p.key] ?? p.default;
  const simulating = useSim((s) => s.state !== 'stopped');
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = (v: PropValue, continuous = false) => {
    const apply = (c: CircuitDocument) => {
      const i = c.components.find((x) => x.id === inst.id);
      if (i) i.props[p.key] = v;
    };
    // Slider steps (drag or arrow keys) coalesce into one undo step.
    if (continuous) coalescedEdit(apply);
    else useProject.getState().edit(apply);
    // Interactive props also drive the model input directly for instant feedback.
    if (simulating && def.interaction?.property === p.key) sendInput(inst.id, def.interaction.input ?? 'value', v);
  };
  let control: React.ReactNode;
  if (p.type === 'enum') {
    control = (
      <select className="input" value={String(value)} onChange={(e) => commit(e.target.value)}>
        {p.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {tr(o.label)}
          </option>
        ))}
      </select>
    );
  } else if (p.type === 'boolean') {
    control = <input type="checkbox" checked={!!value} onChange={(e) => commit(e.target.checked)} />;
  } else if (p.type === 'number' && p.min !== undefined && p.max !== undefined && p.live) {
    control = (
      <div className="input-row" style={{ gap: 6 }}>
        <input
          type="range"
          min={p.min}
          max={p.max}
          step={p.step ?? (p.max - p.min) / 100}
          value={Number(value)}
          onPointerDown={() => useProject.getState().begin()}
          onPointerUp={() => useProject.getState().end()}
          onChange={(e) => commit(Number(e.target.value), true)}
        />
        <span className="ltr" style={{ fontFamily: 'var(--font-mono)', minWidth: 44, textAlign: 'end' }}>
          {Number(value).toFixed(p.step && p.step < 0.1 ? 2 : 1)}
          {p.unit ? ` ${p.unit}` : ''}
        </span>
      </div>
    );
  } else {
    const invalid = p.engineering ? !Number.isFinite(parseEngineering(text)) : p.type === 'number' ? !Number.isFinite(Number(text)) : false;
    const finish = () => {
      if (invalid) {
        setText(String(value));
        return;
      }
      commit(p.type === 'number' ? Number(text) : text);
    };
    control = (
      <div className="input-row">
        <input
          className={`input${invalid ? ' invalid' : ''}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={finish}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setText(String(value));
          }}
        />
        {p.unit && <span className="unit">{p.engineering && !invalid ? '' : p.unit}</span>}
      </div>
    );
    if (p.engineering && !invalid) {
      control = (
        <div>
          {control}
          <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2 }}>= {formatEngineering(parseEngineering(text), p.unit ?? '')}</div>
        </div>
      );
    }
  }
  return (
    <div className="field">
      {p.description ? (
        <Tip content={p.description} side="left" direct>
          <label className="has-tip">{tr(p.label)}</label>
        </Tip>
      ) : (
        <label>{tr(p.label)}</label>
      )}
      {control}
    </div>
  );
}

function ComponentInspector({ inst, def }: { inst: ComponentInstance; def: ComponentDefinition }) {
  const t = useT();
  const netlist = useNetlist();
  const voltages = useSim((s) => s.voltages);
  const driven = useSim((s) => s.driven);
  const mcus = useSim((s) => s.mcus);
  const simulating = useSim((s) => s.state !== 'stopped');
  const erc = useErc().filter((d) => d.componentIds?.includes(inst.id));
  const simDiags = useSim((s) => s.diagnostics).filter((d) => d.componentIds?.includes(inst.id));
  const [label, setLabel] = useState(inst.label);
  useEffect(() => setLabel(inst.label), [inst.label]);
  const mcu = mcus.find((m) => m.componentId === inst.id);
  const pins = def.pins.filter((p) => p.kind !== 'socket');
  const pkg = registry.listPackages().find((p) => p.id === def.packageId);

  return (
    <>
      <div className="insp-head">
        <div className="insp-title">
          <h3>{def.name}</h3>
          <Tip content={t('Open in Parts Guide')} shortcut="F1" direct>
            <button className="icon-btn" aria-label={t('Open in Parts Guide')} onClick={() => openGuide(def.type)}>
              <Icon name="help" />
            </button>
          </Tip>
        </div>
        <div className="sub">
          <span className={`badge ${def.simulation.support}`}>{t(SUPPORT_LABEL[def.simulation.support])}</span>
          <span>
            {tr(def.category)}
            {def.subcategory ? ` › ${tr(def.subcategory)}` : ''}
          </span>
        </div>
      </div>
      <div className="insp-sec">
        <div className="field">
          <label>{t('Reference')}</label>
          <input
            className="input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => label.trim() && useProject.getState().edit((c) => void (c.components.find((x) => x.id === inst.id)!.label = label.trim()))}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </div>
        {def.properties.map((p) => (
          <PropertyField key={p.key} inst={inst} def={def} p={p} />
        ))}
        <div className="btn-row" style={{ marginTop: 8 }}>
          <Tip content={t('Rotate 90° clockwise')} shortcut="R" direct>
            <button className="btn" onClick={() => rotateSelection(90)} disabled={inst.locked}>
              <Icon name="rotate" /> {t('Rotate')}
            </button>
          </Tip>
          <Tip content={t('Flip horizontally')} shortcut="H" direct>
            <button className="btn" onClick={flipSelection} disabled={inst.locked}>
              <Icon name="flip" /> {t('Flip')}
            </button>
          </Tip>
          <Tip content={inst.locked ? t('Locked: it stays in place (Ctrl+L unlocks)') : t('Lock in place (Ctrl+L)')} direct>
            <button className={`btn${inst.locked ? ' active' : ''}`} onClick={toggleLockSelection} aria-pressed={!!inst.locked} aria-label={inst.locked ? t('Unlock') : t('Lock in place')}>
              <Icon name={inst.locked ? 'lock' : 'unlock'} />
            </button>
          </Tip>
          <Tip content={t('Delete')} shortcut="Del" direct>
            <button className="btn danger" onClick={deleteSelection} aria-label={t('Delete')} disabled={inst.locked}>
              <Icon name="trash" />
            </button>
          </Tip>
        </div>
      </div>
      {(erc.length > 0 || simDiags.length > 0) && (
        <div className="insp-sec">
          <div className="h">{t('Problems')}</div>
          {[...erc, ...simDiags].map((d, i) => (
            <div key={i} className={`note${d.severity !== 'info' ? ' warn' : ''}`} style={{ marginBottom: 4 }}>
              <span className={`sev-${d.severity}`}>●</span> {d.message}
            </div>
          ))}
        </div>
      )}
      {def.simulation.support !== 'full' && (
        <div className="insp-sec">
          <div className="h">{t('Simulation')}</div>
          <div className={`note${def.simulation.support === 'visual-only' ? ' warn' : ''}`}>{def.simulation.notes ?? t('Partial model.')}</div>
        </div>
      )}
      {pins.length > 0 && (
        <div className="insp-sec">
          <div className="h">
            {t('Pins')} <span className="r">{simulating ? t('live') : `${pins.length}`}</span>
          </div>
          <table className="pin-table">
            <tbody>
              {pins.slice(0, 80).map((p) => {
                const net = netlist.netOf({ componentId: inst.id, pinId: p.id });
                const n = net !== undefined ? netlist.nets[net] : undefined;
                const v = net !== undefined && driven[net] ? voltages[net] : undefined;
                const connected = n && n.activePinCount > 1;
                return (
                  <tr key={p.id}>
                    {p.description ? (
                      <Tip content={p.description} side="left" direct>
                        <td className="mono has-tip">{p.label ?? p.id}</td>
                      </Tip>
                    ) : (
                      <td className="mono">{p.label ?? p.id}</td>
                    )}
                    <td style={{ color: connected ? 'var(--text-2)' : 'var(--text-3)' }}>{connected ? n!.name : '—'}</td>
                    <td className="mono" style={{ color: 'var(--text-3)' }}>{mcu?.pins[p.id] ?? ''}</td>
                    <td className="v">{simulating ? (v !== undefined ? formatEngineering(v, 'V', 3) : connected ? t('float') : '') : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="insp-sec">
        <div className="h">{t('Documentation')}</div>
        <p className="doc-text">{def.docs.summary}</p>
        {def.docs.notes && <p className="doc-text">{def.docs.notes}</p>}
        {def.simulation.support === 'full' && def.simulation.notes && (
          <p className="doc-text" style={{ fontSize: 11 }}>
            {t('Model:')} {def.simulation.notes}
          </p>
        )}
        {def.docs.datasheetUrl && (
          <p className="doc-text" style={{ fontSize: 11 }}>
            {t('Datasheet:')}{' '}
            <span className="ltr" style={{ fontFamily: 'var(--font-mono)', userSelect: 'text' }}>
              {def.docs.datasheetUrl}
            </span>
          </p>
        )}
        <p className="doc-text" style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
          {def.type}
          {pkg ? ` · ${pkg.name}` : ''}
        </p>
      </div>
    </>
  );
}

function WireInspector({ wire }: { wire: Wire }) {
  const t = useT();
  const circuit = useProject((s) => s.project.circuit);
  const [label, setLabel] = useState(wire.label ?? '');
  useEffect(() => setLabel(wire.label ?? ''), [wire.label]);
  return (
    <>
      <div className="insp-head">
        <h3>{t('Wire')}</h3>
        <div className="sub ltr">
          {pinLabel(circuit, wire.from)} → {pinLabel(circuit, wire.to)}
        </div>
      </div>
      <div className="insp-sec">
        <div className="h">{t('Colour')}</div>
        <WireSwatches active={wire.color} onPick={(c) => setWireColor([wire.id], c)} />
        <button className="btn" style={{ marginTop: 8 }} onClick={() => setNetWireColor(wire.id, wire.color)}>
          <Icon name="palette" /> {t('Apply to whole net')}
        </button>
        <div className="field" style={{ marginTop: 10 }}>
          <label>{t('Label')}</label>
          <input
            className="input"
            value={label}
            placeholder={t('e.g. SDA')}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => useProject.getState().edit((c) => void (c.wires.find((w) => w.id === wire.id)!.label = label || undefined))}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </div>
        <div className="btn-row" style={{ marginTop: 8 }}>
          <Tip content={t('Route the wire around parts')} direct>
            <button className="btn" onClick={() => autoRouteWires([wire.id])}>
              <Icon name="route" /> {t('Auto-route')}
            </button>
          </Tip>
          <button className="btn" onClick={() => clearWirePoints([wire.id])} disabled={!wire.points.length}>
            {t('Straighten')}
          </button>
          <button className="btn danger" onClick={deleteSelection} aria-label={t('Delete')}>
            <Icon name="trash" />
          </button>
        </div>
        <p className="doc-text" style={{ fontSize: 11, marginTop: 8 }}>
          {rich(t('Drag the wire to add a bend; drag the square handles to move bends. Double-click adds a bend. Keys {keys} pick a colour, {c} cycles.'), {
            keys: <kbd>1–9</kbd>,
            c: <kbd>C</kbd>,
          })}
        </p>
      </div>
    </>
  );
}

/** Bulk wire editing for multi-selections. */
function MultiWireSection({ ids }: { ids: string[] }) {
  const t = useT();
  const wires = useProject((s) => s.project.circuit.wires);
  const colors = new Set(wires.filter((w) => ids.includes(w.id)).map((w) => w.color));
  const current = colors.size === 1 ? [...colors][0] : undefined;
  return (
    <div className="insp-sec">
      <div className="h">
        {t('Wire colour')} <span className="r">{t('Wires: {n}', { n: ids.length })}</span>
      </div>
      <WireSwatches active={current} onPick={(c) => setWireColor(ids, c)} />
      <div className="btn-row" style={{ marginTop: 8 }}>
        <button className="btn" onClick={() => autoRouteWires(ids)}>
          <Icon name="route" /> {t('Auto-route')}
        </button>
        <button className="btn" onClick={() => clearWirePoints(ids)}>
          {t('Straighten')}
        </button>
      </div>
    </div>
  );
}

function WireSwatches({ active, onPick }: { active?: string; onPick: (c: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {WIRE_COLORS.map((c, i) => (
        <Tip key={c.value} content={tr(c.label)} shortcut={i < 9 ? String(i + 1) : undefined} direct>
          <button className={`swatch${active === c.value ? ' active' : ''}`} style={{ background: c.value }} aria-label={tr(c.label)} onClick={() => onPick(c.value)} />
        </Tip>
      ))}
    </div>
  );
}

function ProjectInspector() {
  const t = useT();
  const project = useProject((s) => s.project);
  const netlist = useNetlist();
  const [name, setName] = useState(project.meta.name);
  const [desc, setDesc] = useState(project.meta.description);
  useEffect(() => {
    setName(project.meta.name);
    setDesc(project.meta.description);
  }, [project.meta.name, project.meta.description]);
  const comps = project.circuit.components;
  const simulated = comps.filter((c) => (lookup(c.type)?.simulation.support ?? 'visual-only') !== 'visual-only').length;
  const stats: [string, number][] = [
    [t('Parts'), comps.length],
    [t('Simulated'), simulated],
    [t('Wires'), project.circuit.wires.length],
    [t('Nets'), netlist.nets.filter((n) => n.activePinCount > 1).length],
    [t('On breadboards'), netlist.insertions.length],
  ];
  return (
    <div className="insp-empty">
      <div className="insp-sec">
        <div className="sub">{t('Nothing selected — select a part or wire to edit it.')}</div>
        <div className="field">
          <label>{t('Project')}</label>
          <input
            className="input"
            value={name}
            dir="auto"
            aria-label={t('Project name')}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => useProject.getState().updateProject((p) => void (p.meta.name = name || t('Untitled')))}
          />
        </div>
        <textarea
          className="input insp-desc"
          rows={2}
          dir="auto"
          placeholder={t('Description')}
          aria-label={t('Project description')}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={() => useProject.getState().updateProject((p) => void (p.meta.description = desc))}
        />
        <div className="insp-stats">
          {stats.map(([k, v]) => (
            <span key={k}>
              {k}: <b>{v.toLocaleString('en-US')}</b>
            </span>
          ))}
        </div>
      </div>
      <div className="insp-sec insp-tips">
        {rich(t('{add} add a part · {run} run · {palette} commands · {help} shortcuts'), {
          add: <kbd>Ctrl+K</kbd>,
          run: <kbd>F5</kbd>,
          palette: <kbd>Ctrl+Shift+P</kbd>,
          help: <kbd>?</kbd>,
        })}
      </div>
    </div>
  );
}

export function Inspector() {
  const t = useT();
  const selectedComponents = useEditor((s) => s.selectedComponents);
  const selectedWires = useEditor((s) => s.selectedWires);
  const selectedNotes = useEditor((s) => s.selectedAnnotations);
  const circuit = useProject((s) => s.project.circuit);
  const total = selectedComponents.length + selectedWires.length + selectedNotes.length;
  let content: React.ReactNode;
  if (selectedNotes.length === 1 && total === 1) {
    const note = circuit.annotations?.find((a) => a.id === selectedNotes[0]);
    content = note ? <NoteInspector key={note.id} note={note} /> : null;
  } else if (selectedNotes.length && total > 1) {
    content = (
      <div className="insp-head">
        <h3>{t('{n} items selected', { n: total })}</h3>
        <div className="sub">{t('{parts} parts · {wires} wires · {notes} notes', { parts: selectedComponents.length, wires: selectedWires.length, notes: selectedNotes.length })}</div>
      </div>
    );
  } else if (selectedComponents.length === 1) {
    const inst = circuit.components.find((c) => c.id === selectedComponents[0]);
    const def = inst && lookup(inst.type);
    content = inst && def ? <ComponentInspector key={inst.id} inst={inst} def={def} /> : null;
  } else if (selectedComponents.length > 1 || (selectedWires.length > 1 && !selectedComponents.length)) {
    content = (
      <>
        <div className="insp-head">
          <h3>{t('{n} items selected', { n: selectedComponents.length + selectedWires.length })}</h3>
          <div className="sub">
            {t('{parts} parts · {wires} wires', { parts: selectedComponents.length, wires: selectedWires.length })} —{' '}
            {t('use the toolbar to align, rotate or delete. Ctrl+D duplicates.')}
          </div>
        </div>
        {selectedWires.length > 0 && <MultiWireSection ids={selectedWires} />}
      </>
    );
  } else if (selectedWires.length === 1) {
    const w = circuit.wires.find((x) => x.id === selectedWires[0]);
    content = w ? <WireInspector key={w.id} wire={w} /> : null;
  }
  return (
    <div className="panel" style={{ height: '100%' }}>
      <div className="panel-header">
        <span className="title">{t('Properties')}</span>
        <div className="actions">
          <Tip content={t('Hide the Properties panel')} direct>
            <button className="icon-btn" aria-label={t('Hide properties')} onClick={() => useEditor.getState().setPrefs({ showInspector: false })}>
              <Icon name="x" />
            </button>
          </Tip>
        </div>
      </div>
      <div className="insp">{content ?? <ProjectInspector />}</div>
    </div>
  );
}
