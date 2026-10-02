# 04 — Simulation fidelity and known limitations

The application never pretends: each part carries `simulation.support` (`full`, `partial`,
`visual-only`) and notes shown in the library tooltip and the Inspector.

## What is simulated

| Area | Fidelity |
|---|---|
| ATmega328P (Uno, Nano) | Cycle-accurate CPU and peripherals via avr8js: GPIO, Timer0/1/2 PWM, USART0, ADC, SPI, TWI, EEPROM, watchdog |
| RP2040 (Raspberry Pi Pico) | Instruction-level Cortex-M0+ (core 0) and peripherals via rp2040js at 125 MHz, running the official MicroPython 1.27 firmware: GPIO with pull-ups/downs, PWM on every pin, 12-bit ADC on GP26–GP28 (plus VSYS/3 and the temperature sensor, which reads 27 °C), I2C0/1, SPI0/1, timers, USB CDC (the REPL), the 2 MB flash with its file system |
| GPIO electrical model | 25 Ω drivers, 35 kΩ pull-ups (Pico: 50 Ω, 50 kΩ pull-ups and pull-downs, 3.3 V), Schmitt thresholds 0.3/0.6 Vcc, floating-input detection, 20/40 mA current limits (Pico: 12/50 mA) |
| Board supplies | 5 V (500 mA) and 3.3 V (150 mA) regulated outputs with over-current diagnostics |
| Resistive networks | Exact (MNA) — resistors, potentiometers, LDR, NTC, switches, buttons, DIP switches |
| LEDs, diodes, Zener | Piecewise-linear (Vf + series resistance); PWM brightness from averaged current |
| BJT | PWL cut-off / active (β) / saturation |
| MOSFET | Switch-level with a 1 V transition band |
| Logic ICs (74HC00/02/04/08/32/86, 74HC595) | Schmitt inputs, push-pull outputs, zero propagation delay |
| Bit-banged protocols | Electrically exact edge timing (instruction level): DHT11/22, HC-SR04, servo pulses, HD44780 parallel, `shiftOut`, WS2812/NeoPixel (single, ring of 16, 8×8 matrix), NEC infrared (IR remote → IR receiver) |
| Hardware buses | Protocol level: I2C (LCD/PCF8574, SSD1306 OLED, MPU-6050, DS1307 RTC), SPI (74HC595), USART (Serial Monitor) |
| Bit-banged I2C | The board decodes the open-drain waveform on any pins wired to a module's SDA/SCL and answers for the modules (ACK, read data), so MicroPython's `SoftI2C`, `I2C.scan()` and software-I2C libraries reach the same devices. Released lines read high (modules carry pull-ups); no clock stretching |
| Input devices | 4×4 matrix keypad (resistive contacts), KY-040 quadrature encoder, joystick, DIP switch, buttons, switches, potentiometers |
| Motors and drivers | DC motor (speed follows average voltage, so PWM works), L298N dual H-bridge (current drawn from the motor supply, on-board 5 V regulator), A4988 microstepping driver, NEMA 17 bipolar stepper (rotor follows the coils' electrical angle), 28BYJ-48 + ULN2003 board, ULN2003 Darlington array |
| Instruments | Multimeter (V, Ω on the unpowered network, A through resistors), oscilloscope, logic analyzer with UART decoder and VCD export, serial monitor/plotter |

## Python on the Raspberry Pi Pico

The Pico runs the real MicroPython firmware, unmodified (`public/firmware`, rebuilt with
`tools/build-micropython.sh`), so the language, the `machine` and `time` modules, error messages
and the REPL are those of a real board:

- **Run** boots the interpreter, copies the project's `.py` files to the board's flash file system
  through the raw REPL (hidden from the Serial Monitor), then soft-resets so `main.py` runs — the
  same thing Thonny or `mpremote` do. Nothing is compiled; no toolchain is needed.
- The Serial Monitor is the USB serial port: `print()` output, tracebacks, and the `>>>` prompt
  once `main.py` ends or after **Ctrl+C**; **Ctrl+D** soft-resets and runs `main.py` again.
- A traceback (`File "main.py", line 4 … NameError: …`) is shown in Problems and marked on its
  line in the editor, in the innermost file of the project that it passes through.
- **Upload & restart** (Ctrl+B) while running copies the edited files and restarts only the Pico;
  the RESET button restarts it with the files already on the board. Files a program writes
  survive RESET but not a new Run (each Run starts from a freshly flashed board).
- Speed: programs that wait (`time.sleep`, waiting for a button) run in real time; tight
  computing loops run at roughly a third of real speed on a typical PC (the toolbar shows the
  achieved speed). Simulated time stays correct either way.

## Interacting while the simulation runs

Parts declare on-canvas controls and visual feedback in their definition (`controls`,
`indicators`; see [component packages](03-component-packages.md)), so JSON packages get them too:

- drag the obstacle in front of an HC-SR04, tilt an MPU-6050 with its pad, drag a joystick (it
  springs back), turn a KY-040 (drag around it or scroll), click keypad keys, DIP levers, IR
  remote buttons and the Arduino's RESET button;
- slider chips under sensors set temperature, humidity, light, gas/flame/sound level and supply
  voltage; action chips simulate a person passing a PIR, a clap at the sound sensor, a tilt;
- feedback: detection cones, echo ripples, sound/IR waves, ambient-light glow, read blinks,
  rotor angles, readouts (servo angle, buzzer frequency, rpm, supply current, relay contacts,
  transistor state, RTC time). *View › Show Logic Levels* marks IC/MCU pins high/low/undefined/
  floating;
- visual-only parts are dimmed and tagged “not simulated” while running.

Property controls (sliders, the distance target, the tilt pad) are also available on the selected
part when stopped, to set initial conditions; each gesture is one undo step.

## Known limitations (planned work)

- No reactive elements in real time (capacitors, inductors, 555 timers, RC filters). ngspice
  backend planned for offline transient/AC analysis.
- Hardware UART/SPI/I2C pins don't toggle electrically; the logic analyzer only sees GPIO-driven
  signals. Bus pull-ups/levels are not checked.
- One MCU board per project receives firmware (multiple boards can be placed; only the target
  board runs code).
- RESET pin: the MCU restarts when RESET is released; it keeps running while held low.
- WS2812 DOUT does not re-transmit to further parts (each NeoPixel part decodes its own DIN);
  NeoPixel and motor currents are not part of the supply load. MPU-6050: no DMP/FIFO/interrupts.
  SSD1306: I2C only (no SPI mode), scrolling not animated. DS1307: no SQW output.
- Raspberry Pi Pico: MicroPython only (Arduino C++ for the Pico is not wired up yet); the second
  core (`_thread`) is not emulated; UART0/1 pins are not connected to the circuit (`print()` and
  the REPL use USB); programs using `rp2.PIO` directly are untested; no Wi-Fi (Pico W).
- Not yet simulated: ESP32/ESP8266, STM32, RISC-V boards, Arduino Nano RP2040 Connect; TFT
  (ILI9341), MAX7219, RFID, radio modules, GPS, load cells (all marked visual-only).
