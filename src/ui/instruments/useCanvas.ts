import { useEffect, useRef } from 'react';

/**
 * Runs `draw` on an animation-frame loop for a HiDPI canvas. `key()` returns
 * a change token; drawing is skipped while neither it nor the size changes.
 */
export function useCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, key: () => unknown) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  const keyRef = useRef(key);
  drawRef.current = draw;
  keyRef.current = key;
  useEffect(() => {
    let raf = 0;
    let lastKey: unknown = Symbol();
    let lastW = 0;
    let lastH = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const c = ref.current;
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth;
      const h = c.clientHeight;
      const k = keyRef.current();
      if (w === lastW && h === lastH && k === lastKey) return;
      lastW = w;
      lastH = h;
      lastKey = k;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      const ctx = c.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawRef.current(ctx, w, h);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return ref;
}

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function formatTime(s: number): string {
  const a = Math.abs(s);
  if (a === 0) return '0';
  if (a < 1e-6) return `${(s * 1e9).toFixed(0)} ns`;
  if (a < 1e-3) return `${+(s * 1e6).toFixed(1)} µs`;
  if (a < 1) return `${+(s * 1e3).toFixed(2)} ms`;
  return `${+s.toFixed(3)} s`;
}

export const TIME_DIVS = [1e-6, 2e-6, 5e-6, 1e-5, 2e-5, 5e-5, 1e-4, 2e-4, 5e-4, 1e-3, 2e-3, 5e-3, 1e-2, 2e-2, 5e-2, 0.1, 0.2, 0.5, 1];
