import { useEffect, useRef, useState } from 'react';
import { monaco } from './monacoSetup';
import { lookup } from '../../app/registry';
import { useEditor } from '../../state/editor';
import { useProject } from '../../state/project';
import { compileFirmware, findTargetBoard, useBuildState, useSim } from '../../state/sim';
import { confirmDialog } from '../common/Dialog';
import { Icon } from '../common/Icon';
import { Tip } from '../common/Tooltip';

/** Why a file name can't be used, or null when it can. */
function fileNameError(name: string, others: string[]): string | null {
  if (!/^[A-Za-z0-9_-]+\.(h|hpp|c|cpp)$/.test(name)) return 'Use letters, digits, - or _ and end in .h, .hpp, .c or .cpp';
  if (others.includes(name)) return 'A file with this name already exists';
  return null;
}

/** Inline name field for a new or renamed file: Enter applies, Esc cancels. */
function FileNameInput({ initial, others, onDone }: { initial: string; others: string[]; onDone: (name: string | null) => void }) {
  const [value, setValue] = useState(initial);
  const error = fileNameError(value.trim(), others);
  const done = useRef(false);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  return (
    <Tip content={error ?? 'Enter to apply · Esc to cancel'} direct>
      <div className={`code-tab editing${error ? ' invalid' : ''}`}>
        <Icon name="code" size={13} />
        <input
          className="tab-input"
          value={value}
          autoFocus
          spellCheck={false}
          aria-label="File name"
          aria-invalid={!!error}
          size={Math.max(8, value.length + 1)}
          onFocus={(e) => e.currentTarget.setSelectionRange(0, value.lastIndexOf('.') > 0 ? value.lastIndexOf('.') : value.length)}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !error) finish(value.trim());
            else if (e.key === 'Escape') finish(null);
          }}
          onBlur={() => finish(error ? null : value.trim())}
        />
      </div>
    </Tip>
  );
}

const uriFor = (name: string) => monaco.Uri.parse(`file:///sketch/${name}`);
const languageFor = (name: string) => (/\.(c)$/.test(name) ? 'c' : 'cpp');
/** True while the project pushes content into Monaco (not a user edit). */
let applyingFromProject = false;

