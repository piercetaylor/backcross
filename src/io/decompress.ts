/**
 * Compressed input handling.
 *
 * Responsibility: detect gzip/bgzip input by magic bytes and inflate it to
 * text, verifying every gzip member's CRC32 and ISIZE trailer and rejecting
 * a truncated stream. fflate inflates; framing and verification are done
 * here, because fflate's streaming `Gunzip` checks neither trailer and ends
 * cleanly at any member boundary, so a corrupted or cut file would otherwise
 * load as wrong or shorter data with no error. The browser bundle and the
 * Node CLI share this module, and the synchronous (`gunzipAll`) and
 * streaming (`inflateIfGzip`) entries share one reader, `GzipReader`.
 *
 * `GzipReader` buffers until the first member's header shows whether it
 * carries the BGZF `BC` extra subfield (SAM specification, hts-specs
 * SAMv1.tex), then stays in one of two modes for the whole stream:
 *
 * - BGZF: each member is framed exactly by its BSIZE, taken whole (at most
 *   64 KiB), its raw deflate data inflated with fflate's `inflateSync`, and
 *   the output checked against the member's CRC32 and ISIZE. Every member
 *   must carry `BC`; empty members mid-stream are accepted (concatenated
 *   bgzip files contain them). The stream must end with the 28-byte BGZF
 *   end-of-file block, byte for byte as htslib checks it; otherwise it was
 *   cut between blocks and is rejected as truncated. Bytes left over at the
 *   end are a member cut in the middle, also rejected.
 * - Plain gzip (one or more members): fflate's streaming `Gunzip` inflates,
 *   and its public `onmember(offset)` handler delimits members. `ondata`
 *   output is attributed to the current member (Gunzip finishes one member's
 *   output before announcing the next), a running CRC32 and length are kept
 *   per member, and at each `onmember` the previous member is checked against
 *   the 8 trailer bytes just before `offset`; the last member is checked
 *   against the last 8 bytes of the stream. Recent compressed bytes are
 *   retained (at least RETAIN_BYTES before the current chunk) so the trailer
 *   is still reachable when a long member header delays `onmember`. A stream
 *   cut inside deflate data is reported as truncated when fflate reports it;
 *   one cut inside a trailer cannot be told apart through Gunzip's public
 *   interface and fails the CRC32/ISIZE check instead, whose message names
 *   both causes. A stream cut exactly between two plain gzip members is
 *   indistinguishable from a complete shorter file; the gzip format has no
 *   end marker.
 *
 * Every integrity error names the compressed byte offset of the member that
 * failed. Memory is bounded by one member (BGZF) or RETAIN_BYTES plus one
 * chunk (plain gzip), plus the output not yet consumed; neither the
 * compressed nor the inflated file is held whole by the streaming entry.
 *
 * `inflateIfGzip` sniffs the magic bytes (buffering until two have arrived,
 * however small the first chunks), then either passes chunks through or
 * pushes each into one GzipReader and yields what it inflated.
 * `gunzipAll` and `bytesToText` serve HapMap, wide CSV and the synchronous
 * path with the same checks.
 *
 * Interface: isGzip(bytes), gunzipAll(bytes) -> Uint8Array, bytesToText(bytes) -> string,
 * inflateIfGzip(source: ByteSource) -> ByteSource, class GzipReader { push(chunk)
 * -> Uint8Array[]; finish() -> Uint8Array[] }, GzipIntegrityError, BGZF_EOF, crc32(bytes, crc?).
 */
import { Gunzip, inflateSync } from 'fflate';

import type { ByteSource } from './stream.ts';

