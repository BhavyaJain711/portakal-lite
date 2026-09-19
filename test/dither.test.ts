import { describe, expect, it } from "vitest";
import { toMonochromeBitmap } from "../src/index.js";
import { InvalidConfigError } from "../src/index.js";

/** Expand a packed 1-bit bitmap back to a black/white grid for assertions. */
function toGrid(bmp: { data: Uint8Array; width: number; height: number; bytesPerRow: number }) {
  const rows: number[][] = [];
  for (let y = 0; y < bmp.height; y++) {
    const row: number[] = [];
    for (let x = 0; x < bmp.width; x++) {
      row.push((bmp.data[y * bmp.bytesPerRow + (x >> 3)]! >> (7 - (x & 7))) & 1);
    }
    rows.push(row);
  }
  return rows;
}

describe("toMonochromeBitmap", () => {
  it("packs threshold output MSB-first", () => {
    // 8×1 grayscale: first four dark, last four light → one byte 0b11110000.
    const gray = Uint8Array.from([0, 10, 20, 30, 200, 210, 220, 230]);
    const bmp = toMonochromeBitmap(gray, 8, 1);

    expect(bmp).toMatchObject({ width: 8, height: 1, bytesPerRow: 1 });
    expect(Array.from(bmp.data)).toEqual([0b11110000]);
  });

  it("honors an explicit threshold", () => {
    const gray = Uint8Array.from([100, 100, 100, 100]);
    const dark = toMonochromeBitmap(gray, 4, 1, { threshold: 150 });
    const light = toMonochromeBitmap(gray, 4, 1, { threshold: 50 });

    expect(toGrid(dark)[0]).toEqual([1, 1, 1, 1]);
    expect(toGrid(light)[0]).toEqual([0, 0, 0, 0]);
  });

  it("uses luminance for RGB and composites RGBA over white", () => {
    // Pure green is light to the eye; pure blue is dark.
    const rgb = Uint8Array.from([0, 255, 0, 0, 0, 255]);
    expect(toGrid(toMonochromeBitmap(rgb, 2, 1))[0]).toEqual([0, 1]);

    // Transparent red must read as white (unmarked paper), opaque red as black.
    const rgba = Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 255]);
    expect(toGrid(toMonochromeBitmap(rgba, 2, 1))[0]).toEqual([0, 1]);
  });

  it("inverts black and white", () => {
    const gray = Uint8Array.from([0, 255, 0, 255]);
    expect(toGrid(toMonochromeBitmap(gray, 4, 1))[0]).toEqual([1, 0, 1, 0]);
    expect(toGrid(toMonochromeBitmap(gray, 4, 1, { invert: true }))[0]).toEqual([0, 1, 0, 1]);
  });

  it("stretches low-contrast input with levels (on by default)", () => {
    const gray = Uint8Array.from([140, 150, 160, 170]);

    expect(toGrid(toMonochromeBitmap(gray, 4, 1, { levels: false }))[0]).toEqual([0, 0, 0, 0]);
    expect(toGrid(toMonochromeBitmap(gray, 4, 1, { levels: true }))[0]).toEqual([1, 1, 0, 0]);
  });

  it("diffuses error with floyd-steinberg (mid-gray produces a mix, not a flat fill)", () => {
    const gray = new Uint8Array(64).fill(128);
    const grid = toGrid(toMonochromeBitmap(gray, 8, 8, { dither: "floyd-steinberg" }));
    const flat = grid.flat();

    expect(flat.some((v) => v === 1)).toBe(true);
    expect(flat.some((v) => v === 0)).toBe(true);
  });

  it("supports atkinson and ordered dithering", () => {
    const gray = new Uint8Array(256).fill(128);
    for (const dither of ["atkinson", "ordered"] as const) {
      const flat = toGrid(toMonochromeBitmap(gray, 16, 16, { dither })).flat();
      expect(flat.some((v) => v === 1)).toBe(true);
      expect(flat.some((v) => v === 0)).toBe(true);
    }
  });

  it("rejects malformed input", () => {
    expect(() => toMonochromeBitmap(new Uint8Array(8), 0, 1)).toThrow(InvalidConfigError);
    // 9 bytes cannot describe a 2×2 image at 1, 3 or 4 bytes per pixel.
    expect(() => toMonochromeBitmap(new Uint8Array(9), 2, 2)).toThrow(InvalidConfigError);
    expect(() => toMonochromeBitmap(new Uint8Array(4), 2, 2, { threshold: 300 })).toThrow(
      InvalidConfigError,
    );
  });
});
