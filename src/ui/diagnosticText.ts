/**
 * Problems in the interface's language: each diagnostic code has its message
 * (filled with the values the check found) and a line on how to fix it.
 * Codes without an entry, and compiler or Python errors, keep their text.
 */
import type { Diagnostic } from '../core/circuit/diagnostics';
import { t, type MessageKey } from '../i18n';

type Params = Record<string, string | number>;

interface Entry {
  message?: MessageKey | ((p: Params) => MessageKey);
  fix: MessageKey | ((p: Params) => MessageKey);
}

const TEXT: Record<string, Entry> = {
  'supply-shorted-to-ground': {
    message: 'Short circuit: supply pin {pins} is connected directly to GND (net {net}).',
    fix: 'Remove the wire from the supply to GND: between a supply and GND there must always be a part, for example an LED with its resistor.',
  },
  'supply-conflict': {
    message: 'Supplies with different voltages tied together ({volts}): {pins}.',
    fix: 'Give each supply its own rail and never join 5 V and 3.3 V; only the GND pins are joined.',
  },
  'unknown-component': {
    message: '{label}: component type "{type}" is not installed.',
    fix: 'Install the component package that provides it, or replace the part with one from the library.',
  },
  'required-pin-unconnected': {
    message: '{label} ({name}): {pins} not connected.',
    fix: 'Wire the pins listed (often VCC and GND): the part does not work without them. The Parts guide shows how to connect it.',
  },
  'visual-only': {
    message: '{label} ({name}) is visual-only: it is drawn and wired but not simulated yet.',
    fix: 'Use a simulated part instead (Simulated only in the library shows them), or keep it for the drawing.',
  },
  'model-missing': {
    message: '{label}: simulation model "{model}" is not available; the part is treated as disconnected.',
    fix: 'Update the lab, or the component package that provides this part.',
  },
  'model-error': {
    fix: 'Check the part’s properties. Help › Report a Problem copies the details for a report.',
  },
  oscillation: {
    message: 'The circuit did not settle (digital feedback oscillation?). Results may be inaccurate.',
    fix: 'Look for an output wired back to its own input with nothing in between (a gate’s output to its input, for example) and break that loop.',
  },
  'no-convergence': {
    message: 'The analog solver did not converge for the current circuit state.',
    fix: 'Look for parts joined in an impossible way: two supplies side by side, a short across a supply, or nothing limiting a current.',
  },
  'no-firmware': {
    message: (p) => (p.python ? '{label}: no main.py — add a main.py file to run Python on this board.' : '{label}: no firmware loaded — compile the sketch to run code on this board.'),
    fix: (p) => (p.python ? 'Add main.py with the + next to the code tabs, or start from the Raspberry Pi Pico template.' : 'Press Compile (Ctrl+B) or Run (F5): the sketch is compiled and loaded into the board.'),
  },
  'supply-overcurrent': {
    message: '{label} {pin} supply delivers {ma} mA — more than it can provide (short circuit?).',
    fix: 'Look for a wire from this supply pin straight to GND, or a part that draws too much (a motor needs its own supply and a driver).',
  },
  'floating-input': {
    message: (p) =>
      p.python
        ? '{label} pin {pin} is a floating input: nothing pulls it high or low, so reads are unpredictable. Use Pin.PULL_UP (or Pin.PULL_DOWN) or add a pull-up/pull-down resistor.'
        : '{label} pin {pin} is a floating input: nothing pulls it high or low, so reads are unpredictable. Use INPUT_PULLUP or add a pull-up/pull-down resistor.',
    fix: (p) =>
      p.python
        ? 'For a button to GND, use Pin(…, Pin.IN, Pin.PULL_UP): it reads 1, and 0 while pressed.'
        : 'For a button to GND, use pinMode(pin, INPUT_PULLUP): it reads HIGH, and LOW while pressed.',
  },
  'undefined-logic-level': {
    message: '{label} pin {pin} sits between the logic thresholds (0.3–0.6 Vcc); its digital value is undefined.',
    fix: 'The voltage on this pin is neither clearly low nor clearly high: check the divider or sensor that feeds it, or read it as an analog value.',
  },
  'led-destroyed': {
    message: '{label}: {ma} mA through the LED — a real LED would burn out. Add a series resistor (e.g. 220 Ω).',
    fix: 'Put a resistor in series with the LED (220 Ω to 1 kΩ from 5 V): it limits the current to a few mA.',
  },
  'led-overcurrent': {
    message: '{label}: {ma} mA exceeds the {max} mA rating.',
    fix: 'Use a larger series resistor: R = (supply − LED voltage) / current, e.g. (5 V − 2 V) / 0.01 A = 300 Ω.',
  },
  'led-reverse-voltage': {
    message: '{label}: {v} V reverse bias exceeds the typical 5 V limit (is it inserted backwards?).',
    fix: 'Turn the LED around: the long leg (anode, +) goes toward the positive side, the flat side (cathode, −) toward GND.',
  },
  'resistor-overpower': {
    message: '{label} dissipates {w} W, above its {rating} W rating.',
    fix: 'Use a larger resistance or a resistor rated for more power (P = V² / R).',
  },
  'source-overcurrent': {
    message: '{label} delivers {a} A, above its {limit} A limit (short circuit?).',
    fix: 'Look for a wire from + straight to −, or a part with nothing limiting its current.',
  },
  'diode-overcurrent': {
    message: '{label}: {a} A forward current exceeds its {max} A rating.',
    fix: 'Add a resistor in series, or use a diode rated for more current.',
  },
};

const pick = (v: Entry['message'] | Entry['fix'], p: Params) => (typeof v === 'function' ? v(p) : v);

/** The message in the interface's language, and how to fix it (when the lab knows). */
export function diagnosticText(d: Pick<Diagnostic, 'code' | 'message' | 'params'>): { message: string; fix?: string } {
  const e = TEXT[d.code];
  if (!e) return { message: d.message };
  const p = d.params ?? {};
  const key = pick(e.message, p);
  return { message: key && (d.params || !/\{\w+\}/.test(key)) ? t(key, p) : d.message, fix: t(pick(e.fix, p)!, p) };
}

/** Codes that have a translation (tests check every code the lab produces). */
export const TRANSLATED_CODES = Object.keys(TEXT);
