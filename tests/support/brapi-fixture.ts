/**
 * Shared resolver from a BrAPI request to a file under tests/fixtures/brapi/.
 *
 * Responsibility: map a request path and query onto one of the nine generated
 * fixture files (scripts/make-fixture.mjs), so the node test's fake fetch and
 * the browser-mode mock server answer from the same files. Nothing here calls
 * the network.
 *
 * Interface: BRAPI_FIXTURE_DIR, BRAPI_FIXTURE_FILES, BRAPI_FIXTURE_PAGE_SIZE,
 * brapiFixtureFile(pathname, params, mode) -> file name or null (404).
 */
import { join } from 'node:path';

export const BRAPI_FIXTURE_DIR = join(import.meta.dirname, '..', 'fixtures', 'brapi');
export const BRAPI_FIXTURE_FILES = [
  'callsets.p0.json',
  'callsets.p1.json',
  'variants.p0.json',
  'variants.p1.json',
  'variants-nopos.p0.json',
  'allelematrix.v0.c0.json',
  'allelematrix.v0.c1.json',
  'allelematrix.v1.c0.json',
  'allelematrix.v1.c1.json',
] as const;
export const BRAPI_FIXTURE_PAGE_SIZE = { variants: 15, callSets: 5 } as const;

/** Fixture file for a BrAPI request path and query, or null (404), including for any variantSetDbId other than variantset1. /variants is selected by `pageToken`, not `page`, as the test server does. mode 'nopos' serves variants-nopos.p0.json for /variants page 0 and null for later pages. */
export function brapiFixtureFile(
  pathname: string,
  params: URLSearchParams,
  mode: 'pos' | 'nopos',
): string | null {
  // The fixture is one variant set; any other id is unknown to the server (404).
  if (params.get('variantSetDbId') !== 'variantset1') return null;
  let file: string | null = null;
  if (pathname.endsWith('/callsets')) {
    file = `callsets.p${params.get('page') ?? ''}.json`;
  } else if (pathname.endsWith('/variants')) {
    // Modelled on test-server.brapi.org (recorded 2026-09-15): /variants ignores
    // `page` and pages by `pageToken` (a page number), answering an empty
    // nextPageToken; no token is page 0.
    const page = params.get('pageToken') ?? '0';
    if (mode === 'nopos') file = page === '0' ? 'variants-nopos.p0.json' : null;
    else file = `variants.p${page}.json`;
  } else if (pathname.endsWith('/allelematrix')) {
    if (params.get('dataMatrixAbbreviations') !== 'GT') return null;
    file = `allelematrix.v${params.get('dimensionVariantPage') ?? ''}.c${params.get('dimensionCallSetPage') ?? ''}.json`;
  }
  if (file === null) return null;
  return (BRAPI_FIXTURE_FILES as readonly string[]).includes(file) ? file : null;
}
