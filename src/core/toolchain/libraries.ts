/**
 * Maps `#include <Header.h>` lines to PlatformIO registry libraries so that
 * common Arduino libraries work without manual configuration. Headers that
 * ship with the Arduino AVR core (Wire, SPI, EEPROM, SoftwareSerial) need no
 * entry. Libraries are downloaded once and cached in the persistent build
 * directory; the toolchain installer pre-fetches this curated set so they
 * also work offline.
 */
import type { SourceFile } from '../project/schema';

export const LIBRARY_MAP: Record<string, string[]> = {
  'Servo.h': ['arduino-libraries/Servo@^1.2.2'],
  'LiquidCrystal.h': ['arduino-libraries/LiquidCrystal@^1.0.7'],
  'LiquidCrystal_I2C.h': ['marcoschwartz/LiquidCrystal_I2C@^1.1.4'],
  'DHT.h': ['adafruit/DHT sensor library@^1.4.6', 'adafruit/Adafruit Unified Sensor@^1.1.14'],
  'Adafruit_NeoPixel.h': ['adafruit/Adafruit NeoPixel@^1.12.3'],
  'RTClib.h': ['adafruit/RTClib@^2.1.4'],
  'Adafruit_SSD1306.h': ['adafruit/Adafruit SSD1306@^2.5.13', 'adafruit/Adafruit GFX Library@^1.11.11'],
  'Stepper.h': ['arduino-libraries/Stepper@^1.1.3'],
  'IRremote.hpp': ['z3t0/IRremote@^4.4.1'],
  'Keypad.h': ['chris--a/Keypad@^3.1.1'],
  'OneWire.h': ['paulstoffregen/OneWire@^2.3.8'],
  'DallasTemperature.h': ['milesburton/DallasTemperature@^3.11.0', 'paulstoffregen/OneWire@^2.3.8'],
};

/** Libraries required by the sketch's includes (deduplicated, stable order). */
export function detectLibraries(files: SourceFile[]): string[] {
  const out: string[] = [];
  const local = new Set(files.map((f) => f.name));
  for (const f of files) {
    for (const m of f.content.matchAll(/^\s*#\s*include\s*[<"]([^>"]+)[>"]/gm)) {
      const header = m[1].split('/').pop()!;
      if (local.has(header)) continue;
      for (const lib of LIBRARY_MAP[header] ?? []) if (!out.includes(lib)) out.push(lib);
    }
  }
  return out;
}
