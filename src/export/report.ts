/**
 * Self-contained HTML report (M2).
 *
 * Responsibility: render dataset summary, warnings, parameters, QC table,
 * per-line table, donor segments, target checks and a graphical genotype
 * image (PNG data URI drawn by the canvas renderer) for each line that has
 * one, into a single HTML string with no external resources, so it can be
 * attached to an email or archived. `images` is keyed by sample id and may
 * cover fewer lines than the tables (for example, the current UI selection);
 * the Graphical genotypes section states how many lines have a figure and
 * names the sample ids that do not, so an archived report is explicit about
 * coverage rather than silently dropping lines from the figures list. PDF is
 * produced by the browser's print dialog from this page (print stylesheet),
 * not by a server. The function is pure: it does not touch the DOM, the
 * filesystem or the network, so it runs the same way in Node, in the worker
 * and in the browser tab.
 *
 * Every value in the report was computed with the parameters carried in
 * `input.params`; ADR 0006 requires the RPP coverage cap to be stated because
 * results depend on it, so the Parameters section always lists it.
 *
 * Interface: buildHtmlReport(input: ReportInput) -> string.
 */
import { CallClass } from '../core/types.ts';
import type {
  CallClassValue,
  DonorSegment,
  LineRpp,
  QcReport,
  QcThresholds,
  RppParams,
  SampleRecord,
  SegmentParams,
  TargetCheck,
} from '../core/types.ts';
import { CALL_CLASS_LABEL } from '../core/types.ts';
import { classSwatchCss } from '../core/palette.ts';

/**
 * The dataset facts the report states. Deliberately not a `Dataset`: the
 * genotype matrix stays inside the worker (docs/adr/0001), and a report that
 * accepted the whole structure would invite a caller to synthesise one.
 */
export interface ReportDataset {
  nMarkers: number;
  nChromosomes: number;
  /** True when markers.csv supplied cM positions. */
  hasCm: boolean;
  samples: SampleRecord[];
}

export interface ReportInput {
  dataset: ReportDataset;
  lineRpp: LineRpp[];
  qc: QcReport | null;
  targets: TargetCheck[];
  /** Donor segments per candidate, in lineRpp order; empty array when not computed. */
  segmentsByCandidate: DonorSegment[][];
  /**
   * Data URIs of pre-rendered genotype images keyed by sample_id. May omit
   * entries for lines present in `lineRpp`; the report states which lines
   * lack a figure rather than silently dropping them.
   */
  images: Map<string, string>;
  generatedAt: Date;
  /** The parameters every number in the report was computed with. */
  params: { rpp: RppParams; segments: SegmentParams; qc: QcThresholds };
  /** Which run-breaking test produced the segments. */
  gapCriterion: 'cm' | 'bp';
  /** Loader warnings, shown so an archived report records what was dropped or overridden. */
  warnings: string[];
  /**
   * Informative markers in the dataset. Passed in rather than derived, because
   * informativeness is a property of the parents and the markers, and both
   * places it could be read from (a QC report, a line's RPP row) are optional.
   */
  nInformative: number;
  /** Optional free-text title; defaults to "Isoline Browser report". */
  title?: string;
}

/** Escapes text for use in HTML element content or a quoted attribute. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Six-decimal rate or RPP formatting, matching the CSV exporters; NaN as NA. */
function num(x: number, digits = 6): string {
  return Number.isNaN(x) ? 'NA' : x.toFixed(digits);
}

/** Integer position or count formatting, matching the CSV exporters; NaN as NA. */
function int(x: number): string {
  return Number.isNaN(x) ? 'NA' : String(Math.round(x));
}

/** Length in Mb to two decimals; NaN (no segments) as NA. */
function mb(bp: number, digits = 2): string {
  return Number.isNaN(bp) ? 'NA' : (bp / 1_000_000).toFixed(digits);
}

