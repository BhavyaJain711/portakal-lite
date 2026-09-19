import { describe, expect, it } from "vitest";
import {
  formatPair,
  formatRow,
  formatTable,
  formatTSCBytes,
  label,
  separator,
  tsc,
  wordWrap,
} from "../src/index.js";

describe("formatPair", () => {
  it("formats left+right on same line", () => {
    const result = formatPair("Hamburger", "$12.99", 32);
    expect(result.length).toBe(32);
    expect(result.startsWith("Hamburger")).toBe(true);
    expect(result.endsWith("$12.99")).toBe(true);
  });

  it("pads with spaces between left and right", () => {
    const result = formatPair("A", "B", 10);
    expect(result).toBe("A        B");
  });

  it("handles exact fit", () => {
    const result = formatPair("Left", "Right", 9);
    expect(result).toBe("LeftRight");
  });

  it("truncates when right side is too long", () => {
    const result = formatPair("A", "Very Long Right", 10);
    expect(result.length).toBe(10);
  });
});

describe("formatRow", () => {
  it("formats multi-column row", () => {
    const cols = [
      { width: 20, align: "left" as const },
      { width: 5, align: "center" as const },
      { width: 7, align: "right" as const },
    ];
    const result = formatRow(cols, ["Hamburger", "x2", "$25.98"], 32);
    expect(result.length).toBe(32);
    expect(result.startsWith("Hamburger")).toBe(true);
    expect(result).toContain("$25.98");
  });

  it("right-aligns column content", () => {
    const cols = [{ width: 10, align: "right" as const }];
    const result = formatRow(cols, ["Hi"], 10);
    expect(result).toBe("        Hi");
  });

  it("center-aligns column content", () => {
    const cols = [{ width: 10, align: "center" as const }];
    const result = formatRow(cols, ["Hi"], 10);
    expect(result).toBe("    Hi    ");
  });

  it("truncates long content to column width", () => {
    const cols = [{ width: 5, align: "left" as const }];
    const result = formatRow(cols, ["VeryLongText"], 5);
    expect(result).toBe("VeryL");
  });

  it("handles empty values", () => {
    const cols = [
      { width: 5, align: "left" as const },
      { width: 5, align: "left" as const },
    ];
    const result = formatRow(cols, ["A"], 10);
    expect(result.length).toBe(10);
  });
});

describe("formatTable", () => {
  it("formats multiple rows", () => {
    const cols = [
      { width: 20, align: "left" as const },
      { width: 5, align: "center" as const },
      { width: 7, align: "right" as const },
    ];
    const rows = [
      ["Item", "Qty", "Price"],
      ["Hamburger", "2", "$25.98"],
      ["Cola", "1", "$3.50"],
    ];
    const result = formatTable(cols, rows, 32);
    expect(result).toHaveLength(3);
    for (const line of result) {
      expect(line.length).toBe(32);
    }
  });
});

describe("separator", () => {
  it("creates line of repeated characters", () => {
    expect(separator("=", 32)).toBe("================================");
    expect(separator("-", 10)).toBe("----------");
  });

  it("handles single char", () => {
    expect(separator("*", 1)).toBe("*");
  });
});

describe("wordWrap", () => {
  it("returns single line if text fits", () => {
    expect(wordWrap("Hello World", 32)).toEqual(["Hello World"]);
  });

  it("wraps at word boundary", () => {
    const result = wordWrap("The quick brown fox jumps over the lazy dog", 20);
    expect(result.length).toBeGreaterThan(1);
    for (const line of result) {
      expect(line.length).toBeLessThanOrEqual(20);
    }
  });

  it("preserves all words", () => {
    const text = "Hello beautiful world";
    const result = wordWrap(text, 10);
    const joined = result.join(" ");
    expect(joined).toBe(text);
  });

  it("handles single long word", () => {
    const result = wordWrap("Superlongword", 5);
    expect(result).toEqual(["Superlongword"]); // can't break within word
  });

  it("handles empty string", () => {
    expect(wordWrap("", 10)).toEqual([""]);
  });
});

describe("receipt integration", () => {
  it("builds a complete receipt layout", () => {
    const w = 32; // 58mm printer, font A
    const lines: string[] = [];

    lines.push(separator("=", w));
    lines.push(formatPair("Hamburger x2", "$25.98", w));
    lines.push(formatPair("Cola x1", "$3.50", w));
    lines.push(separator("-", w));
    lines.push(formatPair("TOTAL", "$29.48", w));
    lines.push(separator("=", w));

    expect(lines).toHaveLength(6);
    for (const line of lines) {
      expect(line.length).toBe(w);
    }
    expect(lines[1]).toContain("Hamburger");
    expect(lines[1]).toContain("$25.98");
    expect(lines[4]).toContain("TOTAL");
    expect(lines[4]).toContain("$29.48");
  });

  it("feeds aligned lines into TSC text", () => {
    const code = formatTSCBytes(
      tsc.compile(
        label({ width: 40, height: 30 }).text(formatPair("Item", "$25.98", 32), {
          x: 10,
          y: 10,
        }),
      ),
    );
    // formatPair("Item", "$25.98", 32): "Item" padded to 26 with 22 spaces
    const expected = 'TEXT 10,10,"2",0,1,1,"Item' + " ".repeat(22) + '$25.98"';
    expect(code).toContain(expected);
  });
});
