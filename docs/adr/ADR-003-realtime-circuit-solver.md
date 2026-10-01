# ADR-003: Real-time quasi-static MNA solver for co-simulation; ngspice for offline analysis

- Status: Accepted (October 2026)

## Context
Every MCU pin edge (up to hundreds of thousands per second for PWM or bit-banging) must be
reflected in the circuit, and input pins/ADC must read the result at that same instant.
ngspice is the right tool for analog analysis, but running a SPICE transient analysis per pin
edge, synchronised with an instruction-level emulator inside an interactive app, is not
feasible at real-time rates.

## Decision
- Implement a small, deliberately limited real-time solver (`src/core/sim/analog/solver.ts`):
  Modified Nodal Analysis in Norton form (all sources have internal resistance), piecewise-
  linear diodes solved by state iteration, VCCS elements for transistor models, gmin for
  conditioning, and **island partitioning**: only electrically connected islands that contain
  a changed net are re-solved.
- Models integrate currents between solves so PWM yields correct averages (LED brightness,
  pin/supply currents for over-current diagnostics).
- Reactive elements (C, L), 555 timers, op-amp dynamics are **not** modelled in real time;
  such parts are marked visual-only/partial. ngspice will be integrated as an offline
  analysis backend (DC sweep, AC, transient) via `ngspice.dll` in the Rust backend.

## Consequences
- Interactive Arduino circuits simulate at 100% real time on modest hardware.
- Results are exact for resistive networks, correct to the PWL approximation for diodes/LEDs/
  BJTs, and switch-level for MOSFETs — each documented in the part's `simulation.notes`.
- Users see "visual-only"/"partial" badges instead of fabricated behaviour.
