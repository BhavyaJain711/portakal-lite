/**
 * Rasterization helpers — turn etiket's raw encodings into a 1-bit
 * MonochromeBitmap that compilers emit as TSC BITMAP / ZPL ^GFA graphics.
 *
 * etiket raw encoders return:
 *  - 1D:  `bars: number[]` — alternating bar/space widths in modules
 *  - 2D:  `matrix: boolean[][]` — module grid
 *  - postal: height-modulated bars (POSTNET/PLANET/RM4SCC/...)
 *
 * All content is rendered as pixels, so it is inherently injection-safe.
 */

import type { BarcodeOptions, LabelElement, MonochromeBitmap } from "./types.js";
import { InvalidConfigError } from "./errors.js";
import { encodeBars } from "etiket/barcode";
import { encodeQR } from "etiket/qr";
import { encodeDataMatrix } from "etiket/datamatrix";
import { encodePDF417 } from "etiket/pdf417";
import { encodeAztec } from "etiket/aztec";

/** Hard cap on rasterized dimensions (protects ZPL ^GFA 16-bit fields). */
export const MAX_RASTER_DOTS = 65535;
/** Total raster bytes cap (DoS guard against huge matrices). */
export const MAX_RASTER_BYTES = 2_000_000;

export interface RasterizeOptions {
  /** Module width in dots (1D narrow bar, 2D cell). Default 2 (1D) / 6 (2D). */
  moduleWidth?: number;
  /** Bar height in dots (1D only). Default 80. */
  height?: number;
  /** Rotation in degrees (0|90|180|270). Default 0. */
  rotation?: number;
}

/**
 * Rasterize a 1D bar pattern (`bars` = alternating bar/space module widths,
 * starting with a bar) into a monochrome bitmap.
 */
export function rasterizeBars(bars: number[], opts: RasterizeOptions = {}): MonochromeBitmap {
  const moduleWidth = opts.moduleWidth ?? 2;
  const height = opts.height ?? 80;
  const rotation = opts.rotation ?? 0;

  if (!Number.isInteger(moduleWidth) || moduleWidth < 1 || moduleWidth > 10) {
    throw new InvalidConfigError("moduleWidth must be an integer between 1 and 10");
  }
  if (!Number.isInteger(height) || height < 1 || height > MAX_RASTER_DOTS) {
    throw new InvalidConfigError(`height must be an integer between 1 and ${MAX_RASTER_DOTS}`);
  }
  if (![0, 90, 180, 270].includes(rotation)) {
    throw new InvalidConfigError("rotation must be one of 0, 90, 180, 270");
  }

  let totalModules = 0;
  for (const w of bars) {
    if (!Number.isInteger(w) || w < 1) {
      throw new InvalidConfigError(`invalid bar width ${String(w)}`);
    }
    totalModules += w;
  }
  const width = totalModules * moduleWidth;

  // Fill the bitmap: bars (even indices) are black, spaces (odd) are white.
  const raw = packRaster(width, height, (x) => {
    let acc = 0;
    let i = 0;
    while (i < bars.length && acc <= x / moduleWidth) {
      const span = bars[i]!;
      if (acc <= x / moduleWidth && x / moduleWidth < acc + span) {
        return i % 2 === 0;
      }
      acc += span;
      i++;
    }
    return false;
  });

  return applyRotation(raw, rotation);
}

/**
 * Rasterize a 2D module matrix into a monochrome bitmap.
 * Each cell becomes `cellSize`×`cellSize` dots.
 */
export function rasterizeMatrix(matrix: boolean[][], opts: RasterizeOptions = {}): MonochromeBitmap {
  const cellSize = opts.moduleWidth ?? 6;
  const rotation = opts.rotation ?? 0;

  if (!Number.isInteger(cellSize) || cellSize < 1 || cellSize > 32) {
    throw new InvalidConfigError("cellSize must be an integer between 1 and 32");
  }
  if (![0, 90, 180, 270].includes(rotation)) {
    throw new InvalidConfigError("rotation must be one of 0, 90, 180, 270");
  }

  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  if (rows === 0 || cols === 0) {
    throw new InvalidConfigError("empty matrix");
  }
  const width = cols * cellSize;
  const height = rows * cellSize;

  const raw = packRaster(width, height, (x, y) => {
    const cx = Math.floor(x / cellSize);
    const cy = Math.floor(y / cellSize);
    return matrix[cy]?.[cx] === true;
  });

  return applyRotation(raw, rotation);
}

