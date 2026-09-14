#!/usr/bin/env node
/**
 * Byte-compares this repository's contract/ with a sibling checkout's.
 *
 * The copy here is canonical (contract/README.md, "Mirror rule"). Every file
 * present in either directory must exist in both with identical bytes. Prints
 * one line per difference and exits 1 if there is any, 0 otherwise. A local
 * gate, not a CI step (docs/m3-phases.md, phase 3).
 *
 * Usage: node scripts/check-contract-mirror.mjs <sibling-path>
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const siblingArg = process.argv[2];
if (siblingArg === undefined) {
  console.error('usage: node scripts/check-contract-mirror.mjs <sibling-path>');
  process.exit(2);
}

const ours = join(dirname(fileURLToPath(import.meta.url)), '..', 'contract');
const theirs = join(resolve(siblingArg), 'contract');

if (!existsSync(theirs)) {
  console.error(`contract mirror: ${theirs} does not exist`);
  process.exit(1);
}

/** Every file under `dir`, as posix paths relative to it. */
function walk(dir, rel = '') {
  return readdirSync(dir).flatMap((name) => {
    const relPath = rel === '' ? name : posix.join(rel, name);
    return statSync(join(dir, name)).isDirectory() ? walk(join(dir, name), relPath) : [relPath];
  });
}

const a = new Set(walk(ours));
const b = new Set(walk(theirs));
const differences = [];
for (const p of [...new Set([...a, ...b])].sort()) {
  if (!b.has(p)) differences.push(`missing in sibling: ${p}`);
  else if (!a.has(p)) differences.push(`only in sibling: ${p}`);
  else if (!readFileSync(join(ours, p)).equals(readFileSync(join(theirs, p))))
    differences.push(`differs: ${p}`);
}

if (differences.length > 0) {
  for (const d of differences) console.error(`contract mirror: ${d}`);
  process.exit(1);
}
console.log(`contract mirror: ${a.size} files identical`);
