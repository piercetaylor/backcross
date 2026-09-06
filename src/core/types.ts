/**
 * Core data model shared by every module.
 *
 * Responsibility: define the in-memory representation of a loaded dataset
 * (markers, samples, genotype calls) and of every analysis result. Nothing in
 * this file touches the DOM, files, or workers. Parsers in `src/io` produce
 * these structures; algorithms in `src/core` consume them.
 *
 * Genotype storage (see docs/adr/0005): two unordered allele indices per cell,
 * `allele1[cell] <= allele2[cell]`, index into `markers.alleles[m]`, with
 * MISSING_ALLELE (255) for no call. Cell index = m * nSamples + s. This layout
 * is format-neutral (VCF GT, HapMap nucleotides, coded A/B/H) and costs two
 * bytes per call.
 */

export const MISSING_ALLELE = 255;

/** Sample roles from samples.csv (docs/data-formats.md). */
export type SampleRole = 'recurrent_parent' | 'donor_parent' | 'candidate' | 'progeny';

export interface SampleRecord {
  sampleId: string;
  lineName: string;
  role: SampleRole;
  generation: string;
  familyId: string;
  notes: string;
}

export interface MarkerTable {
  /** marker_id, unique within the dataset. */
  ids: string[];
  /** Normalized chromosome name (Gm01..Gm20, or the original name for scaffolds). */
  chrom: string[];
  /** Physical position, base pairs (1-based, as in VCF POS). */
  posBp: Float64Array;
  /** Genetic position in centimorgans; undefined when markers.csv did not supply cm. */
  cm?: Float64Array;
  /** Allele symbols per marker (e.g. ["A","T"]; coded matrices use ["A","B"]). */
  alleles: string[][];
}

export interface GenotypeMatrix {
  nMarkers: number;
  nSamples: number;
  /** sample_id per column, in file order. */
  sampleIds: string[];
  allele1: Uint8Array;
  allele2: Uint8Array;
}

/** Everything the analysis needs, after boundary validation. */
export interface Dataset {
  markers: MarkerTable;
  genotypes: GenotypeMatrix;
  samples: SampleRecord[];
  /** Column index of the recurrent parent in `genotypes`; -1 for coded matrices without a parent column. */
  recurrentParentCol: number;
  /** Column index of the donor parent; -1 for coded matrices without a parent column. */
  donorParentCol: number;
  /** True when genotypes came from a coded A/B/H file, so allele 0 is RP and allele 1 is donor by definition. */
  coded: boolean;
  /** Chromosome names in display order (Gm01..Gm20 first, then scaffolds). */
  chromosomeOrder: string[];
  /** Per-marker index into chromosomeOrder. */
  chromIndex: Int32Array;
  /** Markers sorted by (chromosome order, position); index into marker arrays. */
  sortedMarkerOrder: Int32Array;
}

/**
 * Parent-of-origin class per marker per candidate. Values are stable and
 * appear in exported files; do not renumber.
 */
export const CallClass = {
  /** Candidate has no call at an informative marker. */
  MISSING: 0,
  /** Homozygous for the recurrent-parent allele. */
  RP_HOM: 1,
  /** Homozygous for the donor allele. */
  DONOR_HOM: 2,
  /** One RP allele and one donor allele. */
  HET: 3,
  /** Parents identical, or either parent missing or heterozygous; marker carries no origin information. */
  UNINFORMATIVE: 4,
  /** Candidate carries an allele found in neither parent (error, contamination, or wrong parent). */
  NONPARENTAL: 5,
} as const;

export type CallClassValue = (typeof CallClass)[keyof typeof CallClass];

export const CALL_CLASS_LABEL: Record<CallClassValue, string> = {
  0: 'missing',
  1: 'rp_hom',
  2: 'donor_hom',
  3: 'het',
  4: 'uninformative',
  5: 'nonparental',
};

