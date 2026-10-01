import { useEffect, useRef, useState } from 'react';
import { monaco } from './monacoSetup';
import { lookup } from '../../app/registry';
import { useEditor } from '../../state/editor';
import { useProject } from '../../state/project';
import { compileFirmware, findTargetBoard, useSim } from '../../state/sim';
import { Icon } from '../common/Icon';

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

  const addFile = () => {
    const name = prompt('New file name (e.g. helpers.h, utils.cpp):', 'helpers.h');
    if (!name) return;
    if (!/^[A-Za-z0-9_-]+\.(h|hpp|c|cpp)$/.test(name)) {
      useEditor.getState().notify('Use a simple name ending in .h, .hpp, .c or .cpp', 'warning');
      return;
    }
    useProject.getState().addFile(name);
    setActive(name);
  };

  const boards = circuit.components.filter((c) => lookup(c.type)?.mcu);
  const statusText =
    compile.status === 'compiling'
      ? 'Compiling…'
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
        {files.map((f) => (
          <div key={f.name} className={`code-tab${f.name === active ? ' active' : ''}`} onClick={() => setActive(f.name)}>
            <Icon name="code" size={13} />
            {f.name}
            {f.name !== 'sketch.ino' && (
              <span
                className="x"
                title="Remove file"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Remove ${f.name}?`)) useProject.getState().removeFile(f.name);
                }}
              >
                <Icon name="x" size={12} />
              </span>
            )}
          </div>
        ))}
        <button className="icon-btn" style={{ alignSelf: 'center', marginLeft: 4 }} title="Add file" onClick={addFile}>
          <Icon name="plus" />
        </button>
      </div>
      <div className="code-toolbar">
        <button className="tb-btn" onClick={() => void compileFirmware()} disabled={compile.status === 'compiling'} title="Compile (Ctrl+B)">
          <Icon name="build" />
          <span className="label">Compile</span>
        </button>
        {boards.length > 1 && (
          <select
            className="tb-select"
            value={target?.id ?? ''}
            onChange={(e) => useProject.getState().updateProject((p) => void (p.firmware.target = e.target.value))}
            title="Board that runs this firmware"
          >
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label} — {lookup(b.type)?.name}
              </option>
            ))}
          </select>
        )}
        <span className="info" title={statusText}>
          {simState !== 'stopped' && compile.status !== 'compiling' ? 'Edits apply after Stop + Run · ' : ''}
          {statusText}
        </span>
      </div>
      <div ref={host} className="editor-host" />
    </div>
  );
}
