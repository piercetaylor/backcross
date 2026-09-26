/**
 * The demo dataset: which demos exist, where the site serves their files, and
 * how a `?demo=` query parameter and a share link are read and written.
 *
 * Responsibility: pure string and URL handling for the Upload screen's "Try
 * the demo dataset" button and App's `?demo=synthetic` auto-load (docs/adr/0017),
 * including the optional `crop` parameter that names the crop scheme the demo
 * loads under (`?demo=synthetic&crop=pea`; absent means soybean).
 * It fetches nothing: the worker fetches the files ('loadDemo'), because only
 * the worker calls fetch (CLAUDE.md, "Layout"). The only demo is the
 * synthetic fixture, copied into the built site under demo/synthetic/ by
 * vite.config.ts and served there by the dev server; it is generated data,
 * never real genotypes.
 *
 * Interface: DEMO_NAMES, DemoName, DemoParam, parseDemoParam(search),
 * demoLoadPayload(name, baseUrl, pageHref), demoShareLink(pageHref, name, crop?),
 * unknownDemoMessage(value), unknownCropMessage(value).
 */
import { BUILTIN_CROPS, DEFAULT_CROP_ID } from '../io/crops.ts';
import type { WorkerRequest } from '../workers/protocol.ts';

/** The files of each demo, relative to `<base>demo/<name>/`. */
const DEMO_FILES = {
  synthetic: { genotypes: 'genotypes.vcf', samples: 'samples.csv', markers: 'markers.csv' },
} as const;

export type DemoName = keyof typeof DEMO_FILES;

export const DEMO_NAMES: readonly DemoName[] = Object.keys(DEMO_FILES) as DemoName[];

/** What a page's query string asks for. */
export type DemoParam =
  | { kind: 'none' }
  | { kind: 'demo'; name: DemoName; crop?: string }
  | { kind: 'unknown'; value: string }
  | { kind: 'unknownCrop'; value: string };

export type DemoLoadPayload = Extract<WorkerRequest, { type: 'loadDemo' }>['payload'];

function isDemoName(value: string): value is DemoName {
  return Object.hasOwn(DEMO_FILES, value);
}

/**
 * Reads `demo`, and with it `crop`, from a query string (`location.search`,
 * with or without the leading `?`). Absent `demo` means no demo, whatever
 * `crop` says; an empty or unrecognised demo is 'unknown', and a `crop` that
 * is not a built-in crop id (exact case) is 'unknownCrop', so the caller can
 * report either rather than load under a scheme the link did not ask for.
 * The first of each parameter wins.
 */
export function parseDemoParam(search: string): DemoParam {
  const params = new URLSearchParams(search);
  const value = params.get('demo');
  if (value === null) return { kind: 'none' };
  if (!isDemoName(value)) return { kind: 'unknown', value };
  const crop = params.get('crop');
  if (crop === null) return { kind: 'demo', name: value };
  if (!BUILTIN_CROPS.has(crop)) return { kind: 'unknownCrop', value: crop };
  return { kind: 'demo', name: value, crop };
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

/**
 * The current page's URL with its query replaced by `?demo=<name>`, plus
 * `&crop=<id>` for any crop but the default soybean, and no fragment.
 */
export function demoShareLink(pageHref: string, name: DemoName, crop?: string): string {
  const url = new URL(pageHref);
  url.search = new URLSearchParams(
    crop === undefined || crop === DEFAULT_CROP_ID ? { demo: name } : { demo: name, crop },
  ).toString();
  url.hash = '';
  return url.href;
}

/** The message the app alert shows for an unrecognised `?demo=` value. */
export function unknownDemoMessage(value: string): string {
  return `Unknown demo dataset "${value}" in the page address. Available: ${DEMO_NAMES.join(', ')}.`;
}

/** The message the app alert shows for an unrecognised `?crop=` value beside `?demo=`. */
export function unknownCropMessage(value: string): string {
  return `Unknown crop "${value}" in the page address. Available: ${[...BUILTIN_CROPS.keys()].join(', ')}.`;
}
