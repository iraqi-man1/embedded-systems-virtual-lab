/**
 * MicroPython on the simulated Raspberry Pi Pico: the bundled firmware boots
 * on the RP2040 emulator, the project's .py files are copied to its file
 * system, and main.py drives the circuit like on a real board.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_EXAMPLES } from '../src/examples/all';
import { buildNetlist } from '../src/core/circuit/netlist';
import { buildSimSetup } from '../src/core/sim/setup';
import { SimulationEngine } from '../src/core/sim/engine/engine';
import type { SimEvent } from '../src/core/sim/types';
import { newProject, type Project } from '../src/core/project/schema';
import { CircuitBuilder, WIRE } from '../src/examples/builder';
import { sourcesFor } from '../src/core/project/firmware';
import { pyString, uploadScript } from '../src/core/sim/mcu/rp2040/micropythonHost';
import { TracebackReader, errorLocation } from '../src/core/toolchain/pythonTraceback';
import { PYTHON_API } from '../src/ui/editor/pythonLanguage';
import { lookup, registry } from './helpers';

const image = new Uint8Array(readFileSync(join(__dirname, '..', 'public', 'firmware', 'micropython-rpi-pico.uf2')));

type Frame = Extract<SimEvent, { type: 'frame' }>;

function runProject(p: Project) {
  const board = p.circuit.components.find((c) => lookup(c.type)?.mcu?.runtime)!;
  const files = sourcesFor('micropython', p.firmware.files).map((f) => ({ name: f.name, content: f.content }));
  const setup = buildSimSetup(p.circuit, lookup, buildNetlist(p.circuit, lookup), {}, [], { [board.id]: { kind: 'micropython', image, files } });
  const events: SimEvent[] = [];
  const engine = new SimulationEngine(setup, { speed: 1, realtime: true }, (e) => events.push(e));
  engine.start();
  engine.pause();
  const frames = () => events.filter((e): e is Frame => e.type === 'frame');
  const serial = () => frames().flatMap((f) => f.serial.flatMap((s) => s.data)).map((c) => String.fromCharCode(c)).join('');
  const byLabel = (label: string) => p.circuit.components.find((c) => c.label === label)!;
  return {
    engine,
    board,
    serial,
    frames,
    byLabel,
    /** Runs (10 ms frames) until `done()` or `seconds` of simulated time. */
    run(seconds: number, done: () => boolean = () => false) {
      const end = engine.now() + seconds;
      while (engine.now() < end - 1e-9 && !done()) {
        engine.advance(Math.min(end, engine.now() + 0.01));
        engine.emitFrame();
      }
    },
  };
}

const example = (id: string) => ALL_EXAMPLES.find((e) => e.id === id)!.build(registry);

/** A Pico wired to one I2C module (SDA, SCL, power) running `main`. */
function i2cProject(type: string, sda: string, scl: string, supply: string, main: string): Project {
  const b = new CircuitBuilder(registry);
  const pico = b.add('evlab.rpi-pico', 0, 0);
  const dev = b.add(type, 300, 200);
  b.wire(pico, sda, dev, 'SDA', WIRE.blue);
  b.wire(pico, scl, dev, 'SCL', WIRE.yellow);
  b.wire(pico, supply, dev, 'VCC', WIRE.red);
  b.wire(pico, 'GND.b2', dev, 'GND', WIRE.black);
  const p = newProject('I2C');
  p.circuit = b.doc;
  p.firmware.files = [{ name: 'main.py', content: main }];
  return p;
}

describe('MicroPython host helpers', () => {
  it('quotes file contents as Python string literals', () => {
    expect(pyString(`it's a \\ "test"\nمرحبا\t\x01`)).toBe(`'it\\'s a \\\\ "test"\\nمرحبا\\t\\x01'`);
  });

  it('writes every file and removes stale modules', () => {
    const script = uploadScript([{ name: 'main.py', content: 'print(1)\n' }]);
    expect(script).toContain(`f=open('main.py','w')`);
    expect(script).toContain(`n+=f.write('print(1)\\n')`);
    expect(script).toContain(`x not in ('main.py',)`);
  });
});

