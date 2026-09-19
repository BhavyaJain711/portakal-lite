import { describe, expect, it } from "vitest";
import { label, monochromeToSvgPath, tsc } from "../src/index.js";

const bitmap = (data: number[], width: number, height: number) => ({
  data: Uint8Array.from(data),
  width,
  height,
  bytesPerRow: Math.ceil(width / 8),
});

describe("monochromeToSvgPath", () => {
  it("emits one subpath per black run in bitmap coordinates", () => {
    // 8×1: first four black → 'M0 0h4v1H0z'.
    const path = monochromeToSvgPath(bitmap([0b11110000], 8, 1));

    expect(path).toBe("M0 0h4v1H0z");
  });

  it("returns an empty path for a blank bitmap", () => {
    expect(monochromeToSvgPath(bitmap([0], 8, 1))).toBe("");
  });

  it("caps the number of subpaths for large bitmaps", () => {
    const data = new Array(400 * Math.ceil(400 / 8)).fill(0xff);
    const path = monochromeToSvgPath(bitmap(data, 400, 400), { maxDimension: 100 });

    // 4×4 areas → 100×100 display grid → at most 100 runs (one per row).
    expect(path.split("M").length - 1).toBeLessThanOrEqual(100);
  });
});

describe("image preview", () => {
  it("draws the bitmap at its native size instead of stretching it to the cell", () => {
    const svg = tsc.preview(
      label({ width: 40, height: 30 }).image(bitmap([0xff], 8, 1), {
        x: 10,
        y: 10,
        width: 999,
        height: 999,
      }),
    );

    expect(svg).toContain('translate(10, 10)');
    expect(svg).toContain('<path d="M0 0h8v1H0z"');
    // The 999-dot target must not scale the raster (the printer can't either).
    expect(svg).not.toContain("scale(");
  });
});
