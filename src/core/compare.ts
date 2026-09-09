/**
 * Pairwise line comparison (algorithm 5).
 *
 * Responsibility: count and locate discordant markers between two samples
 * (isoline vs isoline, or isoline vs a parent).
 *
 * Resolving a sample. A sample id is one of: a candidate/progeny (its
 * genotype column appears in `cls.candidateCols`, giving a row into
 * `cls.classes`), the recurrent parent (`dataset.samples` role
 * `recurrent_parent`), or the donor parent (role `donor_parent`). Any other
 * id throws an Error quoting the id. A coded A/B/H matrix can have parents
 * with no genotype column at all (`genotypes.sampleIds.indexOf(id) === -1`);
 * that is legal and works in mode 'informative', since a parent's class is
 * known without reading a column.
 *
 * Class of a sample at marker m. For a candidate: `cls.classes[row *
 * nMarkers + m]`. For the recurrent parent: RP_HOM at every informative
 * marker; for the donor parent: DONOR_HOM at every informative marker. Both
 * hold by construction (classify.ts): `informative[m] === 1` requires both
 * parents called, homozygous and different, so the RP is RP_HOM there and
 * the donor is DONOR_HOM there. At a non-informative marker every sample is
 * UNINFORMATIVE.
 *
 * Modes:
 *   - 'informative' (default): walk informative markers only. A marker is
 *     *compared* when both samples' classes are a parental call (RP_HOM,
 *     DONOR_HOM or HET); MISSING and NONPARENTAL are skipped, counted in
 *     neither nCompared nor nDiscordant. A compared marker is *discordant*
 *     when the two classes differ. ibs is NaN in this mode (it is defined on
 *     raw alleles, not classes).
 *   - 'all': walk every marker, informative or not. A marker is compared
 *     when both samples have `allele1 !== MISSING_ALLELE`. Discordant when
 *     the two unordered allele pairs differ; the pairs are already stored
 *     sorted (`allele1 <= allele2`, docs/adr/0005), so the two pairs are
 *     compared componentwise without re-sorting. This mode needs raw
 *     alleles, so a sample with no genotype column (a coded matrix's absent
 *     parent) makes it throw a clear Error naming that sample. ibs is the
 *     mean over compared markers of shared alleles / 2, where shared alleles
 *     between two sorted pairs (a1,a2) and (b1,b2) is the size of their
 *     multiset intersection (0, 1 or 2), found by walking both pairs once
 *     (no `indexOf`); NaN when nothing was compared.
 *
 * Output. `byChromosome` has one entry per chromosome in
 * `dataset.chromosomeOrder`, in that order, including chromosomes where
 * nCompared is 0. `nCompared`/`nDiscordant` at the top level are the sums
 * over chromosomes. `discordantMarkers` is built by walking
 * `dataset.sortedMarkerOrder`, so it is genome-ordered (chromosome order,
 * then position) by construction. Comparing a sample with itself gives
 * nDiscordant 0 and, in mode 'all', ibs 1.
 *
 * `resolveSample` and `classAt` are exported so src/export/pairwise-csv.ts
 * can report the per-sample class at a discordant marker using exactly the
 * same resolution and class logic as the comparison itself.
 *
 * Interface: compareLines(dataset, classification, sampleA, sampleB, mode) -> PairwiseDiff.
 * Pure function; O(nMarkers).
 */
import { CallClass, MISSING_ALLELE } from './types.ts';
import type { CallClassValue, Classification, Dataset, PairwiseDiff } from './types.ts';

/** How a sample id was resolved: a candidate row, or a parent by role. */
export interface ResolvedSample {
  kind: 'candidate' | 'recurrent_parent' | 'donor_parent';
  /** Row into `cls.classes`; -1 when kind is not 'candidate'. */
  row: number;
  /** Column into `genotypes.allele1`/`allele2`; -1 when the sample has no genotype column. */
  col: number;
}

/** Resolves a sample id to a candidate row or a parent role. Throws, quoting the id, otherwise. */
export function resolveSample(
  dataset: Dataset,
  cls: Classification,
  sampleId: string,
): ResolvedSample {
  const col = dataset.genotypes.sampleIds.indexOf(sampleId);
  if (col >= 0) {
    const row = Array.from(cls.candidateCols).indexOf(col);
    if (row >= 0) return { kind: 'candidate', row, col };
  }
  const record = dataset.samples.find((s) => s.sampleId === sampleId);
  if (record?.role === 'recurrent_parent') return { kind: 'recurrent_parent', row: -1, col };
  if (record?.role === 'donor_parent') return { kind: 'donor_parent', row: -1, col };
  throw new Error(`compareLines: unknown sample id "${sampleId}"`);
}

