/**
 * Raspberry Pi Pico drawing and pin layout, USB connector on the left:
 * pins 1–20 along the top edge (GP0 … GP15), pins 40–21 along the bottom
 * (VBUS … GP16), 0.1" apart and 0.7" between the rows, as on the board.
 */
import type { PinDefinition, PinKind } from '../../core/model/component';

const P = 9.6;
export const PICO_WIDTH = 21.5 * P;
export const PICO_HEIGHT = 8 * P;
const TOP_Y = 0.5 * P;
const BOTTOM_Y = 7.5 * P;
const x = (i: number) => (i + 1.25) * P;

/** Pin ids as stored in projects (the ground pins keep the ids of the earlier generic drawing). */
const TOP = ['GP0', 'GP1', 'GND.2', 'GP2', 'GP3', 'GP4', 'GP5', 'GND.7', 'GP6', 'GP7', 'GP8', 'GP9', 'GND.12', 'GP10', 'GP11', 'GP12', 'GP13', 'GND.17', 'GP14', 'GP15'];
const BOTTOM = ['VBUS', 'VSYS', 'GND.b17', '3V3_EN', '3V3', 'ADC_VREF', 'GP28', 'AGND', 'GP27', 'GP26', 'RUN', 'GP22', 'GND.b7', 'GP21', 'GP20', 'GP19', 'GP18', 'GND.b2', 'GP17', 'GP16'];

const I2C_SDA = new Set([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 26]);
const SPI_SCK = new Set([2, 6, 10, 14, 18]);
const SPI_MOSI = new Set([3, 7, 11, 15, 19]);
const SPI_MISO = new Set([0, 4, 8, 12, 16]);

function signalsOf(gpio: number): string[] {
  const s = ['pwm'];
  if (gpio >= 26) s.push(`analog:${gpio - 26}`);
  // Every GPIO can carry one of the two I2C buses (SDA on even pins, SCL on odd pins, 26/27 for I2C1).
  if (I2C_SDA.has(gpio)) s.push('i2c:SDA');
  else if (gpio <= 21 || gpio === 27) s.push('i2c:SCL');
  if (SPI_SCK.has(gpio)) s.push('spi:SCK');
  if (SPI_MOSI.has(gpio)) s.push('spi:MOSI');
  if (SPI_MISO.has(gpio)) s.push('spi:MISO');
  if (gpio === 0) s.push('uart:TX');
  if (gpio === 1) s.push('uart:RX');
  return s;
}

function pin(id: string, px: number, py: number): PinDefinition {
  const gp = /^GP(\d+)$/.exec(id);
  if (gp) {
    const n = Number(gp[1]);
    return { id, label: id, x: px, y: py, kind: n >= 26 ? 'analog' : 'io', signals: signalsOf(n), maxVoltage: 3.6 };
  }
  let kind: PinKind = 'passive';
  let voltage: number | undefined;
  let description: string | undefined;
  if (id.startsWith('GND') || id === 'AGND') kind = 'ground';
  else if (id === '3V3') {
    kind = 'power';
    voltage = 3.3;
    description = '3.3 V output (up to about 300 mA)';
  } else if (id === 'VBUS') {
    kind = 'power';
    voltage = 5;
    description = '5 V from USB';
  } else if (id === 'VSYS') {
    kind = 'power';
    voltage = 4.75;
    description = 'System supply (USB 5 V through a diode); 1.8–5.5 V input';
  } else if (id === 'RUN') {
    kind = 'input';
    description = 'Pull LOW to reset the RP2040';
  } else if (id === '3V3_EN') {
    kind = 'input';
    description = 'Pull LOW to switch the 3.3 V regulator off';
  } else if (id === 'ADC_VREF') description = 'ADC reference (3.3 V, filtered)';
  return { id, label: id.replace(/\.(\d+|b\d+)$/, ''), x: px, y: py, kind, voltage, description };
}

export const PICO_PINS: PinDefinition[] = [...TOP.map((id, i) => pin(id, x(i), TOP_Y)), ...BOTTOM.map((id, i) => pin(id, x(i), BOTTOM_Y))];