/** A key/value block for sections that are not tables (no caption or th needed). */
function defList(pairs: [string, string][]): string {
  const items = pairs
    .map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${value}</dd>`)
    .join('');
  return `<dl>${items}</dl>`;
}

/** A table with a caption and scoped column headers, per row cells pre-formatted. */
function table(caption: string, header: string[], rows: string[][]): string {
  const thead = `<thead><tr>${header
    .map((h) => `<th scope="col">${escapeHtml(h)}</th>`)
    .join('')}</tr></thead>`;
  const tbody = `<tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
    .join('')}</tbody>`;
  return `<table><caption>${escapeHtml(caption)}</caption>${thead}${tbody}</table>`;
}

function bulletList(items: string[]): string {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

/** Legend order: the same ascending class codes used throughout src/core/types.ts. */
const CLASS_ORDER: CallClassValue[] = [
  CallClass.MISSING,
  CallClass.RP_HOM,
  CallClass.DONOR_HOM,
  CallClass.HET,
  CallClass.UNINFORMATIVE,
  CallClass.NONPARENTAL,
];

const STYLE = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin: 2rem; color: #1a1a1a; background: #ffffff; line-height: 1.4; }
h1 { font-size: 1.6rem; margin-bottom: 0.25rem; }
h2 { font-size: 1.25rem; margin-top: 2rem; border-bottom: 1px solid #ccc; padding-bottom: 0.25rem; }
h3 { font-size: 1rem; margin-top: 1.5rem; margin-bottom: 0.5rem; }
p { max-width: 60rem; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.15rem 1rem; max-width: 40rem; }
dt { font-weight: 600; }
dd { margin: 0; }
table { border-collapse: collapse; width: 100%; margin: 0.75rem 0 1.5rem; font-size: 0.85rem; }
caption { text-align: left; font-weight: 600; margin-bottom: 0.4rem; }
th, td { border: 1px solid #ccc; padding: 0.3rem 0.5rem; text-align: left; vertical-align: top; }
th { background: #f0f0f0; }
ul { margin: 0.5rem 0; padding-left: 1.4rem; }
.legend { display: flex; flex-wrap: wrap; gap: 0.5rem 1.5rem; margin: 0.75rem 0 1.5rem; padding: 0; list-style: none; }
.legend li { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; }
.swatch { display: inline-block; width: 0.9rem; height: 0.9rem; border: 1px solid #1C1C1C; flex: none; }
.geno-figure { break-inside: avoid; margin: 0 0 1.5rem; }
.geno-figure img { max-width: 100%; border: 1px solid #ccc; display: block; }
.image-note { font-style: italic; color: #555; }
footer { margin-top: 2rem; font-size: 0.85rem; color: #555; }
@media print {
  body { margin: 0.5in; background: #ffffff; color: #000000; }
  h2 { border-bottom: 1px solid #000000; }
  th { background: #ffffff; }
  th, td { border-color: #000000; }
  a { color: #000000; }
  .geno-figure { break-inside: avoid; page-break-inside: avoid; }
}
`;

