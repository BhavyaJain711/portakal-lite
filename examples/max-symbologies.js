#!/usr/bin/env node
/**
 * Maximum symbology example — shows the full range of what portakal-lite can
 * print via etiket. Code 128 and QR use printer-native commands; everything
 * else is rasterized into TSC BITMAP / ZPL ^GFA graphics (real, scannable).
 */
import { label, tsc, zpl } from "../dist/index.js";

// Printer-native: Code 128 + QR
const native = label({ width: 40, height: 30 })
  .barcode("123456789", { x: 10, y: 10 })                       // code128 native
  .qrcode("https://example.com", { x: 250, y: 10, cellSize: 6 }); // qr native

console.log("=== NATIVE (code128 + qr) ===");
console.log("--- TSC ---");
console.log(tsc.compile(native));
console.log("--- ZPL ---");
console.log(zpl.compile(native));

// Rasterized via etiket: EAN-13, UPC-A, Code 39, ITF, DataMatrix, PDF417, Aztec
const raster = label({ width: 40, height: 30 })
  .barcode("4006381333931", { x: 10, y: 10, symbology: "ean13" })
  .barcode("012345678905", { x: 10, y: 110, symbology: "upca" })
  .barcode("HELLO-39", { x: 10, y: 210, symbology: "code39" })
  .barcode("1234567890", { x: 10, y: 310, symbology: "itf" })
  .datamatrix("DATAMATRIX", { x: 10, y: 410, cellSize: 4 })
  .pdf417("PDF417 PAYLOAD", { x: 160, y: 410, cellSize: 3 })
  .aztec("AZTEC", { x: 360, y: 410, cellSize: 4 });

console.log("\n=== RASTERIZED (ean13, upca, code39, itf, datamatrix, pdf417, aztec) ===");
console.log("--- TSC ---");
console.log(tsc.compile(raster));
console.log("--- ZPL ---");
console.log(zpl.compile(raster));
