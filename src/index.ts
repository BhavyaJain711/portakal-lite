/**
 * portakal-lite — standalone TSC/TSPL2 + ZPL II label compiler.
 * Fluent label builder, compile + SVG preview, receipt layout helpers.
 * Zero dependencies, no transport layer.
 *
 * Derived from portakal (https://github.com/productdevbook/portakal) — MIT.
 */

export { label, LabelBuilder } from "./builder.js";
export { PortakalError, InvalidConfigError } from "./errors.js";
export { toDots } from "./utils.js";
export {
  formatRow,
  formatPair,
  formatTable,
  separator,
  wordWrap,
} from "./receipt.js";
export type { Column } from "./receipt.js";
export { compileToTSC } from "./languages/tsc.js";
export { compileToZPL } from "./languages/zpl.js";
export { tsc } from "./lang/tsc.js";
export { zpl } from "./lang/zpl.js";
export {
  PRINTER_PROFILES,
  getProfile,
  listProfiles,
  findByLanguage,
} from "./profiles.js";
export type {
  PrinterProfile,
  PrinterLanguage,
  CutterType,
  ImageMode,
} from "./profiles.js";

export type {
  Alignment,
  BarcodeOptions,
  BarcodeSymbology,
  BoxOptions,
  CircleOptions,
  DitherAlgorithm,
  EllipseOptions,
  EraseOptions,
  ImageOptions,
  LabelConfig,
  LabelElement,
  LineOptions,
  MatrixBarcodeOptions,
  MonochromeBitmap,
  QrCodeOptions,
  ResolvedLabel,
  ReverseOptions,
  Rotation,
  TextOptions,
  Unit,
} from "./types.js";
