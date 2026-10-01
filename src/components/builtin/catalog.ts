/**
 * Catalog breadth: displays, ICs, sensors, actuators, communication and IoT
 * modules. Parts without a behaviour model are explicitly `visual-only`;
 * they are upgraded to `full`/`partial` as models are implemented — the
 * definitions (pins, visuals) do not change when that happens.
 */
import type { ComponentDefinition, PinKind, PropertyDefinition } from '../../core/model/component';
import { dipIc, headerModule, type PinSpec } from '../visuals/svgParts';
import { visualOnly, wokwiPins, wokwiSize } from './helpers';

interface Base {
  type: string;
  name: string;
  category: string;
  subcategory: string;
  tags: string[];
  summary: string;
  designator?: string;
  notes?: string;
  properties?: PropertyDefinition[];
  datasheetUrl?: string;
}

/** Visual-only part rendered by a Wokwi element. */
function wk(tag: string, b: Base, fallback: PinKind = 'io', internal?: string[][]): ComponentDefinition {
  return visualOnly({
    type: b.type,
    name: b.name,
    category: b.category,
    subcategory: b.subcategory,
    tags: b.tags,
    designator: b.designator ?? 'U',
    visual: { kind: 'wokwi', tag },
    size: wokwiSize(tag),
    pins: wokwiPins(tag, fallback),
    internalConnections: internal,
    properties: b.properties,
    notes: b.notes,
    docs: { summary: b.summary, datasheetUrl: b.datasheetUrl },
  });
}

/** Simulated part rendered by a Wokwi element. */
function wks(
  tag: string,
  b: Base & {
    model: string;
    support: 'full' | 'partial';
    simNotes: string;
    params?: Record<string, unknown>;
    interaction?: ComponentDefinition['interaction'];
    controls?: ComponentDefinition['controls'];
    indicators?: ComponentDefinition['indicators'];
    attrs?: Record<string, string | number | boolean>;
    pins?: ComponentDefinition['pins'];
    size?: ComponentDefinition['size'];
    propBindings?: Record<string, string>;
  },
  fallback: PinKind = 'io',
  internal?: string[][],
): ComponentDefinition {
  return {
    type: b.type,
    name: b.name,
    category: b.category,
    subcategory: b.subcategory,
    tags: b.tags,
    designator: b.designator ?? 'U',
    visual: { kind: 'wokwi', tag, attrs: b.attrs, propBindings: b.propBindings },
    size: b.size ?? wokwiSize(tag),
    pins: b.pins ?? wokwiPins(tag, fallback),
    internalConnections: internal,
    properties: b.properties ?? [],
    simulation: { support: b.support, model: b.model, params: b.params, notes: b.simNotes },
    interaction: b.interaction,
    controls: b.controls,
    indicators: b.indicators,
    docs: { summary: b.summary, datasheetUrl: b.datasheetUrl },
  };
}

const seg = (pins: string[]) => pins.map((a) => ({ a, c: '$COM' }));
const gates = (fn: string, layout: [string[], string][]) => layout.map(([inputs, output]) => ({ inputs, output, fn }));
const QUAD = (): [string[], string][] => [
  [['1A', '1B'], '1Y'],
  [['2A', '2B'], '2Y'],
  [['3A', '3B'], '3Y'],
  [['4A', '4B'], '4Y'],
];
const live = (key: string, label: string, def: number, min: number, max: number, step: number, unit?: string): PropertyDefinition => ({
  key,
  label,
  type: 'number',
  default: def,
  min,
  max,
  step,
  unit,
  live: true,
});

/** Simulated DIP IC. */
function icSim(b: Base & { label?: string; pins: PinSpec[]; model: string; params?: Record<string, unknown>; simNotes?: string }): ComponentDefinition {
  const v = dipIc({ label: b.label ?? b.name.split(' ')[0], pins: b.pins });
  return {
    type: b.type,
    name: b.name,
    category: b.category,
    subcategory: b.subcategory,
    tags: b.tags,
    designator: b.designator ?? 'U',
    visual: { kind: 'svg', svg: v.svg },
    size: v.size,
    pins: v.pins.map((p) => (p.id === 'VCC' ? { ...p, kind: 'passive' as const, required: true } : p)),
    properties: b.properties ?? [],
    simulation: {
      support: 'full',
      model: b.model,
      params: b.params,
      notes: b.simNotes ?? 'CMOS logic: Schmitt-trigger inputs (0.3/0.6 Vcc), 50 Ω push-pull outputs, zero propagation delay. Powered from its VCC/GND pins.',
    },
    docs: { summary: b.summary, datasheetUrl: b.datasheetUrl },
  };
}

/** Visual-only breakout module with a single header row. */
function mod(b: Base & { pins: PinSpec[]; pcb?: string; chip?: string; width?: number; height?: number; edge?: 'bottom' | 'left' | 'right' }): ComponentDefinition {
  const edge = b.edge ?? 'bottom';
  const v = headerModule({
    title: b.name.replace(/ Module$/, ''),
    pcb: b.pcb,
    [edge]: b.pins,
    chip: b.chip ? { label: b.chip, w: 30, h: 20 } : undefined,
    widthPitches: b.width,
    heightPitches: b.height,
    fallback: 'io',
  });
  return visualOnly({
    type: b.type,
    name: b.name,
    category: b.category,
    subcategory: b.subcategory,
    tags: b.tags,
    designator: b.designator ?? 'U',
    visual: { kind: 'svg', svg: v.svg },
    size: v.size,
    pins: v.pins,
    properties: b.properties,
    notes: b.notes,
    docs: { summary: b.summary, datasheetUrl: b.datasheetUrl },
  });
}

/** Visual-only DIP integrated circuit. */
function ic(b: Base & { label?: string; pins: PinSpec[] }): ComponentDefinition {
  const v = dipIc({ label: b.label ?? b.name.split(' ')[0], pins: b.pins });
  return visualOnly({
    type: b.type,
    name: b.name,
    category: b.category,
    subcategory: b.subcategory,
    tags: b.tags,
    designator: b.designator ?? 'U',
    visual: { kind: 'svg', svg: v.svg },
    size: v.size,
    pins: v.pins,
    properties: b.properties,
    notes: b.notes,
    docs: { summary: b.summary, datasheetUrl: b.datasheetUrl },
  });
}

const V: PinSpec = { id: 'VCC', kind: 'passive' };
const G: PinSpec = { id: 'GND', kind: 'ground' };

