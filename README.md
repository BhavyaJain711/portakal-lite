# portakal-lite

A standalone, security-hardened label compiler for **TSC/TSPL2** and **ZPL II** printers, extracted from [portakal](https://github.com/productdevbook/portakal).
Integrates [etiket](https://github.com/productdevbook/etiket) package for seamless barcode and qrcode generation for preview svg image.

- Fluent `label()` builder — text, boxes, lines, circles, ellipses, reverse/erase regions, images, raw commands
- `.barcode()` / `.qrcode()` — 40+ symbologies via [etiket](https://github.com/productdevbook/etiket)
- `tsc.compile()` / `zpl.compile()` → **printer-ready string** (no transport, no connection — you send it)
- `tsc.preview()` / `zpl.preview()` → SVG rendering with per-language font metrics
- Receipt layout helpers: `formatPair`, `formatRow`, `formatTable`, `separator`, `wordWrap`
- One runtime dependency (`etiket`, itself zero-dep), pure ESM, works in Node, browsers, Deno, Bun
- Command-injection hardened (see [Security](#security))

## Install

```sh
npm install portakal-lite
```

## Quick start

```ts
import { label, tsc, zpl } from "portakal-lite";

const myLabel = label({ width: 40, height: 30 }) // mm
  .text("ACME Corp", { x: 10, y: 10, font: "2", size: 2 })
  .box({ x: 5, y: 5, width: 300, height: 200, thickness: 2 })
  .line({ x1: 5, y1: 55, x2: 310, y2: 55 });

const tscCode = tsc.compile(myLabel); // TSC/TSPL2 commands
const zplCode = zpl.compile(myLabel); // ZPL II commands
const svg = zpl.preview(myLabel);     // SVG preview
```

### Fonts

`.text()` accepts any TSC font id via `font`:

- `"0"` — the scalable TrueType font. `size`/`xScale` are point sizes (or
  multipliers of `fontBase` per `font0Mode`), with independent X/Y.
- `"1"`–`"8"` — fixed-pitch dot fonts (`TSC_DOT_FONTS`): `size`/`xScale` are
  integer multipliers 1–10 of the base dot size (8×12, 12×20, 16×24, 24×32,
  32×48, 14×19 OCR-B, 21×27 OCR-B, 14×25 OCR-A).

```ts
label({ width: 40, height: 30 }).text("CUT: 9.00 m", { x: 10, y: 10, font: "3", size: 3, xScale: 2 });
// → TEXT 10,10,"3",0,2,3,"CUT: 9.00 m"
```

## Barcodes & QR codes

```ts
import { label, tsc, zpl } from "portakal-lite";

const myLabel = label({ width: 40, height: 30 })
  .barcode("123456789", { x: 10, y: 10 })                       // Code 128 (native)
  .qrcode("https://example.com", { x: 250, y: 10, cellSize: 6 }) // QR (native)
  .barcode("4006381333931", { x: 10, y: 100, symbology: "ean13" }) // EAN-13 (raster)
  .datamatrix("DM-DATA", { x: 250, y: 100, cellSize: 4 });         // Data Matrix (raster)

const tscCode = tsc.compile(myLabel);
const zplCode = zpl.compile(myLabel);
```

**Two rendering paths:**
- **Native printer commands** for `code128` and `qr` (TSC `BARCODE`/`QRCODE`, ZPL `^BC`/`^BQ`) — smallest output, uses the printer's built-in encoder.
- **Raster graphics** for every other symbology — encoded by etiket and embedded as TSC `BITMAP` / ZPL `^GFA`. Real, scannable, consistent across printers.

**Supported symbologies** (via etiket): `code128`, `qr`, `ean13`, `ean8`, `upca`, `upce`, `code39`, `code39ext`, `code93`, `code93ext`, `itf`, `itf14`, `codabar`, `msi`, `pharmacode`, `code11`, `gs1-128`, `gs1-databar*`, `isbn`, `issn`, `ismn`, `code32`, `pzn`, postal (`postnet`, `planet`, `rm4scc`, `kix`, ...), and 2D via `.datamatrix()` / `.pdf417()` / `.aztec()` / `.qrcode()`.

Barcode options: `x`, `y`, `height`, `moduleWidth`, `ratio`, `rotation`, `readable`, `fontSize`, plus etiket encoding passthrough (`code128Charset`, `code39CheckDigit`, `msiCheckDigit`, `codabarStart/Stop`, ...).

QR options: `x`, `y`, `cellSize`, `ecc` (`L`/`M`/`Q`/`H`), `rotation`, `version`, `mode`, `mask`, `eci`, `gs1`.

### Send the compiled file to a printer

The package only produces the string — wire it to your printer however you like:

```ts
import { label, tsc } from "portakal-lite";
import net from "node:net";

const commands = tsc.compile(
  label({ width: 40, height: 30 }).text("Hello", { x: 10, y: 10 }),
);

// TCP label printers usually listen on port 9100
const socket = net.createConnection({ host: "192.168.1.100", port: 9100 });
socket.write(commands);
socket.end();

// ...or write to a file for a print spooler
// fs.writeFileSync("label.prn", commands);
```

TSC output uses LF (`\n`) line endings by default. If your printer firmware
requires CRLF, pass `lineEnding: "\r\n"` (either to `label()` or as the second
argument to `tsc.compile()`):

```ts
const commands = tsc.compile(
  label({ width: 40, height: 30, lineEnding: "\r\n" }).text("Hello", { x: 10, y: 10 }),
);
```

### Receipt-style aligned lines

```ts
import { label, tsc, formatPair, separator } from "portakal-lite";

const line = formatPair("SKU: PRD-00123", "$12.99", 32);
// "SKU: PRD-00123               $12.99"

const b = label({ width: 40, height: 30 })
  .text(separator("=", 32), { x: 10, y: 10 })
  .text(formatPair("Item", "$25.98", 32), { x: 10, y: 30 })
  .text(formatPair("TOTAL", "$29.48", 32), { x: 10, y: 50 });
```

## API

### `label(config)`

| Option | Default | Notes |
|---|---|---|
| `width` | required | Label width |
| `height` | — | Label height (omit for continuous/receipt) |
| `unit` | `"mm"` | `"mm"` \| `"inch"` \| `"dot"` |
| `dpi` | `203` | Printer DPI |
| `printer` | — | Profile: `tsc-te200`, `tsc-te310`, `zebra-zd420`, `zebra-zt410` |
| `gap` | `3` (mm) | Label gap |
| `speed` | `4` | 1–18 |
| `density` | `8` | 0–15 |
| `direction` | `0` | `0` \| `1` |
| `copies` | `1` | ≥ 1 |

### Elements

- `.text(content, { x, y, font, size, xScale, yScale, rotation, bold, reverse, align, maxWidth, lineSpacing })`
- `.barcode(content, { symbology, x, y, height, moduleWidth, ratio, rotation, readable, fontSize, ...etiket })`
- `.qrcode(content, { x, y, cellSize, ecc, rotation, version, mode, mask, ... })`
- `.datamatrix(content, opts)` / `.pdf417(content, opts)` / `.aztec(content, opts)`
- `.box({ x, y, width, height, thickness, radius })`
- `.line({ x1, y1, x2, y2, thickness })`
- `.circle({ x, y, diameter, thickness })`
- `.ellipse({ x, y, width, height, thickness })`
- `.reverse({ x, y, width, height })` / `.erase({ x, y, width, height })`
- `.image(monochromeBitmap, { x, y, width, height })`
- `.raw(string)` — verbatim passthrough (see Security)

`MonochromeBitmap` is a 1-bit packed `Uint8Array`: `{ data, width, height, bytesPerRow }` with `bytesPerRow === Math.ceil(width / 8)`.

## Examples

Runnable examples live in [`examples/`](./examples) — build the package first (`npm run build`), then run any:

```sh
node examples/basic-label.js         # text + box + Code 128 + QR, both languages
node examples/shipping-label.js   # shipping label with tracking barcode + QR
node examples/receipt-label.js    # receipt-style label with order barcode
node examples/max-symbologies.js  # native + rasterized (EAN-13, UPC-A, Code 39, ITF, DataMatrix, PDF417, Aztec)
```

## Security

The compilers are hardened against command injection — the most important thing to know before putting untrusted data (user input, database fields) into a label.

- **ZPL**: text is emitted with `^FH_` and Zebra hex-escapes. `^`, `~`, `_` and control characters become `_HH`, so content can never break out of `^FD` and inject commands. Example: `^FS^XA^FDINJECT^XZ` compiles to `_5EFS_5EXA_5EFDINJECT_5EXZ`. Non-Latin-1 text is encoded as UTF-8 bytes (printer set to `^CI28`). This applies to barcode/QR content too (native `^BC`/`^BQ`).
- **TSC**: text is sanitized — control characters stripped, `"` replaced with `'` — so it cannot break out of the quoted `TEXT`/`BLOCK`/`BARCODE`/`QRCODE` argument and inject `CLS`/`PRINT` lines.
- **Raster path is injection-safe by construction**: for non-native symbologies, the content becomes pixels (`BITMAP`/`^GFA`), never command text.
- **Content caps**: Code 128 ≤ 4096 chars, QR ≤ 708 bytes, and rasterized bitmaps capped (≤ 65535 dots/axis, ≤ 2 MB total) so hostile input can't balloon the output file (DoS).
- **Config validation**: non-finite numbers (`NaN`, `Infinity`), out-of-range `speed`/`density`/`copies`, label sizes above 65535 dots, invalid `rotation`/`ecc`/`symbology` all throw `InvalidConfigError` instead of emitting malformed commands.
- **Image validation**: bitmap shape (`bytesPerRow`, data length) is validated before generating `BITMAP`/`^GFA`.
- **SVG preview** escapes XML, so label text cannot inject markup/scripts into the preview.
- **`.raw()` is trusted input**: it passes strings through verbatim as printer commands. Never pass untrusted strings to `.raw()` — that is your escape hatch and your responsibility.
- No `eval`, no `fs`/`net`/`child_process` in the library. Runtime deps: only `etiket` (itself zero-dep, MIT).

## Differences from portakal

`portakal-lite` keeps the label builder, TSC/ZPL compilers, per-language preview, receipt helpers, and adds barcode/QR support backed by etiket. It drops the other 7 languages, parsers, `validate()`, cross-compiler, image dithering, encoding engine, and the transport layer. Behavior of the generated TSC/ZPL commands is identical to portakal's, plus the hardening above.

## License

MIT. Derived from [portakal](https://github.com/productdevbook/portakal) (MIT) — see [LICENSE](./LICENSE). Barcode/QR encoding via [etiket](https://github.com/productdevbook/etiket) (MIT).
