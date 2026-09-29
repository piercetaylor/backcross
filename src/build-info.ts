/**
 * Build stamp (docs/adr/0030, Q4).
 *
 * Responsibility: expose the version and commit a bundler defined, without
 * importing anything, so it runs in the browser, the worker and Node alike.
 * vite.config.ts `define` stamps the app and the worker; scripts/build-cli.mjs
 * stamps the CLI bundle. Unbundled code (`node src/cli.ts`, vitest without a
 * define) sees null; src/cli.ts then resolves the stamp itself from
 * package.json and scripts/git-commit.mjs. Never reads git here.
 *
 * Interface: TOOL_NAME, BuildInfo, buildInfo() -> BuildInfo | null,
 * toolProvenance() -> { tool, toolVersion, toolCommit } ('NA' when unknown).
 */
declare const __APP_VERSION__: string | undefined;
declare const __GIT_COMMIT__: string | undefined;

export const TOOL_NAME = 'backcross';

export interface BuildInfo {
  version: string;
  commit: string;
}

export function buildInfo(): BuildInfo | null {
  if (typeof __APP_VERSION__ !== 'string' || typeof __GIT_COMMIT__ !== 'string') return null;
  return { version: __APP_VERSION__, commit: __GIT_COMMIT__ };
}

export interface ToolProvenance {
  tool: string;
  toolVersion: string;
  toolCommit: string;
}

export function toolProvenance(): ToolProvenance {
  const b = buildInfo();
  return { tool: TOOL_NAME, toolVersion: b?.version ?? 'NA', toolCommit: b?.commit ?? 'NA' };
}
