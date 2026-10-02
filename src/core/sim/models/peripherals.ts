/**
 * Input devices, displays and buses: matrix keypad, quadrature encoder,
 * SSD1306 OLED, MPU-6050 IMU, DS1307 RTC, NEC infrared link and WS2812
 * addressable LEDs. Electrical parts are stamped into the solver; I2C devices
 * attach at protocol level to the MCU's TWI peripheral (like the I2C LCD);
 * WS2812 bits are decoded from the exact edge times of the data pin.
 */
import type { Diagnostic } from '../../circuit/diagnostics';
import type { PropValue } from '../../model/circuit';
import type { StampCollector } from '../analog/solver';
import type { I2CDevice } from '../mcu/mcu';
import { numProp, registerModel, type ModelContext, type SimModel } from '../model';
import { DigitalInput, supply } from './helpers';

const diag = (ctx: ModelContext, code: string, severity: Diagnostic['severity'], message: string): Diagnostic => ({
  code,
  severity,
  message: `${ctx.setup.label}: ${message}`,
  componentIds: [ctx.setup.id],
  source: 'simulation',
});

const CONTACT = 0.05;
const PULLUP = 10_000;

// ============================================================ matrix keypad
/** Membrane keypad: pressing a key connects its row line to its column line. */
class KeypadModel implements SimModel {
  private pressed = new Set<string>();
  private pressedAt = new Map<string, number>();
  /** A click closes the contact at least this long (simulation time), beyond library debounce. */
  private static readonly MIN_PRESS = 0.06;
  constructor(readonly ctx: ModelContext) {}
  private layout() {
    const p = this.ctx.setup.params as { rows: string[]; cols: string[]; keys: string[][] };
    return p;
  }
  private keyPins(label: string): [string, string] | null {
    const { rows, cols, keys } = this.layout();
    for (let r = 0; r < keys.length; r++) {
      const c = keys[r].indexOf(label);
      if (c >= 0) return [rows[r], cols[c]];
    }
    return null;
  }
  stamp(s: StampCollector) {
    for (const k of this.pressed) {
      const pins = this.keyPins(k);
      if (pins) s.resistor(this.ctx.net(pins[0]), this.ctx.net(pins[1]), CONTACT);
    }
  }
  onInput(key: string, value: PropValue) {
    if (!key.startsWith('key:')) return;
    const label = key.slice(4);
    const pins = this.keyPins(label);
    if (!pins) return;
    const nets = pins.map((p) => this.ctx.net(p));
    if (value) {
      this.pressed.add(label);
      this.pressedAt.set(label, this.ctx.now());
      this.ctx.solveNow(nets);
      return;
    }
    const held = this.ctx.now() - (this.pressedAt.get(label) ?? -Infinity);
    const release = () => {
      this.pressed.delete(label);
      this.ctx.solveNow(nets);
    };
    if (held < KeypadModel.MIN_PRESS) this.ctx.schedule(KeypadModel.MIN_PRESS - held, release);
    else release();
  }
  visualState() {
    return { _pressed: [...this.pressed] };
  }
}
registerModel('keypad-matrix', (ctx) => new KeypadModel(ctx));

// ========================================================= rotary encoder
/**
 * KY-040 style incremental encoder: CLK (A) and DT (B) contacts to GND with
 * 10 kΩ pull-ups on the module; both are HIGH at a detent. One detent
 * clockwise: A falls, B falls, A rises, B rises (B leads for anticlockwise).
 */
