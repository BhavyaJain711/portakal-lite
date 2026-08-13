import type { LabelElement, ResolvedLabel } from "../types.js";
import { bytesToHex, rasterizeElement } from "../raster.js";

/**
 * ZPL II compiler. Command generation is identical to portakal except for one
 * security hardening: `^FD` data is emitted with `^FH_` and Zebra hex-escapes.
 * Carets, tildes, underscores and control characters in text can otherwise
 * break out of the field and inject arbitrary ZPL commands.
 */

const HEX_DIGITS = "0123456789ABCDEF";

/**
 * Zebra ^FH hex-escape encoding: printable ASCII passes through unchanged;
 * `^`, `~`, `_` and control characters are emitted as `_HH`. Because `_` is
 * always escaped, the sequence cannot be misinterpreted by the printer.
 */
function encodeZPLData(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (
      (code >= 0x20 && code <= 0x5d) || // printable except ^ (0x5e)
      code === 0x60 || // backtick
      (code >= 0x61 && code <= 0x7d) // printable except ~ (0x7e) and DEL (0x7f)
    ) {
      out += s[i];
    } else if (code <= 0xff) {
      out += "_" + HEX_DIGITS[code >> 4] + HEX_DIGITS[code & 0x0f];
    } else {
      // Non-Latin-1: encode UTF-8 bytes individually so the printer
      // (with ^CI28) receives the same text.
      const bytes = encodeUtf8(s.charCodeAt(i));
      for (const b of bytes) {
        out += "_" + HEX_DIGITS[b >> 4] + HEX_DIGITS[b & 0x0f];
      }
    }
  }
  return out;
}

function encodeUtf8(code: number): number[] {
  const bytes: number[] = [];
  if (code <= 0x7f) {
    bytes.push(code);
  } else if (code <= 0x7ff) {
    bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
  } else if (code <= 0xffff) {
    bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  } else {
    bytes.push(
      0xf0 | (code >> 18),
      0x80 | ((code >> 12) & 0x3f),
      0x80 | ((code >> 6) & 0x3f),
      0x80 | (code & 0x3f),
    );
  }
  return bytes;
}

function zplRotation(r: number): string {
  switch (r) {
    case 90:
      return "R";
    case 180:
      return "I";
    case 270:
      return "B";
    default:
      return "N";
  }
}

