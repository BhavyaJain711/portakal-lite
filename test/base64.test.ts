import { describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64, chunkBytes } from "../src/index.js";

describe("bytesToBase64 / base64ToBytes", () => {
  it("round-trips arbitrary binary, including bytes >= 0x80", () => {
    const bytes = Uint8Array.from([0x00, 0x01, 0x7f, 0x80, 0xfe, 0xff, 0x0a, 0xc3, 0x28, 0x00]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it("round-trips every length modulo 3 (padding cases)", () => {
    for (let n = 0; n < 8; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 200) & 0xff);
      expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    }
  });

  it("matches the platform encoder", () => {
    const bytes = Uint8Array.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0xff]);
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
  });

  it("decodes a data: URL and ignores whitespace", () => {
    const bytes = Uint8Array.from([1, 2, 3, 4, 5]);
    const b64 = bytesToBase64(bytes);

    expect(base64ToBytes(`data:application/octet-stream;base64,${b64}`)).toEqual(bytes);
    expect(base64ToBytes(`${b64.slice(0, 4)}\n  ${b64.slice(4)}`)).toEqual(bytes);
  });

  it("handles empty input", () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe("");
    expect(base64ToBytes("")).toEqual(new Uint8Array(0));
  });
});

describe("chunkBytes", () => {
  it("splits on exact and partial boundaries", () => {
    const bytes = Uint8Array.from({ length: 10 }, (_, i) => i);

    expect(chunkBytes(bytes, 5).map((c) => c.length)).toEqual([5, 5]);
    expect(chunkBytes(bytes, 4).map((c) => c.length)).toEqual([4, 4, 2]);
    expect(chunkBytes(bytes, 10).map((c) => c.length)).toEqual([10]);
    expect(chunkBytes(bytes, 100).map((c) => c.length)).toEqual([10]);
  });

  it("preserves byte order across chunks", () => {
    const bytes = Uint8Array.from([0xff, 0x00, 0x80, 0x7f, 0x10]);
    const flat = chunkBytes(bytes, 2).flatMap((c) => Array.from(c));

    expect(flat).toEqual(Array.from(bytes));
  });

  it("rejects a non-positive or fractional size", () => {
    expect(() => chunkBytes(new Uint8Array(4), 0)).toThrow(RangeError);
    expect(() => chunkBytes(new Uint8Array(4), -1)).toThrow(RangeError);
    expect(() => chunkBytes(new Uint8Array(4), 1.5)).toThrow(RangeError);
  });
});
