import type { ComponentDefinition } from '../../core/model/component';
import { axial, dipIc, radial, to220, to92 } from '../visuals/svgParts';
import { P, visualOnly, wokwiPins, wokwiSize } from './helpers';

const LED_COLORS = ['red', 'green', 'blue', 'yellow', 'orange', 'white', 'purple'];

export const resistor: ComponentDefinition = {
  type: 'evlab.resistor',
  name: 'Resistor',
  category: 'Passive',
  subcategory: 'Resistors',
  tags: ['resistor', 'ohm', 'through-hole', 'axial'],
  designator: 'R',
  visual: { kind: 'wokwi', tag: 'wokwi-resistor', propBindings: { resistance: 'value' } },
  size: wokwiSize('wokwi-resistor'),
  pins: wokwiPins('wokwi-resistor', 'passive'),
  properties: [
    P.resistance('220'),
    { key: 'power', label: 'Power rating', type: 'number', default: 0.25, unit: 'W', min: 0.01, step: 0.125 },
  ],
  simulation: { support: 'full', model: 'resistor', notes: 'Ideal resistor; power dissipation is checked against the rating.' },
  docs: {
    summary: 'Fixed resistor. Enter values like 220, 4.7k, 1M. The colour bands update automatically.',
    notes: 'For an LED on a 5 V pin, 220 Ω–1 kΩ limits the current to a safe 3–13 mA.',
  },
};

export const led: ComponentDefinition = {
  type: 'evlab.led',
  name: 'LED',
  category: 'Output',
  subcategory: 'LEDs',
  tags: ['led', 'light', 'diode', 'indicator', '5mm'],
  designator: 'LED',
  visual: { kind: 'wokwi', tag: 'wokwi-led', propBindings: { color: 'color' } },
  size: wokwiSize('wokwi-led'),
  pins: wokwiPins('wokwi-led', 'passive', {}, {
    A: { label: 'A (+)', description: 'Anode — the longer leg, towards positive', required: true },
    C: { label: 'C (−)', description: 'Cathode — the shorter leg, towards GND', required: true },
  }),
  properties: [
    P.color('red', LED_COLORS),
    { key: 'vf', label: 'Forward voltage (0 = by colour)', type: 'number', default: 0, unit: 'V', min: 0, max: 5, step: 0.1 },
    { key: 'maxCurrent', label: 'Rated current', type: 'number', default: 0.02, unit: 'A', min: 0.001, step: 0.005 },
  ],
  simulation: {
    support: 'full',
    model: 'led',
    notes: 'Piecewise-linear diode (Vf by colour, 15 Ω dynamic resistance). Brightness follows the time-averaged current, so PWM dims it.',
  },
  docs: {
    summary: 'Light-emitting diode. Current flows from anode (A, long leg) to cathode (C). Always use a series resistor.',
    example: 'blink',
  },
};

export const rgbLed: ComponentDefinition = {
  type: 'evlab.rgb-led',
  name: 'RGB LED',
  category: 'Output',
  subcategory: 'LEDs',
  tags: ['rgb', 'led', 'color', 'common cathode', 'common anode'],
  designator: 'LED',
  visual: { kind: 'wokwi', tag: 'wokwi-rgb-led' },
  size: wokwiSize('wokwi-rgb-led'),
  pins: wokwiPins('wokwi-rgb-led', 'passive'),
  properties: [
    {
      key: 'common',
      label: 'Common pin',
      type: 'enum',
      default: 'cathode',
      options: [
        { value: 'cathode', label: 'Common cathode' },
        { value: 'anode', label: 'Common anode' },
      ],
    },
  ],
  simulation: { support: 'full', model: 'rgb-led', notes: 'Three piecewise-linear LED junctions; PWM mixes colours.' },
  docs: { summary: 'Red, green and blue LEDs in one package sharing a common cathode (or anode).' },
};

export const pushbutton: ComponentDefinition = {
  type: 'evlab.pushbutton',
  name: 'Push Button (12 mm)',
  category: 'Input',
  subcategory: 'Switches',
  tags: ['button', 'push', 'tactile', 'switch', 'momentary'],
  designator: 'SW',
  visual: { kind: 'wokwi', tag: 'wokwi-pushbutton', propBindings: { color: 'color' } },
  size: wokwiSize('wokwi-pushbutton'),
  pins: wokwiPins('wokwi-pushbutton', 'passive'),
  internalConnections: [
    ['1.l', '1.r'],
    ['2.l', '2.r'],
  ],
  properties: [P.color('green', ['red', 'green', 'blue', 'yellow', 'black', 'white'])],
  simulation: { support: 'full', model: 'pushbutton', notes: 'Ideal momentary contact (50 mΩ). Contact bounce is not modelled.' },
  interaction: { kind: 'momentary', input: 'pressed' },
  docs: {
    summary: 'Momentary tactile switch. Legs on the same side letter (1.l/1.r) are always connected; pressing joins 1 and 2.',
    notes: 'Click and hold the button while the simulation runs. Combine with INPUT_PULLUP and wire the other side to GND.',
  },
};

