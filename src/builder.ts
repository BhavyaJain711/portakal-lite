import type {
  BarcodeOptions,
  BarcodeSymbology,
  BoxOptions,
  CircleOptions,
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
  TextOptions,
} from "./types.js";
import { InvalidConfigError } from "./errors.js";
import { toDots, defaultFontBase } from "./utils.js";
import { getProfile } from "./profiles.js";

/** Hard cap for label dimensions in dots — protects 16-bit printer fields (ZPL ^PW/^LL). */
const MAX_DOTS = 65535;

export class LabelBuilder {
  private readonly config: LabelConfig;
  private readonly elements: LabelElement[] = [];

  constructor(config: LabelConfig) {
    if (config.printer) {
      const profile = getProfile(config.printer);
      if (profile) {
        config = {
          ...config,
          width: config.width || profile.paperWidth,
          dpi: config.dpi ?? profile.dpi,
          unit: config.unit ?? "mm",
          fontBase: config.fontBase ?? profile.fontBase,
          font0Mode: config.font0Mode ?? profile.font0Mode,
        };
      }
    }
    if (!config.width || config.width <= 0 || !Number.isFinite(config.width)) {
      throw new InvalidConfigError("Label width must be a positive finite number");
    }
    this.config = config;
  }

  text(content: string, options: TextOptions = {}): this {
    this.elements.push({ type: "text", content, options });
    return this;
  }

  image(bitmap: MonochromeBitmap, options: ImageOptions = {}): this {
    this.elements.push({ type: "image", bitmap, options });
    return this;
  }

  box(options: BoxOptions): this {
    this.elements.push({ type: "box", options });
    return this;
  }

  line(options: LineOptions): this {
    this.elements.push({ type: "line", options });
    return this;
  }

  circle(options: CircleOptions): this {
    this.elements.push({ type: "circle", options });
    return this;
  }

  ellipse(options: EllipseOptions): this {
    this.elements.push({ type: "ellipse", options });
    return this;
  }

  reverse(options: ReverseOptions): this {
    this.elements.push({ type: "reverse", options });
    return this;
  }

  erase(options: EraseOptions): this {
    this.elements.push({ type: "erase", options });
    return this;
  }

  /**
   * Add a barcode. `symbology` defaults to "code128" (printer-native); any
   * other etiket symbology (ean13, upca, code39, itf, ...) is rasterized.
   */
  barcode(content: string, options: BarcodeOptions & { symbology?: BarcodeSymbology } = {}): this {
    const { symbology = "code128", ...rest } = options;
    this.elements.push({ type: "barcode", content, symbology, options: rest });
    return this;
  }

  /** Add a printer-native QR code. */
  qrcode(content: string, options: QrCodeOptions = {}): this {
    this.elements.push({ type: "qrcode", content, options });
    return this;
  }

  /** Add a Data Matrix symbol (rasterized via etiket). */
  datamatrix(content: string, options: MatrixBarcodeOptions = {}): this {
    this.elements.push({ type: "matrix", content, symbology: "datamatrix", options });
    return this;
  }

  /** Add a PDF417 symbol (rasterized via etiket). */
  pdf417(content: string, options: MatrixBarcodeOptions = {}): this {
    this.elements.push({ type: "matrix", content, symbology: "pdf417", options });
    return this;
  }

  /** Add an Aztec symbol (rasterized via etiket). */
  aztec(content: string, options: MatrixBarcodeOptions = {}): this {
    this.elements.push({ type: "matrix", content, symbology: "aztec", options });
    return this;
  }

  raw(content: string | Uint8Array): this {
    this.elements.push({ type: "raw", content });
    return this;
  }

