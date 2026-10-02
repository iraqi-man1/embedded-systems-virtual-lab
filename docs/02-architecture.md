# 02 — Architecture

## Goals that shape the design

1. **Offline native desktop app.** Tauri shell; all assets bundled; toolchains installed once
   into an app-private directory and used offline thereafter.
2. **Simulation is separate from UI.** The simulation kernel runs in a Web Worker and never
   imports React or touches the DOM. The UI talks to it through a typed message protocol.
3. **Components are data, not code paths.** The core never switches on a component type.
   Every part is a `ComponentDefinition` (pins, properties, visual, docs, simulation model id)
   registered at runtime by a *component package*. Behaviour lives in *simulation models*
   registered by id. Adding a part = adding a definition (+ optionally a model).
4. **Honesty.** Every definition declares `simulation.support` = `full | partial | visual-only`.
   The UI surfaces this everywhere (library badge, inspector, problems panel). Visual-only
   parts are electrically inert and the engine reports them as such.

## Layers

```
┌───────────────────────────── Desktop UI (React) ─────────────────────────────┐
│ Library │ Workspace canvas │ Code editor (Monaco) │ Inspector │ Instruments   │
│ Start screen │ Parts guide │ Settings │ Export   ·   i18n (English / Arabic)  │
│                 state/ (zustand stores: document+history, editor, sim, ui)   │
└───────▲──────────────────────────▲───────────────────────────▲───────────────┘
        │ ComponentRegistry        │ SimulationClient           │ Platform services
┌───────┴────────┐  ┌──────────────┴─────────────┐  ┌───────────┴──────────────┐
│ core/model     │  │ core/sim (Web Worker)      │  │ platform/                 │
│ core/registry  │  │  engine/  scheduler, bus   │  │  toolchain (Tauri | dev)  │
│ core/circuit   │  │  analog/  MNA solver       │  │  storage   (Tauri | web)  │
│  geometry      │  │  mcu/     McuEmulator API  │  │  plugins   (Tauri)        │
│  netlist       │  │    avr/   avr8js adapter   │  └───────────▲──────────────┘
│  erc (static)  │  │    rp2040/ rp2040js +      │              │
│ core/project   │  │      MicroPython host      │              │
│                │  │  models/  behaviour models │              │ Tauri IPC
│                │  │ core/instruments (decoders)│  ┌───────────┴──────────────┐
└────────────────┘  └────────────────────────────┘  │ src-tauri (Rust)          │
                                                    │  toolchain: PlatformIO    │
  components/  ← built-in component package         │  project / image file IO  │
  examples/    ← example projects (data)            │  plugin directory scan    │
                                                    │  (future) ngspice, Renode │
                                                    └───────────────────────────┘
```

| Abstraction (brief) | Location | Responsibility |
|---|---|---|
| Circuit Model | `src/core/model/circuit.ts`, `src/core/circuit/*` | Document (instances, wires, junctions), world geometry of pins, netlist (union-find incl. breadboard internals & pin-in-socket insertion), static ERC. |
| Component Model | `src/core/model/component.ts`, `src/core/registry/*` | `ComponentDefinition` schema, `ComponentPackage`, registry with search/categories. |
| MCU Emulator | `src/core/sim/mcu/*` | `McuEmulator` interface; AVR over avr8js; RP2040 over rp2040js (serial-flash emulation, USB host, MicroPython file upload). Renode bridges would plug in here. |
| Analog Simulation | `src/core/sim/analog/*` | Real-time quasi-static MNA solver (islands, PWL diodes). ngspice backend (offline analyses) planned behind `AnalysisBackend`. |
| Firmware Toolchain | `src/core/toolchain/*`, `src-tauri/src/toolchain.rs` | `FirmwareToolchain` interface; PlatformIO implementation in Rust; diagnostics parsing. |
| Instruments | `src/core/instruments/*`, `src/ui/instruments/*` | Capture buffers (serial, logic, analog), decoders, renderers. Probes reference pins; the engine resolves them to nets. |
| Project Storage | `src/core/project/*`, `src/platform/storage.ts` | Versioned `.evlab` JSON format, migrations, Tauri FS / browser fallback. |
| Desktop UI | `src/ui/*`, `src/state/*` | Panels, canvas, editor, theming, shortcuts; start screen (`ui/home`), parts guide (`ui/guide`, content in `components/builtin/guide`), image export (`ui/export`). |
| Languages | `src/i18n/*` | `t(key)` with the English text as key and a typed Arabic catalogue (a missing translation is a compile error); `tr()` for text from data; `<html dir>` switches the layout to right-to-left. |