describe('Python tracebacks', () => {
  it('reads the frames and the error of a traceback', () => {
    const r = new TracebackReader();
    const lines = ['Traceback (most recent call last):', '  File "main.py", line 4, in <module>', '  File "helpers.py", line 3, in go', "NameError: name 'pinn' isn't defined"];
    const out = lines.map((l) => r.line(l));
    expect(out.slice(0, 3)).toEqual([null, null, null]);
    const err = out[3]!;
    expect(err.type).toBe('NameError');
    expect(err.message).toBe("NameError: name 'pinn' isn't defined");
    expect(errorLocation(err, ['main.py', 'helpers.py'])).toEqual({ file: 'helpers.py', line: 3 });
    // A frame in a module that isn't one of the project's files points at the caller.
    expect(errorLocation(err, ['main.py'])).toEqual({ file: 'main.py', line: 4 });
  });

  it('handles syntax errors and ignores interrupts', () => {
    const r = new TracebackReader();
    for (const l of ['Traceback (most recent call last):', '  File "main.py", line 7', '\r']) r.line(l);
    expect(r.line('SyntaxError: invalid syntax')?.frames).toEqual([{ file: 'main.py', line: 7 }]);
    for (const l of ['Traceback (most recent call last):', '  File "main.py", line 9, in <module>']) r.line(l);
    expect(r.line('KeyboardInterrupt: ')).toBeNull();
    expect(r.line('plain output')).toBeNull();
  });
});

describe('MicroPython editor documentation', () => {
  it('documents every entry in English and Arabic', () => {
    for (const e of PYTHON_API) {
      expect(e.doc[0], e.name).not.toMatch(/[؀-ۿ]/);
      expect(e.doc[1], e.name).toMatch(/[؀-ۿ]/);
      expect(e.doc[1], e.name).not.toMatch(/[‎‏‪-‮⁦-⁩]/);
    }
  });
});

