/**
 * TSC/TSPL2 language module — compile + preview.
 * Preview code copied from portakal (https://github.com/productdevbook/portakal) — MIT.
 * parse/validate are intentionally omitted from this package.
 */

import type { LabelBuilder } from "../builder.js";
import type { LabelElement, ResolvedLabel } from "../types.js";
import { TSC_DOT_FONTS } from "../types.js";
import { compileToTSC } from "../languages/tsc.js";
import { monochromeToSvgPath, rasterizeElement } from "../raster.js";
import { formatTSCBytes } from "../tsctext.js";

/** TSC font pixel dimensions: shared table (fonts 1–8 fixed-pitch). */
const TSC_FONTS: Record<string, { w: number; h: number }> = TSC_DOT_FONTS;

/**
 * Width-to-height ratio of a typical SVG/browser monospace font glyph.
 * This is a rendering constant — independent of the printer's font metrics.
 */
const SVG_MONO_WIDTH_FACTOR = 0.6;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function tscFontSize(
  font: string | undefined,
  size: number | undefined,
  yScale: number | undefined,
  font0Mode: "multiplier" | "points",
  dpi: number,
  fontBase: { width: number; height: number },
): number {
  const f = TSC_FONTS[font ?? "2"];
  if (f) return f.h * (yScale ?? size ?? 1);
  // Font "0" (scalable): size unit follows the printer's font0Mode.
  if (font0Mode === "points") return round2((size ?? 12) * (dpi / 72));
  return fontBase.height * (size ?? 1);
}

/** Horizontal glyph stretch for the preview: desired printer char width ÷ SVG monospace char width. */
function tscXStretch(
  font: string | undefined,
  size: number | undefined,
  xScale: number | undefined,
  font0Mode: "multiplier" | "points",
  dpi: number,
  fontBase: { width: number; height: number },
  charWidthFactor: number,
): number {
  const fs = tscFontSize(font, size, size, font0Mode, dpi, fontBase);
  // SVG monospace char width is always based on the browser font's fixed ratio.
  const svgCharWidth = Math.max(1, fs * SVG_MONO_WIDTH_FACTOR);

  const f = TSC_FONTS[font ?? "2"];
  if (f) {
    // Fixed-pitch dot fonts (1–8): desired width is xScale multiplier × base dot width.
    const targetW = (xScale ?? size ?? 1) * f.w;
    return round2(targetW / svgCharWidth);
  }

  // Font "0" (scalable): target width uses the printer's charWidthFactor.
  const targetW = font0Mode === "points"
    ? (xScale ?? size ?? 1) * (dpi / 72) * charWidthFactor
    : (xScale ?? size ?? 1) * fontBase.width;
  return round2(targetW / svgCharWidth);
}

