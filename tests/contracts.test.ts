/** Boundary validation: manifest rules, chromosome naming, delimited-text parsing. */
import { describe, expect, it } from 'vitest';

import { buildChromosomeOrder, normalizeChromosome } from '../src/core/chromosomes.ts';
import { MISSING_ALLELE } from '../src/core/types.ts';
import { parseDelimited, parseLine } from '../src/io/csv.ts';
import { assembleDataset } from '../src/io/loaders.ts';
import { parseSampleManifest } from '../src/io/manifest.ts';
import { parseVcf } from '../src/io/vcf.ts';
import { detectWideCsvMode, parseWideCsv } from '../src/io/wide-csv.ts';
import { readFixture } from './helpers.ts';

describe('samples.csv contract', () => {
  it('requires exactly one recurrent parent', () => {
    const text =
      'sample_id,role\nA,recurrent_parent\nB,recurrent_parent\nC,donor_parent\nD,candidate\n';
    expect(() => parseSampleManifest(text)).toThrow(/exactly one recurrent_parent/);
  });

  it('rejects unknown roles and duplicate ids', () => {
    expect(() => parseSampleManifest('sample_id,role\nA,parent\n')).toThrow(/role "parent"/);
    expect(() =>
      parseSampleManifest('sample_id,role\nA,recurrent_parent\nA,donor_parent\nB,candidate\n'),
    ).toThrow(/duplicate sample_id/);
  });

  it('defaults line_name to sample_id and accepts tab-delimited input', () => {
    const rows = parseSampleManifest(
      'sample_id\trole\nRP\trecurrent_parent\nD\tdonor_parent\nX\tcandidate\n',
    );
    expect(rows[2]?.lineName).toBe('X');
    expect(rows[2]?.familyId).toBe('');
  });

  it('fails when a manifest sample is absent from the genotype file', () => {
    const parsed = parseVcf(readFixture('genotypes.vcf'));
    const samples = parseSampleManifest(
      'sample_id,role\nRP_Williams,recurrent_parent\nDONOR_PI,donor_parent\nGHOST,candidate\n',
    );
    expect(() => assembleDataset(parsed, samples)).toThrow(/GHOST/);
  });
});

describe('chromosome naming', () => {
  it('normalizes accepted spellings to Gm01..Gm20 and keeps scaffolds', () => {
    for (const s of ['Gm07', 'gm7', 'Chr07', 'chr7', '7', '07', 'GM_07', 'LG7']) {
      expect(normalizeChromosome(s), s).toBe('Gm07');
    }
    expect(normalizeChromosome('Gm20')).toBe('Gm20');
    expect(normalizeChromosome('chr21')).toBe('chr21');
    expect(normalizeChromosome('scaffold_123')).toBe('scaffold_123');
  });

  it('orders nuclear chromosomes numerically before scaffolds', () => {
    expect(buildChromosomeOrder(['scaffold_10', 'Gm10', 'scaffold_2', 'Gm02', 'Gm01'])).toEqual([
      'Gm01',
      'Gm02',
      'Gm10',
      'scaffold_2',
      'scaffold_10',
    ]);
  });
});

describe('delimited text', () => {
  it('handles quoted fields with embedded delimiters and doubled quotes', () => {
    expect(parseLine('a,"b,c","d ""e""",f', ',')).toEqual(['a', 'b,c', 'd "e"', 'f']);
  });

  it('skips blank and comment lines and CRLF endings', () => {
    expect(parseDelimited('x,y\r\n\r\n# note\r\n1,2\r\n')).toEqual([
      ['x', 'y'],
      ['1', '2'],
    ]);
  });
});

describe('wide CSV vocabulary', () => {
  const coded = 'marker_id,chrom,pos_bp,S1,S2\nm1,Gm01,100,A,B\nm2,Gm01,200,H,N\n';
  const nucleotide = 'marker_id,chrom,pos_bp,S1,S2\nm1,Gm01,100,A,T\nm2,Gm01,200,A/T,NA\n';

  it('auto-detects coded versus nucleotide cells', () => {
    expect(detectWideCsvMode(coded)).toBe('coded');
    expect(detectWideCsvMode(nucleotide)).toBe('nucleotide');
  });

  it('stores unordered allele pairs with 255 for missing', () => {
    const g = parseWideCsv(nucleotide).genotypes;
    expect(Array.from(g.allele1)).toEqual([0, 1, 0, MISSING_ALLELE]);
    expect(Array.from(g.allele2)).toEqual([0, 1, 1, MISSING_ALLELE]);
    const c = parseWideCsv(coded);
    expect(c.coded).toBe(true);
    expect(Array.from(c.genotypes.allele2)).toEqual([0, 1, 1, MISSING_ALLELE]);
  });
});
