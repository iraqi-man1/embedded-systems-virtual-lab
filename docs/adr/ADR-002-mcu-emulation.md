# ADR-002: MCU emulation through a pluggable `McuEmulator` interface; avr8js first

- Status: Accepted (October 2026)

## Context
Firmware must really execute: `digitalWrite`, PWM, ADC, UART, I2C and SPI have to affect the
simulated circuit. Writing CPU emulators from scratch is out of scope.

## Decision
- Define `McuEmulator` (`src/core/sim/mcu/mcu.ts`): load firmware, run to a cycle, pin drive
  states, input levels, ADC voltages, serial, protocol-level I2C/SPI resolvers, event limiting.
- Implement it for AVR with **avr8js** (MIT): `src/core/sim/mcu/avr/avrEmulator.ts` maps board
  pins (from the definition's `mcu.pinMap`) onto avr8js ports/ADC channels.
- The MCU's cycle counter is the simulation master clock; GPIO listeners trigger circuit
  solves at the exact cycle of every pin change; scheduled device events cut the running slice
  short so they fire on time (instruction-level timing).
- Hardware buses (TWI, SPI, USART) are coupled at protocol level: a device is reachable when
  its bus pins are wired to the nets of the board's bus pins (found from pin `signals`).

## Consequences
- Arduino Uno and Nano (ATmega328P) are fully simulated today; bit-banged protocols (DHT22,
  HC-SR04, servo pulses, `shiftOut`, LiquidCrystal) work electrically.
- Hardware UART/SPI/I2C pins do not toggle electrically (logic analyzer cannot see them);
  documented limitation. TX waveform synthesis is a planned improvement.
- Next families plug into the same interface: rp2040js (RP2040/Pico), Renode bridge
  (STM32/nRF/RISC-V), Espressif QEMU (ESP32) as external processes.
