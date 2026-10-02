/**
 * Turns a part definition and its guide entry into what the guide shows:
 * translated text, pins grouped by name with their function, and the
 * suggested connection to an Arduino Uno and a Raspberry Pi Pico.
 */
import type { ComponentDefinition, PinDefinition } from '../../core/model/component';
import { guideEntry, type BoardPins, type GuideEntry, type L } from '../../components/builtin/guide';
import { getLanguage, tr } from '../../i18n';

/** The text in the interface language. */
export const pick = (l: L): string => (getLanguage() === 'ar' ? l[1] : l[0]);

/** Name shown for a part: its Arabic name in Arabic, otherwise the printed name. */
export function partName(def: ComponentDefinition): string {
  const g = guideEntry(def.type);
  return getLanguage() === 'ar' && g ? g.ar : def.name;
}

/** What the part is, from the guide or the part's own summary. */
export function partWhat(def: ComponentDefinition): string {
  const g = guideEntry(def.type);
  return g ? pick(g.what) : tr(def.docs.summary);
}

export const isBoard = (def: ComponentDefinition) => !!def.mcu || def.category === 'Boards';

/** Breadboards and other parts made only of holes. */
export const isSocketBoard = (def: ComponentDefinition) => def.pins.length > 0 && def.pins.every((p) => p.kind === 'socket');

/** Numbered copies of a pin (GND.1, GND.2, A4.2) and paired legs (1.l, 1.r) share a name. */
export const pinBase = (id: string) => id.replace(/\.(\d+|b\d+|[lr])$/, '');

export interface PinGroup {
  /** Shared name, e.g. "GND". */
  name: string;
  /** Pin ids in the group. */
  ids: string[];
  pin: PinDefinition;
}