export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/** The BGZF end-of-file marker: an empty member, 28 bytes (SAMv1.tex, section 4.1.2). */
export const BGZF_EOF = new Uint8Array([
  0x1f, 0x8b, 0x08, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0x06, 0x00, 0x42, 0x43, 0x02, 0x00,
  0x1b, 0x00, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

/** A gzip stream that is corrupt or truncated; the message names the member's compressed offset. */
export class GzipIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GzipIntegrityError';
  }
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

/** CRC-32 (ISO 3309, as gzip uses), continued from `crc`. */
export function crc32(bytes: Uint8Array, crc = 0): number {
  let c = ~crc;
  for (let i = 0; i < bytes.length; i++) {
    c = (CRC_TABLE[(c ^ (bytes[i] as number)) & 0xff] as number) ^ (c >>> 8);
  }
  return ~c >>> 0;
}

const EMPTY = new Uint8Array(0);
const FHCRC = 0x02;
const FEXTRA = 0x04;
const FNAME = 0x08;
const FCOMMENT = 0x10;
const FLG_RESERVED = 0xe0;
const TRAILER_BYTES = 8;
const MIN_MEMBER_BYTES = 10 + TRAILER_BYTES;
/** Compressed bytes kept behind the current chunk in plain mode, for delayed trailer lookup. */
const RETAIN_BYTES = 1 << 20;

function u16(b: Uint8Array, i: number): number {
  return (b[i] as number) | ((b[i + 1] as number) << 8);
}

function u32(b: Uint8Array, i: number): number {
  return (u16(b, i) | (u16(b, i + 2) << 16)) >>> 0;
}

function hex(n: number): string {
  return `0x${n.toString(16).padStart(8, '0')}`;
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** A FIFO of byte chunks with a running length; peek/take copy only when a request spans chunks. */
class ByteQueue {
  private parts: Uint8Array[] = [];
  private head = 0; // bytes of parts[0] already consumed
  length = 0;

  push(chunk: Uint8Array): void {
    if (chunk.length === 0) return;
    this.parts.push(chunk);
    this.length += chunk.length;
  }

  peek(n: number): Uint8Array {
    return this.read(n, false);
  }

  take(n: number): Uint8Array {
    return this.read(n, true);
  }

  private read(n: number, consume: boolean): Uint8Array {
    const first = this.parts[0];
    let out: Uint8Array;
    let used = 0; // whole parts consumed
    let head = this.head;
    if (first !== undefined && first.length - head >= n) {
      out = first.subarray(head, head + n);
      head += n;
      if (head === first.length) {
        used = 1;
        head = 0;
      }
    } else {
      out = new Uint8Array(n);
      let filled = 0;
      let i = 0;
      while (filled < n) {
        const part = this.parts[i] as Uint8Array;
        const from = i === 0 ? head : 0;
        const k = Math.min(n - filled, part.length - from);
        out.set(part.subarray(from, from + k), filled);
        filled += k;
        if (from + k === part.length) {
          used = i + 1;
          head = 0;
        } else {
          head = from + k;
        }
        i++;
      }
    }
    if (consume) {
      if (used > 0) this.parts.splice(0, used);
      this.head = head;
      this.length -= n;
    }
    return out;
  }

  drain(): Uint8Array[] {
    const out = this.parts.map((p, i) => (i === 0 ? p.subarray(this.head) : p));
    this.parts = [];
    this.head = 0;
    this.length = 0;
    return out;
  }
}

/**
 * Inspects the start of a gzip member at `offset`. Returns null when more bytes are
 * needed to see its FEXTRA field; otherwise the BGZF BSIZE, or null for `bsize` when
 * the member carries no BC subfield.
 */
function peekMember(q: ByteQueue, offset: number): { bsize: number | null } | null {
  if (q.length < 10) return null;
  const h = q.peek(10);
  if (h[0] !== 0x1f || h[1] !== 0x8b || h[2] !== 8) {
    throw new GzipIntegrityError(
      `gzip stream corrupt: no gzip member header at compressed byte ${offset}`,
    );
  }
  const flg = h[3] as number;
  if ((flg & FLG_RESERVED) !== 0) {
    throw new GzipIntegrityError(
      `gzip member at compressed byte ${offset} is corrupt: reserved header flag bits are set`,
    );
  }
  if ((flg & FEXTRA) === 0) return { bsize: null };
  if (q.length < 12) return null;
  const xlen = u16(q.peek(12), 10);
  if (q.length < 12 + xlen) return null;
  const extra = q.peek(12 + xlen).subarray(12);
  for (let p = 0; p + 4 <= extra.length;) {
    const slen = u16(extra, p + 2);
    if (extra[p] === 0x42 && extra[p + 1] === 0x43 && slen === 2 && p + 6 <= extra.length) {
      return { bsize: u16(extra, p + 4) };
    }
    p += 4 + slen;
  }
  return { bsize: null };
}

/** Length of the header of the complete member `m` (FEXTRA, FNAME, FCOMMENT, FHCRC). */
function headerLength(m: Uint8Array, offset: number): number {
  const flg = m[3] as number;
  let p = 10;
  if (flg & FEXTRA) p += 2 + u16(m, 10);
  for (const flag of [FNAME, FCOMMENT]) {
    if (flg & flag) {
      while (p < m.length && m[p] !== 0) p++;
      p++;
    }
  }
  if (flg & FHCRC) p += 2;
  if (p > m.length - TRAILER_BYTES) {
    throw new GzipIntegrityError(
      `gzip member at compressed byte ${offset} is corrupt: its header overruns its BSIZE`,
    );
  }
  return p;
}

function checkTrailer(
  offset: number,
  trailer: Uint8Array,
  crc: number,
  size: number,
  hint: string,
): void {
  const wantCrc = u32(trailer, 0);
  const wantSize = u32(trailer, 4);
  if (size !== wantSize) {
    throw new GzipIntegrityError(
      `gzip member at compressed byte ${offset}: ISIZE mismatch, trailer says ${wantSize} bytes but ${size} inflated${hint}`,
    );
  }
  if (crc !== wantCrc) {
    throw new GzipIntegrityError(
      `gzip member at compressed byte ${offset}: CRC32 mismatch, trailer says ${hex(wantCrc)} but data gives ${hex(crc)}${hint}`,
    );
  }
}

/**
 * Push-based verified gzip/BGZF reader. `push` returns the output completed so far;
 * `finish` flushes, verifies the end of the stream, and throws GzipIntegrityError if it
 * is truncated. Throws GzipIntegrityError on any corrupt member.
 */
export class GzipReader {
  private readonly queue = new ByteQueue();
  private mode: 'sniff' | 'bgzf' | 'plain' = 'sniff';
  private finished = false;

  // BGZF mode
  private offset = 0; // compressed offset of the queue's first byte
  private endsWithEof = false;
  private need = 0; // queue bytes the current member needs, once its BSIZE is known

  // plain mode
  private gunzip: Gunzip | null = null;
  private out: Uint8Array[] = [];
  private memberStart = 0;
  private crc = 0;
  private size = 0;
  private pushed = 0;
  private recent: Uint8Array[] = [];
  private recentStart = 0;

  push(chunk: Uint8Array): Uint8Array[] {
    if (this.finished) throw new Error('GzipReader: push after finish');
    if (this.mode === 'plain') return this.pushPlain(chunk, false);
    this.queue.push(chunk);
    if (this.queue.length < this.need) return [];
    if (this.mode === 'sniff') {
      const info = peekMember(this.queue, 0);
      if (info === null) return [];
      if (info.bsize === null) {
        this.mode = 'plain';
        const out: Uint8Array[] = [];
        for (const part of this.queue.drain()) out.push(...this.pushPlain(part, false));
        return out;
      }
      this.mode = 'bgzf';
    }
    return this.pullBlocks();
  }

  finish(): Uint8Array[] {
    if (this.finished) return [];
    this.finished = true;
    switch (this.mode) {
      case 'sniff':
        if (this.queue.length === 0) return [];
        throw new GzipIntegrityError(
          `gzip stream truncated: it ends inside the header of the member at compressed byte 0`,
        );
      case 'bgzf':
        if (this.queue.length > 0) {
          throw new GzipIntegrityError(
            `BGZF stream truncated: it ends inside the member at compressed byte ${this.offset} (${this.queue.length} bytes of it present)`,
          );
        }
        if (!this.endsWithEof) {
          throw new GzipIntegrityError(
            `BGZF stream truncated: it does not end with the 28-byte BGZF end-of-file block, so the file was cut short after the member ending at compressed byte ${this.offset}`,
          );
        }
        return [];
      case 'plain':
        return this.pushPlain(EMPTY, true);
    }
  }

  private pullBlocks(): Uint8Array[] {
    const out: Uint8Array[] = [];
    for (;;) {
      const info = peekMember(this.queue, this.offset);
      if (info === null) break;
      if (info.bsize === null) {
        throw new GzipIntegrityError(
          `BGZF stream corrupt: the member at compressed byte ${this.offset} has no BGZF BC field`,
        );
      }
      const total = info.bsize + 1;
      if (total < MIN_MEMBER_BYTES) {
        throw new GzipIntegrityError(
          `gzip member at compressed byte ${this.offset} is corrupt: BSIZE ${info.bsize} is too small`,
        );
      }
      if (this.queue.length < total) {
        this.need = total;
        break;
      }
      this.need = 0;
      const member = this.queue.take(total);
      const data = this.inflateMember(member, this.offset);
      this.endsWithEof = total === BGZF_EOF.length && member.every((b, i) => b === BGZF_EOF[i]);
      this.offset += total;
      if (data.length > 0) out.push(data);
    }
    return out;
  }

  private inflateMember(member: Uint8Array, offset: number): Uint8Array {
    const start = headerLength(member, offset);
    let data: Uint8Array;
    try {
      // No `out` option: a preallocated buffer would silently drop output past a wrong ISIZE.
      data = inflateSync(member.subarray(start, member.length - TRAILER_BYTES));
    } catch (e) {
      throw new GzipIntegrityError(
        `gzip member at compressed byte ${offset} is corrupt: deflate data invalid (${messageOf(e)})`,
      );
    }
    checkTrailer(
      offset,
      member.subarray(member.length - TRAILER_BYTES),
      crc32(data),
      data.length,
      '',
    );
    return data;
  }

  private pushPlain(chunk: Uint8Array, final: boolean): Uint8Array[] {
    if (this.gunzip === null) {
      this.gunzip = new Gunzip((data) => {
        if (data.length === 0) return;
        this.crc = crc32(data, this.crc);
        this.size = (this.size + data.length) >>> 0;
        this.out.push(data);
      });
      this.gunzip.onmember = (offset) => {
        if (offset - TRAILER_BYTES < this.memberStart + 10) {
          throw new GzipIntegrityError(
            `gzip member at compressed byte ${this.memberStart} is corrupt: next member begins inside it`,
          );
        }
        checkTrailer(
          this.memberStart,
          this.bytesAt(offset - TRAILER_BYTES, TRAILER_BYTES),
          this.crc,
          this.size,
          ' (the member is corrupt)',
        );
        this.memberStart = offset;
        this.crc = 0;
        this.size = 0;
      };
    }
    if (chunk.length > 0) this.retain(chunk);
    try {
      this.gunzip.push(chunk, final);
    } catch (e) {
      if (e instanceof GzipIntegrityError) throw e;
      const msg = messageOf(e);
      const cause = /unexpected EOF/i.test(msg)
        ? 'stream truncated inside its deflate data'
        : `deflate data invalid (${msg})`;
      throw new GzipIntegrityError(`gzip member at compressed byte ${this.memberStart}: ${cause}`);
    }
    if (final) {
      if (this.pushed - this.memberStart < MIN_MEMBER_BYTES) {
        throw new GzipIntegrityError(
          `gzip stream truncated: the member at compressed byte ${this.memberStart} is incomplete`,
        );
      }
      checkTrailer(
        this.memberStart,
        this.bytesAt(this.pushed - TRAILER_BYTES, TRAILER_BYTES),
        this.crc,
        this.size,
        ' (the member is corrupt, or the stream is truncated)',
      );
    }
    return this.out.splice(0);
  }

  private retain(chunk: Uint8Array): void {
    const before = this.pushed;
    this.recent.push(chunk);
    this.pushed += chunk.length;
    let drop = 0;
    while (drop < this.recent.length - 1) {
      const first = this.recent[drop] as Uint8Array;
      if (before - (this.recentStart + first.length) < RETAIN_BYTES) break;
      this.recentStart += first.length;
      drop++;
    }
    if (drop > 0) this.recent.splice(0, drop);
  }

  private bytesAt(pos: number, n: number): Uint8Array {
    if (pos < this.recentStart) {
      throw new GzipIntegrityError(
        `gzip member at compressed byte ${this.memberStart}: its trailer lies more than ${RETAIN_BYTES} bytes before the next member's data and cannot be verified`,
      );
    }
    const out = new Uint8Array(n);
    let base = this.recentStart;
    let filled = 0;
    for (const part of this.recent) {
      const end = base + part.length;
      const from = pos + filled;
      if (from < end && from >= base) {
        const k = Math.min(n - filled, end - from);
        out.set(part.subarray(from - base, from - base + k), filled);
        filled += k;
        if (filled === n) break;
      }
      base = end;
    }
    return out;
  }
}

export function gunzipAll(bytes: Uint8Array): Uint8Array {
  const reader = new GzipReader();
  const chunks = [...reader.push(bytes), ...reader.finish()];
  if (chunks.length === 1) return chunks[0] as Uint8Array;
  let total = 0;
  for (const c of chunks) total += c.length;
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

export function inflateIfGzip(source: ByteSource): ByteSource {
  return {
    async *[Symbol.asyncIterator]() {
      const iterator = source[Symbol.asyncIterator]();
      // Sniff: gather chunks until at least two bytes are known.
      let head: Uint8Array = EMPTY;
      while (head.length < 2) {
        const next = await iterator.next();
        if (next.done === true) break;
        head = head.length === 0 ? next.value : concat(head, next.value);
      }
      const rest: ByteSource = { [Symbol.asyncIterator]: () => iterator };
      if (!isGzip(head)) {
        if (head.length > 0) yield head;
        yield* rest;
        return;
      }
      const reader = new GzipReader();
      yield* reader.push(head);
      for await (const chunk of rest) yield* reader.push(chunk);
      yield* reader.finish();
    },
  };
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const c = new Uint8Array(a.length + b.length);
  c.set(a);
  c.set(b, a.length);
  return c;
}
