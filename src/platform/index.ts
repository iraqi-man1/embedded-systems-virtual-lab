/**
 * Platform services. In the desktop application everything goes through
 * Tauri commands (native dialogs, filesystem, PlatformIO). When the UI runs in
 * a plain browser during development, a fallback implementation is used.
 */
import { PROJECT_EXTENSION } from '../core/project/schema';
import type { CompileRequest, CompileResult, ToolchainStatus } from '../core/toolchain/types';

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

// ------------------------------------------------------------------ toolchain
export const toolchain = {
  async status(): Promise<ToolchainStatus> {
    if (isTauri) return invoke<ToolchainStatus>('toolchain_status');
    const r = await fetch('/__evlab/toolchain/status');
    if (!r.ok) throw new Error('Toolchain service unavailable');
    return r.json();
  },

  async install(onProgress: (line: string) => void): Promise<void> {
    if (!isTauri) throw new Error('Toolchain installation is available in the desktop application.');
    const { listen } = await import('@tauri-apps/api/event');
    const unlisten = await listen<string>('toolchain-progress', (e) => onProgress(e.payload));
    try {
      await invoke('toolchain_install');
    } finally {
      unlisten();
    }
  },

  async compile(request: CompileRequest): Promise<CompileResult> {
    if (isTauri) return invoke<CompileResult>('compile_firmware', { request });
    const r = await fetch('/__evlab/compile', { method: 'POST', body: JSON.stringify(request) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
};

// -------------------------------------------------------------------- storage
const filters = [{ name: 'Virtual Lab Project', extensions: [PROJECT_EXTENSION] }];

export const storage = {
  /** Shows an open dialog and returns { path, text }, or null if cancelled. */
  async openProject(): Promise<{ path: string; text: string } | null> {
    if (isTauri) {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const path = await open({ multiple: false, directory: false, filters });
      if (!path || Array.isArray(path)) return null;
      return { path, text: await invoke<string>('read_text_file', { path }) };
    }
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = `.${PROJECT_EXTENSION},application/json`;
      input.onchange = async () => {
        const f = input.files?.[0];
        resolve(f ? { path: f.name, text: await f.text() } : null);
      };
      input.click();
    });
  },

  /** Writes to `path`, or asks for a location when `path` is null. Returns the path used. */
  async saveProject(text: string, path: string | null, suggestedName: string): Promise<string | null> {
    if (isTauri) {
      let target = path;
      if (!target) {
        const { save } = await import('@tauri-apps/plugin-dialog');
        target = await save({ filters, defaultPath: `${suggestedName}.${PROJECT_EXTENSION}` });
      }
      if (!target) return null;
      await invoke('write_text_file', { path: target, contents: text });
      return target;
    }
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = path ?? `${suggestedName}.${PROJECT_EXTENSION}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return a.download;
  },
};

// ------------------------------------------------------------------- packages
export const packages = {
  async discover(): Promise<{ path: string; manifest: string }[]> {
    if (!isTauri) return [];
    return invoke('list_component_packages');
  },
};
