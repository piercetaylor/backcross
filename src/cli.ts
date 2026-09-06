/**
 * Command-line entry point (Node >= 22.18, run as `node src/cli.ts`).
 *
 * Responsibility: run the same compute core outside the browser so results
 * can be scripted, regression-tested, or fed to Shiny dashboards without a
 * UI. Only the per-line summary exists in the scaffold; `segments` and
 * `targets` subcommands follow the corresponding core modules (M1).
 *
 * Usage:
 *   node src/cli.ts summarize --genotypes <vcf|hmp|csv[.gz]> --samples samples.csv
 *                             [--markers markers.csv] [--max-gap-bp N] [--max-gap-cm N] [--out file.csv]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';

import { classifyDataset } from './core/classify.ts';
import { computeRpp, DEFAULT_RPP_PARAMS } from './core/rpp.ts';
import { lineSummaryCsv } from './export/summary-csv.ts';
import { assembleDataset, parseGenotypesBytes } from './io/loaders.ts';
import { parseSampleManifest } from './io/manifest.ts';
import { parseMarkerMap } from './io/markers.ts';

function main(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      genotypes: { type: 'string' },
      samples: { type: 'string' },
      markers: { type: 'string' },
      out: { type: 'string' },
      'max-gap-bp': { type: 'string' },
      'max-gap-cm': { type: 'string' },
    },
  });
  const command = positionals[0];
  if (command !== 'summarize' || values.genotypes === undefined || values.samples === undefined) {
    console.error(
      'usage: node src/cli.ts summarize --genotypes FILE --samples samples.csv [--markers markers.csv] [--out FILE]',
    );
    return 2;
  }
  const parsed = parseGenotypesBytes(
    basename(values.genotypes),
    new Uint8Array(readFileSync(values.genotypes)),
  );
  const samples = parseSampleManifest(readFileSync(values.samples, 'utf8'));
  const markerMap =
    values.markers === undefined ? undefined : parseMarkerMap(readFileSync(values.markers, 'utf8'));
  const { dataset, warnings } = assembleDataset(parsed, samples, markerMap);
  for (const w of warnings) console.error(`warning: ${w}`);

  const params = {
    maxGapBp:
      values['max-gap-bp'] === undefined
        ? DEFAULT_RPP_PARAMS.maxGapBp
        : Number(values['max-gap-bp']),
    maxGapCm:
      values['max-gap-cm'] === undefined
        ? DEFAULT_RPP_PARAMS.maxGapCm
        : Number(values['max-gap-cm']),
  };
  const cls = classifyDataset(dataset);
  const csv = lineSummaryCsv(computeRpp(dataset, cls, params), dataset.chromosomeOrder);
  if (values.out === undefined) process.stdout.write(csv);
  else writeFileSync(values.out, csv);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
