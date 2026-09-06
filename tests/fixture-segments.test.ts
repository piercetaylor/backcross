/**
 * Donor segments on the synthetic fixture, checked against expected.json.
 *
 * The expectations are produced by scripts/make-fixture.mjs with its own plain
 * implementation of the run-breaking rule (docs/adr/0008), so this test checks
 * src/core/segments.ts against code it shares nothing with. Both gap
 * criteria are exercised: cM when markers.csv is loaded, bp when it is not.
 */
import { describe, expect, it } from 'vitest';

import { classifyDataset } from '../src/core/classify.ts';
import { callSegments, segmentGapCriterion } from '../src/core/segments.ts';
import type { DonorSegment } from '../src/core/types.ts';
import { segmentsCsv } from '../src/export/segments-csv.ts';
import { loadDataset, loadExpected } from './helpers.ts';
import type { ExpectedSegment } from './helpers.ts';

const expected = loadExpected();
const CANDIDATES = Object.keys(expected.lines);

/** Strip sampleId and map NaN to null so a DonorSegment compares with the JSON form. */
function comparable(s: DonorSegment): ExpectedSegment {
  const nz = (x: number) => (Number.isNaN(x) ? null : x);
  return {
    chrom: s.chrom,
    startBp: s.startBp,
    endBp: s.endBp,
    leftFlankBp: nz(s.leftFlankBp),
    rightFlankBp: nz(s.rightFlankBp),
    nMarkers: s.nMarkers,
    nDonorHom: s.nDonorHom,
    nHet: s.nHet,
    class: s.class,
    startCm: nz(s.startCm),
    endCm: nz(s.endCm),
  };
}

describe.each([
  { label: 'with markers.csv (cM criterion)', withMarkers: true, criterion: 'cm' as const },
  { label: 'without markers.csv (bp criterion)', withMarkers: false, criterion: 'bp' as const },
])('callSegments $label', ({ withMarkers, criterion }) => {
  const dataset = loadDataset('genotypes.vcf', 'vcf', withMarkers);
  const cls = classifyDataset(dataset);

  it('selects the criterion from the presence of a genetic map', () => {
    expect(segmentGapCriterion(dataset)).toBe(criterion);
  });

  it('reproduces every planted segment with exact start, end and flank positions', () => {
    CANDIDATES.forEach((id, c) => {
      const got = callSegments(dataset, cls, c, expected.segmentParams).map(comparable);
      expect(got, id).toEqual(expected.segments[criterion][id]);
      for (const s of callSegments(dataset, cls, c, expected.segmentParams)) {
        expect(s.sampleId).toBe(id);
      }
    });
  });

  it('recovers the planted design on the lines that name a segment', () => {
    const byId = Object.fromEntries(
      CANDIDATES.map((id, c) => [id, callSegments(dataset, cls, c, expected.segmentParams)]),
    );
    // NIL_04: Gm13 markers 9-15 with 11-12 missing inside is one segment, not
    // two, because the gap is measured between consecutive markers and the two
    // skipped calls sit within maxMissingSpan; Gm05 1-5 starts at the
    // chromosome end so its left flank is NaN.
    const nil04 = byId.NIL_04 as DonorSegment[];
    expect(nil04.map((s) => s.chrom)).toEqual(['Gm05', 'Gm13']);
    expect(Number.isNaN(nil04[0]?.leftFlankBp as number)).toBe(true);
    expect(nil04[1]).toMatchObject({ startBp: 17_000_000, endBp: 29_000_000, nMarkers: 5 });
    // NIL_06: the het segment on the non-uniformly spaced Gm12 is one run to
    // the chromosome end.
    const nil06 = byId.NIL_06 as DonorSegment[];
    expect(nil06).toHaveLength(1);
    expect(nil06[0]).toMatchObject({ chrom: 'Gm12', class: 'het', nMarkers: 14 });
    expect(Number.isNaN(nil06[0]?.rightFlankBp as number)).toBe(true);
    // NIL_02: a het segment and a donor segment on different chromosomes.
    expect((byId.NIL_02 as DonorSegment[]).map((s) => s.class)).toEqual(['het', 'donor']);
  });

  it('drops the isolated single donor call on NIL_03 unless short runs are requested', () => {
    const c = CANDIDATES.indexOf('NIL_03');
    expect(callSegments(dataset, cls, c, expected.segmentParams)).toEqual([]);
    const short = callSegments(dataset, cls, c, expected.segmentParams, true);
    expect(short).toHaveLength(1);
    expect(short[0]).toMatchObject({ chrom: 'Gm18', nMarkers: 1, class: 'donor' });
  });

  it('writes the segments CSV with the documented columns and the criterion', () => {
    const all = CANDIDATES.flatMap((_, c) => callSegments(dataset, cls, c, expected.segmentParams));
    const csv = segmentsCsv(all, segmentGapCriterion(dataset));
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe(
      'sample_id,chrom,start_bp,end_bp,left_flank_bp,right_flank_bp,n_markers,n_donor_hom,n_het,class,start_cm,end_cm,length_bp,length_cm,gap_criterion',
    );
    expect(lines).toHaveLength(all.length + 1);
    for (const row of lines.slice(1)) expect(row.endsWith(`,${criterion}`)).toBe(true);
    const nil01 = lines.find((l) => l.startsWith('NIL_01,'));
    if (withMarkers) expect(nil01).toMatch(/,donor,50\.400000,64\.800000,6000000,14\.400000,cm$/);
    else expect(nil01).toMatch(/,donor,NA,NA,6000000,NA,bp$/);
  });
});
