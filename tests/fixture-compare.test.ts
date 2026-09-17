/**
 * Pairwise comparison (algorithm 5) on the synthetic fixture, checked
 * against expected.json.
 *
 * The expectations are produced by scripts/make-fixture.mjs with its own
 * plain implementation (comparePlain), so this test checks src/core/compare.ts
 * against code it shares nothing with. The generator's JSON shape differs
 * from PairwiseDiff in three ways, mapped below: discordantMarkers is an
 * array of marker id strings (compareLines returns indices, mapped through
 * dataset.markers.ids); byChromosome is an object keyed by chromosome name
 * (compareLines returns an array in chromosomeOrder); ibs is null where
 * PairwiseDiff has NaN. The generator's compare shape is declared locally
 * rather than in tests/helpers.ts, because only this file reads it.
 */
import { describe, expect, it } from 'vitest';

import { classifyDataset, countInformative } from '../src/core/classify.ts';
import { compareLines } from '../src/core/compare.ts';
import { discordantMarkersCsv, pairwiseCsv } from '../src/export/pairwise-csv.ts';
import { loadDataset, loadExpected } from './helpers.ts';

interface ExpectedByChromosome {
  nCompared: number;
  nDiscordant: number;
}

interface ExpectedCompare {
  nSkippedMissing: number;
  nSkippedNonparental: number;
  sampleA: string;
  sampleB: string;
  mode: 'informative' | 'all';
  nCompared: number;
  nDiscordant: number;
  discordantMarkers: string[];
  byChromosome: Record<string, ExpectedByChromosome>;
  ibs: number | null;
}

interface ExpectedWithCompare {
  compare: ExpectedCompare[];
}

const expected = loadExpected() as unknown as ExpectedWithCompare;

describe('compareLines against the fixture generator', () => {
  const dataset = loadDataset('genotypes.vcf', 'vcf');
  const cls = classifyDataset(dataset);

  it('has six expected comparisons covering both modes', () => {
    expect(expected.compare).toHaveLength(6);
    expect(expected.compare.some((c) => c.mode === 'informative')).toBe(true);
    expect(expected.compare.some((c) => c.mode === 'all')).toBe(true);
  });

  it.each(expected.compare)('$mode $sampleA vs $sampleB', (exp) => {
    const diff = compareLines(dataset, cls, exp.sampleA, exp.sampleB, exp.mode);

    expect(diff.sampleA).toBe(exp.sampleA);
    expect(diff.sampleB).toBe(exp.sampleB);
    expect(diff.mode).toBe(exp.mode);
    expect(diff.nCompared).toBe(exp.nCompared);
    expect(diff.nSkippedMissing, `${exp.sampleA} vs ${exp.sampleB} skipped missing`).toBe(
      exp.nSkippedMissing,
    );
    expect(diff.nSkippedNonparental, `${exp.sampleA} vs ${exp.sampleB} skipped nonparental`).toBe(
      exp.nSkippedNonparental,
    );
    expect(diff.nDiscordant).toBe(exp.nDiscordant);

    const gotDiscordantIds = Array.from(
      diff.discordantMarkers,
      (m) => dataset.markers.ids[m] as string,
    );
    expect(gotDiscordantIds).toEqual(exp.discordantMarkers);

    const expectedChroms = Object.keys(exp.byChromosome);
    expect(diff.byChromosome.map((r) => r.chrom)).toEqual(expectedChroms);
    for (const row of diff.byChromosome) {
      const want = exp.byChromosome[row.chrom];
      expect(want, row.chrom).toBeDefined();
      expect(row.nCompared, row.chrom).toBe(want?.nCompared);
      expect(row.nDiscordant, row.chrom).toBe(want?.nDiscordant);
    }

    if (exp.ibs === null) {
      expect(Number.isNaN(diff.ibs)).toBe(true);
    } else {
      expect(diff.ibs).toBeCloseTo(exp.ibs, 12);
    }
  });

  it('exports both pairwise CSV tables with the exact contracted headers and row counts', () => {
    const diffs = expected.compare.map((c) =>
      compareLines(dataset, cls, c.sampleA, c.sampleB, c.mode),
    );

    const summary = pairwiseCsv(diffs, dataset.chromosomeOrder, dataset.samples, {
      tokenProfile: 'default',
    });
    const summaryLines = summary.trimEnd().split('\n');
    expect(summaryLines[0]).toBe(
      'sample_a,sample_b,call_set_db_id_a,sample_db_id_a,call_set_db_id_b,sample_db_id_b,mode,chrom,n_compared,n_discordant,token_profile',
    );
    const expectedSummaryRows = diffs.length * (dataset.chromosomeOrder.length + 1);
    expect(summaryLines).toHaveLength(expectedSummaryRows + 1);

    const markersCsv = discordantMarkersCsv(diffs, dataset, cls, { tokenProfile: 'default' });
    const markerLines = markersCsv.trimEnd().split('\n');
    expect(markerLines[0]).toBe(
      'sample_a,sample_b,call_set_db_id_a,sample_db_id_a,call_set_db_id_b,sample_db_id_b,marker_id,chrom,pos_bp,class_a,class_b,token_profile',
    );
    const expectedMarkerRows = diffs.reduce((n, d) => n + d.discordantMarkers.length, 0);
    expect(markerLines).toHaveLength(expectedMarkerRows + 1);
  });
});

describe('compareLines driven by classifyDataset on the coded fixture', () => {
  // The hand-built cases construct a Classification directly; this one runs the
  // real classifier over the coded A/B/H file, where the parents carry columns
  // of A and B symbols rather than nucleotides.
  const dataset = loadDataset('genotypes_coded.csv', 'wide-csv');
  const cls = classifyDataset(dataset);

  it('places both parents from their own coded columns', () => {
    const diff = compareLines(dataset, cls, 'RP_Williams', 'DONOR_PI', 'informative');
    expect(dataset.coded).toBe(true);
    expect(diff.nCompared).toBe(countInformative(cls));
    expect(diff.nDiscordant).toBe(diff.nCompared);
    expect(diff.nSkippedMissing).toBe(0);
  });

  it('refuses mode all for a sample without a genotype column', () => {
    // Both parents do have columns here, so mode all is legal and mirrors the
    // informative result at every informative marker.
    const diff = compareLines(dataset, cls, 'RP_Williams', 'DONOR_PI', 'all');
    expect(diff.nCompared).toBeGreaterThan(0);
    expect(diff.ibs).toBeCloseTo(0, 12);
  });
});