/** Pack a black/white raster (given by a predicate) into a MonochromeBitmap. */
function packRaster(
  width: number,
  height: number,
  isBlack: (x: number, y: number) => boolean,
): MonochromeBitmap {
  if (width < 1 || height < 1 || width > MAX_RASTER_DOTS || height > MAX_RASTER_DOTS) {
    throw new InvalidConfigError("raster dimensions out of range");
  }
  const bytesPerRow = Math.ceil(width / 8);
  const totalBytes = bytesPerRow * height;
  if (totalBytes > MAX_RASTER_BYTES) {
    throw new InvalidConfigError(`raster too large (${totalBytes} bytes > ${MAX_RASTER_BYTES})`);
  }
  const data = new Uint8Array(totalBytes);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isBlack(x, y)) {
        const byteIdx = y * bytesPerRow + (x >> 3);
        data[byteIdx]! |= 0x80 >> (x & 7);
      }
    }
  }
  return { data, width, height, bytesPerRow };
}

/** Rotate a bitmap 90/180/270 degrees clockwise (0 = identity). */
function applyRotation(bmp: MonochromeBitmap, rotation: number): MonochromeBitmap {
  if (rotation === 0) return bmp;
  const { width, height, data } = bmp;
  const isBlack = (x: number, y: number) =>
    (data[y * bmp.bytesPerRow + (x >> 3)]! & (0x80 >> (x & 7))) !== 0;

  if (rotation === 90) {
    // dest(x,y) = src(y, width-1-x)
    return packRaster(height, width, (x, y) => isBlack(y, width - 1 - x));
  }
  if (rotation === 180) {
    return packRaster(width, height, (x, y) => isBlack(width - 1 - x, height - 1 - y));
  }
  // 270 = 90 CCW: dest(x,y) = src(height-1-y, x)
  return packRaster(height, width, (x, y) => isBlack(height - 1 - y, x));
}

/**
 * Rasterize a barcode/QR/matrix element into a MonochromeBitmap using etiket's
 * raw encoders. Throws InvalidConfigError on empty/invalid encodings.
 */
export function rasterizeElement(el: LabelElement): MonochromeBitmap {
  if (el.type === "barcode") {
    const { symbology, content, options } = el;
    const { encodeOpts, moduleWidth, height, rotation } = extractBarcodeOpts(options);
    const bars = encodeBars(content, { type: symbology as never, ...encodeOpts });
    return rasterizeBars(bars, { moduleWidth, height, rotation });
  }

  if (el.type === "qrcode") {
    const { content, options } = el;
    const cellSize = options.cellSize ?? 6;
    const rotation = options.rotation ?? 0;
    const matrix = encodeQR(content, {
      ecLevel: options.ecc ?? "M",
      version: options.version,
      mode: options.mode as never,
      mask: options.mask,
      eci: options.eci,
      gs1: options.gs1,
    });
    return rasterizeMatrix(matrix, { moduleWidth: cellSize, rotation });
  }

  // matrix element (narrowed: barcode and qrcode handled above)
  if (el.type !== "matrix") {
    throw new InvalidConfigError(`cannot rasterize element type ${el.type}`);
  }
  const { symbology, content, options } = el;
  const cellSize = (options.cellSize ?? 6) as number;
  const rotation = (options.rotation ?? 0) as number;
  const matOpts = { moduleWidth: cellSize, rotation };

  switch (symbology) {
    case "datamatrix": {
      const matrix = encodeDataMatrix(content, options.datamatrix as never);
      return rasterizeMatrix(matrix, matOpts);
    }
    case "pdf417": {
      const { matrix } = encodePDF417(content, options.pdf417 as never);
      return rasterizeMatrix(matrix, matOpts);
    }
    case "aztec": {
      const matrix = encodeAztec(content, options.aztec as never);
      return rasterizeMatrix(matrix, matOpts);
    }
    default:
      throw new InvalidConfigError(`unsupported matrix symbology: ${String(symbology)}`);
  }
}

