**Requirements:** Windows 10/11 x64 with Microsoft Edge WebView2 (preinstalled on Windows 11; the installer fetches it if missing). The installers are **not code-signed yet**. If Windows SmartScreen warns, choose **More info → Run anyway**.

**Compiling firmware:** on the first compile the app offers to install its toolchain (PlatformIO + AVR GCC, private to the app). This needs **Python 3.9+** on the PATH and an internet connection **once**; after that, compiling and simulating work offline.

## What's new

- **Your work is safe:** crash-recovery autosave, Save / Don't save / Cancel when closing, F5 and Ctrl+R no longer reload the app, and the window title shows unsaved changes.
- **Interactive simulation:** drag the obstacle in front of an HC-SR04, tilt an IMU, move a joystick, turn knobs and encoders, press keypad and IR-remote keys, and set temperature, light and gas with on-canvas sliders; parts show live feedback.
- **76 simulated parts** (54 full, 22 partial). New: 4×4 keypad, KY-040 encoder, SSD1306 OLED, MPU-6050, DS1307, IR remote and receiver, NeoPixels (strip, ring, matrix), DC motor with L298N, steppers with A4988 and ULN2003.
- **Faster to work with:** a wider canvas (Properties under the library), command palette (Ctrl+Shift+P), quick add (Ctrl+K or double-click the canvas), recent projects, `.evlab` files open with a double-click or by dropping them on the window, a drop preview with the breadboard holes highlighted, re-attachable wire ends, and editable wire colours (keys 1–9).
- **Debugging:** Ctrl+B while running flashes the new build into the board without stopping the circuit; an MCU panel with pin states, PWM duty, registers and memory use; voltage badges on wires (V); serial monitor timestamps, hex view and log saving.
- **23 example projects**, searchable by tag, including a keypad lock, an encoder-driven NeoPixel ring and an MPU-6050 + OLED spirit level.

## Known limitations

- ESP32, ESP8266, RP2040/Pico, STM32 and RISC-V boards are visual-only for now.
- Capacitors, inductors and 555 timers are not simulated in real time.
- Hardware UART/SPI/I²C pins are simulated at protocol level, so the logic analyzer cannot see them.

The full list is in [docs/04-simulation-fidelity.md](https://github.com/iraqi-man1/embedded-systems-virtual-lab/blob/main/docs/04-simulation-fidelity.md).