function compileElement(
  el: LabelElement,
  fontBase: { width: number; height: number },
  font0Mode: "multiplier" | "points",
  dpi: number,
): string {
  switch (el.type) {
    case "text": {
      const o = el.options;
      const x = o.x ?? 0;
      const y = o.y ?? 0;
      const rot = zplRotation(o.rotation ?? 0);
      const font = o.font ?? "0";
      // Font "0" size semantics depend on firmware:
      //  - "multiplier": `size` × fontBase → ^A h,w dots.
      //  - "points":     `size` (pt) × dpi/72 → ^A h,w dots.
      const isScalable = font === "0";
      const ptToDots = dpi / 72;
      const h = isScalable
        ? Math.round((o.size ?? 1) * (font0Mode === "points" ? ptToDots : fontBase.height))
        : Math.round((o.size ?? 1) * fontBase.height);
      const w = o.xScale != null
        ? Math.round(o.xScale * (font0Mode === "points" ? ptToDots : fontBase.width))
        : h;

      let cmd = `^FO${x},${y}`;
      cmd += `^A${font}${rot},${h},${w}`;

      if (o.maxWidth) {
        const justify = o.align === "center" ? "C" : o.align === "right" ? "R" : "L";
        const lines = 999;
        cmd += `^FB${o.maxWidth},${lines},0,${justify}`;
      }

      if (o.reverse) {
        cmd += "^FR";
      }

      cmd += `^FH_^FD${encodeZPLData(el.content)}^FS`;
      return cmd;
    }

    case "image": {
      const o = el.options;
      const x = o.x ?? 0;
      const y = o.y ?? 0;
      const bmp = el.bitmap;
      const totalBytes = bmp.data.length;

      let hex = "";
      for (let i = 0; i < bmp.data.length; i++) {
        hex += bmp.data[i]!.toString(16).padStart(2, "0").toUpperCase();
      }

      return `^FO${x},${y}^GFA,${totalBytes},${totalBytes},${bmp.bytesPerRow},${hex}^FS`;
    }

    case "box": {
      const o = el.options;
      const t = o.thickness ?? 1;
      const radiusDots = o.radius ?? 0;
      // Convert dot radius to ZPL 0-8 index: index = radius / (shorter_side/2) * 8
      const maxR = Math.min(o.width, o.height) / 2;
      const rIndex =
        maxR > 0 && radiusDots > 0 ? Math.min(8, Math.round((radiusDots / maxR) * 8)) : 0;
      return `^FO${o.x},${o.y}^GB${o.width},${o.height},${t},B,${rIndex}^FS`;
    }

    case "line": {
      const o = el.options;
      const t = o.thickness ?? 1;
      if (o.y1 === o.y2) {
        const w = Math.abs(o.x2 - o.x1);
        return `^FO${Math.min(o.x1, o.x2)},${o.y1}^GB${w},${t},${t}^FS`;
      }
      if (o.x1 === o.x2) {
        const h = Math.abs(o.y2 - o.y1);
        return `^FO${o.x1},${Math.min(o.y1, o.y2)}^GB${t},${h},${t}^FS`;
      }
      const w = Math.abs(o.x2 - o.x1);
      const h = Math.abs(o.y2 - o.y1);
      const dir = o.x2 > o.x1 === o.y2 > o.y1 ? "R" : "L";
      return `^FO${Math.min(o.x1, o.x2)},${Math.min(o.y1, o.y2)}^GD${w},${h},${t},B,${dir}^FS`;
    }

    case "circle": {
      const o = el.options;
      const t = o.thickness ?? 1;
      return `^FO${o.x},${o.y}^GC${o.diameter},${t},B^FS`;
    }

    case "barcode": {
      const o = el.options;
      const x = o.x ?? 0;
      const y = o.y ?? 0;
      if (el.symbology === "code128") {
        // ^BY moduleWidth, ratio, height
        const mw = o.moduleWidth ?? 2;
        const ratio = o.ratio ?? 2;
        const h = o.height ?? 80;
        // ^BC rotation, height, interpretable, interpretableLineAbove
        const rot = zplRotation(o.rotation ?? 0);
        const readable = o.readable === false ? "N" : "Y";
        const fs = o.fontSize ?? 2;
        return `^FO${x},${y}^BY${mw},${ratio},${h}^BC${rot},${readable},N,${fs},^FH_^FD${encodeZPLData(el.content)}^FS`;
      }
      // Non-native 1D → rasterize and emit as ^GFA
      const bitmap = rasterizeElement(el);
      return `^FO${x},${y}^GFA,${bitmap.data.length},${bitmap.data.length},${bitmap.bytesPerRow},${bytesToHex(bitmap.data)}^FS`;
    }

    case "qrcode": {
      const o = el.options;
      const x = o.x ?? 0;
      const y = o.y ?? 0;
      // ^BQ orientation, model, magnification, errorCorrection
      const rot = zplRotation(o.rotation ?? 0);
      const ecc = o.ecc ?? "M";
      const cw = o.cellSize ?? 6;
      return `^FO${x},${y}^BQ${rot},${ecc},${cw},${ecc}^FH_^FD${encodeZPLData(el.content)}^FS`;
    }

    case "matrix": {
      const o = el.options;
      const x = o.x ?? 0;
      const y = o.y ?? 0;
      const bitmap = rasterizeElement(el);
      return `^FO${x},${y}^GFA,${bitmap.data.length},${bitmap.data.length},${bitmap.bytesPerRow},${bytesToHex(bitmap.data)}^FS`;
    }

    case "ellipse":
    case "reverse":
    case "erase":
      return "";
    case "raw":
      return typeof el.content === "string" ? el.content : "";
  }
}

/** Compile a resolved label to ZPL II command string */
export function compileToZPL(label: ResolvedLabel): string {
  const lines: string[] = [];

  lines.push("^XA");
  lines.push(`^PW${label.widthDots}`);
  if (label.heightDots > 0) {
    lines.push(`^LL${label.heightDots}`);
  }
  if (label.marginDots > 0) {
    lines.push(`^ML${label.marginDots}`);
  }
  lines.push(`^PR${label.speed}`);
  lines.push(`~SD${label.density * 2}`);
  lines.push("^CI28");

  for (const el of label.elements) {
    lines.push(compileElement(el, label.fontBase, label.font0Mode, label.dpi));
  }

  lines.push(`^PQ${label.copies}`);
  lines.push("^XZ");
  return lines.join("\n") + "\n";
}
