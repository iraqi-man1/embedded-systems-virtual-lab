/** Behaviour models for basic passive, interactive and source components. */
import type { Diagnostic } from '../../circuit/diagnostics';
import type { PropValue } from '../../model/circuit';
import { parseEngineering } from '../../model/units';
import { diodeCurrent, type PwlDiode, type StampCollector } from '../analog/solver';
import { numProp, registerModel, type ModelContext, type SimModel } from '../model';

function engProp(ctx: ModelContext, key: string, fallback: number): number {
  const v = parseEngineering(String(ctx.setup.props[key] ?? fallback));
  return isFinite(v) && v > 0 ? v : fallback;
}

// ------------------------------------------------------------------ connector
/** Pure connectivity (breadboards, headers): no electrical element. */
registerModel('connector', (ctx) => ({ ctx, stamp() {} }));

// ------------------------------------------------------------------- resistor
class ResistorModel implements SimModel {
  private energy = 0;
  private window = 0;
  private avgPower = 0;
  constructor(readonly ctx: ModelContext) {}
  get ohms() {
    return engProp(this.ctx, 'resistance', 1000);
  }
  stamp(s: StampCollector) {
    s.resistor(this.ctx.net('1'), this.ctx.net('2'), this.ohms);
  }
  integrate(dt: number, v: Float64Array) {
    const a = this.ctx.net('1');
    const b = this.ctx.net('2');
    if (a < 0 || b < 0) return;
    const dv = v[a] - v[b];
    this.energy += ((dv * dv) / this.ohms) * dt;
    this.window += dt;
  }
  setProp() {
    this.ctx.solveNow([this.ctx.net('1'), this.ctx.net('2')]);
  }
  visualState() {
    if (this.window > 0) this.avgPower = this.energy / this.window;
    this.energy = 0;
    this.window = 0;
    return undefined;
  }
  diagnostics(): Diagnostic[] {
    const rating = numProp(this.ctx, 'power', 0.25);
    if (this.avgPower <= rating) return [];
    return [
      {
        code: 'resistor-overpower',
        severity: this.avgPower > 2 * rating ? 'error' : 'warning',
        message: `${this.ctx.setup.label} dissipates ${this.avgPower.toFixed(2)} W, above its ${rating} W rating.`,
        componentIds: [this.ctx.setup.id],
        source: 'simulation',
      },
    ];
  }
}
registerModel('resistor', (ctx) => new ResistorModel(ctx));

// ------------------------------------------------------------------------ LED
/** Forward voltage at 20 mA by colour (typical 5 mm LEDs). */
const LED_VF: Record<string, number> = {
  red: 2.0,
  orange: 2.0,
  yellow: 2.1,
  green: 2.2,
  blue: 3.1,
  white: 3.1,
  purple: 3.2,
};
const LED_R_ON = 15;

/** Single LED junction with time-averaged current for PWM brightness. */
class LedJunction {
  readonly d: PwlDiode;
  private charge = 0;
  private window = 0;
  avg = 0;
  peakReverse = 0;
  constructor(vf: number) {
    this.d = { anode: -1, cathode: -1, vOn: vf - 0.02 * LED_R_ON, rOn: LED_R_ON, gOff: 1e-9, on: false };
  }
  setVf(vf: number) {
    this.d.vOn = vf - 0.02 * LED_R_ON;
  }
  integrate(dt: number, v: Float64Array) {
    if (this.d.anode < 0 || this.d.cathode < 0) return;
    const i = diodeCurrent(this.d, v);
    this.charge += Math.max(0, i) * dt;
    this.window += dt;
    const vr = v[this.d.cathode] - v[this.d.anode];
    if (vr > this.peakReverse) this.peakReverse = vr;
  }
  /** Average current over the frame, then reset. */
  sample(): number {
    if (this.window > 0) this.avg = this.charge / this.window;
    this.charge = 0;
    this.window = 0;
    return this.avg;
  }
}

