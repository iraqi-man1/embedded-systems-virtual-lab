/** Code in and out of a project: names the Arduino IDE and Thonny expect, and where imported files go. */
import { describe, expect, it } from 'vitest';
import { exportedFiles, importedName, sketchName } from '../src/core/project/codeFiles';
import { newProject } from '../src/core/project/schema';

describe('importing code', () => {
  it('makes a sketch the main sketch and main.py the main program', () => {
    expect(importedName('Blink.ino')).toBe('sketch.ino');
    expect(importedName('C:\\Users\\me\\Traffic\\Traffic.ino')).toBe('sketch.ino');
    expect(importedName('main.py')).toBe('main.py');
    expect(importedName('/home/me/MAIN.PY')).toBe('main.py');
  });

  it('keeps other code files, with names the lab accepts', () => {
    expect(importedName('helpers.h')).toBe('helpers.h');
    expect(importedName('motor driver.cpp')).toBe('motor_driver.cpp');
    expect(importedName('ssd1306.py')).toBe('ssd1306.py');
    expect(importedName('my-lib.py')).toBe('my_lib.py');
    expect(importedName('7seg.py')).toBe('_7seg.py');
  });

  it('refuses what is not code', () => {
    expect(importedName('notes.txt')).toBeNull();
    expect(importedName('project.evlab')).toBeNull();
    expect(importedName('.h')).toBeNull();
  });
});

describe('exporting code', () => {
  it('names the sketch after the project, as the Arduino IDE accepts it', () => {
    expect(sketchName('Traffic light')).toBe('Traffic_light');
    expect(sketchName('مشروعي')).toBe('sketch');
    expect(sketchName('  LED (v2)!  ')).toBe('LED_v2');
  });

  it('exports the files of the board language, the main file first', () => {
    const p = newProject('Blink v2');
    p.firmware.files = [
      { name: 'helpers.h', content: '#pragma once' },
      { name: 'sketch.ino', content: 'void setup() {}\nvoid loop() {}' },
      { name: 'main.py', content: 'print(1)' },
      { name: 'util.py', content: 'x = 1' },
    ];
    expect(exportedFiles(p, 'arduino').map((f) => f.name)).toEqual(['Blink_v2.ino', 'helpers.h']);
    expect(exportedFiles(p, 'arduino')[0].text).toContain('void loop');
    expect(exportedFiles(p, 'micropython').map((f) => f.name)).toEqual(['main.py', 'util.py']);
  });
});
