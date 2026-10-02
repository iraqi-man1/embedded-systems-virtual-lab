/**
 * Offline Monaco setup: the editor and its worker are bundled locally
 * (never fetched from a CDN), and Arduino language helpers are registered.
 */
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import { registerArduinoLanguage } from './arduinoLanguage';
import { THEMES } from '../themes';

declare global {
  interface Window {
    MonacoEnvironment?: { getWorker(id: string, label: string): Worker };
  }
}

window.MonacoEnvironment = { getWorker: () => new EditorWorker() };

// One editor theme per application theme (styles/theme.css + ui/themes.ts).
for (const th of THEMES) {
  const e = th.editor;
  monaco.editor.defineTheme(`evlab-${th.id}`, {
    base: e.base,
    inherit: true,
    rules: [
      { token: 'keyword', foreground: e.keyword, fontStyle: 'bold' },
      { token: 'number', foreground: e.number },
      { token: 'comment', foreground: e.comment, fontStyle: 'italic' },
      { token: 'string', foreground: e.string },
    ],
    colors: {
      'editor.background': e.background,
      'editor.foreground': e.foreground,
      'editorGutter.background': e.gutter,
      'editorLineNumber.foreground': e.lineNumber,
    },
  });
}

registerArduinoLanguage(monaco);

export { monaco };
