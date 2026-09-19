/**
 * Raster to 1-bit conversion — turn raw grayscale/RGB/RGBA pixels (e.g. from a
 * decoded photo) into the packed `MonochromeBitmap` that `.image()` emits as
 * TSC `BITMAP` / ZPL `^GFA`. Implements the `DitherAlgorithm` options declared
 * on `ImageOptions`.
 *
 * Output is packed 1-bit, row-major, MSB-first: bit set = a black dot.
 */

import type { DitherAlgorithm, MonochromeBitmap } from "./types.js";
import { InvalidConfigError } from "./errors.js";
import { MAX_RASTER_BYTES, MAX_RASTER_DOTS } from "./raster.js";

export interface MonochromeOptions {
  /** Dithering algorithm (default "threshold"). */
  dither?: DitherAlgorithm;
  /** Luminance cutoff 0–255 for "threshold" (default 128). */
  threshold?: number;
  /**
   * Stretch contrast so the image uses the full tonal range (default true).
   * Helps flat/washed-out logos; a near-flat image is left untouched so noise
   * isn't amplified.
   */
  levels?: boolean;
  /** Swap black and white (default false). */
  invert?: boolean;
}

/** Error-diffusion taps: [dx, dy, weight]. Floyd–Steinberg divides by 16. */
const FLOYD_STEINBERG: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 7],
  [-1, 1, 3],
  [0, 1, 5],
  [1, 1, 1],
];

/** Atkinson taps (1/8 each): a lighter pattern with more contrast loss. */
const ATKINSON: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1],
  [2, 0, 1],
  [-1, 1, 1],
  [0, 1, 1],
  [1, 1, 1],
  [0, 2, 1],
];

/** 4×4 Bayer matrix (ordered dithering), values 0–15. */
const BAYER_4X4: ReadonlyArray<ReadonlyArray<number>> = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/**
 * Convert packed pixel data to a 1-bit `MonochromeBitmap`.
 *
 * `pixels` is row-major with 1 (grayscale), 3 (RGB) or 4 (RGBA) bytes per
 * pixel — the channel count is inferred from its length. RGBA is composited
 * over white, so transparent areas print as unmarked paper.
 */
export function toMonochromeBitmap(
  pixels: Uint8Array,
  width: number,
  height: number,
  options: MonochromeOptions = {},
): MonochromeBitmap {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new InvalidConfigError("image width and height must be positive integers");
  }
  if (width > MAX_RASTER_DOTS || height > MAX_RASTER_DOTS) {
    throw new InvalidConfigError(`image dimensions must not exceed ${MAX_RASTER_DOTS} dots`);
  }
  const bytesPerRow = Math.ceil(width / 8);
  if (bytesPerRow * height > MAX_RASTER_BYTES) {
    throw new InvalidConfigError(`image raster too large (${bytesPerRow * height} bytes)`);
  }

  const pixelCount = width * height;
  const channels =
    pixels.length === pixelCount
      ? 1
      : pixels.length === pixelCount * 3
        ? 3
        : pixels.length === pixelCount * 4
          ? 4
          : 0;
  if (channels === 0) {
    throw new InvalidConfigError(
      `pixel buffer length ${pixels.length} does not match ${width}x${height} (1, 3 or 4 bytes per pixel)`,
    );
  }

  const threshold = options.threshold ?? 128;
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 255) {
    throw new InvalidConfigError("threshold must be an integer between 0 and 255");
  }
  const dither = options.dither ?? "threshold";
  const invert = options.invert ?? false;

  // Rec. 709 luminance, composited over white for RGBA.
  const lum = new Float32Array(pixelCount);
  for (let i = 0, p = 0; i < pixelCount; i++, p += channels) {
    if (channels === 1) {
      lum[i] = pixels[p]!;
    } else {
      const y = 0.2126 * pixels[p]! + 0.7152 * pixels[p + 1]! + 0.0722 * pixels[p + 2]!;
      lum[i] = channels === 4 ? y * (pixels[p + 3]! / 255) + 255 * (1 - pixels[p + 3]! / 255) : y;
    }
  }
  if (options.levels !== false) autoLevels(lum);

  const black = new Uint8Array(pixelCount);
  switch (dither) {
    case "threshold":
      for (let i = 0; i < pixelCount; i++) black[i] = lum[i]! < threshold ? 1 : 0;
      break;
    case "floyd-steinberg":
      diffuse(lum, width, height, black, threshold, FLOYD_STEINBERG, 16);
      break;
    case "atkinson":
      diffuse(lum, width, height, black, threshold, ATKINSON, 8);
      break;
    case "ordered":
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const cutoff = ((BAYER_4X4[y & 3]![x & 3]! + 0.5) / 16) * 255;
          black[y * width + x] = lum[y * width + x]! < cutoff ? 1 : 0;
        }
      }
      break;
    default:
      throw new InvalidConfigError(`unsupported dither algorithm: ${String(dither)}`);
  }

  const data = new Uint8Array(bytesPerRow * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isBlack = black[y * width + x]! === 1;
      if (invert ? !isBlack : isBlack) {
        data[y * bytesPerRow + (x >> 3)]! |= 0x80 >> (x & 7);
      }
    }
  }
  return { data, width, height, bytesPerRow };
}

/**
 * Stretch luminance so the darkest/lightest 0.5% of pixels map to 0/255.
 * A near-flat image (range < 8) is left as-is so noise isn't amplified.
 */
function autoLevels(lum: Float32Array): void {
  const hist = new Uint32Array(256);
  for (let i = 0; i < lum.length; i++) {
    hist[Math.max(0, Math.min(255, Math.round(lum[i]!)))]!++;
  }
  const cut = lum.length * 0.005;
  let lo = 0;
  let hi = 255;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v]!;
    if (acc > cut) {
      lo = v;
      break;
    }
  }
  acc = 0;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v]!;
    if (acc > cut) {
      hi = v;
      break;
    }
  }
  if (hi - lo < 8) return;
  const scale = 255 / (hi - lo);
  for (let i = 0; i < lum.length; i++) {
    lum[i] = Math.max(0, Math.min(255, (lum[i]! - lo) * scale));
  }
}

/** Error diffusion: quantize each pixel to 0/255 and push the error to neighbours. */
function diffuse(
  lum: Float32Array,
  width: number,
  height: number,
  black: Uint8Array,
  threshold: number,
  taps: ReadonlyArray<readonly [number, number, number]>,
  divisor: number,
): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const value = lum[i]!;
      const isBlack = value < threshold ? 1 : 0;
      black[i] = isBlack;
      const error = value - (isBlack ? 0 : 255);
      for (const [dx, dy, weight] of taps) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        lum[ni] = lum[ni]! + (error * weight) / divisor;
      }
    }
  }
}
