#!/usr/bin/env node
/**
 * Basic portakal-lite example — text, box, barcode and QR code,
 * compiled to both TSC and ZPL.
 */
import { label, tsc, zpl } from "../dist/index.mjs";

const myLabel = label({ width: 40, height: 30, unit: "mm", printer: "zebra-zd420" })
  .text("ACME Corp", { x: 50, y: 50, font: "0", size: 2 })
  .box({ x: 30, y: 30, width: 700, height: 520, thickness: 3 })
  .barcode("ACME-00123", { x: 50, y: 100, height: 80 })
  .qrcode("https://example.com", { x: 100, y: 220, cellSize: 4 });

const tscCode = tsc.compile(myLabel);
const zplCode = zpl.compile(myLabel);

console.log("=== TSC ===");
console.log(tscCode);
console.log("=== ZPL ===");
console.log(zplCode);
