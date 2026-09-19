#!/usr/bin/env node
/**
 * Image example — turn raw grayscale pixels into a 1-bit bitmap and embed it in
 * a label. `toMonochromeBitmap` does the threshold/dithering step, so you can
 * feed it a decoded photo (or, as here, a generated test pattern).
 */
import { label, tsc, zpl, toMonochromeBitmap, formatTSCBytes } from "../dist/index.mjs";

// 16×16 diagonal gradient, 1 byte (grayscale) per pixel.
const SIZE = 16;
const pixels = new Uint8Array(SIZE * SIZE);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    pixels[y * SIZE + x] = Math.round(((x + y) / (2 * SIZE - 2)) * 255);
  }
}

// dither: "threshold" | "floyd-steinberg" | "atkinson" | "ordered"
const bitmap = toMonochromeBitmap(pixels, SIZE, SIZE, { dither: "floyd-steinberg" });

const myLabel = label({ width: 40, height: 30, unit: "mm" })
  .text("DITHERED IMAGE", { x: 20, y: 10, font: "0", size: 2 })
  .image(bitmap, { x: 20, y: 60 });

const bytes = tsc.compile(myLabel);
console.log("=== TSC (the bytes to send) ===");
console.log(`${bytes.length} bytes — ${bitmap.bytesPerRow * bitmap.height} of them raw bitmap pixels`);
console.log("=== TSC (display form) ===");
console.log(formatTSCBytes(bytes));
console.log("=== ZPL ===");
console.log(zpl.compile(myLabel));
