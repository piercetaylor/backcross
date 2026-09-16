#!/usr/bin/env node
/**
 * Asserts the shape and size of dist/assets after `vite build` (docs/adr/0016).
 * Usage: node scripts/check-bundle.mjs [distDir]   (default: <repo>/dist)
 */
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LIMITS = {
  /** This repository's own code: the entry chunk. */
  entryBytes: 262_144,
  /** Vite's default chunk warning, 500 kB, so no chunk can trip it. */
  chunkBytes: 500_000,
  /** Rolldown's shared runtime helpers, hoisted into their own chunk by code splitting. */
  runtimeBytes: 16_384,
};

/**
 * @param {string} assetsDir  the dist/assets directory
 * @returns {string[]} one problem per entry; empty when the bundle is as expected
 */
export function checkBundle(assetsDir) {
  const problems = [];
  const files = readdirSync(assetsDir).filter((name) => name.endsWith('.js'));

  const entry = files.filter((name) => /^index-[\w-]+\.js$/.test(name));
  const vendorReact = files.filter((name) => /^vendor-react-[\w-]+\.js$/.test(name));
  const vendor = files.filter(
    (name) => /^vendor-[\w-]+\.js$/.test(name) && !name.startsWith('vendor-react-'),
  );
  const worker = files.filter((name) => /^analysis\.worker-[\w-]+\.js$/.test(name));
  const runtime = files.filter((name) => /^rolldown-runtime-[\w-]+\.js$/.test(name));
  const known = new Set([...entry, ...vendorReact, ...vendor, ...worker, ...runtime]);
  const other = files.filter((name) => !known.has(name));

  if (entry.length !== 1) {
    problems.push(`expected exactly one index-*.js, found ${entry.length}`);
  }
  if (vendorReact.length !== 1) {
    problems.push(`expected exactly one vendor-react-*.js, found ${vendorReact.length}`);
  }
  if (vendor.length !== 1) {
    problems.push(`expected exactly one vendor-*.js (not vendor-react-*), found ${vendor.length}`);
  }
  if (worker.length !== 1) {
    problems.push(`expected exactly one analysis.worker-*.js, found ${worker.length}`);
  }
  if (runtime.length > 1) {
    problems.push(`expected at most one rolldown-runtime-*.js, found ${runtime.length}`);
  }
  for (const name of other) {
    problems.push(`unexpected file: ${name}`);
  }

  for (const name of entry) {
    const bytes = statSync(join(assetsDir, name)).size;
    if (bytes > LIMITS.entryBytes) {
      problems.push(`${name} is ${bytes} bytes, over the entryBytes limit of ${LIMITS.entryBytes}`);
    }
  }
  for (const name of runtime) {
    const bytes = statSync(join(assetsDir, name)).size;
    if (bytes > LIMITS.runtimeBytes) {
      problems.push(
        `${name} is ${bytes} bytes, over the runtimeBytes limit of ${LIMITS.runtimeBytes}`,
      );
    }
  }
  for (const name of files) {
    if (runtime.includes(name)) continue;
    const bytes = statSync(join(assetsDir, name)).size;
    if (bytes > LIMITS.chunkBytes) {
      problems.push(`${name} is ${bytes} bytes, over the chunkBytes limit of ${LIMITS.chunkBytes}`);
    }
  }

  return problems;
}

const isMain = (() => {
  try {
    return fileURLToPath(import.meta.url) === resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isMain) {
  const distDir = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const assetsDir = join(distDir, 'assets');
  const files = readdirSync(assetsDir).filter((name) => name.endsWith('.js'));
  for (const name of files) {
    console.log(`${name}: ${statSync(join(assetsDir, name)).size} bytes`);
  }
  const problems = checkBundle(assetsDir);
  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(problem);
    }
    process.exit(1);
  }
  console.log('bundle: ok');
}
