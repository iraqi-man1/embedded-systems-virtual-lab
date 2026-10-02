import { useMemo, useState } from 'react';
import { formatEngineering, parseEngineering } from '../../core/model/units';
import { useT } from '../../i18n/react';
import { measureResistance } from '../../core/sim/measure';
import { buildSimSetup } from '../../core/sim/setup';
import '../../core/sim/models/register';
import { lookup } from '../../app/registry';
import { useNetlist } from '../../state/derived';
import { useEditor } from '../../state/editor';
import { useProject } from '../../state/project';
import { useSim } from '../../state/sim';
import { Icon } from '../common/Icon';
import { METER_BLACK, METER_RED, pinLabel } from './probes';

type Mode = 'V' | 'Ω' | 'A';

export function Multimeter() {
  const t = useT();
  const [mode, setMode] = useState<Mode>('V');
  const project = useProject((s) => s.project);
  const meter = project.instruments.meter;
  const netlist = useNetlist();
  const voltages = useSim((s) => s.voltages);
  const driven = useSim((s) => s.driven);
  const simulating = useSim((s) => s.state !== 'stopped');
  const selected = useEditor((s) => s.selectedComponents);

  const red = meter.red ? netlist.netOf(meter.red) : undefined;
  const black = meter.black ? netlist.netOf(meter.black) : netlist.nets.find((n) => n.hasGround)?.id;

  let reading = '----';
  let unit = mode === 'V' ? 'V DC' : mode === 'Ω' ? 'Ω' : 'A DC';
  let note = '';

  const ohms = useMemo(() => {
    if (mode !== 'Ω' || red === undefined || black === undefined) return null;
    const setup = buildSimSetup(project.circuit, lookup, netlist, {});
    return measureResistance(setup, red, black);
  }, [mode, red, black, project.circuit, netlist]);

  if (mode === 'V') {
    if (red === undefined) note = t('Set the red (V+) probe on a pin.');
    else if (!simulating) note = t('Start the simulation to measure voltage.');
    else if (black === undefined) note = t('No ground found: set the black (COM) probe.');
    else if (!driven[red] || !driven[black]) {
      reading = 'FLOAT';
      note = t('A probe is on a floating net (no defined potential).');
    } else {
      const v = voltages[red] - voltages[black];
      reading = Math.abs(v) < 10 ? v.toFixed(3) : v.toFixed(2);
    }
  } else if (mode === 'Ω') {
    if (simulating) {
      note = t('Resistance is measured on the unpowered circuit (shown below). Real meters must not measure live circuits.');
    }
    if (red === undefined || black === undefined) note = t('Set both probes to measure resistance between them.');
    else if (ohms?.kind === 'open') reading = 'O.L';
    else if (ohms?.kind === 'ohms') {
      const f = formatEngineering(ohms.value, 'Ω', 4).split(' ');
      reading = f[0];
      unit = f[1] ?? 'Ω';
    }
  } else {
    const inst = project.circuit.components.find((c) => c.id === selected[0]);
    const def = inst && lookup(inst.type);
    if (!inst || !def) note = t('Select a resistor in the workspace to read the current through it.');
    else if (!['resistor', 'photoresistor', 'ntc'].includes(def.simulation.model ?? '')) note = t('Current readout supports resistive parts; {part} is not one.', { part: def.name });
    else if (!simulating) note = t('Start the simulation to measure current.');
    else {
      const a = netlist.netOf({ componentId: inst.id, pinId: '1' });
      const b = netlist.netOf({ componentId: inst.id, pinId: '2' });
      const r = def.simulation.model === 'resistor' ? parseEngineering(String(inst.props.resistance ?? '1000')) : NaN;
      if (a !== undefined && b !== undefined && Number.isFinite(r) && driven[a] && driven[b]) {
        const i = (voltages[a] - voltages[b]) / r;
        const f = formatEngineering(i, 'A', 4).split(' ');
        reading = f[0];
        unit = (f[1] ?? 'A') + ' DC';
        note = t('Through {part} (pin 1 → pin 2).', { part: inst.label });
      } else note = t('Current readout is available for fixed resistors with both ends connected.');
    }
  }

  return (
    <div className="dock-body">
      <div className="meter">
        <div className="meter-face">
          <div className="meter-lcd ltr">
            <small>{mode === 'V' ? 'DC VOLTAGE' : mode === 'Ω' ? 'RESISTANCE' : 'DC CURRENT'}</small>
            {reading} <span style={{ fontSize: 16 }}>{unit}</span>
          </div>
          <div className="meter-modes">
            {(['V', 'Ω', 'A'] as Mode[]).map((m) => (
              <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
                {m === 'V' ? 'V⎓' : m === 'Ω' ? 'Ω' : 'A⎓'}
              </button>
            ))}
          </div>
        </div>
        <div className="meter-probes">
          <div className="probe-row">
            <span className="probe-dot" style={{ background: METER_RED }} />
            <span style={{ minWidth: 60 }}>{t('V+ (red)')}</span>
            <span className="ltr" style={{ fontFamily: 'var(--font-mono)', flex: 1 }}>
              {meter.red ? pinLabel(project.circuit, meter.red) : '—'}
            </span>
            <button className="btn" onClick={() => useEditor.getState().set({ tool: 'probe-meter-red' })}>
              <Icon name="probe" /> {t('Place')}
            </button>
          </div>
          <div className="probe-row">
            <span className="probe-dot" style={{ background: METER_BLACK }} />
            <span style={{ minWidth: 60 }}>COM</span>
            <span className="ltr" style={{ fontFamily: 'var(--font-mono)', flex: 1 }}>
              {meter.black ? pinLabel(project.circuit, meter.black) : t('GND (auto)')}
            </span>
            <button className="btn" onClick={() => useEditor.getState().set({ tool: 'probe-meter-black' })}>
              <Icon name="probe" /> {t('Place')}
            </button>
          </div>
          {(meter.red || meter.black) && (
            <button
              className="btn"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => useProject.getState().updateProject((p) => void (p.instruments.meter = { red: null, black: null }))}
            >
              {t('Remove probes')}
            </button>
          )}
          {note && <div className="note">{note}</div>}
        </div>
      </div>
    </div>
  );
}