export function CodeEditor() {
  const host = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const files = useProject((s) => s.project.firmware.files);
  const revision = useProject((s) => s.revision);
  const projectCreated = useProject((s) => s.project.meta.created);
  const theme = useEditor((s) => s.theme);
  const revealLine = useEditor((s) => s.revealLine);
  const compile = useSim((s) => s.compile);
  const simState = useSim((s) => s.state);
  const buildState = useBuildState();
  const [active, setActive] = useState('sketch.ino');
  const circuit = useProject((s) => s.project.circuit);
  const target = findTargetBoard(useProject.getState().project);
  const targetDef = target ? lookup(target.type) : undefined;
  void revision;

  // Create the editor once.
  useEffect(() => {
    const ed = monaco.editor.create(host.current!, {
      automaticLayout: true,
      fontFamily: 'Cascadia Mono, Consolas, monospace',
      fontSize: 13,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      tabSize: 2,
      renderWhitespace: 'selection',
      smoothScrolling: true,
      fixedOverflowWidgets: true,
      // Project files dropped on the editor open the project (window handler).
      dropIntoEditor: { enabled: false },
      theme: useEditor.getState().theme === 'dark' ? 'evlab-dark' : 'evlab-light',
    });
    editorRef.current = ed;
    // Ctrl+B / F5 inside the editor are handled globally; keep Ctrl+S from typing.
    return () => {
      ed.dispose();
      for (const m of monaco.editor.getModels()) m.dispose();
    };
  }, []);

  // Keep Monaco models in sync with the project's files.
  useEffect(() => {
    const names = new Set(files.map((f) => f.name));
    for (const m of monaco.editor.getModels()) {
      const name = m.uri.path.replace('/sketch/', '');
      if (!names.has(name)) m.dispose();
    }
    for (const f of files) {
      const uri = uriFor(f.name);
      let model = monaco.editor.getModel(uri);
      if (!model) {
        model = monaco.editor.createModel(f.content, languageFor(f.name), uri);
        model.onDidChangeContent(() => {
          if (!applyingFromProject) useProject.getState().setFile(f.name, model!.getValue());
        });
      } else if (model.getValue() !== f.content) {
        applyingFromProject = true;
        model.setValue(f.content);
        applyingFromProject = false;
      }
    }
    if (!names.has(active)) setActive('sketch.ino');
  }, [files, active, projectCreated]);

  useEffect(() => {
    const model = monaco.editor.getModel(uriFor(active));
    if (model && editorRef.current && editorRef.current.getModel() !== model) editorRef.current.setModel(model);
  }, [active, files]);

  useEffect(() => {
    monaco.editor.setTheme(theme === 'dark' ? 'evlab-dark' : 'evlab-light');
  }, [theme]);

  // Compiler diagnostics -> markers.
  useEffect(() => {
    for (const f of files) {
      const model = monaco.editor.getModel(uriFor(f.name));
      if (!model) continue;
      const markers = compile.diagnostics
        .filter((d) => d.file === f.name)
        .map((d) => ({
          severity:
            d.severity === 'error' ? monaco.MarkerSeverity.Error : d.severity === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Info,
          message: d.message,
          startLineNumber: d.line,
          startColumn: d.column,
          endLineNumber: d.line,
          endColumn: model.getLineMaxColumn(Math.min(Math.max(1, d.line), model.getLineCount())),
        }));
      monaco.editor.setModelMarkers(model, 'evlab', markers);
    }
  }, [compile.diagnostics, files]);

  useEffect(() => {
    if (!revealLine || !editorRef.current) return;
    if (files.some((f) => f.name === revealLine.file)) setActive(revealLine.file);
    setTimeout(() => {
      const ed = editorRef.current!;
      ed.revealLineInCenter(revealLine.line);
      ed.setPosition({ lineNumber: revealLine.line, column: 1 });
      ed.focus();
    }, 0);
  }, [revealLine, files]);

  // Inline file naming: `null` = adding a new file, a name = renaming it.
  const [naming, setNaming] = useState<{ from: string | null } | null>(null);
  const names = files.map((f) => f.name);
  const finishNaming = (name: string | null) => {
    const from = naming?.from ?? null;
    setNaming(null);
    if (!name) return;
    if (from) useProject.getState().renameFile(from, name);
    else useProject.getState().addFile(name);
    setActive(name);
  };
  const newFileName = () => {
    for (let i = 1; ; i++) {
      const n = i === 1 ? 'helpers.h' : `helpers${i}.h`;
      if (!names.includes(n)) return n;
    }
  };

  const boards = circuit.components.filter((c) => lookup(c.type)?.mcu);
  const statusText =
    compile.status === 'compiling'
      ? 'Compiling…'
      : buildState === 'modified'
        ? simState !== 'stopped'
          ? 'The board runs the previous build'
          : 'Code changed since the last build — Ctrl+B to compile'
        : compile.status === 'success'
          ? `Built · flash ${compile.flashBytes ?? '?'} B · RAM ${compile.ramBytes ?? '?'} B`
          : compile.status === 'error'
            ? 'Build failed — see Problems'
            : targetDef
              ? `${targetDef.mcu?.chip ?? ''} · PlatformIO ${targetDef.mcu?.toolchain.board ?? ''}`
              : 'No programmable board in the circuit';

  return (
    <div className="panel code-panel" style={{ flex: 1 }}>
      <div className="code-tabs">
        {files.map((f) =>
          naming?.from === f.name ? (
            <FileNameInput key={f.name} initial={f.name} others={names.filter((n) => n !== f.name)} onDone={finishNaming} />
          ) : (
            <Tip
              key={f.name}
              direct
              content={`${f.name === 'sketch.ino' ? 'Main sketch' : 'Double-click to rename'}${compile.built && compile.built[f.name] !== f.content ? ' · changed since the last build' : ''}`}
            >
              <div
                className={`code-tab${f.name === active ? ' active' : ''}`}
                onClick={() => setActive(f.name)}
                onDoubleClick={() => f.name !== 'sketch.ino' && setNaming({ from: f.name })}
              >
                <Icon name="code" size={13} />
                {f.name}
                {compile.built && compile.built[f.name] !== f.content && <span className="mod-dot" aria-label="Changed since the last build" />}
                {f.name !== 'sketch.ino' && (
                  <span
                    className="x"
                    role="button"
                    aria-label={`Remove ${f.name}`}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (await confirmDialog({ title: `Remove ${f.name}?`, message: 'The file and its contents are removed from the project.', confirmLabel: 'Remove', danger: true }))
                        useProject.getState().removeFile(f.name);
                    }}
                  >
                    <Icon name="x" size={12} />
                  </span>
                )}
              </div>
            </Tip>
          ),
        )}
        {naming && naming.from === null && <FileNameInput initial={newFileName()} others={names} onDone={finishNaming} />}
        <Tip content="Add a source file (.h, .c, .cpp)" direct>
          <button className="icon-btn" style={{ alignSelf: 'center', marginLeft: 4 }} aria-label="Add file" onClick={() => setNaming({ from: null })} disabled={!!naming}>
            <Icon name="plus" />
          </button>
        </Tip>
      </div>
      <div className="code-toolbar">
        <Tip content={simState !== 'stopped' ? 'Compile and flash the running board' : 'Compile the firmware'} shortcut="Ctrl+B">
          <button className="tb-btn" onClick={() => void compileFirmware()} disabled={compile.status === 'compiling'}>
            <Icon name="build" />
            <span className="label">Compile</span>
          </button>
        </Tip>
        {boards.length > 1 && (
          <select
            className="tb-select"
            value={target?.id ?? ''}
            onChange={(e) => useProject.getState().updateProject((p) => void (p.firmware.target = e.target.value))}
            aria-label="Board that runs this firmware"
          >
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label} — {lookup(b.type)?.name}
              </option>
            ))}
          </select>
        )}
        {simState !== 'stopped' && buildState === 'modified' && (
          <Tip content="Compile and flash the running board; the rest of the circuit keeps running" shortcut="Ctrl+B">
            <button className="tb-btn accent" onClick={() => void compileFirmware()}>
              <Icon name="reset" />
              <span className="label">Rebuild &amp; restart board</span>
            </button>
          </Tip>
        )}
        <Tip content={statusText} direct>
          <span className="info">{statusText}</span>
        </Tip>
      </div>
      <div ref={host} className="editor-host" />
    </div>
  );
}