export const pushbutton6mm: ComponentDefinition = {
  ...pushbutton,
  type: 'evlab.pushbutton-6mm',
  name: 'Push Button (6 mm)',
  visual: { kind: 'wokwi', tag: 'wokwi-pushbutton-6mm', propBindings: { color: 'color' } },
  size: wokwiSize('wokwi-pushbutton-6mm'),
  pins: wokwiPins('wokwi-pushbutton-6mm', 'passive'),
};

export const potentiometer: ComponentDefinition = {
  type: 'evlab.potentiometer',
  name: 'Potentiometer',
  category: 'Input',
  subcategory: 'Potentiometers',
  tags: ['potentiometer', 'pot', 'knob', 'variable resistor', 'analog'],
  designator: 'RV',
  visual: { kind: 'wokwi', tag: 'wokwi-potentiometer', attrs: { min: 0, max: 1, step: 0.001 }, propBindings: { position: 'value' } },
  size: wokwiSize('wokwi-potentiometer'),
  pins: wokwiPins('wokwi-potentiometer', 'passive', {}, {
    GND: { label: 'End 1', description: 'Track end (usually GND)' },
    SIG: { label: 'Wiper', description: 'Wiper — the variable output' },
    VCC: { label: 'End 2', description: 'Track end (usually VCC)' },
  }),
  properties: [
    P.resistance('10k', 'Total resistance'),
    { key: 'position', label: 'Position', type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, live: true },
  ],
  simulation: { support: 'full', model: 'potentiometer', notes: 'Linear taper; two resistors around the wiper.' },
  interaction: { kind: 'slider', input: 'position', property: 'position' },
  indicators: [{ kind: 'readout', value: 'value', scale: 100, unit: '%', digits: 3 }],
  docs: {
    summary: 'Rotary potentiometer. Connect the ends to 5 V and GND and read the wiper with analogRead().',
    notes: 'During simulation, drag the knob or use the mouse wheel over it. The Inspector also shows a slider.',
    example: 'potentiometer',
  },
};

export const slidePot: ComponentDefinition = {
  ...potentiometer,
  type: 'evlab.slide-potentiometer',
  name: 'Slide Potentiometer',
  tags: ['slide', 'fader', 'potentiometer', 'linear'],
  visual: { kind: 'wokwi', tag: 'wokwi-slide-potentiometer', attrs: { min: 0, max: 1, step: 0.001 }, propBindings: { position: 'value' } },
  size: wokwiSize('wokwi-slide-potentiometer'),
  pins: wokwiPins('wokwi-slide-potentiometer', 'passive'),
};

export const slideSwitch: ComponentDefinition = {
  type: 'evlab.slide-switch',
  name: 'Slide Switch (SPDT)',
  category: 'Input',
  subcategory: 'Switches',
  tags: ['switch', 'slide', 'spdt', 'toggle'],
  designator: 'SW',
  visual: { kind: 'wokwi', tag: 'wokwi-slide-switch' },
  size: wokwiSize('wokwi-slide-switch'),
  pins: wokwiPins('wokwi-slide-switch', 'passive', {}, { '2': { label: 'COM', description: 'Common' } }),
  properties: [{ key: 'position', label: 'Initial position', type: 'number', default: 0, min: 0, max: 1, step: 1 }],
  simulation: { support: 'full', model: 'slide-switch' },
  interaction: { kind: 'toggle', input: 'toggle' },
  docs: { summary: 'Single-pole double-throw switch: the middle pin connects to pin 1 or pin 3. Click to toggle.' },
};

