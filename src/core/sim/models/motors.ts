/**
 * Motors and motor drivers. Drivers are stamped as GND-referenced output
 * stages (like real H-bridges); motors read their terminal/coil voltages:
 * a DC motor's speed follows its average voltage, a stepper's rotor follows
 * the electrical angle of its coil currents (so full-, half- and microsteps
 * from any driver move it correctly).
 */
import type { Diagnostic } from '../../circuit/diagnostics';
import type { StampCollector } from '../analog/solver';
import { numProp, registerModel, type ModelContext, type SimModel } from '../model';
import { DigitalInput, supply } from './helpers';

const diag = (ctx: ModelContext, code: string, severity: Diagnostic['severity'], message: string): Diagnostic => ({
  code,
  severity,
  message: `${ctx.setup.label}: ${message}`,
  componentIds: [ctx.setup.id],
  source: 'simulation',
});

const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

/** Tracks a continuous (unwrapped) electrical angle from successive readings. */
class ElectricalAngle {
  private last: number | null = null;
  total = 0;
  update(x: number, y: number, min = 0.2) {
    if (Math.hypot(x, y) < min) return;
    const a = (Math.atan2(y, x) * 180) / Math.PI;
    if (this.last !== null) {
      const d = wrap180(a - this.last);
      // Opposite vectors are ambiguous (direction unknown): the rotor stays.
      if (Math.abs(d) > 179) return;
      this.total += d;
    }
    this.last = a;
  }
}

// ================================================================== DC motor
/** Brushed DC motor: winding resistance; speed follows the average terminal voltage with some inertia. */
class DcMotorModel implements SimModel {
  private vInt = 0;
  private window = 0;
  private rpm = 0;
  private angle = 0;
  private amps = 0;
  constructor(readonly ctx: ModelContext) {}
  private get ohms() {
    return Math.max(0.5, numProp(this.ctx, 'resistance', 10));
  }
  stamp(s: StampCollector) {
    s.resistor(this.ctx.net('+'), this.ctx.net('-'), this.ohms);
  }
  integrate(dt: number, v: Float64Array) {
    const a = this.ctx.net('+');
    const b = this.ctx.net('-');
    if (a < 0 || b < 0) return;
    this.vInt += (v[a] - v[b]) * dt;
    this.window += dt;
  }
  visualState(frameDt: number) {
    const vAvg = this.window > 0 ? this.vInt / this.window : 0;
    this.vInt = this.window = 0;
    this.amps = Math.abs(vAvg) / this.ohms;
    const target = vAvg * numProp(this.ctx, 'rpmPerVolt', 30);
    const k = Math.min(1, Math.max(frameDt, 0) / 0.15);
    this.rpm += (target - this.rpm) * k;
    if (Math.abs(this.rpm) < 0.05 && Math.abs(target) < 0.05) this.rpm = 0;
    this.angle = (this.angle + (this.rpm / 60) * 360 * Math.max(frameDt, 0)) % 360;
    return { _angle: this.angle, _rpm: Math.round(this.rpm), _amps: this.amps };
  }
}
registerModel('dc-motor', (ctx) => new DcMotorModel(ctx));

// ===================================================== dual H-bridge (L298N)
const R_SWITCH = 1;

interface Bridge {
  en: string;
  in: [string, string];
  out: [string, string];
}

/**
 * L298N module: two H-bridges powered from the motor supply. With the enable
 * HIGH (or its jumper fitted, i.e. EN left unconnected) each output follows
 * its input; with the enable LOW both outputs float (motor coasts). The
 * on-board 78M05 provides 5 V when the motor supply exceeds ~7 V.
 */
class HBridgeModel implements SimModel {
  private inputs = new Map<string, DigitalInput>();
  private state: (boolean | null)[] = [];
  private powered = false;
  private vs = 0;
  private gnd = -1;
  constructor(readonly ctx: ModelContext) {
    for (const b of this.bridges) for (const p of [b.en, ...b.in]) this.inputs.set(p, new DigitalInput(ctx, p));
  }
  private get bridges(): Bridge[] {
    return (this.ctx.setup.params.bridges as Bridge[]) ?? [];
  }
  private get supplyPin() {
    return String(this.ctx.setup.params.vs ?? '12V');
  }
  stamp(s: StampCollector) {
    if (this.gnd < 0) return;
    const logic5 = this.ctx.net(String(this.ctx.setup.params.logic ?? '5V'));
    if (this.powered && this.vs > 7 && logic5 >= 0) s.voltageSource(logic5, this.gnd, 5, 0.5);
    if (!this.powered) return;
    // Output transistors as switches to the motor supply or to GND, so the load
    // current is drawn from the supply; ~1 Ω each approximates the L298's
    // saturation drop at motor currents.
    const vsNet = this.ctx.net(this.supplyPin);
    let k = 0;
    for (const b of this.bridges) {
      for (const o of b.out) {
        const st = this.state[k++];
        if (st !== null && st !== undefined) s.resistor(this.ctx.net(o), st ? vsNet : this.gnd, R_SWITCH);
      }
    }
  }
  afterSolve(v: Float64Array) {
    const sup = supply(this.ctx, v, this.supplyPin, 'GND');
    const wasPowered = this.powered;
    this.powered = sup.powered && sup.volts > 4.5;
    this.vs = sup.volts;
    this.gnd = sup.gnd;
    for (const inp of this.inputs.values()) inp.sample(v, sup.gnd, 5);
    const next: (boolean | null)[] = [];
    for (const b of this.bridges) {
      const enNet = this.ctx.net(b.en);
      const enabled = enNet < 0 || this.ctx.netPinCount(enNet) <= 1 || this.inputs.get(b.en)!.level;
      for (const p of b.in) next.push(enabled ? this.inputs.get(p)!.level : null);
    }
    if (wasPowered !== this.powered || next.some((x, i) => x !== this.state[i])) {
      this.state = next;
      this.ctx.solveNow(this.bridges.flatMap((b) => b.out.map((o) => this.ctx.net(o))));
    }
  }
  visualState() {
    return { _outputs: this.state.map((x) => (x === null ? 'Z' : x ? 'H' : 'L')).join(' ') };
  }
  diagnostics(): Diagnostic[] {
    return this.powered ? [] : [diag(this.ctx, 'unpowered', 'warning', `motor supply (${this.supplyPin}) is not powered (5–35 V).`)];
  }
}
registerModel('h-bridge', (ctx) => new HBridgeModel(ctx));

