#!/usr/bin/env node
/**
 * Shipping label example — text lines (with receipt helpers), a Code 128
 * tracking barcode and a QR URL, compiled to both TSC and ZPL.
 */
import { label, tsc, zpl, formatPair, separator } from "../dist/index.mjs";

const tracking = "1Z999AA10123456784";
const url = "https://track.example.com/t/1Z999AA10123456784";

const shipLabel = label({ width: 60, height: 40, printer: "zebra-zd420" })
  .text("ACME SHIPPING", { x: 50, y: 40, font: "0", size: 2 })
  .box({ x: 30, y: 30, width: 1100, height: 700, thickness: 3 })
  .text(separator("=", 40), { x: 50, y: 110 })
  .text(formatPair("From", "ACME Corp, 1 Main St", 38), { x: 50, y: 150 })
  .text(formatPair("To", "Jane Doe, 200 Oak Ave", 38), { x: 50, y: 185 })
  .text(formatPair("Weight", "2.4 kg", 38), { x: 50, y: 220 })
  .text("Track:", { x: 50, y: 330 })
  .barcode(tracking, { x: 50, y: 360, height: 100, moduleWidth: 2 })
  .text("Scan for delivery status:", { x: 50, y: 520 })
  .qrcode(url, { x: 50, y: 550, cellSize: 5, ecc: "M" });

const tscCode = tsc.compile(shipLabel);
const zplCode = zpl.compile(shipLabel);

console.log("=== TSC ===");
console.log(tscCode);
console.log("=== ZPL ===");
console.log(zplCode);