const ldr = radial({ label: 'LDR', shape: 'ceramic', pins: ['1', '2'] });
export const photoresistor: ComponentDefinition = {
  type: 'evlab.photoresistor',
  name: 'Photoresistor (LDR)',
  category: 'Sensors',
  subcategory: 'Light',
  tags: ['ldr', 'photoresistor', 'light', 'photocell', 'gl5528'],
  designator: 'R',
  visual: { kind: 'svg', svg: ldr.svg },
  size: ldr.size,
  pins: ldr.pins,
  properties: [
    { key: 'lux', label: 'Illuminance', type: 'number', default: 500, unit: 'lux', min: 0.1, max: 100000, step: 10, live: true },
    { key: 'r10', label: 'Resistance @10 lux', type: 'string', default: '20k', unit: 'Ω', engineering: true },
    { key: 'gamma', label: 'Gamma', type: 'number', default: 0.7, min: 0.3, max: 1.2, step: 0.05 },
  ],
  simulation: { support: 'full', model: 'photoresistor', notes: 'R = R10·(lux/10)^−γ (GL55xx-style). Response time not modelled.' },
  controls: [{ kind: 'slider', prop: 'lux', icon: 'sun', log: true }],
  indicators: [{ kind: 'glow', value: 'prop:lux', at: { x: ldr.size.width / 2, y: ldr.size.height * 0.3 }, radius: 26, color: '#ffd54f', max: 100000, log: true }],
  docs: { summary: 'Light-dependent resistor. Use in a voltage divider and read it with analogRead().' },
};

const ntcV = radial({ label: 'NTC', shape: 'ceramic', pins: ['1', '2'] });
export const ntc: ComponentDefinition = {
  type: 'evlab.ntc-thermistor',
  name: 'NTC Thermistor 10k',
  category: 'Sensors',
  subcategory: 'Temperature',
  tags: ['ntc', 'thermistor', 'temperature'],
  designator: 'RT',
  visual: { kind: 'svg', svg: ntcV.svg },
  size: ntcV.size,
  pins: ntcV.pins,
  properties: [
    { key: 'temperature', label: 'Temperature', type: 'number', default: 25, unit: '°C', min: -40, max: 125, step: 0.5, live: true },
    { key: 'r25', label: 'R25', type: 'string', default: '10k', unit: 'Ω', engineering: true },
    { key: 'beta', label: 'Beta', type: 'number', default: 3950, min: 1000, max: 6000, step: 10 },
  ],
  simulation: { support: 'full', model: 'ntc', notes: 'β-model; self-heating not modelled.' },
  controls: [{ kind: 'slider', prop: 'temperature', icon: 'thermometer' }],
  docs: { summary: 'Negative-temperature-coefficient thermistor, 10 kΩ at 25 °C.' },
};

// -------------------------------------------------- not yet simulated parts
const transientNote = 'Reactive behaviour needs transient analysis (ngspice backend, planned). The real-time solver treats this as visual-only for now.';

const cap = radial({ label: '104', shape: 'ceramic', pins: ['1', '2'] });
export const capacitorCeramic = visualOnly({
  type: 'evlab.capacitor-ceramic',
  name: 'Ceramic Capacitor',
  category: 'Passive',
  subcategory: 'Capacitors',
  tags: ['capacitor', 'ceramic', 'decoupling', '100nf'],
  designator: 'C',
  visual: { kind: 'svg', svg: cap.svg },
  size: cap.size,
  pins: cap.pins,
  properties: [{ key: 'capacitance', label: 'Capacitance', type: 'string', default: '100n', unit: 'F', engineering: true }],
  notes: transientNote,
  docs: { summary: 'Non-polarised ceramic capacitor (e.g. 100 nF decoupling).' },
});

const ecap = radial({ label: '100µF', shape: 'electrolytic', pins: [{ id: '+', kind: 'passive' }, { id: '-', kind: 'passive' }] });
export const capacitorElectrolytic = visualOnly({
  type: 'evlab.capacitor-electrolytic',
  name: 'Electrolytic Capacitor',
  category: 'Passive',
  subcategory: 'Capacitors',
  tags: ['capacitor', 'electrolytic', 'polarized', 'bulk'],
  designator: 'C',
  visual: { kind: 'svg', svg: ecap.svg },
  size: ecap.size,
  pins: ecap.pins,
  properties: [
    { key: 'capacitance', label: 'Capacitance', type: 'string', default: '100u', unit: 'F', engineering: true },
    { key: 'voltage', label: 'Voltage rating', type: 'number', default: 16, unit: 'V' },
  ],
  notes: transientNote,
  docs: { summary: 'Polarised aluminium electrolytic capacitor. The stripe marks the − lead.' },
});

