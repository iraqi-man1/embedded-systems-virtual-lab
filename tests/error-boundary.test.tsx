// @vitest-environment happy-dom
/**
 * A part of the interface that fails while drawing shows a message in its own
 * place (the rest keeps working) instead of leaving the window empty, and the
 * failure is recorded for Help › Report a Problem.
 */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearErrorLog, errorReport, installErrorLog, logError, useErrorLog } from '../src/app/errorLog';
import { ErrorBoundary } from '../src/ui/common/ErrorBoundary';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let fail = true;
function Fragile({ label }: { label: string }) {
  if (fail) throw new Error(`broken ${label}`);
  return <p className="fine">{label} works</p>;
}

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  fail = true;
  clearErrorLog();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  // React reports caught errors on the console; keep the test output clean.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe('error boundaries', () => {
  it('keep the rest of the window when one panel fails', () => {
    act(() =>
      root.render(
        <div>
          <header className="menubar">menus</header>
          <ErrorBoundary area="Canvas">
            <Fragile label="canvas" />
          </ErrorBoundary>
        </div>,
      ),
    );
    expect(host.querySelector('.menubar')?.textContent).toBe('menus');
    const crash = host.querySelector('[role="alert"]');
    expect(crash?.textContent).toContain('Canvas ran into a problem');
    expect(crash?.textContent).toContain('Try again');
    expect(useErrorLog.getState().errors.at(-1)).toMatchObject({ area: 'Canvas', message: 'Error: broken canvas' });
    expect(useErrorLog.getState().errors.at(-1)?.componentStack).toContain('Fragile');
  });

  it('try again draws the panel once more', () => {
    act(() =>
      root.render(
        <ErrorBoundary area="Code editor">
          <Fragile label="editor" />
        </ErrorBoundary>,
      ),
    );
    fail = false;
    const retry = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Try again'))!;
    act(() => retry.click());
    expect(host.querySelector('.fine')?.textContent).toBe('editor works');
  });

  it('a page offers the way back, and a new key clears the error', () => {
    const back = vi.fn();
    function Page() {
      const [key, setKey] = useState('a');
      return (
        <>
          <button className="other" onClick={() => setKey('b')}>
            other part
          </button>
          <ErrorBoundary area="Parts guide" variant="page" resetKey={key} onBack={back}>
            <Fragile label={key} />
          </ErrorBoundary>
        </>
      );
    }
    act(() => root.render(<Page />));
    const toEditor = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Back to the editor'))!;
    act(() => toEditor.click());
    expect(back).toHaveBeenCalledOnce();
    fail = false;
    act(() => host.querySelector<HTMLButtonElement>('.other')!.click());
    expect(host.querySelector('.fine')?.textContent).toBe('b works');
  });

  it('silent boundaries draw nothing and let the caller tidy up', () => {
    const tidy = vi.fn();
    act(() =>
      root.render(
        <div className="app">
          <ErrorBoundary area="Dialog" variant="silent" onError={tidy}>
            <Fragile label="dialog" />
          </ErrorBoundary>
        </div>,
      ),
    );
    expect(host.querySelector('.app')?.childElementCount).toBe(0);
    expect(tidy).toHaveBeenCalledOnce();
  });
});

describe('error log', () => {
  it('records window errors and rejected promises, not browser noise', () => {
    const heard = vi.fn();
    const off = installErrorLog(heard);
    window.dispatchEvent(new ErrorEvent('error', { error: new TypeError('x is undefined'), message: 'x is undefined' }));
    window.dispatchEvent(new ErrorEvent('error', { message: 'ResizeObserver loop completed with undelivered notifications.' }));
    off();
    expect(heard).toHaveBeenCalledOnce();
    expect(useErrorLog.getState().errors.map((e) => e.message)).toEqual(['TypeError: x is undefined']);
  });

  it('keeps the last 30 problems across restarts', () => {
    for (let i = 0; i < 40; i++) logError(new Error(`n${i}`));
    expect(useErrorLog.getState().errors).toHaveLength(30);
    const saved = JSON.parse(localStorage.getItem('evlab.errors.v1')!);
    expect(saved[0].message).toBe('Error: n10');
  });

  it('writes a report with the version, the system and each problem', () => {
    logError(new Error('boom'), { area: 'Parts guide', componentStack: '\n    at PartPage' });
    const text = errorReport(undefined, { Language: 'ar' });
    expect(text).toMatch(/^Embedded Systems Virtual Lab \d+\.\d+\.\d+/);
    expect(text).toContain('Language: ar');
    expect(text).toContain('[Parts guide]');
    expect(text).toContain('Error: boom');
    expect(text).toContain('at PartPage');
  });
});
