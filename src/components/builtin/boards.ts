import type { ComponentDefinition, McuDefinition, McuPinMapping, PinDefinition } from '../../core/model/component';
import { dipIc, headerModule, type PinSpec } from '../visuals/svgParts';
import { PICO_HEIGHT, PICO_PINS, PICO_WIDTH } from '../visuals/pico';
import { visualOnly, wokwiPins, wokwiSize } from './helpers';

/** ATmega328P Arduino pin mapping (Uno, Nano, Pro Mini). */
function atmega328pPinMap(extraAdc: number[] = []): Record<string, McuPinMapping> {
  const map: Record<string, McuPinMapping> = {};
  const pwm = new Set([3, 5, 6, 9, 10, 11]);
  for (let d = 0; d <= 7; d++) map[String(d)] = { port: 'D', bit: d, pwm: pwm.has(d) };
  for (let d = 8; d <= 13; d++) map[String(d)] = { port: 'B', bit: d - 8, pwm: pwm.has(d) };
  for (let a = 0; a <= 5; a++) map[`A${a}`] = { port: 'C', bit: a, adc: a };
  for (const a of extraAdc) map[`A${a}`] = { adcOnly: a };
  return map;
}

const ATMEGA328P_BASE: Omit<McuDefinition, 'pinMap' | 'toolchain'> = {
  core: 'avr',
  chip: 'atmega328p',
  clockHz: 16_000_000,
  vcc: 5,
  flashBytes: 32 * 1024,
  sramBytes: 2048,
  supplies: [
    { pin: '5V', voltage: 5, maxCurrent: 0.5, rInternal: 0.05 },
    { pin: '3.3V', voltage: 3.3, maxCurrent: 0.15, rInternal: 0.5 },
  ],
  resetPin: 'RESET',
  gpio: { rOut: 25, rPullUp: 35_000, absMaxCurrent: 0.04, recommendedCurrent: 0.02 },
};

function arduinoPinKinds(pins: PinDefinition[]): PinDefinition[] {
  return pins.map((p) => {
    const id = p.id;
    if (/^GND/.test(id)) return { ...p, kind: 'ground' };
    if (/^5V/.test(id) || id === 'IOREF') return { ...p, kind: 'power', voltage: 5 };
    if (id === '3.3V') return { ...p, kind: 'power', voltage: 3.3 };
    if (id === 'VIN') return { ...p, kind: 'power', description: 'Unregulated input (not powered when running from USB)' };
    if (/^RESET/.test(id) || id === 'AREF') return { ...p, kind: 'input' };
    if (/^A\d/.test(id)) return { ...p, kind: 'analog', label: id.replace(/\.2$/, '') };
    return { ...p, kind: 'io', label: id.replace(/\.2$/, '') };
  });
}

const AVR_NOTES =
  'CPU, GPIO, Timers 0/1/2 (PWM), USART0, ADC, SPI, TWI (I2C), EEPROM and watchdog are emulated by avr8js. ' +
  'GPIO drivers are modelled electrically (≈25 Ω output, 35 kΩ pull-ups, Schmitt-trigger thresholds). ' +
  'Not modelled: brown-out, sleep-mode power consumption, analog comparator.';

