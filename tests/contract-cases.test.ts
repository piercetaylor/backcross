/**
 * The shared data contract (contract/README.md), checked against this repository's loaders.
 *
 * Every directory under contract/cases/ is loaded through the synchronous and
 * the streaming genotype entries (an error case through both too), joined
 * with its samples.csv and optional markers.csv (decoded strictly, contract
 * 1.11.0), normalised (tests/support/normalise.ts) and compared with the
 * hand-authored expected.json; an error case must throw the message its kind
 * maps to below, and a text.invalid_utf8 case its exact line, byte position
 * and lead byte, the same through both entries. The kind-to-message table lives here, not in the contract,
 * so rewording a message is a change to this test and not to the contract.
 * A case with an options.json passes its token profile (contract 1.4.0) and
 * its crop scheme (contract 1.5.0) to both entries. Neither appears in
 * expected.json: tests/support/normalise.ts is the contract's language-neutral
 * dataset shape, and the crop shows through it only as the canonical
 * chromosome names and their order. The profile label and crop id recorded on
 * the Dataset are asserted in tests/export-ids.test.ts and tests/report.test.ts,
 * where they reach an output.
 * The manifest and the version string are checked too.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import { assembleDataset, parseGenotypesBytes, parseGenotypesSource } from '../src/io/loaders.ts';
import type { ParsedGenotypes } from '../src/io/builder.ts';
import { parseSampleManifest } from '../src/io/manifest.ts';
import { resolveCrop } from '../src/io/crops.ts';
import { parseMarkerMap } from '../src/io/markers.ts';
import { profileLabel, resolveProfile } from '../src/io/profiles.ts';
import type { TokenProfile } from '../src/io/profiles.ts';
import type { CompiledScheme } from '../src/core/chromosomes.ts';
import { bytesOf } from '../src/io/stream.ts';
import { decodeUtf8 } from '../src/io/utf8.ts';
import { normaliseDataset } from './support/normalise.ts';
import type { ContractErrorExpect, ContractExpect, ErrorKind } from './support/normalise.ts';

const CONTRACT = join(import.meta.dirname, '..', 'contract');
const CASES = join(CONTRACT, 'cases');
const VERSION = readFileSync(join(CONTRACT, 'VERSION'), 'utf8').trim();

const ERROR_MESSAGES: Record<ErrorKind, RegExp> = {
  'manifest.roles': /expected exactly one (recurrent_parent|donor_parent)|no candidate or progeny/,
  'manifest.unknown_role': /role ".*" is not one of/,
  'manifest.duplicate_sample': /duplicate sample_id/,
  'dataset.sample_missing': /absent from the genotype file/,
  'genotypes.duplicate_marker': /duplicate marker id/,
  'genotypes.no_gt': /FORMAT has no GT field/,
  'genotypes.no_header': /no #CHROM header|no header row|"rs#" not found/,
  'genotypes.unknown_cell': /unexpected cell/,
  'genotypes.invalid_position': /invalid position/,
  'genotypes.invalid_gt': /invalid GT/,
  'genotypes.column_count':
    /columns, header has|sample fields, header has|expected FORMAT and sample columns|expected \d+ fields, got/,
  'genotypes.repeated_header': /after the #CHROM header/,
  'delimited.unterminated_quote': /unterminated quoted field/,
  'genotypes.ambiguous_heterozygote': /heterozygote token but the marker shows/,
  'genotypes.profile_format': /applies to HapMap and wide CSV/,
  'text.invalid_utf8': /not valid UTF-8/,
};

/**
 * The exact message of each text.invalid_utf8 case (contract 1.11.0). The line,
 * position and lead byte are tool wording, not contract vocabulary
 * (docs/adr/0026 D4), so they live here beside the kind table.
 */
const UTF8_MESSAGES: Record<string, string> = {
  'err-vcf-latin1-byte': 'genotype file line 4: not valid UTF-8 (byte 0xE9 at position 12)',
  'err-vcf-gzip-latin1-byte': 'genotype file line 4: not valid UTF-8 (byte 0xE9 at position 12)',
  'err-vcf-overlong-byte': 'genotype file line 4: not valid UTF-8 (byte 0xC0 at position 12)',
  'err-vcf-surrogate-byte': 'genotype file line 4: not valid UTF-8 (byte 0xED at position 12)',
  'err-vcf-truncated-sequence-at-eof':
    'genotype file line 4: not valid UTF-8 (byte 0xE2 at position 41)',
  'err-hapmap-latin1-byte': 'genotype file line 3: not valid UTF-8 (byte 0xE9 at position 2)',
  'err-wide-latin1-byte': 'genotype file line 3: not valid UTF-8 (byte 0xE9 at position 2)',
  'err-samples-latin1-byte': 'samples.csv line 4: not valid UTF-8 (byte 0xE9 at position 24)',
  'err-markers-latin1-byte': 'markers.csv line 3: not valid UTF-8 (byte 0xE9 at position 2)',
};

function messageOf(run: () => unknown): string {
  try {
    run();
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  return 'no error';
}

const caseNames = readdirSync(CASES).sort();

function loadCase(
  dir: string,
  parsed: ParsedGenotypes,
  profile: TokenProfile | null,
  crop: CompiledScheme,
): ContractExpect {
  const samples = parseSampleManifest(
    decodeUtf8(readFileSync(join(dir, 'samples.csv')), 'samples.csv'),
  );
  const markersPath = join(dir, 'markers.csv');
  const map = exists(markersPath)
    ? parseMarkerMap(decodeUtf8(readFileSync(markersPath), 'markers.csv'), crop)
    : undefined;
  return normaliseDataset(
    assembleDataset(parsed, samples, map, { tokenProfile: profileLabel(profile), crop }).dataset,
    VERSION,
  );
}

function exists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

/** The case's options.json (contract 1.4.0, 1.5.0), or an empty record when the file is absent. */
function caseOptions(dir: string): { profile?: string; crop?: string } {
  const path = join(dir, 'options.json');
  if (!exists(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8')) as { profile?: string; crop?: string };
}

function genotypeFile(dir: string): string {
  const names = readdirSync(dir).filter((n) => n.startsWith('genotypes.'));
  expect(names).toHaveLength(1);
  return names[0] as string;
}

/** Absolute paths of every file under `dir`. */
function contractFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? contractFiles(path) : [path];
  });
}

