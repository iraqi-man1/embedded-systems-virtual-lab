# 01 — Open-Source Technology Research

Status: initial survey, October 2026. Versions are those resolved from the npm / PyPI
registries while bootstrapping the project. Licences were checked against each project's
`LICENSE` file / package metadata. **Re-verify licences before redistributing an installer.**

The guiding rule for the project: _do not reinvent mature technology_. Every subsystem below
was evaluated for (a) maturity and maintenance, (b) licence compatibility with a
redistributable desktop application, (c) whether it can run fully offline, and (d) how it
integrates with a Tauri (Rust + WebView) application.

Legend: ✅ adopted now · 🔜 adopted later (planned integration point exists) · ❌ rejected

---

## 1. Desktop shell

| Technology | Licence | Verdict | Notes |
|---|---|---|---|
| **Tauri 2** (`@tauri-apps/cli` 2.12, `tauri` crate 2.x) | MIT / Apache-2.0 | ✅ | Small native binary, uses the system WebView2 on Windows, Rust backend for process spawning (toolchains, Renode, ngspice) and filesystem access. No localhost server in production: assets are served via the `tauri://` custom protocol. |
| Electron | MIT | ❌ | Works, but ~150 MB runtime and weaker process/security model. No simulation feature needs Chromium specifically. |
| Qt / C++ native | LGPL/GPL/commercial | ❌ | Would forfeit the TypeScript ecosystem (avr8js, rp2040js, Wokwi Elements, Monaco) that the simulation stack is built on. |

**Decision:** Tauri + React + TypeScript, as requested. Nothing in the simulation stack
requires a different architecture: the AVR/RP2040 emulators are JavaScript, and native engines
(ngspice, Renode) are run as separate processes / shared libraries owned by the Rust backend.

## 2. UI framework & state

| Technology | Licence | Verdict | Notes |
|---|---|---|---|
| React 19 | MIT | ✅ | UI composition. |
| Vite 8 | MIT | ✅ | Build tool only. The dev server is used during development; production builds are static assets embedded in the Tauri binary. |
| Zustand 5 | MIT | ✅ | Small store with selector subscriptions; suits a document model with undo history. |
| Immer 11 | MIT | ✅ | Immutable document updates with structural sharing (cheap undo snapshots). |
| lucide-react | ISC | ✅ | Icon set. |
| uPlot | MIT | 🔜 | Very fast time-series plotting; candidate for the serial plotter once channel counts grow. Instruments currently draw directly to `<canvas>`. |
| React Flow (xyflow) | MIT | ❌ | Node-graph editor; models edges between *nodes*, not wires between arbitrary pins with orthogonal waypoints, junctions and breadboard insertion. A purpose-built SVG/HTML canvas is simpler and more faithful. |

## 3. Code editor

| Technology | Licence | Verdict | Notes |
|---|---|---|---|
| **Monaco Editor** 0.57 | MIT | ✅ | VS Code's editor. Loaded from the local `monaco-editor` package (never from a CDN) so it works offline. |
| `@monaco-editor/react` 4.7 | MIT | ✅ | React wrapper; configured with `loader.config({ monaco })` to avoid its default CDN loader. |
| CodeMirror 6 | MIT | ❌ (alternative) | Lighter, but Monaco has better C/C++ tokenisation and a path to LSP (clangd) later. |
| clangd (LLVM) | Apache-2.0 w/ LLVM exception | 🔜 | Language server for completion/diagnostics; would run as a sidecar process via the Rust backend. |

## 4. MCU / SoC emulation

| Technology | Licence | Verdict | Notes |
|---|---|---|---|
| **avr8js** 0.21 (Wokwi) | MIT | ✅ | Cycle-accurate AVR core (ATmega328P/2560, ATtiny85) with GPIO, timers/PWM, USART, SPI, TWI, ADC, EEPROM, watchdog peripherals. Runs in a Web Worker. Used for Arduino Uno/Nano/Mega. |
| **rp2040js** 1.4 (Wokwi) | MIT | ✅ | RP2040 (Cortex-M0+) emulator behind the same `McuEmulator` interface; runs the Raspberry Pi Pico with MicroPython (§7b). Our adapter adds serial-flash programming (for the MicroPython file system) and a USB-CDC host that only sends when it has data. |
| RP2040 boot ROM B1 | BSD-3-Clause (Raspberry Pi) | ✅ | Binary as published with rp2040js; bundled in `src/core/sim/mcu/rp2040/bootrom.ts` with its attribution. |
| **uf2** 2.0 (npm) | MIT | ✅ | Decodes the UF2 firmware image into the emulated flash. |
| **Renode** (Antmicro) | MIT | 🔜 | Full-system emulator for Cortex-M (STM32, nRF52…), RISC-V, and other platforms. Integration plan: Rust backend launches `renode --console --disable-xwt`, drives it over its monitor socket, and bridges GPIO via the Renode external-control API / socket peripherals. Requires .NET runtime bundled with Renode portable builds. |
| QEMU (incl. Espressif fork for ESP32) | GPL-2.0 | 🔜 (separate process only) | The only practical open emulator for Xtensa ESP32. Acceptable **only** as an unmodified, separately distributed executable invoked over IPC; never linked. |
| simavr | GPL-3.0 | ❌ | Mature AVR simulator, but GPL would contaminate the core if linked; avr8js covers the same ground under MIT. |
| SimulIDE | GPL-3.0 | ❌ | Desktop app, not a library. Used only as behavioural reference. |
| Wokwi ESP32 simulator | Proprietary | ❌ | Not open source. |

