/**
 * Chromosome naming under a crop scheme.
 *
 * Responsibility: map the chromosome spellings a crop scheme accepts onto
 * that crop's canonical names, keep every other name unchanged, and provide a
 * stable display order (the canonical names in scheme order, then the rest in
 * natural order). A scheme is a JSON document (contract/crops/<id>.json,
 * contract 1.5.0, docs/adr/0020): an ordered list of canonical chromosome
 * names, a parallel list of keys, and one alias regular expression whose
 * capture groups yield the key. Key derivation: join the defined capture
 * groups, upper-case, strip the leading zeros of each digit run; look the key
 * up in `keys`. A miss keeps the name as written and orders it after the
 * canonical names in natural order, which is the 1.2.0 rule.
 *
 * `src/core/` imports no JSON, so `soybean.json` is repeated here as
 * `SOYBEAN_SCHEME` (tests/crops.test.ts asserts the two are equal) and every
 * function defaults to it; `src/io/crops.ts` holds the other eight.
 *
 * Interface: CropScheme, CompiledScheme, compileScheme, SOYBEAN_SCHEME,
 * SOYBEAN, SOYBEAN_CHROMOSOME_COUNT, normalizeChromosome,
 * isNuclearChromosome, compareChromosomes, buildChromosomeOrder.
 */

export interface CropScheme {
  id: string;
  name: string;
  species: string;
  ploidy: number;
  assembly: string;
  chromosomes: string[];
  keys: string[];
  pattern: string;
  sources: string[];
}

export interface CompiledScheme {
  scheme: CropScheme;
  regex: RegExp;
  indexByKey: Map<string, number>;
  indexByCanonical: Map<string, number>;
}

/** The literal of contract/crops/soybean.json (contract 1.5.0). */
export const SOYBEAN_SCHEME: CropScheme = {
  id: 'soybean',
  name: 'Soybean',
  species: 'Glycine max',
  ploidy: 2,
  assembly: 'Williams 82 (Wm82.a2.v1 / a4.v1 / a6.v1 naming)',
  chromosomes: [
    'Gm01',
    'Gm02',
    'Gm03',
    'Gm04',
    'Gm05',
    'Gm06',
    'Gm07',
    'Gm08',
    'Gm09',
    'Gm10',
    'Gm11',
    'Gm12',
    'Gm13',
    'Gm14',
    'Gm15',
    'Gm16',
    'Gm17',
    'Gm18',
    'Gm19',
    'Gm20',
  ],
  keys: [
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    '10',
    '11',
    '12',
    '13',
    '14',
    '15',
    '16',
    '17',
    '18',
    '19',
    '20',
  ],
  pattern: '^(?:gm|chr|chromosome|lg)?[_\\s-]?0*([1-9]|1[0-9]|20)$',
  sources: [
    'https://ftp.ncbi.nlm.nih.gov/genomes/all/GCF/000/004/515/GCF_000004515.6_Glycine_max_v4.0/GCF_000004515.6_Glycine_max_v4.0_assembly_report.txt',
    'https://rest.ensembl.org/info/assembly/glycine_max',
  ],
};

export function compileScheme(s: CropScheme): CompiledScheme {
  return {
    scheme: s,
    regex: new RegExp(s.pattern, 'i'),
    indexByKey: new Map(s.keys.map((k, i) => [k, i] as const)),
    indexByCanonical: new Map(s.chromosomes.map((c, i) => [c, i] as const)),
  };
}

export const SOYBEAN: CompiledScheme = compileScheme(SOYBEAN_SCHEME);

export const SOYBEAN_CHROMOSOME_COUNT = SOYBEAN_SCHEME.chromosomes.length;

/** Leading zeros of a digit run: the `0`s of `01`, never the `0`s inside `100`. */
const LEADING_ZEROS = /(?<![0-9])0+(?=[0-9])/g;

/** The scheme key a match yields: the defined groups joined, upper-cased, unpadded. */
function keyOf(match: RegExpExecArray): string {
  return match
    .slice(1)
    .filter((g) => g !== undefined)
    .join('')
    .toUpperCase()
    .replace(LEADING_ZEROS, '');
}

/** Returns the scheme's canonical name for any accepted spelling; other names are returned trimmed but unchanged. */
export function normalizeChromosome(raw: string, scheme: CompiledScheme = SOYBEAN): string {
  const s = raw.trim();
  const m = scheme.regex.exec(s);
  if (m === null) return s;
  const index = scheme.indexByKey.get(keyOf(m));
  return index === undefined ? s : (scheme.scheme.chromosomes[index] as string);
}

export function isNuclearChromosome(name: string, scheme: CompiledScheme = SOYBEAN): boolean {
  return scheme.indexByCanonical.has(name);
}

function naturalKey(s: string): (string | number)[] {
  return s.split(/(\d+)/).map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

/** The scheme's canonical names first in scheme order, then everything else in natural (numeric-aware) order. */
export function compareChromosomes(a: string, b: string, scheme: CompiledScheme = SOYBEAN): number {
  const ia = scheme.indexByCanonical.get(a);
  const ib = scheme.indexByCanonical.get(b);
  if (ia !== undefined && ib !== undefined) return ia - ib;
  if ((ia === undefined) !== (ib === undefined)) return ia !== undefined ? -1 : 1;
  const ka = naturalKey(a);
  const kb = naturalKey(b);
  const n = Math.min(ka.length, kb.length);
  for (let i = 0; i < n; i++) {
    const x = ka[i] as string | number;
    const y = kb[i] as string | number;
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    return String(x) < String(y) ? -1 : 1;
  }
  return ka.length - kb.length;
}

/** Distinct chromosome names in display order. */
export function buildChromosomeOrder(
  chroms: Iterable<string>,
  scheme: CompiledScheme = SOYBEAN,
): string[] {
  return Array.from(new Set(chroms)).sort((a, b) => compareChromosomes(a, b, scheme));
}
