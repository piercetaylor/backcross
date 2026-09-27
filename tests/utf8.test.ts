/**
 * Strict UTF-8 decoding at the boundary (src/io/utf8.ts, src/io/stream.ts,
 * contract 1.11.0, docs/adr/0026).
 *
 * (a) The validator agrees with a fatal WHATWG TextDecoder on one example of
 * every row of Unicode Table 3-7 and on each class of ill-formed sequence,
 * and names the lead byte. (b) decodeUtf8 strips a leading BOM only, and
 * names the line and byte position of a bad byte in a CRLF file. (c) lines()
 * gives the same answers whatever the chunking, keeps a character split at
 * any byte whole, and reports a sequence cut short at the end of the input.
 * (d) The contract's VCF_BAD_ID bytes give the same message through the
 * one-shot entry and as a bgzip stream. (e) The fixture VCF decodes as Node's
 * lenient decoder reads it, so strictness costs no valid input.
 *
 * The chunking helpers repeat those of tests/stream.test.ts, which keeps its
 * own module-local.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseGenotypesBytes, parseGenotypesSource } from '../src/io/loaders.ts';
import { lines } from '../src/io/stream.ts';
import type { ByteSource } from '../src/io/stream.ts';
import { decodeUtf8, firstInvalidUtf8, InvalidUtf8Error } from '../src/io/utf8.ts';
import { FIXTURE_DIR } from './helpers.ts';
import { bgzfBlocks } from './support/bgzf.ts';

const encoder = new TextEncoder();

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function chunked(bytes: Uint8Array, size: number): Uint8Array[] {
  if (!Number.isFinite(size)) return [bytes];
  const out: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) out.push(bytes.subarray(i, i + size));
  return out;
}

/** Chunks delivered one per microtask, as a real stream delivers them. */
function sourceOf(parts: Uint8Array[]): ByteSource {
  return {
    async *[Symbol.asyncIterator]() {
      for (const part of parts) yield await Promise.resolve(part);
    },
  };
}

async function collectLines(source: ByteSource): Promise<string[]> {
  const out: string[] = [];
  for await (const line of lines(source)) out.push(line);
  return out;
}

function hexBytes(hex: string): Uint8Array {
  return Uint8Array.from(hex.split(' ').map((h) => parseInt(h, 16)));
}

function sizeLabel(size: number): string {
  return Number.isFinite(size) ? `${size}-byte chunks` : 'one push';
}

