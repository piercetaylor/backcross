/**
 * Command-line entry point (Node >= 22.18, run as `node src/cli.ts`).
 *
 * Responsibility: run the same compute core outside the browser so results
 * can be scripted, regression-tested, or fed to Shiny dashboards without a
 * UI. Three subcommands write the three CSV tables of docs/data-formats.md.
 *
 * Usage:
 *   node src/cli.ts summarize --genotypes <vcf|hmp|csv[.gz]> --samples samples.csv
 *                             [--markers markers.csv] [--profile ID|FILE] [--max-gap-bp N] [--max-gap-cm N] [--out file.csv]
 *   node src/cli.ts segments  ... [--max-segment-gap-bp N] [--max-segment-gap-cm N]
 *                             [--min-markers N] [--max-missing-span N] [--include-short] [--out file.csv]
 *   node src/cli.ts targets   ... --target name=Gm13:28,500,000-29,100,000 [--target ...] [segment options] [--out file.csv]
 *
 * The genotype file is read as a stream (parseGenotypesSource), so a
 * bgzipped VCF is never held inflated. Warnings from the loaders and the
 * segment gap criterion go to stderr. `--profile` names a built-in token
 * profile or a JSON file of the same shape (a value containing / or \ or
 * ending .json is read as a path and validated); every CSV records it in its
 * trailing token_profile column (contract 1.4.0).
 */
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';

import { classifyDataset } from './core/classify.ts';
import { computeRpp, DEFAULT_RPP_PARAMS } from './core/rpp.ts';
import { callSegments, DEFAULT_SEGMENT_PARAMS, segmentGapCriterion } from './core/segments.ts';
import { checkTargets, parseTargetSpec } from './core/targets.ts';
import type { Classification, Dataset, SegmentParams } from './core/types.ts';
import { segmentsCsv } from './export/segments-csv.ts';
import { lineSummaryCsv } from './export/summary-csv.ts';
import { targetsCsv } from './export/targets-csv.ts';
import { assembleDataset, parseGenotypesSource } from './io/loaders.ts';
import { parseSampleManifest } from './io/manifest.ts';
import { parseMarkerMap } from './io/markers.ts';
import { profileLabel, resolveProfile, validateProfile } from './io/profiles.ts';
import type { TokenProfile } from './io/profiles.ts';

const USAGE = [
  'usage: node src/cli.ts <summarize|segments|targets> --genotypes FILE --samples samples.csv',
  '         [--markers markers.csv] [--profile ID|FILE] [--out FILE]',
  '  summarize: [--max-gap-bp N] [--max-gap-cm N]',
  '  segments:  [--max-segment-gap-bp N] [--max-segment-gap-cm N] [--min-markers N]',
  '             [--max-missing-span N] [--include-short]',
  '  targets:   --target name=Gm13:28,500,000-29,100,000 [--target marker_id] ... plus the segment options',
].join('\n');

function numberOr(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const v = Number(raw);
  if (!Number.isFinite(v)) throw new Error(`not a number: ${raw}`);
  return v;
}

/** A built-in id, or a path (contains / or \, or ends .json) to a profile JSON file. */
function readProfile(ref: string | undefined): TokenProfile | null {
  if (ref === undefined) return null;
  if (ref.includes('/') || ref.includes('\\') || ref.toLowerCase().endsWith('.json')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(ref, 'utf8')) as unknown;
    } catch (e) {
      throw new Error(`token profile file ${ref}: ${e instanceof Error ? e.message : String(e)}`, {
        cause: e,
      });
    }
    return validateProfile(parsed);
  }
  return resolveProfile(ref);
}

async function load(
  genotypes: string,
  samplesPath: string,
  markersPath: string | undefined,
  profile: TokenProfile | null,
): Promise<Dataset> {
  // A Node Readable is async-iterable over Buffer chunks, which are Uint8Arrays.
  const parsed = await parseGenotypesSource(basename(genotypes), createReadStream(genotypes), {
    profile,
  });
  const samples = parseSampleManifest(readFileSync(samplesPath, 'utf8'));
  const markerMap =
    markersPath === undefined ? undefined : parseMarkerMap(readFileSync(markersPath, 'utf8'));
  const { dataset, warnings } = assembleDataset(parsed, samples, markerMap, {
    tokenProfile: profileLabel(profile),
  });
  for (const w of warnings) console.error(`warning: ${w}`);
  return dataset;
}

