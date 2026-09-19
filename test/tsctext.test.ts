import { describe, expect, it } from "vitest";
import { formatTSCBytes, label, tsc } from "../src/index.js";

const bitmap = (data: number[], width: number, height: number) => ({
  data: Uint8Array.from(data),
  width,
  height,
  bytesPerRow: Math.ceil(width / 8),
});

describe("formatTSCBytes", () => {
  it("returns the command text verbatim for a label without a bitmap", () => {
    const bytes = tsc.compile(label({ width: 40, height: 30 }).text("Hello", { x: 10, y: 10 }));
    const text = formatTSCBytes(bytes);

    expect(text).toContain('TEXT 10,10,"2",0,1,1,"Hello"');
    expect(text).toContain("CLS");
    expect(text).toContain("PRINT 1");
    expect(text).not.toContain("\uFFFD");
    // Nothing was escaped or elided: the text is the whole stream.
    expect(text).toBe(new TextDecoder().decode(bytes));
  });

  it("elides a BITMAP payload instead of dumping raw bytes", () => {
    // 16×16 → 2 bytes per row × 16 = 32 bytes of packed pixels.
    const bmp = bitmap(new Array(32).fill(0b10101010), 16, 16);
    const text = formatTSCBytes(
      tsc.compile(label({ width: 40, height: 30 }).image(bmp, { x: 10, y: 10 })),
    );

    expect(text).toContain("BITMAP 10,10,2,16,0,<32 bytes of bitmap data>");
    expect(text).toContain("PRINT 1");
    expect(text).not.toContain("\uFFFD");
  });

  it("escapes stray non-printable bytes as \\xHH", () => {
    expect(formatTSCBytes(Uint8Array.from([0x41, 0x00, 0x42]))).toBe("A\\x00B");
  });

  it("collapses a long binary run that is not a BITMAP payload", () => {
    const bytes = Uint8Array.from([0x41, ...new Array(40).fill(0x00), 0x42]);
    expect(formatTSCBytes(bytes)).toBe("A<40 bytes of binary data>B");
  });

  it("does not mistake 'BITMAP' inside TEXT content for a command", () => {
    const line = 'TEXT 0,0,"2",0,1,1,"BITMAP 1,2,3,4,5,"\n';
    expect(formatTSCBytes(new TextEncoder().encode(line))).toBe(line);
  });
});
