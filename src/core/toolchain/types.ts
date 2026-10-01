/**
 * Firmware Toolchain abstraction. The desktop implementation lives in Rust
 * (src-tauri/src/toolchain.rs, PlatformIO Core); the UI only sees these types.
 */
import type { McuDefinition } from '../model/component';
import type { SourceFile } from '../project/schema';
import { detectLibraries } from './libraries';

export interface CompileRequest {
  platform: string;
  board: string;
  framework: string;
  files: SourceFile[];
  buildFlags?: string[];
  libDeps?: string[];
}

export interface CompileDiagnostic {
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'note';
  message: string;
}

export interface CompileResult {
  success: boolean;
  hex: string | null;
  log: string;
  diagnostics: CompileDiagnostic[];
  flashBytes: number | null;
  ramBytes: number | null;
  durationMs: number;
}

export interface ToolchainStatus {
  installed: boolean;
  root: string;
  pioVersion: string | null;
  platforms: string[];
}

export function compileRequestFor(mcu: McuDefinition, files: SourceFile[]): CompileRequest {
  return { ...mcu.toolchain, files, libDeps: detectLibraries(files) };
}
