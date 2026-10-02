/**
 * Reads MicroPython tracebacks from the board's serial output, line by line:
 *
 *   Traceback (most recent call last):
 *     File "main.py", line 12, in <module>
 *     File "helpers.py", line 3, in blink
 *   NameError: name 'pinn' isn't defined
 *
 * so the error can be shown in Problems and marked in the code editor.
 */

export interface PythonError {
  /** Frames in call order, outermost first. */
  frames: { file: string; line: number }[];
  /** Exception class, e.g. "NameError". */
  type: string;
  /** The whole last line, e.g. "NameError: name 'pinn' isn't defined". */
  message: string;
}

/** Interrupts and exits are how programs stop, not errors in them. */
const NOT_ERRORS = new Set(['KeyboardInterrupt', 'SystemExit']);

export class TracebackReader {
  private frames: { file: string; line: number }[] | null = null;

  /** Feeds one complete output line (without its line ending); returns the error a traceback ends with. */
  line(text: string): PythonError | null {
    const l = text.replace(/\r$/, '');
    if (l.startsWith('Traceback (most recent call last):')) {
      this.frames = [];
      return null;
    }
    if (!this.frames) return null;
    const frame = /^\s+File "([^"]+)", line (\d+)/.exec(l);
    if (frame) {
      this.frames.push({ file: frame[1], line: Number(frame[2]) });
      return null;
    }
    // Indented lines (source shown under a frame) and blank lines belong to the traceback.
    if (!l.trim() || /^\s/.test(l)) return null;
    const frames = this.frames;
    this.frames = null;
    const m = /^([A-Za-z_][\w.]*)(:|$)/.exec(l);
    if (!m || !frames.length || NOT_ERRORS.has(m[1])) return null;
    return { frames, type: m[1], message: l.trim() };
  }

  reset() {
    this.frames = null;
  }
}

/** The frame to point at: the innermost one in the project's own files (else the innermost one). */
export function errorLocation(err: PythonError, files: string[]): { file: string; line: number } {
  for (let i = err.frames.length - 1; i >= 0; i--) if (files.includes(err.frames[i].file)) return err.frames[i];
  return err.frames[err.frames.length - 1];
}
