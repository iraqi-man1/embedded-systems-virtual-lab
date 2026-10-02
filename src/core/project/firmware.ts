/**
 * The code side of a project: Arduino sketches (C++, compiled) for AVR
 * boards, or MicroPython scripts (run by the interpreter on the board) for
 * the Raspberry Pi Pico. The language follows the board the code runs on.
 */
import type { McuDefinition } from '../model/component';
import type { SourceFile } from './schema';

export type FirmwareLanguage = 'arduino' | 'micropython';

/** The file each language starts from; it can't be renamed. */
export const MAIN_FILE: Record<FirmwareLanguage, string> = { arduino: 'sketch.ino', micropython: 'main.py' };

export const isMainFile = (name: string) => name === MAIN_FILE.arduino || name === MAIN_FILE.micropython;
export const isPythonFile = (name: string) => /\.py$/i.test(name);

/** Language of the code a board runs. */
export const languageOf = (mcu: McuDefinition | undefined): FirmwareLanguage => (mcu?.runtime?.kind === 'micropython' ? 'micropython' : 'arduino');

/** The project files that belong to a language (a project may keep both kinds). */
export const sourcesFor = (language: FirmwareLanguage, files: SourceFile[]) => files.filter((f) => isPythonFile(f.name) === (language === 'micropython'));

/** A file may be removed unless it is the project's last main file. */
export const canRemoveFile = (name: string, files: SourceFile[]) => !isMainFile(name) || files.some((f) => f.name !== name && isMainFile(f.name));

/** Valid name for a new file of the language, or why not. */
export function fileNameProblem(language: FirmwareLanguage, name: string): 'pattern' | null {
  const re = language === 'micropython' ? /^[A-Za-z_][A-Za-z0-9_]*\.py$/ : /^[A-Za-z0-9_-]+\.(h|hpp|c|cpp)$/;
  return re.test(name) ? null : 'pattern';
}

/** Starting point of a Pico program: blinks the on-board LED and prints a greeting. */
export const DEFAULT_MAIN_PY = `# main.py runs when the board starts (MicroPython).
from machine import Pin
import time

led = Pin(25, Pin.OUT)   # the green LED on the Pico

print("Hello from the virtual lab!")

while True:
    led.toggle()
    time.sleep(0.5)
`;
