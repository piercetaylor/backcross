/**
 * Parent-of-origin classification.
 *
 * Responsibility: for every candidate and every marker, decide whether the
 * call is RP-homozygous, donor-homozygous, heterozygous, missing,
 * nonparental, or uninformative. This is the single place where parental
 * alleles are compared with candidate alleles; every downstream metric (RPP,
 * segments, target check, pairwise comparison, QC) consumes the resulting
 * class array and never looks at raw alleles again.
 *
 * Rules (docs/PLAN.md, "Core algorithms and metrics", algorithm 1):
 *   - A marker is informative when both parents are called, both are
 *     homozygous, and their alleles differ. Otherwise every candidate is
 *     UNINFORMATIVE there.
 *   - Coded matrices (A/B/H) define allele 0 = RP, allele 1 = donor at every
 *     marker without needing parent columns.
 *   - At an informative marker a candidate is MISSING (no call), RP_HOM,
 *     DONOR_HOM, HET (one allele of each parent), or NONPARENTAL (any allele
 *     that belongs to neither parent).
 *
 * Interface: classifyDataset(dataset, candidateCols?) -> Classification.
 * Pure function; O(nMarkers * nCandidates).
 */
import { CallClass, MISSING_ALLELE } from './types.ts';
import type { Classification, Dataset } from './types.ts';

export function classifyDataset(dataset: Dataset, candidateCols?: Int32Array): Classification {
  const { genotypes, coded, recurrentParentCol, donorParentCol } = dataset;
  const { nMarkers, nSamples, allele1, allele2 } = genotypes;

  const cols =
    candidateCols ??
    Int32Array.from(
      dataset.samples
        .filter((s) => s.role === 'candidate' || s.role === 'progeny')
        .map((s) => genotypes.sampleIds.indexOf(s.sampleId))
        .filter((i) => i >= 0),
    );

  const informative = new Uint8Array(nMarkers);
  const rpAllele = new Uint8Array(nMarkers).fill(MISSING_ALLELE);
  const donorAllele = new Uint8Array(nMarkers).fill(MISSING_ALLELE);

  for (let m = 0; m < nMarkers; m++) {
    if (coded) {
      // Coded files carry origin in the symbol itself; a marker is informative
      // unless the parent columns (when present) contradict the convention.
      let ok = true;
      if (recurrentParentCol >= 0) {
        const i = m * nSamples + recurrentParentCol;
        const a = allele1[i] as number;
        const b = allele2[i] as number;
        if (a !== MISSING_ALLELE && !(a === 0 && b === 0)) ok = false;
      }
      if (donorParentCol >= 0) {
        const i = m * nSamples + donorParentCol;
        const a = allele1[i] as number;
        const b = allele2[i] as number;
        if (a !== MISSING_ALLELE && !(a === 1 && b === 1)) ok = false;
      }
      if (ok) {
        informative[m] = 1;
        rpAllele[m] = 0;
        donorAllele[m] = 1;
      }
      continue;
    }
    const ri = m * nSamples + recurrentParentCol;
    const di = m * nSamples + donorParentCol;
    const r1 = allele1[ri] as number;
    const r2 = allele2[ri] as number;
    const d1 = allele1[di] as number;
    const d2 = allele2[di] as number;
    if (r1 === MISSING_ALLELE || d1 === MISSING_ALLELE) continue; // a parent is missing
    if (r1 !== r2 || d1 !== d2) continue; // a parent is heterozygous
    if (r1 === d1) continue; // monomorphic between parents
    informative[m] = 1;
    rpAllele[m] = r1;
    donorAllele[m] = d1;
  }

  const classes = new Uint8Array(cols.length * nMarkers);
  for (let c = 0; c < cols.length; c++) {
    const col = cols[c] as number;
    const base = c * nMarkers;
    for (let m = 0; m < nMarkers; m++) {
      if (informative[m] === 0) {
        classes[base + m] = CallClass.UNINFORMATIVE;
        continue;
      }
      const i = m * nSamples + col;
      const a = allele1[i] as number;
      if (a === MISSING_ALLELE) {
        classes[base + m] = CallClass.MISSING;
        continue;
      }
      const b = allele2[i] as number;
      const rp = rpAllele[m] as number;
      const dn = donorAllele[m] as number;
      if (a === rp && b === rp) classes[base + m] = CallClass.RP_HOM;
      else if (a === dn && b === dn) classes[base + m] = CallClass.DONOR_HOM;
      else if ((a === rp && b === dn) || (a === dn && b === rp)) classes[base + m] = CallClass.HET;
      else classes[base + m] = CallClass.NONPARENTAL;
    }
  }

  return { candidateCols: cols, classes, informative, rpAllele, donorAllele, nMarkers };
}

/** Number of informative markers in a classification. */
export function countInformative(cls: Classification): number {
  let n = 0;
  for (let m = 0; m < cls.nMarkers; m++) n += cls.informative[m] as number;
  return n;
}
