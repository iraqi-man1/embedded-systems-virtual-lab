/**
 * MCU panel: what the firmware is doing right now — pin modes, levels,
 * voltages and PWM duty, the CPU registers, and flash/RAM use.
 */
import { useMemo, useRef, useState } from 'react';
import { lookup } from '../../app/registry';
import type { McuStatus } from '../../core/sim/types';
import type { MessageKey } from '../../i18n';
import { useT } from '../../i18n/react';
import { useNetlist } from '../../state/derived';
import { useProject } from '../../state/project';
import { findTargetBoard, useSim } from '../../state/sim';
import { Tip } from '../common/Tooltip';

const SREG_FLAGS = ['I', 'T', 'H', 'S', 'V', 'N', 'Z', 'C'];
const SREG_NAMES: Record<string, MessageKey> = {
  I: 'Global interrupt enable',
  T: 'Bit copy storage',
  H: 'Half carry',
  S: 'Sign (N ⊕ V)',
  V: 'Two’s complement overflow',
  N: 'Negative',
  Z: 'Zero',
  C: 'Carry',
};
const MODE: Record<string, string> = { high: 'OUTPUT', low: 'OUTPUT', input: 'INPUT', 'input-pullup': 'INPUT_PULLUP' };

const hex = (n: number, digits: number) => `0x${n.toString(16).toUpperCase().padStart(digits, '0')}`;

function Bar({ label, used, total, extra }: { label: string; used: number | null; total: number; extra?: string }) {
  const pct = used == null ? 0 : Math.min(100, (used / total) * 100);
  return (
    <div className="mcu-mem">
      <div className="mcu-mem-head">
        <span>{label}</span>
        <span className="mono ltr">
          {used == null ? '—' : `${used.toLocaleString('en-US')} / ${total.toLocaleString('en-US')} B (${pct.toFixed(1)} %)`}
          {extra ? ` · ${extra}` : ''}
        </span>
      </div>
      <div className="mcu-mem-bar">
        <div style={{ width: `${pct}%` }} className={pct > 90 ? 'hot' : pct > 75 ? 'warm' : ''} />
      </div>
    </div>
  );
}

/** Registers that changed since the previous frame are highlighted. */
function Registers({ r }: { r: number[] }) {
  const prev = useRef<number[]>(r);
  const changed = r.map((v, i) => prev.current[i] !== v);
  prev.current = r;
  return (
    <div className="mcu-regs">
      {r.map((v, i) => (
        <Tip key={i} content={`R${i} = ${v} (${hex(v, 2)})`} direct>
          <div className={`mcu-reg${changed[i] ? ' changed' : ''}`}>
            <span className="name">R{i}</span>
            <span className="mono">{v.toString(16).toUpperCase().padStart(2, '0')}</span>
          </div>
        </Tip>
      ))}
    </div>
  );
}

