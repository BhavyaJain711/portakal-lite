import { describe, expect, it } from "vitest";
import { label, tsc, zpl } from "../src/index.js";
import { InvalidConfigError } from "../src/index.js";

/** Decode Uint8Array to string for text-command assertions. */
const decode = (buf: Uint8Array): string => new TextDecoder().decode(buf);

describe("TSC native barcode/QR", () => {
  it("compiles code128 to TSC BARCODE", () => {
    const out = decode(tsc.compile(
      label({ width: 40, height: 30 }).barcode("123456789", { x: 10, y: 10 }),
    ));
    expect(out).toContain('BARCODE 10,10,"128",80,1,0,2,4,"123456789"');
  });

  it("compiles code128 with options", () => {
    const out = decode(tsc.compile(
      label({ width: 40, height: 30 }).barcode("123456789", {
        x: 10,
        y: 10,
        height: 60,
        moduleWidth: 3,
        ratio: 3,
        rotation: 90,
        readable: false,
      }),
    ));
    expect(out).toContain('BARCODE 10,10,"128",60,0,90,3,9,"123456789"');
  });

  it("compiles QR to TSC QRCODE", () => {
    const out = decode(tsc.compile(
      label({ width: 40, height: 30 }).qrcode("https://example.com", { x: 10, y: 10 }),
    ));
    expect(out).toContain('QRCODE 10,10,H,6,A,0,"https://example.com"');
  });

  it("compiles QR with ecc/rotation", () => {
    const out = decode(tsc.compile(
      label({ width: 40, height: 30 }).qrcode("HI", { x: 5, y: 5, ecc: "M", rotation: 90 }),
    ));
    expect(out).toContain('QRCODE 5,5,M,6,A,90,"HI"');
  });
});

describe("ZPL native barcode/QR", () => {
  it("compiles code128 to ZPL ^BC with ^FH_ escape", () => {
    const out = zpl.compile(
      label({ width: 40, height: 30 }).barcode("123456789", { x: 10, y: 10 }),
    );
    expect(out).toContain("^FO10,10^BY2,2,80^BCN,Y,N,2,^FH_^FD123456789^FS");
  });

  it("compiles code128 with options", () => {
    const out = zpl.compile(
      label({ width: 40, height: 30 }).barcode("123456789", {
        x: 10,
        y: 10,
        height: 60,
        moduleWidth: 3,
        rotation: 90,
        readable: false,
      }),
    );
    expect(out).toContain("^FO10,10^BY3,2,60^BCR,N,N,2,^FH_^FD123456789^FS");
  });

  it("compiles QR to ZPL ^BQ", () => {
    const out = zpl.compile(
      label({ width: 40, height: 30 }).qrcode("https://example.com", { x: 10, y: 10 }),
    );
    expect(out).toContain("^FO10,10^BQN,H,6,H^FH_^FDhttps://example.com^FS");
  });

  it("compiles QR with rotation", () => {
    const out = zpl.compile(
      label({ width: 40, height: 30 }).qrcode("HI", { x: 5, y: 5, rotation: 90 }),
    );
    expect(out).toContain("^FO5,5^BQR,H,6,H^FH_^FDHI^FS");
  });
});

