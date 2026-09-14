/**
 * Streaming byte and line plumbing (src/io/stream.ts, src/io/decompress.ts)
 * and the streaming loader (src/io/loaders.ts, parseGenotypesSource).
 *
 * The first block drives fflate's streaming Gunzip directly: it inflates a
 * multi-member stream whatever the chunk boundaries, including splits inside
 * a member header, so a failure there indicts fflate rather than src/io.
 * decompress.ts relies on that for plain gzip; BGZF is framed by BSIZE and
 * inflated member by member instead. Two corpora feed this and the gzip
 * integrity block below: a large one (over 64 KiB framed, in 4 KiB blocks)
 * for the 65,536-byte and whole-buffer chunk cases, where that size needs to
 * exceed one push; and a small one (framed in much smaller blocks, so it
 * still spans several members despite its size) for the 1- and 7-byte
 * cases, where a push per byte or per seven bytes would make the large
 * corpus slow for no added coverage.
 *
 * The gzip integrity block is the check fflate's Gunzip does not make:
 * GzipReader (behind inflateIfGzip and gunzipAll) must reject a corrupted
 * CRC32, a wrong ISIZE, corrupted deflate data, a BGZF stream without its
 * end-of-file block, and a stream cut inside a member, in BGZF and in plain
 * multi-member gzip, at every chunk size, naming the member's compressed
 * offset, with the corruption always landing in a member other than the
 * first. Corruptions are applied to copies of valid streams.
 *
 * The streamed-equals-text dataset check that docs/m3-phases.md places in
 * tests/smoke.test.ts lives here, so smoke.test.ts stays untouched, together
 * with hand-built VCF cases (phased, haploid, missing, multi-allelic, GT not
 * first in FORMAT, a trailing tab, no final newline) whose expected calls
 * are written out by hand, and the head-window format detection both
 * loaders share.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Gunzip, gzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { GzipReader, gunzipAll, inflateIfGzip } from '../src/io/decompress.ts';
import { assembleDataset, parseGenotypesBytes, parseGenotypesSource } from '../src/io/loaders.ts';
import { parseSampleManifest } from '../src/io/manifest.ts';
import { lines } from '../src/io/stream.ts';
import type { ByteSource } from '../src/io/stream.ts';
import { FIXTURE_DIR } from './helpers.ts';
import { bgzfBlocks } from './support/bgzf.ts';
import { BENCH_SPEC, synthVcfLines } from './support/synth-vcf.ts';

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

// One-byte pushes cost fflate a call each; generous so a loaded machine does not time out.
const SLOW_MS = 30_000;

async function collectBytes(source: ByteSource): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  for await (const chunk of source) parts.push(chunk);
  return concat(parts);
}

async function collectLines(source: ByteSource): Promise<string[]> {
  const out: string[] = [];
  for await (const line of lines(source)) out.push(line);
  return out;
}

/** Byte equality without a per-element deep diff, which is slow on megabytes. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return Buffer.from(a.buffer, a.byteOffset, a.length).equals(
    Buffer.from(b.buffer, b.byteOffset, b.length),
  );
}

function sizeLabel(size: number): string {
  return Number.isFinite(size) ? `${size}-byte chunks` : 'one push';
}

interface GzipCorpus {
  /** Plaintext the BGZF members reconstruct. */
  source: Uint8Array;
  bgzfMembers: Uint8Array[];
  bgzf: Uint8Array;
  /** Compressed-byte offsets bounding a middle data member (never the first). */
  bStart: number;
  bEnd: number;
  /** A byte inside that member's deflate data. */
  bMid: number;
  /** Plaintext the plain-gzip members reconstruct (twice `source`). */
  twice: Uint8Array;
  plainMembers: Uint8Array[];
  plain: Uint8Array;
  /** Compressed-byte offsets bounding the second (FNAME) member. */
  pStart: number;
  pEnd: number;
  pMid: number;
}

/**
 * A BGZF corpus (many `blockBytes` members plus the EOF block) and a plain
 * multi-member gzip corpus (three members over `source` twice, the second
 * with an FNAME header field), sharing `source`, with the compressed-byte
 * offsets the corruption tests need: a middle BGZF member, always after the
 * first, and the second plain-gzip member.
 */
