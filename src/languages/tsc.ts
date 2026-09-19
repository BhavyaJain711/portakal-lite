import type { LabelElement, MonochromeBitmap, ResolvedLabel } from "../types.js";
import { TSC_DOT_FONTS } from "../types.js";
import { rasterizeElement } from "../raster.js";

/**
 * TSC/TSPL2 compiler — produces a `Uint8Array` ready to send to the printer.
 *
 * Text commands (SIZE, TEXT, BOX, …) are UTF-8 encoded.  BITMAP pixel data is
 * emitted as **raw binary bytes** immediately after the header comma — this is
 * what TSC printers expect.  The previous comma-separated decimal encoding
 * (e.g. `"255,0"`) was wrong: the printer treated each ASCII character as a
 * raw byte, producing garbled images.
 */

/**
 * Make a string safe to embed in a TSC quoted argument.
 * TSC has no in-band escape, so: strip control characters (0x00-0x1F, 0x7F)
 * and replace double quotes with single quotes. The result stays a single
 * well-formed quoted string and cannot inject new commands.
 */
function sanitizeTSCString(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22) {
      out += "'"; // double quote
    } else if (c < 0x20 || c === 0x7f) {
      out += " "; // control characters
    } else {
      out += s[i];
    }
  }
  return out;
}

const encoder = new TextEncoder();

/** Encode a string to UTF-8 bytes. */
function strToBytes(s: string): Uint8Array {
  return encoder.encode(s);
}

