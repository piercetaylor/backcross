/**
 * Byte streams and line splitting for the streaming loader.
 *
 * Responsibility: present a `Blob`, a byte array or a Node `Readable` as one
 * shape, an async iterable of byte chunks, and turn such a source into text
 * lines without ever holding the whole text. Reads a Blob with
 * `blob.stream().getReader()` and a `read()` loop rather than `for await`
 * over the stream, so nothing depends on ReadableStream async-iteration
 * support. Computes nothing (docs/m3-phases.md, invariant 1).
 *
 * Line semantics: strict UTF-8 (utf8.ts, contract 1.11.0). Each chunk is
 * cut at its last `\n` byte (0x0A never occurs inside a multi-byte
 * sequence); the bytes after it are carried to the next chunk. The bytes
 * through that `\n` are decoded with at most two calls of one fatal
 * `TextDecoder`, a streaming call for the carried partial line and a final
 * call for the rest, so a character split across chunks or bgzip members
 * decodes whole and no byte is inspected twice on the happy path. An
 * ill-formed sequence throws InvalidUtf8Error naming the physical line and
 * the byte position within it, found by the validator only after a decode
 * has failed; a chunk is judged whole before any of its lines is yielded.
 * The decoder keeps a byte-order mark (`ignoreBOM: true`) and it is stripped
 * here, from the first line only; a U+FEFF starting a later line is data.
 * The text is split on `\n`, one trailing `\r` stripped per line, so a
 * `\r\n` pair split across chunks still yields a clean line; a final
 * unterminated line is yielded when it is non-empty. The result equals
 * `text.split(/\r?\n/)` less a trailing empty string.
 *
 * Interface: ByteSource, blobBytes(blob), bytesOf(bytes),
 * countBytes(source, counter), lines(source, label?).
 */
import { concatBytes } from './decompress.ts';
import { InvalidUtf8Error, locateInvalidUtf8 } from './utf8.ts';

export type ByteSource = AsyncIterable<Uint8Array>;

const EMPTY = new Uint8Array(0);

export function blobBytes(blob: Blob): ByteSource {
  return {
    async *[Symbol.asyncIterator]() {
      const reader = blob.stream().getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return;
          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    },
  };
}

/** One chunk, `bytes` itself; no copy. */
export function bytesOf(bytes: Uint8Array): ByteSource {
  return {
    [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
      let given = false;
      return {
        next(): Promise<IteratorResult<Uint8Array>> {
          if (given) return Promise.resolve({ done: true, value: undefined });
          given = true;
          return Promise.resolve({ done: false, value: bytes });
        },
      };
    },
  };
}

/** Passes `source` through, adding each chunk's length to `counter.bytes`. */
export function countBytes(source: ByteSource, counter: { bytes: number }): ByteSource {
  return {
    async *[Symbol.asyncIterator]() {
      for await (const chunk of source) {
        counter.bytes += chunk.length;
        yield chunk;
      }
    },
  };
}

export function lines(source: ByteSource, label = 'genotype file'): AsyncIterable<string> {
  return {
    async *[Symbol.asyncIterator]() {
      const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
      /** Bytes of the partial line since the last 0x0A. */
      let carry: Uint8Array = EMPTY;
      /** Lines yielded so far. */
      let lineNo = 0;
      let first = true;
      for await (const chunk of source) {
        const nl = chunk.lastIndexOf(0x0a);
        if (nl === -1) {
          carry = carry.length === 0 ? chunk : concatBytes(carry, chunk);
          continue;
        }
        const part = chunk.subarray(0, nl + 1);
        let text: string;
        try {
          text =
            (carry.length === 0 ? '' : decoder.decode(carry, { stream: true })) +
            decoder.decode(part);
        } catch {
          const at = locateInvalidUtf8(concatBytes(carry, part), lineNo);
          throw new InvalidUtf8Error(label, at.line, at.position, at.byte);
        }
        carry = chunk.subarray(nl + 1);
        if (first) {
          first = false;
          if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
        }
        // `text` ends with '\n', so every piece is a whole line and nothing is left over.
        let start = 0;
        for (;;) {
          const end = text.indexOf('\n', start);
          if (end === -1) break;
          yield stripCr(text.slice(start, end));
          lineNo++;
          start = end + 1;
        }
      }
      if (carry.length > 0) {
        let last: string;
        try {
          last = decoder.decode(carry);
        } catch {
          const at = locateInvalidUtf8(carry, lineNo);
          throw new InvalidUtf8Error(label, at.line, at.position, at.byte);
        }
        if (first && last.charCodeAt(0) === 0xfeff) last = last.slice(1);
        last = stripCr(last);
        if (last.length > 0) yield last;
      }
    },
  };
}

function stripCr(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}