/** A pattern matching `message` and nothing more. */
function exactly(message: string): RegExp {
  return new RegExp('^' + message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
}

const SIZES = [1, 7, 65_536, Infinity];

describe('firstInvalidUtf8 (a): parity with a fatal TextDecoder', () => {
  const wellFormed = [
    '41',
    'C3 A9',
    'E0 A0 80',
    'E1 80 80',
    'ED 9F BF',
    'EE 80 80',
    'F0 90 80 80',
    'F1 80 80 80',
    'F4 8F BF BF',
  ];
  const illFormed = [
    '80',
    'C0 80',
    'C1 BF',
    'E0 80 80',
    'E0 9F BF',
    'ED A0 80',
    'ED BF BF',
    'F0 80 80 80',
    'F0 8F BF BF',
    'F4 90 80 80',
    'F5 80 80 80',
    'FF',
    'E2 82 41',
    'E2 82',
    'F0 9F 8C',
  ];
  const fatal = new TextDecoder('utf-8', { fatal: true });
  const decodes = (b: Uint8Array): boolean => {
    try {
      fatal.decode(b);
      return true;
    } catch {
      return false;
    }
  };

  for (const hex of [...wellFormed, ...illFormed]) {
    const bytes = concat([encoder.encode('ab'), hexBytes(hex)]);
    it(`ab ${hex}`, () => {
      expect(firstInvalidUtf8(bytes) === -1).toBe(decodes(bytes));
      if (illFormed.includes(hex)) expect(firstInvalidUtf8(bytes)).toBe(2);
      else expect(firstInvalidUtf8(bytes)).toBe(-1);
    });
  }
});

describe('decodeUtf8 (b)', () => {
  it('strips a leading byte-order mark', () => {
    expect(decodeUtf8(concat([hexBytes('EF BB BF'), encoder.encode('x\n')]), 'f')).toBe('x\n');
  });

  it('keeps a byte-order mark that starts a later line', () => {
    const text = decodeUtf8(
      concat([encoder.encode('x\n'), hexBytes('EF BB BF'), encoder.encode('y')]),
      'f',
    );
    expect(text).toBe('x\n﻿y');
  });

  it('names the line and byte position of a bad byte in a CRLF file', () => {
    const bytes = concat([
      encoder.encode('a,b\r\nc,d\r\nabcd'),
      hexBytes('E9'),
      encoder.encode('\r\n'),
    ]);
    let caught: unknown;
    try {
      decodeUtf8(bytes, 'samples.csv');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(InvalidUtf8Error);
    const err = caught as InvalidUtf8Error;
    expect(err.message).toBe('samples.csv line 3: not valid UTF-8 (byte 0xE9 at position 5)');
    expect({ line: err.line, position: err.position, byte: err.byte }).toEqual({
      line: 3,
      position: 5,
      byte: 0xe9,
    });
  });
});

describe('lines (c): strict decoding at every chunk size', () => {
  const thousand = concat([
    encoder.encode(Array.from({ length: 999 }, (_, i) => `line${i + 1}\n`).join('') + 'abc'),
    hexBytes('E9'),
    encoder.encode('d\n'),
  ]);

  for (const size of SIZES) {
    it(`names line 1000 of a 1,000-line text in ${sizeLabel(size)}`, async () => {
      await expect(collectLines(sourceOf(chunked(thousand, size)))).rejects.toThrow(
        exactly('genotype file line 1000: not valid UTF-8 (byte 0xE9 at position 4)'),
      );
    });

    it(`keeps a U+FEFF that starts line 2 in ${sizeLabel(size)}`, async () => {
      const bytes = encoder.encode('a\n﻿b\n');
      expect(await collectLines(sourceOf(chunked(bytes, size)))).toEqual(['a', '﻿b']);
    });

    it(`names line 2, position 2 for E2 82 at the end in ${sizeLabel(size)}`, async () => {
      const bytes = concat([encoder.encode('a\nb'), hexBytes('E2 82')]);
      await expect(collectLines(sourceOf(chunked(bytes, size)))).rejects.toThrow(
        exactly('genotype file line 2: not valid UTF-8 (byte 0xE2 at position 2)'),
      );
    });

    it(`drops a leading byte-order mark in ${sizeLabel(size)}`, async () => {
      const bytes = concat([hexBytes('EF BB BF'), encoder.encode('a\nb\n')]);
      expect(await collectLines(sourceOf(chunked(bytes, size)))).toEqual(['a', 'b']);
    });
  }

  it('reads a character split at every byte index whole', async () => {
    const bytes = encoder.encode('a\nb€\n🌱c\n');
    for (let cut = 0; cut <= bytes.length; cut++) {
      expect(
        await collectLines(sourceOf([bytes.subarray(0, cut), bytes.subarray(cut)])),
        `cut at ${cut}`,
      ).toEqual(['a', 'b€', '🌱c']);
    }
  });
});

describe('the contract VCF with 0xE9 in an ID (d)', () => {
  const tsv = (...cells: string[]): string => cells.join('\t');
  const header = tsv('#CHROM', 'POS', 'ID', 'REF', 'ALT', 'QUAL', 'FILTER', 'INFO', 'FORMAT');
  const bytes = concat([
    encoder.encode(
      [
        '##fileformat=VCFv4.2',
        tsv(header, 'RP', 'DONOR', 'L1'),
        tsv('Gm06', '1000', 'g1', 'A', 'G', '.', 'PASS', '.', 'GT', '0/0', '1/1', '0/1'),
        'Gm06\t2000\tg',
      ].join('\n'),
    ),
    hexBytes('E9'),
    encoder.encode(tsv('2', 'C', 'T', '.', 'PASS', '.', 'GT', '0/0', '1/1', '1/1') + '\n'),
  ]);
  const message = 'genotype file line 4: not valid UTF-8 (byte 0xE9 at position 12)';

  it('is rejected by the one-shot bytes entry', () => {
    expect(() => parseGenotypesBytes('genotypes.vcf', bytes)).toThrow(exactly(message));
  });

  it('is rejected as a bgzip stream of 64-byte blocks fed in 7-byte chunks', async () => {
    const gz = concat(bgzfBlocks(bytes, 64));
    await expect(
      parseGenotypesSource('genotypes.vcf.gz', sourceOf(chunked(gz, 7))),
    ).rejects.toThrow(exactly(message));
  });
});

describe('the fixture (e)', () => {
  it('decodes genotypes.vcf as the lenient decoder reads it', () => {
    const path = join(FIXTURE_DIR, 'genotypes.vcf');
    expect(decodeUtf8(readFileSync(path), 'genotype file')).toBe(readFileSync(path, 'utf8'));
  });
});