class RotaryEncoderModel implements SimModel {
  private a = true;
  private b = true;
  private sw = false;
  private queue: number[] = [];
  private busy = false;
  private detents = 0;
  constructor(readonly ctx: ModelContext) {}
  private pins() {
    return ['CLK', 'DT', 'SW'].map((p) => this.ctx.net(p));
  }
  stamp(s: StampCollector) {
    const vcc = this.ctx.net('VCC');
    const gnd = this.ctx.net('GND');
    const [clk, dt, sw] = this.pins();
    for (const [n, closed] of [
      [clk, !this.a],
      [dt, !this.b],
      [sw, this.sw],
    ] as const) {
      s.resistor(vcc, n, PULLUP);
      if (closed) s.resistor(n, gnd, CONTACT);
    }
  }
  private set(a: boolean, b: boolean) {
    this.a = a;
    this.b = b;
    this.ctx.solveNow(this.pins());
  }
  private pump() {
    if (this.busy) return;
    const dir = this.queue.shift();
    if (dir === undefined) return;
    this.busy = true;
    // ~1 ms between contact transitions: a brisk turn of the knob.
    const seq: [boolean, boolean][] = dir > 0 ? [[false, true], [false, false], [true, false], [true, true]] : [[true, false], [false, false], [false, true], [true, true]];
    let i = 0;
    const next = () => {
      const [a, b] = seq[i++];
      this.set(a, b);
      if (i < seq.length) this.ctx.schedule(1e-3, next);
      else {
        this.detents += dir;
        this.busy = false;
        this.ctx.schedule(1e-3, () => this.pump());
      }
    };
    this.ctx.schedule(1e-4, next);
  }
  onInput(key: string, value: PropValue) {
    if (key === 'rotate') {
      const n = Math.max(-50, Math.min(50, Math.round(Number(value))));
      for (let i = 0; i < Math.abs(n); i++) this.queue.push(Math.sign(n));
      this.pump();
    } else if (key === 'pressed') {
      this.sw = !!value;
      this.ctx.solveNow([this.ctx.net('SW')]);
    }
  }
  visualState() {
    const step = Number(this.ctx.setup.params.degreesPerDetent ?? 18);
    return { angle: (((this.detents * step) % 360) + 360) % 360, pressed: this.sw, _detents: this.detents };
  }
}
registerModel('rotary-encoder', (ctx) => new RotaryEncoderModel(ctx));

// ============================================================== I2C helpers
/** I2C target with a register pointer (first written byte) and auto-increment. */
abstract class RegisterTarget implements I2CDevice {
  protected ptr = 0;
  private expectPointer = false;
  protected wrote = false;
  abstract get address(): number;
  abstract get online(): boolean;
  protected abstract readReg(r: number): number;
  protected abstract writeReg(r: number, value: number): void;
  protected next(r: number) {
    return (r + 1) & 0xff;
  }
  /** A read transaction begins (snapshot live values here). */
  protected beginRead(): void {}
  /** A write transaction ended. */
  protected endWrite(): void {}
  connect(write: boolean) {
    if (!this.online) return false;
    if (write) {
      this.expectPointer = true;
      this.wrote = false;
    } else this.beginRead();
    return true;
  }
  write(byte: number) {
    if (this.expectPointer) {
      this.ptr = byte;
      this.expectPointer = false;
    } else {
      this.writeReg(this.ptr, byte & 0xff);
      this.ptr = this.next(this.ptr);
      this.wrote = true;
    }
    return true;
  }
  read() {
    const v = this.readReg(this.ptr) & 0xff;
    this.ptr = this.next(this.ptr);
    return v;
  }
  stop() {
    if (this.wrote) this.endWrite();
    this.wrote = false;
  }
}

// ================================================================= SSD1306
const OLED_W = 128;
const OLED_H = 64;
/** Parameter bytes following each multi-byte SSD1306 command. */
const OLED_ARGS: Record<number, number> = {
  0x20: 1, 0x21: 2, 0x22: 2, 0x26: 6, 0x27: 6, 0x29: 5, 0x2a: 5, 0x81: 1, 0x8d: 1, 0xa3: 2, 0xa8: 1, 0xd3: 1, 0xd5: 1, 0xd9: 1, 0xda: 1, 0xdb: 1,
};

/** SSD1306 128×64 OLED controller: command set, addressing modes and GDDRAM. */
export class Ssd1306 {
  ram = new Uint8Array(OLED_W * 8);
  displayOn = false;
  invert = false;
  allOn = false;
  segRemap = false;
  comReverse = false;
  startLine = 0;
  offset = 0;
  mode = 2; // page addressing after reset
  col = 0;
  page = 0;
  colStart = 0;
  colEnd = 127;
  pageStart = 0;
  pageEnd = 7;
  dirty = true;
  private cmd: number[] = [];

