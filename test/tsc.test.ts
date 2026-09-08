import { describe, expect, it } from "vitest";
import { tsc } from "../src/index.js";
import { label } from "../src/index.js";

describe("TSC/TSPL2 compiler", () => {
  it("generates basic label setup commands", () => {
    const output = tsc.compile(label({ width: 40, height: 30 }));

    expect(output).toContain("SIZE 40 mm,30 mm\n");
    expect(output).not.toContain("GAP");
    expect(output).not.toContain("SPEED");
    expect(output).not.toContain("DENSITY");
    expect(output).not.toContain("DIRECTION");
    expect(output).toContain("CLS\n");
    expect(output).toContain("PRINT 1\n");
  });

  it("emits gap, speed, density, direction only when defined", () => {
    const output = tsc.compile(
      label({ width: 40, height: 30, gap: 3, speed: 4, density: 8, direction: 0 }),
    );
    expect(output).toContain("GAP 3 mm,0 mm\n");
    expect(output).toContain("SPEED 4\n");
    expect(output).toContain("DENSITY 8\n");
    expect(output).toContain("DIRECTION 0\n");
  });

  it("uses LF line endings by default", () => {
    const output = tsc.compile(label({ width: 40, height: 30 }));
    const lines = output.split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(output).not.toContain("\r");
  });

  it("supports CRLF line endings via lineEnding option", () => {
    const output = tsc.compile(label({ width: 40, height: 30, lineEnding: "\r\n" }));
    const lines = output.split("\r\n");
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  it("generates TEXT command", () => {
    const output = tsc.compile(
      label({ width: 40, height: 30 }).text("Hello World", { x: 10, y: 20, font: "3", size: 2 }),
    );

    expect(output).toContain('TEXT 10,20,"3",0,2,2,"Hello World"');
  });

  it("generates TEXT with rotation", () => {
    const output = tsc.compile(
      label({ width: 40, height: 30 }).text("Rotated", { x: 10, y: 20, rotation: 90 }),
    );

    expect(output).toContain('TEXT 10,20,"2",90,1,1,"Rotated"');
  });

  it("generates BLOCK command for maxWidth text", () => {
    const output = tsc.compile(
      label({ width: 40, height: 30 }).text("Long text", {
        x: 10,
        y: 10,
        maxWidth: 300,
        align: "center",
      }),
    );

    expect(output).toContain('BLOCK 10,10,300,300,"2",0,1,1,0,2,"Long text"');
  });

  it("uses maxHeight for BLOCK height when provided", () => {
    const output = tsc.compile(
      label({ width: 40, height: 30 }).text("Wrapped", {
        x: 10,
        y: 10,
        maxWidth: 300,
        maxHeight: 60,
      }),
    );
    expect(output).toContain('BLOCK 10,10,300,60,"2",0,1,1,0,1,"Wrapped"');
  });

  it("generates BOX command", () => {
    const output = tsc.compile(
      label({ width: 40, height: 30 }).box({ x: 5, y: 5, width: 300, height: 200, thickness: 2 }),
    );

    expect(output).toContain("BOX 5,5,305,205,2");
  });

  it("generates BOX with radius", () => {
    const output = tsc.compile(
      label({ width: 40, height: 30 }).box({
        x: 5,
        y: 5,
        width: 100,
        height: 100,
        thickness: 1,
        radius: 5,
      }),
    );

    expect(output).toContain("BOX 5,5,105,105,1,5");
  });

  it("generates horizontal line as BAR", () => {
    const output = tsc.compile(
      label({ width: 40, height: 30 }).line({ x1: 10, y1: 50, x2: 300, y2: 50, thickness: 2 }),
    );

    expect(output).toContain("BAR 10,50,290,2");
  });

  it("generates vertical line as BAR", () => {
    const output = tsc.compile(
      label({ width: 40, height: 30 }).line({ x1: 50, y1: 10, x2: 50, y2: 200, thickness: 3 }),
    );

    expect(output).toContain("BAR 50,10,3,190");
  });

  it("generates DIAGONAL for non-axis-aligned lines", () => {
    const output = tsc.compile(
      label({ width: 40, height: 30 }).line({ x1: 10, y1: 20, x2: 100, y2: 200, thickness: 2 }),
    );

    expect(output).toContain("DIAGONAL 10,20,100,200,2");
  });

  it("generates CIRCLE command", () => {
    const output = tsc.compile(
      label({ width: 40, height: 30 }).circle({ x: 100, y: 100, diameter: 50, thickness: 2 }),
    );

    expect(output).toContain("CIRCLE 100,100,50,2");
  });

  it("generates BITMAP command for images", () => {
    const bitmap = {
      data: new Uint8Array([0xff, 0x00]),
      width: 8,
      height: 2,
      bytesPerRow: 1,
    };
    const output = tsc.compile(label({ width: 40, height: 30 }).image(bitmap, { x: 10, y: 10 }));

    expect(output).toContain("BITMAP 10,10,1,2,0,");
  });

  it("generates ELLIPSE, REVERSE and ERASE", () => {
    const b = label({ width: 40, height: 30 })
      .ellipse({ x: 50, y: 50, width: 100, height: 60, thickness: 2 })
      .reverse({ x: 10, y: 10, width: 200, height: 30 })
      .erase({ x: 10, y: 10, width: 50, height: 50 });
    const output = tsc.compile(b);

    expect(output).toContain("ELLIPSE 50,50,100,60,2");
    expect(output).toContain("REVERSE 10,10,200,30");
    expect(output).toContain("ERASE 10,10,50,50");
  });

  it("handles raw command passthrough", () => {
    const output = tsc.compile(label({ width: 40, height: 30 }).raw("SET CUTTER ON"));

    expect(output).toContain("SET CUTTER ON");
  });

  it("handles multiple copies", () => {
    const output = tsc.compile(label({ width: 40, height: 30, copies: 5 }));
    expect(output).toContain("PRINT 5");
  });

  it("handles custom speed and density", () => {
    const output = tsc.compile(label({ width: 40, height: 30, speed: 8, density: 12 }));
    expect(output).toContain("SPEED 8");
    expect(output).toContain("DENSITY 12");
  });

  it("widens font 0 with xScale in points mode (height fixed)", () => {
    // Points mode + scalable font "0": TEXT x,y,"0",rot,w_pt,h_pt —
    // xScale sets w, h stays size.
    const wide = tsc.compile(
      label({ width: 40, height: 30, font0Mode: "points" }).text("Wide", { x: 10, y: 10, size: 20, xScale: 40, font: "0" }),
    );
    expect(wide).toContain('TEXT 10,10,"0",0,40,20,"Wide"');
  });

  it("passes font 1-8 multipliers through as xMul/yMul", () => {
    // Fixed-pitch fonts: TEXT x,y,"N",rot,xMul,yMul — size/xScale are
    // integer multipliers of the base dot size, passed through verbatim.
    const output = tsc.compile(
      label({ width: 40, height: 30 }).text("Hi", { x: 10, y: 20, font: "3", size: 2, xScale: 3 }),
    );
    expect(output).toContain('TEXT 10,20,"3",0,3,2,"Hi"');
  });

  it("keeps font 0 points semantics distinct from fixed fonts", () => {
    // font0Mode="points" only affects font "0"; fonts 1-8 stay multipliers.
    const b = label({ width: 40, height: 30, font0Mode: "points" })
      .text("A", { x: 0, y: 0, font: "3", size: 4, xScale: 4 });
    expect(tsc.compile(b)).toContain('TEXT 0,0,"3",0,4,4,"A"');
  });

  it("renders preview SVG with TSC font metrics", () => {
    const svg = tsc.preview(label({ width: 40, height: 30 }).text("Hello", { x: 10, y: 10, size: 2 }));
    expect(svg).toContain("<svg");
    expect(svg).toContain("Hello");
    expect(svg).toContain("— TSC");
  });

  it("previews fixed font 3 at its base dot size × multiplier", () => {
    // Font "3" is 16×24 dots; size 2 → 32px tall in the SVG (font-size=48
    // would be size 2 × 24). xScale 2 → stretch = (2×16)/(2×24) = 0.667.
    const svg = tsc.preview(
      label({ width: 40, height: 30 }).text("Hi", { x: 10, y: 10, font: "3", size: 2, xScale: 2 }),
    );
    expect(svg).toContain('font-size="48"');
    expect(svg).toContain('scale(1.11, 1)');
  });

  it("stretches glyphs horizontally in the preview when xScale is set", () => {
    const svg = tsc.preview(
      label({ width: 40, height: 30, font0Mode: "points" }).text("Wide", {
        x: 10, y: 10, size: 20, xScale: 40, font: "0",
      }),
    );
    // Height stays at the point size (20pt → 56.4 dots @203dpi); the x-axis
    // scales so each glyph width matches xScale. Target printer width uses
    // charWidthFactor 0.5; SVG monospace is 0.6: 40*0.5 / (20*0.6) ≈ 1.67.
    expect(svg).toContain('scale(1.67, 1)');
    expect(svg).toContain('font-size="56.39"');
  });

});
