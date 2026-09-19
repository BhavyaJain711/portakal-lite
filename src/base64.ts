/**
 * Byte ↔ text codecs for carrying a compiled printer stream across transports.
 *
 * TSC output is binary (a `BITMAP` payload is raw pixels), so it cannot be
 * handed to a UTF-8 string API. Where a transport only accepts a `string`,
 * base64 is the lossless wrapper; the transport decodes it back to bytes before
 * anything reaches the printer. Transports that accept bytes need none of this.
 *
 * Hand-rolled and dependency-free (no `Buffer`, `btoa`/`atob`, or
 * `TextDecoder("latin1")`) so it runs unchanged in Node, browsers, Deno, and
 * React Native's Hermes.
 */

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Base64 sextet value; '=' (or anything unknown) contributes zero bits. */
function sextet(ch: string): number {
  const value = BASE64_CHARS.indexOf(ch);
  return value < 0 ? 0 : value;
}

/** Encode bytes as standard base64. */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out +=
      BASE64_CHARS[(n >> 18) & 63]! +
      BASE64_CHARS[(n >> 12) & 63]! +
      BASE64_CHARS[(n >> 6) & 63]! +
      BASE64_CHARS[n & 63]!;
  }
  const remainder = bytes.length - i;
  if (remainder === 1) {
    const n = bytes[i]! << 16;
    out += BASE64_CHARS[(n >> 18) & 63]! + BASE64_CHARS[(n >> 12) & 63]! + "==";
  } else if (remainder === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out +=
      BASE64_CHARS[(n >> 18) & 63]! +
      BASE64_CHARS[(n >> 12) & 63]! +
      BASE64_CHARS[(n >> 6) & 63]! +
      "=";
  }
  return out;
}

/** Decode standard base64 (optionally a `data:` URL) without Buffer/atob. */
export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/^data:[^;]*;base64,/, "").replace(/[^A-Za-z0-9+/=]/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  const out = new Uint8Array((clean.length / 4) * 3 - padding);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (sextet(clean[i]!) << 18) |
      (sextet(clean[i + 1]!) << 12) |
      (sextet(clean[i + 2]!) << 6) |
      sextet(clean[i + 3]!);
    if (o < out.length) out[o++] = (n >> 16) & 0xff;
    if (o < out.length) out[o++] = (n >> 8) & 0xff;
    if (o < out.length) out[o++] = n & 0xff;
  }
  return out;
}

/**
 * Split bytes into chunks of `size` on byte boundaries — for links with an MTU
 * (BLE, serial). Each chunk is a view into the same buffer, so encode or send
 * each one; do not reassemble encoded chunks from a split string.
 */
export function chunkBytes(bytes: Uint8Array, size: number): Uint8Array[] {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`chunk size must be a positive integer, got ${String(size)}`);
  }
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) {
    chunks.push(bytes.subarray(i, Math.min(i + size, bytes.length)));
  }
  return chunks;
}
