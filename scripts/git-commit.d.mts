/** Type declarations for git-commit.mjs, so src/cli.ts, vite.config.ts and the tests typecheck. */
import type { execFileSync } from 'node:child_process';

export declare function resolveCommit(opts?: {
  env?: NodeJS.ProcessEnv;
  exec?: typeof execFileSync;
  cwd?: string;
}): string;
