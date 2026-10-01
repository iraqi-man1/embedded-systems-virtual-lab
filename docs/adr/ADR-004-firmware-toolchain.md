# ADR-004: PlatformIO Core as the firmware toolchain layer

- Status: Accepted (October 2026)

## Decision
Compile firmware with PlatformIO Core (Apache-2.0) installed into an app-private Python
virtual environment (`%LOCALAPPDATA%\lab.evlab.desktop\toolchain`). The Rust backend writes a
persistent per-board build directory (so the Arduino core compiles once; incremental builds take
~2 s), runs `pio run` with telemetry and update checks disabled, parses GCC diagnostics back to
the user's file names, and returns the Intel HEX.

Library includes (`DHT.h`, `Servo.h`, `LiquidCrystal_I2C.h`…) are mapped to registry packages
automatically (`src/core/toolchain/libraries.ts`); a curated set is pre-fetched at installation
so common sketches compile offline.

## Consequences
- One toolchain layer covers AVR today and ESP32, RP2040, STM32 and RISC-V later.
- Installation requires Python 3.9+ and internet once. A future installer can bundle an
  embeddable Python and a pre-populated package cache for a zero-network first run.
