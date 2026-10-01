# 04 — Simulation fidelity and known limitations

The application never pretends: each part carries `simulation.support` (`full`, `partial`,
`visual-only`) and notes shown in the library tooltip and the Inspector.

## What is simulated

| Area | Fidelity |
|---|---|
| ATmega328P (Uno, Nano) | Cycle-accurate CPU and peripherals via avr8js: GPIO, Timer0/1/2 PWM, USART0, ADC, SPI, TWI, EEPROM, watchdog |
| GPIO electrical model | 25 Ω drivers, 35 kΩ pull-ups, Schmitt thresholds 0.3/0.6 Vcc, floating-input detection, 20/40 mA current limits |
| Board supplies | 5 V (500 mA) and 3.3 V (150 mA) regulated outputs with over-current diagnostics |
| Resistive networks | Exact (MNA) — resistors, potentiometers, LDR, NTC, switches, buttons, DIP switches |
| LEDs, diodes, Zener | Piecewise-linear (Vf + series resistance); PWM brightness from averaged current |
| BJT | PWL cut-off / active (β) / saturation |
| MOSFET | Switch-level with a 1 V transition band |
| Logic ICs (74HC00/02/04/08/32/86, 74HC595) | Schmitt inputs, push-pull outputs, zero propagation delay |
| Bit-banged protocols | Electrically exact edge timing (instruction level): DHT11/22, HC-SR04, servo pulses, HD44780 parallel, `shiftOut` |
| Hardware buses | Protocol level: I2C (LCD/PCF8574), SPI (74HC595), USART (Serial Monitor) |
| Instruments | Multimeter (V, Ω on the unpowered network, A through resistors), oscilloscope, logic analyzer with UART decoder and VCD export, serial monitor/plotter |

## Known limitations (planned work)

- No reactive elements in real time (capacitors, inductors, 555 timers, RC filters). ngspice
  backend planned for offline transient/AC analysis.
- Hardware UART/SPI/I2C pins don't toggle electrically; the logic analyzer only sees GPIO-driven
  signals. Bus pull-ups/levels are not checked.
- One MCU board per project receives firmware (multiple boards can be placed; only the target
  board runs code).
- RESET pin: the MCU restarts when RESET is released; it keeps running while held low.
- Not yet simulated: ESP32/ESP8266, RP2040, STM32, RISC-V boards; NeoPixels, OLED/TFT,
  MPU-6050, RTC, RFID, radio modules, motors and drivers (all marked visual-only).
