/**
 * Quality-control flags (algorithm 6).
 *
 * Responsibility: derive per-line, per-marker and dataset-level QC from the
 * genotype matrix and the classification.
 *
 * Per line: missingRate = missing calls / all markers; hetRate = heterozygous
 * calls / called markers; nonparentalRate = NONPARENTAL / informative called.
 * Flags: 'high_missing', 'high_het', 'nonparental_alleles',
 * 'closer_to_donor' (rppCount < 0.5, possible sample swap or mislabeled parent),
 * 'identical_to_rp' (no donor, heterozygous or nonparental call at any
 * informative marker; there is no minimum-n guard), and
 * 'no_informative_calls' (nCalled = 0, so RPP is NaN).
 * Per marker: callRate over all samples; lowCallRate when below threshold.
 * Parents: 'parent_heterozygous' when a parent's hetRate exceeds parentHetMax.
 * Dataset: 'parents_identical' when parentPolymorphismRate is below 0.01, and
 * 'low_marker_call_rate' when more than a tenth of markers are below
 * markerCallRateMin.
 *
 * Rates come from the raw allele arrays rather than from the classes, because
 * the MISSING class exists only at informative markers and would understate
 * missingness; the nonparental rate is the one exception and is class-derived
 * by definition.
 *
 * Interface: computeQc(dataset, classification, lineRpp, thresholds) -> QcReport.
 */
import { CallClass, MISSING_ALLELE } from './types.ts';
import type {
  Classification,
  Dataset,
  LineQc,
  LineRpp,
  MarkerQc,
  QcReport,
  QcThresholds,
} from './types.ts';

export const DEFAULT_QC_THRESHOLDS: QcThresholds = {
  lineMissingMax: 0.1,
  lineHetMax: 0.05,
  markerCallRateMin: 0.8,
  parentHetMax: 0.02,
};

