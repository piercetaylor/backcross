/**
 * Target-locus check and linkage-drag estimate (algorithm 4).
 *
 * Responsibility: for each user-specified region and each candidate, report
 * whether the candidate carries donor alleles across the region and how much
 * donor DNA flanks it.
 *
 * checkTargets rules:
 *   - Region = {name, chrom, startBp, endBp}; a single marker or position is
 *     expressed as startBp = endBp.
 *   - A region's informative markers are those with dataset.markers.chrom[m]
 *     equal to region.chrom and startBp <= posBp[m] <= endBp (both ends
 *     inclusive) and cls.informative[m] === 1. nInformativeInRegion counts
 *     them; it is a property of the region and the dataset, independent of
 *     any one candidate's calls, so it is computed once per region rather
 *     than once per (candidate, region) pair.
 *   - Among those markers, a candidate's status is 'no_data' when none of its
 *     calls there are RP_HOM, DONOR_HOM or HET (MISSING and NONPARENTAL are
 *     ignored); 'donor' when all such calls are DONOR_HOM; 'het' when all are
 *     HET; 'rp' when all are RP_HOM; and 'recombinant' for any other mixture,
 *     including donor+het with no RP call, because a line carrying both
 *     classes is not fixed across the region.
 *   - The reported segment is, among segmentsByCandidate[c] on region.chrom
 *     overlapping [startBp, endBp] (inclusive), the one with the largest
 *     overlap length; ties keep the first. This is evaluated for every
 *     status, including 'no_data', since a segment can overlap a region whose
 *     own markers are all missing. null when no segment overlaps.
 *   - Linkage drag is summed over the two sides of the region. Per side,
 *     dragMinBp is the distance from the region edge to the outermost non-RP
 *     marker of the segment and dragMaxBp the distance to the flanking RP
 *     marker, each clipped at 0 so a side where the region reaches past the
 *     segment (or past the flank) contributes nothing. When the region lies
 *     inside the segment this equals PLAN.md's forms, segment length minus
 *     region length and flank span minus region length. dragMaxBp is NaN
 *     whenever a flank is NaN (the segment reaches a chromosome end).
 *   - Both drags are NaN when segment is null.
 *
 * parseTargetSpec grammar: trim the input, then try in order:
 *   1. An optional "name=" prefix: everything before the first "=" is the
 *      name (trimmed); the rest is the locus text. Without "=" (or with an
 *      empty name before it), the whole trimmed input serves as both name
 *      and locus text.
 *   2. Locus "CHROM:START-END" or "CHROM:POS". CHROM accepts any spelling
 *      normalizeChromosome understands and does not have to exist in the
 *      dataset (a region on a chromosome with no markers simply yields
 *      no_data). START/END/POS are numbers with optional thousands
 *      separators (comma, underscore, or space, stripped before parsing), an
 *      optional decimal point, and an optional unit (bp, kb, Mb, or k/m,
 *      case-insensitive; a missing unit means bp). In a range, a unit on the
 *      end token also applies to a unit-less start token ("28.5-29.1Mb"). A
 *      decimal number that still has no unit is rejected ("use a unit")
 *      rather than guessed, since a wrong guess would silently misplace the
 *      target. The range separator
 *      is "-", the en dash "–", or "..". A reversed range is swapped rather
 *      than rejected. Results are rounded to the nearest bp.
 *   3. Otherwise the locus text is looked up in dataset.markers.ids; a match
 *      yields {chrom: markers.chrom[m], startBp: posBp[m], endBp: posBp[m]}.
 *   4. Anything else throws an Error quoting the original input.
 *
 * Interface: checkTargets(dataset, classification, segmentsByCandidate, regions)
 * -> TargetCheck[], candidate-major (candidate outer loop, regions in input
 * order), parseTargetSpec(text, dataset) -> TargetRegion, and parseLocus(text)
 * -> {chrom, startBp, endBp} | null, the name-free locus grammar of step 2
 * above, exposed for the genotype-view zoom field (src/ui/screens/GenotypeViewScreen.tsx).
 */
import { CallClass } from './types.ts';
import type {
  Classification,
  Dataset,
  DonorSegment,
  TargetCheck,
  TargetRegion,
  TargetStatus,
} from './types.ts';
import { normalizeChromosome } from './chromosomes.ts';