const ind = axial({ label: '10µH', body: '#3b6e3b', pins: ['1', '2'] });
export const inductor = visualOnly({
  type: 'evlab.inductor',
  name: 'Inductor',
  category: 'Passive',
  subcategory: 'Inductors',
  tags: ['inductor', 'coil', 'choke'],
  designator: 'L',
  visual: { kind: 'svg', svg: ind.svg },
  size: ind.size,
  pins: ind.pins,
  properties: [{ key: 'inductance', label: 'Inductance', type: 'string', default: '10u', unit: 'H', engineering: true }],
  notes: transientNote,
  docs: { summary: 'Axial inductor.' },
});

function diodePart(type: string, name: string, label: string, body: string, summary: string, tags: string[], extra: Partial<ComponentDefinition> = {}): ComponentDefinition {
  const v = axial({ label, body, band: '#ddd', pins: [{ id: 'A', kind: 'passive', label: 'A' }, { id: 'K', kind: 'passive', label: 'K' }] });
  return {
    type,
    name,
    category: 'Semiconductors',
    subcategory: 'Diodes',
    tags: ['diode', ...tags],
    designator: 'D',
    visual: { kind: 'svg', svg: v.svg },
    size: v.size,
    pins: v.pins,
    properties: [],
    simulation: { support: 'full', model: 'diode', notes: 'Piecewise-linear diode (forward voltage + series resistance); reverse recovery not modelled.' },
    indicators: [{ kind: 'readout', value: '_conducting', map: { true: 'conducting', false: 'off' }, anchor: 'top' }],
    docs: { summary },
    ...extra,
  };
}

export const diode1n4007 = diodePart('evlab.diode-1n4007', 'Diode 1N4007', '1N4007', '#222', 'General-purpose 1 A rectifier diode. The band marks the cathode (K).', ['rectifier', '1n4007'], {
  properties: [{ key: 'vf', label: 'Forward voltage', type: 'number', default: 0.75, unit: 'V', step: 0.05 }],
});
export const diode1n4148 = diodePart('evlab.diode-1n4148', 'Diode 1N4148', '1N4148', '#c0392b', 'Small-signal fast switching diode.', ['signal', '1n4148'], {
  properties: [{ key: 'vf', label: 'Forward voltage', type: 'number', default: 0.65, unit: 'V', step: 0.05 }],
});
export const schottky = diodePart('evlab.diode-1n5819', 'Schottky 1N5819', '1N5819', '#222', 'Schottky diode, low forward voltage (~0.35 V).', ['schottky', '1n5819'], {
  properties: [{ key: 'vf', label: 'Forward voltage', type: 'number', default: 0.35, unit: 'V', step: 0.05 }],
});
export const zener = diodePart('evlab.zener', 'Zener Diode', 'ZENER', '#8e44ad', 'Zener diode: conducts in reverse above its breakdown voltage.', ['zener', 'reference', 'regulator'], {
  properties: [
    { key: 'vf', label: 'Forward voltage', type: 'number', default: 0.7, unit: 'V', step: 0.05 },
    { key: 'vz', label: 'Zener voltage', type: 'number', default: 5.1, unit: 'V', step: 0.1 },
  ],
  simulation: { support: 'full', model: 'diode', notes: 'Piecewise-linear forward and Zener branches.' },
});

function bjt(type: string, name: string, label: string, polarity: 'npn' | 'pnp', pins: [string, string, string], summary: string): ComponentDefinition {
  const v = to92({ label, pins });
  return {
    type,
    name,
    category: 'Semiconductors',
    subcategory: 'Transistors',
    tags: ['transistor', 'bjt', polarity, label.toLowerCase()],
    designator: 'Q',
    visual: { kind: 'svg', svg: v.svg },
    size: v.size,
    pins: v.pins,
    properties: [
      { key: 'polarity', label: 'Polarity', type: 'enum', default: polarity, options: [{ value: polarity, label: polarity.toUpperCase() }] },
      { key: 'beta', label: 'Current gain (β)', type: 'number', default: 150, min: 10, max: 1000, step: 10 },
    ],
    simulation: {
      support: 'partial',
      model: 'bjt',
      notes: 'Piecewise-linear BJT (cut-off / active with β / saturation at 0.2 V). No Early effect, capacitances or temperature.',
    },
    indicators: [{ kind: 'readout', value: '_mode', map: { cutoff: 'off', active: 'active', saturation: 'ON (saturated)' }, anchor: 'top' }],
    docs: { summary },
  };
}

