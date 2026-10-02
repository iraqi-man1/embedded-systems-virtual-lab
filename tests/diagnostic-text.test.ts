/**
 * Problems in the interface's language: every code the lab produces has a
 * translation and a fix; filled with the values the check found, the English
 * template gives back the original message, and the Arabic one has no
 * placeholder left.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Diagnostic } from '../src/core/circuit/diagnostics';
import { runStaticErc } from '../src/core/circuit/erc';
import { buildNetlist } from '../src/core/circuit/netlist';
import { setLanguage } from '../src/i18n';
import { diagnosticText, TRANSLATED_CODES } from '../src/ui/diagnosticText';
import { CircuitBuilder, lookup, simulate } from './helpers';

afterEach(() => setLanguage('en'));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.ts$/.test(name) ? [p] : [];
  });
}

/** Diagnostics from a few faulty circuits (simulation and circuit checks). */
function produced(): Diagnostic[] {
  const out: Diagnostic[] = [];
  // An LED without a resistor on 9 V, a reversed LED, a resistor over its power, a shorted battery.
  {
    const b = new CircuitBuilder();
    const bat = b.add('evlab.battery-9v', 0, 0);
    const led = b.add('evlab.led', 200, 0);
    b.wire(bat, '+', led, 'A');
    b.wire(led, 'C', bat, '-');
    const rev = b.add('evlab.led', 300, 0);
    b.wire(bat, '+', rev, 'C');
    b.wire(rev, 'A', bat, '-');
    const bat2 = b.add('evlab.battery-9v', 0, 300);
    const r = b.add('evlab.resistor', 200, 300, { resistance: '10' });
    b.wire(bat2, '+', r, '1');
    b.wire(r, '2', bat2, '-');
    const h = simulate(b, {});
    h.run(0.2);
    out.push(...(h.diagnostics() as Diagnostic[]));
  }
  // Circuit checks: 5 V to GND, 5 V to 3.3 V, a module with only one wire, a visual-only part, an unknown part.
  {
    const b = new CircuitBuilder();
    const uno = b.add('evlab.arduino-uno', 0, 0);
    const uno2 = b.add('evlab.arduino-uno', 0, 400);
    b.wire(uno, '5V', uno, 'GND.1');
    b.wire(uno2, '5V', uno2, '3.3V');
    const lcd = b.add('evlab.lcd1602-i2c', 400, 0);
    b.wire(lcd, 'SDA', uno, 'A4');
    const esp = b.add('evlab.esp32-devkit-v1', 400, 300);
    b.wire(esp, 'GND.1', uno, 'GND.2');
    b.doc.components.push({ id: 'x1', type: 'vendor.flux-capacitor', x: 0, y: 0, rotation: 0, label: 'X1', props: {} });
    out.push(...runStaticErc(b.doc, buildNetlist(b.doc, lookup), lookup));
  }
  return out;
}

describe('diagnostics in the interface language', () => {
  it('cover every code the lab can produce', () => {
    const codes = new Set<string>();
    for (const f of sources(join(__dirname, '..', 'src', 'core'))) {
      for (const m of readFileSync(f, 'utf8').matchAll(/code: '([a-z0-9-]+)'/g)) codes.add(m[1]);
    }
    expect(codes.size).toBeGreaterThan(15);
    expect([...codes].filter((c) => !TRANSLATED_CODES.includes(c))).toEqual([]);
  });

  it('give back the original message in English, and a full one in Arabic', () => {
    const list = produced();
    const seen = new Set(list.map((d) => d.code));
    for (const code of ['led-destroyed', 'led-reverse-voltage', 'resistor-overpower', 'supply-shorted-to-ground', 'supply-conflict', 'required-pin-unconnected', 'visual-only', 'unknown-component']) {
      expect(seen, code).toContain(code);
    }
    for (const d of list) {
      setLanguage('en');
      const en = diagnosticText(d);
      expect(en.message, d.code).toBe(d.message);
      expect(en.fix, d.code).toBeTruthy();
      setLanguage('ar');
      const ar = diagnosticText(d);
      expect(ar.message, d.code).not.toBe(d.message);
      expect(ar.message, d.code).not.toMatch(/\{\w+\}/);
      expect(ar.fix, d.code).toMatch(/[؀-ۿ]/);
    }
  });

  it('keep the text of messages the lab does not know (compiler, Python)', () => {
    setLanguage('ar');
    expect(diagnosticText({ code: 'gcc', message: "'x' was not declared in this scope" })).toEqual({ message: "'x' was not declared in this scope" });
  });
});
