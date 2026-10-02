/**
 * Size of the whole interface (80–150 %), for small laptop screens and for
 * projectors in a classroom. The desktop app zooms its WebView, which scales
 * everything consistently (text, canvas, code editor, menus). In a browser
 * the browser's own zoom does this (CSS zoom would upset the canvas's
 * pointer coordinates), so the setting only applies in the desktop app.
 */
import { isTauri } from '../platform';
import { useEditor } from '../state/editor';

export const UI_SCALES = [0.8, 0.9, 1, 1.1, 1.25, 1.5] as const;

export async function applyUiScale(scale: number) {
  if (!isTauri) return;
  try {
    const { getCurrentWebview } = await import('@tauri-apps/api/webview');
    await getCurrentWebview().setZoom(scale);
  } catch (e) {
    console.warn('Could not set the interface size', e);
  }
}

export function setUiScale(scale: number) {
  const s = Math.min(1.5, Math.max(0.8, Math.round(scale * 100) / 100));
  useEditor.getState().setPrefs({ uiScale: s });
  void applyUiScale(s);
}

/** One step larger or smaller along UI_SCALES. */
export function stepUiScale(dir: 1 | -1) {
  const cur = useEditor.getState().uiScale;
  const i = UI_SCALES.findIndex((s) => Math.abs(s - cur) < 0.001);
  const next = i < 0 ? (dir > 0 ? UI_SCALES.find((s) => s > cur) : [...UI_SCALES].reverse().find((s) => s < cur)) : UI_SCALES[i + dir];
  if (next !== undefined) setUiScale(next);
}