  command(b: number) {
    if (this.cmd.length) {
      this.cmd.push(b);
      if (this.cmd.length - 1 < OLED_ARGS[this.cmd[0]]) return;
      const [c, ...a] = this.cmd;
      this.cmd = [];
      this.execute(c, a);
      return;
    }
    if (OLED_ARGS[b]) this.cmd = [b];
    else this.execute(b, []);
  }

  private execute(c: number, a: number[]) {
    if (c <= 0x0f) this.col = (this.col & 0xf0) | c;
    else if (c <= 0x1f) this.col = ((c & 0x0f) << 4) | (this.col & 0x0f);
    else if (c === 0x20) this.mode = a[0] & 3;
    else if (c === 0x21) {
      this.colStart = a[0] & 127;
      this.colEnd = a[1] & 127;
      this.col = this.colStart;
    } else if (c === 0x22) {
      this.pageStart = a[0] & 7;
      this.pageEnd = a[1] & 7;
      this.page = this.pageStart;
    } else if (c >= 0x40 && c <= 0x7f) this.startLine = c & 63;
    else if (c === 0xa0 || c === 0xa1) this.segRemap = c === 0xa1;
    else if (c === 0xa4 || c === 0xa5) this.allOn = c === 0xa5;
    else if (c === 0xa6 || c === 0xa7) this.invert = c === 0xa7;
    else if (c === 0xae || c === 0xaf) this.displayOn = c === 0xaf;
    else if (c >= 0xb0 && c <= 0xb7) this.page = c & 7;
    else if (c === 0xc0 || c === 0xc8) this.comReverse = c === 0xc8;
    else if (c === 0xd3) this.offset = a[0] & 63;
    this.dirty = true;
  }

  data(b: number) {
    this.ram[this.page * OLED_W + this.col] = b;
    this.dirty = true;
    if (this.mode === 0) {
      if (++this.col > this.colEnd) {
        this.col = this.colStart;
        if (++this.page > this.pageEnd) this.page = this.pageStart;
      }
    } else if (this.mode === 1) {
      if (++this.page > this.pageEnd) {
        this.page = this.pageStart;
        if (++this.col > this.colEnd) this.col = this.colStart;
      }
    } else if (this.col < 127) this.col++;
  }

  /** Lit state of display pixel (x, y), honouring remapping, start line and inversion. */
  pixel(x: number, y: number): boolean {
    if (!this.displayOn) return false;
    if (this.allOn) return true;
    const col = this.segRemap ? x : OLED_W - 1 - x;
    const row = ((this.comReverse ? y : OLED_H - 1 - y) + this.startLine + this.offset) & 63;
    const on = !!((this.ram[(row >> 3) * OLED_W + col] >> (row & 7)) & 1);
    return on !== this.invert;
  }

  /** RGBA image for the display element. */
  render(): Uint8ClampedArray {
    const img = new Uint8ClampedArray(OLED_W * OLED_H * 4);
    for (let y = 0; y < OLED_H; y++) {
      for (let x = 0; x < OLED_W; x++) {
        const i = (y * OLED_W + x) * 4;
        const on = this.pixel(x, y);
        img[i] = on ? 222 : 8;
        img[i + 1] = on ? 236 : 10;
        img[i + 2] = on ? 255 : 14;
        img[i + 3] = 255;
      }
    }
    this.dirty = false;
    return img;
  }
}

