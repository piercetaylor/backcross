/**
 * Token profiles (contract 1.4.0, docs/adr/0019; src/io/profiles.ts and the
 * profile paths of calls.ts and wide-csv.ts).
 *
 * Every committed file under contract/profiles/ passes the schema check and is
 * named after its id; each schema rule rejects; built-in resolution and labels;
 * cell resolution under a base "none" profile; and D5.6, a SoyBase file whose
 * sample cells could look coded is still read as nucleotide.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { NUCLEOTIDE_MISSING, parseNucleotideCell } from '../src/io/calls.ts';
import {
  BUILTIN_PROFILES,
  compileProfile,
  profileLabel,
  resolveProfile,
  validateProfile,
} from '../src/io/profiles.ts';
import type { TokenProfile } from '../src/io/profiles.ts';
import { parseHapMap } from '../src/io/hapmap.ts';
import { parseGenotypesSource } from '../src/io/loaders.ts';
import { bytesOf } from '../src/io/stream.ts';
import type { ByteSource } from '../src/io/stream.ts';
import { detectWideCsvMode, parseWideCsv } from '../src/io/wide-csv.ts';
import { bgzfBlocks } from './support/bgzf.ts';

const PROFILES = join(import.meta.dirname, '..', 'contract', 'profiles');

function builtin(id: string): TokenProfile {
  const p = BUILTIN_PROFILES.get(id);
  if (p === undefined) throw new Error(`no built-in ${id}`);
  return p;
}

const VALID = {
  id: 'mylab',
  name: 'My lab',
  description: '',
  base: 'nucleotide',
  homozygous: {},
  heterozygous: { H: '*' },
  missing: ['U'],
  sources: [],
};

describe('contract/profiles', () => {
  const files = readdirSync(PROFILES).filter((f) => f.endsWith('.json'));

  it('holds the five built-ins', () => {
    expect(files.sort()).toEqual([
      'axiom.json',
      'dart.json',
      'kasp.json',
      'soybase-report.json',
      'tassel.json',
    ]);
  });

  for (const file of files) {
    it(`${file} passes validateProfile and is named after its id`, () => {
      const p = validateProfile(JSON.parse(readFileSync(join(PROFILES, file), 'utf8')) as unknown);
      expect(`${p.id}.json`).toBe(file);
    });
  }
});

describe('validateProfile', () => {
  it('accepts a well-formed custom profile', () => {
    expect(validateProfile(VALID).id).toBe('mylab');
  });

  it('rejects a bad id', () => {
    expect(() => validateProfile({ ...VALID, id: 'My Lab' })).toThrow(/^token profile: .*id/);
  });

  it('rejects a missing base', () => {
    const noBase: Record<string, unknown> = { ...VALID };
    delete noBase.base;
    expect(() => validateProfile(noBase)).toThrow(/^token profile: .*base/);
  });

  it('rejects overlapping tokens', () => {
    expect(() => validateProfile({ ...VALID, missing: ['U', 'h'] })).toThrow(
      /^token profile: .*"heterozygous" and "missing"/,
    );
  });

  it('rejects * in homozygous', () => {
    expect(() => validateProfile({ ...VALID, homozygous: { Z: '*' } })).toThrow(
      /^token profile: .*"\*"/,
    );
  });

  it('rejects base none without "" in missing', () => {
    expect(() =>
      validateProfile({
        ...VALID,
        base: 'none',
        homozygous: { '0': '0' },
        heterozygous: {},
        missing: ['-'],
      }),
    ).toThrow(/^token profile: .*""/);
  });
});

describe('resolveProfile and profileLabel', () => {
  it('reads undefined and default as no profile', () => {
    expect(resolveProfile(undefined)).toBeNull();
    expect(resolveProfile('default')).toBeNull();
    expect(profileLabel(null)).toBe('default');
  });

  it('throws for an unknown id, naming the built-ins', () => {
    expect(() => resolveProfile('nope')).toThrow(
      'unknown token profile "nope"; built-in profiles are tassel, soybase-report, dart, axiom, kasp',
    );
  });

  it('labels a built-in by its id and a custom object as custom:<id>', () => {
    expect(profileLabel(builtin('dart'))).toBe('dart');
    expect(profileLabel(validateProfile(VALID))).toBe('custom:mylab');
  });
});

describe('parseNucleotideCell under axiom (base none)', () => {
  const axiom = compileProfile(builtin('axiom'));

  it('reads ab as A/B and nocall as missing, case-insensitively', () => {
    expect(parseNucleotideCell('ab', NUCLEOTIDE_MISSING, 'here', axiom)).toEqual(['A', 'B']);
    expect(parseNucleotideCell('nocall', NUCLEOTIDE_MISSING, 'here', axiom)).toBeNull();
  });

  it('rejects a nucleotide, which is not an axiom token', () => {
    expect(() => parseNucleotideCell('A', NUCLEOTIDE_MISSING, 'here', axiom)).toThrow(
      /unexpected cell "A"/,
    );
  });
});

describe('soybase-report and coded detection (D5.6)', () => {
  const text = 'marker_id,chrom,pos_bp,RP,DONOR,L1\nr1,Gm02,1000,A,G,H\nr2,Gm02,2000,A,A,U\n';
  const profile = builtin('soybase-report');

  it('loads as nucleotide with L1 A/G then missing', () => {
    const parsed = parseWideCsv(text, { profile });
    expect(parsed.coded).toBe(false);
    const g = parsed.genotypes;
    const { alleles } = parsed.markers;
    const l1 = 2;
    const call = (m: number) => {
      const i = m * g.nSamples + l1;
      const a = g.allele1[i] as number;
      const b = g.allele2[i] as number;
      if (a === 255 || b === 255) return null;
      return [alleles[m]?.[a], alleles[m]?.[b]].sort();
    };
    expect(call(0)).toEqual(['A', 'G']);
    expect(call(1)).toBeNull();
  });

  it('detects nucleotide mode', () => {
    expect(detectWideCsvMode(text, compileProfile(profile))).toBe('nucleotide');
  });
});

describe('review findings (docs/adr/0019, amendment of 2026-09-16)', () => {
  const soybase = builtin('soybase-report');

  it('does not let a claimed token decide coding: A,A,H is coded by default, nucleotide under soybase-report', () => {
    const text = 'marker_id,chrom,pos_bp,RP,DONOR,L1\nr1,Gm02,1000,A,A,H\n';
    expect(detectWideCsvMode(text)).toBe('coded');
    expect(detectWideCsvMode(text, compileProfile(soybase))).toBe('nucleotide');
  });

  it('rejects a profile on a wide CSV detected or requested as coded, naming the profile', () => {
    const text = 'marker_id,chrom,pos_bp,RP,DONOR,L1\nr1,Gm02,1000,A,B,H\nr2,Gm02,2000,A,B,B\n';
    expect(() => parseWideCsv(text, { profile: soybase })).toThrow(
      'token profile "soybase-report" applies to HapMap and wide CSV nucleotide calls; the genotype file is coded A/B/H (detected)',
    );
    expect(() => parseWideCsv(text, { profile: builtin('dart'), mode: 'coded' })).toThrow(
      /"dart" applies to HapMap and wide CSV .*\(requested\)/,
    );
  });

  it('records a custom file with a built-in id as custom:<id>', () => {
    const copy = validateProfile(JSON.parse(JSON.stringify(builtin('dart'))) as unknown);
    expect(profileLabel(copy)).toBe('custom:dart');
    expect(profileLabel(resolveProfile(copy))).toBe('custom:dart');
    expect(profileLabel(resolveProfile('dart'))).toBe('dart');
  });

  it('rejects a token twice in one set, an identical het pair and unknown keys', () => {
    expect(() => validateProfile({ ...VALID, missing: ['U', 'u'] })).toThrow(
      /^token profile: .*appears twice in "missing"/,
    );
    expect(() => validateProfile({ ...VALID, homozygous: { aa: 'A', AA: 'A' } })).toThrow(
      /^token profile: .*appears twice in "homozygous"/,
    );
    expect(() => validateProfile({ ...VALID, heterozygous: { AB: ['A', 'A'] } })).toThrow(
      /^token profile: .*identical/,
    );
    expect(() => validateProfile({ ...VALID, tokens: {} })).toThrow(
      /^token profile: unknown key\(s\) "tokens"/,
    );
  });

  const HEADER =
    'rs#\talleles\tchrom\tpos\tstrand\tassembly#\tcenter\tprotLSID\tassayLSID\tpanelLSID\tQCcode\tRP\tDONOR\tL1\n';
  const FIXED = '+\tNA\tNA\tNA\tNA\tNA\tNA';

  it('upper-cases the HapMap alleles column before resolving H', () => {
    const parsed = parseHapMap(`${HEADER}r1\ta/g\tGm02\t1000\t${FIXED}\tAA\tAA\tH\n`, {
      profile: soybase,
    });
    expect(parsed.markers.alleles[0]).toEqual(['A', 'G']);
    expect([parsed.genotypes.allele1[2], parsed.genotypes.allele2[2]]).toEqual([0, 1]);
  });

  it('rejects H at a marker with an indel allele', () => {
    expect(() =>
      parseHapMap(`${HEADER}r1\tA/-\tGm02\t1000\t${FIXED}\tAA\tAA\tH\n`, { profile: soybase }),
    ).toThrow(/heterozygote token but the marker shows an indel allele/);
  });
});

describe('streaming entry rejects a profile with a VCF', () => {
  const vcf = new TextEncoder().encode(
    '##fileformat=VCFv4.2\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tRP\n1\t100\tm1\tA\tG\t.\t.\t.\tGT\t0/0\n',
  );
  const sourceOf = (parts: Uint8Array[]): ByteSource => {
    const joined = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const p of parts) {
      joined.set(p, offset);
      offset += p.length;
    }
    return bytesOf(joined);
  };

  it('plain .vcf', async () => {
    await expect(
      parseGenotypesSource('calls.vcf', sourceOf([vcf]), { profile: builtin('dart') }),
    ).rejects.toThrow(
      /token profile "dart" applies to HapMap and wide CSV; the genotype file is VCF/,
    );
  });

  it('bgzipped .vcf.gz', async () => {
    await expect(
      parseGenotypesSource('calls.vcf.gz', sourceOf([...bgzfBlocks(vcf, 32)]), {
        profile: builtin('kasp'),
      }),
    ).rejects.toThrow(
      /token profile "kasp" applies to HapMap and wide CSV; the genotype file is VCF/,
    );
  });
});
