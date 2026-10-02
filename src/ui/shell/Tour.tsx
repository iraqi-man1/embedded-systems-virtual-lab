/**
 * First-run tour: a few steps that point at the parts of the window (the
 * library, the canvas, the code, Run, the instruments, the guide, the
 * language), each with a short explanation. It never blocks the lab: a click
 * anywhere else, or Esc, ends it. Help › Take the Tour shows it again.
 */
import { useEffect, useState } from 'react';
import { t, type MessageKey } from '../../i18n';
import { useT } from '../../i18n/react';
import { useEditor } from '../../state/editor';
import { Icon } from '../common/Icon';
import { AnchoredPopover } from '../common/Popover';

interface Step {
  /** What to point at (the first one found); none: the middle of the window. */
  target: string[];
  title: MessageKey;
  text: MessageKey;
  side: 'top' | 'right' | 'bottom' | 'left';
}

const STEPS: Step[] = [
  { target: [], side: 'bottom', title: 'Welcome to the Virtual Lab', text: 'A quick look around: eight short steps. Esc or a click anywhere ends the tour.' },
  { target: ['.left-top'], side: 'right', title: 'Parts', text: 'Drag a part onto the canvas, or double-click the canvas and type its name. The star keeps your favourites at the top.' },
  { target: ['.workspace'], side: 'left', title: 'The canvas', text: 'Click a pin, then another pin, to draw a wire. Drag with the right button to move around and use the wheel to zoom. Double-click a part to change its value.' },
  { target: ['.code-slot'], side: 'left', title: 'The code', text: 'Arduino C++ for the Uno and Nano, MicroPython for the Pico. Snippets inserts ready patterns; drag the tab bar to move the editor anywhere.' },
  { target: ['.toolbar [data-group="sim"]'], side: 'bottom', title: 'Run', text: 'Run (F5) compiles the code and starts the simulation. While it runs, click buttons and turn knobs on the canvas.' },
  { target: ['.dock'], side: 'top', title: 'Instruments', text: 'The serial monitor, plotter, oscilloscope, logic analyzer and multimeter, and Problems with how to fix them.' },
  { target: ['.menu-trigger:last-of-type', '.menubar'], side: 'bottom', title: 'Help', text: 'The Parts guide (F1) explains every part and how to wire it. Rest the mouse on any button to see what it does.' },
  { target: ['.toolbar [data-group="view"]'], side: 'bottom', title: 'Language and look', text: 'Switch between English and العربية, light and dark, at any time. More in Settings (Ctrl+,).' },
];

const finish = () => {
  useEditor.getState().set({ tourStep: null });
  useEditor.getState().setPrefs({ tourDone: true });
};

function rectOf(selectors: string[]): DOMRect | null {
  for (const s of selectors) {
    const r = document.querySelector(s)?.getBoundingClientRect();
    if (r && r.width > 0 && r.height > 0) return r;
  }
  return null;
}

export function Tour() {
  useT();
  const step = useEditor((s) => s.tourStep);
  const [, relayout] = useState(0);

  useEffect(() => {
    if (step === null) return;
    const key = (e: KeyboardEvent) => {
      const cur = useEditor.getState().tourStep;
      if (cur === null) return;
      const next = (d: number) => {
        e.preventDefault();
        e.stopPropagation();
        const n = cur + d;
        if (n >= STEPS.length) finish();
        else useEditor.getState().set({ tourStep: Math.max(0, n) });
      };
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish();
      } else if (e.key === 'Enter' || e.key === 'ArrowRight' || e.key === 'ArrowLeft') next(e.key === 'ArrowLeft' ? -1 : 1);
    };
    const down = (e: PointerEvent) => !(e.target as Element | null)?.closest?.('.tour-callout') && finish();
    const resize = () => relayout((n) => n + 1);
    window.addEventListener('keydown', key, true);
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('resize', resize);
    };
  }, [step]);

  if (step === null) return null;
  const s = STEPS[step];
  const r = rectOf(s.target);
  const anchor = r ? { x: r.left, y: r.top, width: r.width, height: r.height } : { x: window.innerWidth / 2, y: window.innerHeight / 3 };
  const last = step === STEPS.length - 1;
  return (
    <>
      <div className={`tour-shade${r ? '' : ' whole'}`} aria-hidden style={r ? { left: r.left - 4, top: r.top - 4, width: r.width + 8, height: r.height + 8 } : { left: 0, top: 0, width: '100%', height: '100%' }} />
      <AnchoredPopover anchor={anchor} side={r ? s.side : 'bottom'} align="center" sideOffset={12} className="tour-callout">
        <div role="dialog" aria-label={t(s.title)}>
          <div className="tour-head">
            <Icon name="sparkles" size={15} />
            <span className="tour-title">{t(s.title)}</span>
            <span className="tour-count ltr">
              {step + 1}/{STEPS.length}
            </span>
          </div>
          <p className="tour-text">{t(s.text)}</p>
          <div className="tour-foot">
            <button className="btn ghost" onClick={finish}>
              {t('Skip')}
            </button>
            <span className="spacer" />
            {step > 0 && (
              <button className="btn" onClick={() => useEditor.getState().set({ tourStep: step - 1 })}>
                {t('Back')}
              </button>
            )}
            <button className="btn primary" autoFocus onClick={() => (last ? finish() : useEditor.getState().set({ tourStep: step + 1 }))}>
              {last ? t('Start') : t('Next')}
            </button>
          </div>
        </div>
      </AnchoredPopover>
    </>
  );
}

/** Starts the tour once, the first time the editor is shown (not over a page or a dialog). */
export function installTourStart(): () => void {
  let timer: number | undefined;
  const check = () => {
    const s = useEditor.getState();
    if (s.tourDone || s.tourStep !== null || s.page || s.dialog) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const now = useEditor.getState();
      if (!now.tourDone && now.tourStep === null && !now.page && !now.dialog) now.set({ tourStep: 0 });
    }, 700);
  };
  check();
  const off = useEditor.subscribe((s, prev) => (s.page !== prev.page || s.dialog !== prev.dialog) && check());
  return () => {
    window.clearTimeout(timer);
    off();
  };
}
