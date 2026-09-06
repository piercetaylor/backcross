/**
 * Command-line entry point (Node >= 22.18, run as `node src/cli.ts`).
 *
 * Responsibility: run the same compute core outside the browser so results
 * can be scripted, regression-tested, or fed to Shiny dashboards without a
 * UI. Three subcommands write the three CSV tables of docs/data-formats.md.
 *
 * Usage:
 *   node src/cli.ts summarize --genotypes <vcf|hmp|csv[.gz]> --samples samples.csv
 *                             [--markers markers.csv] [--max-gap-bp N] [--max-gap-cm N] [--out file.csv]
 *   node src/cli.ts segments  ... [--max-segment-gap-bp N] [--max-segment-gap-cm N]
 *                             [--min-markers N] [--max-missing-span N] [--include-short] [--out file.csv]
 *   node src/cli.ts targets   ... --target name=Gm13:28,500,000-29,100,000 [--target ...] [segment options] [--out file.csv]
 *
 * Warnings from the loaders and the segment gap criterion go to stderr.
 */
import { readFileSync, writeFileSync } from 'node:fs';
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
import { assembleDataset, parseGenotypesBytes } from './io/loaders.ts';
import { parseSampleManifest } from './io/manifest.ts';
import { parseMarkerMap } from './io/markers.ts';

const USAGE = [
  'usage: node src/cli.ts <summarize|segments|targets> --genotypes FILE --samples samples.csv',
  '         [--markers markers.csv] [--out FILE]',
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

function load(genotypes: string, samplesPath: string, markersPath: string | undefined): Dataset {
  const parsed = parseGenotypesBytes(basename(genotypes), new Uint8Array(readFileSync(genotypes)));
  const samples = parseSampleManifest(readFileSync(samplesPath, 'utf8'));
  const markerMap =
    markersPath === undefined ? undefined : parseMarkerMap(readFileSync(markersPath, 'utf8'));
  const { dataset, warnings } = assembleDataset(parsed, samples, markerMap);
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

function main(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      genotypes: { type: 'string' },
      samples: { type: 'string' },
      markers: { type: 'string' },
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
  const dataset = load(values.genotypes, values.samples, values.markers);
  const cls = classifyDataset(dataset);

  let csv: string;
  if (command === 'summarize') {
    const params = {
      maxGapBp: numberOr(values['max-gap-bp'], DEFAULT_RPP_PARAMS.maxGapBp),
      maxGapCm: numberOr(values['max-gap-cm'], DEFAULT_RPP_PARAMS.maxGapCm),
    };
    csv = lineSummaryCsv(computeRpp(dataset, cls, params), dataset.chromosomeOrder);
  } else {
    const params: SegmentParams = {
      minMarkers: numberOr(values['min-markers'], DEFAULT_SEGMENT_PARAMS.minMarkers),
      maxGapBp: numberOr(values['max-segment-gap-bp'], DEFAULT_SEGMENT_PARAMS.maxGapBp),
      maxGapCm: numberOr(values['max-segment-gap-cm'], DEFAULT_SEGMENT_PARAMS.maxGapCm),
      maxMissingSpan: numberOr(values['max-missing-span'], DEFAULT_SEGMENT_PARAMS.maxMissingSpan),
    };
    const criterion = segmentGapCriterion(dataset);
    console.error(
      `segment gap criterion: ${criterion} (${criterion === 'cm' ? `${params.maxGapCm} cM` : `${params.maxGapBp} bp`})`,
    );
    const segments = allSegments(dataset, cls, params, values['include-short'] === true);
    if (command === 'segments') {
      csv = segmentsCsv(segments.flat(), criterion);
    } else {
      const specs = values.target ?? [];
      if (specs.length === 0) {
        console.error('targets: at least one --target is required\n' + USAGE);
        return 2;
      }
      const regions = specs.map((s) => parseTargetSpec(s, dataset));
      csv = targetsCsv(checkTargets(dataset, cls, segments, regions));
    }
  }
  if (values.out === undefined) process.stdout.write(csv);
  else writeFileSync(values.out, csv);
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