// ============================================================ bipolar stepper
/** Two-coil stepper: the rotor follows the coils' electrical angle; 90° electrical = one full step. */
class BipolarStepperModel implements SimModel {
  private elec = new ElectricalAngle();
  constructor(readonly ctx: ModelContext) {}
  private get coils() {
    return (this.ctx.setup.params.coils as [[string, string], [string, string]]) ?? [
      ['A+', 'A-'],
      ['B+', 'B-'],
    ];
  }
  stamp(s: StampCollector) {
    const r = Math.max(0.5, numProp(this.ctx, 'coilResistance', 10));
    for (const [p, n] of this.coils) s.resistor(this.ctx.net(p), this.ctx.net(n), r);
  }
  afterSolve(v: Float64Array) {
    const [[ap, an], [bp, bn]] = this.coils.map(([p, n]) => [this.ctx.net(p), this.ctx.net(n)]);
    if (ap < 0 || an < 0 || bp < 0 || bn < 0) return;
    const driven = (n: number) => this.ctx.isDriven(n);
    const va = driven(ap) && driven(an) ? v[ap] - v[an] : 0;
    const vb = driven(bp) && driven(bn) ? v[bp] - v[bn] : 0;
    this.elec.update(va, vb, 0.5);
  }
  /** Shaft angle in degrees (unbounded). */
  get position() {
    return (this.elec.total / 90) * (360 / Number(this.ctx.setup.params.stepsPerRev ?? 200));
  }
  visualState() {
    const a = this.position;
    return { angle: ((a % 360) + 360) % 360, _steps: Math.round(this.elec.total / 90), _angle: a };
  }
}
registerModel('bipolar-stepper', (ctx) => new BipolarStepperModel(ctx));

// ============================================================ A4988 driver
/**
 * STEP/DIR microstepping driver. Each STEP rising edge advances the
 * electrical angle by 90°/microsteps (MS1..MS3: full, ½, ¼, ⅛, 1/16); coil
 * outputs are sine/cosine of that angle around half the motor supply.
 */
class StepperDriverModel implements SimModel {
  private inputs: Record<string, DigitalInput> = {};
  private index = 0; // in 1/16 steps
  private powered = false;
  private vm = 0;
  private gnd = -1;
  private enabled = false;
  private prevStep = false;
  constructor(readonly ctx: ModelContext) {
    for (const p of ['EN', 'MS1', 'MS2', 'MS3', 'RST', 'SLP', 'STEP', 'DIR']) this.inputs[p] = new DigitalInput(ctx, p);
  }
  private connected(pin: string) {
    const n = this.ctx.net(pin);
    return n >= 0 && this.ctx.netPinCount(n) > 1;
  }
  private microsteps() {
    const [m1, m2, m3] = ['MS1', 'MS2', 'MS3'].map((p) => this.connected(p) && this.inputs[p].level);
    if (m1 && m2 && m3) return 16;
    if (m1 && m2) return 8;
    if (m2) return 4;
    if (m1) return 2;
    return 1;
  }
  stamp(s: StampCollector) {
    if (!this.powered || !this.enabled) return;
    const theta = ((45 + (this.index * 90) / 16) * Math.PI) / 180;
    const half = this.vm / 2;
    const amp = Math.max(0, this.vm - 1);
    const out = (pin: string, volts: number) => s.voltageSource(this.ctx.net(pin), this.gnd, volts, 0.5);
    out('1A', half + (amp / 2) * Math.cos(theta));
    out('1B', half - (amp / 2) * Math.cos(theta));
    out('2A', half + (amp / 2) * Math.sin(theta));
    out('2B', half - (amp / 2) * Math.sin(theta));
  }
  afterSolve(v: Float64Array) {
    const logic = supply(this.ctx, v, 'VDD', 'GND');
    const motor = supply(this.ctx, v, 'VMOT', 'GND');
    const was = this.powered && this.enabled;
    this.powered = logic.powered && motor.powered;
    this.vm = motor.volts;
    this.gnd = logic.gnd;
    const vdd = logic.volts || 5;
    for (const inp of Object.values(this.inputs)) inp.sample(v, logic.gnd, vdd);
    // Unconnected RST/SLP count as HIGH (most breakouts strap them); EN has a pull-down.
    const high = (p: string) => !this.connected(p) || this.inputs[p].level;
    this.enabled = this.powered && !(this.connected('EN') && this.inputs.EN.level) && high('RST') && high('SLP');
    const step = this.inputs.STEP;
    let moved = false;
    if (this.enabled && step.level && !this.prevStep) {
      this.index += (this.inputs.DIR.level ? 1 : -1) * (16 / this.microsteps());
      moved = true;
    }
    this.prevStep = step.level;
    if (moved || was !== (this.powered && this.enabled)) this.ctx.solveNow(['1A', '1B', '2A', '2B'].map((p) => this.ctx.net(p)));
  }
  visualState() {
    return { _microsteps: this.microsteps(), _enabled: this.enabled };
  }
  diagnostics(): Diagnostic[] {
    return this.powered ? [] : [diag(this.ctx, 'unpowered', 'warning', 'needs logic power (VDD/GND) and motor power (VMOT).')];
  }
}
registerModel('stepper-driver', (ctx) => new StepperDriverModel(ctx));