export const arduinoUno: ComponentDefinition = {
  type: 'evlab.arduino-uno',
  name: 'Arduino Uno R3',
  category: 'Boards',
  subcategory: 'Arduino',
  tags: ['arduino', 'uno', 'atmega328p', 'avr', 'microcontroller', 'board'],
  designator: 'U',
  visual: { kind: 'wokwi', tag: 'wokwi-arduino-uno' },
  size: wokwiSize('wokwi-arduino-uno'),
  pins: arduinoPinKinds(wokwiPins('wokwi-arduino-uno', 'io')),
  internalConnections: [
    ['GND.1', 'GND.2', 'GND.3'],
    ['A4', 'A4.2'],
    ['A5', 'A5.2'],
    ['5V', 'IOREF'],
  ],
  properties: [],
  simulation: { support: 'full', model: 'mcu-board', notes: AVR_NOTES },
  controls: [{ kind: 'keys', keys: [{ id: 'reset', label: 'RESET (click to restart the sketch)', x: 32, y: 8, w: 19, h: 19, round: true, input: 'reset' }] }],
  mcu: {
    ...ATMEGA328P_BASE,
    toolchain: { platform: 'atmelavr', board: 'uno', framework: 'arduino' },
    pinMap: atmega328pPinMap(),
    indicators: [
      { prop: 'ledPower', source: 'power' },
      { prop: 'led13', source: { pin: '13' } },
      { prop: 'ledTX', source: 'tx' },
      { prop: 'ledRX', source: 'rx' },
    ],
  },
  docs: {
    summary: 'ATmega328P board, 16 MHz, 14 digital I/O (6 PWM), 6 analog inputs, USB-powered 5 V and 3.3 V outputs.',
    notes:
      'Pins 0/1 are the hardware serial port (Serial Monitor). Pin 13 drives the on-board "L" LED. Never draw more than 20 mA from an I/O pin (40 mA absolute max).',
    datasheetUrl: 'https://docs.arduino.cc/hardware/uno-rev3',
    example: 'blink',
  },
};

export const arduinoNano: ComponentDefinition = {
  type: 'evlab.arduino-nano',
  name: 'Arduino Nano',
  category: 'Boards',
  subcategory: 'Arduino',
  tags: ['arduino', 'nano', 'atmega328p', 'avr', 'breadboard'],
  designator: 'U',
  visual: { kind: 'wokwi', tag: 'wokwi-arduino-nano' },
  size: wokwiSize('wokwi-arduino-nano'),
  pins: arduinoPinKinds(wokwiPins('wokwi-arduino-nano', 'io')),
  internalConnections: [
    ['GND.1', 'GND.2', 'GND.3'],
    ['RESET', 'RESET.2', 'RESET.3'],
    ['12', '12.2'],
    ['13', '13.2'],
    ['11', '11.2'],
    ['5V', '5V.2'],
  ],
  properties: [],
  simulation: { support: 'full', model: 'mcu-board', notes: AVR_NOTES + ' A6/A7 are analog-only inputs.' },
  controls: [{ kind: 'keys', keys: [{ id: 'reset', label: 'RESET (click to restart the sketch)', x: 91, y: 25, w: 16, h: 16, round: true, input: 'reset' }] }],
  mcu: {
    ...ATMEGA328P_BASE,
    toolchain: { platform: 'atmelavr', board: 'nanoatmega328', framework: 'arduino' },
    pinMap: atmega328pPinMap([6, 7]),
    indicators: [{ prop: 'led13', source: { pin: '13' } }],
  },
  docs: {
    summary: 'Breadboard-friendly ATmega328P board (same core as the Uno) with 8 analog inputs.',
    datasheetUrl: 'https://docs.arduino.cc/hardware/nano',
  },
};

const plannedNote = (engine: string) => `Visual-only for now. Planned simulation engine: ${engine}.`;

export const arduinoMega = visualOnly({
  type: 'evlab.arduino-mega',
  name: 'Arduino Mega 2560',
  category: 'Boards',
  subcategory: 'Arduino',
  tags: ['arduino', 'mega', 'atmega2560', 'avr'],
  designator: 'U',
  visual: { kind: 'wokwi', tag: 'wokwi-arduino-mega' },
  size: wokwiSize('wokwi-arduino-mega'),
  pins: arduinoPinKinds(wokwiPins('wokwi-arduino-mega', 'io')),
  internalConnections: [['GND.1', 'GND.2', 'GND.3', 'GND.4', 'GND.5'], ['5V', '5V.1', '5V.2', 'IOREF'], ['SDA', '20'], ['SCL', '21']],
  notes: plannedNote('avr8js ATmega2560 (ports A–L, timers 3–5, USART1–3 need adapter support)'),
  docs: { summary: 'ATmega2560 board with 54 digital I/O, 16 analog inputs and 4 hardware serial ports.' },
});