function buildGzipCorpus(source: Uint8Array, blockBytes: number): GzipCorpus {
  const bgzfMembers = bgzfBlocks(source, blockBytes);
  const bgzf = concat(bgzfMembers);
  const bk = Math.floor(bgzfMembers.length / 2); // a middle data member
  const bStart = bgzfMembers.slice(0, bk).reduce((n, m) => n + m.length, 0);
  const bEnd = bStart + (bgzfMembers[bk] as Uint8Array).length;
  const bMid = bStart + Math.floor((bEnd - bStart) / 2);

  const twice = concat([source, source]);
  const third = Math.floor(twice.length / 3);
  const plainMembers = [
    gzipSync(twice.subarray(0, third), { mtime: 0 }),
    gzipSync(twice.subarray(third, 2 * third), { mtime: 0, filename: 'middle.vcf' }),
    gzipSync(twice.subarray(2 * third), { mtime: 0 }),
  ];
  const plain = concat(plainMembers);
  const pStart = (plainMembers[0] as Uint8Array).length;
  const pEnd = pStart + (plainMembers[1] as Uint8Array).length;
  const pMid = pStart + Math.floor((pEnd - pStart) / 2);

  return {
    source,
    bgzfMembers,
    bgzf,
    bStart,
    bEnd,
    bMid,
    twice,
    plainMembers,
    plain,
    pStart,
    pEnd,
    pMid,
  };
}

const encoder = new TextEncoder();
const fixtureVcf = new Uint8Array(readFileSync(join(FIXTURE_DIR, 'genotypes.vcf')));
const synthVcf = encoder.encode(
  Array.from(
    synthVcfLines({ ...BENCH_SPEC, nChrom: 2, markersPerChrom: 1000, nCandidates: 200 }),
  ).join(''),
);
// Much smaller than synthVcf, for the 1- and 7-byte chunk cases (a push per
// byte or per seven bytes): a small blockBytes still forces several BGZF
// members from this small input, so those cases stay under a couple of
// seconds without losing coverage the large corpus doesn't also give.
const smallSynthVcf = encoder.encode(
  Array.from(synthVcfLines({ ...BENCH_SPEC, nChrom: 1, markersPerChrom: 20, nCandidates: 4 })).join(
    '',
  ),
);

describe('fflate streaming Gunzip over a multi-member stream', () => {
  // 4 KiB blocks force many members; used for the 65,536-byte and
  // whole-buffer chunk cases, which need input over 64 KiB to make those
  // two cases distinct.
  const blocks = bgzfBlocks(synthVcf, 4096);
  const framed = concat(blocks);

  // A small blockBytes still forces several members from smallSynthVcf, so
  // the 1- and 7-byte chunk cases (a push per byte) split headers, the BC
  // extra field, deflate data and the CRC/ISIZE trailer without pushing
  // through the much larger corpus above.
  const smallBlocks = bgzfBlocks(smallSynthVcf, 200);
  const smallFramed = concat(smallBlocks);

  it('the framed stream has many members, the EOF block, and exceeds 64 KiB', () => {
    expect(blocks.length).toBeGreaterThan(10);
    expect(blocks.at(-1)?.length).toBe(28);
    expect(framed.length).toBeGreaterThan(65_536);
  });

  it('the small framed stream spans several members plus the EOF block', () => {
    expect(smallBlocks.length).toBeGreaterThanOrEqual(4); // >= 3 data members + EOF
    expect(smallBlocks.at(-1)?.length).toBe(28);
  });

  const cases: Array<[size: number, input: Uint8Array, expected: Uint8Array]> = [
    [1, smallFramed, smallSynthVcf],
    [7, smallFramed, smallSynthVcf],
    [65_536, framed, synthVcf],
    [Number.POSITIVE_INFINITY, framed, synthVcf],
  ];

  for (const [size, input, expected] of cases) {
    it(
      `inflates to the source bytes when fed in ${sizeLabel(size)}`,
      () => {
        const out: Uint8Array[] = [];
        const gunzip = new Gunzip((chunk) => out.push(chunk));
        for (const part of chunked(input, size)) gunzip.push(part, false);
        gunzip.push(new Uint8Array(0), true);
        expect(sameBytes(concat(out), expected)).toBe(true);
      },
      SLOW_MS,
    );
  }
});