function renderElement(
  el: LabelElement,
  font0Mode: "multiplier" | "points",
  dpi: number,
  fontBase: { width: number; height: number },
  defaultCharWidthFactor: number,
): string {
  switch (el.type) {
    case "text": {
      const o = el.options;
      const x = o.x ?? 0;
      const y = o.y ?? 0;
      const charWidthFactor = o.charWidthFactor ?? defaultCharWidthFactor;
      const fs = round2(tscFontSize(o.font, o.size, o.yScale, font0Mode, dpi, fontBase));
      // Rendered glyph width in the local (pre-stretch) frame. The SVG always
      // draws monospace, so this is the browser's advance — not the printer's
      // charWidthFactor estimate.
      const cw = fs * SVG_MONO_WIDTH_FACTOR;
      const stretch = tscXStretch(o.font, o.size, o.xScale, font0Mode, dpi, fontBase, charWidthFactor);
      const weight = o.bold ? "bold" : "normal";
      const rot = o.rotation ? ` rotate(${o.rotation} ${x} ${y})` : "";

      // With `maxWidth` (BLOCK) the printer aligns inside that box, so anchor
      // within it too. Without it, `x` is already the aligned left edge — the
      // printer has no alignment without BLOCK — so draw from x directly;
      // re-anchoring here double-corrects and shifts the text left.
      let anchor = "";
      let textX = 0;
      if (o.maxWidth && o.align === "center") {
        anchor = ' text-anchor="middle"';
        textX = round2((o.maxWidth / 2) / stretch);
      } else if (o.maxWidth && o.align === "right") {
        anchor = ' text-anchor="end"';
        textX = round2(o.maxWidth / stretch);
      }

      const baseline = round2(fs * 0.85);
      const innerText =
        `<text x="${textX}" y="${baseline}" fill="${o.reverse ? "#fff" : "#000"}" font-size="${fs}" font-weight="${weight}" font-family="monospace"${anchor}>${escapeXml(el.content)}</text>`;

      // Reverse text: the black rect must also sit in the stretched frame so it
      // widens with the glyphs (tw uses the unscaled width).
      const inner = o.reverse
        ? `<rect x="-1" y="-1" width="${round2(el.content.length * cw + 2)}" height="${round2(fs + 2)}" fill="#000"/>${innerText}`
        : innerText;

      // Horizontal glyph stretch (BarTender-style X-only scaling). The outer
      // group translates to the visual origin and scales the x-axis; the inner
      // text uses pre-stretch coordinates. Rotation applies around the origin.
      return `<g transform="translate(${x}, ${y})${stretch !== 1 ? ` scale(${stretch}, 1)` : ""}"${rot}>${inner}</g>`;
    }

    case "image": {
      const o = el.options;
      const x = o.x ?? 0;
      const y = o.y ?? 0;
      // BITMAP prints the raster at its own pixel dimensions — there is no
      // scaling — so the preview must not stretch it to the cell bounds.
      // Draw it 1:1 at x,y as one path (cheap to parse, faithful to the print).
      return `<g transform="translate(${x}, ${y})"><path d="${monochromeToSvgPath(el.bitmap)}" fill="#000"/></g>`;
    }

    case "box": {
      const o = el.options;
      const t = o.thickness ?? 1;
      const rx = o.radius ?? 0;
      // TSC BOX: coordinates are outer boundary, border draws inward
      if (t >= Math.min(o.width, o.height)) {
        return `<rect x="${o.x}" y="${o.y}" width="${o.width}" height="${o.height}" fill="#000" rx="${rx}"/>`;
      }
      return `<rect x="${o.x + t / 2}" y="${o.y + t / 2}" width="${o.width - t}" height="${o.height - t}" fill="none" stroke="#000" stroke-width="${t}" rx="${rx}"/>`;
    }

    case "line": {
      const o = el.options;
      const t = o.thickness ?? 1;
      // TSC BAR: filled rectangle
      if (o.y1 === o.y2) {
        return `<rect x="${Math.min(o.x1, o.x2)}" y="${o.y1}" width="${Math.abs(o.x2 - o.x1)}" height="${t}" fill="#000"/>`;
      }
      if (o.x1 === o.x2) {
        return `<rect x="${o.x1}" y="${Math.min(o.y1, o.y2)}" width="${t}" height="${Math.abs(o.y2 - o.y1)}" fill="#000"/>`;
      }
      return `<line x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" stroke="#000" stroke-width="${t}"/>`;
    }

    case "circle": {
      const o = el.options;
      const t = o.thickness ?? 1;
      const r = o.diameter / 2;
      if (t >= r) return `<circle cx="${o.x + r}" cy="${o.y + r}" r="${r}" fill="#000"/>`;
      return `<circle cx="${o.x + r}" cy="${o.y + r}" r="${r - t / 2}" fill="none" stroke="#000" stroke-width="${t}"/>`;
    }

    case "ellipse": {
      const o = el.options;
      const t = o.thickness ?? 1;
      return `<ellipse cx="${o.x + o.width / 2}" cy="${o.y + o.height / 2}" rx="${o.width / 2}" ry="${o.height / 2}" fill="none" stroke="#000" stroke-width="${t}"/>`;
    }

    case "reverse": {
      const o = el.options;
      return `<rect x="${o.x}" y="${o.y}" width="${o.width}" height="${o.height}" fill="#000"/>`;
    }

    case "erase": {
      const o = el.options;
      return `<rect x="${o.x}" y="${o.y}" width="${o.width}" height="${o.height}" fill="#fff"/>`;
    }

    case "barcode":
    case "qrcode":
    case "matrix": {
      // Real rendering: rasterize via etiket (same as the compiler) and draw
      // the actual 1-bit pixels, so the preview matches what prints.
      const o = el.options;
      const x = o.x ?? 0;
      const y = o.y ?? 0;
      const bmp = rasterizeElement(el);
      const step = Math.max(1, Math.floor(Math.max(bmp.width, bmp.height) / 100));
      let svg = "";
      for (let py = 0; py < bmp.height; py += step) {
        for (let px = 0; px < bmp.width; px += step) {
          const byteIdx = py * bmp.bytesPerRow + Math.floor(px / 8);
          const bitIdx = 7 - (px % 8);
          if ((bmp.data[byteIdx]! >> bitIdx) & 1) {
            svg += `<rect x="${x + px}" y="${y + py}" width="${step}" height="${step}" fill="#000"/>`;
          }
        }
      }
      // Human-readable text below the symbol (matches printer behavior).
      const content = el.type === "barcode" || el.type === "qrcode" ? el.content : "";
      const showText =
        el.type === "barcode"
          ? (o as { readable?: boolean }).readable !== false
          : !!(o as { showText?: boolean }).showText;
      if (content && showText) {
        svg += `<text x="${x + bmp.width / 2}" y="${y + bmp.height + 12}" text-anchor="middle" fill="#000" font-size="10" font-family="monospace">${escapeXml(content)}</text>`;
      }
      return svg;
    }

    case "raw":
      return "";
  }
}

