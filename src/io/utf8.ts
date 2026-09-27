/**
 * Strict UTF-8 decoding at the boundary (contract 1.11.0, docs/adr/0026).
 *
 * Responsibility: every text input (the genotype file, samples.csv,
 * markers.csv, a custom token profile) is UTF-8, and a byte sequence outside
 * Unicode Table 3-7 is an error naming the file and the physical line, never
 * a silent U+FFFD. The happy path is one fatal `TextDecoder` call; the
 * byte-level validator runs only after that call has failed, to locate the
 * first ill-formed sequence. A leading byte-order mark is decoded as U+FEFF
 * (`ignoreBOM: true`) and stripped by the caller from the first line only, so
 * a U+FEFF starting a later line is data.
 *
 * Interface: class InvalidUtf8Error { line, position, byte },
 * firstInvalidUtf8(bytes, start?) -> number, locateInvalidUtf8(bytes,
 * lineOffset) -> { line, position, byte }, decodeUtf8(bytes, label) -> string.
 */

/** An ill-formed UTF-8 sequence; `line` and `position` (bytes within the line) are 1-based. */
export class InvalidUtf8Error extends Error {
  readonly line: number;
  readonly position: number;
  readonly byte: number;

  constructor(label: string, line: number, position: number, byte: number) {
    const hh = byte.toString(16).toUpperCase().padStart(2, '0');
    super(`${label} line ${line}: not valid UTF-8 (byte 0x${hh} at position ${position})`);
    this.name = 'InvalidUtf8Error';
    this.line = line;
    this.position = position;
    this.byte = byte;
  }
}

/**
 * Index of the lead byte of the first sequence outside Unicode Table 3-7, or -1 when
 * `bytes` is well-formed from `start`. A sequence running past the end is ill-formed.
 */
export function firstInvalidUtf8(bytes: Uint8Array, start = 0): number {
  const n = bytes.length;
  let i = start;
  while (i < n) {
    const b = bytes[i] as number;
    if (b < 0x80) {
      i++;
      continue;
    }
    let need: number;
    let lo = 0x80;
    let hi = 0xbf;
    if (b >= 0xc2 && b <= 0xdf) need = 1;
    else if (b >= 0xe0 && b <= 0xef) {
      need = 2;
      if (b === 0xe0) lo = 0xa0;
      else if (b === 0xed) hi = 0x9f;
    } else if (b >= 0xf0 && b <= 0xf4) {
      need = 3;
      if (b === 0xf0) lo = 0x90;
      else if (b === 0xf4) hi = 0x8f;
    } else return i;
    if (i + need >= n) return i;
    const second = bytes[i + 1] as number;
    if (second < lo || second > hi) return i;
    for (let k = 2; k <= need; k++) {
      const c = bytes[i + k] as number;
      if (c < 0x80 || c > 0xbf) return i;
    }
    i += need + 1;
  }
  return -1;
}

/** The physical line (after `lineOffset` earlier lines), position and value of the first ill-formed byte. */
export function locateInvalidUtf8(
  bytes: Uint8Array,
  lineOffset: number,
): { line: number; position: number; byte: number } {
  const off = firstInvalidUtf8(bytes);
  if (off === -1) throw new Error('locateInvalidUtf8: bytes are well-formed');
  let newlines = 0;
  let lastNl = -1;
  for (let i = 0; i < off; i++) {
    if (bytes[i] === 0x0a) {
      newlines++;
      lastNl = i;
    }
  }
  return { line: lineOffset + newlines + 1, position: off - lastNl, byte: bytes[off] as number };
}

const strict = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** `bytes` decoded strictly, less one leading U+FEFF; throws InvalidUtf8Error naming `label`. */
export function decodeUtf8(bytes: Uint8Array, label: string): string {
  let text: string;
  try {
    text = strict.decode(bytes);
  } catch {
    const at = locateInvalidUtf8(bytes, 0);
    throw new InvalidUtf8Error(label, at.line, at.position, at.byte);
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
