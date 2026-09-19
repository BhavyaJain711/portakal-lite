/**
 * Render a compiled TSC/TSPL2 byte stream for display.
 *
 * A label's command bytes are ASCII, but an embedded `BITMAP` payload is raw
 * binary. Decoding the whole stream as text — or letting a `Uint8Array` reach
 * `String()` — produces mojibake, because bytes ≥ 0x80 and invalid UTF-8
 * sequences are not text. This formatter keeps the commands readable and elides
 * the binary runs, so the result is always safe to show in a UI or a log.
 *
 * It is a *display* helper only: never send its output to a printer in place of
 * the bytes returned by `compileToTSC` / `tsc.compile`.
 */

/** A non-printable run at least this long is collapsed into one marker. */
const BINARY_RUN_COLLAPSE = 32;

const BITMAP_PREFIX = "BITMAP ";

interface BitmapSpan {
  /** Offset of the raw payload — the header text ends exactly here. */
  payloadStart: number;
  /** Payload size in bytes (`width_in_bytes × height`). */
  payloadLength: number;
  /** Offset just past the payload. */
  end: number;
}

/** Bytes that render as-is: printable ASCII plus CR/LF. */
function isText(b: number): boolean {
  return b === 0x0a || b === 0x0d || (b >= 0x20 && b <= 0x7e);
}

function hex2(b: number): string {
  return b.toString(16).padStart(2, "0").toUpperCase();
}

/** Read an unsigned decimal integer at `pos`, advancing past it. */
function readInt(bytes: Uint8Array, pos: number): { value: number; next: number } | null {
  let i = pos;
  let value = 0;
  while (i < bytes.length && bytes[i]! >= 0x30 && bytes[i]! <= 0x39) {
    value = value * 10 + (bytes[i]! - 0x30);
    i++;
  }
  return i === pos ? null : { value, next: i };
}

/**
 * Detect a `BITMAP x,y,width,height,mode,` header at `pos` and locate its raw
 * payload. Requires a line start, so the literal word "BITMAP" inside `TEXT`
 * content can never be mistaken for a command.
 */
function readBitmap(bytes: Uint8Array, pos: number): BitmapSpan | null {
  if (pos > 0 && bytes[pos - 1]! !== 0x0a && bytes[pos - 1]! !== 0x0d) return null;
  if (pos + BITMAP_PREFIX.length > bytes.length) return null;
  for (let k = 0; k < BITMAP_PREFIX.length; k++) {
    if (bytes[pos + k] !== BITMAP_PREFIX.charCodeAt(k)) return null;
  }

  let p = pos + BITMAP_PREFIX.length;
  const nums: number[] = [];
  for (let n = 0; n < 5; n++) {
    const read = readInt(bytes, p);
    if (!read) return null;
    nums.push(read.value);
    p = read.next;
    if (bytes[p] !== 0x2c) return null; // ','
    p++;
  }

  const payloadLength = nums[2]! * nums[3]!; // width_in_bytes × height
  if (!Number.isSafeInteger(payloadLength) || payloadLength <= 0) return null;
  const end = p + payloadLength;
  if (end > bytes.length) return null;
  return { payloadStart: p, payloadLength, end };
}

/**
 * Render a TSC/TSPL2 byte stream as display text: ASCII commands verbatim, a
 * `BITMAP` payload collapsed to `<N bytes of bitmap data>`, and any other
 * non-printable bytes escaped as `\xHH` (or collapsed when long).
 */
export function formatTSCBytes(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  while (i < bytes.length) {
    const bitmap = readBitmap(bytes, i);
    if (bitmap) {
      for (let k = i; k < bitmap.payloadStart; k++) out += String.fromCharCode(bytes[k]!);
      out += `<${bitmap.payloadLength} bytes of bitmap data>`;
      i = bitmap.end;
      continue;
    }
    if (isText(bytes[i]!)) {
      out += String.fromCharCode(bytes[i]!);
      i++;
      continue;
    }
    let j = i;
    while (j < bytes.length && !isText(bytes[j]!)) j++;
    if (j - i >= BINARY_RUN_COLLAPSE) {
      out += `<${j - i} bytes of binary data>`;
    } else {
      for (let k = i; k < j; k++) out += `\\x${hex2(bytes[k]!)}`;
    }
    i = j;
  }
  return out;
}
