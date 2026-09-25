/**
 * Built-in crop chromosome schemes (contract/data-contract.md 1.5.0 and 1.7.0,
 * "Chromosome names"; contract/crops/; docs/adr/0020, docs/adr/0022).
 *
 * Responsibility: the twelve schemes shipped under contract/crops/, the schema
 * check for one of them, and the id-to-compiled-scheme lookup the loaders, the
 * worker and the CLI resolve a chosen crop through. `soybean` is the default
 * and reproduces the 1.2.0 rule exactly. No user-supplied scheme is accepted
 * in this version.
 *
 * Interface: BUILTIN_CROPS (id -> scheme, in the order soybean, maize, rice,
 * sorghum, wheat, barley, oat, common-bean, cotton, cowpea, pea, peanut),
 * DEFAULT_CROP_ID, validateScheme(value) -> CropScheme (throws "crop scheme:
 * <reason>"), resolveCrop(id) -> CompiledScheme (undefined -> soybean; an
 * unknown id throws naming the built-ins).
 */
import barley from '../../contract/crops/barley.json' with { type: 'json' };
import commonBean from '../../contract/crops/common-bean.json' with { type: 'json' };
import cotton from '../../contract/crops/cotton.json' with { type: 'json' };
import cowpea from '../../contract/crops/cowpea.json' with { type: 'json' };
import maize from '../../contract/crops/maize.json' with { type: 'json' };
import oat from '../../contract/crops/oat.json' with { type: 'json' };
import pea from '../../contract/crops/pea.json' with { type: 'json' };
import peanut from '../../contract/crops/peanut.json' with { type: 'json' };
import rice from '../../contract/crops/rice.json' with { type: 'json' };
import sorghum from '../../contract/crops/sorghum.json' with { type: 'json' };
import soybean from '../../contract/crops/soybean.json' with { type: 'json' };
import wheat from '../../contract/crops/wheat.json' with { type: 'json' };
import { compileScheme } from '../core/chromosomes.ts';
import type { CompiledScheme, CropScheme } from '../core/chromosomes.ts';

export const DEFAULT_CROP_ID = 'soybean';

const KEYS: ReadonlySet<string> = new Set([
  'id',
  'name',
  'species',
  'ploidy',
  'assembly',
  'chromosomes',
  'keys',
  'pattern',
  'sources',
]);

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

function fail(reason: string): never {
  throw new Error(`crop scheme: ${reason}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    fail(`"${field}" must be an array of strings`);
  }
  return [...(value as string[])];
}

export function validateScheme(value: unknown): CropScheme {
  if (!isRecord(value)) fail('must be a JSON object');
  const unknown = Object.keys(value).filter((k) => !KEYS.has(k));
  if (unknown.length > 0) fail(`unknown key(s) ${unknown.map((k) => `"${k}"`).join(', ')}`);
  const { id, name, species, ploidy, assembly, chromosomes, keys, pattern, sources } = value;
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) fail(`"id" must match ${ID_PATTERN.source}`);
  if (typeof name !== 'string' || name.trim() === '') fail('"name" must be a non-empty string');
  if (typeof species !== 'string' || species.trim() === '') {
    fail('"species" must be a non-empty string');
  }
  if (typeof ploidy !== 'number' || !Number.isInteger(ploidy) || ploidy < 1) {
    fail('"ploidy" must be a positive integer');
  }
  if (typeof assembly !== 'string' || assembly.trim() === '') {
    fail('"assembly" must be a non-empty string');
  }
  const chroms = stringArray(chromosomes, 'chromosomes');
  const ks = stringArray(keys, 'keys');
  if (chroms.length === 0) fail('"chromosomes" must be non-empty');
  if (chroms.length !== ks.length) {
    fail(`"chromosomes" has ${chroms.length} entries and "keys" ${ks.length}`);
  }
  const dupChrom = chroms.find((c, i) => chroms.indexOf(c) !== i);
  if (dupChrom !== undefined) fail(`chromosome "${dupChrom}" appears twice`);
  const dupKey = ks.find((k, i) => ks.indexOf(k) !== i);
  if (dupKey !== undefined) fail(`key "${dupKey}" appears twice`);
  if (ks.some((k) => k !== k.toUpperCase() || /(?<![0-9])0(?=[0-9])/.test(k))) {
    fail('every key must be upper-case with no leading zeros');
  }
  if (typeof pattern !== 'string') fail('"pattern" must be a string');
  try {
    new RegExp(pattern, 'i');
  } catch (e) {
    fail(`"pattern" does not compile: ${e instanceof Error ? e.message : String(e)}`);
  }
  return {
    id,
    name,
    species,
    ploidy,
    assembly,
    chromosomes: chroms,
    keys: ks,
    pattern,
    sources: stringArray(sources, 'sources'),
  };
}

export const BUILTIN_CROPS: ReadonlyMap<string, CropScheme> = new Map(
  [soybean, maize, rice, sorghum, wheat, barley, oat, commonBean, cotton, cowpea, pea, peanut].map(
    (json) => {
      const s = validateScheme(json);
      return [s.id, s] as const;
    },
  ),
);

const COMPILED = new Map([...BUILTIN_CROPS].map(([id, s]) => [id, compileScheme(s)] as const));

export function resolveCrop(id: string | undefined): CompiledScheme {
  const compiled = COMPILED.get(id ?? DEFAULT_CROP_ID);
  if (compiled === undefined) {
    throw new Error(
      `unknown crop "${id}"; built-in crops are ${[...BUILTIN_CROPS.keys()].join(', ')}`,
    );
  }
  return compiled;
}
