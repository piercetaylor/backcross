/**
 * Compressed input handling.
 *
 * Responsibility: detect gzip/bgzip input by magic bytes and inflate it to
 * text. bgzip files are concatenated gzip members; fflate's one-shot
 * gunzipSync stops after the first member, so the streaming Gunzip class is
 * used (multi-member support since fflate 0.8.0 per its CHANGELOG). The
 * browser bundle and the Node CLI share this module.
 *
 * Interface: isGzip(bytes), gunzipAll(bytes) -> Uint8Array, bytesToText(bytes) -> string.
 */
import { Gunzip } from 'fflate';

export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

export function gunzipAll(bytes: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const stream = new Gunzip((chunk) => {
    chunks.push(chunk);
    total += chunk.length;
  });
  stream.push(bytes, true);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

const decoder = new TextDecoder('utf-8');

export function bytesToText(bytes: Uint8Array): string {
  const raw = isGzip(bytes) ? gunzipAll(bytes) : bytes;
  return decoder.decode(raw);
}
