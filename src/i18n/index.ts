/**
 * Interface language: English or Arabic.
 *
 * English text is the message key and the Arabic catalogue (`ar.ts`) maps it
 * to its translation. `t()` only accepts keys of that catalogue, so a literal
 * UI string without an Arabic translation is a compile error. `{name}`
 * placeholders are filled from `params`.
 *
 * Text that comes from data (part categories, tags, colour names, property
 * labels of component packages) goes through `tr()`, which translates what the
 * data catalogue knows and leaves the rest in English.
 *
 * Numbers keep Latin digits in both languages (`intlLocale()`), as they always
 * have in this application (pin numbers, values and code read the same).
 */
import { AR } from './ar';
import { AR_DATA, EXAMPLES_AR } from './arData';

export type Lang = 'en' | 'ar';
export type MessageKey = keyof typeof AR;
export type Params = Record<string, string | number>;

export const LANGUAGES: { id: Lang; label: string; native: string }[] = [
  { id: 'en', label: 'English', native: 'English' },
  { id: 'ar', label: 'Arabic', native: 'العربية' },
];

let lang: Lang = 'en';

export const getLanguage = (): Lang => lang;
export const isRtl = (): boolean => lang === 'ar';

/** Switches the language of `t()`/`tr()` and the document direction. */
export function setLanguage(next: Lang) {
  lang = next;
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.lang = next;
    root.dir = next === 'ar' ? 'rtl' : 'ltr';
  }
}

/** The operating system's preference: Arabic when it comes first, else English. */
export function detectLanguage(): Lang {
  const langs = typeof navigator === 'undefined' ? [] : (navigator.languages?.length ? navigator.languages : [navigator.language]);
  return langs.find((l) => /^(ar|en)\b/i.test(l))?.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

function fill(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/** Translates a UI string (the English text is the key). */
export function t(key: MessageKey, params?: Params): string {
  return fill(lang === 'ar' ? AR[key] : key, params);
}

const DATA = AR_DATA as Record<string, string>;
const MESSAGES = AR as Record<string, string>;

/** Translates text that comes from data when a translation is known; otherwise returns it unchanged. */
export function tr(text: string, params?: Params): string {
  if (lang === 'ar') {
    const s = DATA[text] ?? MESSAGES[text];
    if (s) return fill(s, params);
  }
  return fill(text, params);
}

/** Title of an example project in the interface language. */
export const exampleTitle = (ex: { id: string; title: string }): string => (lang === 'ar' && EXAMPLES_AR[ex.id]?.title) || ex.title;

/** One-paragraph summary of an example project in the interface language. */
export const exampleSummary = (ex: { id: string; summary: string }): string => (lang === 'ar' && EXAMPLES_AR[ex.id]?.summary) || ex.summary;

/** Locale for `Intl` formatting: Arabic with Latin digits, or US English. */
export const intlLocale = (): string => (lang === 'ar' ? 'ar-u-nu-latn' : 'en-US');

/** "2 hours ago", "yesterday", "قبل ساعتين"… */
export function formatRelative(when: string | number | Date, now = Date.now()): string {
  const ms = new Date(when).getTime();
  if (!Number.isFinite(ms)) return '';
  const s = (ms - now) / 1000;
  const rtf = new Intl.RelativeTimeFormat(intlLocale(), { numeric: 'auto' });
  const abs = Math.abs(s);
  if (abs < 45) return rtf.format(0, 'second');
  if (abs < 45 * 60) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 22 * 3600) return rtf.format(Math.round(s / 3600), 'hour');
  if (abs < 26 * 86400) return rtf.format(Math.round(s / 86400), 'day');
  return new Date(ms).toLocaleDateString(intlLocale(), { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Short date ("Sep 28") in the interface language. */
export const formatShortDate = (when: string | number | Date): string =>
  new Date(when).toLocaleDateString(intlLocale(), { month: 'short', day: 'numeric' });

/** Physical side for a logical one in the current direction ('right' of a panel becomes 'left' in Arabic). */
export function mirrorSide<T extends 'top' | 'right' | 'bottom' | 'left'>(side: T): T {
  if (lang !== 'ar') return side;
  return (side === 'left' ? 'right' : side === 'right' ? 'left' : side) as T;
}