  resolve(): ResolvedLabel {
    const unit = this.config.unit ?? "mm";
    const dpi = this.config.dpi ?? 203;

    if (!Number.isFinite(dpi) || dpi <= 0) {
      throw new InvalidConfigError("dpi must be a positive finite number");
    }
    if (this.config.height != null && !Number.isFinite(this.config.height)) {
      throw new InvalidConfigError("Label height must be a finite number");
    }
    if (this.config.gap != null && !Number.isFinite(this.config.gap)) {
      throw new InvalidConfigError("Label gap must be a finite number");
    }

    const widthDots = toDots(this.config.width, unit, dpi);
    const heightDots = this.config.height ? toDots(this.config.height, unit, dpi) : 0;

    if (widthDots <= 0 || widthDots > MAX_DOTS) {
      throw new InvalidConfigError(
        `Label width ${widthDots} dots is out of range (1-${MAX_DOTS})`,
      );
    }
    if (heightDots > MAX_DOTS) {
      throw new InvalidConfigError(
        `Label height ${heightDots} dots is out of range (0-${MAX_DOTS})`,
      );
    }

    const speed = this.config.speed ?? 4;
    const density = this.config.density ?? 8;
    const direction = this.config.direction ?? 0;
    const copies = this.config.copies ?? 1;

    if (!Number.isInteger(speed) || speed < 1 || speed > 18) {
      throw new InvalidConfigError("speed must be an integer between 1 and 18");
    }
    if (!Number.isInteger(density) || density < 0 || density > 15) {
      throw new InvalidConfigError("density must be an integer between 0 and 15");
    }
    if (direction !== 0 && direction !== 1) {
      throw new InvalidConfigError("direction must be 0 or 1");
    }
    if (!Number.isInteger(copies) || copies < 1) {
      throw new InvalidConfigError("copies must be a positive integer");
    }

    this.validateElementNumbers();

    const rawMarginNum = typeof this.config.margin === "number" ? this.config.margin : undefined;
    const rawMarginObj =
      typeof this.config.margin === "object" && this.config.margin !== null ? this.config.margin : undefined;

    const rawTop = rawMarginObj?.top ?? rawMarginNum ?? 0;
    const rawBottom = rawMarginObj?.bottom ?? rawMarginNum ?? 0;
    const rawLeft = rawMarginObj?.left ?? rawMarginNum ?? 0;
    const rawRight = rawMarginObj?.right ?? rawMarginNum ?? 0;

    return {
      widthDots,
      heightDots,
      dpi,
      fontBase: this.config.fontBase ?? defaultFontBase(dpi),
      font0Mode: this.config.font0Mode ?? "multiplier",
      charWidthFactor: this.config.charWidthFactor ?? 0.5,
      gapDots: this.config.gap != null ? toDots(this.config.gap, unit, dpi) : undefined,
      marginDots: typeof this.config.margin === "number" ? toDots(this.config.margin, unit, dpi) : 0,
      marginTopDots: toDots(rawTop, unit, dpi),
      marginBottomDots: toDots(rawBottom, unit, dpi),
      marginLeftDots: toDots(rawLeft, unit, dpi),
      marginRightDots: toDots(rawRight, unit, dpi),
      speed: this.config.speed,
      density: this.config.density,
      direction: this.config.direction,
      copies: this.config.copies,
      lineEnding: this.config.lineEnding ?? "\n",
      elements: this.elements,
    };
  }

  /**
   * Ensure every numeric option on every element is finite, so malformed
   * coordinates (NaN, Infinity) can never reach the generated commands.
   */
  private validateElementNumbers(): void {
    for (const el of this.elements) {
      if (el.type === "raw") continue;
      const o = el.options as Record<string, unknown>;
      for (const key of Object.keys(o)) {
        const v = o[key];
        if (typeof v === "number" && !Number.isFinite(v)) {
          throw new InvalidConfigError(
            `Element "${el.type}" option "${key}" must be a finite number, got ${String(v)}`,
          );
        }
      }
      // Bitmap data is trusted binary (packed 1-bit); validate shape instead.
      if (el.type === "image") {
        const bmp = el.bitmap;
        if (
          !Number.isInteger(bmp.width) ||
          bmp.width <= 0 ||
          !Number.isInteger(bmp.height) ||
          bmp.height <= 0 ||
          !(bmp.data instanceof Uint8Array)
        ) {
          throw new InvalidConfigError("image bitmap must have positive integer dimensions and Uint8Array data");
        }
        if (bmp.bytesPerRow !== Math.ceil(bmp.width / 8)) {
          throw new InvalidConfigError("image bitmap bytesPerRow must equal ceil(width / 8)");
        }
        const expected = bmp.bytesPerRow * bmp.height;
        if (bmp.data.length !== expected) {
          throw new InvalidConfigError(
            `image bitmap data length ${bmp.data.length} does not match ${expected} bytes (bytesPerRow × height)`,
          );
        }
      }
      // Barcode/QR/matrix: content caps + option ranges (printer command limits).
      if (el.type === "barcode" || el.type === "qrcode" || el.type === "matrix") {
        this.validateSymbology(el);
      }
    }
  }

