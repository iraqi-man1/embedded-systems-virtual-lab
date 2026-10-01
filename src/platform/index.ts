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
const LS_RECENT = 'evlab.recent.copies';

function browserRecent(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LS_RECENT) ?? '{}');
  } catch {
    return {};
  }
}

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

  /**
   * Reads a project file by path (recent projects, launch argument). The dev
   * browser can't read paths, so it keeps copies of recently used projects.
   */
  async readProject(path: string): Promise<string> {
    if (isTauri) return invoke<string>('read_text_file', { path });
    const text = browserRecent()[path];
    if (text === undefined) throw new Error(`${path} is not available any more`);
    return text;
  },

  /** Dev browser only: keeps a copy so the project can be reopened from the recent list. */
  keepRecentCopy(path: string, text: string, keep: string[]) {
    if (isTauri) return;
    const copies = browserRecent();
    copies[path] = text;
    for (const k of Object.keys(copies)) if (!keep.includes(k) && k !== path) delete copies[k];
    try {
      localStorage.setItem(LS_RECENT, JSON.stringify(copies));
    } catch {
      /* quota: the entry just can't be reopened */
    }
  },

  /** Saves a text export (serial log, VCD capture) where the user chooses. Returns the path, or null if cancelled. */
  async exportText(text: string, fileName: string, filter: { name: string; extensions: string[] }): Promise<string | null> {
    if (isTauri) {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const target = await save({ filters: [filter], defaultPath: fileName });
      if (!target) return null;
      await invoke('write_text_file', { path: target, contents: text });
      return target;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return fileName;
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

// ------------------------------------------------------------- open requests
/** Project files the operating system asks the app to open. */
export const launch = {
  /** File the app was started with (double-clicked project), once. */
  async takeLaunchFile(): Promise<string | null> {
    if (!isTauri) return null;
    return invoke<string | null>('take_launch_file');
  },
  /** Files opened while the app runs (a second launch is forwarded here). */
  async onOpenFile(handler: (path: string) => void): Promise<() => void> {
    if (!isTauri) return () => {};
    const { listen } = await import('@tauri-apps/api/event');
    return listen<string>('open-file', (e) => handler(e.payload));
  },
};

// ------------------------------------------------------------------- autosave
export interface AutosaveMeta {
  /** File the project was opened from / last saved to (null = never saved). */
  sourcePath: string | null;
  /** ISO timestamp. */
  savedAt: string;
  name: string;
}

const LS_AUTOSAVE = 'evlab.autosave.project';
const LS_AUTOSAVE_META = 'evlab.autosave.meta';

/** Crash-recovery copy of the open project (app-data folder; localStorage in the dev browser). */
export const autosaveStore = {
  async write(text: string, meta: AutosaveMeta): Promise<void> {
    if (isTauri) return invoke('autosave_write', { contents: text, meta: JSON.stringify(meta) });
    localStorage.setItem(LS_AUTOSAVE, text);
    localStorage.setItem(LS_AUTOSAVE_META, JSON.stringify(meta));
  },
  async read(): Promise<{ text: string; meta: Partial<AutosaveMeta> } | null> {
    let raw: { contents: string; meta: string } | null;
    if (isTauri) raw = await invoke<{ contents: string; meta: string } | null>('autosave_read');
    else {
      const contents = localStorage.getItem(LS_AUTOSAVE);
      raw = contents ? { contents, meta: localStorage.getItem(LS_AUTOSAVE_META) ?? '{}' } : null;
    }
    if (!raw) return null;
    let meta: Partial<AutosaveMeta> = {};
    try {
      meta = JSON.parse(raw.meta);
    } catch {
      /* metadata is optional */
    }
    return { text: raw.contents, meta };
  },
  async clear(): Promise<void> {
    if (isTauri) return invoke('autosave_clear');
    localStorage.removeItem(LS_AUTOSAVE);
    localStorage.removeItem(LS_AUTOSAVE_META);
  },
};

// ------------------------------------------------------------------- packages
export const packages = {
  async discover(): Promise<{ path: string; manifest: string }[]> {
    if (!isTauri) return [];
    return invoke('list_component_packages');
  },
};
