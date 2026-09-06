/**
 * Recurrent parent proportion (RPP).
 *
 * Responsibility: summarize a candidate's parent-of-origin classes into the
 * proportion of recurrent-parent genome, overall and per chromosome, using
 * three estimators (docs/PLAN.md, algorithm 2):
 *
 *   rppCount = (nRpHom + 0.5 * nHet) / (nRpHom + nDonorHom + nHet)
 *   rppBp    = sum_i w_i * s_i / sum_i w_i     with physical-distance weights
 *   rppCm    = same with genetic-distance weights (only when cM is present)
 *
 * where s_i = 1 for RP_HOM, 0.5 for HET, 0 for DONOR_HOM, and the sums run
 * over informative markers with a parental call (MISSING, NONPARENTAL and
 * UNINFORMATIVE markers are excluded from both numerator and denominator).
 *
 * Weights follow the Flapjack MABC convention: each marker represents, on
 * each side, min(half the distance to the adjacent called marker, half the
 * maximum coverage). At a chromosome end the outer side is the distance to
 * the chromosome end when a length is supplied, otherwise the cap.
 *
 * Interface: computeRpp(dataset, classification, params, chromLengthsBp?)
 * -> LineRpp[] (one per candidate, same order as classification.candidateCols).
 */
import { CallClass } from './types.ts';
import type { Classification, Dataset, LineRpp, RppByChromosome, RppParams } from './types.ts';

export const DEFAULT_RPP_PARAMS: RppParams = { maxGapBp: 2_000_000, maxGapCm: 10 };

const SCORE: Record<number, number> = {
  [CallClass.RP_HOM]: 1,
  [CallClass.HET]: 0.5,
  [CallClass.DONOR_HOM]: 0,
};

/**
 * Distance-weighted mean of `scores` at sorted `positions`.
 * `cap` is half the maximum coverage. Returns [weightedSum, totalWeight].
 */
export function weightedSums(
  positions: number[],
  scores: number[],
  cap: number,
  chromLength?: number,
): [number, number] {
  const n = positions.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const p = positions[i] as number;
    // Left side: half the gap to the previous marker; the first marker reaches back to
    // the chromosome start (coordinate 0). Right side: half the gap to the next marker;
    // the last marker reaches to the chromosome end when a length is known, else the cap.
    const left = i === 0 ? Math.min(p, cap) : Math.min((p - (positions[i - 1] as number)) / 2, cap);
    let right: number;
    if (i < n - 1) right = Math.min(((positions[i + 1] as number) - p) / 2, cap);
    else if (chromLength === undefined) right = cap;
    else right = Math.min(Math.max(chromLength - p, 0), cap);
    const w = left + right;
    num += w * (scores[i] as number);
    den += w;
  }
  return [num, den];
}

function emptyRow(chrom: string): RppByChromosome {
  return {
    chrom,
    nInformative: 0,
    nCalled: 0,
    nRpHom: 0,
    nDonorHom: 0,
    nHet: 0,
    rppCount: NaN,
    rppBp: NaN,
    rppCm: NaN,
  };
}

export function computeRpp(
  dataset: Dataset,
  cls: Classification,
  params: RppParams = DEFAULT_RPP_PARAMS,
  chromLengthsBp?: Map<string, number>,
): LineRpp[] {
  const { markers, chromosomeOrder, chromIndex, sortedMarkerOrder, genotypes } = dataset;
  const nMarkers = cls.nMarkers;
  const capBp = params.maxGapBp / 2;
  const capCm = params.maxGapCm / 2;
  const hasCm = markers.cm !== undefined;

  // Per chromosome, the sorted marker indices (computed once, reused per line).
  const perChrom: Int32Array[] = chromosomeOrder.map(() => new Int32Array(0));
  {
    const counts = new Int32Array(chromosomeOrder.length);
    for (let k = 0; k < nMarkers; k++) {
      const ci = chromIndex[sortedMarkerOrder[k] as number] as number;
      counts[ci] = (counts[ci] as number) + 1;
    }
    const fill = new Int32Array(chromosomeOrder.length);
    perChrom.forEach((_, ci) => (perChrom[ci] = new Int32Array(counts[ci] as number)));
    for (let k = 0; k < nMarkers; k++) {
      const m = sortedMarkerOrder[k] as number;
      const ci = chromIndex[m] as number;
      const slot = fill[ci] as number;
      (perChrom[ci] as Int32Array)[slot] = m;
      fill[ci] = slot + 1;
    }
  }

  const out: LineRpp[] = [];
  for (let c = 0; c < cls.candidateCols.length; c++) {
    const base = c * nMarkers;
    const sampleId = genotypes.sampleIds[cls.candidateCols[c] as number] as string;
    const overall = emptyRow('all');
    let numBp = 0;
    let denBp = 0;
    let numCm = 0;
    let denCm = 0;
    let nMissing = 0;
    let nNonparental = 0;
    const byChromosome: RppByChromosome[] = [];

    for (let ci = 0; ci < chromosomeOrder.length; ci++) {
      const chrom = chromosomeOrder[ci] as string;
      const row = emptyRow(chrom);
      const posBp: number[] = [];
      const posCm: number[] = [];
      const scores: number[] = [];
      for (const m of perChrom[ci] as Int32Array) {
        if (cls.informative[m] === 0) continue;
        row.nInformative++;
        const k = cls.classes[base + m] as number;
        if (k === CallClass.MISSING) {
          nMissing++;
          continue;
        }
        if (k === CallClass.NONPARENTAL) {
          nNonparental++;
          continue;
        }
        row.nCalled++;
        if (k === CallClass.RP_HOM) row.nRpHom++;
        else if (k === CallClass.DONOR_HOM) row.nDonorHom++;
        else row.nHet++;
        posBp.push(markers.posBp[m] as number);
        if (hasCm) posCm.push((markers.cm as Float64Array)[m] as number);
        scores.push(SCORE[k] as number);
      }
      if (row.nCalled > 0) {
        row.rppCount = (row.nRpHom + 0.5 * row.nHet) / row.nCalled;
        const [nb, db] = weightedSums(posBp, scores, capBp, chromLengthsBp?.get(chrom));
        row.rppBp = db > 0 ? nb / db : NaN;
        numBp += nb;
        denBp += db;
        if (hasCm) {
          const [nc, dc] = weightedSums(posCm, scores, capCm);
          row.rppCm = dc > 0 ? nc / dc : NaN;
          numCm += nc;
          denCm += dc;
        }
      }
      overall.nInformative += row.nInformative;
      overall.nCalled += row.nCalled;
      overall.nRpHom += row.nRpHom;
      overall.nDonorHom += row.nDonorHom;
      overall.nHet += row.nHet;
      byChromosome.push(row);
    }
    if (overall.nCalled > 0) {
      overall.rppCount = (overall.nRpHom + 0.5 * overall.nHet) / overall.nCalled;
      overall.rppBp = denBp > 0 ? numBp / denBp : NaN;
      overall.rppCm = hasCm && denCm > 0 ? numCm / denCm : NaN;
    }
    out.push({ sampleId, overall, byChromosome, nMissing, nNonparental });
  }
  return out;
}