interface BarcodeOpts {
  encodeOpts: Record<string, unknown>;
  moduleWidth?: number;
  height?: number;
  rotation?: number;
}

function extractBarcodeOpts(options: BarcodeOptions): BarcodeOpts {
  const {
    x: _x,
    y: _y,
    height,
    moduleWidth,
    ratio: _ratio,
    rotation,
    readable: _readable,
    fontSize: _fontSize,
    ...encodeOpts
  } = options;
  void _x;
  void _y;
  void _ratio;
  void _readable;
  void _fontSize;
  return { encodeOpts, moduleWidth: moduleWidth as number | undefined, height: height as number | undefined, rotation: rotation as number | undefined };
}

/** Convert a Uint8Array to a TSC BITMAP data payload (comma-separated bytes). */
export function bytesToTSC(data: Uint8Array): string {
  let out = "";
  for (let i = 0; i < data.length; i++) {
    if (i > 0) out += ",";
    out += String(data[i]);
  }
  return out;
}

/** Convert a Uint8Array to uppercase hex (ZPL ^GFA payload). */
export function bytesToHex(data: Uint8Array): string {
  let out = "";
  for (let i = 0; i < data.length; i++) {
    out += data[i]!.toString(16).padStart(2, "0").toUpperCase();
  }
  return out;
}

/**
 * Render a `MonochromeBitmap` as one SVG path in bitmap dot coordinates.
 *
 * One `<path>` with a subpath per black run replaces thousands of `<rect>`
 * nodes — the preview stays cheap to parse and cannot lock up react-native-svg.
 * Bitmaps larger than `maxDimension` are reduced using area coverage (a display
 * dot is black when at least half the source pixels it covers are black), which
 * keeps grey impression and thin features; the printed bitmap is unaffected.
 *
 * The default ceiling is deliberately above any realistic preview display
 * (roughly 1000 device pixels), so an image the size of a label cell is drawn
 * without reduction. Callers that draw into a small box should pass their own
 * `maxDimension` rather than rely on a bigger bitmap giving a better preview.
 */
export function monochromeToSvgPath(
  bmp: MonochromeBitmap,
  options: { maxDimension?: number } = {},
): string {
  const maxDimension = Math.max(1, options.maxDimension ?? 1000);
  const factor = Math.max(1, Math.ceil(Math.max(bmp.width, bmp.height) / maxDimension));
  const outW = Math.ceil(bmp.width / factor);
  const outH = Math.ceil(bmp.height / factor);

  const isBlack = (x: number, y: number): boolean =>
    ((bmp.data[y * bmp.bytesPerRow + (x >> 3)]! >> (7 - (x & 7))) & 1) === 1;

  const isCovered = (ox: number, oy: number): boolean => {
    const x0 = ox * factor;
    const y0 = oy * factor;
    const x1 = Math.min(bmp.width, x0 + factor);
    const y1 = Math.min(bmp.height, y0 + factor);
    let black = 0;
    let total = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        total++;
        if (isBlack(x, y)) black++;
      }
    }
    return total > 0 && black * 2 >= total;
  };

  let path = "";
  for (let oy = 0; oy < outH; oy++) {
    let ox = 0;
    while (ox < outW) {
      if (!isCovered(ox, oy)) {
        ox++;
        continue;
      }
      let run = 0;
      while (ox + run < outW && isCovered(ox + run, oy)) run++;
      path += `M${ox * factor} ${oy * factor}h${run * factor}v${factor}H${ox * factor}z`;
      ox += run;
    }
  }
  return path;
}
