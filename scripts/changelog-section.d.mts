/** Type declarations for changelog-section.mjs, so the tests typecheck. */
export declare const REPO_URL: string;
export declare function sectionBody(text: string, version: string): string;
export declare function releaseUnreleased(
  text: string,
  version: string,
  date: string,
  previous?: string,
): string;
