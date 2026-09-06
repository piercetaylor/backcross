/** Shared fixture loading for tests. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Dataset } from '../src/core/types.ts';
import { assembleDataset, parseGenotypesText } from '../src/io/loaders.ts';
import type { GenotypeFormat } from '../src/io/loaders.ts';
import { parseSampleManifest } from '../src/io/manifest.ts';
import { parseMarkerMap } from '../src/io/markers.ts';

export const FIXTURE_DIR = join(import.meta.dirname, 'fixtures', 'synthetic');

export interface ExpectedLine {
  counts: Record<
    'rp_hom' | 'donor_hom' | 'het' | 'missing' | 'nonparental' | 'uninformative',
    number
  >;
  rppCount: number;
  rppBp: number;
  rppCm: number;
  byChromosome: Record<string, { nCalled: number; rppCount: number | null; rppBp: number | null }>;
}

export interface Expected {
  nMarkers: number;
  nInformative: number;
  lines: Record<string, ExpectedLine>;
  params: { maxGapBp: number; maxGapCm: number };
  markerReasons: Record<string, string>;
}

export function readFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8');
}

export function loadExpected(): Expected {
  return JSON.parse(readFixture('expected.json')) as Expected;
}

export function loadDataset(
  genotypeFile: string,
  format: GenotypeFormat,
  withMarkers = true,
): Dataset {
  const parsed = parseGenotypesText(readFixture(genotypeFile), format);
  const samples = parseSampleManifest(readFixture('samples.csv'));
  const map = withMarkers ? parseMarkerMap(readFixture('markers.csv')) : undefined;
  return assembleDataset(parsed, samples, map).dataset;
}