class Ssd1306Model implements SimModel {
  readonly oled = new Ssd1306();
  private powered = false;
  readonly i2c: I2CDevice & { sdaPin: string; sclPin: string };
  constructor(readonly ctx: ModelContext) {
    const self = this;
    let control = true;
    let co = false;
    let dc = false;
    this.i2c = {
      sdaPin: String(ctx.setup.params.sda ?? 'DATA'),
      sclPin: String(ctx.setup.params.scl ?? 'CLK'),
      get address() {
        return parseInt(String(self.ctx.setup.props.address ?? '0x3C'), 16) || 0x3c;
      },
      connect: (write) => {
        control = true;
        return this.powered && write;
      },
      write: (b) => {
        if (control) {
          co = !!(b & 0x80);
          dc = !!(b & 0x40);
          control = false;
          return true;
        }
        if (dc) this.oled.data(b);
        else this.oled.command(b);
        if (co) control = true;
        return true;
      },
      read: () => 0,
      stop: () => undefined,
    };
  }
  stamp() {}
  afterSolve(v: Float64Array) {
    const vin = String(this.ctx.setup.params.vcc ?? 'VIN');
    this.powered = supply(this.ctx, v, vin, 'GND').powered;
  }
  visualState() {
    return this.oled.dirty ? { $imageData: this.oled.render() } : undefined;
  }
  diagnostics(): Diagnostic[] {
    return this.powered ? [] : [diag(this.ctx, 'unpowered', 'warning', 'VIN/GND are not powered (3.3–5 V).')];
  }
}
registerModel('ssd1306', (ctx) => new Ssd1306Model(ctx));

// ================================================================= MPU-6050

class Mpu6050Model extends RegisterTarget implements SimModel {
  private regs = new Uint8Array(128);
  private snapshot = new Uint8Array(14);
  private powered = false;
  private ad0High = false;
  readonly i2c: I2CDevice & { sdaPin: string; sclPin: string };
  constructor(readonly ctx: ModelContext) {
    super();
    this.resetRegs();
    const self = this;
    this.i2c = {
      sdaPin: 'SDA',
      sclPin: 'SCL',
      get address() {
        return self.address;
      },
      connect: (w) => this.connect(w),
      write: (b) => this.write(b),
      read: () => this.read(),
      stop: () => this.stop(),
    };
  }
  get address() {
    return this.ad0High ? 0x69 : 0x68;
  }
  get online() {
    return this.powered;
  }
  private resetRegs() {
    this.regs.fill(0);
    this.regs[0x6b] = 0x40; // sleep after power-up
    this.regs[0x75] = 0x68; // WHO_AM_I
  }
  /** Sensor values from the orientation and rate properties. */
  private measure() {
    const deg = Math.PI / 180;
    const pitch = numProp(this.ctx, 'pitch', 0) * deg;
    const roll = numProp(this.ctx, 'roll', 0) * deg;
    const accel = [-Math.sin(pitch), Math.sin(roll) * Math.cos(pitch), Math.cos(roll) * Math.cos(pitch)];
    const gyro = [numProp(this.ctx, 'gx', 0), numProp(this.ctx, 'gy', 0), numProp(this.ctx, 'gz', 0)];
    const aScale = 16384 / (1 << ((this.regs[0x1c] >> 3) & 3));
    const gScale = 131 / (1 << ((this.regs[0x1b] >> 3) & 3));
    const temp = (numProp(this.ctx, 'temperature', 25) - 36.53) * 340;
    const words = [...accel.map((g) => g * aScale), temp, ...gyro.map((r) => r * gScale)];
    const asleep = !!(this.regs[0x6b] & 0x40);
    words.forEach((w, i) => {
      const v = asleep ? 0 : Math.max(-32768, Math.min(32767, Math.round(w))) & 0xffff;
      this.snapshot[i * 2] = v >> 8;
      this.snapshot[i * 2 + 1] = v & 0xff;
    });
  }
  protected beginRead() {
    this.measure();
  }
  protected readReg(r: number) {
    if (r >= 0x3b && r <= 0x48) return this.snapshot[r - 0x3b];
    return this.regs[r & 0x7f];
  }
  protected writeReg(r: number, value: number) {
    if (r === 0x6b && value & 0x80) {
      this.resetRegs(); // DEVICE_RESET self-clears
      return;
    }
    if (r === 0x75 || (r >= 0x3b && r <= 0x48)) return; // read-only
    this.regs[r & 0x7f] = value;
  }
  stamp() {}
  afterSolve(v: Float64Array) {
    const s = supply(this.ctx, v);
    this.powered = s.powered;
    const ad0 = this.ctx.net('AD0');
    this.ad0High = s.powered && ad0 >= 0 && this.ctx.isDriven(ad0) && v[ad0] - v[s.gnd] > 0.5 * s.volts;
  }
  setProp() {}
  visualState() {
    return { _pitch: numProp(this.ctx, 'pitch', 0), _roll: numProp(this.ctx, 'roll', 0) };
  }
  diagnostics(): Diagnostic[] {
    return this.powered ? [] : [diag(this.ctx, 'unpowered', 'warning', 'VCC/GND are not powered.')];
  }
}
registerModel('mpu6050', (ctx) => new Mpu6050Model(ctx));