/** Board drawing; `led` lights the green LED on GP25. */
export function picoSvg(led: boolean): string {
  const W = PICO_WIDTH;
  const H = PICO_HEIGHT;
  let pads = '';
  let labels = '';
  TOP.forEach((id, i) => {
    pads += `<path d="M${x(i) - 3.6} 0 a3.6 3.6 0 0 0 7.2 0z" fill="#e2c46a"/><circle cx="${x(i)}" cy="${TOP_Y}" r="3" fill="#d6b24e"/><circle cx="${x(i)}" cy="${TOP_Y}" r="1.5" fill="#0d3a1e"/>`;
    labels += `<text x="${x(i)}" y="${TOP_Y + 9}" text-anchor="middle">${id.replace(/\.\d+$/, '')}</text>`;
  });
  BOTTOM.forEach((id, i) => {
    pads += `<path d="M${x(i) - 3.6} ${H} a3.6 3.6 0 0 1 7.2 0z" fill="#e2c46a"/><circle cx="${x(i)}" cy="${BOTTOM_Y}" r="3" fill="#d6b24e"/><circle cx="${x(i)}" cy="${BOTTOM_Y}" r="1.5" fill="#0d3a1e"/>`;
    const label = id.replace(/\.(\d+|b\d+)$/, '').replace('ADC_VREF', 'VREF').replace('3V3_EN', '3V3E');
    labels += `<text x="${x(i)}" y="${BOTTOM_Y - 6}" text-anchor="middle">${label}</text>`;
  });
  const ledFill = led ? '#7dff7a' : '#d9e8d6';
  const glow = led ? `<circle cx="27" cy="24" r="8" fill="#7dff7a" opacity=".35"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block">
<rect x="2.5" y="0.5" width="${W - 3}" height="${H - 1}" rx="3" fill="#1f7a3e" stroke="rgba(0,0,0,.35)"/>
<rect x="0" y="${H / 2 - 9}" width="17" height="18" rx="1.5" fill="#bfc4c8" stroke="#8b9094"/>
<rect x="2" y="${H / 2 - 6}" width="11" height="12" rx="1" fill="#6e7378"/>
<rect x="31" y="${H / 2 + 4}" width="11" height="11" rx="1.5" fill="#f2f2f2" stroke="#aaa"/><circle cx="36.5" cy="${H / 2 + 9.5}" r="3" fill="#ddd" stroke="#999" stroke-width=".6"/>
<text x="36.5" y="${H / 2 + 20}" text-anchor="middle" font-size="3.2" fill="#e8f3ea">BOOTSEL</text>
${glow}<rect x="24" y="21.5" width="6" height="4.5" rx=".8" fill="${ledFill}" stroke="#7a9a78" stroke-width=".5"/>
<text x="27" y="18.5" text-anchor="middle" font-size="3.2" fill="#e8f3ea">LED</text>
<rect x="${W / 2 - 16}" y="${H / 2 - 15}" width="30" height="30" rx="1.5" fill="#242424"/>
<text x="${W / 2 - 1}" y="${H / 2 - 1}" text-anchor="middle" font-size="4.6" fill="#bdbdbd" font-weight="600">RP2040</text>
<text x="${W / 2 - 1}" y="${H / 2 + 5}" text-anchor="middle" font-size="3" fill="#8f8f8f">RP2-B2</text>
<rect x="${W / 2 + 26}" y="${H / 2 - 9}" width="16" height="12" rx="1" fill="#2a2a2a"/>
<rect x="${W / 2 - 40}" y="${H / 2 + 6}" width="12" height="7" rx="1.5" fill="#c9ccce"/>
<text x="${W - 26}" y="${H / 2 - 2}" text-anchor="middle" font-size="5.4" fill="#e8f3ea" font-weight="600">Raspberry Pi</text>
<text x="${W - 26}" y="${H / 2 + 5}" text-anchor="middle" font-size="5.4" fill="#e8f3ea" font-weight="600">Pico</text>
<g font-size="3.1" fill="#e8f3ea" font-family="Consolas, monospace">${labels}</g>
${pads}
</svg>`;
}
