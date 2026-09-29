// Bundles src/cli.ts into one ESM file for release (docs/adr/0030, Q2).
// Usage: node scripts/build-cli.mjs            -> dist-cli/backcross-cli.mjs
import { readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

import { resolveCommit } from './git-commit.mjs';

/** @param {{ rootDir: string, outfile: string, version: string, commit: string }} o */
export async function buildCli(o) {
  await build({
    entryPoints: [join(o.rootDir, 'src', 'cli.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    banner: { js: '#!/usr/bin/env node' },
    define: {
      __APP_VERSION__: JSON.stringify(o.version),
      __GIT_COMMIT__: JSON.stringify(o.commit),
    },
    outfile: o.outfile,
    sourcemap: false,
    minify: false,
    legalComments: 'inline',
    logLevel: 'warning',
  });
}

const isMain = (() => {
  try {
    return fileURLToPath(import.meta.url) === resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isMain) {
  const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
  const outfile = join(rootDir, 'dist-cli', 'backcross-cli.mjs');
  const version = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')).version;
  const commit = resolveCommit({ cwd: rootDir });
  await buildCli({ rootDir, outfile, version, commit });
  console.log(`cli bundle: ${statSync(outfile).size} bytes, backcross ${version} ${commit}`);
}
