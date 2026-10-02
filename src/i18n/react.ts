/** React binding: components that show text re-render when the language changes. */
import { Fragment, createElement, type ReactNode } from 'react';
import { useEditor } from '../state/editor';
import { t } from './index';

/** Returns `t`; subscribes the calling component to the interface language. */
export function useT(): typeof t {
  useEditor((s) => s.language);
  return t;
}

/** True while the interface is right-to-left (re-renders on change). */
export function useRtl(): boolean {
  return useEditor((s) => s.language) === 'ar';
}

/**
 * Fills `{name}` placeholders of an already translated sentence with React
 * nodes, e.g. `rich(t('Press {key} to run.'), { key: <kbd>F5</kbd> })`.
 */
export function rich(text: string, nodes: Record<string, ReactNode>): ReactNode {
  const parts = text.split(/\{(\w+)\}/g);
  return parts.map((p, i) => createElement(Fragment, { key: i }, i % 2 ? (nodes[p] ?? `{${p}}`) : p));
}