export function McuPanel() {
  const t = useT();
  const project = useProject((s) => s.project);
  const mcus = useSim((s) => s.mcus);
  const voltages = useSim((s) => s.voltages);
  const driven = useSim((s) => s.driven);
  const simState = useSim((s) => s.state);
  const compile = useSim((s) => s.compile);
  const netlist = useNetlist();
  const [chosen, setChosen] = useState<string | null>(null);
  const [wiredOnly, setWiredOnly] = useState(true);

  const target = findTargetBoard(project);
  const status: McuStatus | undefined = mcus.find((m) => m.componentId === chosen) ?? mcus.find((m) => m.componentId === target?.id) ?? mcus[0];
  const board = project.circuit.components.find((c) => c.id === (status?.componentId ?? target?.id));
  const def = board ? lookup(board.type) : undefined;
  const mcu = def?.mcu;

  const rows = useMemo(() => {
    if (!board || !def?.mcu || !status) return [];
    return Object.keys(def.mcu.pinMap).map((pinId) => {
      const pin = def.pins.find((p) => p.id === pinId);
      const net = netlist.netOf({ componentId: board.id, pinId });
      const wired = net !== undefined && netlist.nets[net].activePinCount > 1;
      return { pinId, label: pin?.label ?? pinId, net, wired };
    });
  }, [board, def, status, netlist]);

  if (!board || !mcu) return <div className="dock-body empty-note">{t('Add a programmable board (e.g. Arduino Uno) to inspect its microcontroller.')}</div>;

  const dbg = status?.debug;
  const built = compile.hex[board.id] ? compile : null;
  const stack = dbg ? dbg.ramEnd - dbg.sp : null;

  return (
    <div className="dock-body mcu-panel">
      <div className="inst-bar">
        {mcus.length > 1 ? (
          <select className="tb-select" value={status?.componentId} onChange={(e) => setChosen(e.target.value)} aria-label={t('Board')}>
            {mcus.map((m) => {
              const c = project.circuit.components.find((x) => x.id === m.componentId);
              return (
                <option key={m.componentId} value={m.componentId}>
                  {c?.label} — {c && lookup(c.type)?.name}
                </option>
              );
            })}
          </select>
        ) : (
          <span style={{ color: 'var(--text-2)' }}>
            {board.label} · {def.name}
          </span>
        )}
        <span className="mono ltr" style={{ color: 'var(--text-3)' }}>
          {mcu.chip.toUpperCase()} · {(mcu.clockHz / 1e6).toLocaleString('en-US')} MHz · {mcu.vcc} V
        </span>
        <span className="grow" />
        <label>
          <input type="checkbox" checked={wiredOnly} onChange={(e) => setWiredOnly(e.target.checked)} /> {t('Wired pins only')}
        </label>
      </div>
      {!status ? (
        <div className="empty-note">
          {simState === 'stopped' ? t('Run the simulation to see pin states and registers.') : t('{board} is not running firmware.', { board: board.label })}
          {built && (
            <div className="mcu-side" style={{ maxWidth: 420, margin: '12px auto 0' }}>
              <Bar label={t('Flash')} used={built.flashBytes} total={mcu.flashBytes} />
              <Bar label={t('RAM (globals)')} used={built.ramBytes} total={mcu.sramBytes} />
            </div>
          )}
        </div>
      ) : (
        <div className="mcu-body">
          <div className="mcu-side">
            <div className="mcu-cpu mono">
              <div>
                <span className="k">PC</span> {hex(status.pc * 2, 4)}
              </div>
              <div>
                <span className="k">SP</span> {dbg ? hex(dbg.sp, 4) : '—'}
              </div>
              <div>
                <span className="k">{t('Cycles')}</span> {status.cycles.toLocaleString('en-US')}
              </div>
            </div>
            {dbg && (
              <div className="mcu-sreg" aria-label={`SREG ${hex(dbg.sreg, 2)}`}>
                <span className="k mono">SREG</span>
                {SREG_FLAGS.map((f, i) => (
                  <Tip key={f} content={`${f}: ${t(SREG_NAMES[f])}`} direct>
                    <span className={`flag${dbg.sreg & (0x80 >> i) ? ' on' : ''}`}>{f}</span>
                  </Tip>
                ))}
              </div>
            )}
            <Bar label={t('Flash')} used={built?.flashBytes ?? null} total={mcu.flashBytes} />
            <Bar
              label="RAM"
              used={built?.ramBytes != null && stack != null ? built.ramBytes + stack : null}
              total={mcu.sramBytes}
              extra={stack != null ? t('stack {n} B', { n: stack }) : undefined}
            />
            {dbg && <Registers r={dbg.r} />}
          </div>
          <div className="mcu-pins">
            <table>
              <thead>
                <tr>
                  <th>{t('Pin')}</th>
                  <th>{t('Mode')}</th>
                  <th>{t('Level')}</th>
                  <th className="num">{t('Voltage')}</th>
                  <th className="num">PWM</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((r) => !wiredOnly || r.wired)
                  .map((r) => {
                    const drive = status.pins[r.pinId] ?? 'input';
                    const output = drive === 'high' || drive === 'low';
                    const floating = dbg?.floating.includes(r.pinId);
                    const reads = dbg?.inputs[r.pinId];
                    const level = output ? drive === 'high' : reads;
                    const v = r.net !== undefined && driven[r.net] ? voltages[r.net] : undefined;
                    const duty = dbg?.duty[r.pinId];
                    const pwm = output && duty !== undefined && duty > 0.005 && duty < 0.995;
                    return (
                      <tr key={r.pinId} className={r.wired ? '' : 'unwired'}>
                        <td className="mono">{r.label}</td>
                        <td className="mono">{MODE[drive] ?? drive}</td>
                        <td>
                          {floating ? (
                            <span className="pin-lvl float">{t('floating')}</span>
                          ) : level === undefined ? (
                            '—'
                          ) : (
                            <span className={`pin-lvl ${level ? 'high' : 'low'}`}>{level ? 'HIGH' : 'LOW'}</span>
                          )}
                        </td>
                        <td className="num mono">{v === undefined ? '—' : `${v.toFixed(2)} V`}</td>
                        <td className="num mono">{pwm ? `${(duty * 100).toFixed(1)} %` : '—'}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            {wiredOnly && !rows.some((r) => r.wired) && <div className="empty-note">{t('No pins of {board} are wired yet.', { board: board.label })}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
