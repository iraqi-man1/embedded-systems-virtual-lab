/** Content of the parts guide: what a part is, what it is for and how to wire it. */

/** The same text in English and Arabic. */
export type L = readonly [en: string, ar: string];

/** Suggested board pin for an Arduino Uno and a Raspberry Pi Pico. */
export type BoardPins = readonly [uno: string, pico: string];

export interface GuideEntry {
  /** Arabic name; the English name is the part's own name. */
  ar: string;
  /** What the part is, in a sentence or two. */
  what: L;
  /** What it is used for. */
  uses: L[];
  /** How to connect it, in order. */
  steps?: L[];
  /** Tips and common mistakes. */
  tips?: L[];
  /** A short example program (Arduino C++, or MicroPython for the Pico). */
  code?: string;
  /**
   * What each pin does, by pin id or by the shared name of numbered pins
   * ("GND" for GND.1 and GND.2).
   */
  pins?: Record<string, L>;
  /**
   * Suggested connection to an Arduino Uno and a Raspberry Pi Pico, keyed like
   * `pins`. Pins left out get a suggestion from their role (GND, SDA…);
   * `null` hides the board columns (parts that are not wired to a board).
   */
  board?: Record<string, BoardPins> | null;
}
