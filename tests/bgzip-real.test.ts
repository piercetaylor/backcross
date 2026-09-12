/**
 * tests/support/bgzf.ts against htslib's own `bgzip`, when one is available.
 *
 * No htslib binary exists in this repository's environments, so this test
 * runs only when BGZIP_BIN names one (for example `BGZIP_BIN=bgzip npm
 * test`) and is otherwise skipped with that reason. It checks both
 * directions: `bgzip -d` inflates a stream framed by bgzfBlocks to the
 * original bytes, and a stream written by `bgzip` inflates through
 * src/io/decompress.ts to the original bytes.
 */
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { gunzipAll } from '../src/io/decompress.ts';
import { bgzfBlocks } from './support/bgzf.ts';
import { BENCH_SPEC, synthVcfLines } from './support/synth-vcf.ts';

const BGZIP_BIN = process.env['BGZIP_BIN'];

function run(args: string[], input: Uint8Array): Uint8Array {
  const res = spawnSync(BGZIP_BIN as string, args, { input, maxBuffer: 64 * 1024 * 1024 });
  if (res.error !== undefined) throw res.error;
  expect(res.status).toBe(0);
  return new Uint8Array(res.stdout);
}

describe.skipIf(BGZIP_BIN === undefined)(
  'BGZF framing against a real bgzip (skipped: BGZIP_BIN is not set)',
  () => {
    const text = Array.from(
      synthVcfLines({ ...BENCH_SPEC, nChrom: 3, markersPerChrom: 400, nCandidates: 20 }),
    ).join('');
    const bytes = new TextEncoder().encode(text);

    it('bgzip -d inflates a bgzfBlocks stream to the original bytes', () => {
      const framed = Buffer.concat(bgzfBlocks(bytes));
      expect(run(['-d', '-c'], framed)).toEqual(bytes);
    });

    it('gunzipAll inflates a bgzip-written stream to the original bytes', () => {
      expect(gunzipAll(run(['-c'], bytes))).toEqual(bytes);
    });
  },
);