describe('inflateIfGzip', () => {
  const framed = concat(bgzfBlocks(fixtureVcf, 4096));

  for (const size of [1, 7, 65_536]) {
    it(`reproduces the fixture from BGZF fed in ${sizeLabel(size)}`, async () => {
      expect(await collectBytes(inflateIfGzip(sourceOf(chunked(framed, size))))).toEqual(
        fixtureVcf,
      );
    });
  }

  it('passes uncompressed bytes through, even when the first chunk is one byte', async () => {
    expect(await collectBytes(inflateIfGzip(sourceOf(chunked(fixtureVcf, 1))))).toEqual(fixtureVcf);
  });

  it('yields nothing for an empty source', async () => {
    expect((await collectBytes(inflateIfGzip(sourceOf([])))).length).toBe(0);
  });
});

describe('lines', () => {
  function expected(text: string): string[] {
    const out = text.split(/\r?\n/);
    if (out.at(-1) === '') out.pop();
    return out;
  }

  it('joins a line split across two chunks', async () => {
    const bytes = encoder.encode('alpha\nbravo charlie\ndelta\n');
    const cut = 'alpha\nbravo '.length;
    expect(await collectLines(sourceOf([bytes.subarray(0, cut), bytes.subarray(cut)]))).toEqual([
      'alpha',
      'bravo charlie',
      'delta',
    ]);
  });

  it('decodes a multi-byte UTF-8 character split across two chunks', async () => {
    const text = 'id\tnote\nm1\tcentiMorgan µ € \u{1f331}\n';
    const bytes = encoder.encode(text);
    const euro = bytes.indexOf(0xe2);
    for (const cut of [euro + 1, euro + 2, bytes.indexOf(0xf0) + 3]) {
      expect(await collectLines(sourceOf([bytes.subarray(0, cut), bytes.subarray(cut)]))).toEqual(
        expected(text),
      );
    }
  });

  it('strips a CRLF pair split across two chunks', async () => {
    const text = 'one\r\ntwo\r\nthree';
    const bytes = encoder.encode(text);
    const cut = 'one\r'.length;
    expect(await collectLines(sourceOf([bytes.subarray(0, cut), bytes.subarray(cut)]))).toEqual([
      'one',
      'two',
      'three',
    ]);
  });

  it('matches text.split over the fixture in 7-byte chunks, with CRLF and without', async () => {
    const text = new TextDecoder().decode(fixtureVcf);
    const crlf = text.replace(/\n/g, '\r\n');
    for (const t of [text, crlf]) {
      expect(await collectLines(sourceOf(chunked(encoder.encode(t), 7)))).toEqual(expected(t));
    }
  });

  it('keeps blank lines and yields a final unterminated line', async () => {
    expect(await collectLines(sourceOf([encoder.encode('a\n\nb')]))).toEqual(['a', '', 'b']);
  });
});

describe('parseGenotypesSource', () => {
  const samples = parseSampleManifest(readFileSync(join(FIXTURE_DIR, 'samples.csv'), 'utf8'));
  const reference = assembleDataset(parseGenotypesBytes('genotypes.vcf', fixtureVcf), samples);

  it('a bgzipped VCF in 7-byte chunks gives the text-parsed dataset byte for byte', async () => {
    const framed = concat(bgzfBlocks(fixtureVcf, 4096));
    const streamed = await parseGenotypesSource('genotypes.vcf.gz', sourceOf(chunked(framed, 7)));
    expect(streamed.bytesInflated).toBe(fixtureVcf.length);
    const { dataset, warnings } = assembleDataset(streamed, samples);
    expect(dataset.genotypes.allele1).toEqual(reference.dataset.genotypes.allele1);
    expect(dataset.genotypes.allele2).toEqual(reference.dataset.genotypes.allele2);
    expect(dataset.markers).toEqual(reference.dataset.markers);
    expect(dataset.genotypes.sampleIds).toEqual(reference.dataset.genotypes.sampleIds);
    expect(warnings).toEqual(reference.warnings);
  });

  it('accounts the builder peak: two capacity arrays plus the two final slices', async () => {
    const streamed = await parseGenotypesSource('genotypes.vcf', sourceOf([fixtureVcf]));
    const size = streamed.genotypes.allele1.length;
    // Capacity is at least `size` and at most twice it, or the initial 1024 rows.
    const maxCapacity = Math.max(2 * size, 1024 * streamed.genotypes.nSamples);
    expect(streamed.peakBuilderBytes).toBeGreaterThanOrEqual(4 * size);
    expect(streamed.peakBuilderBytes).toBeLessThanOrEqual(2 * maxCapacity + 2 * size);
  });

  it('detects and parses HapMap from a stream, as the text path does', async () => {
    const bytes = new Uint8Array(readFileSync(join(FIXTURE_DIR, 'genotypes.hmp.txt')));
    const streamed = await parseGenotypesSource('genotypes.hmp.txt', sourceOf(chunked(bytes, 7)));
    const text = parseGenotypesBytes('genotypes.hmp.txt', bytes);
    expect(streamed.bytesInflated).toBe(bytes.length);
    expect(streamed.peakBuilderBytes).toBe(0);
    expect(streamed.genotypes).toEqual(text.genotypes);
    expect(streamed.markers).toEqual(text.markers);
  });
});