// ================================================================== DS1307
const bcd = (n: number) => ((Math.floor(n / 10) % 10) << 4) | n % 10;
const unbcd = (b: number) => (b >> 4) * 10 + (b & 0x0f);

/** DS1307 RTC: BCD time registers advance with simulation time; 56 bytes of RAM. */
class Ds1307Model extends RegisterTarget implements SimModel {
  private regs = new Uint8Array(64);
  private powered = false;
  /** Wall-clock time (ms since epoch, UTC fields) at simulation time `baseSim`. */
  private baseEpoch: number;
  private baseSim = 0;
  private halted = false;
  private timeWritten = false;
  readonly i2c: I2CDevice & { sdaPin: string; sclPin: string };
  constructor(readonly ctx: ModelContext) {
    super();
    const start = String(ctx.setup.props.startTime ?? '').trim();
    const parsed = start ? Date.parse(start.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(start) ? start : `${start}Z`) : NaN;
    // Without a fixed start time the clock starts at the computer's local time.
    this.baseEpoch = Number.isFinite(parsed) ? parsed : Date.now() - new Date().getTimezoneOffset() * 60_000;
    this.baseSim = ctx.now();
    this.i2c = {
      sdaPin: 'SDA',
      sclPin: 'SCL',
      address: 0x68,
      connect: (w) => this.connect(w),
      write: (b) => this.write(b),
      read: () => this.read(),
      stop: () => this.stop(),
    };
    this.syncTimeRegs();
  }
  get address() {
    return 0x68;
  }
  get online() {
    return this.powered;
  }
  protected next(r: number) {
    return (r + 1) & 0x3f;
  }
  private currentEpoch() {
    return this.halted ? this.baseEpoch : this.baseEpoch + (this.ctx.now() - this.baseSim) * 1000;
  }
  private syncTimeRegs() {
    const d = new Date(Math.floor(this.currentEpoch() / 1000) * 1000);
    this.regs[0] = bcd(d.getUTCSeconds()) | (this.halted ? 0x80 : 0);
    this.regs[1] = bcd(d.getUTCMinutes());
    this.regs[2] = bcd(d.getUTCHours()); // 24-hour mode
    this.regs[3] = d.getUTCDay() + 1;
    this.regs[4] = bcd(d.getUTCDate());
    this.regs[5] = bcd(d.getUTCMonth() + 1);
    this.regs[6] = bcd(d.getUTCFullYear() % 100);
  }
  protected beginRead() {
    this.syncTimeRegs();
  }
  protected readReg(r: number) {
    return this.regs[r & 0x3f];
  }
  protected writeReg(r: number, value: number) {
    this.regs[r & 0x3f] = value;
    if (r <= 6) this.timeWritten = true;
  }
  protected endWrite() {
    if (!this.timeWritten) return;
    this.timeWritten = false;
    const r = this.regs;
    let hour: number;
    if (r[2] & 0x40) {
      // 12-hour mode: bit 5 = PM.
      hour = unbcd(r[2] & 0x1f) % 12 + (r[2] & 0x20 ? 12 : 0);
    } else hour = unbcd(r[2] & 0x3f);
    this.halted = !!(r[0] & 0x80);
    this.baseEpoch = Date.UTC(2000 + unbcd(r[6]), Math.max(0, unbcd(r[5] & 0x1f) - 1), Math.max(1, unbcd(r[4] & 0x3f)), hour, unbcd(r[1] & 0x7f), unbcd(r[0] & 0x7f));
    this.baseSim = this.ctx.now();
  }
  stamp() {}
  afterSolve(v: Float64Array) {
    this.powered = supply(this.ctx, v, '5V', 'GND').powered;
  }
  visualState() {
    const d = new Date(this.currentEpoch());
    return { _time: d.toISOString().slice(0, 19).replace('T', ' ') };
  }
  diagnostics(): Diagnostic[] {
    return this.powered ? [] : [diag(this.ctx, 'unpowered', 'warning', '5V/GND are not powered.')];
  }
}
registerModel('ds1307', (ctx) => new Ds1307Model(ctx));

