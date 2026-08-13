/**
 * Receipt layout helpers — build aligned text lines for receipts or labels.
 * Copied verbatim from portakal (https://github.com/productdevbook/portakal) — MIT.
 * Pure string padding/truncation; output feeds into .text() which sanitizes.
 */

/** Column definition for table layout */
export interface Column {
  /** Column width in characters */
  width: number;
  /** Text alignment within column */
  align?: "left" | "center" | "right";
}

/** Row helper: format text for same-line left+right (or multi-column) alignment */
export function formatRow(columns: Column[], values: string[], totalWidth: number): string {
  if (columns.length === 0 || values.length === 0) return "";

  // If no explicit widths, auto-distribute
  let assignedWidth = 0;
  let autoCount = 0;
  for (const col of columns) {
    if (col.width > 0) {
      assignedWidth += col.width;
    } else {
      autoCount++;
    }
  }
  const autoWidth = autoCount > 0 ? Math.floor((totalWidth - assignedWidth) / autoCount) : 0;

  const parts: string[] = [];
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i]!;
    const val = values[i] ?? "";
    const w = col.width > 0 ? col.width : autoWidth;
    parts.push(alignText(val, w, col.align ?? "left"));
  }

  return parts.join("");
}

/** Format a simple left+right pair on one line (most common receipt pattern) */
export function formatPair(left: string, right: string, totalWidth: number): string {
  const rightLen = right.length;
  const leftLen = totalWidth - rightLen;
  if (leftLen <= 0) return right.slice(0, totalWidth);
  return padRight(left, leftLen) + right;
}

/** Format a table with headers and rows */
export function formatTable(columns: Column[], rows: string[][], totalWidth: number): string[] {
  return rows.map((row) => formatRow(columns, row, totalWidth));
}

/** Create a separator/divider line */
export function separator(char: string, totalWidth: number): string {
  return char.repeat(totalWidth);
}

/** Word-wrap text at word boundaries */
export function wordWrap(text: string, maxWidth: number): string[] {
  if (text.length <= maxWidth) return [text];

  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= maxWidth) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current.length > 0) {
    lines.push(current);
  }

  return lines;
}

function alignText(text: string, width: number, align: "left" | "center" | "right"): string {
  const truncated = text.length > width ? text.slice(0, width) : text;
  const padding = width - truncated.length;

  switch (align) {
    case "right":
      return " ".repeat(padding) + truncated;
    case "center": {
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      return " ".repeat(leftPad) + truncated + " ".repeat(rightPad);
    }
    default:
      return truncated + " ".repeat(padding);
  }
}

function padRight(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  return text + " ".repeat(width - text.length);
}
