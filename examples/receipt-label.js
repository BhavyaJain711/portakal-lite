#!/usr/bin/env node
/**
 * Receipt-style label example — separator + formatTable items + total, with a
 * Code 128 order barcode, compiled to both TSC and ZPL.
 */
import { label, tsc, zpl, formatTable, formatPair, separator } from "../dist/index.mjs";

const orderId = "ORD-482913";

const items = [
  ["Item", "Qty", "Price"],
  ["Hamburger", "2", "$25.98"],
  ["Cola", "1", "$3.50"],
  ["Fries", "1", "$4.20"],
];

const table = formatTable(
  [
    { width: 18, align: "left" },
    { width: 6, align: "center" },
    { width: 12, align: "right" },
  ],
  items,
  36,
);

const receipt = label({ width: 40, height: 30 })
  .text("MY STORE", { x: 10, y: 10, font: "3", size: 2 })
  .text(separator("=", 36), { x: 10, y: 60 })
  .text(table[0], { x: 10, y: 90 })
  .text(table[1], { x: 10, y: 115 })
  .text(table[2], { x: 10, y: 140 })
  .text(table[3], { x: 10, y: 165 })
  .text(separator("-", 36), { x: 10, y: 190 })
  .text(formatPair("TOTAL", "$33.68", 36), { x: 10, y: 215, font: "3", size: 2 })
  .text("Order " + orderId, { x: 10, y: 270 })
  .barcode(orderId, { x: 10, y: 300, height: 60, moduleWidth: 2 });

console.log("=== TSC (TSPL2) ===");
console.log(tsc.compile(receipt));
console.log("\n=== ZPL II ===");
console.log(zpl.compile(receipt));
