/**
 * The "computer" on the other end of the Pico's USB cable while MicroPython
 * starts: like Thonny or mpremote, it waits for the REPL, enters the raw
 * REPL, writes the project's .py files to the board's file system, leaves
 * the raw REPL and soft-resets, so MicroPython runs main.py exactly as on a
 * real board. Until then the REPL traffic is hidden; afterwards every byte
 * goes to the serial monitor (the REPL is interactive once main.py ends).
 */

const CTRL_A = 0x01; // raw REPL
const CTRL_B = 0x02; // leave raw REPL
const CTRL_C = 0x03; // interrupt
const CTRL_D = 0x04; // execute (raw REPL) / soft reset (friendly REPL)

type Phase = 'boot' | 'raw' | 'upload' | 'leave' | 'reboot' | 'run';

/** A Python string literal for `text` (UTF-8 is fine in MicroPython source). */
export function pyString(text: string): string {
  let out = "'";
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (ch === '\\') out += '\\\\';
    else if (ch === "'") out += "\\'";
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (c < 0x20 || c === 0x7f) out += `\\x${c.toString(16).padStart(2, '0')}`;
    else out += ch;
  }
  return `${out}'`;
}

/** Python that writes the files and reports how many bytes were written. */
export function uploadScript(files: { name: string; content: string }[]): string {
  const lines = ['import os', 'n=0'];
  for (const f of files) {
    // Write in pieces so a large file never needs one huge string in RAM.
    lines.push(`f=open(${pyString(f.name)},'w')`);
    for (let i = 0; i < f.content.length; i += 512) lines.push(`n+=f.write(${pyString(f.content.slice(i, i + 512))})`);
    lines.push('f.close()');
  }
  // Remove stale .py files of an earlier run (kept: files the program itself created).
  const names = files.map((f) => pyString(f.name)).join(',');
  lines.push(`for x in os.listdir():\n if x.endswith('.py') and x not in (${names}${files.length === 1 ? ',' : ''}):\n  os.remove(x)`);
  lines.push('print(n)');
  return `${lines.join('\n')}\n`;
}

export class MicroPythonHost {
  private phase: Phase = 'boot';
  private buffer = '';
  private queue: number[] = [];
  /** Text shown in place of the hidden start-up traffic when something goes wrong. */
  error: string | null = null;

  constructor(
    private files: { name: string; content: string }[],
    /** Bytes for the serial monitor (only after the upload). */
    private output: (bytes: Uint8Array) => void,
  ) {}

  get running() {
    return this.phase === 'run';
  }

  /** Called when the board has rebooted from flash that already holds the files (RESET button). */
  skipUpload() {
    this.phase = 'run';
  }

  /** The board's USB serial port came up. */
  connected() {
    if (this.phase !== 'boot') return;
    // Stop whatever runs (an old main.py), then enter the raw REPL.
    this.send([CTRL_C, CTRL_C, CTRL_A]);
    this.phase = 'raw';
  }

  /** Bytes from the board. */
  received(bytes: Uint8Array) {
    if (this.phase === 'run') {
      this.output(bytes);
      return;
    }
    for (const b of bytes) this.buffer += String.fromCharCode(b);
    if (this.phase === 'raw' && this.buffer.includes('raw REPL; CTRL-B to exit\r\n>')) {
      this.buffer = '';
      this.phase = 'upload';
      this.send([...new TextEncoder().encode(uploadScript(this.files)), CTRL_D]);
    } else if (this.phase === 'upload') {
      // Raw REPL answer: "OK" stdout \x04 stderr \x04 ">".
      const m = this.buffer.match(/OK([\s\S]*?)\x04([\s\S]*?)\x04>/);
      if (!m) return;
      if (m[2].trim()) this.error = m[2].trim();
      this.buffer = '';
      this.phase = 'leave';
      this.send([CTRL_B]);
    } else if (this.phase === 'leave' && this.buffer.includes('>>> ')) {
      this.buffer = '';
      this.phase = 'reboot';
      if (this.error) this.output(new TextEncoder().encode(`\r\nCould not copy the files to the board:\r\n${this.error}\r\n`));
      // Soft reset: MicroPython restarts and runs main.py.
      this.send([CTRL_D]);
    } else if (this.phase === 'reboot') {
      // Hide the "MPY: soft reboot" line of that reset; what follows is the program's output.
      const end = this.buffer.indexOf('soft reboot\r\n');
      if (end < 0 && this.buffer.length < 64) return;
      const rest = end < 0 ? this.buffer : this.buffer.slice(end + 'soft reboot\r\n'.length);
      this.buffer = '';
      this.phase = 'run';
      if (rest) this.output(Uint8Array.from(rest, (c) => c.charCodeAt(0)));
    }
  }

  /** Bytes from the serial monitor (ignored until the upload is done). */
  write(byte: number): boolean {
    if (this.phase !== 'run') return false;
    this.queue.push(byte);
    return true;
  }

  private send(bytes: Iterable<number>) {
    for (const b of bytes) this.queue.push(b);
  }

  /** Moves queued bytes into the USB FIFO while it has room. */
  pump(room: () => boolean, push: (b: number) => void) {
    while (this.queue.length && room()) push(this.queue.shift()!);
  }

  get pending() {
    return this.queue.length > 0;
  }
}