// ===================================================== 28BYJ-48 + ULN2003 board
/**
 * Geared unipolar stepper on its ULN2003 board: IN1..IN4 HIGH energise coils
 * A..D (0°, 90°, 180°, 270° electrical). 2048 full steps per output turn.
 */
class UnipolarStepperModel implements SimModel {
  private ins: DigitalInput[];
  private elec = new ElectricalAngle();
  private powered = false;
  private gnd = -1;
  private phases = '';
  constructor(readonly ctx: ModelContext) {
    this.ins = ['IN1', 'IN2', 'IN3', 'IN4'].map((p) => new DigitalInput(ctx, p));
  }
  stamp(s: StampCollector) {
    // ULN2003 inputs: 2.7 kΩ base resistors to ground.
    const gnd = this.ctx.net('-');
    for (const p of ['IN1', 'IN2', 'IN3', 'IN4']) s.resistor(this.ctx.net(p), gnd, 2700);
  }
  afterSolve(v: Float64Array) {
    const sup = supply(this.ctx, v, '+', '-');
    this.powered = sup.powered;
    this.gnd = sup.gnd;
    const lv = this.ins.map((i) => i.sample(v, this.gnd, 5).level);
    this.phases = ['A', 'B', 'C', 'D'].filter((_, i) => lv[i]).join('');
    if (!this.powered) return;
    const [a, b, c, d] = lv.map(Number);
    this.elec.update(a - c, b - d, 0.5);
  }
  get position() {
    return (this.elec.total / 90) * (360 / Number(this.ctx.setup.params.stepsPerRev ?? 2048));
  }
  visualState() {
    return { _angle: this.position, _phases: this.phases || '–', _steps: Math.round(this.elec.total / 90) };
  }
  diagnostics(): Diagnostic[] {
    return this.powered ? [] : [diag(this.ctx, 'unpowered', 'warning', 'the driver board needs 5–12 V between + and −.')];
  }
}
registerModel('unipolar-stepper', (ctx) => new UnipolarStepperModel(ctx));

// ===================================================== ULN2003 Darlington array
/** Seven open-collector Darlington switches: INx HIGH pulls OUTx to GND (≈0.9 V saturation). */
class DarlingtonArrayModel implements SimModel {
  private on: boolean[] = [];
  constructor(readonly ctx: ModelContext) {}
  private get channels() {
    return Number(this.ctx.setup.params.channels ?? 7);
  }
  stamp(s: StampCollector) {
    const gnd = this.ctx.net('GND');
    for (let i = 1; i <= this.channels; i++) {
      s.resistor(this.ctx.net(`IN${i}`), gnd, 2700);
      if (this.on[i - 1]) s.voltageSource(this.ctx.net(`OUT${i}`), gnd, 0.9, 1);
    }
  }
  afterSolve(v: Float64Array) {
    const gnd = this.ctx.net('GND');
    if (gnd < 0) return;
    const next: boolean[] = [];
    for (let i = 1; i <= this.channels; i++) {
      const n = this.ctx.net(`IN${i}`);
      next.push(n >= 0 && this.ctx.isDriven(n) && v[n] - v[gnd] > 2.4);
    }
    if (next.some((x, i) => x !== this.on[i])) {
      this.on = next;
      this.ctx.solveNow(next.map((_, i) => this.ctx.net(`OUT${i + 1}`)));
    }
  }
}
registerModel('darlington-array', (ctx) => new DarlingtonArrayModel(ctx));
