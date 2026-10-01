/**
 * Offline Monaco setup: the editor and its worker are bundled locally
 * (never fetched from a CDN), and Arduino language helpers are registered.
 */
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import { registerArduinoLanguage } from './arduinoLanguage';

declare global {
  interface Window {
    MonacoEnvironment?: { getWorker(id: string, label: string): Worker };
  }
}

window.MonacoEnvironment = { getWorker: () => new EditorWorker() };

monaco.editor.defineTheme('evlab-light', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: '0b55b8', fontStyle: 'bold' },
    { token: 'number', foreground: 'a0522d' },
    { token: 'comment', foreground: '6a8a5a', fontStyle: 'italic' },
    { token: 'string', foreground: 'b5450f' },
  ],
  colors: { 'editor.background': '#ffffff', 'editorGutter.background': '#f7f8fa', 'editorLineNumber.foreground': '#9aa3ae' },
});
monaco.editor.defineTheme('evlab-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: '6cb6ff', fontStyle: 'bold' },
    { token: 'number', foreground: 'f0b27a' },
    { token: 'comment', foreground: '7f9c78', fontStyle: 'italic' },
  ],
  colors: { 'editor.background': '#1b1e23', 'editorGutter.background': '#1b1e23', 'editorLineNumber.foreground': '#5c6570' },
});

registerArduinoLanguage(monaco);

export { monaco };
