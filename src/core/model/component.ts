/**
 * Component Model — the schema every part in the library conforms to.
 *
 * The core never branches on a component's `type`. Geometry, connectivity,
 * properties, documentation and simulation behaviour are all described here
 * and interpreted generically, so new parts can be added by packages without
 * touching application code.
 */

/** Honest simulation status, surfaced throughout the UI. */
export type SimulationSupport =
  /** Electrically and behaviourally simulated within the documented limits. */
  | 'full'
  /** Simulated, with documented gaps (see `simulation.notes`). */
  | 'partial'
  /** Drawn and wired only. Electrically inert; the engine reports it as such. */
  | 'visual-only';

export type PinKind =
  /** Supplies power (e.g. 5V output of a board). */
  | 'power'
  | 'ground'
  /** Bidirectional MCU GPIO. */
  | 'io'
  /** Analog-capable MCU pin (also digital I/O on most MCUs). */
  | 'analog'
  /** Terminal of a passive part (resistor leg, LED leg...). */
  | 'passive'
  /** Digital input of an IC/module. */
  | 'input'
  /** Digital output of an IC/module. */
  | 'output'
  /** A receptacle other pins can be inserted into (breadboard hole, female header). */
  | 'socket'
  /** Not connected internally. */
  | 'nc';

export interface PinDefinition {
  /** Stable identifier, unique within the component. Persisted in projects. */
  id: string;
  /** Display label (defaults to `id`). */
  label?: string;
  /** Position in component-local pixels (unrotated). 0.1" = 9.6 px. */
  x: number;
  y: number;
  kind: PinKind;
  description?: string;
  /** Alternate functions, e.g. ["PWM", "SPI:SCK", "ADC0"]. */
  signals?: string[];
  /** For `power` pins: the rail voltage the pin supplies. */
  voltage?: number;
  /** Highest voltage the pin tolerates (used by electrical checks). */
  maxVoltage?: number;
  /** If true the pin should be connected for the part to work (static ERC). */
  required?: boolean;
}

export type PropertyType = 'number' | 'string' | 'enum' | 'boolean' | 'color';

export interface PropertyDefinition {
  key: string;
  label: string;
  type: PropertyType;
  default: string | number | boolean;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  description?: string;
  /**
   * `true` if the value can change while the simulation runs without a
   * restart (e.g. potentiometer position, ambient temperature).
   */
  live?: boolean;
  /**
   * Engineering-notation number entered as text, e.g. "4.7k". Parsed with
   * `parseEngineering`. Only meaningful for `type: 'string'`.
   */
  engineering?: boolean;
}

/** How a component is drawn on the workspace. */
export type VisualDefinition =
  | {
      kind: 'wokwi';
      /** Custom element tag from @wokwi/elements. */
      tag: string;
      /** Instance property -> element attribute/property name. */
      propBindings?: Record<string, string>;
      /** Static element properties. */
      attrs?: Record<string, string | number | boolean>;
    }
  | {
      kind: 'svg';
      /** Inline SVG markup. Must be self-contained (no external refs). */
      svg: string;
    }
  | {
      kind: 'builtin';
      /** Renderer id registered in the UI renderer registry (e.g. "breadboard"). */
      renderer: string;
    };

export type InteractionKind =
  /** Pressed while held (push button). */
  | 'momentary'
  /** Click toggles (slide switch). */
  | 'toggle'
  /** Drag/scroll changes a 0..1 value (potentiometer). */
  | 'slider';

export interface InteractionDefinition {
  kind: InteractionKind;
  /** Model input key the interaction drives (default: "pressed" / "value"). */
  input?: string;
  /** For slider: the live property mirrored in the inspector. */
  property?: string;
}

/** Boards with a programmable MCU declare how their pins map onto the core. */
export interface McuDefinition {
  /** Emulator family registered in the engine, e.g. "avr". */
  core: string;
  /** Part number, e.g. "atmega328p". */
  chip: string;
  clockHz: number;
  /** Logic supply in volts. */
  vcc: number;
  flashBytes: number;
  sramBytes: number;
  /** Toolchain target. */
  toolchain: { platform: string; board: string; framework: string };
  /** Board pin id -> MCU signal. */
  pinMap: Record<string, McuPinMapping>;
  /** Regulated outputs of the board (USB-powered), referenced to its GND pins. */
  supplies?: { pin: string; voltage: number; maxCurrent: number; rInternal: number }[];
  /** On-board indicator LEDs mapped to element properties. */
  indicators?: { prop: string; source: 'power' | 'tx' | 'rx' | { pin: string } }[];
  /** Pin that resets the MCU when pulled low. */
  resetPin?: string;
  /** Electrical characteristics of the GPIO drivers. */
  gpio?: { rOut: number; rPullUp: number; absMaxCurrent: number; recommendedCurrent: number };
}

export type McuPinMapping =
  | { port: string; bit: number; adc?: number; pwm?: boolean }
  | { adcOnly: number };

export interface ComponentDocs {
  summary: string;
  /** Markdown-ish free text with usage notes. */
  notes?: string;
  datasheetUrl?: string;
  /** Example sketch name from the examples gallery. */
  example?: string;
}

export interface ComponentDefinition {
  /** Globally unique type id, namespaced by package: "evlab.led". */
  type: string;
  name: string;
  category: string;
  subcategory?: string;
  tags?: string[];
  /** Reference designator prefix: R, LED, U, SW... */
  designator: string;
  visual: VisualDefinition;
  /** Bounding box in local pixels. */
  size: { width: number; height: number };
  pins: PinDefinition[];
  /** Groups of pins that are electrically identical inside the part. */
  internalConnections?: string[][];
  /**
   * Net-label behaviour: all instances whose value of this property is equal
   * are connected (net labels, GND/VCC symbols). A fixed value can be given
   * with `netLabelFixed`.
   */
  netLabelProperty?: string;
  netLabelFixed?: string;
  properties: PropertyDefinition[];
  simulation: {
    support: SimulationSupport;
    /** Behaviour model id registered in the simulation engine. */
    model?: string;
    /** Data-driven model parameters (e.g. gate pin mapping), passed to the model. */
    params?: Record<string, unknown>;
    notes?: string;
  };
  interaction?: InteractionDefinition;
  mcu?: McuDefinition;
  docs: ComponentDocs;
  /** Package that contributed this definition (filled by the registry). */
  packageId?: string;
}

/** A unit of distribution: the built-in library is one, plugins are others. */
export interface ComponentPackage {
  id: string;
  name: string;
  version: string;
  author?: string;
  license?: string;
  description?: string;
  components: ComponentDefinition[];
}

export const GRID = 9.6; // 0.1 inch at 96 DPI — Wokwi elements use the same pitch