## Key data structures

- **ComponentDefinition** (`type`, `name`, `category`, `pins[]` with local coordinates & electrical
  kind, `internalConnections` (pins shorted inside the part), `properties[]`, `visual`
  (`wokwi` tag | inline `svg` | `builtin` renderer), `simulation {support, model, notes}`,
  `interaction` (momentary / toggle / slider), `mcu` (for boards: core, clock, PlatformIO board,
  pin→port map), `docs`).
- **CircuitDocument**: `components[]` (`id,type,x,y,rotation,flip,props`), `wires[]`
  (`from/to: {componentId,pinId}`, `points[]`, `color`, `label`). Junctions and net labels are
  ordinary components, so the netlist algorithm has no special cases.
- **Netlist**: built from the document + registry. Union-find over `componentId:pinId`:
  wires, `internalConnections`, net labels with equal names, and *insertion* — any pin lying on
  a `socket` pin (breadboard hole, header) within tolerance joins that socket's net. This is
  how breadboard connectivity is "understood automatically".

## Simulation kernel

- `SimulationEngine` (worker) owns: the netlist snapshot, model instances, MCU emulators, the
  solver and instrument recorders.
- **Time base**: when an MCU is present, its cycle counter is the master clock; otherwise a
  virtual clock advances by wall time × speed.
- **Co-simulation loop**: MCU runs in slices (≈ 4 ms of wall time each); GPIO listeners mark
  the affected nets dirty and request a solve *at the exact cycle* of the change; the solver
  re-solves only the electrically connected islands that contain dirty nets; models read the
  solution (`afterSolve`), MCU input pins/ADC channels are updated, and per-element currents are
  time-integrated so PWM produces correct average LED brightness.
- **Models** implement `stamp()` (contribute conductances/sources), `afterSolve()`,
  `onInput()` (UI interaction), `visualState()`, `diagnostics()`. Digital logic models can
  request iteration until stable.
- **Frames** (~30 Hz) carry visual state, MCU pin states, probed signals, serial bytes and
  diagnostics back to the UI. The UI applies visual state straight to the element instances,
  bypassing React reconciliation for speed.

## Interpreter boards (MicroPython)

A board whose `mcu.runtime` is set (the Raspberry Pi Pico) runs an interpreter instead of a
compiled sketch. `state/sim.ts` fetches the interpreter image named by the definition
(`public/firmware/*.uf2`, bundled with the app) once and passes it with the project's `.py`
files as `SimSetup.program`; `Rp2040Emulator.loadProgram` writes the UF2 into the emulated
flash and boots it, and `MicroPythonHost` — playing the computer on the other end of the USB
cable — enters the raw REPL, writes the files to the board's file system and soft-resets, so
`main.py` runs as on a real board. The project's language follows its target board
(`core/project/firmware.ts`): `sketch.ino` + C/C++ files are compiled for AVR boards, `main.py`
+ modules are uploaded to the Pico; a project can keep both.

## Extensibility

- **Component packages**: `ComponentPackage { id, name, version, components[], models? }`.
  The built-in library is itself a package. JSON packages (definitions + inline SVG visuals,
  reusing built-in generic models with parameters) are discovered by the Rust backend in
  `%APPDATA%/EmbeddedSystemsVirtualLab/packages/*/package.json` and loaded without touching the
  core.
- **Model registry** in the worker: models are looked up by id; packages with code models
  ship an ES module registered in the worker (planned: sandboxed dynamic import).
- **MCU emulators** register by core family (`avr`, `rp2040`; future `renode`).
- **Toolchains** register by language/board family; PlatformIO covers most boards.
- **Instruments** are panels consuming generic capture streams; decoders are pure functions.

## Process model & offline guarantee

- Production: the WebView loads bundled assets over `tauri://`; no network, no localhost.
- Toolchain: Rust spawns `pio run` from the app-private venv with `PLATFORMIO_CORE_DIR` pointing
  to the app-private package cache; telemetry and update checks are disabled.
- Development only: `vite` dev server plus a Vite plugin exposing the same toolchain API over
  HTTP so the UI can be exercised in a plain browser. Not part of the shipped application.