function allSegments(
  dataset: Dataset,
  cls: Classification,
  params: SegmentParams,
  includeShort: boolean,
) {
  return Array.from(cls.candidateCols, (_, c) =>
    callSegments(dataset, cls, c, params, includeShort),
  );
}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      genotypes: { type: 'string' },
      samples: { type: 'string' },
      markers: { type: 'string' },
      profile: { type: 'string' },
      out: { type: 'string' },
      target: { type: 'string', multiple: true },
      'include-short': { type: 'boolean' },
      'max-gap-bp': { type: 'string' },
      'max-gap-cm': { type: 'string' },
      'max-segment-gap-bp': { type: 'string' },
      'max-segment-gap-cm': { type: 'string' },
      'min-markers': { type: 'string' },
      'max-missing-span': { type: 'string' },
    },
  });
  const command = positionals[0];
  const known = command === 'summarize' || command === 'segments' || command === 'targets';
  if (!known || values.genotypes === undefined || values.samples === undefined) {
    console.error(USAGE);
    return 2;
  }
  // An option that belongs to another subcommand is a mistake, not a no-op:
  // --max-gap-bp on `segments` would otherwise be silently ignored.
  const RPP_ONLY = ['max-gap-bp', 'max-gap-cm'] as const;
  const SEGMENT_ONLY = [
    'max-segment-gap-bp',
    'max-segment-gap-cm',
    'min-markers',
    'max-missing-span',
    'include-short',
    'target',
  ] as const;
  const foreign = (command === 'summarize' ? SEGMENT_ONLY : RPP_ONLY).filter(
    (k) => values[k] !== undefined,
  );
  if (foreign.length > 0) {
    console.error(`${command}: option(s) not accepted here: ${foreign.map((k) => `--${k}`).join(', ')}
${USAGE}`);
    return 2;
  }
  if (command === 'targets' && (values.target ?? []).length === 0) {
    console.error(`targets: at least one --target is required
${USAGE}`);
    return 2;
  }
  const dataset = await load(
    values.genotypes,
    values.samples,
    values.markers,
    readProfile(values.profile),
  );
  const provenance = { tokenProfile: dataset.tokenProfile };
  const cls = classifyDataset(dataset);

  let csv: string;
  if (command === 'summarize') {
    const params = {
      maxGapBp: numberOr(values['max-gap-bp'], DEFAULT_RPP_PARAMS.maxGapBp),
      maxGapCm: numberOr(values['max-gap-cm'], DEFAULT_RPP_PARAMS.maxGapCm),
    };
    csv = lineSummaryCsv(
      computeRpp(dataset, cls, params),
      dataset.chromosomeOrder,
      dataset.samples,
      provenance,
    );
  } else {
    const params: SegmentParams = {
      minMarkers: numberOr(values['min-markers'], DEFAULT_SEGMENT_PARAMS.minMarkers),
      maxSegmentGapBp: numberOr(
        values['max-segment-gap-bp'],
        DEFAULT_SEGMENT_PARAMS.maxSegmentGapBp,
      ),
      maxSegmentGapCm: numberOr(
        values['max-segment-gap-cm'],
        DEFAULT_SEGMENT_PARAMS.maxSegmentGapCm,
      ),
      maxMissingSpan: numberOr(values['max-missing-span'], DEFAULT_SEGMENT_PARAMS.maxMissingSpan),
    };
    const criterion = segmentGapCriterion(dataset);
    console.error(
      `segment gap criterion: ${criterion} (${criterion === 'cm' ? `${params.maxSegmentGapCm} cM` : `${params.maxSegmentGapBp} bp`})`,
    );
    const segments = allSegments(dataset, cls, params, values['include-short'] === true);
    if (command === 'segments') {
      csv = segmentsCsv(segments.flat(), criterion, dataset.samples, provenance);
    } else {
      const regions = (values.target ?? []).map((s) => parseTargetSpec(s, dataset));
      csv = targetsCsv(checkTargets(dataset, cls, segments, regions), dataset.samples, provenance);
    }
  }
  if (values.out === undefined) process.stdout.write(csv);
  else writeFileSync(values.out, csv);
  return 0;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (e) {
  console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