export function computeQc(
  dataset: Dataset,
  cls: Classification,
  lineRpp: LineRpp[],
  thresholds: QcThresholds = DEFAULT_QC_THRESHOLDS,
): QcReport {
  const { genotypes, samples } = dataset;
  const { nMarkers, nSamples, allele1, allele2, sampleIds } = genotypes;
  const rppBySampleId = new Map(lineRpp.map((r) => [r.sampleId, r]));
  // Candidate column -> row in cls.classes, so the per-sample loop below does
  // not rescan candidateCols for every sample.
  const candidateRowByCol = new Map(
    Array.from(cls.candidateCols).map((col, row) => [col, row] as const),
  );

  // --- Marker-level QC, over all genotype columns (parents included). ---
  const callRate = new Float32Array(nMarkers);
  const informative = new Uint8Array(nMarkers);
  const lowCallRate = new Uint8Array(nMarkers);
  for (let m = 0; m < nMarkers; m++) {
    let nCalled = 0;
    const base = m * nSamples;
    for (let s = 0; s < nSamples; s++) {
      if ((allele1[base + s] as number) !== MISSING_ALLELE) nCalled++;
    }
    const rate = nSamples > 0 ? nCalled / nSamples : NaN;
    callRate[m] = rate;
    informative[m] = cls.informative[m] as number;
    lowCallRate[m] = rate < thresholds.markerCallRateMin ? 1 : 0;
  }
  const markerQc: MarkerQc = { callRate, informative, lowCallRate };

  // --- Line-level QC, one row per sample in dataset.samples order. ---
  const lines: LineQc[] = samples.map((sample) => {
    const col = sampleIds.indexOf(sample.sampleId);
    if (col < 0) {
      return {
        sampleId: sample.sampleId,
        role: sample.role,
        missingRate: NaN,
        hetRate: NaN,
        nonparentalRate: NaN,
        flags: [],
      };
    }

    // Raw-allele rates over all markers; class-derived MISSING only exists at
    // informative markers, so it would understate missingness.
    let nMissing = 0;
    let nCalled = 0;
    let nHet = 0;
    for (let m = 0; m < nMarkers; m++) {
      const i = m * nSamples + col;
      const a = allele1[i] as number;
      if (a === MISSING_ALLELE) {
        nMissing++;
        continue;
      }
      nCalled++;
      const b = allele2[i] as number;
      if (a !== b) nHet++;
    }
    const missingRate = nMarkers > 0 ? nMissing / nMarkers : NaN;
    const hetRate = nCalled > 0 ? nHet / nCalled : NaN;

    const candidateRow = candidateRowByCol.get(col);
    const isCandidate = candidateRow !== undefined;
    let nonparentalRate = NaN;
    if (candidateRow !== undefined) {
      const base = candidateRow * cls.nMarkers;
      let nNonparental = 0;
      let nInformativeCalled = 0;
      for (let m = 0; m < cls.nMarkers; m++) {
        const k = cls.classes[base + m] as number;
        if (
          k === CallClass.NONPARENTAL ||
          k === CallClass.RP_HOM ||
          k === CallClass.DONOR_HOM ||
          k === CallClass.HET
        ) {
          nInformativeCalled++;
          if (k === CallClass.NONPARENTAL) nNonparental++;
        }
      }
      nonparentalRate = nInformativeCalled > 0 ? nNonparental / nInformativeCalled : NaN;
    }

    const flags: string[] = [];
    if (missingRate > thresholds.lineMissingMax) flags.push('high_missing');
    if (isCandidate && hetRate > thresholds.lineHetMax) flags.push('high_het');
    if (
      (sample.role === 'recurrent_parent' || sample.role === 'donor_parent') &&
      hetRate > thresholds.parentHetMax
    ) {
      flags.push('parent_heterozygous');
    }
    if (nonparentalRate > 0) flags.push('nonparental_alleles');
    if (isCandidate) {
      const rpp = rppBySampleId.get(sample.sampleId);
      if (rpp !== undefined) {
        // identical_to_rp and no_informative_calls are mutually exclusive by
        // construction: the first requires nCalled > 0, the second nCalled === 0.
        if (rpp.overall.rppCount < 0.5) flags.push('closer_to_donor');
        if (
          rpp.overall.nCalled > 0 &&
          rpp.overall.nDonorHom === 0 &&
          rpp.overall.nHet === 0 &&
          rpp.nNonparental === 0
        ) {
          flags.push('identical_to_rp');
        }
        if (rpp.overall.nCalled === 0) flags.push('no_informative_calls');
      }
    }

    return {
      sampleId: sample.sampleId,
      role: sample.role,
      missingRate,
      hetRate,
      nonparentalRate,
      flags,
    };
  });

  // --- Dataset-level QC. ---
  const nInformative = informative.reduce((n, v) => n + v, 0);
  let parentPolymorphismRate: number;
  if (dataset.coded) {
    parentPolymorphismRate = nMarkers > 0 ? nInformative / nMarkers : NaN;
  } else {
    const rpCol = dataset.recurrentParentCol;
    const dnCol = dataset.donorParentCol;
    let nScorable = 0;
    for (let m = 0; m < nMarkers; m++) {
      const ri = m * nSamples + rpCol;
      const di = m * nSamples + dnCol;
      const r1 = allele1[ri] as number;
      const r2 = allele2[ri] as number;
      const d1 = allele1[di] as number;
      const d2 = allele2[di] as number;
      if (r1 === MISSING_ALLELE || d1 === MISSING_ALLELE) continue;
      if (r1 !== r2 || d1 !== d2) continue;
      nScorable++;
    }
    parentPolymorphismRate = nScorable > 0 ? nInformative / nScorable : NaN;
  }

  const datasetFlags: string[] = [];
  if (!Number.isNaN(parentPolymorphismRate) && parentPolymorphismRate < 0.01) {
    datasetFlags.push('parents_identical');
  }
  let nLowCallRate = 0;
  for (let m = 0; m < nMarkers; m++) nLowCallRate += lowCallRate[m] as number;
  if (nMarkers > 0 && nLowCallRate / nMarkers > 0.1) datasetFlags.push('low_marker_call_rate');

  return { lines, markers: markerQc, nInformative, parentPolymorphismRate, datasetFlags };
}