export const esp32DevKit = visualOnly({
  type: 'evlab.esp32-devkit-v1',
  name: 'ESP32 DevKit V1',
  category: 'Boards',
  subcategory: 'ESP32',
  tags: ['esp32', 'xtensa', 'wifi', 'bluetooth', 'espressif'],
  designator: 'U',
  visual: { kind: 'wokwi', tag: 'wokwi-esp32-devkit-v1' },
  size: wokwiSize('wokwi-esp32-devkit-v1'),
  pins: wokwiPins('wokwi-esp32-devkit-v1', 'io', { VIN: 'power', '3V3': 'power' }, { '3V3': { voltage: 3.3 } }),
  internalConnections: [['GND.1', 'GND.2']],
  notes: plannedNote('Espressif QEMU (separate process) or Renode'),
  docs: { summary: 'Dual-core Xtensa LX6 @ 240 MHz with Wi-Fi and Bluetooth, 3.3 V logic.' },
});

export const nanoRp2040 = visualOnly({
  type: 'evlab.nano-rp2040-connect',
  name: 'Arduino Nano RP2040 Connect',
  category: 'Boards',
  subcategory: 'RP2040',
  tags: ['rp2040', 'cortex-m0+', 'arm', 'nano'],
  designator: 'U',
  visual: { kind: 'wokwi', tag: 'wokwi-nano-rp2040-connect' },
  size: wokwiSize('wokwi-nano-rp2040-connect'),
  pins: wokwiPins('wokwi-nano-rp2040-connect', 'io', { '3.3V': 'power', '5V': 'power', VIN: 'power' }),
  internalConnections: [['GND.1', 'GND.2'], ['RESET', 'RESET.2']],
  notes: plannedNote('rp2040js'),
  docs: { summary: 'RP2040 dual Cortex-M0+ @ 133 MHz with Wi-Fi/BLE module, 3.3 V logic.' },
});

function devBoard(
  type: string,
  name: string,
  sub: string,
  tags: string[],
  top: PinSpec[],
  bottom: PinSpec[],
  pcb: string,
  chip: string,
  summary: string,
  engine: string,
  heightPitches: number,
): ComponentDefinition {
  const v = headerModule({ title: name, pcb, top, bottom, chip: { label: chip, w: 40, h: 26 }, heightPitches });
  return visualOnly({
    type,
    name,
    category: 'Boards',
    subcategory: sub,
    tags,
    designator: 'U',
    visual: { kind: 'svg', svg: v.svg },
    size: v.size,
    pins: v.pins,
    notes: plannedNote(engine),
    docs: { summary },
  });
}

const pw = (id: string, voltage?: number): PinSpec => ({ id, kind: 'power', voltage });

/** Raspberry Pi Pico running MicroPython on the emulated RP2040 (rp2040js). */
function picoPinMap(): Record<string, McuPinMapping> {
  const map: Record<string, McuPinMapping> = {};
  for (let g = 0; g <= 28; g++) {
    if (g === 23 || g === 24) continue; // power-supply control and VBUS sense, not on the headers
    map[`GP${g}`] = g >= 26 ? { gpio: g, adc: g - 26 } : { gpio: g };
  }
  return map;
}