describe('contract cases', () => {
  it('has cases, each with exactly one expectation file', () => {
    expect(caseNames.length).toBeGreaterThan(0);
    for (const name of caseNames) {
      const files = readdirSync(join(CASES, name));
      const n = ['expected.json', 'expected-error.json'].filter((f) => files.includes(f)).length;
      expect(n, name).toBe(1);
    }
  });

  for (const name of caseNames) {
    const dir = join(CASES, name);
    const file = genotypeFile(dir);
    const bytes = new Uint8Array(readFileSync(join(dir, file)));
    const options = caseOptions(dir);
    const profile = resolveProfile(options.profile);
    const crop = resolveCrop(options.crop);

    if (exists(join(dir, 'expected.json'))) {
      const expected = JSON.parse(
        readFileSync(join(dir, 'expected.json'), 'utf8'),
      ) as ContractExpect;

      it(`${name}: synchronous load matches expected.json`, () => {
        expect(
          loadCase(dir, parseGenotypesBytes(file, bytes, { profile, crop }), profile, crop),
        ).toEqual(expected);
      });

      it(`${name}: streaming load matches expected.json`, async () => {
        const parsed = await parseGenotypesSource(file, bytesOf(bytes), { profile, crop });
        expect(loadCase(dir, parsed, profile, crop)).toEqual(expected);
      });
    } else {
      const { kind, contractVersion } = JSON.parse(
        readFileSync(join(dir, 'expected-error.json'), 'utf8'),
      ) as ContractErrorExpect;

      it(`${name}: fails with ${kind}`, () => {
        expect(contractVersion).toBe(VERSION);
        expect(ERROR_MESSAGES[kind], `unknown error kind ${kind}`).toBeDefined();
        expect(() =>
          loadCase(dir, parseGenotypesBytes(file, bytes, { profile, crop }), profile, crop),
        ).toThrow(ERROR_MESSAGES[kind]);
      });

      it(`${name}: streaming load fails with ${kind}`, async () => {
        await expect(
          (async () =>
            loadCase(
              dir,
              await parseGenotypesSource(file, bytesOf(bytes), { profile, crop }),
              profile,
              crop,
            ))(),
        ).rejects.toThrow(ERROR_MESSAGES[kind]);
      });

      if (kind === 'text.invalid_utf8') {
        it(`${name}: names the same line, position and lead byte through both entries`, async () => {
          const want = UTF8_MESSAGES[name];
          expect(want, `no entry in UTF8_MESSAGES for ${name}`).toBeDefined();
          const sync = messageOf(() =>
            loadCase(dir, parseGenotypesBytes(file, bytes, { profile, crop }), profile, crop),
          );
          let streamed = 'no error';
          try {
            loadCase(
              dir,
              await parseGenotypesSource(file, bytesOf(bytes), { profile, crop }),
              profile,
              crop,
            );
          } catch (e) {
            streamed = e instanceof Error ? e.message : String(e);
          }
          expect({ sync, streamed }).toEqual({ sync: want, streamed: want });
        });
      }
    }
  }

  it('UTF8_MESSAGES names only text.invalid_utf8 cases', () => {
    for (const name of Object.keys(UTF8_MESSAGES)) {
      const { kind } = JSON.parse(
        readFileSync(join(CASES, name, 'expected-error.json'), 'utf8'),
      ) as ContractErrorExpect;
      expect(kind, name).toBe('text.invalid_utf8');
    }
  });
});

describe('contract integrity', () => {
  it('MANIFEST.sha256 matches the files under contract/', () => {
    const recomputed = contractFiles(CONTRACT)
      .map((p) => relative(CONTRACT, p).split(sep).join('/'))
      .filter((p) => p !== 'MANIFEST.sha256')
      .sort()
      .map((p) => {
        const digest = createHash('sha256')
          .update(readFileSync(join(CONTRACT, ...p.split('/'))))
          .digest('hex');
        return `${digest}  ${p}`;
      });
    const manifest = readFileSync(join(CONTRACT, 'MANIFEST.sha256'), 'utf8');
    expect(manifest).toBe(recomputed.join('\n') + '\n');
  });

  it('VERSION appears verbatim in data-contract.md and docs/data-formats.md', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    const contractDoc = readFileSync(join(CONTRACT, 'data-contract.md'), 'utf8');
    expect(contractDoc).toContain(`Contract version: ${VERSION}\n`);
    const formats = readFileSync(
      join(import.meta.dirname, '..', 'docs', 'data-formats.md'),
      'utf8',
    );
    expect(formats).toContain(`version ${VERSION}`);
    const coding = readFileSync(join(import.meta.dirname, '..', 'docs', 'input-coding.md'), 'utf8');
    expect(coding).toContain(`under contract ${VERSION}`);
  });

  it('the ADR that CLAUDE.md names as the most recent exists', () => {
    const adr = readFileSync(
      join(import.meta.dirname, '..', 'docs', 'adr', '0030-first-release.md'),
      'utf8',
    );
    expect(adr.length).toBeGreaterThan(0);
  });
});
