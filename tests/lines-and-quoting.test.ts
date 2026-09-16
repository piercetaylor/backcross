/**
 * Contract 1.3.0, "Lines and rows": blank and whitespace-only lines, `#` as
 * data, quoted line breaks, and the delimiter sniff and format detection on
 * the first non-blank line (docs/adr/0018).
 */
import { describe, expect, it } from 'vitest';

import { forEachRow, sniffDelimiter } from '../src/io/csv.ts';
import { parseHapMap } from '../src/io/hapmap.ts';
import { detectGenotypeFormat, parseGenotypesSource } from '../src/io/loaders.ts';
import { parseSampleManifest } from '../src/io/manifest.ts';
import { parseMarkerMap } from '../src/io/markers.ts';
import { bytesOf, lines } from '../src/io/stream.ts';
import { parseVcf, parseVcfLines } from '../src/io/vcf.ts';

function rows(text: string): { fields: string[]; line: number }[] {
  const out: { fields: string[]; line: number }[] = [];
  forEachRow(text, ',', (fields, line) => out.push({ fields, line }));
  return out;
}

const tsv = (...cells: string[]): string => cells.join('\t');
const HAPMAP_HEADER = tsv(
  'rs#',
  'alleles',
  'chrom',
  'pos',
  'strand',
  'assembly#',
  'center',
  'protLSID',
  'assayLSID',
  'panelLSID',
  'QCcode',
  'RP',
  'DONOR',
  'L1',
);
const HAPMAP_R1 = tsv(
  'r1',
  'A/G',
  'Gm02',
  '1000',
  '+',
  'NA',
  'NA',
  'NA',
  'NA',
  'NA',
  'NA',
  'AA',
  'GG',
  'AA',
);
const HAPMAP_R2 = tsv(
  'r2',
  'C/T',
  'Gm02',
  '2000',
  '+',
  'NA',
  'NA',
  'NA',
  'NA',
  'NA',
  'NA',
  'CC',
  'TT',
  'TT',
);
/** The text of contract case hapmap-blank-lines-skipped. */
const HAPMAP_CASE =
  ['  ', HAPMAP_HEADER, HAPMAP_R1, '\t'.repeat(13), '', HAPMAP_R2].join('\n') + '\n';

const VCF_CHROM = '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tRP\tDONOR\tL1';
const VCF_R1 = 'Gm02\t1000\tr1\tA\tG\t.\t.\t.\tGT\t0/0\t1/1\t0/0';
const VCF_R2 = 'Gm02\t2000\tr2\tC\tT\t.\t.\t.\tGT\t0/0\t1/1\t1/1';
/** The text of contract case vcf-blank-lines-skipped. */
const VCF_CASE =
  ['', '##fileformat=VCFv4.2', '   ', VCF_CHROM, VCF_R1, '\t\t', VCF_R2, ' '].join('\n') + '\n';

describe('forEachRow', () => {
  it('reads a quoted field with an embedded newline as one row', () => {
    expect(rows('a,"b\nc",d\ne,f,g\n')).toEqual([
      { fields: ['a', 'b\nc', 'd'], line: 1 },
      { fields: ['e', 'f', 'g'], line: 3 },
    ]);
  });

  it('handles doubled quotes inside a quoted field that spans lines', () => {
    expect(rows('a,"say ""hi""\nthere"\nx,y\n')).toEqual([
      { fields: ['a', 'say "hi"\nthere'], line: 1 },
      { fields: ['x', 'y'], line: 3 },
    ]);
  });

  it('throws for a quoted field still open at the end of the text, naming the line it opened on', () => {
    expect(() => rows('a,b\nc,"d\ne\nf')).toThrow(/line 2: unterminated quoted field/);
    expect(() => rows('a,b\r\nc,d\r\n"e\r\n')).toThrow(/line 3: unterminated quoted field/);
  });

  it('reads a quote that is not at the start of a field as a literal character', () => {
    expect(rows('m1,6" pot,x\nm2,Gm01,2"00\nm3,Gm01,300\n')).toEqual([
      { fields: ['m1', '6" pot', 'x'], line: 1 },
      { fields: ['m2', 'Gm01', '2"00'], line: 2 },
      { fields: ['m3', 'Gm01', '300'], line: 3 },
    ]);
    expect(rows('a,b"c"\n')).toEqual([{ fields: ['a', 'b"c"'], line: 1 }]);
  });

  it('appends text after a closing quote to the field, as Python csv does', () => {
    expect(rows('"x"y,z\n')).toEqual([{ fields: ['xy', 'z'], line: 1 }]);
  });

  it('is linear: a stray opening quote on row 2 followed by 20,000 rows fails in under 1 s', () => {
    const text = 'a,b\n"x,y\n' + 'a,b\n'.repeat(20000);
    const t0 = performance.now();
    expect(() => rows(text)).toThrow(/line 2: unterminated quoted field/);
    expect(performance.now() - t0).toBeLessThan(1000);
  });

  it('skips a row of only spaces and tabs but keeps a row holding a no-break space', () => {
    const nbsp = String.fromCharCode(0xa0);
    expect(rows(`x,y\n \t, \n${nbsp},\n`)).toEqual([
      { fields: ['x', 'y'], line: 1 },
      { fields: [nbsp, ''], line: 3 },
    ]);
  });

  it('keeps a row beginning with # as data', () => {
    expect(rows('#a,b\n')).toEqual([{ fields: ['#a', 'b'], line: 1 }]);
  });

  it('skips whitespace-only, empty and all-empty rows while still counting their lines', () => {
    expect(rows('x,y\n \t \n\n,,\n1,2\n')).toEqual([
      { fields: ['x', 'y'], line: 1 },
      { fields: ['1', '2'], line: 5 },
    ]);
  });

  it('handles CRLF throughout, including inside a quoted field', () => {
    expect(rows('x,y\r\n\r\n"a\r\nb",c\r\n1,2\r\n')).toEqual([
      { fields: ['x', 'y'], line: 1 },
      { fields: ['a\nb', 'c'], line: 3 },
      { fields: ['1', '2'], line: 5 },
    ]);
  });
});

