import { describe, expect, it } from 'vitest';
import { crc32 } from 'node:zlib';
import { MAX_PNG_PIXELS, MAX_PNG_SIDE, maxScale, withDpi } from '../src/ui/export/exportImage';

/** PNG signature + IHDR for a 2×1 image (enough for the chunk layout). */
function tinyPng(): Uint8Array {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdr = new Uint8Array(25);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, 13);
  ihdr.set([0x49, 0x48, 0x44, 0x52], 4);
  v.setUint32(8, 2);
  v.setUint32(12, 1);
  ihdr.set([8, 6, 0, 0, 0], 16);
  v.setUint32(21, crc32(ihdr.subarray(4, 21)));
  const iend = [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
  return new Uint8Array([...sig, ...ihdr, ...iend]);
}

describe('image export', () => {
  it('records the resolution in the PNG', () => {
    const png = withDpi(tinyPng(), 384);
    const v = new DataView(png.buffer);
    expect(String.fromCharCode(...png.subarray(37, 41))).toBe('pHYs');
    expect(v.getUint32(33)).toBe(9);
    expect(v.getUint32(41)).toBe(Math.round(384 / 0.0254));
    expect(v.getUint32(45)).toBe(Math.round(384 / 0.0254));
    expect(png[49]).toBe(1);
    expect(v.getUint32(50)).toBe(crc32(png.subarray(37, 50)));
    // IHDR untouched, IEND still last.
    expect(String.fromCharCode(...png.subarray(12, 16))).toBe('IHDR');
    expect(String.fromCharCode(...png.subarray(png.length - 8, png.length - 4))).toBe('IEND');
  });

  it('keeps PNGs within what browsers can create', () => {
    expect(maxScale(400, 300)).toBeGreaterThanOrEqual(8);
    const s = maxScale(5000, 4000);
    expect(5000 * s).toBeLessThanOrEqual(MAX_PNG_SIDE + 1);
    expect(5000 * 4000 * s * s).toBeLessThanOrEqual(MAX_PNG_PIXELS * 1.0001);
  });
});
