/** Type declarations for build-cli.mjs, so tests/cli-bundle.test.ts typechecks. */
export declare function buildCli(o: {
  rootDir: string;
  outfile: string;
  version: string;
  commit: string;
}): Promise<void>;
