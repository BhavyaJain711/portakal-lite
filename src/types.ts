/**
 * Shared types for the label builder and compilers.
 * Copied from portakal (https://github.com/productdevbook/portakal) — MIT.
 */

/** Unit of measurement for label dimensions */
export type Unit = "mm" | "inch" | "dot";

/** Print orientation / rotation */
export type Rotation = 0 | 90 | 180 | 270;

/** TSC text fonts: "0" is the scalable TrueType font, "1"–"8" are fixed-pitch dot fonts. */
export type TSCTextFont = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";

/**
 * Base dot sizes for the fixed-pitch TSC fonts 1–8 (the source of truth used by
 * the compiler, the preview, and portakal-template's autoscaler).
 * Font "0" is scalable and sized in points (or as a multiplier of `fontBase`),
 * so it is not in this table.
 */
export const TSC_DOT_FONTS: Record<Exclude<TSCTextFont, "0">, { w: number; h: number }> = {
  "1": { w: 8, h: 12 },
  "2": { w: 12, h: 20 },
  "3": { w: 16, h: 24 },
  "4": { w: 24, h: 32 },
  "5": { w: 32, h: 48 },
  "6": { w: 14, h: 19 },
  "7": { w: 21, h: 27 },
  "8": { w: 14, h: 25 },
};

/** Text alignment */
export type Alignment = "left" | "center" | "right";

/** Dithering algorithm for image processing */
export type DitherAlgorithm = "threshold" | "floyd-steinberg" | "atkinson" | "ordered";