/** Perceived brightness: full at ~10 mA. */
const brightnessOf = (i: number) => Math.max(0, Math.min(1, i / 0.01));

function ledDiagnostics(ctx: ModelContext, junctions: LedJunction[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  const maxContinuous = numProp(ctx, 'maxCurrent', 0.02);
  for (const j of junctions) {
    if (j.avg > 2.5 * maxContinuous) {
      out.push({
        code: 'led-destroyed',
        severity: 'error',
        message: `${ctx.setup.label}: ${(j.avg * 1000).toFixed(0)} mA through the LED — a real LED would burn out. Add a series resistor (e.g. 220 Ω).`,
        componentIds: [ctx.setup.id],
        source: 'simulation',
      });
    } else if (j.avg > 1.25 * maxContinuous) {
      out.push({
        code: 'led-overcurrent',
        severity: 'warning',
        message: `${ctx.setup.label}: ${(j.avg * 1000).toFixed(0)} mA exceeds the ${(maxContinuous * 1000).toFixed(0)} mA rating.`,
        componentIds: [ctx.setup.id],
        source: 'simulation',
      });
    }
    if (j.peakReverse > 5) {
      out.push({
        code: 'led-reverse-voltage',
        severity: 'warning',
        message: `${ctx.setup.label}: ${j.peakReverse.toFixed(1)} V reverse bias exceeds the typical 5 V limit (is it inserted backwards?).`,
        componentIds: [ctx.setup.id],
        source: 'simulation',
      });
    }
  }
  return out;
}

class LedModel implements SimModel {
  private j: LedJunction;
  constructor(readonly ctx: ModelContext) {
    this.j = new LedJunction(this.vf());
  }
  private vf() {
    const explicit = numProp(this.ctx, 'vf', 0);
    return explicit > 0 ? explicit : (LED_VF[String(this.ctx.setup.props.color ?? 'red')] ?? 2.0);
  }
  stamp(s: StampCollector) {
    this.j.d.anode = this.ctx.net('A');
    this.j.d.cathode = this.ctx.net('C');
    s.diode(this.j.d);
  }
  integrate(dt: number, v: Float64Array) {
    this.j.integrate(dt, v);
  }
  setProp() {
    this.j.setVf(this.vf());
    this.ctx.solveNow([this.ctx.net('A'), this.ctx.net('C')]);
  }
  visualState() {
    const b = brightnessOf(this.j.sample());
    return { value: b > 0.005, brightness: Math.max(b, b > 0.005 ? 0.08 : 0) };
  }
  diagnostics() {
    return ledDiagnostics(this.ctx, [this.j]);
  }
}
registerModel('led', (ctx) => new LedModel(ctx));

/** RGB LED: three junctions sharing a common cathode or anode. */
class RgbLedModel implements SimModel {
  private j = { R: new LedJunction(2.0), G: new LedJunction(3.0), B: new LedJunction(3.1) };
  constructor(readonly ctx: ModelContext) {}
  private get commonAnode() {
    return this.ctx.setup.props.common === 'anode';
  }
  stamp(s: StampCollector) {
    const com = this.ctx.net('COM');
    for (const c of ['R', 'G', 'B'] as const) {
      const n = this.ctx.net(c);
      const d = this.j[c].d;
      d.anode = this.commonAnode ? com : n;
      d.cathode = this.commonAnode ? n : com;
      s.diode(d);
    }
  }
  integrate(dt: number, v: Float64Array) {
    for (const j of Object.values(this.j)) j.integrate(dt, v);
  }
  visualState() {
    return {
      ledRed: brightnessOf(this.j.R.sample()),
      ledGreen: brightnessOf(this.j.G.sample()),
      ledBlue: brightnessOf(this.j.B.sample()),
    };
  }
  diagnostics() {
    return ledDiagnostics(this.ctx, Object.values(this.j));
  }
}
registerModel('rgb-led', (ctx) => new RgbLedModel(ctx));

// ----------------------------------------------------------------- pushbutton
/** Momentary switch: pins in group 1 connect to group 2 while pressed. */
class PushbuttonModel implements SimModel {
  private pressed = false;
  private pressedAt = 0;
  private releaseScheduled = false;
  /** A human press closes the contact for at least this long (simulation time). */
  private static readonly MIN_PRESS = 0.03;
  constructor(readonly ctx: ModelContext) {}
  private nets() {
    const a = this.ctx.net(String(this.ctx.setup.props.pinA ?? '1.l'));
    const b = this.ctx.net(String(this.ctx.setup.props.pinB ?? '2.l'));
    return [a, b];
  }
  stamp(s: StampCollector) {
    if (!this.pressed) return;
    const [a, b] = this.nets();
    s.resistor(a, b, 0.05);
  }
  onInput(key: string, value: PropValue) {
    if (key !== 'pressed') return;
    const p = !!value;
    if (p) {
      this.releaseScheduled = false;
      if (this.pressed) return;
      this.pressed = true;
      this.pressedAt = this.ctx.now();
      this.ctx.solveNow(this.nets());
      return;
    }
    if (!this.pressed || this.releaseScheduled) return;
    const held = this.ctx.now() - this.pressedAt;
    if (held < PushbuttonModel.MIN_PRESS) {
      // A quick click still produces a press the firmware can observe.
      this.releaseScheduled = true;
      this.ctx.schedule(PushbuttonModel.MIN_PRESS - held, () => {
        if (!this.releaseScheduled) return;
        this.releaseScheduled = false;
        this.pressed = false;
        this.ctx.solveNow(this.nets());
      });
      return;
    }
    this.pressed = false;
    this.ctx.solveNow(this.nets());
  }
  reset() {
    // physical button state survives an MCU reset
  }
  visualState() {
    return { pressed: this.pressed };
  }
}
registerModel('pushbutton', (ctx) => new PushbuttonModel(ctx));

// --------------------------------------------------------------- slide switch
/** SPDT: common pin "2" connects to "1" (position 0) or "3" (position 1). */
class SlideSwitchModel implements SimModel {
  private pos: number;
  constructor(readonly ctx: ModelContext) {
    this.pos = Number(ctx.setup.props.position ?? 0) ? 1 : 0;
  }
  stamp(s: StampCollector) {
    s.resistor(this.ctx.net('2'), this.ctx.net(this.pos ? '3' : '1'), 0.05);
  }
  onInput(key: string, value: PropValue) {
    if (key !== 'toggle' && key !== 'position') return;
    this.pos = key === 'toggle' ? 1 - this.pos : Number(value) ? 1 : 0;
    this.ctx.solveNow([this.ctx.net('1'), this.ctx.net('2'), this.ctx.net('3')]);
  }
  visualState() {
    return { value: this.pos };
  }
}
registerModel('slide-switch', (ctx) => new SlideSwitchModel(ctx));

// -------------------------------------------------------------- potentiometer
/** Three-terminal pot: wiper position p ∈ [0,1], 0 = at GND end. */
class PotentiometerModel implements SimModel {
  private p: number;
  constructor(readonly ctx: ModelContext) {
    this.p = Math.max(0, Math.min(1, numProp(ctx, 'position', 0.5)));
  }
  private get total() {
    return engProp(this.ctx, 'resistance', 10_000);
  }
  stamp(s: StampCollector) {
    const r = this.total;
    const end1 = this.ctx.net(String(this.ctx.setup.props.pinLow ?? 'GND'));
    const end2 = this.ctx.net(String(this.ctx.setup.props.pinHigh ?? 'VCC'));
    const wiper = this.ctx.net('SIG');
    s.resistor(end1, wiper, Math.max(r * this.p, 0.5));
    s.resistor(wiper, end2, Math.max(r * (1 - this.p), 0.5));
  }
  private changed() {
    this.ctx.solveNow([this.ctx.net('SIG')]);
  }
  onInput(key: string, value: PropValue) {
    if (key !== 'value' && key !== 'position') return;
    this.p = Math.max(0, Math.min(1, Number(value)));
    this.changed();
  }
  setProp(key: string, value: PropValue) {
    if (key === 'position') this.p = Math.max(0, Math.min(1, Number(value)));
    this.changed();
  }
  visualState() {
    return { value: this.p };
  }
}
registerModel('potentiometer', (ctx) => new PotentiometerModel(ctx));

// ---------------------------------------------------------- light-dependent R
/** LDR between "1" and "2": R = R10 · (lux/10)^(−γ). */
class PhotoresistorModel implements SimModel {
  constructor(readonly ctx: ModelContext) {}
  private ohms() {
    const lux = Math.max(0.01, numProp(this.ctx, 'lux', 500));
    const r10 = engProp(this.ctx, 'r10', 20_000);
    const gamma = numProp(this.ctx, 'gamma', 0.7);
    return r10 * Math.pow(lux / 10, -gamma);
  }
  stamp(s: StampCollector) {
    s.resistor(this.ctx.net('1'), this.ctx.net('2'), this.ohms());
  }
  setProp() {
    this.ctx.solveNow([this.ctx.net('1'), this.ctx.net('2')]);
  }
}
registerModel('photoresistor', (ctx) => new PhotoresistorModel(ctx));

// ------------------------------------------------------------ NTC thermistor
/** NTC between "1" and "2" using the β-model. */
class NtcModel implements SimModel {
  constructor(readonly ctx: ModelContext) {}
  private ohms() {
    const t = numProp(this.ctx, 'temperature', 25) + 273.15;
    const r25 = engProp(this.ctx, 'r25', 10_000);
    const beta = numProp(this.ctx, 'beta', 3950);
    return r25 * Math.exp(beta * (1 / t - 1 / 298.15));
  }
  stamp(s: StampCollector) {
    s.resistor(this.ctx.net('1'), this.ctx.net('2'), this.ohms());
  }
  setProp() {
    this.ctx.solveNow([this.ctx.net('1'), this.ctx.net('2')]);
  }
}
registerModel('ntc', (ctx) => new NtcModel(ctx));

// --------------------------------------------------------------------- source
/** DC voltage source between "+" and "−" with internal resistance. */
class DcSourceModel implements SimModel {
  private charge = 0;
  private window = 0;
  private avgI = 0;
  constructor(readonly ctx: ModelContext) {}
  private get volts() {
    return numProp(this.ctx, 'voltage', 9);
  }
  private get rInt() {
    return Math.max(1e-3, numProp(this.ctx, 'rInternal', 0.5));
  }
  stamp(s: StampCollector) {
    s.voltageSource(this.ctx.net('+'), this.ctx.net('-'), this.volts, this.rInt);
  }
  integrate(dt: number, v: Float64Array) {
    const p = this.ctx.net('+');
    const n = this.ctx.net('-');
    if (p < 0 || n < 0) return;
    this.charge += Math.abs((this.volts - (v[p] - v[n])) / this.rInt) * dt;
    this.window += dt;
  }
  setProp() {
    this.ctx.solveNow([this.ctx.net('+'), this.ctx.net('-')]);
  }
  visualState() {
    if (this.window > 0) this.avgI = this.charge / this.window;
    this.charge = 0;
    this.window = 0;
    return undefined;
  }
  diagnostics(): Diagnostic[] {
    const limit = numProp(this.ctx, 'maxCurrent', 1);
    if (this.avgI <= limit) return [];
    return [
      {
        code: 'source-overcurrent',
        severity: 'error',
        message: `${this.ctx.setup.label} delivers ${this.avgI.toFixed(2)} A, above its ${limit} A limit (short circuit?).`,
        componentIds: [this.ctx.setup.id],
        source: 'simulation',
      },
    ];
  }
}
registerModel('dc-source', (ctx) => new DcSourceModel(ctx));