export const rpiPico: ComponentDefinition = {
  type: 'evlab.rpi-pico',
  name: 'Raspberry Pi Pico',
  category: 'Boards',
  subcategory: 'RP2040',
  tags: ['raspberry', 'pico', 'rp2040', 'cortex-m0+', 'micropython', 'python'],
  designator: 'U',
  visual: { kind: 'builtin', renderer: 'rpi-pico' },
  size: { width: PICO_WIDTH, height: PICO_HEIGHT },
  pins: PICO_PINS,
  internalConnections: [['GND.2', 'GND.7', 'GND.12', 'GND.17', 'GND.b2', 'GND.b7', 'GND.b17', 'AGND']],
  properties: [],
  simulation: {
    support: 'full',
    model: 'mcu-board',
    notes:
      'RP2040 emulated by rp2040js running the official MicroPython firmware: CPU, GPIO, PWM, ADC (GP26–GP28), I2C and SPI ' +
      '(to the parts on those pins), timers, flash file system and the USB serial REPL. GPIO drivers are modelled ' +
      'electrically at 3.3 V. Not modelled: the second core, UART on the pins, Wi-Fi.',
  },
  controls: [{ kind: 'keys', keys: [{ id: 'reset', label: 'RESET (click to restart MicroPython)', x: 31, y: 42.4, w: 11, h: 11, round: false, input: 'reset' }] }],
  mcu: {
    core: 'rp2040',
    chip: 'rp2040',
    clockHz: 125_000_000,
    vcc: 3.3,
    flashBytes: 2 * 1024 * 1024,
    sramBytes: 264 * 1024,
    toolchain: { platform: 'micropython', board: 'rpi_pico', framework: 'micropython' },
    runtime: { kind: 'micropython', image: 'firmware/micropython-rpi-pico.uf2', version: '1.27.0' },
    pinMap: picoPinMap(),
    supplies: [
      { pin: '3V3', voltage: 3.3, maxCurrent: 0.3, rInternal: 0.3 },
      { pin: 'VBUS', voltage: 5, maxCurrent: 0.5, rInternal: 0.1 },
      { pin: 'VSYS', voltage: 4.75, maxCurrent: 0.5, rInternal: 0.2 },
    ],
    resetPin: 'RUN',
    indicators: [{ prop: 'led', source: { pin: 'GP25' } }],
    gpio: { rOut: 50, rPullUp: 50_000, absMaxCurrent: 0.05, recommendedCurrent: 0.012 },
  },
  docs: {
    summary: 'Raspberry Pi RP2040 board, dual Cortex-M0+ at 125 MHz, 26 GPIO, 3.3 V logic. Programmed in Python (MicroPython): main.py runs at start-up.',
    notes: 'The serial monitor is the MicroPython REPL: after main.py ends, type Python at the >>> prompt. Ctrl+C stops the program, Ctrl+D restarts it.',
    datasheetUrl: 'https://www.raspberrypi.com/documentation/microcontrollers/raspberry-pi-pico.html',
  },
};

