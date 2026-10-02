/**
 * Problems the interface ran into: errors caught by the error boundaries, and
 * uncaught errors and rejected promises. Kept across restarts (the last few),
 * so that Help › Report a Problem can show and copy them even after a crash.
 */
import { create } from 'zustand';
import { APP_VERSION } from './version';

export interface LoggedError {
  /** ISO time. */
  at: string;
  message: string;
  stack?: string;
  /** Where it happened (an error boundary's area, or 'window'). */
  area: string;
  /** React component stack, for errors caught while drawing. */
  componentStack?: string;
}

const KEY = 'evlab.errors.v1';
const MAX = 30;

function load(): LoggedError[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as LoggedError[]) : [];
    return Array.isArray(list) ? list.slice(-MAX) : [];
  } catch {
    return [];
  }
}

export const useErrorLog = create<{ errors: LoggedError[] }>(() => ({ errors: load() }));

/** Browser noise that is not a problem of the application. */
const BENIGN = [/ResizeObserver loop/i, /^Script error\.?$/];

export function describeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) return { message: `${error.name}: ${error.message}`, stack: error.stack };
  if (typeof error === 'string') return { message: error };
  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}

/** Records a problem. Returns the entry, or null for browser noise. */
export function logError(error: unknown, context: { area?: string; componentStack?: string } = {}): LoggedError | null {
  const { message, stack } = describeError(error);
  if (BENIGN.some((re) => re.test(message))) return null;
  const entry: LoggedError = { at: new Date().toISOString(), message, stack, area: context.area ?? 'window', componentStack: context.componentStack?.trim() || undefined };
  const errors = [...useErrorLog.getState().errors, entry].slice(-MAX);
  useErrorLog.setState({ errors });
  try {
    localStorage.setItem(KEY, JSON.stringify(errors));
  } catch {
    /* storage full or unavailable: kept in memory */
  }
  console.error(`[${entry.area}]`, error);
  return entry;
}

export function clearErrorLog() {
  useErrorLog.setState({ errors: [] });
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Plain-text report: the application, the system and the problems logged (newest last). */
export function errorReport(errors: LoggedError[] = useErrorLog.getState().errors, extra: Record<string, string> = {}): string {
  const lines = [
    `Embedded Systems Virtual Lab ${APP_VERSION}`,
    `Platform: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'}`,
    ...(typeof window !== 'undefined' ? [`Window: ${window.innerWidth}×${window.innerHeight} @ ${window.devicePixelRatio}x`] : []),
    ...Object.entries(extra).map(([k, v]) => `${k}: ${v}`),
    '',
  ];
  if (!errors.length) lines.push('No problems recorded.');
  for (const e of errors) {
    lines.push(`--- ${e.at} [${e.area}]`, e.message);
    if (e.stack) lines.push(e.stack);
    if (e.componentStack) lines.push('Components:', e.componentStack);
    lines.push('');
  }
  return lines.join('\n');
}

/** Records uncaught errors and rejected promises; `onError` hears about each one that was recorded. */
export function installErrorLog(onError?: (entry: LoggedError) => void): () => void {
  const onWindowError = (e: ErrorEvent) => {
    const entry = logError(e.error ?? e.message, { area: 'window' });
    if (entry) onError?.(entry);
  };
  const onRejection = (e: PromiseRejectionEvent) => {
    const entry = logError(e.reason, { area: 'window' });
    if (entry) onError?.(entry);
  };
  window.addEventListener('error', onWindowError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onWindowError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
