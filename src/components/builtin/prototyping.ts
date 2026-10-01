import type { ComponentDefinition } from '../../core/model/component';
import { breadboardLayout, type BreadboardSize } from '../visuals/breadboard';
import { headerModule, symbolPin, to220, to92 } from '../visuals/svgParts';
import { visualOnly } from './helpers';

function breadboard(size: BreadboardSize, name: string, summary: string): ComponentDefinition {
  const l = breadboardLayout(size);
  return {
    type: `evlab.breadboard-${size}`,
    name,
    category: 'Prototyping',
    subcategory: 'Breadboards',
    tags: ['breadboard', 'solderless', 'prototype', size],
    designator: 'BB',
    visual: { kind: 'builtin', renderer: `breadboard-${size}` },
    size: { width: l.width, height: l.height },
    pins: l.pins,
    internalConnections: l.internalConnections,
    properties: [],
    simulation: {
      support: 'full',
      model: 'connector',
      notes: 'Ideal connectivity: 5-hole terminal strips (a–e, f–j per column) and continuous power rails.',
    },
    docs: {
      summary,
      notes:
        'Drop a component so its legs land on holes and they are connected automatically. Holes a–e of one column are connected, as are f–j. The channel in the middle separates them, so DIP ICs straddle it. The rails marked + and − run along the whole board.',
    },
  };
}

export const breadboardHalf = breadboard('half', 'Breadboard (half, 400 holes)', 'Half-size solderless breadboard: 30 columns with power rails.');
export const breadboardFull = breadboard('full', 'Breadboard (full, 830 holes)', 'Full-size solderless breadboard: 63 columns with power rails.');
export const breadboardMini = breadboard('mini', 'Breadboard (mini, 170 holes)', 'Mini breadboard: 17 columns, no power rails.');

// ------------------------------------------------------------ power sources
const battery9v = headerModule({
  title: '9V',
  subtitle: 'Battery',
  pcb: '#2d2d2d',
  bottom: [{ id: '+', kind: 'passive' }, { id: '-', kind: 'passive' }],
  widthPitches: 5,
  heightPitches: 7,
  decoration: '<rect x="4" y="4" width="40" height="14" rx="2" fill="#e8b400"/>',
});

export const battery9V: ComponentDefinition = {
  type: 'evlab.battery-9v',
  name: '9V Battery',
  category: 'Power',
  subcategory: 'Batteries',
  tags: ['battery', '9v', 'power', 'source'],
  designator: 'BT',
  visual: { kind: 'svg', svg: battery9v.svg },
  size: battery9v.size,
  pins: battery9v.pins,
  properties: [
    { key: 'voltage', label: 'Voltage', type: 'number', default: 9, unit: 'V', min: 0, max: 12, step: 0.1, live: true },
    { key: 'rInternal', label: 'Internal resistance', type: 'number', default: 1.5, unit: 'Ω', min: 0.01, step: 0.1 },
    { key: 'maxCurrent', label: 'Max current', type: 'number', default: 0.5, unit: 'A', min: 0.01, step: 0.05 },
  ],
  simulation: { support: 'full', model: 'dc-source', notes: 'Ideal DC source with internal resistance; no discharge model.' },
  docs: { summary: 'Floating DC voltage source. Its − terminal is not ground unless you wire it to GND.' },
};

const aa = headerModule({
  title: '2×AA',
  subtitle: '3 V',
  pcb: '#3a3a3a',
  bottom: [{ id: '+', kind: 'passive' }, { id: '-', kind: 'passive' }],
  widthPitches: 6,
  heightPitches: 5,
});

export const batteryAA: ComponentDefinition = {
  ...battery9V,
  type: 'evlab.battery-2aa',
  name: '2×AA Battery Pack',
  tags: ['battery', 'aa', '3v'],
  visual: { kind: 'svg', svg: aa.svg },
  size: aa.size,
  pins: aa.pins,
  properties: battery9V.properties.map((p) => (p.key === 'voltage' ? { ...p, default: 3 } : p.key === 'rInternal' ? { ...p, default: 0.3 } : p)),
  docs: { summary: 'Two AA cells in series (3 V nominal).' },
};

const psu = headerModule({
  title: 'DC Power Supply',
  subtitle: 'Bench',
  pcb: '#34495e',
  bottom: [{ id: '+', kind: 'passive' }, { id: '-', kind: 'passive' }],
  widthPitches: 9,
  heightPitches: 6,
});