describe('gzip integrity: GzipReader behind inflateIfGzip and gunzipAll', () => {
  const SIZES = [1, 7, 65_536, Number.POSITIVE_INFINITY];

  // The 65,536-byte and whole-buffer cases need input over 64 KiB, so one
  // push differs from chunking at 65,536; the 1- and 7-byte cases (a push
  // per byte or per seven bytes) use a much smaller input with a small
  // blockBytes, which still forces several BGZF members and several
  // plain-gzip members. Each corpus's BGZF side has many members then the
  // EOF block (a middle member, never the first, starts at bStart), and its
  // plain-gzip side has three members, the second with an FNAME header
  // field (starting at pStart).
  const largeCorpus = buildGzipCorpus(synthVcf, 4096);
  const smallCorpus = buildGzipCorpus(smallSynthVcf, 200);

  function mutate(bytes: Uint8Array, at: number, xor: number): Uint8Array {
    const copy = bytes.slice();
    copy[at] = (copy[at] as number) ^ xor;
    return copy;
  }

  /** Sync reader fed in `size` chunks; the fast way to cover 1-byte pushes. */
  function readSync(bytes: Uint8Array, size: number): Uint8Array {
    const reader = new GzipReader();
    const out: Uint8Array[] = [];
    for (const part of chunked(bytes, size)) out.push(...reader.push(part));
    out.push(...reader.finish());
    return concat(out);
  }

  /** Every entry rejects: the sync reader at `size`, inflateIfGzip at `size` (not 1), gunzipAll. */
  async function expectAllReject(bytes: Uint8Array, size: number, pattern: RegExp): Promise<void> {
    expect(() => readSync(bytes, size)).toThrow(pattern);
    if (size !== 1) {
      await expect(collectBytes(inflateIfGzip(sourceOf(chunked(bytes, size))))).rejects.toThrow(
        pattern,
      );
    }
    expect(() => gunzipAll(bytes)).toThrow(pattern);
  }

  it('the large inputs exceed 64 KiB, and the plain stream has an FNAME member', () => {
    expect(largeCorpus.bgzf.length).toBeGreaterThan(65_536);
    expect(largeCorpus.plain.length).toBeGreaterThan(65_536);
    expect(((largeCorpus.plainMembers[1] as Uint8Array)[3] as number) & 0x08).toBe(0x08);
  });

  it('the small inputs span several BGZF and plain-gzip members, well under 64 KiB', () => {
    expect(smallCorpus.bgzfMembers.length).toBeGreaterThanOrEqual(4); // >= 3 data members + EOF
    expect(smallCorpus.bgzfMembers.at(-1)?.length).toBe(28);
    expect(smallCorpus.plainMembers.length).toBe(3);
    expect(((smallCorpus.plainMembers[1] as Uint8Array)[3] as number) & 0x08).toBe(0x08);
    expect(smallCorpus.bgzf.length).toBeLessThan(65_536);
  });

  for (const size of SIZES) {
    const { source, bgzf, bStart, bEnd, bMid, twice, plain, pStart, pEnd, pMid } =
      size <= 7 ? smallCorpus : largeCorpus;

    describe(sizeLabel(size), () => {
      it(
        'valid BGZF and plain multi-member gzip inflate to the source bytes',
        async () => {
          expect(sameBytes(readSync(bgzf, size), source)).toBe(true);
          expect(sameBytes(readSync(plain, size), twice)).toBe(true);
          if (size !== 1) {
            const streamed = await collectBytes(inflateIfGzip(sourceOf(chunked(plain, size))));
            expect(sameBytes(streamed, twice)).toBe(true);
          }
        },
        SLOW_MS,
      );

      it(
        'rejects a corrupted CRC32, naming the member offset',
        async () => {
          await expectAllReject(
            mutate(bgzf, bEnd - 8, 0x01),
            size,
            new RegExp(`compressed byte ${bStart}: CRC32 mismatch`),
          );
          await expectAllReject(
            mutate(plain, pEnd - 6, 0x80),
            size,
            new RegExp(`compressed byte ${pStart}: CRC32 mismatch`),
          );
        },
        SLOW_MS,
      );

      it(
        'rejects a wrong ISIZE, naming the member offset',
        async () => {
          await expectAllReject(
            mutate(bgzf, bEnd - 4, 0x01),
            size,
            new RegExp(`compressed byte ${bStart}: ISIZE mismatch`),
          );
          await expectAllReject(
            mutate(plain, pEnd - 3, 0x01),
            size,
            new RegExp(`compressed byte ${pStart}: ISIZE mismatch`),
          );
        },
        SLOW_MS,
      );

      it(
        'rejects corrupted deflate data, naming the member offset',
        async () => {
          await expectAllReject(
            mutate(bgzf, bMid, 0x10),
            size,
            new RegExp(`compressed byte ${bStart}\\b.*(corrupt|mismatch)`),
          );
          await expectAllReject(
            mutate(plain, pMid, 0x10),
            size,
            new RegExp(`compressed byte ${pStart}\\b.*(invalid|mismatch)`),
          );
        },
        SLOW_MS,
      );

      it(
        'rejects a BGZF stream cut before the EOF block, and one cut between data blocks',
        async () => {
          const pattern =
            /BGZF stream truncated: it does not end with the 28-byte BGZF end-of-file block/;
          await expectAllReject(bgzf.subarray(0, bgzf.length - 28), size, pattern);
          await expectAllReject(bgzf.subarray(0, bEnd), size, pattern);
        },
        SLOW_MS,
      );

      it(
        'rejects a stream cut inside a member, BGZF and plain',
        async () => {
          const inside = new RegExp(
            `truncated: it ends inside the member at compressed byte ${bStart}\\b`,
          );
          await expectAllReject(bgzf.subarray(0, bMid), size, inside);
          await expectAllReject(bgzf.subarray(0, bStart + 5), size, inside);
          await expectAllReject(
            plain.subarray(0, pMid),
            size,
            new RegExp(`compressed byte ${pStart}\\b.*truncated`),
          );
          // Cut inside the trailer: not distinguishable from corruption through Gunzip,
          // so it fails the trailer check, whose message names truncation as a cause.
          await expectAllReject(
            plain.subarray(0, pEnd - 3),
            size,
            new RegExp(`compressed byte ${pStart}: (CRC32|ISIZE) mismatch.*truncated`),
          );
        },
        SLOW_MS,
      );
    });
  }

  it('the synchronous loader rejects the same corruption (parseGenotypesBytes)', () => {
    const { bgzf, bEnd } = largeCorpus;
    expect(() => parseGenotypesBytes('calls.vcf.gz', mutate(bgzf, bEnd - 8, 0x01))).toThrow(
      /CRC32 mismatch/,
    );
    expect(() => parseGenotypesBytes('calls.vcf.gz', bgzf.subarray(0, bEnd))).toThrow(/truncated/);
  });

  it('the streaming loader rejects a file cut between blocks rather than loading fewer markers', async () => {
    const { bgzf, bEnd } = largeCorpus;
    await expect(
      parseGenotypesSource('calls.vcf.gz', sourceOf(chunked(bgzf.subarray(0, bEnd), 65_536))),
    ).rejects.toThrow(/truncated/);
  });
});

