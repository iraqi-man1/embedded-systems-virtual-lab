# 03 — Component Packages (extending the library without touching the core)

Every part in the library — including the built-in ones — comes from a **component package**.
The core never branches on a component type: it interprets `ComponentDefinition`s generically.

## Where packages live

| Kind | Location | Loaded by |
|---|---|---|
| Built-in | `src/components/builtin/` (TypeScript, bundled) | `src/app/registry.ts` |
| User / third-party (JSON) | `%APPDATA%\lab.evlab.desktop\packages\<name>\package.json` | Rust `list_component_packages` → `registerExternalPackages()` at start-up |

A JSON package is validated (`src/core/registry/validate.ts`) before registration; invalid
definitions are reported as notifications and skipped. Inline SVG containing scripts or event
handlers is rejected.

## Package format

```jsonc
{
  "id": "acme.sensors",                 // unique; "evlab.builtin" is reserved
  "name": "ACME Sensor Pack",
  "version": "1.0.0",
  "license": "MIT",
  "components": [ /* ComponentDefinition objects */ ]
}
```

### ComponentDefinition (essentials)

| Field | Meaning |
|---|---|
| `type` | Globally unique id, namespaced: `"acme.tmp36"` |
| `name`, `category`, `subcategory`, `tags` | Library placement and search |
| `designator` | Reference prefix (`R`, `U`, `LED`…) |
| `visual` | `{ "kind": "svg", "svg": "<svg …>" }`, `{ "kind": "wokwi", "tag": "wokwi-led" }`, or `{ "kind": "builtin", "renderer": "…" }` |
| `size` | Bounding box in px (0.1″ = 9.6 px) |
| `pins[]` | `{ id, x, y, kind, label?, description?, signals?, voltage?, required? }`. `kind` ∈ `power, ground, io, analog, passive, input, output, socket, nc` |
| `internalConnections` | Groups of pins shorted inside the part (e.g. duplicate GND pins) |
| `netLabelProperty` / `netLabelFixed` | Net-label behaviour (all equal names are connected) |
| `properties[]` | `{ key, label, type: number|string|enum|boolean|color, default, unit?, min?, max?, step?, options?, live?, engineering? }` |
| `simulation` | `{ support: "full" | "partial" | "visual-only", model?, params?, notes? }` — **be honest** |
| `interaction` | `{ kind: "momentary" | "toggle" | "slider", input?, property? }` (whole part) |
| `controls` | On-canvas simulation controls, see below |
| `indicators` | Visual feedback while simulating, see below |
| `docs` | `{ summary, notes?, datasheetUrl? }` |

Pins should sit on the 0.1″ grid relative to each other so parts insert into breadboards. A
pin whose `kind` is `socket` *accepts* insertion (breadboard holes, female headers).

### Simulation controls and feedback

`controls` make a part interactive on the canvas (shown while simulating; property controls also
on the selected part when stopped). Coordinates are local pixels like pin positions, so they
rotate and flip with the part. Controls are validated against the part's `properties`.

| `kind` | Fields | Effect |
|---|---|---|
| `slider` | `prop`, `icon?`, `label?`, `min?`, `max?`, `step?`, `unit?`, `log?` | Chip under the part editing a live number property |
| `select` | `prop`, `icon?`, `label?` | Chip choosing an `enum` property |
| `range-target` | `prop`, `min`, `max`, `unit`, `origin`, `direction`, `scale`, `pingKey?` | Draggable obstacle in front of a distance sensor |
| `keys` | `keys: [{ id, x, y, w, h, round?, label?, input?, prop? }]`, `pressedKey?` | Clickable regions: momentary model input (`key:<id>` by default, true/false) or boolean `prop` toggle |
| `stick` | `xProp`, `yProp`, `center`, `radius`, `invertX?`, `invertY?`, `pressInput?` | Spring-loaded thumbstick: sends inputs named like the props while held, then `release` |
| `rotary` | `input`, `center`, `radius`, `detents`, `pressInput?` | Drag around / scroll: sends `input` = +1 / −1 per detent |
| `tilt` | `pitchProp`, `rollProp`, `range` | Pitch/roll pad (degrees) |
| `action` | `input`, `label`, `icon?`, `mode?: "momentary" \| "trigger"` | Chip button sending a model input |

