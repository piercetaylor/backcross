/**
 * The scale-test generator and the BGZF framer, checked against the real
 * parser in Node before any browser test relies on them.
 *
 * `synthCounts` is what the 50K x 200 bench asserts the loaded dataset
 * against, so it must agree with what src/io and src/core derive from the
 * generated text; and a BGZF-framed copy must inflate, through the
 * multi-member path src/io/decompress.ts already uses, to the same bytes.
 */
import { describe, expect, it } from 'vitest';

import { classifyDataset, countInformative } from '../src/core/classify.ts';
import { gunzipAll } from '../src/io/decompress.ts';
import { assembleDataset, parseGenotypesText } from '../src/io/loaders.ts';
import { parseSampleManifest } from '../src/io/manifest.ts';
import { parseMarkerMap } from '../src/io/markers.ts';
import { BGZF_EOF, bgzfBlocks } from './support/bgzf.ts';
import {
  BENCH_SPEC,
  synthCounts,
  synthMarkersCsv,
  synthSamplesCsv,
  synthVcfLines,
} from './support/synth-vcf.ts';
import type { SynthSpec } from './support/synth-vcf.ts';

const SMALL: SynthSpec = { ...BENCH_SPEC, nChrom: 4, markersPerChrom: 150, nCandidates: 12 };

function vcfText(spec: SynthSpec): string {
  return Array.from(synthVcfLines(spec)).join('');
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

describe('synthetic VCF generator', () => {
  it('is deterministic', () => {
    expect(vcfText(SMALL)).toBe(vcfText(SMALL));
    expect(synthMarkersCsv(SMALL)).toBe(synthMarkersCsv(SMALL));
  });

  it('parses to exactly the counts synthCounts reports', () => {
    const counts = synthCounts(SMALL);
    const parsed = parseGenotypesText(vcfText(SMALL), 'vcf');
    const { dataset } = assembleDataset(
      parsed,
      parseSampleManifest(synthSamplesCsv(SMALL)),
      parseMarkerMap(synthMarkersCsv(SMALL)),
    );
    expect(dataset.genotypes.nMarkers).toBe(counts.nMarkers);
    expect(dataset.genotypes.nSamples).toBe(counts.nSamples);
    expect(countInformative(classifyDataset(dataset))).toBe(counts.nInformative);
    // Both uninformative classes occur, so the count is not trivially nMarkers.
    expect(counts.nInformative).toBeLessThan(counts.nMarkers);
  });

  it('gives the bench its 50,000 markers by 202 samples', () => {
    const counts = synthCounts(BENCH_SPEC);
    expect(counts.nMarkers).toBe(50_000);
    expect(counts.nSamples).toBe(202);
  });
});

describe('bgzfBlocks', () => {
  const bytes = new TextEncoder().encode(vcfText(SMALL));
  const blocks = bgzfBlocks(bytes, 4096);

  it('frames every member with a BC extra field whose BSIZE is its length minus one', () => {
    expect(blocks).toHaveLength(Math.ceil(bytes.length / 4096) + 1);
    for (const b of blocks) {
      expect([b[0], b[1], b[2]]).toEqual([0x1f, 0x8b, 0x08]);
      expect((b[3] as number) & 4).toBe(4);
      expect([b[10], b[11], b[12], b[13], b[14], b[15]]).toEqual([6, 0, 0x42, 0x43, 2, 0]);
      expect(((b[16] as number) | ((b[17] as number) << 8)) + 1).toBe(b.length);
    }
    expect(blocks[blocks.length - 1]).toEqual(BGZF_EOF);
  });

  it('inflates through gunzipAll to the original bytes', () => {
    expect(gunzipAll(concat(blocks))).toEqual(bytes);
  });

  it('frames empty input as the EOF block alone', () => {
    expect(bgzfBlocks(new Uint8Array(0))).toEqual([BGZF_EOF]);
  });
});
