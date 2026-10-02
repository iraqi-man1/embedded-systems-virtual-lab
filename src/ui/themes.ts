/**
 * Colour themes. The interface colours are CSS tokens in styles/theme.css
 * (`:root[data-theme='<id>']`); this registry adds what code needs: the
 * light/dark base (native controls, breadboard tint, the quick toggle), the
 * swatches shown in the theme picker and the matching code-editor colours.
 */
import type { MessageKey } from '../i18n';

export type ThemeId = 'light' | 'dark' | 'midnight' | 'nord' | 'dracula' | 'solarized' | 'blueprint' | 'contrast';
/** A theme, or follow the operating system's light/dark setting. */
export type ThemePref = ThemeId | 'system';

export interface ThemeInfo {
  id: ThemeId;
  label: MessageKey;
  description: MessageKey;
  base: 'light' | 'dark';
  /** Picker preview: app background, panel, canvas, accent, text. */
  swatch: { app: string; panel: string; canvas: string; accent: string; text: string };
  /** Code editor (Monaco) colours. */
  editor: { base: 'vs' | 'vs-dark' | 'hc-black'; background: string; foreground: string; gutter: string; lineNumber: string; keyword: string; number: string; comment: string; string: string };
}

export const THEMES: ThemeInfo[] = [
  {
    id: 'light',
    label: 'Light',
    description: 'Clean and bright, for well-lit rooms and printing.',
    base: 'light',
    swatch: { app: '#e9ebef', panel: '#f7f8fa', canvas: '#f3f4f6', accent: '#1468d9', text: '#1d232b' },
    editor: { base: 'vs', background: '#ffffff', foreground: '#1d232b', gutter: '#f7f8fa', lineNumber: '#9aa3ae', keyword: '0b55b8', number: 'a0522d', comment: '6a8a5a', string: 'b5450f' },
  },
  {
    id: 'dark',
    label: 'Dark',
    description: 'Neutral dark grey that is easy on the eyes.',
    base: 'dark',
    swatch: { app: '#121418', panel: '#1a1d22', canvas: '#181b20', accent: '#4b9bff', text: '#e3e7ec' },
    editor: { base: 'vs-dark', background: '#1b1e23', foreground: '#e3e7ec', gutter: '#1b1e23', lineNumber: '#5c6570', keyword: '6cb6ff', number: 'f0b27a', comment: '7f9c78', string: 'e6a26f' },
  },
  {
    id: 'midnight',
    label: 'Midnight',
    description: 'Deep navy with cyan highlights.',
    base: 'dark',
    swatch: { app: '#0b1020', panel: '#0f172a', canvas: '#0c1324', accent: '#38bdf8', text: '#e2e8f5' },
    editor: { base: 'vs-dark', background: '#0d1527', foreground: '#e2e8f5', gutter: '#0d1527', lineNumber: '#4b5876', keyword: '38bdf8', number: 'fbbf24', comment: '64748b', string: 'a5f3a9' },
  },
  {
    id: 'nord',
    label: 'Nord',
    description: 'Calm arctic blues and greys.',
    base: 'dark',
    swatch: { app: '#2a303b', panel: '#2e3440', canvas: '#2b313c', accent: '#88c0d0', text: '#eceff4' },
    editor: { base: 'vs-dark', background: '#2e3440', foreground: '#d8dee9', gutter: '#2e3440', lineNumber: '#616e88', keyword: '81a1c1', number: 'b48ead', comment: '7b88a1', string: 'a3be8c' },
  },
  {
    id: 'dracula',
    label: 'Dracula',
    description: 'Dark purple with vivid accents.',
    base: 'dark',
    swatch: { app: '#21222c', panel: '#282a36', canvas: '#23242f', accent: '#bd93f9', text: '#f8f8f2' },
    editor: { base: 'vs-dark', background: '#282a36', foreground: '#f8f8f2', gutter: '#282a36', lineNumber: '#6272a4', keyword: 'ff79c6', number: 'bd93f9', comment: '6272a4', string: 'f1fa8c' },
  },
  {
    id: 'solarized',
    label: 'Solarized Light',
    description: 'Warm paper tones that are gentle in daylight.',
    base: 'light',
    swatch: { app: '#eee8d5', panel: '#fdf6e3', canvas: '#f9f2df', accent: '#268bd2', text: '#073642' },
    editor: { base: 'vs', background: '#fdf6e3', foreground: '#586e75', gutter: '#f5eedb', lineNumber: '#93a1a1', keyword: '859900', number: 'd33682', comment: '93a1a1', string: '2aa198' },
  },
  {
    id: 'blueprint',
    label: 'Blueprint',
    description: 'Engineering-drawing blue with amber highlights.',
    base: 'dark',
    swatch: { app: '#08203a', panel: '#0c2a4a', canvas: '#0b3a68', accent: '#ffd166', text: '#e8f1ff' },
    editor: { base: 'vs-dark', background: '#0b2645', foreground: '#e8f1ff', gutter: '#0b2645', lineNumber: '#5d7fa8', keyword: 'ffd166', number: 'ff9f6e', comment: '7f9ec4', string: '9be7c4' },
  },
  {
    id: 'contrast',
    label: 'High Contrast',
    description: 'Maximum contrast: black, white and yellow for low vision.',
    base: 'dark',
    swatch: { app: '#000000', panel: '#000000', canvas: '#000000', accent: '#ffd400', text: '#ffffff' },
    editor: { base: 'hc-black', background: '#000000', foreground: '#ffffff', gutter: '#000000', lineNumber: '#c8c8c8', keyword: 'ffd400', number: '4dd8ff', comment: '9fff9f', string: 'ffb86b' },
  },
];

export const themeInfo = (id: ThemeId): ThemeInfo => THEMES.find((x) => x.id === id) ?? THEMES[0];

/** The theme to show for a preference ('system' follows the operating system). */
export function resolveTheme(pref: ThemePref, systemDark: boolean): ThemeId {
  if (pref === 'system') return systemDark ? 'dark' : 'light';
  return THEMES.some((x) => x.id === pref) ? pref : 'light';
}

export const systemPrefersDark = (): boolean => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;

/** Applies a theme to the document (tokens via data-theme, native widgets via data-base). */
export function applyTheme(id: ThemeId) {
  const root = document.documentElement;
  root.dataset.theme = id;
  root.dataset.base = themeInfo(id).base;
}
