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
 * Line semantics: UTF-8 decoded with `TextDecoder` in streaming mode, so a
 * multi-byte character split across chunks decodes once; split on `\n`; one
 * trailing `\r` stripped per line, so a `\r\n` pair split across chunks
 * still yields a clean line; a final unterminated line is yielded when it is
 * non-empty. The result equals `text.split(/\r?\n/)` less a trailing empty
 * string. A leading byte-order mark is dropped, as the one-shot decoder in
 * decompress.ts drops it.
 *
 * Interface: ByteSource, blobBytes(blob), bytesOf(bytes),
 * countBytes(source, counter), lines(source).
 */

export type ByteSource = AsyncIterable<Uint8Array>;

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

export function lines(source: ByteSource): AsyncIterable<string> {
  return {
    async *[Symbol.asyncIterator]() {
      const decoder = new TextDecoder('utf-8');
      let carry = '';
      for await (const chunk of source) {
        const text = carry + decoder.decode(chunk, { stream: true });
        let start = 0;
        for (;;) {
          const end = text.indexOf('\n', start);
          if (end === -1) break;
          yield stripCr(text.slice(start, end));
          start = end + 1;
        }
        carry = text.slice(start);
      }
      const last = stripCr(carry + decoder.decode());
      if (last.length > 0) yield last;
    },
  };
}

function stripCr(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}
