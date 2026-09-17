/**
 * Named token profiles (contract/data-contract.md 1.4.0, "Token profiles"; docs/adr/0019).
 *
 * Responsibility: the five built-in profiles under contract/profiles/, the
 * schema check for a user-supplied profile, and the compiled lookup form the
 * HapMap and wide-CSV parsers read cells through (calls.ts). A profile is keyed
 * by platform, never by crop. Tokens are trimmed and compared
 * case-insensitively, so compiled keys are upper-cased.
 *
 * Interface: TokenProfile, CompiledProfile, DEFAULT_PROFILE_ID,
 * BUILTIN_PROFILES (id -> profile, in the order tassel, soybase-report, dart,
 * axiom, kasp), validateProfile(value) -> TokenProfile (throws
 * "token profile: <reason>"), resolveProfile(ref) -> TokenProfile | null
 * (undefined or 'default' -> null), profileLabel(p) -> 'default' | id |
 * 'custom:<id>'; a profile is a built-in only when it is the BUILTIN_PROFILES
 * object itself, so a user file is custom:<id> even when its id is a built-in's),
 * compileProfile(p) -> CompiledProfile. Validation also rejects unknown
 * top-level keys, a token listed twice after normalisation, and a heterozygote
 * pair of identical symbols.
 */
import axiom from '../../contract/profiles/axiom.json' with { type: 'json' };
import dart from '../../contract/profiles/dart.json' with { type: 'json' };
import kasp from '../../contract/profiles/kasp.json' with { type: 'json' };
import soybaseReport from '../../contract/profiles/soybase-report.json' with { type: 'json' };
import tassel from '../../contract/profiles/tassel.json' with { type: 'json' };

export interface TokenProfile {
  id: string;
  name: string;
  description: string;
  base: 'nucleotide' | 'none';
  homozygous: Record<string, string>;
  heterozygous: Record<string, [string, string] | '*'>;
  missing: string[];
  sources: string[];
}

export interface CompiledProfile {
  missing: ReadonlySet<string>;
  homozygous: ReadonlyMap<string, string>;
  heterozygous: ReadonlyMap<string, [string, string] | '*'>;
  base: 'nucleotide' | 'none';
  label: string;
}

export const DEFAULT_PROFILE_ID = 'default';

const KEYS: ReadonlySet<string> = new Set([
  'id',
  'name',
  'description',
  'base',
  'homozygous',
  'heterozygous',
  'missing',
  'sources',
]);

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const SYMBOL_PATTERN = /^[^\s]+$/;

function fail(reason: string): never {
  throw new Error(`token profile: ${reason}`);
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

const norm = (token: string): string => token.trim().toUpperCase();

export function validateProfile(value: unknown): TokenProfile {
  if (!isRecord(value)) fail('must be a JSON object');
  const unknown = Object.keys(value).filter((k) => !KEYS.has(k));
  if (unknown.length > 0) fail(`unknown key(s) ${unknown.map((k) => `"${k}"`).join(', ')}`);
  const { id, name, description, base, homozygous, heterozygous, missing, sources } = value;
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    fail(`"id" must match ${ID_PATTERN.source}`);
  }
  if (typeof name !== 'string' || name.trim() === '') fail('"name" must be a non-empty string');
  if (typeof description !== 'string') fail('"description" must be a string');
  if (base !== 'nucleotide' && base !== 'none') fail('"base" must be "nucleotide" or "none"');

  if (!isRecord(homozygous)) fail('"homozygous" must be an object of token to allele symbol');
  const hom: Record<string, string> = {};
  for (const [token, symbol] of Object.entries(homozygous)) {
    if (symbol === '*') fail(`"*" is allowed only in "heterozygous" (homozygous token "${token}")`);
    if (typeof symbol !== 'string' || !SYMBOL_PATTERN.test(symbol)) {
      fail(`homozygous token "${token}" must map to a non-blank allele symbol`);
    }
    hom[token] = symbol;
  }

  if (!isRecord(heterozygous)) {
    fail('"heterozygous" must be an object of token to two allele symbols or "*"');
  }
  const het: Record<string, [string, string] | '*'> = {};
  for (const [token, pair] of Object.entries(heterozygous)) {
    if (pair === '*') {
      het[token] = '*';
      continue;
    }
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      pair.some((s) => typeof s !== 'string' || !SYMBOL_PATTERN.test(s))
    ) {
      fail(`heterozygous token "${token}" must map to two allele symbols or "*"`);
    }
    if (pair[0] === pair[1]) {
      fail(`heterozygous token "${token}" maps to two identical symbols "${String(pair[0])}"`);
    }
    het[token] = [pair[0] as string, pair[1] as string];
  }

  const miss = stringArray(missing, 'missing');
  const src = stringArray(sources, 'sources');

  const seen = new Map<string, string>();
  const claim = (token: string, set: string): void => {
    const key = norm(token);
    const prior = seen.get(key);
    if (prior === set) fail(`token "${token}" appears twice in "${set}"`);
    if (prior !== undefined) fail(`token "${token}" appears in both "${prior}" and "${set}"`);
    seen.set(key, set);
  };
  for (const t of Object.keys(hom)) claim(t, 'homozygous');
  for (const t of Object.keys(het)) claim(t, 'heterozygous');
  for (const t of miss) claim(t, 'missing');

  if (base === 'none') {
    if (Object.keys(hom).length === 0) fail('with base "none", "homozygous" must be non-empty');
    if (!miss.includes('')) fail('with base "none", "missing" must contain ""');
  }

  return {
    id,
    name,
    description,
    base,
    homozygous: hom,
    heterozygous: het,
    missing: miss,
    sources: src,
  };
}

export const BUILTIN_PROFILES: ReadonlyMap<string, TokenProfile> = new Map(
  [tassel, soybaseReport, dart, axiom, kasp].map((json) => {
    const p = validateProfile(json);
    return [p.id, p] as const;
  }),
);

export function resolveProfile(ref: string | TokenProfile | undefined): TokenProfile | null {
  if (ref === undefined || ref === DEFAULT_PROFILE_ID) return null;
  if (typeof ref === 'string') {
    const builtin = BUILTIN_PROFILES.get(ref);
    if (builtin === undefined) {
      throw new Error(
        `unknown token profile "${ref}"; built-in profiles are ${[...BUILTIN_PROFILES.keys()].join(', ')}`,
      );
    }
    return builtin;
  }
  return validateProfile(ref);
}

export function profileLabel(p: TokenProfile | null): string {
  if (p === null) return DEFAULT_PROFILE_ID;
  return BUILTIN_PROFILES.get(p.id) === p ? p.id : `custom:${p.id}`;
}

export function compileProfile(p: TokenProfile): CompiledProfile {
  return {
    missing: new Set(p.missing.map(norm)),
    homozygous: new Map(Object.entries(p.homozygous).map(([t, s]) => [norm(t), s] as const)),
    heterozygous: new Map(Object.entries(p.heterozygous).map(([t, s]) => [norm(t), s] as const)),
    base: p.base,
    label: profileLabel(p),
  };
}