`indicators` draw feedback; `value` is a key of the model's visual state or `prop:<key>`:
`readout` (`label?`, `unit?`, `scale?`, `digits?`, `engineering?`, `map?`, `anchor?`), `glow`
(`at`, `radius`, `color`, `max?`, `log?`), `waves` (`at`, `direction`, `color`), `cone`
(`origin`, `direction`, `length`, `spread`, `color`), `pulse` (`at`, `color`; flashes when the
value changes) and `rotor` (`at`, `radius`; value in degrees).

Example — a light sensor with a slider and an ambient glow:

```json
"controls": [{ "kind": "slider", "prop": "lux", "icon": "sun", "log": true }],
"indicators": [{ "kind": "glow", "value": "prop:lux", "at": { "x": 14, "y": 10 }, "radius": 26, "color": "#ffd54f", "max": 100000, "log": true }]
```

Models publish overlay data in their visual state with a leading underscore (`_pings`,
`_active`, `_rpm`…); keys starting with `$` are element commands (`$rotate` turns the part body,
`$pixels` sets LED-ring/matrix pixels, `$imageData` paints display elements).

### Reusing built-in behaviour models

JSON packages cannot ship code (yet), but they can parameterise the generic models:

| Model id | Parameters / pins |
|---|---|
| `resistor` | pins `1`,`2`; prop `resistance` |
| `led` | pins `A`,`C`; props `color`, `vf`, `maxCurrent` |
| `diode` | pins `A`,`K`; props `vf`, `vz` (Zener) |
| `pushbutton` / `slide-switch` | see built-ins |
| `potentiometer` | pins `GND`,`SIG`,`VCC`; props `resistance`, `position` |
| `dc-source` | pins `+`,`-`; props `voltage`, `rInternal`, `maxCurrent` |
| `logic-gates` | `params.gates: [{ inputs: ["1A","1B"], output: "1Y", fn: "nand" }]`, pins `VCC`,`GND` |
| `keypad-matrix` | `params: { rows: ["R1",…], cols: ["C1",…], keys: [["1","2",…],…] }`; inputs `key:<label>` |
| `ws2812` | `params: { count, layout: "single" \| "ring" \| "matrix", vcc?, gnd? }`; pins `DIN` + supply |
| `h-bridge` | `params: { vs, logic?, bridges: [{ en, in: [a,b], out: [a,b] }] }`, pin `GND` |
| `darlington-array` | `params.channels`; pins `IN1…`, `OUT1…`, `GND` |
| `bipolar-stepper` | pins `A+`,`A-`,`B+`,`B-` (or `params.coils`); `params.stepsPerRev` |
| `rotary-encoder`, `dc-motor`, `ir-receiver`, `mpu6050`, `ds1307`, `ssd1306` | see the built-in definitions |
| `led-array` | `params.segments: [{ a: "A1", c: "C1" }]` or `{ a: "A", c: "$COM" }` + `params.commonPin` |
| `relay` | `params.coil: [p1, p2]`, `params.poles: [{ com, no, nc }]`, `params.rCoil` |
| `switch-array` | `params.pairs: [["1a","1b"], …]`, props `sw1..swN` |
| `analog-module` | `params: { ao, do?, sensor: "ldr"|"ntc"|"level" }` |
| `event-sensor` | `params.out`, prop `holdTime`; interaction `trigger`/`toggle` |
| `connector` | no electrical element (headers, breadboards) |

A complete working sample is in [`examples/sample-package/package.json`](examples/sample-package/package.json):
copy the folder into the packages directory and restart the application.

## Adding code models (built-in packages)

1. Implement `SimModel` (see `src/core/sim/model.ts`) — `stamp()` contributes conductances and
   sources; `afterSolve()` reads voltages; `schedule()` creates timed events; `i2c`/`spi`
   expose protocol-level bus targets.
2. `registerModel('my-model', (ctx) => new MyModel(ctx))` and import the file from
   `src/core/sim/models/register.ts`.
3. Reference `simulation.model: "my-model"` from the definition.
4. Add a test in `tests/` driving it with real firmware (see `tests/devices.test.ts`).
