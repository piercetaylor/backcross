/**
 * Crop chromosome schemes (contract 1.5.0, docs/adr/0020; src/io/crops.ts and
 * the scheme-aware functions of src/core/chromosomes.ts).
 *
 * The files under contract/crops/ are read from disk here, not imported, so
 * the test checks the committed contract rather than a bundler's view of it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildChromosomeOrder,
  compareChromosomes,
  compileScheme,
  isNuclearChromosome,
  normalizeChromosome,
  SOYBEAN_SCHEME,
} from '../src/core/chromosomes.ts';
import type { CropScheme } from '../src/core/chromosomes.ts';
import { BUILTIN_CROPS, resolveCrop, validateScheme } from '../src/io/crops.ts';
import { parseLocus } from '../src/core/targets.ts';
import { parseHapMap } from '../src/io/hapmap.ts';
import { parseMarkerMap } from '../src/io/markers.ts';
import { parseVcf, parseVcfLines } from '../src/io/vcf.ts';
import { bytesOf } from '../src/io/stream.ts';
import { parseGenotypesSource } from '../src/io/loaders.ts';

const CROPS = join(import.meta.dirname, '..', 'contract', 'crops');
const fileNames = readdirSync(CROPS).sort();

const read = (name: string): unknown => JSON.parse(readFileSync(join(CROPS, name), 'utf8'));

const maize = resolveCrop('maize');
const cotton = resolveCrop('cotton');
const oat = resolveCrop('oat');

describe('contract/crops files', () => {
  it('ships the nine schemes of contract 1.5.0', () => {
    expect(fileNames).toEqual([
      'barley.json',
      'common-bean.json',
      'cotton.json',
      'maize.json',
      'oat.json',
      'rice.json',
      'sorghum.json',
      'soybean.json',
      'wheat.json',
    ]);
    expect([...BUILTIN_CROPS.keys()]).toEqual([
      'soybean',
      'maize',
      'rice',
      'sorghum',
      'wheat',
      'barley',
      'oat',
      'common-bean',
      'cotton',
    ]);
  });

  for (const name of fileNames) {
    it(`${name} validates, is named after its id, and compiles`, () => {
      const scheme = validateScheme(read(name));
      expect(scheme.id).toBe(name.replace(/\.json$/, ''));
      expect(scheme.chromosomes).toHaveLength(scheme.keys.length);
      expect(new Set(scheme.keys).size).toBe(scheme.keys.length);
      expect(() => new RegExp(scheme.pattern, 'i')).not.toThrow();
    });

    it(`${name}: every canonical name normalises to itself`, () => {
      const compiled = compileScheme(validateScheme(read(name)));
      for (const canonical of compiled.scheme.chromosomes) {
        expect(normalizeChromosome(canonical, compiled), canonical).toBe(canonical);
      }
    });
  }

  it('SOYBEAN_SCHEME is the literal of soybean.json', () => {
    expect(SOYBEAN_SCHEME).toEqual(read('soybean.json'));
  });
});

describe('normalizeChromosome under a scheme', () => {
  it('leaves LG7 unchanged under maize: the lg prefix is soybean-only', () => {
    expect(normalizeChromosome('LG7', maize)).toBe('LG7');
    expect(normalizeChromosome('LG7')).toBe('Gm07');
  });

  it('reads the accepted maize spellings onto chr1 and chr10', () => {
    expect(normalizeChromosome('Chromosome_1', maize)).toBe('chr1');
    expect(normalizeChromosome('01', maize)).toBe('chr1');
    expect(normalizeChromosome('chr10', maize)).toBe('chr10');
  });

  it('concatenates two capture groups into the key', () => {
    expect(normalizeChromosome('chrA1', cotton)).toBe('A01');
    expect(normalizeChromosome('D13', cotton)).toBe('D13');
    expect(normalizeChromosome('1C', oat)).toBe('chr1C');
    // The key is upper-cased before the lookup, so a lower-case letter still hits.
    expect(normalizeChromosome('chr1a', resolveCrop('wheat'))).toBe('Chr1A');
  });

  it('keeps unanchored bins as written', () => {
    expect(normalizeChromosome('Un0', oat)).toBe('Un0');
    expect(normalizeChromosome('ChrUn', resolveCrop('rice'))).toBe('ChrUn');
  });

  it('strips the leading zeros of each digit run when deriving the key', () => {
    // No built-in pattern lets zeros reach a capture group, so the derivation
    // is exercised on a scheme whose groups take the digits as written.
    const scheme = compileScheme(
      validateScheme({
        id: 'zeros',
        name: 'Leading zeros',
        species: 'Test',
        ploidy: 2,
        assembly: 'none',
        chromosomes: ['one', 'a-one', 'hundred'],
        keys: ['1', 'A1', '100'],
        pattern: '^([A-Z]?)(\\d+)$',
        sources: [],
      }),
    );
    expect(normalizeChromosome('01', scheme)).toBe('one');
    expect(normalizeChromosome('A01', scheme)).toBe('a-one');
    expect(normalizeChromosome('100', scheme)).toBe('hundred');
  });
});

describe('order under a scheme', () => {
  it('orders chr2 before chr10 under maize, and scaffold_2 before scaffold_10', () => {
    expect(compareChromosomes('chr2', 'chr10', maize)).toBeLessThan(0);
    expect(compareChromosomes('scaffold_2', 'scaffold_10', maize)).toBeLessThan(0);
    expect(
      buildChromosomeOrder(['scaffold_10', 'chr10', 'scaffold_2', 'chr2', 'chr1'], maize),
    ).toEqual(['chr1', 'chr2', 'chr10', 'scaffold_2', 'scaffold_10']);
  });

  it('puts every canonical name before a name the scheme does not match', () => {
    // Un0 precedes chr1A lexically; the scheme index decides instead.
    expect(buildChromosomeOrder(['Un0', 'chr7D', 'chr1A'], oat)).toEqual(['chr1A', 'chr7D', 'Un0']);
  });
});

describe('resolveCrop', () => {
  it('defaults to soybean and names the built-ins for an unknown id', () => {
    expect(resolveCrop(undefined).scheme.id).toBe('soybean');
    expect(() => resolveCrop('cowpea')).toThrow(/unknown crop "cowpea".*soybean, maize/s);
  });
});

describe('parseLocus under a scheme', () => {
  it('reads chr7:1-2Mb as chr7 under maize', () => {
    expect(parseLocus('chr7:1-2Mb', maize)).toEqual({
      chrom: 'chr7',
      startBp: 1_000_000,
      endBp: 2_000_000,
    });
  });

  it('keeps the soybean default when no scheme is passed', () => {
    expect(parseLocus('chr7:1-2Mb')?.chrom).toBe('Gm07');
  });
});

describe('validateScheme rejects', () => {
  const base = (): Record<string, unknown> => ({
    ...(JSON.parse(JSON.stringify(SOYBEAN_SCHEME)) as CropScheme),
  });

  it('a chromosomes/keys length mismatch', () => {
    const s = base();
    s['keys'] = (s['keys'] as string[]).slice(0, 19);
    expect(() => validateScheme(s)).toThrow(/20 entries and "keys" 19/);
  });

  it('a duplicate key', () => {
    const s = base();
    (s['keys'] as string[])[1] = '1';
    expect(() => validateScheme(s)).toThrow(/key "1" appears twice/);
  });

  it('a pattern that does not compile', () => {
    const s = base();
    s['pattern'] = '^(unclosed';
    expect(() => validateScheme(s)).toThrow(/does not compile/);
  });

  it('an unknown top-level key', () => {
    expect(() => validateScheme({ ...base(), assemblies: [] })).toThrow(/unknown key\(s\)/);
  });
});

describe('the chosen scheme reaches every reader (contract 1.5.0)', () => {
  // Every case here is maize, never soybean: soybean is the default, so a
  // soybean case cannot tell a threaded scheme from the fallback.
  const HAPMAP_HEADER = [
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
  ].join('\t');

  it('HapMap: a chrom cell of 2 becomes chr2, not Gm02', () => {
    const text =
      [HAPMAP_HEADER, 'RP', 'DONOR', 'L1'].join('\t') +
      '\n' +
      ['r1', 'A/G', '2', '1000', '+', 'NA', 'NA', 'NA', 'NA', 'NA', 'NA', 'AA', 'GG', 'AG'].join(
        '\t',
      ) +
      '\n';
    expect(parseHapMap(text, { crop: maize }).markers.chrom).toEqual(['chr2']);
    expect(parseHapMap(text).markers.chrom).toEqual(['Gm02']);
  });

  const VCF =
    '##fileformat=VCFv4.2\n' +
    [
      '#CHROM',
      'POS',
      'ID',
      'REF',
      'ALT',
      'QUAL',
      'FILTER',
      'INFO',
      'FORMAT',
      'RP',
      'DONOR',
      'L1',
    ].join('\t') +
    '\n' +
    ['2', '1000', 'r1', 'A', 'G', '.', '.', '.', 'GT', '0/0', '1/1', '0/1'].join('\t') +
    '\n';

  it('VCF: parseVcf reads CHROM 2 as chr2, not Gm02', () => {
    expect(parseVcf(VCF, maize).markers.chrom).toEqual(['chr2']);
    expect(parseVcf(VCF).markers.chrom).toEqual(['Gm02']);
  });

  it('VCF: the streaming entry reads CHROM 2 as chr2 too', async () => {
    const lines = {
      // eslint-disable-next-line @typescript-eslint/require-await
      async *[Symbol.asyncIterator]() {
        for (const line of VCF.split('\n')) yield line;
      },
    };
    const { parsed } = await parseVcfLines(lines, maize);
    expect(parsed.markers.chrom).toEqual(['chr2']);
  });

  it('VCF: the streaming loader passes ParseOptions.crop through', async () => {
    const bytes = new TextEncoder().encode(VCF);
    const parsed = await parseGenotypesSource('genotypes.vcf', bytesOf(bytes), { crop: maize });
    expect(parsed.markers.chrom).toEqual(['chr2']);
  });

  it('markers.csv: a chrom cell of 2 becomes chr2, not Gm02', () => {
    const text = 'marker_id,chrom,pos_bp\nr1,2,1000\n';
    expect(parseMarkerMap(text, maize).get('r1')?.chrom).toBe('chr2');
    expect(parseMarkerMap(text).get('r1')?.chrom).toBe('Gm02');
  });

  it('isNuclearChromosome asks the scheme, not a soybean regular expression', () => {
    expect(isNuclearChromosome('chr2', maize)).toBe(true);
    expect(isNuclearChromosome('Gm02', maize)).toBe(false);
    expect(isNuclearChromosome('Gm02')).toBe(true);
  });
});
