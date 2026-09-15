/**
 * Self-contained HTML report: structure, escaping, and the numeric
 * conventions shared with the CSV exporters, built from the synthetic
 * fixture end to end (parse, classify, RPP, segments, targets, QC).
 */
import { describe, expect, it } from 'vitest';

import { classifyDataset, countInformative } from '../src/core/classify.ts';
import { computeQc, DEFAULT_QC_THRESHOLDS } from '../src/core/qc.ts';
import { computeRpp } from '../src/core/rpp.ts';
import { callSegments, segmentGapCriterion } from '../src/core/segments.ts';
import { checkTargets, parseTargetSpec } from '../src/core/targets.ts';
import type { LineRpp } from '../src/core/types.ts';
import { buildHtmlReport } from '../src/export/report.ts';
import type { ReportDataset, ReportInput } from '../src/export/report.ts';
import { loadDataset, loadExpected } from './helpers.ts';

const expected = loadExpected();
const CANDIDATES = Object.keys(expected.lines);

const dataset = loadDataset('genotypes.vcf', 'vcf');
const cls = classifyDataset(dataset);
const lineRpp = computeRpp(dataset, cls, expected.params);
const qc = computeQc(dataset, cls, lineRpp, DEFAULT_QC_THRESHOLDS);
const segmentsByCandidate = CANDIDATES.map((_, c) =>
  callSegments(dataset, cls, c, expected.segmentParams),
);
const regions = [
  parseTargetSpec('gm13core=Gm13:21,000,000-25,000,000', dataset),
  parseTargetSpec('gm02het=chr2:7Mb-9Mb', dataset),
];
const targets = checkTargets(dataset, cls, segmentsByCandidate, regions);
const gapCriterion = segmentGapCriterion(dataset);

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const INVALID_URI = 'data:text/plain;base64,AAAA';
const MALICIOUS_URI = 'data:image/png;base64,AAA" onerror="alert(1)';
const images = new Map<string, string>([
  ['NIL_01', TINY_PNG],
  ['NIL_02', TINY_PNG],
  ['NIL_03', INVALID_URI],
]);

const reportDataset: ReportDataset = {
  nMarkers: dataset.markers.ids.length,
  nChromosomes: dataset.chromosomeOrder.length,
  hasCm: dataset.markers.cm !== undefined,
  samples: dataset.samples,
};

const baseInput: ReportInput = {
  dataset: reportDataset,
  lineRpp,
  qc,
  targets,
  segmentsByCandidate,
  images,
  generatedAt: new Date('2026-09-09T12:00:00.000Z'),
  params: { rpp: expected.params, segments: expected.segmentParams, qc: DEFAULT_QC_THRESHOLDS },
  gapCriterion,
  nInformative: countInformative(cls),
  warnings: ['3 marker positions overridden by markers.csv.'],
};

