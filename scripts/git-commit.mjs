// Resolves the short commit for the provenance stamp (docs/adr/0030, Q4).
// Returns 'g' + the first 7 hex of HEAD, with '-dirty' appended when tracked
// files differ from HEAD (`git status --porcelain --untracked-files=no` prints
// anything; untracked files are ignored); when GITHUB_SHA holds 40 hex (CI),
// 'g' + its first 7 with no dirty check; 'NA' when git is unavailable, the
// directory is not a checkout, or the output is not 7 hex.
// Shared by scripts/build-cli.mjs, vite.config.ts (`define`) and the
// unbundled CLI's fallback (src/cli.ts), so the three agree.
import { execFileSync } from 'node:child_process';

/**
 * @param {{ env?: NodeJS.ProcessEnv, exec?: typeof execFileSync, cwd?: string }} [opts]
 * @returns {string}
 */
export function resolveCommit({
  env = process.env,
  exec = execFileSync,
  cwd = process.cwd(),
} = {}) {
  const sha = env['GITHUB_SHA'];
  if (typeof sha === 'string' && /^[0-9a-f]{40}$/.test(sha)) {
    return `g${sha.slice(0, 7)}`;
  }
  /** @type {import('node:child_process').ExecFileSyncOptionsWithStringEncoding} */
  const options = { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
  try {
    const head = String(exec('git', ['rev-parse', '--short=7', 'HEAD'], options)).trim();
    if (!/^[0-9a-f]{7}$/.test(head)) return 'NA';
    const status = String(exec('git', ['status', '--porcelain', '--untracked-files=no'], options));
    return status.trim() === '' ? `g${head}` : `g${head}-dirty`;
  } catch {
    return 'NA';
  }
}