describe('MicroPython on the Raspberry Pi Pico', () => {
  it('pico-blink: runs main.py, blinks GP15 and the on-board LED, and restarts on reset', () => {
    const h = runProject(example('pico-blink'));
    h.run(3, () => h.serial().includes('Blinking!'));
    expect(h.serial()).toContain('Blinking!');
    // The start-up file copy is not shown, nor the soft reboot it ends with.
    expect(h.serial()).not.toMatch(/raw REPL|soft reboot/);
    const led = h.byLabel('LED1');
    const states = new Set<boolean>();
    const board = new Set<boolean>();
    const start = h.frames().length;
    h.run(1.2);
    for (const f of h.frames().slice(start)) {
      states.add(f.visuals[led.id]?.value as boolean);
      board.add(f.visuals[h.board.id]?.led as boolean);
    }
    expect([...states].sort()).toEqual([false, true]);
    expect([...board].sort()).toEqual([false, true]);
    h.engine.reset();
    h.run(2, () => h.serial().split('Blinking!').length > 2);
    expect(h.serial().split('Blinking!').length).toBe(3);
  }, 60_000);

  it('pico-button: Pin.PULL_UP reads the button and the LED follows it', () => {
    const h = runProject(example('pico-button'));
    h.run(3, () => h.serial().includes('Press the button!'));
    h.run(0.1);
    const btn = h.byLabel('SW1');
    const led = h.byLabel('LED1');
    expect(h.frames().at(-1)!.visuals[led.id]?.value).toBe(false);
    h.engine.input(btn.id, 'pressed', true);
    h.run(0.2);
    expect(h.serial()).toContain('Button pressed');
    expect(h.frames().at(-1)!.visuals[led.id]?.value).toBe(true);
    h.engine.input(btn.id, 'pressed', false);
    h.run(0.2);
    expect(h.serial()).toContain('Button released');
    expect(h.frames().at(-1)!.visuals[led.id]?.value).toBe(false);
  }, 60_000);

  it('pico-potentiometer: the ADC reads the wiper voltage and PWM dims the LED', () => {
    const h = runProject(example('pico-potentiometer'));
    h.run(3, () => /volts:\d/.test(h.serial()));
    h.run(0.3);
    // Knob at half travel: 1.65 V of 3.3 V.
    expect(h.serial()).toMatch(/raw:3[23]\d{3} volts:1\.6[0-9]/);
    const duty = h.frames().at(-1)!.mcus[0].debug?.duty.GP15 ?? 0;
    expect(duty).toBeGreaterThan(0.4);
    expect(duty).toBeLessThan(0.6);
  }, 60_000);

  it('pico-traffic-light: starts with the red light', () => {
    const p = example('pico-traffic-light');
    const h = runProject(p);
    h.run(3, () => h.serial().includes('STOP'));
    h.run(0.1);
    expect(h.serial()).toContain('STOP');
    const v = h.frames().at(-1)!.visuals;
    expect(v[h.byLabel('LED1').id]?.value).toBe(true);
    expect(v[h.byLabel('LED3').id]?.value).toBe(false);
  }, 60_000);

  it('I2C.scan() finds a module on the hardware I2C pins', () => {
    // The RP2040 port bit-bangs the zero-length writes of a scan; the bus decoder answers them.
    const h = runProject(i2cProject('evlab.lcd1602-i2c', 'GP4', 'GP5', 'VBUS', "from machine import I2C, Pin\ni2c = I2C(0, sda=Pin(4), scl=Pin(5))\nprint('scan', i2c.scan())\n"));
    h.run(3, () => /scan \[.*\]/.test(h.serial()));
    expect(h.serial()).toContain('scan [39]');
  }, 60_000);

  it('SoftI2C talks to a module on any two pins', () => {
    const main = "from machine import SoftI2C, Pin\ni2c = SoftI2C(sda=Pin(2), scl=Pin(3))\nprint('scan', i2c.scan())\nprint('who', i2c.readfrom_mem(0x68, 0x75, 1))\ni2c.writeto_mem(0x68, 0x6B, bytes([0]))\nprint('accel', i2c.readfrom_mem(0x68, 0x3B, 6))\n";
    const h = runProject(i2cProject('evlab.mpu6050', 'GP2', 'GP3', '3V3', main));
    h.run(3, () => /accel .*\n/.test(h.serial()));
    const out = h.serial();
    expect(out).toContain('scan [104]');
    expect(out).toContain("who b'h'"); // WHO_AM_I = 0x68
    // Lying flat: 0 g on X and Y, +1 g (16384) on Z.
    expect(out).toContain("accel b'\\x00\\x00\\x00\\x00@\\x00'");
  }, 60_000);

  it('hardware SPI shifts a byte into a 74HC595', () => {
    const b = new CircuitBuilder(registry);
    const pico = b.add('evlab.rpi-pico', 0, 0);
    const sr = b.add('evlab.74hc595', 300, 200);
    for (const [from, to] of [['GP19', 'SER'], ['GP18', 'SRCLK'], ['GP17', 'RCLK'], ['3V3', 'VCC'], ['3V3', 'SRCLR'], ['GND.b2', 'GND'], ['GND.b7', 'OE']])
      b.wire(pico, from, sr, to, WIRE.blue);
    const p = newProject('SPI');
    p.circuit = b.doc;
    p.firmware.files = [
      { name: 'main.py', content: "from machine import SPI, Pin\nspi = SPI(0, baudrate=1000000, sck=Pin(18), mosi=Pin(19))\nlatch = Pin(17, Pin.OUT, value=0)\nspi.write(bytes([0b10100101]))\nlatch.value(1)\nlatch.value(0)\nprint('sent')\n" },
    ];
    const h = runProject(p);
    h.run(3, () => h.serial().includes('sent'));
    h.run(0.02);
    const nl = buildNetlist(p.circuit, lookup);
    const f = h.frames().at(-1)!;
    const level = (pin: string) => (f.voltages[nl.netOf({ componentId: sr.id, pinId: pin })!] > 1.65 ? 1 : 0);
    // MSB first: QH holds the first bit sent, QA the last.
    expect(['QH', 'QG', 'QF', 'QE', 'QD', 'QC', 'QB', 'QA'].map(level).join('')).toBe('10100101');
  }, 60_000);

  it('imports other .py files of the project and reports errors with a traceback', () => {
    const p = example('pico-blink');
    p.firmware.files = [
      { name: 'main.py', content: 'import helpers\nhelpers.go()\n' },
      { name: 'helpers.py', content: "def go():\n    print('from helpers')\n    undefined_name\n" },
    ];
    const h = runProject(p);
    h.run(3, () => /NameError.*\n/.test(h.serial()));
    const out = h.serial();
    expect(out).toContain('from helpers');
    const reader = new TracebackReader();
    const errors = out.split(/\r?\n/).map((l) => reader.line(l)).filter((e) => e);
    expect(errors).toHaveLength(1);
    expect(errorLocation(errors[0]!, ['main.py', 'helpers.py'])).toEqual({ file: 'helpers.py', line: 3 });
    // The program ended, so the REPL answers.
    expect(out).toMatch(/>>> $/);
    h.engine.serialWrite(h.board.id, Array.from(new TextEncoder().encode('print(6*7)\r')));
    h.run(0.5, () => h.serial().includes('42'));
    expect(h.serial()).toMatch(/print\(6\*7\)\r\n42\r\n/);
    // The internal temperature sensor reads room temperature.
    h.engine.serialWrite(h.board.id, Array.from(new TextEncoder().encode('import machine;print("T=%.0f" % (27-(machine.ADC(4).read_u16()*3.3/65535-0.706)/0.001721))\r')));
    h.run(0.5, () => /T=-?\d+/.test(h.serial()));
    expect(h.serial()).toMatch(/T=2[6-8]\r\n/);
  }, 60_000);
});
