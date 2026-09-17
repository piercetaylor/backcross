/** Boundary validation: manifest rules, chromosome naming, delimited-text parsing. */
import { describe, expect, it } from 'vitest';

import { buildChromosomeOrder, normalizeChromosome } from '../src/core/chromosomes.ts';
import { MISSING_ALLELE } from '../src/core/types.ts';
import { HAPMAP_MISSING, NUCLEOTIDE_MISSING, parseNucleotideCell } from '../src/io/calls.ts';
import { parseDelimited, parseLine } from '../src/io/csv.ts';
import { parseHapMap } from '../src/io/hapmap.ts';
import { assembleDataset } from '../src/io/loaders.ts';
import { parseSampleManifest } from '../src/io/manifest.ts';
import { parseMarkerMap } from '../src/io/markers.ts';
import { parsePosition } from '../src/io/position.ts';
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
    for (const s of [
      'Gm07',
      'gm7',
      'Chr07',
      'chr7',
      '7',
      '07',
      'GM_07',
      'LG7',
      'Chromosome_07',
      'lg-7',
      'gm 7',
    ]) {
      expect(normalizeChromosome(s), s).toBe('Gm07');
    }
    expect(normalizeChromosome('Gm20')).toBe('Gm20');
    expect(normalizeChromosome('chr21')).toBe('chr21');
    expect(normalizeChromosome('scaffold_123')).toBe('scaffold_123');
    expect(normalizeChromosome('ch7')).toBe('ch7');
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

  it('skips blank lines, keeps # rows as data, and handles CRLF endings (contract 1.3.0)', () => {
    expect(parseDelimited('x,y\r\n\r\n# note\r\n1,2\r\n')).toEqual([
      ['x', 'y'],
      ['# note'],
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

  it('scans every row for A/B/H detection, not a leading window', () => {
    const header = 'marker_id,chrom,pos_bp,S1\n';
    const rows = (n: number, cell: string): string =>
      Array.from({ length: n }, (_, i) => `m${i},Gm01,${i + 1},${cell}`).join('\n') + '\n';
    expect(detectWideCsvMode(header + rows(2100, 'A') + 'late,Gm01,9999,B\n')).toBe('coded');
    expect(
      detectWideCsvMode(header + 'h,Gm01,1,H\n' + rows(2100, 'A') + 'late,Gm01,9999,T\n'),
    ).toBe('nucleotide');
  });

  it('treats the full nucleotide missing list as missing', () => {
    const text = 'marker_id,chrom,pos_bp,S1,S2,S3\nm1,Gm01,100,.|.,NN,--\nm2,Gm01,200,.,,A\n';
    const g = parseWideCsv(text, { mode: 'nucleotide' }).genotypes;
    expect(Array.from(g.allele1)).toEqual([255, 255, 255, 255, 255, 0]);
  });

  it('coded mode rejects nucleotide-only missing tokens', () => {
    const text = 'marker_id,chrom,pos_bp,S1,S2\nm1,Gm01,100,A,B\nm2,Gm01,200,H,--\n';
    expect(detectWideCsvMode(text)).toBe('coded');
    expect(() => parseWideCsv(text)).toThrow(/unexpected cell "--"/);
    expect(() =>
      parseWideCsv('marker_id,chrom,pos_bp,S1\nm1,Gm01,100,H\nm2,Gm01,200,NN\n'),
    ).toThrow(/unexpected cell "NN"/);
  });

  it('nucleotide mode expands IUPAC codes and rejects every other stray cell', () => {
    // T in S1 forces nucleotide detection even when the other cell is B or H.
    const row = (cell: string): string => `marker_id,chrom,pos_bp,S1,S2\nm1,Gm01,100,T,${cell}\n`;
    for (const bad of ['?', 'B', 'H', 'X', 'XX', '0', '+', 'A?', 'N?', 'RR']) {
      expect(detectWideCsvMode(row(bad)), bad).toBe('nucleotide');
      expect(() => parseWideCsv(row(bad)), bad).toThrow(`unexpected cell "${bad}"`);
    }
    const g = parseWideCsv(row('R')).genotypes;
    expect(Array.from(g.allele1)).toEqual([0, 1]);
    expect(Array.from(g.allele2)).toEqual([0, 2]);
  });
});

describe('nucleotide cell vocabulary (src/io/calls.ts)', () => {
  const wide = (cell: string) => parseNucleotideCell(cell, NUCLEOTIDE_MISSING, 'w');
  const hapmap = (cell: string) => parseNucleotideCell(cell, HAPMAP_MISSING, 'h');

  it('expands IUPAC codes to the heterozygote in both formats', () => {
    const expected: Record<string, [string, string]> = {
      R: ['A', 'G'],
      Y: ['C', 'T'],
      S: ['C', 'G'],
      W: ['A', 'T'],
      K: ['G', 'T'],
      M: ['A', 'C'],
    };
    for (const [code, pair] of Object.entries(expected)) {
      expect(wide(code), code).toEqual(pair);
      expect(hapmap(code.toLowerCase()), code).toEqual(pair);
    }
    expect(wide(' a/t ')).toEqual(['A', 'T']);
    expect(wide('G|C')).toEqual(['G', 'C']);
    expect(wide('AA')).toEqual(['A', 'A']);
    expect(wide('C')).toEqual(['C', 'C']);
  });

  it('reads the missing lists, X and XX in HapMap only', () => {
    for (const tok of ['', 'N', 'NN', 'NA', '-', '--', '.', './.', '.|.']) {
      expect(wide(tok), tok).toBeNull();
      expect(hapmap(tok), tok).toBeNull();
    }
    expect(hapmap('X')).toBeNull();
    expect(hapmap('XX')).toBeNull();
    expect(() => wide('X')).toThrow('w: unexpected cell "X"');
    expect(() => wide('XX')).toThrow('w: unexpected cell "XX"');
  });

  it('rejects every other cell in both formats', () => {
    for (const bad of ['?', 'B', 'H', '0', '+', 'Z', 'A?', 'N?', '?/?', 'RR', 'ACG', 'A//T']) {
      expect(() => wide(bad), bad).toThrow(`w: unexpected cell "${bad}"`);
      expect(() => hapmap(bad), bad).toThrow(`h: unexpected cell "${bad}"`);
    }
  });

  it('reads half-missing pairs as missing (undecided in 1.1.0; pins current behaviour)', () => {
    for (const cell of ['AN', 'A-', '-A', 'A.', './A', 'N/A']) {
      expect(wide(cell), cell).toBeNull();
      expect(hapmap(cell), cell).toBeNull();
    }
  });
});

describe('HapMap vocabulary', () => {
  const header =
    'rs#\talleles\tchrom\tpos\tstrand\tassembly#\tcenter\tprotLSID\tassayLSID\tpanelLSID\tQCcode\tS1\tS2\tS3\n';
  const fixed = '+\tNA\tNA\tNA\tNA\tNA\tNA';

  it("reads the contract's missing list including .|., X and XX", () => {
    const g = parseHapMap(
      header +
        `m1\tA/G\tGm01\t100\t${fixed}\t.|.\tX\tXX\n` +
        `m2\tA/G\tGm01\t200\t${fixed}\tR\tNA\tA\n`,
    ).genotypes;
    expect(Array.from(g.allele1)).toEqual([255, 255, 255, 0, 255, 0]);
    expect(Array.from(g.allele2)).toEqual([255, 255, 255, 1, 255, 0]);
  });

  it('rejects ?, +, 0 and single B or H naming the line', () => {
    for (const bad of ['?', '+', '0', 'B', 'H']) {
      expect(
        () => parseHapMap(header + `m1\tA/G\tGm01\t100\t${fixed}\tAA\tGG\t${bad}\n`),
        bad,
      ).toThrow(`HapMap line 2: unexpected cell "${bad}"`);
    }
  });
});

describe('positions (src/io/position.ts, contract 1.2.0)', () => {
  it('reads whole-valued decimal, float and exponent text as the integer', () => {
    const ok: [string, number][] = [
      ['1000', 1000],
      [' 1000 ', 1000],
      ['+1000', 1000],
      ['1000.', 1000],
      ['1000.0', 1000],
      ['1e3', 1000],
      ['1.0E3', 1000],
      ['1.9E+07', 19000000],
      ['1.5e3', 1500],
      ['0', 0],
    ];
    for (const [text, value] of ok) expect(parsePosition(text, 'p'), text).toBe(value);
  });

  it('rejects everything else naming the value', () => {
    const bad = [
      '',
      ' ',
      '100.7',
      '.5',
      '1e-3',
      '-5',
      'NaN',
      'Infinity',
      '1e400',
      '0x10',
      '1_000',
      '1,000',
      'abc',
    ];
    for (const text of bad) {
      expect(() => parsePosition(text, 'p'), text).toThrow(`p: invalid position "${text.trim()}"`);
    }
  });

  it("'digits' grammar (VCF POS): decimal digits only", () => {
    const ok: [string, number][] = [
      ['1000', 1000],
      ['01000', 1000],
    ];
    for (const [text, value] of ok) expect(parsePosition(text, 'p', 'digits'), text).toBe(value);
    for (const text of ['+1000', '1000.0', '1e3', '', '-5']) {
      expect(() => parsePosition(text, 'p', 'digits'), text).toThrow(
        `p: invalid position "${text}"`,
      );
    }
  });

  it('wide CSV: whole floats accepted, a fraction and an empty pos_bp rejected naming the line', () => {
    const g = parseWideCsv(
      'marker_id,chrom,pos_bp,S1,S2\nm1,Gm01,1000.0,A,T\nm2,Gm01,2e3,A,T\nm3,Gm01,3.0E3,A,T\nm4,Gm01,+4000,A,T\n',
    );
    expect(Array.from(g.markers.posBp)).toEqual([1000, 2000, 3000, 4000]);
    expect(() =>
      parseWideCsv('marker_id,chrom,pos_bp,S1,S2\nm1,Gm01,1000,A,T\nm2,Gm01,100.7,A,T\n'),
    ).toThrow('wide genotype CSV line 3: invalid position "100.7"');
    expect(() => parseWideCsv('marker_id,chrom,pos_bp,S1,S2\nm1,Gm01,,A,T\n')).toThrow(
      'wide genotype CSV line 2: invalid position ""',
    );
  });

  it('wide CSV: skips all-empty rows and rejects an empty marker_id naming the line', () => {
    const g = parseWideCsv(
      'marker_id,chrom,pos_bp,S1,S2\nm1,Gm01,100,A,T\n,,,,\n , , , , \nm2,Gm01,200,A,T\n',
    );
    expect(g.markers.ids).toEqual(['m1', 'm2']);
    expect(() =>
      parseWideCsv('marker_id,chrom,pos_bp,S1,S2\nm1,Gm01,100,A,T\n,Gm01,200,A,T\n'),
    ).toThrow('wide genotype CSV line 3: empty marker_id');
  });

  it('HapMap and VCF: whole floats accepted in HapMap, VCF POS digits only, a fraction rejected naming the line', () => {
    const header =
      'rs#\talleles\tchrom\tpos\tstrand\tassembly#\tcenter\tprotLSID\tassayLSID\tpanelLSID\tQCcode\tS1\tS2\n';
    const fixed = '+\tNA\tNA\tNA\tNA\tNA\tNA';
    const h = parseHapMap(
      header +
        `m1\tA/G\tGm01\t1e3\t${fixed}\tAA\tGG\n` +
        `m2\tA/G\tGm01\t2000.0\t${fixed}\tAA\tGG\n`,
    );
    expect(Array.from(h.markers.posBp)).toEqual([1000, 2000]);
    expect(() => parseHapMap(header + `m1\tA/G\tGm01\t100.7\t${fixed}\tAA\tGG\n`)).toThrow(
      'HapMap line 2: invalid position "100.7"',
    );
    const vcfHead =
      '##fileformat=VCFv4.2\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tS1\n';
    expect(() => parseVcf(vcfHead + 'Gm01\t1e3\tv1\tA\tG\t.\t.\t.\tGT\t0/1\n')).toThrow(
      'VCF line 3: invalid position "1e3"',
    );
    expect(() => parseVcf(vcfHead + 'Gm01\t2000.0\tv2\tA\tG\t.\t.\t.\tGT\t0/0\n')).toThrow(
      'VCF line 3: invalid position "2000.0"',
    );
    const v = parseVcf(vcfHead + 'Gm01\t01000\t.\tA\tG\t.\t.\t.\tGT\t0/1\n');
    expect(Array.from(v.markers.posBp)).toEqual([1000]);
    expect(v.markers.ids).toEqual(['Gm01_1000']);
    expect(() =>
      parseVcf(
        vcfHead + 'Gm01\t01000\t.\tA\tG\t.\t.\t.\tGT\t0/1\nGm01\t1000\t.\tA\tG\t.\t.\t.\tGT\t0/1\n',
      ),
    ).toThrow('duplicate marker id: Gm01_1000');
    expect(Object.is(parsePosition('-0.0', 'p'), 0)).toBe(true);
  });

  it('markers.csv: whole floats accepted, a fraction rejected naming the line', () => {
    const map = parseMarkerMap('marker_id,chrom,pos_bp,cm\nm1,6,1000.0,0.5\nm2,6,2e3,1.25\n');
    expect(map.get('m1')?.posBp).toBe(1000);
    expect(map.get('m2')).toEqual({ chrom: 'Gm06', posBp: 2000, cm: 1.25 });
    expect(() =>
      parseMarkerMap('marker_id,chrom,pos_bp,cm\nm1,6,1000,0.5\nm2,6,2000.25,\n'),
    ).toThrow('markers.csv line 3: invalid position "2000.25"');
  });
});