// =============================================================== infrared
/** Durations in µs, alternating carrier burst (mark) and silence (space), starting with a mark. */
export type IrPulses = number[];

/** NEC frame: 9 ms mark, 4.5 ms space, 32 bits LSB first (address, ~address, command, ~command), stop mark. */
export function necFrame(address: number, command: number): IrPulses {
  const out: IrPulses = [9000, 4500];
  for (const byte of [address & 0xff, ~address & 0xff, command & 0xff, ~command & 0xff]) {
    for (let i = 0; i < 8; i++) out.push(562.5, (byte >> i) & 1 ? 1687.5 : 562.5);
  }
  out.push(562.5);
  return out;
}
export const NEC_REPEAT: IrPulses = [9000, 2250, 562.5];

interface IrReceiverPort {
  play(pulses: IrPulses): void;
}

/** Demodulating receiver (VS1838B / TSOP): output LOW while the 38 kHz carrier is received. */
class IrReceiverModel implements SimModel {
  private mark = false;
  private powered = false;
  private gnd = -1;
  private vcc = 5;
  private playing = false;
  private queue: IrPulses[] = [];
  private frames = 0;
  readonly ir: IrReceiverPort;
  constructor(readonly ctx: ModelContext) {
    this.ir = { play: (p) => this.enqueue(p) };
  }
  private get out() {
    return String(this.ctx.setup.params.out ?? 'DAT');
  }
  stamp(s: StampCollector) {
    const n = this.ctx.net(this.out);
    if (!this.powered || n < 0) return;
    // Open-collector output with an internal pull-up.
    if (this.mark) s.resistor(n, this.gnd, 100);
    else s.voltageSource(n, this.gnd, this.vcc, PULLUP);
  }
  afterSolve(v: Float64Array) {
    const sup = supply(this.ctx, v);
    if (sup.powered !== this.powered) {
      this.powered = sup.powered;
      this.gnd = sup.gnd;
      this.vcc = sup.volts;
      this.ctx.solveNow([this.ctx.net(this.out)]);
    }
  }
  private enqueue(p: IrPulses) {
    if (!this.powered) return;
    this.queue.push(p);
    if (!this.playing) this.playNext();
  }
  private playNext() {
    const p = this.queue.shift();
    if (!p) {
      this.playing = false;
      return;
    }
    this.playing = true;
    this.frames++;
    let i = 0;
    const step = () => {
      if (i >= p.length) {
        this.mark = false;
        this.ctx.solveNow([this.ctx.net(this.out)]);
        this.playNext();
        return;
      }
      this.mark = i % 2 === 0;
      this.ctx.solveNow([this.ctx.net(this.out)]);
      this.ctx.schedule(p[i++] * 1e-6, step);
    };
    step();
  }
  visualState() {
    return { _frames: this.frames };
  }
  diagnostics(): Diagnostic[] {
    return this.powered ? [] : [diag(this.ctx, 'unpowered', 'warning', 'VCC/GND are not powered.')];
  }
}
registerModel('ir-receiver', (ctx) => new IrReceiverModel(ctx));

