**Requirements:** Windows 10/11 x64 with Microsoft Edge WebView2 (preinstalled on Windows 11; the installer fetches it if missing). The installers are **not code-signed yet**. If Windows SmartScreen warns, choose **More info → Run anyway**.

**Compiling Arduino code:** on the first compile the app offers to install its toolchain (PlatformIO + AVR GCC, private to the app). This needs **Python 3.9+** on the PATH and an internet connection **once**; after that, compiling and simulating work offline. **Python on the Raspberry Pi Pico needs nothing extra** — MicroPython ships with the app.

## What's new

- **Python:** program a simulated **Raspberry Pi Pico** in MicroPython — the real firmware runs on an RP2040 emulator. Run copies your `.py` files to the board, the Serial Monitor is an interactive `>>>` REPL (Ctrl+C / Ctrl+D), errors appear in Problems and on their line in the editor, and the editor completes and explains `machine`, `time` and `neopixel`. Four Pico examples and a Pico template.
- **Start screen:** recent projects with live previews, new projects from templates, the example gallery and a Learn tab.
- **عربي / English:** the whole interface in Arabic (right-to-left) or English, switchable at any time.
- **Eight themes** (light, dark, midnight, Nord, Dracula, Solarized, blueprint, high contrast) and a Settings dialog.
- **Help where you look:** hover a button, a setting or a part for a short explanation; the **Parts Guide** (F1) explains every part — what it is for, how to wire it step by step, every pin, and which Uno or Pico pin to use.
- **Canvas navigation:** pan by dragging with the right mouse button, a minimap (M), scrolling at the edges while dragging, arrow keys, and a scroll mode for the mouse wheel that suits touchpads.
- **Notes on the canvas:** text (T), arrows (A) and frames (B), saved with the project; **Find** (Ctrl+F) jumps to a part, a net or a note.
- **Export:** save the circuit as a PNG up to 768 DPI or as an SVG, or copy it as an image (Ctrl+Shift+C) to paste into a report.
- **77 simulated parts** (55 full, 22 partial) and **27 example projects**.

## Known limitations

- ESP32, ESP8266, STM32 and RISC-V boards are visual-only for now; the Pico runs MicroPython only (no Arduino C++ yet).
- Capacitors, inductors and 555 timers are not simulated in real time.
- Hardware UART/SPI/I²C pins are simulated at protocol level, so the logic analyzer cannot see them.

The full list is in [docs/04-simulation-fidelity.md](https://github.com/iraqi-man1/embedded-systems-virtual-lab/blob/main/docs/04-simulation-fidelity.md).
