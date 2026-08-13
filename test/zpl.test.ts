import { describe, expect, it } from "vitest";
import { zpl } from "../src/index.js";
import { label } from "../src/index.js";

describe("ZPL II compiler", () => {
  it("generates basic label structure", () => {
    const output = zpl.compile(label({ width: 40, height: 30 }));

    expect(output).toContain("^XA");
    expect(output).toContain("^XZ");
    expect(output).toContain("^PW320");
    expect(output).toContain("^LL240");
    expect(output).toContain("^CI28");
    expect(output).toContain("^PQ1");
  });

  it("generates text field with hex-escape header", () => {
    const output = zpl.compile(
      label({ width: 40, height: 30 }).text("Hello ZPL", { x: 50, y: 50, size: 2 }),
    );

    expect(output).toContain("^FO50,50");
    expect(output).toContain("^A0N,48,48"); // size 2 × 24pt base height @203dpi
    expect(output).toContain("^FH_^FDHello ZPL^FS");
  });

  it("generates text with rotation", () => {
    const output = zpl.compile(
      label({ width: 40, height: 30 }).text("Rotated", { x: 10, y: 10, rotation: 90 }),
    );

    expect(output).toContain("^A0R,24,24"); // size 1 × 24pt base height
  });

  it("generates reverse text", () => {
    const output = zpl.compile(
      label({ width: 40, height: 30 }).text("Reversed", { x: 10, y: 10, reverse: true }),
    );

    expect(output).toContain("^FR");
  });

  it("generates block with alignment", () => {
    const output = zpl.compile(
      label({ width: 40, height: 30 }).text("Wrapped", {
        x: 10,
        y: 10,
        maxWidth: 200,
        align: "center",
      }),
    );

    expect(output).toContain("^FB200,999,0,C");
  });

  it("generates box", () => {
    const output = zpl.compile(
      label({ width: 40, height: 30 }).box({ x: 0, y: 0, width: 200, height: 100, thickness: 3 }),
    );

    expect(output).toContain("^FO0,0^GB200,100,3,B,0^FS");
  });

  it("generates circle", () => {
    const output = zpl.compile(
      label({ width: 40, height: 30 }).circle({ x: 100, y: 100, diameter: 60, thickness: 2 }),
    );

    expect(output).toContain("^FO100,100^GC60,2,B^FS");
  });

  it("generates horizontal line", () => {
    const output = zpl.compile(
      label({ width: 40, height: 30 }).line({ x1: 10, y1: 50, x2: 300, y2: 50, thickness: 2 }),
    );

    expect(output).toContain("^FO10,50^GB290,2,2^FS");
  });

  it("generates image as ASCII hex GF", () => {
    const bitmap = {
      data: new Uint8Array([0xff, 0x00, 0xff, 0x00]),
      width: 16,
      height: 2,
      bytesPerRow: 2,
    };

    const output = zpl.compile(label({ width: 40, height: 30 }).image(bitmap, { x: 10, y: 10 }));

    expect(output).toContain("^FO10,10^GFA,4,4,2,FF00FF00^FS");
  });

  it("handles raw ZPL passthrough", () => {
    const output = zpl.compile(label({ width: 40, height: 30 }).raw("^FO10,10^FDCustom^FS"));

    expect(output).toContain("^FO10,10^FDCustom^FS");
  });

  it("omits ^LL for receipt mode (no height)", () => {
    const output = zpl.compile(label({ width: 80 }));
    expect(output).not.toContain("^LL0");
  });

  it("renders preview SVG with ZPL font metrics", () => {
    const svg = zpl.preview(
      label({ width: 40, height: 30 }).text("Hello ZPL", { x: 50, y: 50, size: 2 }),
    );
    expect(svg).toContain("<svg");
    expect(svg).toContain("Hello ZPL");
    expect(svg).toContain("— ZPL");
  });
});
