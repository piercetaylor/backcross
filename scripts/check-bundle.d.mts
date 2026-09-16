/** Type declarations for check-bundle.mjs, so tests/check-bundle.test.ts typechecks. */
export declare const LIMITS: {
  entryBytes: number;
  chunkBytes: number;
  runtimeBytes: number;
};

export declare function checkBundle(assetsDir: string): string[];