export const npn2n2222 = bjt('evlab.2n2222', '2N2222 NPN Transistor', '2N2222', 'npn', ['E', 'B', 'C'], 'General-purpose NPN switching transistor (600 mA). Pinout E-B-C (flat side facing you).');
export const npnBc547 = bjt('evlab.bc547', 'BC547 NPN Transistor', 'BC547', 'npn', ['C', 'B', 'E'], 'Small-signal NPN transistor (100 mA). Pinout C-B-E.');
export const pnp2n3906 = bjt('evlab.2n3906', '2N3906 PNP Transistor', '2N3906', 'pnp', ['E', 'B', 'C'], 'General-purpose PNP transistor (200 mA). Pinout E-B-C.');

function mosfet(type: string, name: string, label: string, channel: 'n' | 'p', pkg: 'to92' | 'to220', pins: [string, string, string], vth: number, rds: number, summary: string): ComponentDefinition {
  const v = pkg === 'to92' ? to92({ label, pins }) : to220({ label, pins });
  return {
    type,
    name,
    category: 'Semiconductors',
    subcategory: 'MOSFETs',
    tags: ['mosfet', 'fet', `${channel}-channel`, label.toLowerCase(), 'switch'],
    designator: 'Q',
    visual: { kind: 'svg', svg: v.svg },
    size: v.size,
    pins: v.pins,
    properties: [
      { key: 'channel', label: 'Channel', type: 'enum', default: channel, options: [{ value: channel, label: `${channel.toUpperCase()}-channel` }] },
      { key: 'vth', label: 'Threshold Vgs(th)', type: 'number', default: vth, unit: 'V', step: 0.1 },
      { key: 'rdsOn', label: 'Rds(on)', type: 'number', default: rds, unit: 'Ω', step: 0.01 },
    ],
    simulation: {
      support: 'partial',
      model: 'mosfet',
      notes: 'Switch model: Rds(on) above Vgs(th) (scaled through a 1 V transition band), off below. No linear-region gain, gate charge or body diode.',
    },
    indicators: [{ kind: 'readout', value: '_mode', map: { off: 'off', linear: 'partly on', on: 'ON' }, anchor: 'top' }],
    docs: { summary },
  };
}

export const n2n7000 = mosfet('evlab.2n7000', '2N7000 N-MOSFET', '2N7000', 'n', 'to92', ['S', 'G', 'D'], 2.1, 5, 'Small-signal logic-level-ish N-channel MOSFET (200 mA).');
export const irlz44n = mosfet('evlab.irlz44n', 'IRLZ44N N-MOSFET', 'IRLZ44N', 'n', 'to220', ['G', 'D', 'S'], 1.5, 0.025, 'Logic-level power N-MOSFET — drive motors and LED strips directly from 5 V pins.');
export const irf9540 = mosfet('evlab.irf9540', 'IRF9540 P-MOSFET', 'IRF9540', 'p', 'to220', ['G', 'D', 'S'], 3, 0.2, 'P-channel power MOSFET for high-side switching.');

const opto = dipIc({ label: 'PC817', pins: [{ id: 'A', kind: 'passive' }, { id: 'K', kind: 'passive' }, { id: 'E', kind: 'passive' }, { id: 'C', kind: 'passive' }] });
export const pc817 = visualOnly({
  type: 'evlab.pc817',
  name: 'PC817 Optocoupler',
  category: 'Semiconductors',
  subcategory: 'Optoelectronics',
  tags: ['optocoupler', 'opto', 'isolator', 'pc817'],
  designator: 'U',
  visual: { kind: 'svg', svg: opto.svg },
  size: opto.size,
  pins: opto.pins,
  notes: 'LED + phototransistor model with CTR planned.',
  docs: { summary: 'Optocoupler: LED on pins 1–2 drives a phototransistor on 3–4, galvanically isolated.' },
});

const xtal = radial({ label: '16MHz', shape: 'crystal', pins: ['1', '2'], spanPitches: 2 });
export const crystal16 = visualOnly({
  type: 'evlab.crystal',
  name: 'Crystal 16 MHz',
  category: 'Passive',
  subcategory: 'Crystals & Oscillators',
  tags: ['crystal', 'oscillator', 'clock', 'xtal', 'hc-49'],
  designator: 'Y',
  visual: { kind: 'svg', svg: xtal.svg },
  size: xtal.size,
  pins: xtal.pins,
  properties: [{ key: 'frequency', label: 'Frequency', type: 'string', default: '16M', unit: 'Hz', engineering: true }],
  notes: 'MCU clocks are set on the board definition; a discrete crystal is not needed for simulation.',
  docs: { summary: 'HC-49 quartz crystal.' },
});