export const stm32BluePill = devBoard(
  'evlab.stm32-bluepill',
  'STM32 Blue Pill',
  'STM32',
  ['stm32', 'stm32f103', 'cortex-m3', 'arm', 'bluepill'],
  ['B12', 'B13', 'B14', 'B15', 'A8', 'A9', 'A10', 'A11', 'A12', 'A15', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', pw('5V', 5), 'GND.t', pw('3V3', 3.3)],
  ['VB', 'C13', 'C14', 'C15', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'B0', 'B1', 'B10', 'B11', 'RST', pw('3V3.b', 3.3), 'GND.b', 'GND.b2'],
  '#1b4fa0',
  'STM32F103',
  'STM32F103C8T6 Cortex-M3 @ 72 MHz, 64 KB flash, 3.3 V logic (5 V tolerant pins).',
  'Renode (stm32f103 platform)',
  8,
);

export const stm32BlackPill = devBoard(
  'evlab.stm32-blackpill',
  'STM32 Black Pill F411',
  'STM32',
  ['stm32', 'stm32f411', 'cortex-m4', 'arm', 'blackpill'],
  ['B12', 'B13', 'B14', 'B15', 'A8', 'A9', 'A10', 'A11', 'A12', 'A15', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', pw('5V', 5), 'GND.t', pw('3V3', 3.3)],
  ['VB', 'C13', 'C14', 'C15', 'RST', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'B0', 'B1', 'B2', 'B10', pw('3V3.b', 3.3), 'GND.b', 'GND.b2'],
  '#222',
  'STM32F411',
  'STM32F411CEU6 Cortex-M4F @ 100 MHz, 512 KB flash, USB-C.',
  'Renode',
  8,
);

export const nodeMcu = devBoard(
  'evlab.nodemcu-esp8266',
  'NodeMCU ESP8266',
  'ESP8266',
  ['esp8266', 'nodemcu', 'wifi', 'xtensa', 'espressif'],
  ['D0', 'D1', 'D2', 'D3', 'D4', pw('3V3', 3.3), 'GND.t', 'D5', 'D6', 'D7', 'D8', 'RX', 'TX', 'GND.t2', pw('3V3.t2', 3.3)],
  ['A0', 'RSV', 'RSV2', 'SD3', 'SD2', 'SD1', 'CMD', 'SD0', 'CLK', 'GND.b', pw('3V3.b', 3.3), 'EN', 'RST', 'GND.b2', 'VIN'],
  '#222',
  'ESP-12E',
  'ESP8266 Wi-Fi SoC (Tensilica L106 @ 80 MHz), 3.3 V logic.',
  'QEMU (esp8266 fork) — evaluation pending',
  10,
);

export const esp32c3 = devBoard(
  'evlab.esp32-c3-devkitm',
  'ESP32-C3 DevKitM-1',
  'RISC-V',
  ['esp32-c3', 'risc-v', 'riscv', 'wifi', 'ble', 'espressif'],
  ['GND.t', pw('3V3', 3.3), pw('3V3.t2', 3.3), 'IO2', 'IO3', 'GND.t3', 'RST', 'GND.t4', 'IO0', 'IO1', 'IO10', 'GND.t5', pw('5V', 5), pw('5V.t2', 5), 'GND.t6'],
  ['GND.b', 'TX', 'RX', 'GND.b2', 'IO9', 'IO8', 'GND.b3', 'IO7', 'IO6', 'IO5', 'IO4', 'GND.b4', 'IO18', 'IO19', 'GND.b5'],
  '#222',
  'ESP32-C3',
  'Single-core 32-bit RISC-V @ 160 MHz with Wi-Fi and BLE 5.',
  'Espressif QEMU (RISC-V) or Renode',
  10,
);

export const hifive1 = devBoard(
  'evlab.sifive-hifive1',
  'SiFive HiFive1 Rev B',
  'RISC-V',
  ['sifive', 'fe310', 'risc-v', 'riscv'],
  ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12', 'D13', 'GND.t', 'AREF', 'SDA', 'SCL'],
  ['IOREF', 'RESET', pw('3V3', 3.3), pw('5V', 5), 'GND.b', 'GND.b2', 'VIN', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5'],
  '#1d3557',
  'FE310-G002',
  'SiFive FE310 RISC-V (RV32IMAC) @ 320 MHz in the Arduino form factor.',
  'Renode (hifive1 platform)',
  12,
);

const tiny = dipIc({
  label: 'ATtiny85',
  pins: ['PB5', 'PB3', 'PB4', 'GND', 'PB0', 'PB1', 'PB2', { id: 'VCC', kind: 'passive' }],
});

export const attiny85 = visualOnly({
  type: 'evlab.attiny85',
  name: 'ATtiny85 (DIP-8)',
  category: 'Boards',
  subcategory: 'AVR chips',
  tags: ['attiny85', 'avr', 'attiny', 'dip'],
  designator: 'U',
  visual: { kind: 'svg', svg: tiny.svg },
  size: tiny.size,
  pins: tiny.pins,
  notes: plannedNote('avr8js (ATtiny timer/USI peripherals exist upstream; adapter pending)'),
  docs: { summary: '8-pin AVR with 8 KB flash and 6 I/O pins (PB5 doubles as RESET).' },
});