/** Pins grouped by shared name, in the order they first appear. */
export function pinGroups(def: ComponentDefinition): PinGroup[] {
  const groups = new Map<string, PinGroup>();
  for (const p of def.pins) {
    if (p.kind === 'socket') continue;
    const name = pinBase(p.label && !/\(/.test(p.label) ? p.label : p.id);
    const g = groups.get(name);
    if (g) g.ids.push(p.id);
    else groups.set(name, { name, ids: [p.id], pin: p });
  }
  return [...groups.values()];
}

const has = (def: ComponentDefinition, re: RegExp) => def.pins.some((p) => re.test(p.id));

/** The part talks SPI (a clock and a chip select), so DI/DO are SPI data lines. */
const usesSpi = (def: ComponentDefinition) => has(def, /^(SCK|CLK)$/) && has(def, /^(CS|CSN|SS|NSS)$/);

/** A generic explanation from the pin's role and name. */
function roleText(def: ComponentDefinition, p: PinDefinition): L | null {
  const n = p.id.replace(/\.(\d+|b\d+)$/, '').toUpperCase();
  if (p.kind === 'ground' || n === 'GND' || n === 'VSS' || n === 'AGND') return ['Ground (0 V).', 'الأرضي (0 فولت).'];
  if (p.kind === 'power' && p.voltage) return [`Supplies ${p.voltage} V.`, `يعطي ${p.voltage} فولت.`];
  if (/^(VCC|VDD|V\+|VIN|5V|\+5V|3\.3V|3V3|\+)$/.test(n)) return ['Supply input.', 'دخل التغذية.'];
  if (n === 'SDA') return ['I2C data.', 'بيانات I2C.'];
  if (n === 'SCL') return ['I2C clock.', 'ساعة I2C.'];
  const spi = usesSpi(def);
  if (spi && /^(MOSI|DI|SI|DIN|SDI)$/.test(n)) return ['Data from the board (SPI MOSI).', 'بيانات من اللوحة (SPI MOSI).'];
  if (spi && /^(MISO|DO|SO|SDO)$/.test(n)) return ['Data to the board (SPI MISO).', 'بيانات إلى اللوحة (SPI MISO).'];
  if (/^(SCK|CLK)$/.test(n)) return ['Clock.', 'الساعة.'];
  if (/^(CS|CSN|SS|NSS)$/.test(n)) return ['Chip select (active LOW).', 'اختيار الشريحة (فعّال عند LOW).'];
  if (/^(TX|TXD)$/.test(n)) return ['Serial data out: to the board’s RX.', 'إرسال تسلسلي: إلى RX في اللوحة.'];
  if (/^(RX|RXD)$/.test(n)) return ['Serial data in: from the board’s TX.', 'استقبال تسلسلي: من TX في اللوحة.'];
  if (/^(INT|IRQ|ALRT)$/.test(n)) return ['Interrupt output.', 'خرج المقاطعة.'];
  if (/^(RST|RESET)$/.test(n)) return ['Reset (active LOW).', 'إعادة الضبط (فعّال عند LOW).'];
  if (/^(AO|AOUT|VO)$/.test(n)) return ['Analog output.', 'خرج تماثلي.'];
  if (/^(DO|DOUT)$/.test(n)) return ['Digital output.', 'خرج رقمي.'];
  if (n === 'OUT') return ['Output.', 'الخرج.'];
  if (/^(EN|CE)$/.test(n)) return ['Enable.', 'التمكين.'];
  if (n === 'NC') return ['Not connected.', 'غير موصول.'];
  if (isBoard(def) && p.kind === 'analog') return ['Analog input, also digital input/output.', 'مدخل تماثلي، ويعمل أيضاً كدخل/خرج رقمي.'];
  if (isBoard(def) && p.kind === 'io') return ['Digital input/output.', 'دخل/خرج رقمي.'];
  return null;
}

/** What a pin does, in the interface language. */
export function pinFunction(def: ComponentDefinition, group: PinGroup, entry = guideEntry(def.type)): string {
  const g = entry?.pins;
  const own = g && (g[group.ids[0]] ?? g[group.name]);
  if (own) return pick(own);
  if (group.pin.description) return tr(group.pin.description);
  const role = roleText(def, group.pin);
  return role ? pick(role) : '';
}

/** A suggestion from the pin's role, for parts whose guide gives none. */
function roleBoardPin(def: ComponentDefinition, p: PinDefinition): BoardPins {
  const n = p.id.replace(/\.(\d+|b\d+)$/, '').toUpperCase();
  if (p.kind === 'ground' || n === 'GND' || n === 'VSS') return ['GND', 'GND'];
  if (/^(3\.3V|3V3)$/.test(n)) return ['3.3V', '3V3'];
  if (/^(VCC|VDD|V\+|VIN|5V|\+5V)$/.test(n)) return ['5V', '3V3'];
  if (n === 'SDA') return ['A4', 'GP4'];
  if (n === 'SCL') return ['A5', 'GP5'];
  if (usesSpi(def)) {
    if (/^(MOSI|DI|SI|DIN|SDI)$/.test(n)) return ['D11', 'GP19'];
    if (/^(MISO|DO|SO|SDO)$/.test(n)) return ['D12', 'GP16'];
    if (/^(SCK|CLK)$/.test(n)) return ['D13', 'GP18'];
    if (/^(CS|CSN|SS|NSS)$/.test(n)) return ['D10', 'GP17'];
  }
  // A module's TX goes to the board's receive pin: SoftwareSerial(2, 3) on the Uno, UART0 on the Pico.
  if (/^(TX|TXD)$/.test(n)) return ['D2', 'GP1'];
  if (/^(RX|RXD)$/.test(n)) return ['D3', 'GP0'];
  if (/^(AO|AOUT|VO)$/.test(n) || p.signals?.some((s) => s.startsWith('analog'))) return ['A0', 'GP26'];
  if (/^(DO|DOUT)$/.test(n)) return ['D2', 'GP15'];
  return ['', ''];
}

/**
 * Suggested Uno and Pico pins for a group, or null when the part is not
 * wired to a board (boards themselves, breadboards, two-legged passives).
 */
export function boardPins(def: ComponentDefinition, group: PinGroup, entry: GuideEntry | undefined = guideEntry(def.type)): BoardPins | null {
  if (!showsBoardColumns(def, entry)) return null;
  const b = entry?.board;
  return (b && (b[group.ids[0]] ?? b[group.name])) ?? roleBoardPin(def, group.pin);
}

export function showsBoardColumns(def: ComponentDefinition, entry: GuideEntry | undefined = guideEntry(def.type)): boolean {
  return !isBoard(def) && !isSocketBoard(def) && entry?.board !== null && def.pins.length > 0;
}

/** Signals worth showing as chips (PWM, SPI:SCK, i2c:SDA…), without power markers. */
export function pinSignals(p: PinDefinition): string[] {
  return (p.signals ?? []).filter((s) => !s.startsWith('power:')).map((s) => s.replace(/^(\w+):/, (_, bus: string) => `${bus.toUpperCase()} `).trim());
}
