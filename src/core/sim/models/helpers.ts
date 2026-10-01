/** Shared helpers for digital/mixed-signal device models. */
import type { SolveResult, StampCollector } from '../analog/solver';
import type { ModelContext } from '../model';

/** Supply state of a device from its VCC/GND pins. */
export function supply(ctx: ModelContext, v: Float64Array, vccPin = 'VCC', gndPin = 'GND') {
  const vcc = ctx.net(vccPin);
  const gnd = ctx.net(gndPin);
  if (vcc < 0 || gnd < 0 || !ctx.isDriven(vcc) || !ctx.isDriven(gnd)) return { powered: false, volts: 0, gnd };
  const volts = v[vcc] - v[gnd];
  return { powered: volts > 2.0, volts, gnd };
}

/**
 * Schmitt-trigger input with memory. Floating inputs keep their previous
 * level (CMOS inputs really do hold charge for a while).
 */
export class DigitalInput {
  level = false;
  constructor(
    private ctx: ModelContext,
    readonly pin: string,
  ) {}
  /** Updates and returns { level, changed, rising, falling }. */
  sample(v: Float64Array, gnd: number, vcc: number) {
    const n = this.ctx.net(this.pin);
    const prev = this.level;
    if (n >= 0 && this.ctx.isDriven(n)) {
      const volts = v[n] - (gnd >= 0 ? v[gnd] : 0);
      if (volts >= 0.6 * vcc) this.level = true;
      else if (volts <= 0.3 * vcc) this.level = false;
    }
    return { level: this.level, changed: prev !== this.level, rising: !prev && this.level, falling: prev && !this.level };
  }
}

/** Push-pull output stage stamped as a Thevenin source to the device ground. */
export function driveOutput(s: StampCollector, ctx: ModelContext, pin: string, high: boolean, vcc: number, gndNet: number, rOut = 50) {
  const n = ctx.net(pin);
  if (n < 0 || gndNet < 0) return;
  if (high) s.voltageSource(n, gndNet, vcc, rOut);
  else s.resistor(n, gndNet, rOut);
}

export const isDriven = (r: SolveResult, n: number) => n >= 0 && r.island[n] >= 0 && r.islandDriven[r.island[n]];
