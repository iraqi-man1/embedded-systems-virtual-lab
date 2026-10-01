import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { HEX_LIMIT, hexDump, withTimestamps } from '../../core/instruments/serialLog';
import { storage } from '../../platform';
import { useEditor } from '../../state/editor';
import { useProject } from '../../state/project';
import { clearSerial, findTargetBoard, sendSerial, useSim } from '../../state/sim';
import { Icon } from '../common/Icon';
import { Tip } from '../common/Tooltip';

const ENDINGS = { none: '', nl: '\n', cr: '\r', both: '\r\n' } as const;
async function saveLog(text: string, label: string) {
  try {
    const path = await storage.exportText(text, `serial-${label}.txt`, { name: 'Text', extensions: ['txt', 'log'] });
    if (path) useEditor.getState().notify(`Saved ${path.split(/[\\/]/).pop()}`, 'success');
  } catch (e) {
    useEditor.getState().notify(`Could not save the log: ${(e as Error).message ?? e}`, 'error');
  }
}

export function SerialMonitor() {
  const project = useProject((s) => s.project);
  const board = findTargetBoard(project);
  const text = useSim((s) => (board ? (s.serial[board.id] ?? '') : ''));
  const stamps = useSim((s) => (board ? s.serialStamps[board.id] : undefined));
  const timestamps = useEditor((s) => s.serialTimestamps);
  const view = useEditor((s) => s.serialView);
  const clearOnRun = useEditor((s) => s.serialClearOnRun);
  const shown = useMemo(
    () => (view === 'hex' ? hexDump(text) : timestamps ? withTimestamps(text, stamps ?? []) : text),
    [text, stamps, view, timestamps],
  );
  const baud = useSim((s) => s.mcus.find((m) => m.componentId === board?.id)?.serialBaud);
  const running = useSim((s) => s.state !== 'stopped');
  const [auto, setAuto] = useState(true);
  const [input, setInput] = useState('');
  const [ending, setEnding] = useState<keyof typeof ENDINGS>('nl');
  const [history, setHistory] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState(-1);
  const out = useRef<HTMLPreElement>(null);

  useLayoutEffect(() => {
    if (auto && out.current) out.current.scrollTop = out.current.scrollHeight;
  }, [shown, auto]);
  useEffect(() => setHIdx(-1), [history]);

  const send = () => {
    if (!input && ending === 'none') return;
    sendSerial(input + ENDINGS[ending]);
    if (input) setHistory((h) => [input, ...h.filter((x) => x !== input)].slice(0, 30));
    setInput('');
  };

  return (
    <div className="dock-body">
      <div className="inst-bar">
        <span style={{ color: 'var(--text-2)' }}>
          {board ? `${board.label} · USART0` : 'No board'}
          {baud && text ? ` · ${Math.round(baud)} baud` : ''}
        </span>
        <span className="grow" />
        <Tip content="Prefix lines with the simulation time">
          <button className={`tb-btn${timestamps ? ' active' : ''}`} aria-pressed={timestamps} disabled={view === 'hex'} onClick={() => useEditor.getState().setPrefs({ serialTimestamps: !timestamps })}>
            <Icon name="clock" />
            <span className="label">Time</span>
          </button>
        </Tip>
        <Tip content={view === 'hex' ? 'Show as text' : `Show bytes in hex (last ${HEX_LIMIT / 1024} KB)`}>
          <button className={`tb-btn${view === 'hex' ? ' active' : ''}`} aria-pressed={view === 'hex'} onClick={() => useEditor.getState().setPrefs({ serialView: view === 'hex' ? 'text' : 'hex' })}>
            <span className="label mono">0x</span>
          </button>
        </Tip>
        <Tip content="Clear the output each time the simulation starts" direct>
          <label>
            <input type="checkbox" checked={clearOnRun} onChange={(e) => useEditor.getState().setPrefs({ serialClearOnRun: e.target.checked })} /> Clear on run
          </label>
        </Tip>
        <label>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Autoscroll
        </label>
        <Tip content="Clear output">
          <button className="tb-btn" onClick={clearSerial} aria-label="Clear output">
            <Icon name="eraser" />
            <span className="label">Clear</span>
          </button>
        </Tip>
        <Tip content="Copy all">
          <button className="tb-btn" onClick={() => navigator.clipboard?.writeText(shown)} aria-label="Copy all" disabled={!text}>
            <Icon name="copy" />
          </button>
        </Tip>
        <Tip content="Save the log to a text file">
          <button className="tb-btn" aria-label="Save log" disabled={!text} onClick={() => void saveLog(shown, board?.label ?? 'serial')}>
            <Icon name="save" />
          </button>
        </Tip>
      </div>
      <pre ref={out} className="serial-out">
        {shown || <span style={{ color: 'var(--text-3)' }}>{running ? 'Waiting for serial output…' : 'Serial output appears here when the simulation runs. Use Serial.begin() in your sketch.'}</span>}
      </pre>
      <div className="serial-in">
        <input
          className="input"
          placeholder={running ? 'Type a message and press Enter to send to the board' : 'Start the simulation to send data'}
          disabled={!running}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
            if (e.key === 'ArrowUp' && history.length) {
              const i = Math.min(history.length - 1, hIdx + 1);
              setHIdx(i);
              setInput(history[i]);
              e.preventDefault();
            }
            if (e.key === 'ArrowDown') {
              const i = Math.max(-1, hIdx - 1);
              setHIdx(i);
              setInput(i >= 0 ? history[i] : '');
              e.preventDefault();
            }
          }}
        />
        <select className="tb-select" value={ending} onChange={(e) => setEnding(e.target.value as keyof typeof ENDINGS)} aria-label="Line ending">
          <option value="none">No line ending</option>
          <option value="nl">Newline</option>
          <option value="cr">Carriage return</option>
          <option value="both">Both NL & CR</option>
        </select>
        <button className="btn primary" onClick={send} disabled={!running}>
          <Icon name="send" /> Send
        </button>
      </div>
    </div>
  );
}
