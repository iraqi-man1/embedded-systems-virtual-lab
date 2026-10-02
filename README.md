# Embedded Systems Virtual Lab

An offline, native desktop laboratory for designing, wiring, programming, simulating and
debugging embedded systems. Drag an Arduino, a breadboard, a resistor and an LED onto the
canvas, wire them, write Blink, press **Run** — the sketch is compiled with the real AVR GCC
toolchain and executed on a cycle-accurate ATmega328P emulator that drives the simulated
circuit.

Built with Tauri 2, React, TypeScript, avr8js, Wokwi Elements, Monaco Editor and PlatformIO.

**[⬇ Download the Windows installer](../../releases/latest)**

![I²C LCD example running: firmware drives an LCD over the emulated TWI bus while a potentiometer is read on A0](docs/images/screenshot-dark.png)

| Light theme — traffic light running on a breadboard | 23 ready-to-run example projects |
|---|---|
| ![Traffic light example in the light theme](docs/images/screenshot-light.png) | ![Examples and templates gallery](docs/images/screenshot-examples.png) |

## Highlights

- **Workspace**: infinite pan/zoom canvas, drag-and-drop library, rotate/flip/duplicate,
  multi-select, align/distribute, undo/redo, copy/paste, context menus, keyboard shortcuts,
  grid snapping, orthogonal wires with editable bends, junctions, net labels, wire colours and
  labels, A* auto-routing.
- **Fast to drive from the keyboard**: command palette (Ctrl+Shift+P), quick add a part
  (Ctrl+K or double-click the canvas), recent projects, `.evlab` file association and drag and
  drop, live build state in the status bar.
- **Breadboards that understand connectivity**: legs dropped on holes connect automatically;
  hover a hole to see every connected hole highlighted.
- **Component library**: 140 parts across 12 categories; 76 have simulation models (54 full,
  22 partial), including NeoPixels, an SSD1306 OLED, MPU-6050, DS1307, IR remote/receiver,
  keypad, rotary encoder, DC and stepper motors with L298N/A4988 drivers. Every part shows
  whether it is *fully simulated*, *partially simulated* or *visual-only*.
- **Interactive simulation**: drag the obstacle in front of an ultrasonic sensor, tilt an IMU,
  move a joystick, turn an encoder, press keypad and IR-remote keys, set temperature/light/gas
  with on-canvas sliders; parts show live feedback (beams, waves, glows, readouts).
- **Real firmware**: Monaco editor with Arduino completions and hover docs, multi-file sketches,
  automatic library resolution, PlatformIO compilation, compiler errors as editor markers.
- **Simulation**: run, pause, step (1 ms / instruction), reset, stop, 0.01×–4× or max speed;
  live interaction with buttons, knobs, switches and sensors.
- **Instruments**: serial monitor (bidirectional, timestamps, hex view, save log), serial
  plotter, oscilloscope with trigger and measurements, 8-channel logic analyzer with UART
  decoding and VCD export, multimeter (V / Ω / A), signal generator.
- **Debugging**: MCU panel with pin modes, levels, voltages and PWM duty, PC/SP/SREG, R0–R31 and
  flash/RAM use; voltage badges on wires (View › Show Voltages, `V`); Ctrl+B while running
  flashes the new build into the board without stopping the rest of the circuit.
- **Electrical checks**: shorts, supply conflicts, unconnected required pins, floating inputs,
  undefined logic levels, pin/supply over-current, LED over-current and reverse bias.
- **Projects**: versioned `.evlab` files with crash-recovery autosave; 23 example projects
  (Blink, button, PWM, traffic light, RGB, UART console, LDR, thermistor, transistor, MOSFET,
  HC-SR04, DHT22, servo, LCD, I²C LCD, SPI shift register, buzzer, relay, logic half adder,
  keypad lock, encoder + NeoPixel ring, MPU-6050 + OLED spirit level…), searchable by tag.
- **Extensible**: components, behaviour models, MCU emulators and toolchains are registered,
  not hard-coded; JSON component packages load from the user's packages folder.

## Getting started (users)

1. Download `EmbeddedSystemsVirtualLab_0.2.0_x64-setup.exe` (or the `.msi`) from the
   [Releases page](../../releases/latest) and run it. Windows 10/11 x64; the installer is not
   code-signed yet, so SmartScreen may ask you to confirm ("More info" → "Run anyway").
2. On first compile the app offers to install the firmware toolchain (PlatformIO, ~300 MB,
   needs Python 3.9+ and internet once). Afterwards everything works offline.
3. Open **Examples** and press **F5**.

## Development

Prerequisites: Node 20+, Rust (MSVC toolchain + Windows 10/11 SDK), Python 3.9+.

```bash
npm install
```

Install a repository-local PlatformIO used by the dev server, tests and debug builds:

```bash
py -m venv .toolchain/penv
```

```bash
.toolchain/penv/Scripts/python -m pip install platformio
```

Run the UI in a browser (dev only — uses an HTTP shim for compilation):

```bash
npm run dev
```

Run the desktop app in development mode:

```bash
npm run app:dev
```

Build the installers (`src-tauri/target/release/bundle/{nsis,msi}`):

```bash
npm run app:build
```

Tests (unit, simulation, examples):

```bash
npm test
```

Compile and simulate every example end to end (slow):

```bash
EVLAB_E2E=1 npx vitest run tests/examples-run.test.ts
```

Rust backend tests (the ignored one compiles firmware with `.toolchain/`):

```bash
cargo test --manifest-path src-tauri/Cargo.toml -- --include-ignored
```

## Documentation

- [Technology research & licences](docs/01-technology-research.md)
- [Architecture](docs/02-architecture.md)
- [Component packages (extending the library)](docs/03-component-packages.md)
- [Simulation fidelity & limitations](docs/04-simulation-fidelity.md)
- [UI regression checklist (floating UI, layering)](docs/05-ui-regression-checklist.md)
- Architecture decisions: [desktop shell](docs/adr/ADR-001-desktop-shell.md),
  [MCU emulation](docs/adr/ADR-002-mcu-emulation.md),
  [real-time solver](docs/adr/ADR-003-realtime-circuit-solver.md),
  [toolchain](docs/adr/ADR-004-firmware-toolchain.md)

## Repository layout

```
src/core/        Circuit model, component model, registry, netlist, ERC, project format,
                 simulation kernel (solver, engine, MCU emulators, behaviour models),
                 instruments (decoders), toolchain types        — no UI code
src/components/  Built-in component package (definitions, generated SVG visuals, breadboards)
src/examples/    Example projects (built from real geometry)
src/state/       Stores: project + history, editor, simulation client (Web Worker)
src/ui/          Desktop UI: workspace canvas, library, inspector, Monaco editor, instruments
src/platform/    Tauri / browser service adapters
src-tauri/       Rust backend: PlatformIO toolchain, project IO, package discovery
tests/           Vitest suites driving real compiled firmware (fixtures/*.ino → *.hex)
tools/           Dev-only Vite toolchain shim, Wokwi geometry measurement, fixture builder
```