describe("Raster path (etiket symbologies)", () => {
  it("rasterizes ean13 to TSC BITMAP", () => {
    const out = decode(tsc.compile(
      label({ width: 40, height: 30 }).barcode("4006381333931", { x: 10, y: 10, symbology: "ean13" }),
    ));
    expect(out).toMatch(/^BITMAP 10,10,\d+,\d+,0,/m);
  });

  it("rasterizes ean13 to ZPL ^GFA", () => {
    const out = zpl.compile(
      label({ width: 40, height: 30 }).barcode("4006381333931", { x: 10, y: 10, symbology: "ean13" }),
    );
    expect(out).toMatch(/^\^FO10,10\^GFA,\d+,\d+,\d+,[0-9A-F]+\^FS$/m);
  });

  it("rasterizes datamatrix to both languages", () => {
    const b = label({ width: 40, height: 30 }).datamatrix("HELLO", { x: 10, y: 10, cellSize: 4 });
    expect(decode(tsc.compile(b))).toMatch(/^BITMAP 10,10,\d+,\d+,0,/m);
    expect(zpl.compile(b)).toMatch(/^\^FO10,10\^GFA,\d+,\d+,\d+,[0-9A-F]+\^FS$/m);
  });

  it("rasterizes pdf417 to ZPL ^GFA", () => {
    const out = zpl.compile(
      label({ width: 40, height: 30 }).pdf417("PAYLOAD", { x: 10, y: 10, cellSize: 3 }),
    );
    expect(out).toMatch(/^\^FO10,10\^GFA,\d+,\d+,\d+,[0-9A-F]+\^FS$/m);
  });

  it("rasterizes aztec to TSC BITMAP", () => {
    const out = decode(tsc.compile(
      label({ width: 40, height: 30 }).aztec("HELLO", { x: 10, y: 10, cellSize: 4 }),
    ));
    expect(out).toMatch(/^BITMAP 10,10,\d+,\d+,0,/m);
  });

  it("raster output is deterministic", () => {
    const build = () =>
      tsc.compile(
        label({ width: 40, height: 30 }).barcode("4006381333931", { symbology: "ean13" }),
      );
    expect(build()).toEqual(build());
  });
});

describe("barcode/QR validation", () => {
  it("throws on invalid rotation", () => {
    expect(() =>
      label({ width: 40, height: 30 }).barcode("123", { rotation: 45 as never }).resolve(),
    ).toThrow(InvalidConfigError);
  });

  it("throws on invalid qrcode ecc", () => {
    expect(() =>
      label({ width: 40, height: 30 }).qrcode("x", { ecc: "Z" as never }).resolve(),
    ).toThrow(InvalidConfigError);
  });

  it("throws when QR content exceeds 708 bytes", () => {
    const big = "a".repeat(709);
    expect(() => label({ width: 40, height: 30 }).qrcode(big).resolve()).toThrow(
      InvalidConfigError,
    );
  });

  it("throws when barcode content exceeds 4096 chars", () => {
    const big = "a".repeat(4097);
    expect(() => label({ width: 40, height: 30 }).barcode(big).resolve()).toThrow(
      InvalidConfigError,
    );
  });

  it("throws on invalid symbology at compile time", () => {
    const b = label({ width: 40, height: 30 }).barcode("123", { symbology: "not-a-symbology" });
    expect(() => tsc.compile(b)).toThrow();
    expect(() => zpl.compile(b)).toThrow();
  });
});

describe("preview rendering", () => {
  it("renders real barcode pixels (not a fake pattern) with data text", () => {
    const svg = tsc.preview(
      label({ width: 40, height: 30 }).barcode("123456789", { x: 10, y: 10 }),
    );
    // Real etiket-encoded bars → many 1px black rects, no fake <pattern>
    expect(svg).toContain('fill="#000"');
    expect(svg).not.toContain("<pattern");
    expect(svg).toContain("123456789");
  });

  it("renders real QR pixels with finder-squares-like dark density and data text", () => {
    const svg = zpl.preview(
      label({ width: 40, height: 30 }).qrcode("https://example.com", { x: 10, y: 10, showText: true }),
    );
    expect(svg).toContain('fill="#000"');
    expect(svg).not.toContain("<pattern");
    expect(svg).toContain("https://example.com");
  });

  it("escapes XML in barcode preview data text", () => {
    const svg = tsc.preview(
      label({ width: 40, height: 30 }).barcode('<script>alert(1)</script>', { x: 10, y: 10 }),
    );
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).not.toContain("<script>");
  });

  it("renders matrix preview as real pixels", () => {
    const svg = tsc.preview(label({ width: 40, height: 30 }).datamatrix("HI", { x: 10, y: 10 }));
    expect(svg).toContain('fill="#000"');
    expect(svg).not.toContain("<pattern");
  });
});
