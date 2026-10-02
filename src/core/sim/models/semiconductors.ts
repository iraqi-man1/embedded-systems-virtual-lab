/** Piecewise-linear semiconductor models for the real-time solver. */
import type { Diagnostic } from '../../circuit/diagnostics';
import { diodeCurrent, type PwlDiode, type StampCollector } from '../analog/solver';
import { numProp, registerModel, type ModelContext, type SimModel } from '../model';

// --------------------------------------------------------------------- diode
class DiodeModel implements SimModel {
  private fwd: PwlDiode;
  private zen: PwlDiode | null = null;
  private avgI = 0;
  private charge = 0;
  private window = 0;
  constructor(readonly ctx: ModelContext) {
    const vf = numProp(ctx, 'vf', 0.7);
    this.fwd = { anode: -1, cathode: -1, vOn: vf - 0.01 * 1, rOn: 1, gOff: 1e-9, on: false };
    const vz = numProp(ctx, 'vz', 0);
    if (vz > 0) this.zen = { anode: -1, cathode: -1, vOn: vz, rOn: 5, gOff: 1e-12, on: false };
  }
  stamp(s: StampCollector) {
    this.fwd.anode = this.ctx.net('A');
    this.fwd.cathode = this.ctx.net('K');
    s.diode(this.fwd);
    if (this.zen) {
      this.zen.anode = this.fwd.cathode;
      this.zen.cathode = this.fwd.anode;
      s.diode(this.zen);
    }
  }
  integrate(dt: number, v: Float64Array) {
    if (this.fwd.anode < 0 || this.fwd.cathode < 0) return;
    this.charge += Math.abs(diodeCurrent(this.fwd, v)) * dt;
    this.window += dt;
  }
  visualState() {
    if (this.window > 0) this.avgI = this.charge / this.window;
    this.charge = this.window = 0;
    return { _conducting: this.avgI > 1e-4 };
  }
  diagnostics(): Diagnostic[] {
    const max = numProp(this.ctx, 'maxCurrent', 1);
    return this.avgI > max
      ? [
          {
            code: 'diode-overcurrent',
            severity: 'error',
            message: `${this.ctx.setup.label}: ${this.avgI.toFixed(2)} A forward current exceeds its ${max} A rating.`,
            componentIds: [this.ctx.setup.id],
            source: 'simulation',
          },
        ]
      : [];
  }
}
registerModel('diode', (ctx) => new DiodeModel(ctx));

// ----------------------------------------------------------------------- BJT
type BjtMode = 'cutoff' | 'active' | 'saturation';

/**
 * PWL bipolar transistor. Base-emitter junction: vBE = 0.65 V + 20 Ω.
 * Active: Ic = β·Ib (VCCS). Saturation: C–E = 0.2 V source with 2 Ω.
 * The mode is chosen by iterating solves until consistent.
 */
class BjtModel implements SimModel {
  private mode: BjtMode = 'cutoff';
  private readonly vbe = 0.65;
  private readonly rbe = 20;
  private readonly vceSat = 0.2;
  private readonly rSat = 2;
  constructor(readonly ctx: ModelContext) {}
  private get pnp() {
    return this.ctx.setup.props.polarity === 'pnp';
  }
  private get beta() {
    return numProp(this.ctx, 'beta', 150);
  }
  /** For NPN: (b, e, c); PNP swaps the roles of the junction terminals. */
  private nets() {
    return { b: this.ctx.net('B'), c: this.ctx.net('C'), e: this.ctx.net('E') };
  }
  stamp(s: StampCollector) {
    const { b, c, e } = this.nets();
    if (b < 0 || c < 0 || e < 0) return;
    // Junction anode/cathode and collector current direction.
    const [ja, jk] = this.pnp ? [e, b] : [b, e];
    const [cFrom, cTo] = this.pnp ? [e, c] : [c, e];
    if (this.mode === 'cutoff') {
      s.conductance(ja, jk, 1e-9);
      s.conductance(c, e, 1e-9);
      return;
    }
    const g = 1 / this.rbe;
    s.conductance(ja, jk, g);
    s.currentSource(jk, ja, this.vbe * g);
    if (this.mode === 'active') {
      const gm = this.beta * g;
      s.controlledSource(cFrom, cTo, ja, jk, gm);
      s.currentSource(cTo, cFrom, gm * this.vbe);
    } else {
      // saturation: Vce(sat) source oriented from emitter to collector (NPN)
      if (this.pnp) s.voltageSource(e, c, this.vceSat, this.rSat);
      else s.voltageSource(c, e, this.vceSat, this.rSat);
    }
  }
  afterSolve(v: Float64Array) {
    const { b, c, e } = this.nets();
    if (b < 0 || c < 0 || e < 0) return;
    const sgn = this.pnp ? -1 : 1;
    const vbe = sgn * (v[b] - v[e]);
    const vce = sgn * (v[c] - v[e]);
    const ib = (vbe - this.vbe) / this.rbe;
    let next: BjtMode = this.mode;
    if (this.mode === 'cutoff') {
      if (vbe > this.vbe + 1e-6) next = vce > this.vceSat ? 'active' : 'saturation';
    } else if (ib < -1e-9) next = 'cutoff';
    else if (this.mode === 'active' && vce < this.vceSat - 1e-6) next = 'saturation';
    else if (this.mode === 'saturation') {
      const ic = (vce - this.vceSat) / this.rSat;
      if (ic > this.beta * ib) next = 'active';
    }
    if (next !== this.mode) {
      this.mode = next;
      this.ctx.solveNow([b, c, e]);
    }
  }
  visualState() {
    return { _mode: this.mode };
  }
}
registerModel('bjt', (ctx) => new BjtModel(ctx));

// -------------------------------------------------------------------- MOSFET
/** Switch-level MOSFET: conductance ramps from 0 to 1/Rds(on) over Vth..Vth+1 V. */
class MosfetModel implements SimModel {
  private level = 0; // 0..16
  constructor(readonly ctx: ModelContext) {}
  private get pch() {
    return this.ctx.setup.props.channel === 'p';
  }
  stamp(s: StampCollector) {
    const d = this.ctx.net('D');
    const src = this.ctx.net('S');
    const gOn = 1 / Math.max(1e-3, numProp(this.ctx, 'rdsOn', 0.1));
    s.conductance(d, src, this.level === 0 ? 1e-9 : (gOn * this.level) / 16);
  }
  afterSolve(v: Float64Array) {
    const g = this.ctx.net('G');
    const src = this.ctx.net('S');
    if (g < 0 || src < 0) return;
    const vth = numProp(this.ctx, 'vth', 2);
    // A floating gate keeps its last state (it really holds charge).
    if (!this.ctx.isDriven(g)) return;
    const vgs = this.pch ? v[src] - v[g] : v[g] - v[src];
    const next = Math.round(16 * Math.max(0, Math.min(1, vgs - vth)));
    if (next !== this.level) {
      this.level = next;
      this.ctx.solveNow([this.ctx.net('D'), src]);
    }
  }
  visualState() {
    return { _mode: this.level === 0 ? 'off' : this.level >= 16 ? 'on' : 'linear' };
  }
}
registerModel('mosfet', (ctx) => new MosfetModel(ctx));