/** The call class of a resolved sample at marker m, per the rules above. */
export function classAt(
  dataset: Dataset,
  cls: Classification,
  sample: ResolvedSample,
  m: number,
): CallClassValue {
  if (cls.informative[m] === 0) return CallClass.UNINFORMATIVE;
  if (sample.kind === 'candidate') {
    return cls.classes[sample.row * cls.nMarkers + m] as CallClassValue;
  }
  // A parent with a genotype column is read from it, never synthesised. For a
  // nucleotide or VCF matrix the two agree by construction, because a marker is
  // informative only when both parents are called and homozygous. A coded
  // A/B/H matrix is different: the symbols carry parent of origin, so a marker
  // stays informative even where the parent column itself has no call, and
  // synthesising would report a call the file does not contain.
  const { genotypes } = dataset;
  if (sample.col >= 0) {
    const i = m * genotypes.nSamples + sample.col;
    const a1 = genotypes.allele1[i] as number;
    if (a1 === MISSING_ALLELE) return CallClass.MISSING;
    const a2 = genotypes.allele2[i] as number;
    const rp = cls.rpAllele[m] as number;
    const dn = cls.donorAllele[m] as number;
    if (a1 === rp && a2 === rp) return CallClass.RP_HOM;
    if (a1 === dn && a2 === dn) return CallClass.DONOR_HOM;
    if ((a1 === rp && a2 === dn) || (a1 === dn && a2 === rp)) return CallClass.HET;
    return CallClass.NONPARENTAL;
  }
  // No column at all: a coded matrix whose parents are named only in the
  // manifest. There the coding defines allele 0 as recurrent and 1 as donor.
  return sample.kind === 'recurrent_parent' ? CallClass.RP_HOM : CallClass.DONOR_HOM;
}

function isParentalCall(k: CallClassValue): boolean {
  return k === CallClass.RP_HOM || k === CallClass.DONOR_HOM || k === CallClass.HET;
}

/** Size (0, 1 or 2) of the multiset intersection of two sorted allele pairs, without indexOf. */
function sharedAlleleCount(a1: number, a2: number, b1: number, b2: number): number {
  let shared = 0;
  let i = 0;
  let j = 0;
  while (i < 2 && j < 2) {
    const av = i === 0 ? a1 : a2;
    const bv = j === 0 ? b1 : b2;
    if (av === bv) {
      shared++;
      i++;
      j++;
    } else if (av < bv) {
      i++;
    } else {
      j++;
    }
  }
  return shared;
}

export function compareLines(
  dataset: Dataset,
  cls: Classification,
  sampleA: string,
  sampleB: string,
  mode: 'informative' | 'all' = 'informative',
): PairwiseDiff {
  const a = resolveSample(dataset, cls, sampleA);
  const b = resolveSample(dataset, cls, sampleB);

  if (mode === 'all') {
    if (a.col < 0) {
      throw new Error(
        `compareLines: mode "all" needs a genotype column for sample "${sampleA}" (a coded matrix's absent parent)`,
      );
    }
    if (b.col < 0) {
      throw new Error(
        `compareLines: mode "all" needs a genotype column for sample "${sampleB}" (a coded matrix's absent parent)`,
      );
    }
  }

  const { chromosomeOrder, chromIndex, sortedMarkerOrder } = dataset;
  const { allele1, allele2, nSamples } = dataset.genotypes;

  const byChromosome = chromosomeOrder.map((chrom) => ({ chrom, nCompared: 0, nDiscordant: 0 }));
  const discordant: number[] = [];
  let nCompared = 0;
  let nDiscordant = 0;
  let nSkippedMissing = 0;
  let nSkippedNonparental = 0;
  let ibsSum = 0;
  let ibsCount = 0;

  for (let k = 0; k < sortedMarkerOrder.length; k++) {
    const m = sortedMarkerOrder[k] as number;
    const row = byChromosome[chromIndex[m] as number] as {
      chrom: string;
      nCompared: number;
      nDiscordant: number;
    };

    if (mode === 'informative') {
      if (cls.informative[m] === 0) continue;
      const ka = classAt(dataset, cls, a, m);
      const kb = classAt(dataset, cls, b, m);
      if (!isParentalCall(ka) || !isParentalCall(kb)) {
        // Neither sample can be placed by parent of origin here, so the marker
        // is not compared. Counting why keeps a nonparental call visible: it is
        // the contamination signal the tool exists to surface, and without a
        // count it would show only as a quietly smaller denominator.
        if (ka === CallClass.NONPARENTAL || kb === CallClass.NONPARENTAL) nSkippedNonparental++;
        else nSkippedMissing++;
        continue;
      }
      nCompared++;
      row.nCompared++;
      if (ka !== kb) {
        nDiscordant++;
        row.nDiscordant++;
        discordant.push(m);
      }
      continue;
    }

    const ia = m * nSamples + a.col;
    const ib = m * nSamples + b.col;
    const a1 = allele1[ia] as number;
    const b1 = allele1[ib] as number;
    if (a1 === MISSING_ALLELE || b1 === MISSING_ALLELE) continue;
    const a2 = allele2[ia] as number;
    const b2 = allele2[ib] as number;

    nCompared++;
    row.nCompared++;
    if (a1 !== b1 || a2 !== b2) {
      nDiscordant++;
      row.nDiscordant++;
      discordant.push(m);
    }
    ibsSum += sharedAlleleCount(a1, a2, b1, b2) / 2;
    ibsCount++;
  }

  return {
    sampleA,
    sampleB,
    mode,
    nCompared,
    nDiscordant,
    nSkippedMissing,
    nSkippedNonparental,
    discordantMarkers: Int32Array.from(discordant),
    byChromosome,
    ibs: mode === 'all' ? (ibsCount > 0 ? ibsSum / ibsCount : NaN) : NaN,
  };
}
