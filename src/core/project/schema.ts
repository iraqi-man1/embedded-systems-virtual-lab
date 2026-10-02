/**
 * Project Storage — the versioned `.evlab` file format.
 *
 * A project is a single UTF-8 JSON document. `version` is bumped whenever the
 * shape changes; `migrateProject` upgrades older files on load.
 */
import type { Annotation, CircuitDocument } from '../model/circuit';
import type { PinRef } from '../model/circuit';
import { version } from '../../../package.json';

export const PROJECT_FORMAT = 'evlab-project';
export const PROJECT_VERSION = 1;
export const PROJECT_EXTENSION = 'evlab';

export interface SourceFile {
  name: string;
  content: string;
}

export interface ProbeChannel {
  id: string;
  target: PinRef;
  label: string;
  color: string;
}

export interface Project {
  format: typeof PROJECT_FORMAT;
  version: number;
  meta: {
    name: string;
    description: string;
    author: string;
    created: string;
    modified: string;
    appVersion: string;
  };
  circuit: CircuitDocument;
  firmware: {
    language: 'arduino';
    files: SourceFile[];
    /** Component id of the board the firmware is compiled for (null = first board). */
    target: string | null;
  };
  simulation: { speed: number; realtime: boolean };
  instruments: {
    logic: ProbeChannel[];
    scope: ProbeChannel[];
    meter: { red: PinRef | null; black: PinRef | null };
  };
  view: { x: number; y: number; zoom: number };
}

export const DEFAULT_SKETCH = `// Blink — toggles the LED on pin 13 every second.
void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, HIGH);
  delay(1000);
  digitalWrite(13, LOW);
  delay(1000);
}
`;

export function newProject(name = 'Untitled'): Project {
  const now = new Date().toISOString();
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    meta: { name, description: '', author: '', created: now, modified: now, appVersion: version },
    circuit: { components: [], wires: [] },
    firmware: { language: 'arduino', files: [{ name: 'sketch.ino', content: DEFAULT_SKETCH }], target: null },
    simulation: { speed: 1, realtime: true },
    instruments: { logic: [], scope: [], meter: { red: null, black: null } },
    view: { x: 80, y: 60, zoom: 1 },
  };
}

export function serializeProject(p: Project): string {
  return JSON.stringify({ ...p, meta: { ...p.meta, modified: new Date().toISOString() } }, null, 2);
}

export class ProjectFormatError extends Error {}

/** Parses and validates a project file, migrating older versions. */
export function parseProject(text: string): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectFormatError('The file is not valid JSON.');
  }
  return migrateProject(raw);
}

const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

function isAnnotation(a: unknown): a is Annotation {
  const n = a as Record<string, unknown> | null;
  if (!n || typeof n !== 'object' || typeof n.id !== 'string') return false;
  if (n.kind === 'text') return num(n.x) && num(n.y) && typeof n.text === 'string' && num(n.size);
  if (n.kind === 'arrow') return num(n.x1) && num(n.y1) && num(n.x2) && num(n.y2);
  if (n.kind === 'rect') return num(n.x) && num(n.y) && num(n.w) && num(n.h);
  return false;
}

export function migrateProject(raw: unknown): Project {
  const r = raw as Partial<Project> & Record<string, unknown>;
  if (!r || typeof r !== 'object' || r.format !== PROJECT_FORMAT) {
    throw new ProjectFormatError('Not an Embedded Systems Virtual Lab project.');
  }
  if (typeof r.version !== 'number' || r.version > PROJECT_VERSION) {
    throw new ProjectFormatError(`Project version ${String(r.version)} is newer than this application supports.`);
  }
  // Version 1 is the first format; future migrations chain here (v1 -> v2 -> ...).
  const base = newProject();
  const circuit = r.circuit as CircuitDocument | undefined;
  if (!circuit || !Array.isArray(circuit.components) || !Array.isArray(circuit.wires)) {
    throw new ProjectFormatError('Project has no valid circuit.');
  }
  // Canvas notes are optional; malformed ones are dropped rather than failing the whole project.
  if (circuit.annotations !== undefined) {
    circuit.annotations = Array.isArray(circuit.annotations) ? circuit.annotations.filter(isAnnotation) : undefined;
  }
  return {
    ...base,
    ...r,
    meta: { ...base.meta, ...(r.meta ?? {}) },
    firmware: { ...base.firmware, ...(r.firmware ?? {}) },
    simulation: { ...base.simulation, ...(r.simulation ?? {}) },
    instruments: { ...base.instruments, ...(r.instruments ?? {}) },
    view: { ...base.view, ...(r.view ?? {}) },
    circuit,
    version: PROJECT_VERSION,
    format: PROJECT_FORMAT,
  };
}