function renderPreviewSVG(resolved: ResolvedLabel): string {
  const w = resolved.widthDots;
  const h = resolved.heightDots > 0 ? resolved.heightDots : 400;
  const pad = 10;
  const svgW = w + pad * 2;
  const svgH = h + pad * 2;

  let els = "";
  for (const el of resolved.elements) {
    els += renderElement(el, resolved.font0Mode, resolved.dpi, resolved.fontBase, resolved.charWidthFactor);
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}">`,
    `<rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#f5f5f4" rx="4"/>`,
    `<rect x="${pad}" y="${pad}" width="${w}" height="${h}" fill="#fff" stroke="#e5e5e5" stroke-width="1" rx="2"/>`,
    `<g transform="translate(${pad},${pad})">`,
    els,
    "</g>",
    `<text x="${svgW / 2}" y="${svgH - 1}" text-anchor="middle" fill="#a1a1aa" font-size="8" font-family="monospace">${w}×${h} dots (${resolved.dpi} DPI) — TSC</text>`,
    "</svg>",
  ].join("\n");
}

/** TSC language module */
export const tsc = {
  /** Compile label to TSC/TSPL2 binary (Uint8Array with raw BITMAP data) */
  compile(builder: LabelBuilder): Uint8Array {
    const resolved = builder.resolve();
    return compileToTSC(resolved, { lineEnding: resolved.lineEnding });
  },

  /**
   * Render the compiled stream for display: ASCII commands with any BITMAP
   * payload elided. Show this; send `compile()`.
   */
  text(builder: LabelBuilder): string {
    return formatTSCBytes(tsc.compile(builder));
  },

  /** Render label preview with TSC-specific font metrics */
  preview(builder: LabelBuilder): string {
    return renderPreviewSVG(builder.resolve());
  },

  /** Render from resolved label */
  previewResolved(resolved: ResolvedLabel): string {
    return renderPreviewSVG(resolved);
  },
};