/** Handheld NEC remote: a held button sends its frame, then repeat codes every 108 ms. */
class IrRemoteModel implements SimModel {
  private held: string | null = null;
  private generation = 0;
  private sending = 0;
  constructor(readonly ctx: ModelContext) {}
  stamp() {}
  private transmit(p: IrPulses) {
    for (const m of this.ctx.models()) {
      const port = (m as { ir?: IrReceiverPort }).ir;
      if (port && m !== (this as SimModel)) port.play(p);
    }
    this.sending = this.ctx.now() + p.reduce((a, b) => a + b, 0) * 1e-6;
  }
  onInput(key: string, value: PropValue) {
    if (!key.startsWith('key:')) return;
    const name = key.slice(4);
    const codes = this.ctx.setup.params.codes as Record<string, number>;
    if (!value) {
      if (this.held === name) this.held = null;
      return;
    }
    const code = codes?.[name];
    if (code === undefined) return;
    this.held = name;
    const gen = ++this.generation;
    const address = Number(this.ctx.setup.params.address ?? 0);
    this.transmit(necFrame(address, code));
    const repeat = () => {
      if (this.held !== name || gen !== this.generation) return;
      this.transmit(NEC_REPEAT);
      this.ctx.schedule(0.108, repeat);
    };
    this.ctx.schedule(0.108, repeat);
  }
  visualState() {
    return { _sending: this.ctx.now() < this.sending, _pressed: this.held ? [this.held] : [] };
  }
}
registerModel('ir-remote', (ctx) => new IrRemoteModel(ctx));

// ================================================================== WS2812
/**
 * WS2812/NeoPixel chain decoded from DIN edges: a high pulse longer than
 * 0.6 µs is a 1. Bytes arrive in GRB order; a low gap over 50 µs latches.
 * (DOUT re-transmission to further parts is not modelled.)
 */
class Ws2812Model implements SimModel {
  private din: DigitalInput;
  private riseAt = -1;
  private lastFall = -1;
  private bits: number[] = [];
  private pixels: { r: number; g: number; b: number }[];
  private powered = false;
  private latches = 0;
  constructor(readonly ctx: ModelContext) {
    this.din = new DigitalInput(ctx, 'DIN');
    this.pixels = Array.from({ length: this.count }, () => ({ r: 0, g: 0, b: 0 }));
  }
  private get count() {
    return Math.max(1, Number(this.ctx.setup.params.count ?? 1));
  }
  stamp() {}
  private latch() {
    const n = Math.min(this.count, Math.floor(this.bits.length / 24));
    for (let i = 0; i < n; i++) {
      const byte = (k: number) => this.bits.slice(i * 24 + k * 8, i * 24 + k * 8 + 8).reduce((a, b) => (a << 1) | b, 0);
      // Perceived brightness: the eye sees a dim LED brighter than its duty cycle.
      const level = (x: number) => Math.sqrt(x / 255);
      this.pixels[i] = { g: level(byte(0)), r: level(byte(1)), b: level(byte(2)) };
    }
    if (n) this.latches++;
    this.bits = [];
  }
  afterSolve(v: Float64Array) {
    const p = this.ctx.setup.params as { vcc?: string; gnd?: string };
    const s = supply(this.ctx, v, p.vcc ?? 'VCC', p.gnd ?? 'GND');
    this.powered = s.powered;
    if (!s.powered) return;
    const e = this.din.sample(v, s.gnd, s.volts);
    const t = this.ctx.now();
    if (e.rising) {
      if (this.bits.length && t - this.lastFall > 50e-6) this.latch();
      this.riseAt = t;
    } else if (e.falling && this.riseAt >= 0) {
      this.bits.push(t - this.riseAt > 0.6e-6 ? 1 : 0);
      if (this.bits.length > this.count * 24 + 24) this.bits.splice(0, 24); // longer chain: keep the first pixels' data
      this.lastFall = t;
      this.riseAt = -1;
    }
  }
  /** Pixel colours (0..1, perceptual), for tests. */
  colors() {
    if (this.bits.length && this.ctx.now() - this.lastFall > 50e-6) this.latch();
    return this.pixels;
  }
  visualState() {
    const px = this.colors();
    const single = this.ctx.setup.params.layout === 'single';
    return single ? { r: px[0].r, g: px[0].g, b: px[0].b, _latches: this.latches } : { $pixels: px.map((c) => ({ ...c })), _latches: this.latches };
  }
  diagnostics(): Diagnostic[] {
    return this.powered ? [] : [diag(this.ctx, 'unpowered', 'warning', 'VCC/GND are not powered (5 V).')];
  }
}
registerModel('ws2812', (ctx) => new Ws2812Model(ctx));
