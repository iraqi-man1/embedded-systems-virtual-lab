/**
 * Application entry point (UI thread).
 * Registers the Wokwi custom elements, loads component packages and mounts React.
 */
import '@wokwi/elements';
import { createRoot } from 'react-dom/client';
import './styles/theme.css';
import './styles/app.css';
import './styles/home.css';
import './ui/editor/monacoSetup';
import { registerExternalPackages } from './app/registry';
import { t } from './i18n';
import { packages } from './platform';
import { useEditor } from './state/editor';
import { App } from './ui/App';
import { applyTheme } from './ui/themes';

applyTheme(useEditor.getState().appliedTheme);

// Disable the WebView's default context menu outside text fields (desktop feel).
window.addEventListener('contextmenu', (e) => {
  const t = e.target as HTMLElement;
  if (!t.closest('input, textarea, .monaco-editor, .serial-out, .build-log')) e.preventDefault();
});

void packages.discover().then((found) => {
  if (!found.length) return;
  const errors = registerExternalPackages(found);
  const ed = useEditor.getState();
  ed.notify(t('Loaded {n} component package(s).', { n: found.length - errors.length }), 'info');
  for (const err of errors) ed.notify(t('Package error: {error}', { error: err }), 'warning');
});

createRoot(document.getElementById('root')!).render(<App />);