## 5. Visual component library

| Technology | Licence | Verdict | Notes |
|---|---|---|---|
| **@wokwi/elements** 1.9 | MIT | ✅ | ~50 Lit web components (Arduino Uno/Mega/Nano, ESP32 DevKit, LED, RGB LED, resistor, pushbutton, potentiometer, servo, LCD1602/2004, SSD1306, ILI9341, NeoPixel, 7-segment, DHT22, HC-SR04, HX711, MPU6050, …). Each exposes `pinInfo` (pin names + coordinates at 0.1″ = 9.6 px pitch), which we use for wiring and breadboard insertion. |
| KiCad symbol/footprint libraries | CC-BY-SA 4.0 + exception | 🔜 | Excellent pin metadata source for a future *schematic* view. The exception permits use in designs, but redistributing the library itself requires attribution/share-alike: keep it as a separately licensed asset pack. |
| Fritzing parts | CC-BY-SA 3.0 | 🔜 (asset pack) | Breadboard-view SVGs for thousands of parts. Share-alike licence → ship as an optional, separately licensed component pack, not inside the core. |
| Custom breadboard renderer | (ours) | ✅ | Wokwi Elements do not include a breadboard; we generate one procedurally (half/full size) with internal connectivity metadata. |

## 6. Analog circuit simulation

| Technology | Licence | Verdict | Notes |
|---|---|---|---|
| **ngspice** 4x/4.5 | Modified BSD (core); some contributed models under other permissive terms | 🔜 | De-facto open SPICE. Planned integration: `ngspice.dll` shared library loaded by the Rust backend (`libloading`), netlist exported from the circuit model, used for **offline analyses** (operating point, DC sweep, AC, transient) and for validating the real-time solver. |
| KLU / SuiteSparse | LGPL-2.1 | 🔜 | Sparse solver if real-time circuits grow large. |
| Built-in real-time MNA solver | (ours, ~300 LOC) | ✅ | See ADR-003. A full SPICE transient run per MCU pin edge is not viable at interactive rates in-process; the real-time co-simulation uses a small quasi-static Modified Nodal Analysis solver (linear elements + piecewise-linear diodes). This is the same approach used by every interactive MCU simulator (Wokwi, SimulIDE, Tinkercad). It is deliberately limited and documented as such. |

## 7. Firmware toolchain

| Technology | Licence | Verdict | Notes |
|---|---|---|---|
| **PlatformIO Core** 6.2 | Apache-2.0 | ✅ | Board definitions, toolchain/package management, library manager, build system. Installed into an app-private Python virtual environment; packages cached locally so builds run offline afterwards. |
| avr-gcc (`toolchain-atmelavr`) | GPL-3.0 w/ GCC Runtime Library Exception | ✅ (invoked, not linked) | Downloaded by PlatformIO. Compiled firmware is not GPL-encumbered thanks to the runtime exception. |
| Arduino AVR core (`framework-arduino-avr`) | LGPL-2.1 | ✅ (invoked) | Linked into *user firmware*, not into our application. |
| arduino-cli | GPL-3.0 | ❌ (alternative) | Could be invoked as a separate process, but PlatformIO covers more architectures (STM32, ESP32, RP2040, RISC-V) under one interface. |
| Python 3.x | PSF | ✅ (runtime dep) | Required by PlatformIO. A future installer should bundle an embeddable Python. |

Verified on this machine: `pio run` with `platform = atmelavr`, `board = uno`,
`framework = arduino` produced a valid `firmware.hex` (2 224 B flash) fully locally.

## 7b. Python on microcontrollers

| Technology | Licence | Verdict | Notes |
|---|---|---|---|
| **MicroPython** 1.27 (`RPI_PICO` build) | MIT (core); bundled third-party parts BSD-3-Clause (pico-sdk, littlefs), MIT (TinyUSB) | ✅ | The official, unmodified firmware runs on the emulated RP2040. Shipped as `public/firmware/micropython-rpi-pico.uf2` with its `LICENSE` beside it; rebuilt from the tagged sources with `tools/build-micropython.sh` (Arm GNU toolchain). The (L)GPL files listed in MicroPython's licence tree are build scripts only and are not part of the image. |
| CircuitPython | MIT | ❌ (for now) | Similar, but MicroPython is the Pico's reference Python and what most course material uses. |
| Python on the AVR (Uno) | — | ❌ | The ATmega328P (2 KB RAM) cannot host a Python interpreter; Arduino boards stay C++. |

## 8. Instruments / protocol decoding

| Technology | Licence | Verdict | Notes |
|---|---|---|---|
| sigrok / libsigrokdecode | GPL-3.0 | ❌ (in-process) / 🔜 (export) | Industry-standard protocol decoders, but GPL. We will *export* captures in sigrok/VCD formats so users can open them in PulseView, and write our own lightweight decoders (UART/I2C/SPI) for in-app use. |
| VCD (IEEE 1364 value change dump) | open format | 🔜 | Export format for logic-analyzer captures. |

## 9. Summary of licence posture

- The application core (our code) can be released under any licence; every adopted
  in-process dependency is MIT / Apache-2.0 / ISC / BSD.
- Firmware images run inside the emulator (MicroPython, the RP2040 boot ROM) are MIT /
  BSD-3-Clause and ship with their licence text.
- GPL tools (avr-gcc, QEMU) are only ever executed as separate programs.
- Share-alike asset libraries (Fritzing, KiCad) must be distributed as separately licensed
  component packs, which the plugin/package architecture supports natively.
