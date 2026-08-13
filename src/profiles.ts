/**
 * Printer capability profiles — trimmed to TSC and ZPL label printers.
 * Derived from portakal (https://github.com/productdevbook/portakal) — MIT.
 */

export type PrinterLanguage = "tsc" | "zpl";

export type CutterType = "none" | "partial" | "full";

export type ImageMode = "raster" | "column" | "nvGraphics";

export interface PrinterProfile {
  /** Printer model name */
  name: string;
  /** Manufacturer */
  vendor: string;
  /** Primary printer language */
  language: PrinterLanguage;
  /** Paper width in mm */
  paperWidth: number;
  /** Print width in dots */
  dotsPerLine: number;
  /** Printer DPI */
  dpi: number;
  /**
   * TSPL font "0" base character size in dots (width × height), which is
   * DPI-dependent: 12×24 @ 203 DPI, 18×36 @ 300 DPI. Used when `font0Mode`
   * is "multiplier": `size` scales this base.
   */
  fontBase: { width: number; height: number };
  /**
   * How TSPL font "0" sizes are interpreted:
   *  - "multiplier": `size` is a multiplier of `fontBase` (bitmap-style).
   *  - "points":     `size` is a point size (TrueType-style, 1pt = 1/72in).
   * Firmware varies; the TSC manual describes points for TSPL2, but many
   * models treat it as a multiplier. Default "multiplier".
   */
  font0Mode: "multiplier" | "points";
  /** Characters per line (Font A) */
  charsPerLine: number;
  /** USB Vendor ID (hex) */
  usbVendorId?: number;
  /** USB Product ID (hex) */
  usbProductId?: number;
  /** Features */
  features: {
    cutter: CutterType;
    cashDrawer: boolean;
    imageMode: ImageMode[];
    cjk: boolean;
    nativeUtf8: boolean;
    codePages: number[];
  };
}

/** Built-in printer profiles */
export const PRINTER_PROFILES: Record<string, PrinterProfile> = {
  // === TSC Label Printers ===
  "tsc-te200": {
    name: "TSC TE200",
    vendor: "TSC",
    language: "tsc",
    paperWidth: 108,
    dotsPerLine: 832,
    dpi: 203,
    fontBase: { width: 12, height: 24 },
    font0Mode: "multiplier",
    charsPerLine: 0,
    usbVendorId: 0x1203,
    features: {
      cutter: "none",
      cashDrawer: false,
      imageMode: ["raster"],
      cjk: true,
      nativeUtf8: false,
      codePages: [],
    },
  },
  "tsc-te310": {
    name: "TSC TE310",
    vendor: "TSC",
    language: "tsc",
    paperWidth: 108,
    dotsPerLine: 1276,
    dpi: 300,
    fontBase: { width: 18, height: 36 },
    font0Mode: "multiplier",
    charsPerLine: 0,
    usbVendorId: 0x1203,
    features: {
      cutter: "none",
      cashDrawer: false,
      imageMode: ["raster"],
      cjk: true,
      nativeUtf8: false,
      codePages: [],
    },
  },

  // === Zebra Label Printers ===
  "zebra-zd420": {
    name: "Zebra ZD420",
    vendor: "Zebra",
    language: "zpl",
    paperWidth: 108,
    dotsPerLine: 832,
    dpi: 203,
    fontBase: { width: 12, height: 24 },
    font0Mode: "multiplier",
    charsPerLine: 0,
    usbVendorId: 0x0a5f,
    features: {
      cutter: "full",
      cashDrawer: false,
      imageMode: ["raster"],
      cjk: false,
      nativeUtf8: true,
      codePages: [],
    },
  },
  "zebra-zt410": {
    name: "Zebra ZT410",
    vendor: "Zebra",
    language: "zpl",
    paperWidth: 104,
    dotsPerLine: 832,
    dpi: 203,
    fontBase: { width: 12, height: 24 },
    font0Mode: "multiplier",
    charsPerLine: 0,
    usbVendorId: 0x0a5f,
    features: {
      cutter: "full",
      cashDrawer: false,
      imageMode: ["raster"],
      cjk: false,
      nativeUtf8: true,
      codePages: [],
    },
  },
};

/** Get a printer profile by model ID */
export function getProfile(modelId: string): PrinterProfile | undefined {
  return PRINTER_PROFILES[modelId];
}

/** List all available profile IDs */
export function listProfiles(): string[] {
  return Object.keys(PRINTER_PROFILES);
}

/** Find profiles by language */
export function findByLanguage(language: PrinterLanguage): PrinterProfile[] {
  return Object.values(PRINTER_PROFILES).filter((p) => p.language === language);
}
