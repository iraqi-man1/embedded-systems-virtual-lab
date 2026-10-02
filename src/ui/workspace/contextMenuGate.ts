/**
 * Right mouse button on the canvas: dragging pans the view, a click opens the
 * context menu. Browsers fire `contextmenu` at different moments — Windows
 * after the button is released, Linux and macOS when it is pressed — so the
 * gate decides from the gesture instead of the event order:
 *
 *  - press, move past the threshold → a pan; no menu appears;
 *  - press and release in place      → the menu opens. An event that arrived
 *    while the button was still down (Linux/macOS) is held back and handed
 *    out by `up()` so the caller can replay it at release.
 *
 * Pure state (no DOM), so every platform's event order can be unit tested.
 */

/** A `contextmenu` event held back until the button is released. */
export interface HeldMenu {
  target: EventTarget | null;
  x: number;
  y: number;
}

interface Press {
  x: number;
  y: number;
  moved: boolean;
  held: HeldMenu | null;
}

export class ContextMenuGate {
  private press: Press | null = null;
  /** After a drag on Windows the menu event is still to come: swallow it until then. */
  private swallowUntil = -Infinity;
  /** True while the caller replays a held-back event (it must pass). */
  replaying = false;

  constructor(
    private readonly threshold = 4,
    private readonly swallowMs = 400,
  ) {}

  /** Right button pressed at client position (x, y). */
  down(x: number, y: number) {
    this.press = { x, y, moved: false, held: null };
    this.swallowUntil = -Infinity;
  }

  /** Pointer moved with the button held. Returns true once the gesture is a drag. */
  move(x: number, y: number): boolean {
    const p = this.press;
    if (!p) return false;
    if (!p.moved && Math.hypot(x - p.x, y - p.y) > this.threshold) p.moved = true;
    return p.moved;
  }

  /** The button is held and the gesture became a drag. */
  get dragging(): boolean {
    return !!this.press?.moved;
  }

  /**
   * Button released at time `now` (ms). Returns the held-back menu event to
   * replay when the gesture was a click on a platform that fired it early.
   */
  up(now: number): HeldMenu | null {
    const p = this.press;
    this.press = null;
    if (!p) return null;
    if (p.moved) {
      // Windows fires the menu right after this release: drop it.
      if (!p.held) this.swallowUntil = now + this.swallowMs;
      return null;
    }
    return p.held;
  }

  /** The gesture was interrupted (pointer cancelled): no menu, no swallowing. */
  cancel() {
    this.press = null;
  }

  /** A `contextmenu` event arrived at time `now`. True lets it open the menu. */
  contextMenu(now: number, menu: HeldMenu): boolean {
    if (this.replaying) return true;
    if (this.press) {
      // Fired on press (Linux/macOS): decide when the button comes up.
      if (!this.press.held) this.press.held = menu;
      return false;
    }
    if (now < this.swallowUntil) {
      this.swallowUntil = -Infinity;
      return false;
    }
    return true;
  }
}
