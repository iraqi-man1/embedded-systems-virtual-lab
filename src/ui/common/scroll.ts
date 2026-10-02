/**
 * Scrolling that stays inside the panels. The window itself never scrolls:
 * a scroll of the page, its body or the app frame would shift the whole
 * interface out of the window and leave it looking empty.
 */

/** Scrollable boxes that make up the window frame (never scrolled). */
function isFrame(el: Element | null): boolean {
  return !!el && (el === document.scrollingElement || el === document.documentElement || el === document.body || el.id === 'root' || el.classList.contains('app'));
}

/** Puts back any scroll of the window frame, whatever caused it. */
export function pinWindowScroll(): () => void {
  const onScroll = (e: Event) => {
    const el = e.target === document ? document.scrollingElement : (e.target as Element);
    if (el && isFrame(el) && (el.scrollTop || el.scrollLeft)) {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    }
  };
  document.addEventListener('scroll', onScroll, true);
  return () => document.removeEventListener('scroll', onScroll, true);
}

/** Nearest ancestor that scrolls vertically. */
function scroller(el: HTMLElement): HTMLElement | null {
  for (let box = el.parentElement; box && !isFrame(box); box = box.parentElement) {
    if (box.scrollHeight > box.clientHeight && /(auto|scroll)/.test(getComputedStyle(box).overflowY)) return box;
  }
  return null;
}

/**
 * Brings `el` into view inside its own scrolling list only (scrollIntoView
 * may also scroll the boxes around the list, the window included).
 */
export function revealInList(el: HTMLElement | null) {
  if (!el) return;
  const box = scroller(el);
  if (!box) return;
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  if (r.top < b.top) box.scrollTop -= b.top - r.top;
  else if (r.bottom > b.bottom) box.scrollTop += Math.min(r.bottom - b.bottom, r.top - b.top);
}
