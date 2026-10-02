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

/** Point in component-local pixels (unrotated), like pin coordinates. */
export interface LocalPoint {
  x: number;
  y: number;
}

export type LocalDirection = 'up' | 'down' | 'left' | 'right';

/**
 * On-canvas controls shown while simulating (and, for property controls,
 * when stopped on the selected part to set initial conditions). They are
 * pure data so JSON packages can declare them too. Controls either edit a
 * live property (`prop`, one undo step per gesture) or send a model input.
 */
export type SimControl =
  | {
      /** Compact slider chip under the part. Bounds/unit default to the property definition. */
      kind: 'slider';
      prop: string;
      label?: string;
      /** Icon name (sun, thermometer, droplets, flame, volume, zap, gauge, …). */
      icon?: string;
      min?: number;
      max?: number;
      step?: number;
      unit?: string;
      /** Logarithmic scale (illuminance, frequency). */
      log?: boolean;
    }
  | {
      /** Enum property as a compact selector chip (e.g. waveform). */
      kind: 'select';
      prop: string;
      label?: string;
      icon?: string;
    }
  | {
      /** Draggable object in front of a distance sensor; distance in `unit` is written to `prop`. */
      kind: 'range-target';
      prop: string;
      min: number;
      max: number;
      unit: string;
      /** Centre of the sensor face. */
      origin: LocalPoint;
      direction: LocalDirection;
      /** Canvas pixels per unit (at 100 % zoom). */
      scale: number;
      /** Visual-state counter incremented per measurement (draws an echo ripple). */
      pingKey?: string;
      label?: string;
    }
  | {
      /** Clickable regions on the part (keypad keys, DIP levers, reset button…). */
      kind: 'keys';
      keys: {
        id: string;
        label?: string;
        x: number;
        y: number;
        w: number;
        h: number;
        round?: boolean;
        /** Momentary: input sent with true on press, false on release (default `key:<id>`). */
        input?: string;
        /** Toggle: boolean property flipped on click (takes precedence over `input`). */
        prop?: string;
      }[];
      /** Visual-state key listing pressed key ids (highlight). */
      pressedKey?: string;
    }
  | {
      /**
       * 2-D drag of a spring-loaded thumbstick. While held it sends inputs named
       * `xProp`/`yProp` (0..1, 0.5 = centre), then `release`; the model returns to
       * the resting position given by those properties.
       */
      kind: 'stick';
      xProp: string;
      yProp: string;
      center: LocalPoint;
      radius: number;
      /** Left on the canvas = larger value (HORZ on most modules). */
      invertX?: boolean;
      /** Up on the canvas = larger value (VERT on most modules). */
      invertY?: boolean;
      /** Click without dragging presses the stick (momentary input). */
      pressInput?: string;
    }
  | {
      /** Drag to rotate (or mouse wheel) with detents; sends `input` = +1 / −1 per detent. */
      kind: 'rotary';
      input: string;
      center: LocalPoint;
      radius: number;
      /** Detents per revolution (KY-040: 20). */
      detents: number;
      /** Click without rotating presses the shaft (momentary input). */
      pressInput?: string;
    }
  | {
      /** Pitch/roll pad chip (IMUs); degrees written to the properties. */
      kind: 'tilt';
      pitchProp: string;
      rollProp: string;
      range: number;
      label?: string;
    }
  | {
      /** Chip button sending a model input: momentary (held) or a single trigger. */
      kind: 'action';
      input: string;
      label: string;
      icon?: string;
      mode?: 'momentary' | 'trigger';
    };

/**
 * Visual feedback drawn over a part while simulating. `value` names a key of
 * the model's visual state, or `prop:<key>` for an instance property.
 */
export type IndicatorDefinition =
  | {
      /** Small value badge next to the part. */
      kind: 'readout';
      value: string;
      label?: string;
      unit?: string;
      /** Multiplier applied before formatting (e.g. 100 for percent). */
      scale?: number;
      digits?: number;
      /** Engineering notation (1.2k, 3.3m). */
      engineering?: boolean;
      /** Maps discrete values to text, e.g. { true: 'ON', false: 'OFF' }. */
      map?: Record<string, string>;
      anchor?: 'top' | 'bottom' | 'left' | 'right';
    }
  | {
      /** Coloured glow; intensity = value / max (clamped), optionally logarithmic. */
      kind: 'glow';
      value: string;
      at: LocalPoint;
      radius: number;
      color: string;
      max?: number;
      log?: boolean;
    }
  | {
      /** Animated waves (sound, IR, RF) while value is truthy / > 0. */
      kind: 'waves';
      value: string;
      at: LocalPoint;
      direction: LocalDirection;
      color: string;
    }
  | {
      /** Detection cone that lights up while value is truthy. */
      kind: 'cone';
      value: string;
      origin: LocalPoint;
      direction: LocalDirection;
      length: number;
      spread: number;
      color: string;
    }
  | {
      /** Brief flash whenever value changes (a counter: reads, pings, frames). */
      kind: 'pulse';
      value: string;
      at: LocalPoint;
      color: string;
    }
  | {
      /** Rotor glyph turned by `value` degrees (motors drawn without their own animation). */
      kind: 'rotor';
      value: string;
      at: LocalPoint;
      radius: number;
    };

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
  /** On-canvas simulation controls (sliders, keys, sticks, distance targets…). */
  controls?: SimControl[];
  /** Visual feedback while simulating (readouts, glows, waves…). */
  indicators?: IndicatorDefinition[];
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
