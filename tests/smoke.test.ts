/**
 * Smoke test: parse the synthetic fixture in every supported format, classify
 * parent of origin, compute RPP, and compare with the planted expectations.
 */
import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { classifyDataset, countInformative } from '../src/core/classify.ts';
import { computeRpp } from '../src/core/rpp.ts';
import { CallClass } from '../src/core/types.ts';
import { lineSummaryCsv } from '../src/export/summary-csv.ts';
import { assembleDataset, parseGenotypesBytes } from '../src/io/loaders.ts';
import { parseSampleManifest } from '../src/io/manifest.ts';
import { loadDataset, loadExpected, readFixture } from './helpers.ts';

const expected = loadExpected();
const CANDIDATES = Object.keys(expected.lines);

function classCounts(classes: Uint8Array, base: number, n: number) {
  const c = { rp_hom: 0, donor_hom: 0, het: 0, missing: 0, nonparental: 0, uninformative: 0 };
  for (let m = 0; m < n; m++) {
    switch (classes[base + m]) {
      case CallClass.RP_HOM:
        c.rp_hom++;
        break;
      case CallClass.DONOR_HOM:
        c.donor_hom++;
        break;
      case CallClass.HET:
        c.het++;
        break;
      case CallClass.MISSING:
        c.missing++;
        break;
      case CallClass.NONPARENTAL:
        c.nonparental++;
        break;
      default:
        c.uninformative++;
    }
  }
  return c;
}

describe('VCF fixture end to end', () => {
  const dataset = loadDataset('genotypes.vcf', 'vcf');
  const cls = classifyDataset(dataset);
  const rpp = computeRpp(dataset, cls, expected.params);

  it('loads the dataset with normalized chromosomes and sorted markers', () => {
    expect(dataset.genotypes.nMarkers).toBe(expected.nMarkers);
    expect(dataset.genotypes.nSamples).toBe(8);
    expect(dataset.chromosomeOrder).toHaveLength(20);
    expect(dataset.chromosomeOrder[0]).toBe('Gm01');
    expect(dataset.chromosomeOrder[19]).toBe('Gm20');
    expect(dataset.markers.cm).toBeDefined();
    expect(dataset.recurrentParentCol).toBe(0);
    expect(dataset.donorParentCol).toBe(1);
  });

  it('marks exactly the planted uninformative markers', () => {
    expect(countInformative(cls)).toBe(expected.nInformative);
    for (const [id, reason] of Object.entries(expected.markerReasons)) {
      const m = dataset.markers.ids.indexOf(id);
      expect(cls.informative[m], `${id} (${reason})`).toBe(0);
    }
  });

  it('classifies every candidate call as planted', () => {
    expect(Array.from(cls.candidateCols).map((i) => dataset.genotypes.sampleIds[i])).toEqual(
      CANDIDATES,
    );
    CANDIDATES.forEach((id, c) => {
      expect(classCounts(cls.classes, c * cls.nMarkers, cls.nMarkers), id).toEqual(
        expected.lines[id]?.counts,
      );
    });
  });

  it('computes count-, bp- and cM-weighted RPP matching the planted design', () => {
    CANDIDATES.forEach((id, c) => {
      const line = rpp[c];
      const exp = expected.lines[id];
      expect(line?.sampleId).toBe(id);
      expect(line?.overall.rppCount).toBeCloseTo(exp?.rppCount as number, 12);
      expect(line?.overall.rppBp).toBeCloseTo(exp?.rppBp as number, 12);
      expect(line?.overall.rppCm).toBeCloseTo(exp?.rppCm as number, 12);
      for (const row of line?.byChromosome ?? []) {
        const e = exp?.byChromosome[row.chrom];
        expect(row.nCalled, `${id} ${row.chrom}`).toBe(e?.nCalled);
        if (e?.rppCount === null) expect(Number.isNaN(row.rppCount)).toBe(true);
        else expect(row.rppCount).toBeCloseTo(e?.rppCount as number, 12);
      }
    });
  });

  it('flags the sample-swap pattern by RPP below 0.5', () => {
    const swap = rpp.find((l) => l.sampleId === 'NIL_05');
    expect(swap?.overall.rppCount).toBeLessThan(0.1);
    const clean = rpp.find((l) => l.sampleId === 'NIL_01');
    expect(clean?.overall.rppCount).toBeGreaterThan(0.98);
  });

  it('writes a per-line summary CSV with one row per candidate', () => {
    const csv = lineSummaryCsv(rpp, dataset.chromosomeOrder, dataset.samples, {
      tokenProfile: 'default',
    });
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(CANDIDATES.length + 1);
    expect(lines[0]?.startsWith('sample_id,call_set_db_id,sample_db_id,n_informative,')).toBe(true);
    expect(lines[0]?.endsWith('rpp_count_Gm20,token_profile')).toBe(true);
  });
});

describe('alternative genotype formats give the same classification', () => {
  const reference = classifyDataset(loadDataset('genotypes.vcf', 'vcf'));

  it('HapMap (chr-style chromosome names, two-letter cells)', () => {
    const cls = classifyDataset(loadDataset('genotypes.hmp.txt', 'hapmap'));
    expect(cls.classes).toEqual(reference.classes);
    expect(cls.informative).toEqual(reference.informative);
  });

  it('wide nucleotide CSV (numeric chromosome names, A/T heterozygotes)', () => {
    const cls = classifyDataset(loadDataset('genotypes_wide.csv', 'wide-csv'));
    expect(cls.classes).toEqual(reference.classes);
  });

  it('coded A/B/H CSV reproduces RPP (informative markers only)', () => {
    const dataset = loadDataset('genotypes_coded.csv', 'wide-csv');
    expect(dataset.coded).toBe(true);
    const cls = classifyDataset(dataset);
    expect(countInformative(cls)).toBe(expected.nInformative);
    const rpp = computeRpp(dataset, cls, expected.params);
    for (const line of rpp) {
      const exp = expected.lines[line.sampleId];
      expect(line.overall.rppCount).toBeCloseTo(exp?.rppCount as number, 12);
      expect(line.overall.rppBp).toBeCloseTo(exp?.rppBp as number, 12);
    }
  });

  it('gzip and bgzip-style multi-member input is inflated transparently', () => {
    const text = readFixture('genotypes.vcf');
    const cut = text.indexOf('\n', text.length / 2) + 1;
    const member1 = gzipSync(text.slice(0, cut));
    const member2 = gzipSync(text.slice(cut));
    const bytes = new Uint8Array(member1.length + member2.length);
    bytes.set(member1);
    bytes.set(member2, member1.length);
    const parsed = parseGenotypesBytes('genotypes.vcf.gz', bytes);
    const samples = parseSampleManifest(readFixture('samples.csv'));
    const cls = classifyDataset(assembleDataset(parsed, samples).dataset);
    expect(cls.classes).toEqual(reference.classes);
  });
});