describe('hand-built VCF: streamed and text paths agree, with the calls written out', () => {
  const MISSING = 255;
  const header = [
    '##fileformat=VCFv4.2',
    '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tRP\tDP\tL1',
  ];
  const records = [
    'Gm01\t100\tphased\tA\tG\t.\t.\t.\tGT\t0|0\t1|1\t1|0',
    'Gm01\t200\thaploid\tC\tT\t.\t.\t.\tGT\t0\t1\t1',
    'Gm01\t300\tmissing\tG\tA\t.\t.\t.\tGT\t.\t./.\t0/.',
    'Gm01\t400\tmulti\tT\tA,G\t.\t.\t.\tGT\t0/0\t2/2\t2/1',
    'Gm01\t500\tgt_second\tA\tC\t.\t.\t.\tDP:GT\t12:0/0\t9:1/1\t7:1/0',
    'Gm02\t600\tno_newline\tA\tT\t.\t.\t.\tGT\t0/0\t1/1\t0/1',
  ];
  // Unordered pairs (allele1 <= allele2); row = marker, columns RP, DP, L1.
  // A half-missing call such as 0/. is stored as missing on both alleles.
  const expected1 = [0, 1, 0, 0, 1, 1, MISSING, MISSING, MISSING, 0, 2, 1, 0, 1, 0, 0, 1, 0];
  const expected2 = [0, 1, 1, 0, 1, 1, MISSING, MISSING, MISSING, 0, 2, 2, 0, 1, 1, 0, 1, 1];
  const bytes = encoder.encode([...header, ...records].join('\n')); // no final newline

  const variants: [string, string, Uint8Array][] = [
    ['plain text', 'hand.vcf', bytes],
    ['bgzipped', 'hand.vcf.gz', concat(bgzfBlocks(bytes, 64))],
  ];
  for (const [label, name, input] of variants) {
    for (const size of [1, 7, Number.POSITIVE_INFINITY]) {
      it(`${label} in ${sizeLabel(size)}: byte-identical alleles and the expected calls`, async () => {
        const text = parseGenotypesBytes(name, input);
        const streamed = await parseGenotypesSource(name, sourceOf(chunked(input, size)));
        expect(Array.from(text.genotypes.allele1)).toEqual(expected1);
        expect(Array.from(text.genotypes.allele2)).toEqual(expected2);
        expect(sameBytes(streamed.genotypes.allele1, text.genotypes.allele1)).toBe(true);
        expect(sameBytes(streamed.genotypes.allele2, text.genotypes.allele2)).toBe(true);
        expect(streamed.markers).toEqual(text.markers);
        expect(streamed.markers.ids).toEqual([
          'phased',
          'haploid',
          'missing',
          'multi',
          'gt_second',
          'no_newline',
        ]);
        expect(streamed.markers.alleles[3]).toEqual(['T', 'A', 'G']);
        expect(streamed.warnings).toEqual(text.warnings);
      });
    }
  }

  it('a trailing tab after the last sample column is rejected identically by both paths', async () => {
    const lines4 = [...header, records[0] as string, `${records[1] as string}\t`];
    const withTab = encoder.encode(lines4.join('\n'));
    let message = '';
    try {
      parseGenotypesBytes('tab.vcf', withTab);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toBe('VCF line 4: 4 sample fields, header has 3');
    await expect(parseGenotypesSource('tab.vcf', sourceOf(chunked(withTab, 7)))).rejects.toThrow(
      message,
    );
  });
});

describe('format detection over the head window, both loaders', () => {
  const body = [
    '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tRP\tDP',
    'Gm01\t100\tm1\tA\tG\t.\t.\t.\tGT\t0/0\t1/1',
  ];
  const cases: [string, string[]][] = [
    ['one ##contig line', ['##contig=<ID=Gm01,length=56831624>']],
    [
      'about 2 KiB of ##contig lines',
      Array.from({ length: 60 }, (_, i) => `##contig=<ID=scaffold_${i},length=${1000 + i}>`),
    ],
  ];

  for (const [label, headLines] of cases) {
    it(`a .txt VCF opening with ${label} and no ##fileformat is read as VCF`, async () => {
      const bytes = encoder.encode([...headLines, ...body].join('\n'));
      const text = parseGenotypesBytes('calls.txt', bytes);
      const streamed = await parseGenotypesSource('calls.txt', sourceOf(chunked(bytes, 7)));
      for (const parsed of [text, streamed]) {
        expect(parsed.markers.ids).toEqual(['m1']);
        expect(parsed.warnings).toContain('VCF: no ##fileformat line; parsed as VCF 4.2');
        expect(Array.from(parsed.genotypes.allele2)).toEqual([0, 1]);
      }
    });
  }
});