/** Label configuration */
export interface LabelConfig {
  /** Printer profile ID (e.g., "tsc-te200", "zebra-zd420"). Overrides width, dpi, etc. */
  printer?: string;
  /** Label width */
  width: number;
  /** Label height (optional for receipt/continuous mode) */
  height?: number;
  /** Unit of measurement (default: "mm") */
  unit?: Unit;
  /** Printer DPI (default: 203) */
  dpi?: number;
  /**
   * TSPL font "0" base character size in dots (width × height).
   * DPI-dependent: 12×24 @ 203 DPI, 18×36 @ 300 DPI. Inherited from the
   * printer profile when `printer` is set; overridable here.
   */
  fontBase?: { width: number; height: number };
  /**
   * How TSPL font "0" sizes are interpreted: "multiplier" (of `fontBase`)
   * or "points" (1pt = 1/72in). Firmware varies; default "multiplier".
   */
  font0Mode?: "multiplier" | "points";
  /**
   * Average glyph width relative to the font height for text width estimates
   * (default 0.5). Font "0" (CG Triumvirate Bold Condensed) runs ~0.5× the
   * point height — the condensed typeface is narrower than regular fonts. Tune
   * per printer/font if centered text drifts. Overridden per element via
   * TextOptions.charWidthFactor.
   */
  charWidthFactor?: number;
  /** Gap between labels in mm (label printers only) */
  gap?: number;
  /**
   * Print margin in `unit` (default 0) — a minimum offset the printer keeps
   * from the media edge. Emitted as `^ML` on ZPL; TSC has no equivalent
   * command, so the caller insets the layout instead.
   */
  margin?: number | {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  /** Print speed (1-10, printer-dependent) */
  speed?: number;
  /** Print darkness/density (0-15) */
  density?: number;
  /** Print direction */
  direction?: 0 | 1;
  /** Number of copies */
  copies?: number;
  /**
   * TSC line ending: `"\n"` (default) or `"\r\n"` for printers that need CRLF.
   */
  lineEnding?: "\n" | "\r\n";
}

/** Text element options */
export interface TextOptions {
  /** X position */
  x?: number;
  /** Y position */
  y?: number;
  /**
   * Font name or ID. "0" is the scalable TrueType font (sized per `font0Mode`:
   * points, or multiplier of `fontBase`). "1"–"8" are fixed-pitch dot fonts
   * (see `TSC_DOT_FONTS`), sized as an integer multiplier 1–10 of the base.
   * Default "2".
   */
  font?: TSCTextFont;
  /** Font size or magnification */
  size?: number;
  /** Horizontal magnification (1-10) */
  xScale?: number;
  /** Vertical magnification (1-10) */
  yScale?: number;
  /** Rotation */
  rotation?: Rotation;
  /** Bold */
  bold?: boolean;
  /** Underline */
  underline?: boolean;
  /** Reverse (white on black) */
  reverse?: boolean;
  /** Alignment */
  align?: Alignment;
  /** Max width for word-wrap (in dots) */
  maxWidth?: number;
  /** Max height for word-wrap/clipping (in dots) — TSC BLOCK height (default: maxWidth) */
  maxHeight?: number;
  /** Line spacing (in dots) */
  lineSpacing?: number;
  /**
   * Average glyph width relative to the font height for text width estimates
   * in the preview (default: the builder's charWidthFactor, 0.5). Tune per
   * printer/font if centered text drifts in the preview.
   */
  charWidthFactor?: number;
}

/** Image element options */
export interface ImageOptions {
  /** X position */
  x?: number;
  /** Y position */
  y?: number;
  /** Target width in dots (auto-scale if set) */
  width?: number;
  /** Target height in dots (auto-scale if set) */
  height?: number;
  /** Dithering algorithm (default: "threshold") */
  dither?: DitherAlgorithm;
  /** Threshold for monochrome conversion (0-255, default: 128) */
  threshold?: number;
}

/** Box/rectangle element options */
export interface BoxOptions {
  /** X position */
  x: number;
  /** Y position */
  y: number;
  /** Width */
  width: number;
  /** Height */
  height: number;
  /** Border thickness in dots (default: 1) */
  thickness?: number;
  /** Corner radius in dots */
  radius?: number;
}

/** Line element options */
export interface LineOptions {
  /** Start X */
  x1: number;
  /** Start Y */
  y1: number;
  /** End X */
  x2: number;
  /** End Y */
  y2: number;
  /** Line thickness in dots (default: 1) */
  thickness?: number;
}

/** Circle element options */
export interface CircleOptions {
  /** Center X */
  x: number;
  /** Center Y */
  y: number;
  /** Diameter in dots */
  diameter: number;
  /** Border thickness in dots (default: 1) */
  thickness?: number;
}

/** 1-bit monochrome bitmap (universal intermediate format for images) */
export interface MonochromeBitmap {
  /** Packed 1-bit pixel data, row-major, MSB-first */
  data: Uint8Array;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Bytes per row = ceil(width / 8) */
  bytesPerRow: number;
}

/** Ellipse element options */
export interface EllipseOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  thickness?: number;
}