/** Concatenate multiple Uint8Arrays into one. */
function concat(...arrays: Uint8Array[]): Uint8Array {
  let totalLength = 0;
  for (const arr of arrays) totalLength += arr.length;
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Result of compiling a single element. Text-only elements produce a string
 * command. Bitmap elements produce a text header + raw binary pixel data.
 */
type CompiledElement =
  | { kind: "text"; command: string }
  | { kind: "bitmap"; header: string; data: Uint8Array };

/**
 * Build the BITMAP header + raw binary data for a monochrome bitmap.
 * The header is `BITMAP x,y,bytesPerRow,height,mode,` (note the trailing
 * comma with NO newline) — raw bytes follow immediately.
 *
 * NOTE: TSPL's BITMAP command uses inverse polarity where 0 = black (burned dot)
 * and 1 = white (unprinted paper), whereas MonochromeBitmap uses 1 = black, 0 = white.
 * We invert the bits here so that images and rasterized elements print correctly.
 */
function bitmapElement(x: number, y: number, bmp: MonochromeBitmap): CompiledElement {
  const inverted = new Uint8Array(bmp.data.length);
  for (let i = 0; i < bmp.data.length; i++) {
    inverted[i] = ~bmp.data[i]! & 0xff;
  }
  return {
    kind: "bitmap",
    header: `BITMAP ${x},${y},${bmp.bytesPerRow},${bmp.height},0,`,
    data: inverted,
  };
}

function compileElement(
  el: LabelElement,
  font0Mode: "multiplier" | "points",
): CompiledElement {
  switch (el.type) {
    case "text": {
      const o = el.options;
      const x = o.x ?? 0;
      const y = o.y ?? 0;
      const font = o.font ?? "2";
      const rotation = o.rotation ?? 0;
      // Font "0" size semantics depend on firmware:
      //  - "multiplier": `size` scales the DPI-based base (12×24 @ 203).
      //  - "points":     `size` is a point size (1pt = 1/72in); TSC passes it
      //                  through as TEXT x,y,"0",rot,w_pt,h_pt.
      const size = o.size ?? 1;
      const isScalable = font === "0";
      // Fixed fonts (1–8) strictly require integer multipliers 1–10.
      const xMul = isScalable
        ? Math.round(o.xScale ?? size)
        : Math.max(1, Math.min(10, Math.round(o.xScale ?? size)));
      const yMul = isScalable
        ? (font0Mode === "points" ? Math.round(size) : Math.round(o.yScale ?? size))
        : Math.max(1, Math.min(10, Math.round(o.yScale ?? size)));
      let cmd = "";
      if (o.maxWidth) {
        const align = o.align === "center" ? 2 : o.align === "right" ? 3 : 1;
        const spacing = o.lineSpacing ?? 0;
        const height = o.maxHeight ?? o.maxWidth;
        cmd = `BLOCK ${x},${y},${o.maxWidth},${height},"${font}",${rotation},${xMul},${yMul},${spacing},${align},"${sanitizeTSCString(el.content)}"`;
      } else {
        cmd = `TEXT ${x},${y},"${font}",${rotation},${xMul},${yMul},"${sanitizeTSCString(el.content)}"`;
      }

      if (o.reverse) {
        const f = TSC_DOT_FONTS[font as keyof typeof TSC_DOT_FONTS];
        const charW = f ? f.w * xMul : xMul;
        const fontH = f ? f.h * yMul : yMul;
        const w = o.maxWidth || Math.round(el.content.length * charW);
        const h = Math.round(fontH);
        cmd += `\nREVERSE ${x},${y},${w},${h}`;
      }

      return { kind: "text", command: cmd };
    }

    case "image": {
      const o = el.options;
      const x = o.x ?? 0;
      const y = o.y ?? 0;
      return bitmapElement(x, y, el.bitmap);
    }

    case "box": {
      const o = el.options;
      const x2 = o.x + o.width;
      const y2 = o.y + o.height;
      const t = o.thickness ?? 1;
      if (o.radius) {
        return { kind: "text", command: `BOX ${o.x},${o.y},${x2},${y2},${t},${o.radius}` };
      }
      return { kind: "text", command: `BOX ${o.x},${o.y},${x2},${y2},${t}` };
    }

    case "line": {
      const o = el.options;
      const t = o.thickness ?? 1;
      if (o.y1 === o.y2) {
        const w = Math.abs(o.x2 - o.x1);
        return { kind: "text", command: `BAR ${Math.min(o.x1, o.x2)},${o.y1},${w},${t}` };
      }
      if (o.x1 === o.x2) {
        const h = Math.abs(o.y2 - o.y1);
        return { kind: "text", command: `BAR ${o.x1},${Math.min(o.y1, o.y2)},${t},${h}` };
      }
      return { kind: "text", command: `DIAGONAL ${o.x1},${o.y1},${o.x2},${o.y2},${t}` };
    }

    case "circle": {
      const o = el.options;
      const t = o.thickness ?? 1;
      return { kind: "text", command: `CIRCLE ${o.x},${o.y},${o.diameter},${t}` };
    }

    case "ellipse": {
      const o = el.options;
      const t = o.thickness ?? 1;
      return { kind: "text", command: `ELLIPSE ${o.x},${o.y},${o.width},${o.height},${t}` };
    }

    case "reverse": {
      const o = el.options;
      return { kind: "text", command: `REVERSE ${o.x},${o.y},${o.width},${o.height}` };
    }

    case "erase": {
      const o = el.options;
      return { kind: "text", command: `ERASE ${o.x},${o.y},${o.width},${o.height}` };
    }

    case "barcode": {
      const o = el.options;
      const x = o.x ?? 0;
      const y = o.y ?? 0;
      if (el.symbology === "code128") {
        // TSC BARCODE: x,y,"type",height,readable,rotation,narrow,wide,"content"
        const height = o.height ?? 80;
        const readable = o.readable === false ? 0 : 1;
        const rotation = o.rotation ?? 0;
        const narrow = o.moduleWidth ?? 2;
        const wide = narrow * (o.ratio ?? 2);
        return { kind: "text", command: `BARCODE ${x},${y},"128",${height},${readable},${rotation},${narrow},${wide},"${sanitizeTSCString(el.content)}"` };
      }
      // Non-native 1D → rasterize and emit as BITMAP
      const bitmap = rasterizeElement(el);
      return bitmapElement(x, y, bitmap);
    }

    case "qrcode": {
      const o = el.options;
      const x = o.x ?? 0;
      const y = o.y ?? 0;
      // TSC QRCODE: x,y,ECC,cellwidth,mode,rotation,"content"
      // ECC (L/M/Q/H) and mode (A/M) are NOT quoted in TSPL.
      const ecc = o.ecc ?? "H";
      const cellWidth = o.cellSize ?? 6;
      const rotation = o.rotation ?? 0;
      return { kind: "text", command: `QRCODE ${x},${y},${ecc},${cellWidth},A,${rotation},"${sanitizeTSCString(el.content)}"` };
    }

    case "matrix": {
      // Raster path — emit the bitmap as a TSC BITMAP command.
      const o = el.options;
      const x = o.x ?? 0;
      const y = o.y ?? 0;
      const bitmap = rasterizeElement(el);
      return bitmapElement(x, y, bitmap);
    }

    case "raw":
      if (typeof el.content === "string") {
        return { kind: "text", command: el.content };
      }
      // Raw Uint8Array — will be spliced directly into the binary output.
      return { kind: "bitmap", header: "", data: el.content };
  }
}

/**
 * Compile a resolved label to a `Uint8Array` ready to send to a TSC/TSPL2
 * printer.  Text commands are UTF-8 encoded; BITMAP pixel data is emitted as
 * raw binary bytes immediately after the command header.
 *
 * Lines are joined with `\n` by default; pass `lineEnding: "\r\n"` if the
 * target printer firmware requires CRLF (some TSC drivers default to it).
 */
export function compileToTSC(
  label: ResolvedLabel,
  options: { lineEnding?: "\n" | "\r\n" } = {},
): Uint8Array {
  const lineEnding = options.lineEnding ?? "\n";
  const le = strToBytes(lineEnding);
  const chunks: Uint8Array[] = [];
  const dpi = label.dpi;
  const wMM = Math.round((label.widthDots / dpi) * 25.4);
  const hMM = label.heightDots > 0 ? Math.round((label.heightDots / dpi) * 25.4) : 0;

  const pushLine = (s: string) => { chunks.push(strToBytes(s)); chunks.push(le); };

  pushLine(`SIZE ${wMM} mm,${hMM} mm`);
  if (label.gapDots != null && label.gapDots > 0) {
    const gMM = Math.round((label.gapDots / dpi) * 25.4);
    pushLine(`GAP ${gMM} mm,0 mm`);
  }
  if (label.speed != null) {
    pushLine(`SPEED ${label.speed}`);
  }
  if (label.density != null) {
    pushLine(`DENSITY ${label.density}`);
  }
  if (label.direction != null) {
    pushLine(`DIRECTION ${label.direction}`);
  }
  pushLine("CLS");

  for (const el of label.elements) {
    const compiled = compileElement(el, label.font0Mode);
    if (compiled.kind === "text") {
      pushLine(compiled.command);
    } else {
      // Bitmap: header text (with trailing comma) + raw binary + line ending
      chunks.push(strToBytes(compiled.header));
      chunks.push(compiled.data);
      chunks.push(le);
    }
  }

  pushLine(`PRINT ${label.copies ?? 1}`);
  return concat(...chunks);
}