/** Result of classifying every candidate at every marker. */
export interface Classification {
  /** Candidate columns (indices into genotypes.sampleIds) in the order used by `classes`. */
  candidateCols: Int32Array;
  /** Row-major: classes[c * nMarkers + m]. */
  classes: Uint8Array;
  /** True where the marker is informative (parents homozygous, called, and different). */
  informative: Uint8Array;
  /** Per marker: allele index of the RP allele (MISSING_ALLELE when uninformative). */
  rpAllele: Uint8Array;
  /** Per marker: allele index of the donor allele (MISSING_ALLELE when uninformative). */
  donorAllele: Uint8Array;
  nMarkers: number;
}

export interface RppParams {
  /** Cap on the physical interval one marker can represent, per side, in bp (Flapjack "maximum marker coverage"). */
  maxGapBp: number;
  /** Cap on the genetic interval one marker can represent, per side, in cM. */
  maxGapCm: number;
}

export interface RppByChromosome {
  chrom: string;
  nInformative: number;
  nCalled: number;
  nRpHom: number;
  nDonorHom: number;
  nHet: number;
  /** (nRpHom + 0.5 nHet) / nCalled; NaN when nCalled = 0. */
  rppCount: number;
  /** Physical-distance-weighted RPP; NaN when nCalled = 0. */
  rppBp: number;
  /** cM-weighted RPP; NaN when no cM positions. */
  rppCm: number;
}

export interface LineRpp {
  sampleId: string;
  overall: RppByChromosome;
  byChromosome: RppByChromosome[];
  nMissing: number;
  nNonparental: number;
}

export interface SegmentParams {
  /** Minimum non-RP markers for a run to be reported as a segment. */
  minMarkers: number;
  /** Split a run when consecutive non-RP markers are farther apart than this (bp). */
  maxGapBp: number;
  /** Split a run when more than this many informative markers between two non-RP calls are missing or nonparental. */
  maxMissingSpan: number;
}

export type SegmentClass = 'donor' | 'het' | 'mixed';

export interface DonorSegment {
  sampleId: string;
  chrom: string;
  /** Position of the first and last non-RP marker in the run. */
  startBp: number;
  endBp: number;
  /** Position of the nearest RP-homozygous informative marker flanking the run; NaN at chromosome ends. */
  leftFlankBp: number;
  rightFlankBp: number;
  nMarkers: number;
  nDonorHom: number;
  nHet: number;
  class: SegmentClass;
  startCm: number;
  endCm: number;
}

export interface TargetRegion {
  name: string;
  chrom: string;
  startBp: number;
  endBp: number;
}

export type TargetStatus = 'donor' | 'het' | 'rp' | 'recombinant' | 'no_data';

export interface TargetCheck {
  sampleId: string;
  target: string;
  status: TargetStatus;
  nInformativeInRegion: number;
  /** Extent of the donor/het segment overlapping the region, if any. */
  segment: DonorSegment | null;
  /** Marker-bounded and flank-bounded estimates of donor DNA outside the target, in bp. */
  dragMinBp: number;
  dragMaxBp: number;
}

export interface PairwiseDiff {
  sampleA: string;
  sampleB: string;
  mode: 'informative' | 'all';
  nCompared: number;
  nDiscordant: number;
  discordantMarkers: Int32Array;
  byChromosome: { chrom: string; nCompared: number; nDiscordant: number }[];
}

export interface QcThresholds {
  lineMissingMax: number;
  lineHetMax: number;
  markerCallRateMin: number;
  parentHetMax: number;
}

export interface LineQc {
  sampleId: string;
  role: SampleRole;
  missingRate: number;
  hetRate: number;
  nonparentalRate: number;
  flags: string[];
}

export interface MarkerQc {
  callRate: Float32Array;
  informative: Uint8Array;
  lowCallRate: Uint8Array;
}

export interface QcReport {
  lines: LineQc[];
  markers: MarkerQc;
  nInformative: number;
  parentPolymorphismRate: number;
  datasetFlags: string[];
}