/** Reverse region options (invert black/white) */
export interface ReverseOptions {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Erase region options (clear to white) */
export interface EraseOptions {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Barcode symbologies supported by .barcode(). The value is passed to etiket's
 * encoders, so anything etiket supports works. `code128` uses the printer's
 * native encoder; everything else is rasterized to a BITMAP/^GFA graphic.
 */
export type BarcodeSymbology = string;

/** 1D barcode element options. */
export interface BarcodeOptions {
  /** X position in dots */
  x?: number;
  /** Y position in dots */
  y?: number;
  /** Bar height in dots (default: 80) */
  height?: number;
  /** Narrow element width in dots (default: 2) */
  moduleWidth?: number;
  /** Wide:narrow ratio (TSC 1-4, ZPL 2 or 3; default: 2) */
  ratio?: number;
  /** Rotation (default: 0) */
  rotation?: Rotation;
  /** Human-readable text below the bars (default: true) */
  readable?: boolean;
  /** Human-readable font size (TSC 1-10, ZPL 0-5; default: 2) */
  fontSize?: number;
  /** etiket encoding passthrough */
  code128Charset?: "auto" | "A" | "B" | "C";
  msiCheckDigit?: "mod10" | "mod11" | "mod1010" | "mod1110" | "none";
  code39CheckDigit?: boolean;
  codabarStart?: string;
  codabarStop?: string;
  /** Render interpretable text (affects SVG preview; default true) */
  showText?: boolean;
}

/** QR code element options. */
export interface QrCodeOptions {
  /** X position in dots */
  x?: number;
  /** Y position in dots */
  y?: number;
  /** Module (cell) width in dots (default: 6) */
  cellSize?: number;
  /** Error correction level (default: "M") */
  ecc?: "L" | "M" | "Q" | "H";
  /** Rotation (default: 0) */
  rotation?: Rotation;
  /** etiket QR encoding passthrough */
  version?: number;
  mode?: "numeric" | "alphanumeric" | "byte" | "kanji" | "auto";
  mask?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  eci?: number;
  gs1?: boolean;
  /** Show human-readable text below the symbol */
  showText?: boolean;
}

/** 2D barcode element options (etiket raster path). */
export interface MatrixBarcodeOptions {
  /** X position in dots */
  x?: number;
  /** Y position in dots */
  y?: number;
  /** Module width in dots (default: 6) */
  cellSize?: number;
  /** Rotation (default: 0) */
  rotation?: Rotation;
  /** etiket encoding passthrough (per-symbology) */
  [key: string]: unknown;
}

/** Internal label element union type */
export type LabelElement =
  | { type: "text"; content: string; options: TextOptions }
  | { type: "image"; bitmap: MonochromeBitmap; options: ImageOptions }
  | { type: "box"; options: BoxOptions }
  | { type: "line"; options: LineOptions }
  | { type: "circle"; options: CircleOptions }
  | { type: "ellipse"; options: EllipseOptions }
  | { type: "reverse"; options: ReverseOptions }
  | { type: "erase"; options: EraseOptions }
  | { type: "barcode"; content: string; symbology: BarcodeSymbology; options: BarcodeOptions }
  | { type: "qrcode"; content: string; options: QrCodeOptions }
  | {
      type: "matrix";
      content: string;
      symbology: "datamatrix" | "pdf417" | "aztec";
      options: MatrixBarcodeOptions;
    }
  | { type: "raw"; content: string | Uint8Array };

/** Resolved label configuration with computed values */
export interface ResolvedLabel {
  /** Width in dots */
  widthDots: number;
  /** Height in dots (0 for continuous/receipt) */
  heightDots: number;
  /** DPI */
  dpi: number;
  /**
   * TSPL font "0" base size in dots (12×24 @ 203, 18×36 @ 300), from the
   * printer profile or config override.
   */
  fontBase: { width: number; height: number };
  /**
   * TSPL font "0" size mode: "multiplier" (of fontBase) or "points".
   */
  font0Mode: "multiplier" | "points";
  /**
   * Default average glyph width relative to the font height for text width
   * estimates (preview centering), from config.
   */
  charWidthFactor: number;
  /** Gap in dots (optional, emitted only if defined) */
  gapDots?: number;
  /** Print margin in dots */
  marginDots: number;
  /** Top print margin in dots */
  marginTopDots: number;
  /** Bottom print margin in dots */
  marginBottomDots: number;
  /** Left print margin in dots */
  marginLeftDots: number;
  /** Right print margin in dots */
  marginRightDots: number;
  /** Speed (optional, emitted only if defined) */
  speed?: number;
  /** Density (optional, emitted only if defined) */
  density?: number;
  /** Direction (optional, emitted only if defined) */
  direction?: 0 | 1;
  /** Copies (optional, defaults to 1) */
  copies?: number;
  /** TSC line ending (default `"\n"`, or `"\r\n"` for CRLF printers) */
  lineEnding: "\n" | "\r\n";
  /** All elements to render */
  elements: LabelElement[];
}
