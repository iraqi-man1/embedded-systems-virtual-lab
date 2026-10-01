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
| `interaction` | `{ kind: "momentary" | "toggle" | "slider", input?, property? }` |
| `docs` | `{ summary, notes?, datasheetUrl? }` |

Pins should sit on the 0.1″ grid relative to each other so parts insert into breadboards. A
pin whose `kind` is `socket` *accepts* insertion (breadboard holes, female headers).

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
