import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useProject } from '../../state/project';
import { clearSerial, findTargetBoard, sendSerial, useSim } from '../../state/sim';
import { Icon } from '../common/Icon';

const ENDINGS = { none: '', nl: '\n', cr: '\r', both: '\r\n' } as const;

export function SerialMonitor() {
  const project = useProject((s) => s.project);
  const board = findTargetBoard(project);
  const text = useSim((s) => (board ? (s.serial[board.id] ?? '') : ''));
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
  }, [text, auto]);
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
        <label>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Autoscroll
        </label>
        <button className="tb-btn" onClick={clearSerial} title="Clear output">
          <Icon name="eraser" />
          <span className="label">Clear</span>
        </button>
        <button className="tb-btn" onClick={() => navigator.clipboard?.writeText(text)} title="Copy all">
          <Icon name="copy" />
        </button>
      </div>
      <pre ref={out} className="serial-out">
        {text || <span style={{ color: 'var(--text-3)' }}>{running ? 'Waiting for serial output…' : 'Serial output appears here when the simulation runs. Use Serial.begin() in your sketch.'}</span>}
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
        <select className="tb-select" value={ending} onChange={(e) => setEnding(e.target.value as keyof typeof ENDINGS)} title="Line ending">
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