describe('buildHtmlReport', () => {
  it('produces a complete, self-contained HTML document', () => {
    const html = buildHtmlReport(baseInput);
    expect(/^<!doctype html/i.test(html)).toBe(true);
    expect(html).toContain('</html>');
  });

  it('has no script tags, stylesheet links, network references, event handlers, or javascript: URIs', () => {
    const html = buildHtmlReport(baseInput);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link /i);
    expect(html).not.toContain('http://');
    expect(html).not.toContain('https://');
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).not.toMatch(/javascript:/i);
  });

  it('escapes a double quote in an image data URI instead of letting it break out of the src attribute', () => {
    const images = new Map<string, string>([['NIL_01', MALICIOUS_URI]]);
    const html = buildHtmlReport({ ...baseInput, images });
    // The unescaped payload would close the src attribute and open a live
    // onerror handler; that must not survive as a real HTML attribute.
    expect(html).not.toContain('onerror="alert(1)"');
    expect(html).toContain('data:image/png;base64,AAA&quot; onerror=&quot;alert(1)');
  });

  it('includes every sample id from the fixture, not a truncated subset', () => {
    const html = buildHtmlReport(baseInput);
    for (const s of dataset.samples) {
      expect(html).toContain(s.sampleId);
    }
  });

  it('adds call_set_db_id and sample_db_id to the Lines and QC tables only when a sample carries them', () => {
    const plain = buildHtmlReport(baseInput);
    expect(plain).not.toContain('<th scope="col">call_set_db_id</th>');
    const withIds = dataset.samples.map((s, i) => ({
      ...s,
      callSetDbId: `cs${i}`,
      sampleDbId: `smp${i}`,
    }));
    const html = buildHtmlReport({ ...baseInput, dataset: { ...reportDataset, samples: withIds } });
    expect(html).toContain('<th scope="col">call_set_db_id</th>');
    expect(html).toContain('<th scope="col">sample_db_id</th>');
    expect(html).toContain('<td>cs2</td>');
  });

  it('states the source without a URL scheme', () => {
    const html = buildHtmlReport({
      ...baseInput,
      dataset: { ...reportDataset, source: 'BrAPI variant set variantset1 from host/brapi/v2' },
    });
    expect(html).toContain('<dt>Source</dt>');
    expect(html).not.toContain('http://');
    expect(html).not.toContain('https://');
  });

  it('escapes an untrusted line name instead of emitting it raw', () => {
    const payload = '<script>alert("x")</script>';
    const taintedDataset: ReportDataset = {
      ...reportDataset,
      samples: dataset.samples.map((s) =>
        s.sampleId === 'NIL_01' ? { ...s, lineName: payload } : s,
      ),
    };
    const html = buildHtmlReport({ ...baseInput, dataset: taintedDataset });
    expect(html).not.toContain(payload);
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  });

  it('states the RPP coverage cap and the segment gap value and criterion', () => {
    const html = buildHtmlReport(baseInput);
    expect(html).toContain(`<dt>RPP coverage cap (bp)</dt><dd>${expected.params.maxGapBp}</dd>`);
    expect(html).toContain(`<dt>RPP coverage cap (cM)</dt><dd>${expected.params.maxGapCm}</dd>`);
    expect(html).toContain(
      `<dt>Segment maximum gap (cM)</dt><dd>${expected.segmentParams.maxSegmentGapCm}</dd>`,
    );
    expect(html).toContain('genetic distance');
  });

  it('renders a NaN RPP as NA and never prints a raw NaN', () => {
    const nanLine: LineRpp = {
      sampleId: 'NIL_NAN',
      overall: {
        chrom: 'ALL',
        nInformative: 5,
        nCalled: 0,
        nRpHom: 0,
        nDonorHom: 0,
        nHet: 0,
        rppCount: NaN,
        rppBp: NaN,
        rppCm: NaN,
      },
      byChromosome: [],
      nMissing: 5,
      nNonparental: 0,
    };
    const input: ReportInput = {
      ...baseInput,
      lineRpp: [...lineRpp, nanLine],
      segmentsByCandidate: [...segmentsByCandidate, []],
    };
    const html = buildHtmlReport(input);
    expect(html).not.toMatch(/NaN/);
    expect(html).toContain('<td>NIL_NAN</td>');
    expect(html).toContain('<td>NA</td>');
  });

  it('is deterministic for the same input', () => {
    const a = buildHtmlReport(baseInput);
    const b = buildHtmlReport(baseInput);
    expect(a).toBe(b);
  });

  it('emits <img> only for data:image/ URIs, one per valid entry', () => {
    const html = buildHtmlReport(baseInput);
    const validCount = Array.from(images.values()).filter((u) =>
      u.startsWith('data:image/'),
    ).length;
    const imgCount = (html.match(/<img /g) ?? []).length;
    expect(imgCount).toBe(validCount);
    expect(html).not.toContain(INVALID_URI);
  });

  it('states figure coverage when some lines in the tables have no image', () => {
    const subsetImages = new Map<string, string>([
      ['NIL_01', TINY_PNG],
      ['NIL_02', TINY_PNG],
    ]);
    const html = buildHtmlReport({ ...baseInput, images: subsetImages });
    const nWithFigure = subsetImages.size;
    expect(html).toContain(`${nWithFigure} of ${lineRpp.length} lines in the tables`);
    const missingIds = lineRpp.map((l) => l.sampleId).filter((id) => !subsetImages.has(id));
    expect(missingIds.length).toBeGreaterThan(0);
    expect(html).toContain(missingIds[0]);
  });

  it('textures the donor swatch in the legend but not the recurrent-parent one (docs/adr/0007)', () => {
    const html = buildHtmlReport(baseInput);
    const donorSwatch =
      /<li><span class="swatch" style="background:[^"]*repeating-linear-gradient[^"]*"><\/span>donor_hom<\/li>/;
    const rpSwatch = /<li><span class="swatch" style="background:[^"]*"><\/span>rp_hom<\/li>/;
    expect(html).toMatch(donorSwatch);
    const rpMatch = rpSwatch.exec(html);
    expect(rpMatch).not.toBeNull();
    expect(rpMatch?.[0]).not.toContain('repeating-linear-gradient');
  });

  it('omits the optional sections when there is nothing to show', () => {
    const html = buildHtmlReport({
      ...baseInput,
      qc: null,
      targets: [],
      segmentsByCandidate: [],
      nInformative: countInformative(cls),
      warnings: [],
    });
    expect(html).not.toContain('<h2>Quality control</h2>');
    expect(html).not.toContain('<h2>Target regions</h2>');
    expect(html).not.toContain('<h2>Donor segments</h2>');
    expect(html).not.toContain('<h2>Warnings</h2>');
  });
});