export const benchSupply: ComponentDefinition = {
  ...battery9V,
  type: 'evlab.bench-supply',
  name: 'Bench Power Supply',
  subcategory: 'Supplies',
  tags: ['power supply', 'psu', 'bench', 'adjustable'],
  designator: 'PS',
  visual: { kind: 'svg', svg: psu.svg },
  size: psu.size,
  pins: psu.pins,
  properties: [
    { key: 'voltage', label: 'Voltage', type: 'number', default: 5, unit: 'V', min: 0, max: 30, step: 0.1, live: true },
    { key: 'rInternal', label: 'Output resistance', type: 'number', default: 0.01, unit: 'Ω', min: 0.001, step: 0.01 },
    { key: 'maxCurrent', label: 'Current limit', type: 'number', default: 1, unit: 'A', min: 0.01, step: 0.1 },
  ],
  docs: { summary: 'Adjustable constant-voltage supply. Exceeding the current limit is reported (no foldback is modelled).' },
};

const reg = (label: string, out: string) =>
  to220({ label, pins: [{ id: 'IN', kind: 'passive' }, { id: 'GND', kind: 'ground' }, { id: 'OUT', kind: 'passive', description: out }] });
const r7805 = reg('7805', '5 V');
export const lm7805 = visualOnly({
  type: 'evlab.lm7805',
  name: 'LM7805 Regulator',
  category: 'Power',
  subcategory: 'Regulators',
  tags: ['7805', 'regulator', 'linear', 'ldo', '5v'],
  designator: 'U',
  visual: { kind: 'svg', svg: r7805.svg },
  size: r7805.size,
  pins: r7805.pins,
  notes: 'Behavioural regulator model (dropout, current limit) planned.',
  docs: { summary: '5 V 1.5 A linear regulator, ~2 V dropout.' },
});
const ams = to92({ label: 'AMS1117', pins: [{ id: 'GND', kind: 'ground' }, 'OUT', 'IN'] });
export const ams1117 = visualOnly({
  type: 'evlab.ams1117-33',
  name: 'AMS1117-3.3 LDO',
  category: 'Power',
  subcategory: 'Regulators',
  tags: ['ams1117', 'ldo', 'regulator', '3.3v'],
  designator: 'U',
  visual: { kind: 'svg', svg: ams.svg },
  size: ams.size,
  pins: ams.pins,
  notes: 'Behavioural regulator model planned.',
  docs: { summary: '3.3 V 1 A low-dropout regulator.' },
});

// ------------------------------------------------------ schematic helpers
const gnd = symbolPin('ground', 'GND');
export const groundSymbol: ComponentDefinition = {
  type: 'evlab.ground',
  name: 'Ground Symbol',
  category: 'Prototyping',
  subcategory: 'Symbols',
  tags: ['ground', 'gnd', 'symbol', 'net'],
  designator: 'GND',
  visual: { kind: 'svg', svg: gnd.svg },
  size: gnd.size,
  pins: gnd.pins,
  netLabelFixed: 'GND',
  properties: [],
  simulation: { support: 'full', model: 'connector' },
  docs: { summary: 'Every ground symbol is connected to every other ground symbol. Wire one to the board GND.' },
};

const lbl = symbolPin('label', 'NET');
export const netLabel: ComponentDefinition = {
  type: 'evlab.net-label',
  name: 'Net Label',
  category: 'Prototyping',
  subcategory: 'Symbols',
  tags: ['label', 'net', 'symbol', 'wire'],
  designator: 'NL',
  visual: { kind: 'builtin', renderer: 'net-label' },
  size: lbl.size,
  pins: lbl.pins,
  netLabelProperty: 'name',
  properties: [{ key: 'name', label: 'Net name', type: 'string', default: 'SIGNAL' }],
  simulation: { support: 'full', model: 'connector' },
  docs: { summary: 'All labels with the same name are connected, without drawing a wire.' },
};

export const junction: ComponentDefinition = {
  type: 'evlab.junction',
  name: 'Wire Junction',
  category: 'Prototyping',
  subcategory: 'Symbols',
  tags: ['junction', 'node', 'wire', 'splice'],
  designator: 'J',
  visual: { kind: 'builtin', renderer: 'junction' },
  size: { width: 9.6, height: 9.6 },
  pins: [{ id: 'J', x: 4.8, y: 4.8, kind: 'passive' }],
  properties: [],
  simulation: { support: 'full', model: 'connector' },
  docs: { summary: 'A connection point that joins several wires.' },
};