export function checkTargets(
  dataset: Dataset,
  cls: Classification,
  segmentsByCandidate: DonorSegment[][],
  regions: TargetRegion[],
): TargetCheck[] {
  const { markers } = dataset;
  const nMarkers = cls.nMarkers;

  // Informative marker indices inside each region, computed once (not once
  // per candidate): the dataset has no guaranteed marker order, so this is a
  // linear scan over all markers per region.
  const regionMarkers: number[][] = regions.map((region) => {
    const list: number[] = [];
    for (let m = 0; m < nMarkers; m++) {
      if (markers.chrom[m] !== region.chrom) continue;
      if (cls.informative[m] === 0) continue;
      const pos = markers.posBp[m] as number;
      if (pos < region.startBp || pos > region.endBp) continue;
      list.push(m);
    }
    return list;
  });

  const out: TargetCheck[] = [];
  for (let c = 0; c < cls.candidateCols.length; c++) {
    const base = c * nMarkers;
    const sampleId = dataset.genotypes.sampleIds[cls.candidateCols[c] as number] as string;
    const segs = segmentsByCandidate[c] ?? [];

    for (let r = 0; r < regions.length; r++) {
      const region = regions[r] as TargetRegion;
      const ms = regionMarkers[r] as number[];

      let nRp = 0;
      let nDonor = 0;
      let nHet = 0;
      for (const m of ms) {
        const k = cls.classes[base + m] as number;
        if (k === CallClass.RP_HOM) nRp++;
        else if (k === CallClass.DONOR_HOM) nDonor++;
        else if (k === CallClass.HET) nHet++;
      }

      let status: TargetStatus;
      if (nRp + nDonor + nHet === 0) status = 'no_data';
      else if (nDonor > 0 && nRp === 0 && nHet === 0) status = 'donor';
      else if (nHet > 0 && nRp === 0 && nDonor === 0) status = 'het';
      else if (nRp > 0 && nDonor === 0 && nHet === 0) status = 'rp';
      else status = 'recombinant';

      let segment: DonorSegment | null = null;
      let bestOverlap = -Infinity;
      for (const seg of segs) {
        if (seg.chrom !== region.chrom) continue;
        if (!(seg.startBp <= region.endBp && seg.endBp >= region.startBp)) continue;
        const overlap = Math.min(seg.endBp, region.endBp) - Math.max(seg.startBp, region.startBp);
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          segment = seg;
        }
      }

      let dragMinBp = NaN;
      let dragMaxBp = NaN;
      if (segment !== null) {
        // Math.max(0, NaN) is NaN, so a missing flank propagates.
        dragMinBp =
          Math.max(0, region.startBp - segment.startBp) + Math.max(0, segment.endBp - region.endBp);
        dragMaxBp =
          Math.max(0, region.startBp - segment.leftFlankBp) +
          Math.max(0, segment.rightFlankBp - region.endBp);
      }

      out.push({
        sampleId,
        target: region.name,
        region,
        status,
        nInformativeInRegion: ms.length,
        segment,
        dragMinBp,
        dragMaxBp,
      });
    }
  }
  return out;
}

/** Internal signal: a decimal number was given with no unit, which we refuse to guess. */
class AmbiguousUnitError extends Error {}

const NUMBER_TOKEN = /^([0-9][0-9,_\s]*(?:\.[0-9]+)?)\s*(bp|kb|mb|k|m)?$/i;

interface PositionToken {
  digits: string;
  unit: string | undefined;
}

/** Splits one bp/kb/Mb token into digits and unit; null when it does not look like a number at all. */
function tokenize(raw: string): PositionToken | null {
  const m = NUMBER_TOKEN.exec(raw);
  if (m === null) return null;
  return { digits: (m[1] as string).replace(/[,_\s]/g, ''), unit: m[2]?.toLowerCase() };
}

function toBp({ digits, unit }: PositionToken): number {
  if (digits.includes('.') && unit === undefined) {
    throw new AmbiguousUnitError('a decimal value needs an explicit unit (bp, kb, or Mb)');
  }
  const value = Number(digits);
  if (unit === undefined || unit === 'bp') return value;
  if (unit === 'kb' || unit === 'k') return value * 1_000;
  return value * 1_000_000; // 'mb' or 'm'
}

const RANGE_SEPARATOR = /\s*(?:\.\.|–|-)\s*/;

/**
 * Parses "CHROM:START-END" or "CHROM:POS" into a chromosome and a bp range
 * (see the grammar in this file's header, step 2); null when locusText is not
 * shaped like a locus at all (no colon, or unparseable numbers). Throws when
 * a decimal token has no explicit unit, since guessing one could silently
 * misplace a target or a zoom window.
 */
export function parseLocus(locusText: string): Omit<TargetRegion, 'name'> | null {
  const colonIdx = locusText.indexOf(':');
  if (colonIdx < 0) return null;
  const chromRaw = locusText.slice(0, colonIdx).trim();
  const rest = locusText.slice(colonIdx + 1).trim();
  if (chromRaw === '' || rest === '') return null;
  const chrom = normalizeChromosome(chromRaw);

  const parts = rest.split(RANGE_SEPARATOR).filter((p) => p.length > 0);
  if (parts.length === 1) {
    const t = tokenize((parts[0] as string).trim());
    if (t === null) return null;
    const p = Math.round(toBp(t));
    return { chrom, startBp: p, endBp: p };
  }
  if (parts.length === 2) {
    const first = tokenize((parts[0] as string).trim());
    const last = tokenize((parts[1] as string).trim());
    if (first === null || last === null) return null;
    // "28.5-29.1Mb": the end token's unit carries over to a unit-less start.
    const a = toBp(first.unit === undefined ? { ...first, unit: last.unit } : first);
    const b = toBp(last);
    return { chrom, startBp: Math.round(Math.min(a, b)), endBp: Math.round(Math.max(a, b)) };
  }
  return null;
}

export function parseTargetSpec(text: string, dataset: Dataset): TargetRegion {
  const trimmed = text.trim();
  const eq = trimmed.indexOf('=');
  let name = trimmed;
  let locusText = trimmed;
  if (eq >= 0) {
    const namePart = trimmed.slice(0, eq).trim();
    if (namePart !== '') {
      name = namePart;
      locusText = trimmed.slice(eq + 1).trim();
    }
  }

  try {
    const locus = parseLocus(locusText);
    if (locus !== null) return { name, ...locus };
  } catch (err) {
    if (err instanceof AmbiguousUnitError) {
      throw new Error(`target "${text}": ${err.message}`, { cause: err });
    }
    throw err;
  }

  const idx = dataset.markers.ids.indexOf(locusText);
  if (idx >= 0) {
    const pos = dataset.markers.posBp[idx] as number;
    return { name, chrom: dataset.markers.chrom[idx] as string, startBp: pos, endBp: pos };
  }

  throw new Error(
    `target "${text}": expected CHROM:START-END, CHROM:POS, or a marker_id present in the dataset`,
  );
}
