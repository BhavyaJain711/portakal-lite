import type { LabelElement, ResolvedLabel } from "../types.js";
import { bytesToTSC, rasterizeElement } from "../raster.js";

/**
 * TSC/TSPL2 compiler. Command generation is identical to portakal; the
 * difference is `sanitizeTSCString()` which prevents command injection via
 * TEXT/BLOCK content (quotes and control characters that would break out of
 * the quoted string and inject commands like CLS or PRINT).
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

function compileElement(
  el: LabelElement,
  font0Mode: "multiplier" | "points",
): string {
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
      const xMul = isScalable && font0Mode === "points" ? size : (o.xScale ?? size);
      const yMul = isScalable && font0Mode === "points" ? size : (o.yScale ?? size);
      if (o.maxWidth) {
        const align = o.align === "center" ? 2 : o.align === "right" ? 3 : 1;
        const spacing = o.lineSpacing ?? 0;
        const height = o.maxHeight ?? o.maxWidth;
        return `BLOCK ${x},${y},${o.maxWidth},${height},"${font}",${rotation},${xMul},${yMul},${spacing},${align},"${sanitizeTSCString(el.content)}"`;
      }

      return `TEXT ${x},${y},"${font}",${rotation},${xMul},${yMul},"${sanitizeTSCString(el.content)}"`;
    }

    case "image": {
      const o = el.options;
      const x = o.x ?? 0;
      const y = o.y ?? 0;
      const bmp = el.bitmap;
      return `BITMAP ${x},${y},${bmp.bytesPerRow},${bmp.height},0,`;
    }

    case "box": {
      const o = el.options;
      const x2 = o.x + o.width;
      const y2 = o.y + o.height;
      const t = o.thickness ?? 1;
      if (o.radius) {
        return `BOX ${o.x},${o.y},${x2},${y2},${t},${o.radius}`;
      }
      return `BOX ${o.x},${o.y},${x2},${y2},${t}`;
    }

    case "line": {
      const o = el.options;
      const t = o.thickness ?? 1;
      if (o.y1 === o.y2) {
        const w = Math.abs(o.x2 - o.x1);
        return `BAR ${Math.min(o.x1, o.x2)},${o.y1},${w},${t}`;
      }
      if (o.x1 === o.x2) {
        const h = Math.abs(o.y2 - o.y1);
        return `BAR ${o.x1},${Math.min(o.y1, o.y2)},${t},${h}`;
      }
      return `DIAGONAL ${o.x1},${o.y1},${o.x2},${o.y2},${t}`;
    }

    case "circle": {
      const o = el.options;
      const t = o.thickness ?? 1;
      return `CIRCLE ${o.x},${o.y},${o.diameter},${t}`;
    }

    case "ellipse": {
      const o = el.options;
      const t = o.thickness ?? 1;
      return `ELLIPSE ${o.x},${o.y},${o.width},${o.height},${t}`;
    }

    case "reverse": {
      const o = el.options;
      return `REVERSE ${o.x},${o.y},${o.width},${o.height}`;
    }

    case "erase": {
      const o = el.options;
      return `ERASE ${o.x},${o.y},${o.width},${o.height}`;
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
        return `BARCODE ${x},${y},"128",${height},${readable},${rotation},${narrow},${wide},"${sanitizeTSCString(el.content)}"`;
      }
      // Non-native 1D → rasterize and emit as BITMAP
      const bitmap = rasterizeElement(el);
      return `BITMAP ${x},${y},${bitmap.bytesPerRow},${bitmap.height},0,${bytesToTSC(bitmap.data)}`;
    }

    case "qrcode": {
      const o = el.options;
      const x = o.x ?? 0;
      const y = o.y ?? 0;
      // TSC QRCODE: x,y,ECC,cellwidth,mode,rotation,"content"
      // ECC (L/M/Q/H) and mode (A/M) are NOT quoted in TSPL.
      const ecc = o.ecc ?? "M";
      const cellWidth = o.cellSize ?? 6;
      const rotation = o.rotation ?? 0;
      return `QRCODE ${x},${y},${ecc},${cellWidth},A,${rotation},"${sanitizeTSCString(el.content)}"`;
    }

    case "matrix": {
      // Raster path — emit the bitmap as a TSC BITMAP command.
      const o = el.options;
      const x = o.x ?? 0;
      const y = o.y ?? 0;
      const bitmap = rasterizeElement(el);
      return `BITMAP ${x},${y},${bitmap.bytesPerRow},${bitmap.height},0,${bytesToTSC(bitmap.data)}`;
    }

    case "raw":
      return typeof el.content === "string" ? el.content : "";
  }
}

/** Compile a resolved label to TSC/TSPL2 command string */
export function compileToTSC(label: ResolvedLabel): string {
  const lines: string[] = [];
  const dpi = label.dpi;
  const wMM = Math.round((label.widthDots / dpi) * 25.4);
  const hMM = label.heightDots > 0 ? Math.round((label.heightDots / dpi) * 25.4) : 0;
  const gMM = Math.round((label.gapDots / dpi) * 25.4);

  lines.push(`SIZE ${wMM} mm,${hMM} mm`);
  lines.push(`GAP ${gMM} mm,0 mm`);
  lines.push(`SPEED ${label.speed}`);
  lines.push(`DENSITY ${label.density}`);
  lines.push(`DIRECTION ${label.direction}`);
  lines.push("CLS");

  for (const el of label.elements) {
    lines.push(compileElement(el, label.font0Mode));
  }

  lines.push(`PRINT ${label.copies}`);
  return lines.join("\r\n") + "\r\n";
}
