import type { Unit } from "./types.js";
import { InvalidConfigError } from "./errors.js";

/**
 * Convert a measurement to dots based on unit and DPI.
 * Throws InvalidConfigError for non-finite values so malformed
 * commands like "SIZE NaN mm" are never generated.
 */
export function toDots(value: number, unit: Unit, dpi: number): number {
  if (!Number.isFinite(value)) {
    throw new InvalidConfigError(`Invalid measurement: ${String(value)} (must be a finite number)`);
  }
  switch (unit) {
    case "dot":
      return Math.round(value);
    case "mm":
      return Math.round(value * (dpi / 25.4));
    case "inch":
      return Math.round(value * dpi);
  }
}

/**
 * Default TSPL font "0" base size in dots at a given DPI.
 * 203 DPI → 12×24 dots (~1.5×3 mm); 300 DPI → 18×36 dots.
 */
export function defaultFontBase(dpi: number): { width: number; height: number } {
  const scale = dpi >= 300 ? 1.5 : 1;
  return { width: Math.round(12 * scale), height: Math.round(24 * scale) };
}
