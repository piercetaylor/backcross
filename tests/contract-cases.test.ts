/**
 * The shared data contract (contract/README.md), checked against this repository's loaders.
 *
 * Every directory under contract/cases/ is loaded through the synchronous and
 * the streaming genotype entries, joined with its samples.csv and optional
 * markers.csv, normalised (tests/support/normalise.ts) and compared with the
 * hand-authored expected.json; an error case must throw the message its kind
 * maps to below. The kind-to-message table lives here, not in the contract,
 * so rewording a message is a change to this test and not to the contract.
 * The manifest and the version string are checked too.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import { assembleDataset, parseGenotypesBytes, parseGenotypesSource } from '../src/io/loaders.ts';
import type { ParsedGenotypes } from '../src/io/builder.ts';
import { parseSampleManifest } from '../src/io/manifest.ts';
import { parseMarkerMap } from '../src/io/markers.ts';
import { bytesOf } from '../src/io/stream.ts';
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
};

const caseNames = readdirSync(CASES).sort();

function loadCase(dir: string, parsed: ParsedGenotypes): ContractExpect {
  const samples = parseSampleManifest(readFileSync(join(dir, 'samples.csv'), 'utf8'));
  const markersPath = join(dir, 'markers.csv');
  const map = exists(markersPath) ? parseMarkerMap(readFileSync(markersPath, 'utf8')) : undefined;
  return normaliseDataset(assembleDataset(parsed, samples, map).dataset, VERSION);
}

function exists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
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

    if (exists(join(dir, 'expected.json'))) {
      const expected = JSON.parse(
        readFileSync(join(dir, 'expected.json'), 'utf8'),
      ) as ContractExpect;

      it(`${name}: synchronous load matches expected.json`, () => {
        expect(loadCase(dir, parseGenotypesBytes(file, bytes))).toEqual(expected);
      });

      it(`${name}: streaming load matches expected.json`, async () => {
        const parsed = await parseGenotypesSource(file, bytesOf(bytes));
        expect(loadCase(dir, parsed)).toEqual(expected);
      });
    } else {
      const { kind, contractVersion } = JSON.parse(
        readFileSync(join(dir, 'expected-error.json'), 'utf8'),
      ) as ContractErrorExpect;

      it(`${name}: fails with ${kind}`, () => {
        expect(contractVersion).toBe(VERSION);
        expect(ERROR_MESSAGES[kind], `unknown error kind ${kind}`).toBeDefined();
        expect(() => loadCase(dir, parseGenotypesBytes(file, bytes))).toThrow(ERROR_MESSAGES[kind]);
      });
    }
  }
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
  });
});
