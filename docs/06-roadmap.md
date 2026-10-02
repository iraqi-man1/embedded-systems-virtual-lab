# 06 — Roadmap

What the lab can grow into next, grouped by area. Items are ideas with a direction, not
commitments; [04 — Simulation fidelity](04-simulation-fidelity.md) lists what is simulated today
and its limits.

## Added in 0.4.0

- **Fixed:** the window no longer goes blank after the Parts Guide. In the desktop app's
  WebView2, `scrollIntoView` returns a value, and an effect that returned it handed React
  something that is not a cleanup function; React failed and removed the whole interface. Every
  part of the window now also has its own error boundary (a message with *Back* and *Try
  again*, never an empty window), problems are recorded for Help › Report a Problem, and the
  built application is tested in its real WebView2 on every pull request.
- **Fixed:** *New project* on the start screen creates the project and opens the editor (on the
  template used last).
- The code editor floats: drag its tab bar anywhere, resize it, drag it back to dock it.
- Double-click a part to set its value (resistor colour bands, E12 values); lock parts in place.
- Interface size 80–150 %; the project file saves itself after changes; version history.
- Export and import code (`.ino`, `.py`); code snippets for Arduino and MicroPython; the serial
  monitor remembers sent lines.
- Live voltage, current and power on the part card while simulating.
- Problems in Arabic with how to fix them; Arduino help in Arabic in the editor.
- A first-run tour.
- Wokwi projects: open a `diagram.json` (or Wokwi's zip) and save for Wokwi.
- An interface sweep (`tools/ui-sweep.mjs`) runs every example in both languages and all themes
  on every pull request.

## Added in 0.3.0

- Start screen with recent projects (live previews), templates, examples and a Learn tab.
- English and Arabic interface, with a right-to-left layout for Arabic.
- Eight themes (light, dark, midnight, Nord, Dracula, Solarized, blueprint, high contrast) and a
  Settings dialog.
- Help on hover for buttons, settings and parts; a Parts Guide page for all 140 parts (what it
  is, what it is for, how to wire it, pin table with suggested Uno and Pico pins).
- Canvas navigation: right-drag panning, minimap, edge scrolling, arrow keys, a wheel mode for
  touchpads.
- Text notes, arrows and frames on the canvas; Find (Ctrl+F).
- High-resolution image export (PNG up to 768 DPI, SVG) and Copy as Image.
- Python: MicroPython on a simulated Raspberry Pi Pico, with a REPL, tracebacks in Problems,
  editor help, examples and a template; bit-banged I2C (SoftI2C, `I2C.scan()`) reaches modules.

## Learning

- **Guided lab exercises**: step-by-step tasks (“wire an LED to GP15”, “make it blink at 2 Hz”)
  checked automatically against the netlist, pin states and serial output.
- **Assignments and grading**: a teacher packs a starting project with checks; students hand in
  a project file the lab can grade.
- **Lab report**: export the circuit image, code, instrument captures and notes as a PDF.
- **“Find the fault”** exercises: circuits with a planted mistake (reversed LED, missing
  pull-up, short) that the student diagnoses with the multimeter and the checks.
- **Arabic everywhere**: compiler errors and MicroPython tracebacks explained in Arabic (the
  tools write them in English).

## Simulation

- **Reactive parts in real time** (capacitors, inductors, RC filters, the 555 timer) and
  ngspice for offline analyses (operating point, DC sweep, AC, transient).
- **More boards**: Arduino Mega 2560 and ATtiny85 (avr8js already emulates them); Arduino C++
  on the Raspberry Pi Pico (the same RP2040 emulator with the arduino-pico core); ESP32 (QEMU,
  separate process) and STM32 (Renode).
- **Pico completeness**: the second core (`_thread`), UART pins wired to the circuit and to a
  second serial monitor, tested `rp2.PIO` programs, ready-made MicroPython drivers for the
  library's modules (SSD1306, I2C LCD, MPU-6050) offered when they are wired.
- **Several programmable boards** in one project, each with its own code, talking over UART,
  I2C or SPI.
- **Bus signals on the wires**: hardware I2C/SPI/UART traffic visible on the logic analyzer,
  with I2C and SPI decoders next to the UART one.
- **More parts simulated**: MAX7219, ILI9341 TFT, RFID, radio and GPS modules, load cells.

## Code and debugging

- **Source-level debugger**: breakpoints, stepping by line, variables and the call stack for
  Arduino sketches; `print`-free inspection of MicroPython variables.
- **Library manager** for Arduino libraries, and MicroPython modules (`mip`) bundled offline.
- **Checks before running**: compile MicroPython code with `mpy-cross` to show syntax errors in
  the editor before the board starts; C++ diagnostics as you type (clangd).

## Platform and workflow

- Automatic updates and signed installers; an installer that carries the Arduino toolchain
  (no Python or internet needed on first compile); macOS and Linux builds.
- Bill of materials and netlist export; a schematic view generated from the same circuit; more
  Wokwi parts (ESP32 boards, logic gates, the 4-digit 7-segment display).
- Several projects open in tabs; smart alignment guides; customisable keyboard shortcuts.
