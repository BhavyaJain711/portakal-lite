import { describe, expect, it } from "vitest";
import { label, LabelBuilder } from "../src/index.js";
import { InvalidConfigError } from "../src/index.js";

describe("label builder", () => {
  it("creates a LabelBuilder", () => {
    expect(label({ width: 40, height: 30 })).toBeInstanceOf(LabelBuilder);
  });

  it("resolves mm to dots at 203 DPI", () => {
    const resolved = label({ width: 40, height: 30 }).resolve();
    expect(resolved.widthDots).toBe(320); // 40 * 203 / 25.4
    expect(resolved.heightDots).toBe(240); // 30 * 203 / 25.4
    expect(resolved.dpi).toBe(203);
    expect(resolved.gapDots).toBeUndefined();
    expect(resolved.speed).toBeUndefined();
    expect(resolved.density).toBeUndefined();
    expect(resolved.direction).toBeUndefined();
    expect(resolved.copies).toBeUndefined();
  });

  it("resolves custom gap, speed, density, direction, copies when defined", () => {
    const resolved = label({
      width: 40,
      height: 30,
      gap: 3,
      speed: 4,
      density: 8,
      direction: 0,
      copies: 2,
    }).resolve();
    expect(resolved.gapDots).toBe(24); // 3mm default
    expect(resolved.speed).toBe(4);
    expect(resolved.density).toBe(8);
    expect(resolved.direction).toBe(0);
    expect(resolved.copies).toBe(2);
  });

  it("supports unit inch and dot", () => {
    expect(label({ width: 2, height: 1, unit: "inch" }).resolve().widthDots).toBe(406);
    expect(label({ width: 320, unit: "dot" }).resolve().widthDots).toBe(320);
  });

  it("applies printer profile overrides", () => {
    const resolved = label({ width: 108, printer: "tsc-te310" }).resolve();
    expect(resolved.widthDots).toBe(Math.round(108 * (300 / 25.4)));
    expect(resolved.dpi).toBe(300);
  });

  it("respects explicit config over profile", () => {
    const resolved = label({ printer: "zebra-zd420", width: 50, dpi: 203 }).resolve();
    expect(resolved.widthDots).toBe(Math.round(50 * (203 / 25.4)));
  });

  it("chains elements fluently", () => {
    const b = label({ width: 40, height: 30 })
      .text("Hello", { x: 10, y: 10 })
      .box({ x: 0, y: 0, width: 100, height: 50 })
      .line({ x1: 0, y1: 0, x2: 100, y2: 0 });
    expect(b.resolve().elements).toHaveLength(3);
  });

  it("throws on invalid width", () => {
    expect(() => label({ width: 0 })).toThrow(InvalidConfigError);
    expect(() => label({ width: -5 })).toThrow(InvalidConfigError);
    expect(() => label({ width: NaN })).toThrow(InvalidConfigError);
    expect(() => label({ width: Number.POSITIVE_INFINITY })).toThrow(InvalidConfigError);
  });

  it("throws on non-finite dpi/height/gap", () => {
    expect(() => label({ width: 40, dpi: NaN }).resolve()).toThrow(InvalidConfigError);
    expect(() => label({ width: 40, height: NaN }).resolve()).toThrow(InvalidConfigError);
    expect(() => label({ width: 40, gap: Number.POSITIVE_INFINITY }).resolve()).toThrow(
      InvalidConfigError,
    );
  });

  it("throws on out-of-range speed/density/direction/copies", () => {
    expect(() => label({ width: 40, speed: 0 }).resolve()).toThrow(InvalidConfigError);
    expect(() => label({ width: 40, speed: 19 }).resolve()).toThrow(InvalidConfigError);
    expect(() => label({ width: 40, density: -1 }).resolve()).toThrow(InvalidConfigError);
    expect(() => label({ width: 40, density: 16 }).resolve()).toThrow(InvalidConfigError);
    expect(() => label({ width: 40, direction: 2 as 0 | 1 }).resolve()).toThrow(
      InvalidConfigError,
    );
    expect(() => label({ width: 40, copies: 0 }).resolve()).toThrow(InvalidConfigError);
  });

  it("throws when dimensions exceed 65535 dots (16-bit printer fields)", () => {
    expect(() => label({ width: 9000, unit: "mm" }).resolve()).toThrow(InvalidConfigError);
    expect(() => label({ width: 40, height: 9000, unit: "mm" }).resolve()).toThrow(
      InvalidConfigError,
    );
  });

  it("throws on non-finite element coordinates", () => {
    expect(() =>
      label({ width: 40, height: 30 }).text("Hi", { x: NaN, y: 10 }).resolve(),
    ).toThrow(InvalidConfigError);
    expect(() =>
      label({ width: 40, height: 30 }).box({ x: 0, y: 0, width: NaN, height: 10 }).resolve(),
    ).toThrow(InvalidConfigError);
  });

  it("resolves 4-directional margins correctly", () => {
    // Single number margin
    const resolvedNum = label({ width: 40, height: 30, margin: 2 }).resolve();
    expect(resolvedNum.marginDots).toBe(16);
    expect(resolvedNum.marginTopDots).toBe(16);
    expect(resolvedNum.marginBottomDots).toBe(16);
    expect(resolvedNum.marginLeftDots).toBe(16);
    expect(resolvedNum.marginRightDots).toBe(16);

    // Object with individual directions
    const resolvedObj = label({
      width: 40,
      height: 30,
      margin: { top: 1, bottom: 2, left: 3, right: 4 },
    }).resolve();
    expect(resolvedObj.marginTopDots).toBe(8);
    expect(resolvedObj.marginBottomDots).toBe(16);
    expect(resolvedObj.marginLeftDots).toBe(24);
    expect(resolvedObj.marginRightDots).toBe(32);
  });
});