describe('sniffDelimiter', () => {
  it('reads the first line that is not blank', () => {
    expect(sniffDelimiter('\n   \na\tb\n')).toBe('\t');
    expect(sniffDelimiter('   \na,b\n')).toBe(',');
  });

  it('sniffs a comma from all-blank text', () => {
    expect(sniffDelimiter('\n\n')).toBe(',');
  });
});

describe('detectGenotypeFormat with leading blank lines', () => {
  it('detects HapMap, VCF and wide CSV from the first non-blank line', () => {
    expect(detectGenotypeFormat('x.txt', `\n  \n${HAPMAP_HEADER}\n`)).toBe('hapmap');
    expect(detectGenotypeFormat('x.txt', `\n##fileformat=VCFv4.2\n${VCF_CHROM}\n`)).toBe('vcf');
    expect(detectGenotypeFormat('x.txt', '\nmarker_id,chrom,pos_bp,S\n')).toBe('wide-csv');
  });

  it('loads a .txt HapMap with a leading blank line through the streaming head window', async () => {
    const parsed = await parseGenotypesSource(
      'x.txt',
      bytesOf(new TextEncoder().encode(HAPMAP_CASE)),
    );
    expect(parsed.markers.ids).toEqual(['r1', 'r2']);
  });
});

describe('parseHapMap', () => {
  it('loads when a blank line precedes the header', () => {
    const parsed = parseHapMap(`\n${HAPMAP_HEADER}\n${HAPMAP_R1}\n`);
    expect(parsed.markers.ids).toEqual(['r1']);
    expect(parsed.genotypes.sampleIds).toEqual(['RP', 'DONOR', 'L1']);
  });

  it('rejects a # line before the header', () => {
    expect(() => parseHapMap(`# note\n${HAPMAP_HEADER}\n${HAPMAP_R1}\n`)).toThrow(
      /"rs#" not found/,
    );
  });

  it('reads a #-prefixed body row as data, which fails the column count', () => {
    expect(() => parseHapMap(`${HAPMAP_HEADER}\n${HAPMAP_R1}\n# note\n`)).toThrow(
      /1 columns, header has 14/,
    );
  });
});

describe('parseVcf and parseVcfLines', () => {
  it('load the blank-line case identically', async () => {
    const fromText = parseVcf(VCF_CASE);
    const { parsed } = await parseVcfLines(lines(bytesOf(new TextEncoder().encode(VCF_CASE))));
    expect(fromText.markers.ids).toEqual(['r1', 'r2']);
    expect(parsed).toEqual(fromText);
  });

  it('reject a # line after #CHROM as a data line', async () => {
    const text = ['##fileformat=VCFv4.2', VCF_CHROM, VCF_R1, '# a note', VCF_R2].join('\n') + '\n';
    expect(() => parseVcf(text)).toThrow(/line 4: line beginning with "#" after the #CHROM header/);
    await expect(parseVcfLines(lines(bytesOf(new TextEncoder().encode(text))))).rejects.toThrow(
      /after the #CHROM header/,
    );
  });

  it('reject a second #CHROM line with the right field count', () => {
    const text = ['##fileformat=VCFv4.2', VCF_CHROM, VCF_R1, VCF_CHROM, VCF_R2].join('\n') + '\n';
    expect(() => parseVcf(text)).toThrow(/line 4: line beginning with "#" after the #CHROM header/);
  });
});

describe('samples.csv and markers.csv rows', () => {
  it('keeps a #-prefixed sample_id as written', () => {
    const records = parseSampleManifest(
      'sample_id,role\nRP,recurrent_parent\nDONOR,donor_parent\n#L1,candidate\n',
    );
    expect(records.map((r) => r.sampleId)).toEqual(['RP', 'DONOR', '#L1']);
  });

  it('skips all-empty and whitespace-only markers.csv rows', () => {
    const map = parseMarkerMap('marker_id,chrom,pos_bp,cm\n,,,\nr1,Gm02,1500,1.5\n  \n');
    expect([...map.keys()]).toEqual(['r1']);
  });

  it('still rejects an empty marker_id in a row that is not all-empty', () => {
    expect(() => parseMarkerMap('marker_id,chrom,pos_bp\n,Gm02,1000\n')).toThrow(/empty marker_id/);
  });
});
