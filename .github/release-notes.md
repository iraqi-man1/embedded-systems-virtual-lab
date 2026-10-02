**Requirements:** Windows 10/11 x64 with Microsoft Edge WebView2 (preinstalled on Windows 11; the installer fetches it if missing). The installers are **not code-signed yet**. If Windows SmartScreen warns, choose **More info → Run anyway**.

**Compiling Arduino code:** on the first compile the app offers to install its toolchain (PlatformIO + AVR GCC, private to the app). This needs **Python 3.9+** on the PATH and an internet connection **once**; after that, compiling and simulating work offline. **Python on the Raspberry Pi Pico needs nothing extra** — MicroPython ships with the app.

## What's new

**Fixed**

- **The window no longer goes blank** after visiting the Parts Guide and going back. The cause was specific to the desktop app's WebView2 (a scroll call that returns a value inside a React effect); it is fixed and the built app is now tested in its real WebView2 on every change. If a part of the window ever fails, it now shows a message with **Back** and **Try again** instead of an empty window, and **Help › Report a Problem** copies the details.
- **New project** on the start screen creates the project and opens the editor straight away (on the template you used last).

**Easier to work with**

- **Move the code editor anywhere:** drag its tab bar to float it over the lab, resize it, and drag it back (or double-click its bar) to dock it. It reopens where you left it.
- **Double-click a part to set its value** — a resistor shows E12 values and its colour bands. **Lock parts** (Ctrl+L) so a breadboard cannot move by mistake.
- **Your work is kept:** once a project has a file it is saved by itself after each change, and **File › Version History** keeps a copy each time you run or save (the last 30) to look at and restore.
- **Code in and out:** export the code to the Arduino IDE or Thonny and import `.ino`, `.h`, `.cpp` and `.py` files; **Snippets** inserts ready patterns (debounce, `millis()` timers, a state machine, PWM fade, servo, interrupts, averaged ADC readings) for Arduino and MicroPython.
- **Interface size** 80–150 % (Ctrl+Alt+= / −) for small screens and projectors; the serial monitor remembers what you sent (↑/↓).
- **Wokwi projects:** open a project from wokwi.com — its downloaded zip, or its `diagram.json` with the code (or drop them on the window) — and save yours for Wokwi (File › Wokwi). Parts, values, wires, breadboard holes and code carry over.

**Learn while you work**

- A short **tour** the first time (Help › Take the Tour shows it again).
- While simulating, a part's card shows the **voltage across it, the current, the power** and how much of its rating that is.
- **Problems in Arabic** (or English), each with **how to fix it** and a link to the part's page in the guide.
- **Arduino functions explained in Arabic** in the code editor, as well as in English.

## Known limitations

- ESP32, ESP8266, STM32 and RISC-V boards are visual-only for now; the Pico runs MicroPython only (no Arduino C++ yet).
- Capacitors, inductors and 555 timers are not simulated in real time.
- Hardware UART/SPI/I²C pins are simulated at protocol level, so the logic analyzer cannot see them.

The full list is in [docs/04-simulation-fidelity.md](https://github.com/iraqi-man1/embedded-systems-virtual-lab/blob/main/docs/04-simulation-fidelity.md).
