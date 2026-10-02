/** Resistor colour code (IEC 60062): the bands printed on a resistor of a given value. */

export interface Band {
  /** English colour name, lower case (also the translation key). */
  name: 'black' | 'brown' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'violet' | 'grey' | 'white' | 'gold' | 'silver';
  css: string;
}

const DIGITS: Band[] = [
  { name: 'black', css: '#1b1b1b' },
  { name: 'brown', css: '#7b4a26' },
  { name: 'red', css: '#d32f2f' },
  { name: 'orange', css: '#f57c00' },
  { name: 'yellow', css: '#fbc02d' },
  { name: 'green', css: '#2e7d32' },
  { name: 'blue', css: '#1565c0' },
  { name: 'violet', css: '#7b1fa2' },
  { name: 'grey', css: '#8a8a8a' },
  { name: 'white', css: '#f5f5f5' },
];
const GOLD: Band = { name: 'gold', css: '#c9a227' };
const SILVER: Band = { name: 'silver', css: '#b8bcc2' };

/** Multiplier band for 10^exp (−2 … 9). */
function multiplier(exp: number): Band | null {
  if (exp === -1) return GOLD;
  if (exp === -2) return SILVER;
  return exp >= 0 && exp <= 9 ? DIGITS[exp] : null;
}

const exact = (a: number, b: number) => Math.abs(a - b) <= Math.abs(b) * 1e-9;

/**
 * The bands for `ohms`: four (two digits, multiplier, gold 5 % tolerance)
 * when two digits express it exactly, else five (three digits, multiplier,
 * brown 1 %). Null for values no colour code can show.
 */
export function resistorBands(ohms: number): Band[] | null {
  if (!Number.isFinite(ohms) || ohms <= 0) return null;
  for (const count of [2, 3]) {
    const exp = Math.floor(Math.log10(ohms)) - (count - 1);
    const digits = Math.round(ohms / 10 ** exp);
    // Rounding can carry into one more digit (e.g. 999.99 → 1000).
    if (String(digits).length !== count || !exact(digits * 10 ** exp, ohms)) continue;
    const mult = multiplier(exp);
    if (!mult) return null;
    return [...String(digits)].map((d) => DIGITS[Number(d)]).concat(mult, count === 2 ? GOLD : DIGITS[1]);
  }
  return null;
}
