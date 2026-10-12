import { describe, expect, it } from "vitest";
import { label, tsc, zpl } from "../src/index.js";

/**
 * Barcodes/QR/matrix elements are drawn as rasterized pixels. Emitting a
 * `<rect>` per black dot produced thousands of SVG nodes (a 1D barcode is ~3k
 * at 1x1), which locked up react-native-svg on every preview render — they must
 * come out as a single `<path>` of black runs.
 */
describe("rasterized symbol preview", () => {
  const rects = (svg: string) => svg.match(/<rect/g) ?? [];
  const paths = (svg: string) => svg.match(/<path/g) ?? [];

  it("draws a rasterized barcode as one path, not a rect per dot (TSC)", () => {
    const svg = tsc.preview(
      label({ width: 60, height: 40 }).barcode("1234567890", {
        x: 5,
        y: 5,
        symbology: "code39",
        moduleWidth: 2,
        height: 80,
        readable: true,
      }),
    );

    expect(paths(svg)).toHaveLength(1);
    // Only the preview background + label frame — no per-dot rectangles.
    expect(rects(svg)).toHaveLength(2);
    expect(svg).toContain("1234567890"); // readable text stays under the symbol
  });

  it("draws a rasterized QR code as one path, not a rect per dot (TSC)", () => {
    const svg = tsc.preview(
      label({ width: 60, height: 40 }).qrcode("https://example.com", {
        x: 5,
        y: 5,
        cellSize: 4,
        ecc: "H",
      }),
    );

    expect(paths(svg)).toHaveLength(1);
    expect(rects(svg)).toHaveLength(2);
  });

  it("draws a rasterized barcode as one path, not a rect per dot (ZPL)", () => {
    const svg = zpl.preview(
      label({ width: 60, height: 40 }).barcode("1234567890", {
        x: 5,
        y: 5,
        symbology: "code39",
        moduleWidth: 2,
        height: 80,
        readable: true,
      }),
    );

    expect(paths(svg)).toHaveLength(1);
    expect(rects(svg)).toHaveLength(2);
  });
});
