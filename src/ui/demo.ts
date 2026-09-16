/**
 * The demo dataset: which demos exist, where the site serves their files, and
 * how a `?demo=` query parameter and a share link are read and written.
 *
 * Responsibility: pure string and URL handling for the Upload screen's "Try
 * the demo dataset" button and App's `?demo=synthetic` auto-load (docs/adr/0017).
 * It fetches nothing: the worker fetches the files ('loadDemo'), because only
 * the worker calls fetch (CLAUDE.md, "Layout"). The only demo is the
 * synthetic fixture, copied into the built site under demo/synthetic/ by
 * vite.config.ts and served there by the dev server; it is generated data,
 * never real genotypes.
 *
 * Interface: DEMO_NAMES, DemoName, DemoParam, parseDemoParam(search),
 * demoLoadPayload(name, baseUrl, pageHref), demoShareLink(pageHref, name).
 */
import type { WorkerRequest } from '../workers/protocol.ts';

/** The files of each demo, relative to `<base>demo/<name>/`. */
const DEMO_FILES = {
  synthetic: { genotypes: 'genotypes.vcf', samples: 'samples.csv', markers: 'markers.csv' },
} as const;

export type DemoName = keyof typeof DEMO_FILES;

export const DEMO_NAMES: readonly DemoName[] = Object.keys(DEMO_FILES) as DemoName[];

/** What a page's query string asks for. */
export type DemoParam =
  { kind: 'none' } | { kind: 'demo'; name: DemoName } | { kind: 'unknown'; value: string };

export type DemoLoadPayload = Extract<WorkerRequest, { type: 'loadDemo' }>['payload'];

function isDemoName(value: string): value is DemoName {
  return Object.hasOwn(DEMO_FILES, value);
}

/**
 * Reads `demo` from a query string (`location.search`, with or without the
 * leading `?`). Absent means no demo; an empty or unrecognised value is
 * 'unknown', so the caller can report it. The first `demo` wins.
 */
export function parseDemoParam(search: string): DemoParam {
  const value = new URLSearchParams(search).get('demo');
  if (value === null) return { kind: 'none' };
  return isDemoName(value) ? { kind: 'demo', name: value } : { kind: 'unknown', value };
}

/**
 * The 'loadDemo' payload for a demo: absolute URLs of its files under the
 * site's base path (`import.meta.env.BASE_URL`), resolved against the page,
 * so the worker, whose own URL is a script under assets/, fetches the same
 * files the page would.
 */
export function demoLoadPayload(
  name: DemoName,
  baseUrl: string,
  pageHref: string,
): DemoLoadPayload {
  const files = DEMO_FILES[name];
  const dir = new URL(`${baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`}demo/${name}/`, pageHref);
  return {
    genotypeFileName: files.genotypes,
    genotypesUrl: new URL(files.genotypes, dir).href,
    samplesUrl: new URL(files.samples, dir).href,
    markersUrl: new URL(files.markers, dir).href,
  };
}

/** The current page's URL with its query replaced by `?demo=<name>` and no fragment. */
export function demoShareLink(pageHref: string, name: DemoName): string {
  const url = new URL(pageHref);
  url.search = new URLSearchParams({ demo: name }).toString();
  url.hash = '';
  return url.href;
}

/** The message the app alert shows for an unrecognised `?demo=` value. */
export function unknownDemoMessage(value: string): string {
  return `Unknown demo dataset "${value}" in the page address. Available: ${DEMO_NAMES.join(', ')}.`;
}