// ------------------------------------------------------------------ displays
export const displays: ComponentDefinition[] = [
  wks('wokwi-7segment', {
    type: 'evlab.7segment',
    name: '7-Segment Display',
    category: 'Output',
    subcategory: 'Displays',
    tags: ['7-segment', 'seven segment', 'digit', 'display', 'led'],
    designator: 'DS',
    summary: 'Single-digit 7-segment LED display (common cathode/anode).',
    properties: [{ key: 'common', label: 'Common pin', type: 'enum', default: 'cathode', options: [{ value: 'cathode', label: 'Common cathode' }, { value: 'anode', label: 'Common anode' }] }],
    model: 'led-array',
    support: 'full',
    simNotes: 'Eight piecewise-linear LED segments (Vf 2.0 V).',
    params: { segments: seg(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP']), commonPin: 'COM.1', vf: 2.0 },
  }, 'passive', [['COM.1', 'COM.2']]),
  wks('wokwi-led-bar-graph', {
    type: 'evlab.led-bar-graph',
    name: 'LED Bar Graph (10)',
    category: 'Output',
    subcategory: 'LEDs',
    tags: ['bar graph', 'led', 'level', 'vu'],
    designator: 'LED',
    summary: '10-segment LED bar graph; each segment is an independent LED.',
    model: 'led-array',
    support: 'full',
    simNotes: 'Ten piecewise-linear LED junctions.',
    params: { segments: Array.from({ length: 10 }, (_, i) => ({ a: `A${i + 1}`, c: `C${i + 1}` })) },
  }, 'passive'),
  wk('wokwi-neopixel', {
    type: 'evlab.neopixel',
    name: 'NeoPixel (WS2812B)',
    category: 'Output',
    subcategory: 'LEDs',
    tags: ['neopixel', 'ws2812', 'addressable', 'rgb', 'led'],
    designator: 'LED',
    summary: 'Single addressable RGB LED with integrated controller (800 kHz one-wire protocol).',
    notes: 'WS2812 bit-timing decoder planned (protocol-level fast path).',
  }),
  wk('wokwi-neopixel-matrix', {
    type: 'evlab.neopixel-matrix',
    name: 'NeoPixel Matrix 8×8',
    category: 'Output',
    subcategory: 'LEDs',
    tags: ['neopixel', 'matrix', 'ws2812', 'led matrix'],
    designator: 'LED',
    summary: '8×8 addressable RGB LED matrix.',
    notes: 'WS2812 decoder planned.',
  }),
  wk('wokwi-led-ring', {
    type: 'evlab.neopixel-ring',
    name: 'NeoPixel Ring (16)',
    category: 'Output',
    subcategory: 'LEDs',
    tags: ['neopixel', 'ring', 'ws2812'],
    designator: 'LED',
    summary: 'Ring of 16 addressable RGB LEDs.',
    notes: 'WS2812 decoder planned.',
  }),
  mod({
    type: 'evlab.max7219-matrix',
    name: 'MAX7219 8×8 LED Matrix Module',
    category: 'Output',
    subcategory: 'Displays',
    tags: ['max7219', 'led matrix', 'spi', 'dot matrix'],
    summary: '8×8 red LED matrix driven by a MAX7219 over SPI-like serial.',
    pins: [V, G, 'DIN', 'CS', 'CLK'],
    edge: 'left',
    pcb: '#1e5aa8',
    width: 12,
    height: 11,
    chip: 'MAX7219',
    notes: 'MAX7219 register model planned.',
  }),
  wks('wokwi-lcd1602', {
    type: 'evlab.lcd1602',
    name: 'LCD 16×2 (HD44780)',
    category: 'Output',
    subcategory: 'Displays',
    tags: ['lcd', '1602', 'hd44780', 'character', 'display', 'liquidcrystal'],
    designator: 'LCD',
    summary: 'Character LCD with HD44780 controller (parallel 4/8-bit interface).',
    model: 'hd44780',
    support: 'full',
    simNotes: 'HD44780 instruction set (4/8-bit, DDRAM/CGRAM, cursor, shifting); commands latch on E falling edges. Contrast (V0) and read-back (RW) are not modelled.',
    params: { cols: 16, rows: 2 },
  }, 'input'),
  wks('wokwi-lcd2004', {
    type: 'evlab.lcd2004',
    name: 'LCD 20×4 (HD44780)',
    category: 'Output',
    subcategory: 'Displays',
    tags: ['lcd', '2004', 'hd44780', 'character'],
    designator: 'LCD',
    summary: '20×4 character LCD with HD44780 controller.',
    model: 'hd44780',
    support: 'full',
    simNotes: 'HD44780 instruction set (4/8-bit, DDRAM/CGRAM, cursor, shifting); commands latch on E falling edges. Contrast (V0) and read-back (RW) are not modelled.',
    params: { cols: 16, rows: 2 },
  }, 'input'),
  wks('wokwi-lcd1602', {
    type: 'evlab.lcd1602-i2c',
    name: 'LCD 16×2 I2C (PCF8574)',
    category: 'Output',
    subcategory: 'Displays',
    tags: ['lcd', 'i2c', 'pcf8574', '1602', 'liquidcrystal_i2c', 'twi'],
    designator: 'LCD',
    summary: 'HD44780 LCD with a PCF8574 I2C backpack (default address 0x27). Uno: SDA = A4, SCL = A5.',
    attrs: { pins: 'i2c' },
    size: { width: 302.35, height: 139.26 },
    pins: [
      { id: 'GND', x: 4, y: 32, kind: 'ground' },
      { id: 'VCC', x: 4, y: 41.5, kind: 'passive', required: true },
      { id: 'SDA', x: 4, y: 51, kind: 'io', signals: ['i2c:SDA'], required: true },
      { id: 'SCL', x: 4, y: 60.5, kind: 'io', signals: ['i2c:SCL'], required: true },
    ],
    properties: [{ key: 'address', label: 'I2C address', type: 'enum', default: '0x27', options: [{ value: '0x27', label: '0x27' }, { value: '0x3F', label: '0x3F' }, { value: '0x20', label: '0x20' }] }],
    model: 'lcd-i2c',
    support: 'full',
    simNotes: "Protocol-level I2C target on the MCU's TWI peripheral (SDA/SCL must be wired to the board's I2C pins). PCF8574 to HD44780 mapping as in LiquidCrystal_I2C (P0=RS, P2=E, P3=backlight, P4-P7=D4-D7). Bus electrical levels and pull-ups are not modelled.",
    params: { cols: 16, rows: 2 },
  }),
  wk('wokwi-ssd1306', {
    type: 'evlab.ssd1306',
    name: 'OLED 128×64 (SSD1306, I2C)',
    category: 'Output',
    subcategory: 'Displays',
    tags: ['oled', 'ssd1306', 'i2c', '128x64', 'display', 'adafruit_ssd1306'],
    designator: 'DS',
    summary: 'Monochrome 0.96" OLED with SSD1306 controller.',
    notes: 'SSD1306 I2C command/framebuffer model planned.',
  }),
  wk('wokwi-ili9341', {
    type: 'evlab.ili9341',
    name: 'TFT 2.8" (ILI9341, SPI)',
    category: 'Output',
    subcategory: 'Displays',
    tags: ['tft', 'ili9341', 'spi', 'color', 'display'],
    designator: 'DS',
    summary: '240×320 colour TFT with ILI9341 controller over SPI.',
    notes: 'ILI9341 SPI model planned.',
  }),
];

// ---------------------------------------------------------------- digital ICs
/** Standard quad 2-input gate pinout (74xx00/08/32/86). */
const gatePins = (): PinSpec[] => ['1A', '1B', '1Y', '2A', '2B', '2Y', G, '3Y', '3A', '3B', '4Y', '4A', '4B', V];

export const ics: ComponentDefinition[] = [
  icSim({ type: 'evlab.74hc00', name: '74HC00 Quad NAND', category: 'Integrated Circuits', subcategory: 'Logic Gates', tags: ['74hc00', 'nand', 'logic', 'gate', 'cmos'], summary: 'Four 2-input NAND gates.', pins: gatePins() , model: 'logic-gates', params: { gates: gates('nand', QUAD()) } }),
  icSim({ type: 'evlab.74hc02', name: '74HC02 Quad NOR', category: 'Integrated Circuits', subcategory: 'Logic Gates', tags: ['74hc02', 'nor', 'logic', 'gate'], summary: 'Four 2-input NOR gates.', pins: ['1Y', '1A', '1B', '2Y', '2A', '2B', G, '3A', '3B', '3Y', '4A', '4B', '4Y', V] , model: 'logic-gates', params: { gates: gates('nor', QUAD()) } }),
  icSim({ type: 'evlab.74hc04', name: '74HC04 Hex Inverter', category: 'Integrated Circuits', subcategory: 'Logic Gates', tags: ['74hc04', 'not', 'inverter', 'logic'], summary: 'Six inverters.', pins: ['1A', '1Y', '2A', '2Y', '3A', '3Y', G, '4Y', '4A', '5Y', '5A', '6Y', '6A', V] , model: 'logic-gates', params: { gates: gates('not', [1, 2, 3, 4, 5, 6].map((n): [string[], string] => [[`${n}A`], `${n}Y`])) } }),
  icSim({ type: 'evlab.74hc08', name: '74HC08 Quad AND', category: 'Integrated Circuits', subcategory: 'Logic Gates', tags: ['74hc08', 'and', 'logic', 'gate'], summary: 'Four 2-input AND gates.', pins: gatePins() , model: 'logic-gates', params: { gates: gates('and', QUAD()) } }),
  icSim({ type: 'evlab.74hc32', name: '74HC32 Quad OR', category: 'Integrated Circuits', subcategory: 'Logic Gates', tags: ['74hc32', 'or', 'logic', 'gate'], summary: 'Four 2-input OR gates.', pins: gatePins() , model: 'logic-gates', params: { gates: gates('or', QUAD()) } }),
  icSim({ type: 'evlab.74hc86', name: '74HC86 Quad XOR', category: 'Integrated Circuits', subcategory: 'Logic Gates', tags: ['74hc86', 'xor', 'logic', 'gate'], summary: 'Four 2-input XOR gates.', pins: gatePins() , model: 'logic-gates', params: { gates: gates('xor', QUAD()) } }),
  icSim({ type: 'evlab.74hc595', name: '74HC595 Shift Register', category: 'Integrated Circuits', subcategory: 'Shift Registers', tags: ['74hc595', 'shift register', 'sipo', 'serial', 'shiftout'], summary: '8-bit serial-in, parallel-out shift register with output latch.', pins: ['QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH', G, "QH'", 'SRCLR', 'SRCLK', 'RCLK', 'OE', 'SER', 'QA', V] , model: '74hc595', simNotes: 'Edge-accurate shift/latch logic with push-pull outputs. Also acts as a protocol-level SPI peripheral when SER/SRCLK are wired to MOSI/SCK. Tie OE to GND and SRCLR to VCC.' }),
  ic({ type: 'evlab.74hc165', name: '74HC165 Shift Register (PISO)', category: 'Integrated Circuits', subcategory: 'Shift Registers', tags: ['74hc165', 'piso', 'shift register', 'input'], summary: '8-bit parallel-in, serial-out shift register.', pins: ['SH/LD', 'CLK', 'E', 'F', 'G', 'H', "QH'", G, 'QH', 'SER', 'A', 'B', 'C', 'D', 'CLKINH', V] }),
  ic({ type: 'evlab.cd4017', name: 'CD4017 Decade Counter', category: 'Integrated Circuits', subcategory: 'Counters', tags: ['4017', 'counter', 'decade', 'johnson'], summary: 'Decade counter with 10 decoded outputs.', pins: ['Q5', 'Q1', 'Q0', 'Q2', 'Q6', 'Q7', 'Q3', G, 'Q8', 'Q4', 'Q9', 'CO', 'EN', 'CLK', 'RST', V] }),
  ic({ type: 'evlab.74hc4051', name: '74HC4051 8-ch Multiplexer', category: 'Integrated Circuits', subcategory: 'Multiplexers', tags: ['4051', 'mux', 'multiplexer', 'analog switch'], summary: '8-channel analog multiplexer/demultiplexer.', pins: ['Y4', 'Y6', 'Z', 'Y7', 'Y5', 'E', 'VEE', G, 'S2', 'S1', 'S0', 'Y3', 'Y0', 'Y1', 'Y2', V] }),
  ic({ type: 'evlab.ne555', name: 'NE555 Timer', category: 'Integrated Circuits', subcategory: 'Timers', tags: ['555', 'ne555', 'timer', 'astable', 'monostable', 'oscillator'], summary: 'Classic timer IC for astable/monostable circuits.', pins: [G, 'TRIG', 'OUT', 'RESET', 'CTRL', 'THRES', 'DISCH', V], notes: 'Needs capacitor dynamics (transient engine, planned).' }),
  ic({ type: 'evlab.lm358', name: 'LM358 Dual Op-Amp', category: 'Integrated Circuits', subcategory: 'Op-Amps', tags: ['lm358', 'op-amp', 'opamp', 'amplifier', 'comparator'], summary: 'Dual single-supply operational amplifier.', pins: ['OUT1', 'IN1-', 'IN1+', G, 'IN2+', 'IN2-', 'OUT2', V], notes: 'Op-amp macro-model (VCCS + rails) planned.' }),
  ic({ type: 'evlab.lm393', name: 'LM393 Dual Comparator', category: 'Integrated Circuits', subcategory: 'Op-Amps', tags: ['lm393', 'comparator'], summary: 'Dual open-collector voltage comparator.', pins: ['OUT1', 'IN1-', 'IN1+', G, 'IN2+', 'IN2-', 'OUT2', V] }),
  ic({ type: 'evlab.uln2003', name: 'ULN2003 Darlington Array', category: 'Integrated Circuits', subcategory: 'Drivers', tags: ['uln2003', 'darlington', 'driver', 'stepper'], summary: 'Seven Darlington pairs with flyback diodes.', pins: ['IN1', 'IN2', 'IN3', 'IN4', 'IN5', 'IN6', 'IN7', G, 'COM', 'OUT7', 'OUT6', 'OUT5', 'OUT4', 'OUT3', 'OUT2', 'OUT1'] }),
  ic({ type: 'evlab.l293d', name: 'L293D Motor Driver', category: 'Actuators', subcategory: 'Motor Drivers', tags: ['l293d', 'h-bridge', 'motor driver'], summary: 'Quadruple half-H driver (600 mA per channel).', pins: ['EN1,2', '1A', '1Y', 'GND.1', 'GND.2', '2Y', '2A', 'VCC2', '3A', '3Y', 'GND.3', 'GND.4', '4Y', '4A', 'EN3,4', 'VCC1'] }),
  ic({ type: 'evlab.atmega328p-dip', name: 'ATmega328P (DIP-28)', category: 'Boards', subcategory: 'AVR chips', tags: ['atmega328p', 'avr', 'dip', 'standalone'], summary: 'Bare ATmega328P for standalone Arduino circuits.', pins: ['PC6/RST', 'PD0', 'PD1', 'PD2', 'PD3', 'PD4', { id: 'VCC', kind: 'passive' }, 'GND', 'PB6', 'PB7', 'PD5', 'PD6', 'PD7', 'PB0', 'PB1', 'PB2', 'PB3', 'PB4', 'PB5', 'AVCC', 'AREF', 'GND.2', 'PC0', 'PC1', 'PC2', 'PC3', 'PC4', 'PC5'], notes: 'Standalone-chip support (external clock/power wiring) planned; use the Uno/Nano board meanwhile.' }),
];

// -------------------------------------------------------------------- sensors
export const sensors: ComponentDefinition[] = [
  wks('wokwi-dht22', {
    type: 'evlab.dht22',
    name: 'DHT22 Temperature & Humidity',
    category: 'Sensors',
    subcategory: 'Environmental',
    tags: ['dht22', 'am2302', 'temperature', 'humidity', 'dht'],
    summary: 'Digital temperature/humidity sensor with a single-wire protocol. Works with the DHT sensor library; the data pin needs a pull-up (INPUT_PULLUP is used by the library).',
    properties: [live('temperature', 'Temperature', 24, -40, 80, 0.1, '°C'), live('humidity', 'Humidity', 40, 0, 100, 0.1, '%')],
    model: 'dht',
    support: 'full',
    simNotes: 'Single-wire protocol with datasheet timings (start ≥1 ms, 80/80 µs response, 50 µs + 26/70 µs bits, checksum). Measurement noise and the 2 s refresh limit are not enforced (a warning is shown).',
    params: { data: 'SDA' },
    controls: [
      { kind: 'slider', prop: 'temperature', icon: 'thermometer' },
      { kind: 'slider', prop: 'humidity', icon: 'droplets' },
    ],
    indicators: [{ kind: 'pulse', value: '_reads', at: { x: 28.5, y: 28 }, color: '#4caf50' }],
  }, 'io'),
  (() => {
    const d = headerModule({ title: 'DHT11', pcb: '#2266aa', bottom: [V, 'DATA', G], fallback: 'io' });
    return {
      type: 'evlab.dht11',
      name: 'DHT11 Module',
      category: 'Sensors',
      subcategory: 'Environmental',
      tags: ['dht11', 'temperature', 'humidity'],
      designator: 'U',
      visual: { kind: 'svg', svg: d.svg },
      size: d.size,
      pins: d.pins,
      properties: [live('temperature', 'Temperature', 24, 0, 50, 1, '°C'), live('humidity', 'Humidity', 40, 20, 90, 1, '%')],
      simulation: { support: 'full', model: 'dht', params: { data: 'DATA', variant: 'dht11' }, notes: 'DHT11 single-wire protocol (18 ms start, integer readings).' },
      controls: [
        { kind: 'slider', prop: 'temperature', icon: 'thermometer' },
        { kind: 'slider', prop: 'humidity', icon: 'droplets' },
      ],
      indicators: [{ kind: 'pulse', value: '_reads', at: { x: d.size.width / 2, y: 14 }, color: '#4caf50' }],
      docs: { summary: 'Basic temperature/humidity sensor module with an on-board pull-up.' },
    } as ComponentDefinition;
  })(),
  mod({ type: 'evlab.bme280', name: 'BME280 Module', category: 'Sensors', subcategory: 'Environmental', tags: ['bme280', 'pressure', 'humidity', 'temperature', 'i2c', 'barometer'], summary: 'Pressure, humidity and temperature sensor (I2C/SPI).', pins: [V, G, 'SCL', 'SDA'], pcb: '#6a1b9a', chip: 'BME280', notes: 'I2C register model planned.' }),
  mod({ type: 'evlab.bmp180', name: 'BMP180 Module', category: 'Sensors', subcategory: 'Environmental', tags: ['bmp180', 'pressure', 'barometer', 'i2c'], summary: 'Barometric pressure sensor (I2C).', pins: [V, G, 'SCL', 'SDA'], pcb: '#6a1b9a', notes: 'I2C register model planned.' }),
  mod({ type: 'evlab.ds18b20', name: 'DS18B20 Temperature Probe', category: 'Sensors', subcategory: 'Temperature', tags: ['ds18b20', 'onewire', '1-wire', 'temperature', 'dallas'], summary: '1-Wire digital thermometer.', pins: [G, 'DQ', V], pcb: '#333', notes: '1-Wire protocol model planned.' }),
  mod({ type: 'evlab.lm35', name: 'LM35 Temperature Sensor', category: 'Sensors', subcategory: 'Temperature', tags: ['lm35', 'temperature', 'analog'], summary: 'Analog temperature sensor, 10 mV/°C.', pins: [V, 'OUT', G], pcb: '#333', notes: 'Behavioural source model planned.' }),
  wks('wokwi-ntc-temperature-sensor', {
    type: 'evlab.ntc-module',
    name: 'NTC Temperature Module',
    category: 'Sensors',
    subcategory: 'Temperature',
    tags: ['ntc', 'thermistor', 'temperature', 'module'],
    summary: 'NTC thermistor (10k, β=3950) in a voltage divider with a 10k resistor; OUT rises with temperature.',
    properties: [live('temperature', 'Temperature', 25, -40, 125, 0.5, '°C')],
    model: 'analog-module',
    support: 'full',
    simNotes: 'Divider output from the β-model, sourced through 1 kΩ.',
    params: { ao: 'OUT', sensor: 'ntc' },
    controls: [{ kind: 'slider', prop: 'temperature', icon: 'thermometer' }],
  }),
  wks('wokwi-photoresistor-sensor', {
    type: 'evlab.ldr-module',
    name: 'Photoresistor Module',
    category: 'Sensors',
    subcategory: 'Light',
    tags: ['ldr', 'light', 'module', 'photoresistor'],
    summary: 'LDR module with analog (AO, higher = brighter) and comparator (DO, LOW when brighter than the threshold) outputs.',
    properties: [live('lux', 'Illuminance', 300, 0.1, 100000, 10, 'lux'), live('threshold', 'DO threshold (fraction)', 0.5, 0, 1, 0.01)],
    model: 'analog-module',
    support: 'full',
    simNotes: 'LDR (GL55xx curve) against 10 kΩ; DO comparator with ideal threshold (no hysteresis).',
    params: { ao: 'AO', do: 'DO', sensor: 'ldr' },
    controls: [{ kind: 'slider', prop: 'lux', icon: 'sun', log: true }],
    indicators: [{ kind: 'glow', value: 'prop:lux', at: { x: 18, y: 32 }, radius: 30, color: '#ffd54f', max: 100000, log: true }],
  }),
  mod({ type: 'evlab.bh1750', name: 'BH1750 Light Sensor', category: 'Sensors', subcategory: 'Light', tags: ['bh1750', 'lux', 'light', 'i2c'], summary: 'Digital ambient light sensor (I2C).', pins: [V, G, 'SCL', 'SDA', 'ADDR'], pcb: '#1e5aa8', notes: 'I2C model planned.' }),
  wks('wokwi-gas-sensor', {
    type: 'evlab.mq2',
    name: 'MQ-2 Gas Sensor',
    category: 'Sensors',
    subcategory: 'Gas',
    tags: ['mq2', 'gas', 'smoke', 'lpg', 'mq'],
    summary: 'Combustible gas/smoke sensor module (analog + digital outputs).',
    properties: [live('level', 'Gas level (fraction of AO range)', 0.2, 0, 1, 0.01), live('threshold', 'DO threshold (fraction)', 0.5, 0, 1, 0.01)],
    model: 'analog-module',
    support: 'partial',
    simNotes: 'AO is set directly from the "gas level" property; heater warm-up and ppm curves are not modelled.',
    params: { ao: 'AOUT', do: 'DOUT', sensor: 'level' },
    controls: [{ kind: 'slider', prop: 'level', icon: 'wind', label: 'gas', min: 0, max: 1 }],
    indicators: [
      { kind: 'glow', value: '_level', at: { x: 40, y: 33 }, radius: 40, color: '#90a4ae' },
      { kind: 'readout', value: '_triggered', map: { true: 'DO: gas detected', false: 'DO: clear' } },
    ],
  }),
  mod({ type: 'evlab.mq135', name: 'MQ-135 Air Quality Sensor', category: 'Sensors', subcategory: 'Gas', tags: ['mq135', 'air quality', 'co2', 'gas'], summary: 'Air-quality gas sensor module.', pins: [V, G, 'DO', 'AO'], pcb: '#1e5aa8' }),
  wks('wokwi-pir-motion-sensor', {
    type: 'evlab.pir',
    name: 'PIR Motion Sensor (HC-SR501)',
    category: 'Sensors',
    subcategory: 'Motion',
    tags: ['pir', 'motion', 'hc-sr501', 'presence'],
    summary: 'Passive infrared motion detector: OUT goes HIGH for the hold time after motion. Click the sensor while simulating to simulate motion.',
    properties: [{ key: 'holdTime', label: 'Hold time', type: 'number', default: 2.5, unit: 's', min: 0.5, max: 300, step: 0.5 }],
    model: 'event-sensor',
    support: 'full',
    simNotes: 'Digital output with retriggerable hold time; detection range and warm-up are not modelled.',
    interaction: { kind: 'momentary', input: 'trigger' },
    controls: [
      { kind: 'action', input: 'trigger', label: 'Person passes', icon: 'footprints', mode: 'trigger' },
      { kind: 'slider', prop: 'holdTime', icon: 'clock', label: 'hold', min: 0.5, max: 30, step: 0.5 },
    ],
    indicators: [
      { kind: 'cone', value: '_active', origin: { x: 45.3, y: 10 }, direction: 'up', length: 110, spread: 80, color: '#ef6c00' },
      { kind: 'readout', value: '_active', map: { true: 'OUT HIGH · motion', false: 'OUT LOW · idle' } },
    ],
  }),
  wk('wokwi-mpu6050', { type: 'evlab.mpu6050', name: 'MPU-6050 Accelerometer/Gyro', category: 'Sensors', subcategory: 'Motion', tags: ['mpu6050', 'imu', 'accelerometer', 'gyroscope', 'i2c'], summary: '6-axis IMU (I2C).', notes: 'I2C register model planned.' }),
  wks('wokwi-tilt-switch', {
    type: 'evlab.tilt-switch',
    name: 'Tilt Switch Module',
    category: 'Sensors',
    subcategory: 'Motion',
    tags: ['tilt', 'switch', 'sw-520d'],
    summary: 'Ball tilt switch module with digital output. Click to tilt / untilt while simulating.',
    model: 'event-sensor',
    support: 'full',
    simNotes: 'OUT is HIGH while tilted; contact chatter is not modelled.',
    params: { tiltAngle: -25 },
    interaction: { kind: 'toggle', input: 'toggle' },
    controls: [{ kind: 'action', input: 'toggle', label: 'Tilt / level', icon: 'rotate', mode: 'trigger' }],
    indicators: [{ kind: 'readout', value: '_active', map: { true: 'tilted · OUT HIGH', false: 'level · OUT LOW' } }],
  }),
  wks('wokwi-hc-sr04', {
    type: 'evlab.hc-sr04',
    name: 'HC-SR04 Ultrasonic Sensor',
    category: 'Sensors',
    subcategory: 'Distance',
    tags: ['hc-sr04', 'ultrasonic', 'distance', 'sonar', 'range'],
    summary: 'Ultrasonic distance sensor, 2–400 cm. Pulse TRIG for 10 µs, then measure the ECHO pulse width with pulseIn() (58 µs per cm). Drag the obstacle in front of it to change the distance.',
    properties: [live('distance', 'Distance to obstacle', 100, 2, 450, 1, 'cm')],
    model: 'hc-sr04',
    support: 'full',
    simNotes: 'Trigger detection (≥8 µs), 250 µs burst latency, echo width = 2·d / 343 m/s; >400 cm returns a 38 ms timeout pulse.',
    controls: [{ kind: 'range-target', prop: 'distance', min: 2, max: 400, unit: 'cm', origin: { x: 85, y: 4 }, direction: 'up', scale: 1, pingKey: '_pings' }],
  }),
  mod({ type: 'evlab.vl53l0x', name: 'VL53L0X ToF Sensor', category: 'Sensors', subcategory: 'Distance', tags: ['vl53l0x', 'tof', 'laser', 'distance', 'i2c'], summary: 'Time-of-flight laser distance sensor (I2C).', pins: [V, G, 'SCL', 'SDA', 'XSHUT', 'GPIO1'], pcb: '#6a1b9a' }),
  mod({ type: 'evlab.sharp-gp2y0a21', name: 'Sharp GP2Y0A21 IR Distance', category: 'Sensors', subcategory: 'Distance', tags: ['sharp', 'ir', 'distance', 'analog'], summary: 'Analog infrared distance sensor (10–80 cm).', pins: ['VO', G, V], pcb: '#333' }),
  wk('wokwi-ir-receiver', { type: 'evlab.ir-receiver', name: 'IR Receiver (38 kHz)', category: 'Sensors', subcategory: 'Infrared', tags: ['ir', 'infrared', 'receiver', 'vs1838', 'remote'], summary: 'Demodulating 38 kHz IR receiver.' }),
  wk('wokwi-ir-remote', { type: 'evlab.ir-remote', name: 'IR Remote Control', category: 'Sensors', subcategory: 'Infrared', tags: ['ir', 'remote', 'nec'], summary: 'NEC infrared remote control (pairs with the IR receiver).' }),
  wks('wokwi-flame-sensor', {
    type: 'evlab.flame-sensor',
    name: 'Flame Sensor',
    category: 'Sensors',
    subcategory: 'Infrared',
    tags: ['flame', 'fire', 'ir'],
    summary: 'IR flame detector module (analog + comparator output).',
    properties: [live('level', 'IR level (fraction)', 0.1, 0, 1, 0.01), live('threshold', 'DO threshold (fraction)', 0.5, 0, 1, 0.01)],
    model: 'analog-module',
    support: 'partial',
    simNotes: 'AO follows the "IR level" property directly.',
    params: { ao: 'AOUT', do: 'DOUT', sensor: 'level' },
    controls: [
      { kind: 'slider', prop: 'level', icon: 'flame', label: 'flame', min: 0, max: 1 },
      { kind: 'action', input: 'burst', label: 'Flicker', icon: 'flame', mode: 'trigger' },
    ],
    indicators: [
      { kind: 'glow', value: '_level', at: { x: 14, y: 32 }, radius: 34, color: '#ff7043' },
      { kind: 'readout', value: '_triggered', map: { true: 'DO: flame', false: 'DO: none' } },
    ],
  }),
  mod({ type: 'evlab.a3144', name: 'A3144 Hall Effect Sensor', category: 'Sensors', subcategory: 'Magnetic', tags: ['hall', 'a3144', 'magnetic'], summary: 'Digital (unipolar) Hall-effect switch.', pins: [V, G, 'OUT'], pcb: '#333' }),
  mod({ type: 'evlab.acs712', name: 'ACS712 Current Sensor', category: 'Sensors', subcategory: 'Electrical', tags: ['acs712', 'current', 'hall'], summary: 'Hall-effect current sensor with analog output (185 mV/A for 5 A).', pins: [V, 'OUT', G], pcb: '#c62828' }),
  mod({ type: 'evlab.ina219', name: 'INA219 Current/Power Monitor', category: 'Sensors', subcategory: 'Electrical', tags: ['ina219', 'current', 'voltage', 'power', 'i2c'], summary: 'High-side current/voltage monitor (I2C).', pins: [V, G, 'SCL', 'SDA', 'VIN+', 'VIN-'], pcb: '#6a1b9a' }),
  mod({ type: 'evlab.voltage-sensor', name: 'Voltage Sensor Module (0–25 V)', category: 'Sensors', subcategory: 'Electrical', tags: ['voltage', 'divider', 'sensor'], summary: '5:1 resistive divider module for measuring up to 25 V.', pins: ['S', '+', '-'], pcb: '#c62828' }),
  wk('wokwi-hx711', { type: 'evlab.hx711', name: 'HX711 Load Cell Amplifier', category: 'Sensors', subcategory: 'Force', tags: ['hx711', 'load cell', 'scale', 'weight'], summary: '24-bit ADC for load cells.', notes: 'Clocked serial model planned.' }),
  wks('wokwi-big-sound-sensor', {
    type: 'evlab.sound-sensor',
    name: 'Sound Sensor (KY-038)',
    category: 'Sensors',
    subcategory: 'Sound',
    tags: ['sound', 'microphone', 'ky-038'],
    summary: 'Microphone module with analog/digital outputs.',
    properties: [live('level', 'Sound level (fraction)', 0.2, 0, 1, 0.01), live('threshold', 'DO threshold (fraction)', 0.5, 0, 1, 0.01)],
    model: 'analog-module',
    support: 'partial',
    simNotes: 'AO is a static level set by the property (no audio waveform); "Clap" produces a 150 ms loud burst.',
    params: { ao: 'AOUT', do: 'DOUT', sensor: 'level' },
    controls: [
      { kind: 'slider', prop: 'level', icon: 'volume', label: 'sound', min: 0, max: 1 },
      { kind: 'action', input: 'burst', label: 'Clap', icon: 'hand', mode: 'trigger' },
    ],
    indicators: [
      { kind: 'waves', value: '_triggered', at: { x: 128, y: 27 }, direction: 'right', color: '#7e57c2' },
      { kind: 'readout', value: '_triggered', map: { true: 'DO: loud', false: 'DO: quiet' } },
    ],
  }),
  wk('wokwi-heart-beat-sensor', { type: 'evlab.pulse-sensor', name: 'Pulse Sensor', category: 'Sensors', subcategory: 'Biometric', tags: ['heart', 'pulse', 'bpm'], summary: 'Optical heart-rate sensor (analog).' }),
  wks('wokwi-analog-joystick', {
    type: 'evlab.joystick',
    name: 'Analog Joystick',
    category: 'Input',
    subcategory: 'Joysticks',
    tags: ['joystick', 'thumbstick', 'analog', 'xy'],
    summary: 'Two 10 kΩ potentiometers (HORZ, VERT) and a push switch to GND (SEL — use INPUT_PULLUP). While simulating, drag the stick (it springs back) and click it to press. Up = VERT high, left = HORZ high.',
    properties: [live('x', 'X resting position', 0.5, 0, 1, 0.01), live('y', 'Y resting position', 0.5, 0, 1, 0.01)],
    model: 'joystick',
    support: 'full',
    simNotes: 'Linear potentiometers and an ideal switch.',
    controls: [{ kind: 'stick', xProp: 'x', yProp: 'y', center: { x: 51.4, y: 51.4 }, radius: 36, invertX: true, invertY: true, pressInput: 'pressed' }],
  }),
  wk('wokwi-ky-040', { type: 'evlab.ky040', name: 'Rotary Encoder (KY-040)', category: 'Input', subcategory: 'Encoders', tags: ['rotary encoder', 'ky-040', 'quadrature', 'encoder'], summary: 'Incremental quadrature rotary encoder with push switch.' }),
  wks('wokwi-dip-switch-8', {
    type: 'evlab.dip-switch-8',
    name: 'DIP Switch (8)',
    category: 'Input',
    subcategory: 'Switches',
    tags: ['dip switch', 'switch', 'configuration'],
    designator: 'SW',
    summary: 'Eight independent SPST switches (Na ↔ Nb). Click a lever to flip it (also when stopped: select the part first).',
    properties: Array.from({ length: 8 }, (_, i) => ({ key: `sw${i + 1}`, label: `Switch ${i + 1}`, type: 'boolean' as const, default: false, live: true })),
    model: 'switch-array',
    support: 'full',
    simNotes: 'Ideal contacts (50 mΩ).',
    params: { pairs: Array.from({ length: 8 }, (_, i) => [`${i + 1}a`, `${i + 1}b`]) },
    controls: [{ kind: 'keys', keys: Array.from({ length: 8 }, (_, i) => ({ id: `${i + 1}`, label: `Switch ${i + 1}`, x: 3.6 + i * 9.6, y: 12, w: 9, h: 30, prop: `sw${i + 1}` })) }],
  }, 'passive'),
  wk('wokwi-membrane-keypad', { type: 'evlab.keypad-4x4', name: 'Membrane Keypad 4×4', category: 'Input', subcategory: 'Keypads', tags: ['keypad', 'matrix', 'membrane', '4x4'], summary: '16-key matrix keypad (4 rows × 4 columns).' }, 'passive'),
  wk('wokwi-rotary-dialer', { type: 'evlab.rotary-dialer', name: 'Rotary Dialer', category: 'Input', subcategory: 'Switches', tags: ['rotary', 'dialer', 'telephone', 'pulse'], summary: 'Telephone rotary dial generating pulses.' }),
  wk('wokwi-ds1307', { type: 'evlab.ds1307', name: 'DS1307 RTC Module', category: 'Communication', subcategory: 'I2C Devices', tags: ['rtc', 'ds1307', 'clock', 'i2c', 'time'], summary: 'Real-time clock with battery backup (I2C 0x68).', notes: 'I2C register model planned.' }),
  wk('wokwi-microsd-card', { type: 'evlab.microsd', name: 'microSD Card Module', category: 'Communication', subcategory: 'SPI Devices', tags: ['sd card', 'microsd', 'spi', 'storage'], summary: 'microSD card in SPI mode.', notes: 'SD SPI protocol + FAT image planned.' }),
];

// ------------------------------------------------------------------ actuators
export const actuators: ComponentDefinition[] = [
  wks('wokwi-servo', {
    type: 'evlab.servo',
    name: 'Servo Motor (SG90)',
    category: 'Actuators',
    subcategory: 'Motors',
    tags: ['servo', 'sg90', 'motor', 'pwm', 'angle'],
    designator: 'M',
    summary: 'Hobby servo: 50 Hz pulses of 0.544–2.4 ms set the angle (Servo library). Power V+ from 5 V.',
    model: 'servo',
    support: 'partial',
    simNotes: 'Decodes pulse width to angle (Servo library calibration) and moves at ~600°/s. Load, torque and supply current are not modelled.',
    indicators: [{ kind: 'readout', value: 'angle', unit: '°', digits: 3, anchor: 'top' }],
  }),
  wk('wokwi-stepper-motor', { type: 'evlab.stepper', name: 'Stepper Motor (NEMA 17)', category: 'Actuators', subcategory: 'Motors', tags: ['stepper', 'nema17', 'bipolar', 'motor'], designator: 'M', summary: 'Bipolar stepper motor, 200 steps/rev.' }),
  wk('wokwi-biaxial-stepper', { type: 'evlab.biaxial-stepper', name: 'Biaxial Stepper Motor', category: 'Actuators', subcategory: 'Motors', tags: ['stepper', 'biaxial', 'clock'], designator: 'M', summary: 'Two concentric stepper motors (e.g. clock hands).' }),
  mod({ type: 'evlab.dc-motor', name: 'DC Motor', category: 'Actuators', subcategory: 'Motors', tags: ['dc motor', 'motor', 'brushed'], designator: 'M', summary: 'Brushed DC motor.', pins: ['+', '-'], pcb: '#9e9e9e', notes: 'Electromechanical model (R + back-EMF) planned.' }),
  mod({ type: 'evlab.28byj48', name: '28BYJ-48 Stepper + ULN2003', category: 'Actuators', subcategory: 'Motors', tags: ['28byj-48', 'stepper', 'uln2003', 'unipolar'], designator: 'M', summary: 'Geared unipolar stepper with ULN2003 driver board.', pins: ['IN1', 'IN2', 'IN3', 'IN4', '-', '+'], pcb: '#1b5e20' }),
  mod({ type: 'evlab.a4988', name: 'A4988 Stepper Driver', category: 'Actuators', subcategory: 'Motor Drivers', tags: ['a4988', 'stepper driver', 'step', 'dir'], summary: 'Microstepping bipolar stepper driver (STEP/DIR).', pins: ['EN', 'MS1', 'MS2', 'MS3', 'RST', 'SLP', 'STEP', 'DIR'], edge: 'left', pcb: '#2e7d32', height: 10, width: 8 }),
  mod({ type: 'evlab.l298n', name: 'L298N Motor Driver', category: 'Actuators', subcategory: 'Motor Drivers', tags: ['l298n', 'h-bridge', 'motor driver', 'dual'], summary: 'Dual H-bridge for two DC motors or one stepper.', pins: ['ENA', 'IN1', 'IN2', 'IN3', 'IN4', 'ENB', '12V', G, '5V'], pcb: '#c62828', chip: 'L298N' }),
  wks('wokwi-buzzer', {
    type: 'evlab.buzzer',
    name: 'Piezo Buzzer',
    category: 'Actuators',
    subcategory: 'Sound',
    tags: ['buzzer', 'piezo', 'tone', 'sound', 'beeper'],
    designator: 'BZ',
    summary: 'Passive piezo buzzer — drive it with tone(pin, frequency). The tone is played through your speakers while simulating (toggle sound in the View menu).',
    model: 'buzzer',
    support: 'partial',
    simNotes: 'Detects the drive frequency from pin edges and plays a pure tone; acoustic response is not modelled.',
    indicators: [
      { kind: 'waves', value: 'hasSignal', at: { x: 37.5, y: 22 }, direction: 'up', color: '#7e57c2' },
      { kind: 'readout', value: 'frequency', engineering: true, unit: 'Hz', anchor: 'top' },
    ],
  }, 'passive'),
  wks('wokwi-ks2e-m-dc5', {
    type: 'evlab.relay-ks2e',
    name: 'Relay KS2E-M-DC5 (DPDT)',
    category: 'Actuators',
    subcategory: 'Relays',
    tags: ['relay', 'dpdt', 'coil', 'switch'],
    designator: 'K',
    summary: '5 V DPDT signal relay (coil ≈125 Ω, 40 mA). Drive the coil through a transistor and add a flyback diode — an I/O pin alone cannot supply 40 mA safely.',
    model: 'relay',
    support: 'full',
    simNotes: 'Resistive coil with pull-in 3.75 V / drop-out 1.5 V hysteresis; ideal contacts. Switching time and inductive kick are not modelled.',
    params: { coil: ['COIL1', 'COIL2'], rCoil: 125, poles: [{ com: 'P1', no: 'NO1', nc: 'NC1' }, { com: 'P2', no: 'NO2', nc: 'NC2' }] },
    indicators: [{ kind: 'readout', value: '_energized', map: { true: 'coil ON · COM–NO', false: 'coil off · COM–NC' } }],
  }, 'passive'),
  (() => {
    const d = headerModule({ title: 'Relay Module', pcb: '#1e5aa8', bottom: ['IN', G, { id: 'VCC', kind: 'passive' }, { id: 'COM', kind: 'passive' }, { id: 'NO', kind: 'passive' }, { id: 'NC', kind: 'passive' }], fallback: 'io', chip: { label: 'SRD-05VDC', w: 44, h: 22, color: '#2b4fa8' } });
    return {
      type: 'evlab.relay-module',
      name: 'Relay Module (1 ch)',
      category: 'Actuators',
      subcategory: 'Relays',
      tags: ['relay', 'module', 'srd-05vdc', 'mains'],
      designator: 'K',
      visual: { kind: 'svg', svg: d.svg },
      size: d.size,
      pins: d.pins,
      properties: [{ key: 'trigger', label: 'Trigger', type: 'enum', default: 'low', options: [{ value: 'low', label: 'Active LOW' }, { value: 'high', label: 'Active HIGH' }] }],
      simulation: { support: 'full', model: 'relay-module', notes: 'Opto-isolated input (≈1 kΩ to VCC); COM switches between NC and NO. Contact timing not modelled.' },
      indicators: [{ kind: 'readout', value: '_energized', map: { true: 'ON · COM–NO', false: 'off · COM–NC' } }],
      docs: { summary: '5 V relay module with optocoupler and driver transistor. Most modules switch on when IN is pulled LOW.' },
    } as ComponentDefinition;
  })(),
  mod({ type: 'evlab.solenoid', name: 'Solenoid Valve', category: 'Actuators', subcategory: 'Solenoids', tags: ['solenoid', 'valve', 'coil'], summary: '12 V solenoid valve.', pins: ['+', '-'], pcb: '#555' }),
];

// --------------------------------------------------- communication / IoT
export const instruments: ComponentDefinition[] = [
  (() => {
    const d = headerModule({ title: 'Function Generator', subtitle: 'OUT / GND', pcb: '#37474f', bottom: [{ id: 'OUT', kind: 'passive' }, { id: 'GND', kind: 'ground' }], widthPitches: 12, heightPitches: 6 });
    return {
      type: 'evlab.signal-generator',
      name: 'Signal Generator',
      category: 'Instruments',
      subcategory: 'Generators',
      tags: ['signal generator', 'function generator', 'square', 'sine', 'pwm', 'clock'],
      designator: 'SG',
      visual: { kind: 'svg', svg: d.svg },
      size: d.size,
      pins: d.pins,
      properties: [
        { key: 'waveform', label: 'Waveform', type: 'enum', default: 'square', options: [{ value: 'square', label: 'Square' }, { value: 'sine', label: 'Sine' }, { value: 'triangle', label: 'Triangle' }, { value: 'dc', label: 'DC' }], live: true },
        { key: 'frequency', label: 'Frequency', type: 'number', default: 1000, unit: 'Hz', min: 0.01, max: 200000, step: 1, live: true },
        { key: 'amplitude', label: 'Amplitude (p-p)', type: 'number', default: 5, unit: 'V', min: 0, max: 20, step: 0.1, live: true },
        { key: 'offset', label: 'Offset', type: 'number', default: 2.5, unit: 'V', min: -10, max: 10, step: 0.1, live: true },
        { key: 'duty', label: 'Duty (square)', type: 'number', default: 50, unit: '%', min: 1, max: 99, step: 1, live: true },
      ],
      simulation: { support: 'partial', model: 'signal-generator', notes: 'Square waves have exact edges; sine/triangle are sampled at 64 points per period (quasi-static solver). 50 Ω output.' },
      controls: [
        { kind: 'select', prop: 'waveform', icon: 'waves' },
        { kind: 'slider', prop: 'frequency', icon: 'activity', log: true },
        { kind: 'slider', prop: 'amplitude', icon: 'zap', label: 'p-p', max: 10 },
      ],
      docs: { summary: 'Bench function generator. Wire GND to the circuit ground. Probe OUT with the oscilloscope.' },
    } as ComponentDefinition;
  })(),
];

export const communication: ComponentDefinition[] = [
  mod({ type: 'evlab.hc05', name: 'HC-05 Bluetooth Module', category: 'Communication', subcategory: 'Bluetooth', tags: ['hc-05', 'bluetooth', 'uart', 'serial', 'wireless'], summary: 'Classic Bluetooth SPP module with UART interface.', pins: ['EN', V, G, 'TXD', 'RXD', 'STATE'], pcb: '#1e5aa8', notes: 'UART AT-command model planned.' }),
  mod({ type: 'evlab.hm10', name: 'HM-10 BLE Module', category: 'Communication', subcategory: 'Bluetooth', tags: ['hm-10', 'ble', 'bluetooth low energy', 'uart'], summary: 'Bluetooth Low Energy module with UART.', pins: [V, G, 'TXD', 'RXD', 'STATE', 'BRK'], pcb: '#1e5aa8' }),
  mod({ type: 'evlab.esp01', name: 'ESP-01 Wi-Fi Module', category: 'Communication', subcategory: 'Wi-Fi', tags: ['esp-01', 'esp8266', 'wifi', 'at commands', 'uart'], summary: 'ESP8266 module driven by AT commands over UART.', pins: ['RX', 'VCC', 'GPIO0', 'RST', 'CH_PD', 'GPIO2', 'TX', 'GND'], pcb: '#222', notes: 'AT-command model (offline loopback network) planned.' }),
  mod({ type: 'evlab.nrf24l01', name: 'nRF24L01+ Radio', category: 'Communication', subcategory: '2.4 GHz', tags: ['nrf24l01', 'radio', 'spi', 'wireless', 'rf24'], summary: '2.4 GHz transceiver (SPI).', pins: [G, V, 'CE', 'CSN', 'SCK', 'MOSI', 'MISO', 'IRQ'], pcb: '#222' }),
  mod({ type: 'evlab.lora-sx1278', name: 'LoRa SX1278 (Ra-02)', category: 'Communication', subcategory: 'LoRa', tags: ['lora', 'sx1278', 'ra-02', 'spi', 'lpwan'], summary: '433 MHz LoRa transceiver (SPI).', pins: ['NSS', 'MOSI', 'MISO', 'SCK', 'RST', 'DIO0', V, G], pcb: '#1b5e20' }),
  mod({ type: 'evlab.rc522', name: 'RFID RC522', category: 'Communication', subcategory: 'RFID/NFC', tags: ['rfid', 'rc522', 'mfrc522', '13.56mhz', 'spi', 'mifare'], summary: '13.56 MHz RFID reader/writer (SPI).', pins: ['SDA', 'SCK', 'MOSI', 'MISO', 'IRQ', G, 'RST', { id: '3.3V', kind: 'passive' }], pcb: '#1e5aa8', notes: 'MFRC522 register + virtual tag model planned.' }),
  mod({ type: 'evlab.pn532', name: 'PN532 NFC Module', category: 'Communication', subcategory: 'RFID/NFC', tags: ['nfc', 'pn532', 'i2c', 'spi'], summary: 'NFC controller (I2C/SPI/UART).', pins: [G, V, 'SDA', 'SCL'], pcb: '#c62828' }),
  mod({ type: 'evlab.neo6m', name: 'GPS NEO-6M', category: 'Communication', subcategory: 'GPS', tags: ['gps', 'neo-6m', 'gnss', 'nmea', 'uart'], summary: 'GPS receiver streaming NMEA sentences over UART (9600 baud).', pins: [V, 'RX', 'TX', G], pcb: '#1e5aa8', notes: 'NMEA stream generator planned.' }),
  mod({ type: 'evlab.sim800l', name: 'SIM800L GSM Module', category: 'Communication', subcategory: 'Cellular', tags: ['gsm', 'sim800l', 'gprs', 'sms'], summary: 'Quad-band GSM/GPRS modem (UART AT).', pins: ['NET', 'VCC', 'RST', 'RXD', 'TXD', 'GND'], pcb: '#c62828' }),
  mod({ type: 'evlab.mcp2515', name: 'MCP2515 CAN Module', category: 'Communication', subcategory: 'CAN', tags: ['can', 'mcp2515', 'tja1050', 'automotive', 'spi'], summary: 'SPI CAN controller with TJA1050 transceiver.', pins: ['INT', 'SCK', 'SI', 'SO', 'CS', G, V], edge: 'left', pcb: '#1e5aa8', width: 12, height: 9, notes: 'CAN bus model planned.' }),
  mod({ type: 'evlab.max485', name: 'MAX485 RS-485 Module', category: 'Communication', subcategory: 'RS-485', tags: ['rs485', 'max485', 'modbus'], summary: 'RS-485 half-duplex transceiver.', pins: ['RO', 'RE', 'DE', 'DI', V, 'B', 'A', G], pcb: '#1e5aa8' }),
  mod({ type: 'evlab.max3232', name: 'MAX3232 RS-232 Module', category: 'Communication', subcategory: 'UART', tags: ['rs232', 'max3232', 'serial'], summary: 'RS-232 level shifter.', pins: [V, G, 'TXD', 'RXD'], pcb: '#c62828' }),
  mod({ type: 'evlab.ch340', name: 'USB-UART Adapter (CH340)', category: 'Communication', subcategory: 'UART', tags: ['usb', 'uart', 'ftdi', 'ch340', 'serial'], summary: 'USB to TTL serial adapter.', pins: ['DTR', 'RXD', 'TXD', V, 'CTS', G], pcb: '#c62828' }),
  mod({ type: 'evlab.level-shifter', name: 'Logic Level Shifter (4 ch)', category: 'Communication', subcategory: 'I2C Devices', tags: ['level shifter', 'bss138', 'i2c', '3.3v', '5v'], summary: 'Bidirectional 3.3 V ↔ 5 V level converter.', pins: ['LV1', 'LV2', 'LV', 'GND', 'LV3', 'LV4', 'HV1', 'HV2', 'HV', 'GND.2', 'HV3', 'HV4'], pcb: '#c62828' }),
  mod({ type: 'evlab.pcf8574', name: 'PCF8574 I/O Expander', category: 'Communication', subcategory: 'I2C Devices', tags: ['pcf8574', 'io expander', 'i2c', 'gpio'], summary: '8-bit quasi-bidirectional I2C I/O expander.', pins: [G, V, 'SDA', 'SCL', 'INT', 'P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'], pcb: '#1e5aa8' }),
  mod({ type: 'evlab.ads1115', name: 'ADS1115 16-bit ADC', category: 'Communication', subcategory: 'I2C Devices', tags: ['ads1115', 'adc', 'i2c', '16-bit'], summary: '4-channel 16-bit ADC with PGA (I2C).', pins: [V, G, 'SCL', 'SDA', 'ADDR', 'ALRT', 'A0', 'A1', 'A2', 'A3'], pcb: '#6a1b9a' }),
  mod({ type: 'evlab.mcp4725', name: 'MCP4725 12-bit DAC', category: 'Communication', subcategory: 'I2C Devices', tags: ['mcp4725', 'dac', 'i2c'], summary: 'Single-channel 12-bit DAC (I2C).', pins: [G, V, 'SDA', 'SCL', 'OUT'], pcb: '#6a1b9a' }),
  mod({ type: 'evlab.w25q', name: 'W25Q32 SPI Flash', category: 'Communication', subcategory: 'SPI Devices', tags: ['flash', 'w25q32', 'spi', 'memory'], summary: '32 Mbit SPI NOR flash.', pins: ['CS', 'DO', 'WP', G, 'DI', 'CLK', 'HOLD', V], pcb: '#1e5aa8' }),
  mod({ type: 'evlab.at24c256', name: 'AT24C256 EEPROM', category: 'Communication', subcategory: 'I2C Devices', tags: ['eeprom', 'at24c256', 'i2c', 'memory'], summary: '256 Kbit I2C EEPROM.', pins: ['A0', 'A1', 'A2', G, 'SDA', 'SCL', 'WP', V], pcb: '#1e5aa8' }),
];