  /** Validate barcode/QR/matrix content size, rotation, ecc, and numeric ranges. */
  private validateSymbology(
    el: Extract<LabelElement, { type: "barcode" | "qrcode" | "matrix" }>,
  ): void {
    const opts = el.options as Record<string, unknown>;
    const MAX_CODE128 = 4096; // printer-native limit for a single Code 128
    const MAX_QR_BYTES = 708; // QR v40-L: 708 bytes max data capacity

    if (el.type === "barcode" && el.content.length > MAX_CODE128) {
      throw new InvalidConfigError(
        `barcode content exceeds ${MAX_CODE128} characters (got ${el.content.length})`,
      );
    }
    if (el.type === "qrcode") {
      let bytes = 0;
      for (let i = 0; i < el.content.length; i++) {
        bytes += el.content.charCodeAt(i) <= 0x7f ? 1 : 2; // ~UTF-8 estimate
      }
      if (bytes > MAX_QR_BYTES) {
        throw new InvalidConfigError(
          `qrcode content exceeds ${MAX_QR_BYTES} bytes (got ~${bytes})`,
        );
      }
    }

    const rotation = opts.rotation ?? 0;
    if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270) {
      throw new InvalidConfigError("rotation must be one of 0, 90, 180, 270");
    }

    if (el.type === "qrcode") {
      const ecc = opts.ecc ?? "M";
      if (ecc !== "L" && ecc !== "M" && ecc !== "Q" && ecc !== "H") {
        throw new InvalidConfigError('qrcode ecc must be one of "L", "M", "Q", "H"');
      }
      const mask = opts.mask;
      if (mask != null && (!Number.isInteger(mask) || (mask as number) < 0 || (mask as number) > 7)) {
        throw new InvalidConfigError("qrcode mask must be an integer between 0 and 7");
      }
      const cellSize = opts.cellSize ?? 6;
      if (!Number.isInteger(cellSize) || (cellSize as number) < 1 || (cellSize as number) > 32) {
        throw new InvalidConfigError("qrcode cellSize must be an integer between 1 and 32");
      }
    } else if (el.type === "matrix") {
      const cellSize = opts.cellSize ?? 6;
      if (!Number.isInteger(cellSize) || (cellSize as number) < 1 || (cellSize as number) > 32) {
        throw new InvalidConfigError("matrix cellSize must be an integer between 1 and 32");
      }
    } else {
      const height = opts.height ?? 80;
      if (!Number.isInteger(height) || (height as number) < 10 || (height as number) > 4000) {
        throw new InvalidConfigError("barcode height must be an integer between 10 and 4000");
      }
      const moduleWidth = opts.moduleWidth ?? 2;
      if (
        !Number.isInteger(moduleWidth) ||
        (moduleWidth as number) < 1 ||
        (moduleWidth as number) > 10
      ) {
        throw new InvalidConfigError("barcode moduleWidth must be an integer between 1 and 10");
      }
      const ratio = opts.ratio ?? 2;
      if (!Number.isInteger(ratio) || (ratio as number) < 1 || (ratio as number) > 4) {
        throw new InvalidConfigError("barcode ratio must be an integer between 1 and 4");
      }
      const fontSize = opts.fontSize ?? 2;
      if (!Number.isInteger(fontSize) || (fontSize as number) < 1 || (fontSize as number) > 10) {
        throw new InvalidConfigError("barcode fontSize must be an integer between 1 and 10");
      }
    }
  }
}

export function label(config: LabelConfig): LabelBuilder {
  return new LabelBuilder(config);
}
