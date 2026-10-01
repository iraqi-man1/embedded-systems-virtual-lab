# ADR-001: Tauri 2 + React + TypeScript desktop shell

- Status: Accepted (October 2026)

## Context
The application must be a native, installable, fully offline Windows desktop program, not a
website. It needs an advanced canvas UI, a code editor, and must host MCU emulators and native
toolchains.

## Decision
Use Tauri 2 (Rust backend, system WebView2) with a React + TypeScript frontend built by Vite.
Production assets are embedded in the binary and served over Tauri's custom protocol; no
localhost server is involved at run time. All OS access (filesystem, processes, toolchains)
goes through typed Rust commands (`src-tauri/src/*.rs`).

## Consequences
- ~5–6 MB installers (NSIS and MSI are produced by `npm run app:build`).
- The best open MCU emulators for the web stack (avr8js, rp2040js) run in a Web Worker at
  full speed; native engines (ngspice, Renode, QEMU) are integrated as backend-managed
  processes/libraries, so no architecture change is needed to add them.
- Development uses the Vite dev server plus a dev-only HTTP shim for the toolchain; this shim
  is never part of a release build.