export function buildHtmlReport(input: ReportInput): string {
  const { dataset, lineRpp, qc, targets, segmentsByCandidate, images, generatedAt, params } = input;
  const title = input.title ?? 'Isoline Browser report';
  const hasMap = dataset.hasCm;

  const lineNameById = new Map(dataset.samples.map((s) => [s.sampleId, s.lineName] as const));
  const nameFor = (sampleId: string): string => lineNameById.get(sampleId) ?? sampleId;

  // --- Header ---
  const headerHtml = `
<h1>${escapeHtml(title)}</h1>
<p>Generated ${escapeHtml(generatedAt.toISOString())}. Genotype data was processed locally in the
browser and is not included in this file except as the summary figures and images shown below.</p>`;

  // --- Dataset summary ---
  const roleCounts = { recurrent_parent: 0, donor_parent: 0, candidate: 0, progeny: 0 };
  for (const s of dataset.samples) roleCounts[s.role]++;
  const nInformative = input.nInformative;
  const datasetPairs: [string, string][] = [
    ['Marker count', String(dataset.nMarkers)],
    ['Informative markers', int(nInformative)],
    ['Recurrent parent samples', String(roleCounts.recurrent_parent)],
    ['Donor parent samples', String(roleCounts.donor_parent)],
    ['Candidate samples', String(roleCounts.candidate)],
    ['Progeny samples', String(roleCounts.progeny)],
    ['Chromosome count', String(dataset.nChromosomes)],
    ['Genetic map supplied', hasMap ? 'yes' : 'no'],
  ];
  if (qc !== null) {
    datasetPairs.push(['Parent polymorphism rate', qc.parentPolymorphismRate.toFixed(3)]);
  }
  const datasetSummaryHtml = `<h2>Dataset summary</h2>${defList(datasetPairs)}`;

  // --- Warnings (omit when empty) ---
  const warningsHtml =
    input.warnings.length === 0 ? '' : `<h2>Warnings</h2>${bulletList(input.warnings)}`;

  // --- Parameters ---
  const gapSentence =
    input.gapCriterion === 'cm'
      ? 'Donor runs were broken on genetic distance because a genetic map was supplied; any step touching a marker without a cM value was tested on physical distance instead.'
      : 'Donor runs were broken on physical distance because no genetic map was supplied.';
  const paramPairs: [string, string][] = [
    ['RPP coverage cap (bp)', String(params.rpp.maxGapBp)],
    ['RPP coverage cap (cM)', String(params.rpp.maxGapCm)],
    ['Segment minimum markers', String(params.segments.minMarkers)],
    ['Segment maximum gap (bp)', String(params.segments.maxSegmentGapBp)],
    ['Segment maximum gap (cM)', String(params.segments.maxSegmentGapCm)],
    ['Segment maximum missing span (markers)', String(params.segments.maxMissingSpan)],
    ['QC line missing-rate maximum', String(params.qc.lineMissingMax)],
    ['QC line heterozygosity-rate maximum', String(params.qc.lineHetMax)],
    ['QC marker call-rate minimum', String(params.qc.markerCallRateMin)],
    ['QC parent heterozygosity-rate maximum', String(params.qc.parentHetMax)],
  ];
  const parametersHtml = `
<h2>Parameters</h2>
${defList(paramPairs)}
<p>${escapeHtml(gapSentence)}</p>
<p>The physical- and genetic-distance-weighted RPP figures in this report depend on the coverage
cap values above (docs/adr/0006); a different cap produces different rpp_bp and rpp_cm values.</p>`;

  // --- Quality control (omit when qc is null) ---
  let qcHtml = '';
  if (qc !== null) {
    const flagsHtml =
      qc.datasetFlags.length === 0 ? '<p>No dataset-level flags.</p>' : bulletList(qc.datasetFlags);
    const qcRows = qc.lines.map((line) => [
      escapeHtml(line.sampleId),
      escapeHtml(nameFor(line.sampleId)),
      escapeHtml(line.role),
      num(line.missingRate),
      num(line.hetRate),
      num(line.nonparentalRate),
      escapeHtml(line.flags.join(', ')),
    ]);
    const qcTableHtml = table(
      'Per-line quality control',
      [
        'sample_id',
        'line_name',
        'role',
        'missing rate (all markers)',
        'het rate (called)',
        'nonparental rate (informative called)',
        'flags',
      ],
      qcRows,
    );
    qcHtml = `<h2>Quality control</h2>${flagsHtml}${qcTableHtml}`;
  }

  // --- Lines ---
  const segmentsFor = (i: number): DonorSegment[] => segmentsByCandidate[i] ?? [];
  const lineRows = lineRpp.map((line, i) => {
    const segs = segmentsFor(i);
    const largestBp = segs.length === 0 ? NaN : Math.max(...segs.map((s) => s.endBp - s.startBp));
    return [
      escapeHtml(line.sampleId),
      escapeHtml(nameFor(line.sampleId)),
      String(line.overall.nInformative),
      String(line.overall.nCalled),
      num(line.overall.rppCount),
      num(line.overall.rppBp),
      num(line.overall.rppCm),
      String(segs.length),
      mb(largestBp),
    ];
  });
  const linesHtml = `<h2>Lines</h2>${table(
    'Per-line RPP and segment summary',
    [
      'sample_id',
      'line_name',
      'n_informative',
      'n_called',
      'rpp_count',
      'rpp_bp',
      'rpp_cm',
      'segment_count',
      'largest_segment_mb',
    ],
    lineRows,
  )}`;

  // --- Donor segments (omit when there are none) ---
  const allSegments = segmentsByCandidate.flat();
  let segmentsHtml = '';
  if (allSegments.length > 0) {
    const header = [
      'sample_id',
      'chrom',
      'start_bp',
      'end_bp',
      'left_flank_bp',
      'right_flank_bp',
      'n_markers',
      'class',
    ];
    if (hasMap) header.push('start_cm', 'end_cm');
    const rows = allSegments.map((s) => {
      const row = [
        escapeHtml(s.sampleId),
        escapeHtml(s.chrom),
        int(s.startBp),
        int(s.endBp),
        int(s.leftFlankBp),
        int(s.rightFlankBp),
        String(s.nMarkers),
        escapeHtml(s.class),
      ];
      if (hasMap) row.push(num(s.startCm), num(s.endCm));
      return row;
    });
    segmentsHtml = `<h2>Donor segments</h2>${table('Donor segments across all candidates', header, rows)}`;
  }

  // --- Target regions (omit when empty) ---
  let targetsHtml = '';
  if (targets.length > 0) {
    const rows = targets.map((t) => [
      escapeHtml(t.sampleId),
      escapeHtml(t.target),
      escapeHtml(t.region.chrom),
      int(t.region.startBp),
      int(t.region.endBp),
      escapeHtml(t.status),
      String(t.nInformativeInRegion),
      int(t.dragMinBp),
      int(t.dragMaxBp),
    ]);
    targetsHtml = `<h2>Target regions</h2>${table(
      'Target region checks',
      [
        'sample_id',
        'target',
        'chrom',
        'start_bp',
        'end_bp',
        'status',
        'n_informative_in_region',
        'drag_min_bp',
        'drag_max_bp',
      ],
      rows,
    )}`;
  }

  // --- Graphical genotypes ---
  const legendHtml = `<ul class="legend">${CLASS_ORDER.map((cls) => {
    const label = CALL_CLASS_LABEL[cls];
    return `<li><span class="swatch" style="background:${classSwatchCss(cls)}"></span>${escapeHtml(label)}</li>`;
  }).join('')}</ul>`;

  // Lines whose table rows have no rendered figure below, either because no
  // image was supplied or because the supplied URI was rejected. Tracked so
  // the section can state which lines the reader should not expect a figure
  // for, rather than letting them drop out of the figures list unremarked.
  const missingFigureIds: string[] = [];
  const figures = lineRpp
    .map((line) => {
      const uri = images.get(line.sampleId);
      const name = nameFor(line.sampleId);
      if (uri === undefined) {
        missingFigureIds.push(line.sampleId);
        return '';
      }
      const heading = `<h3>${escapeHtml(line.sampleId)} — ${escapeHtml(name)}</h3>`;
      if (!uri.startsWith('data:image/')) {
        missingFigureIds.push(line.sampleId);
        return `<div class="geno-figure">${heading}<p class="image-note">Image omitted: the supplied URI is not a data:image/ URI.</p></div>`;
      }
      return `<div class="geno-figure">${heading}<img src="${escapeHtml(uri)}" alt="Graphical genotype of ${escapeHtml(name)}"></div>`;
    })
    .filter((s) => s !== '')
    .join('');

  const nFigures = lineRpp.length - missingFigureIds.length;
  let coverageHtml = '';
  if (nFigures > 0 && missingFigureIds.length > 0) {
    const idList =
      missingFigureIds.length > 20
        ? `${missingFigureIds.slice(0, 20).join(', ')}, and ${missingFigureIds.length - 20} more`
        : missingFigureIds.join(', ');
    coverageHtml = `<p>${nFigures} of ${lineRpp.length} lines in the tables have a graphical genotype figure below. Without one: ${escapeHtml(idList)}.</p>`;
  }

  const figuresBody =
    figures === '' ? '<p>No graphical genotype images were supplied for this report.</p>' : figures;
  const genotypesHtml = `<h2>Graphical genotypes</h2>${legendHtml}${coverageHtml}${figuresBody}`;

  // --- Closing ---
  const footerHtml = `<footer>Generated by Isoline Browser. This file is self-contained: every
figure is embedded as a data URI and the file depends on no external resource.</footer>`;

  const body = [
    headerHtml,
    datasetSummaryHtml,
    warningsHtml,
    parametersHtml,
    qcHtml,
    linesHtml,
    segmentsHtml,
    targetsHtml,
    genotypesHtml,
    footerHtml,
  ]
    .filter((section) => section !== '')
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
${body}
</body>
</html>
`;
}
