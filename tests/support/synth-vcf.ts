/**
 * Deterministic synthetic VCF generator for scale tests.
 *
 * Responsibility: produce, from a SynthSpec, a VCF 4.2 text with one
 * recurrent parent, one donor parent and `nCandidates` candidate lines, plus
 * the samples.csv and markers.csv that go with it, and the counts a loaded
 * dataset must report. It shares its design with scripts/make-fixture.mjs --
 * mulberry32, the RP allele placed on REF or ALT at random, monomorphic and
 * RP-heterozygous markers as the uninformative classes, planted donor
 * segments, scattered missing calls -- but lives in TypeScript with no Node
 * import, so a browser-mode test can generate its input in the page and
 * nothing is written to the repository (docs/m3-phases.md, resolution 3).
 *
 * Two PRNG streams keep the counts independent of the calls: the marker
 * stream decides each marker's position, alleles and informativeness, in
 * marker order and nothing else, so `synthCounts` reproduces `nInformative`
 * by walking the same marker table without generating a single call. The
 * call stream plants the segments and the missing calls.
 *
 * Informativeness follows src/core/classify.ts: both parents called and
 * homozygous with different alleles. Parents are never missing here, so a
 * marker is uninformative exactly when it is monomorphic or its RP call is
 * heterozygous.
 *
 * Interface: SynthSpec, SynthCounts, synthCounts(spec), synthVcfLines(spec),
 * synthSamplesCsv(spec), synthMarkersCsv(spec), BENCH_SPEC.
 */

export interface SynthSpec {
  seed: number;
  nChrom: number;
  markersPerChrom: number;
  nCandidates: number;
  /** Donor segments planted per candidate; each 3..12 consecutive informative markers. */
  segmentsPerLine: number;
  missingRate: number;
}

export interface SynthCounts {
  nMarkers: number;
  nSamples: number;
  nInformative: number;
}

/** 50,000 markers by 202 samples: the M3 scale target (PLAN.md). */
export const BENCH_SPEC: SynthSpec = {
  seed: 20260912,
  nChrom: 20,
  markersPerChrom: 2500,
  nCandidates: 200,
  segmentsPerLine: 3,
  missingRate: 0.01,
};

const NUC = ['A', 'C', 'G', 'T'] as const;
const MONOMORPHIC_RATE = 0.05;
const RP_HET_RATE = 0.01;
const FIRST_POS_BP = 50_000;
const MIN_STEP_BP = 10_000;
const STEP_RANGE_BP = 20_000;
const CM_PER_MB = 2.4;
const MIN_SEGMENT_MARKERS = 3;
/** Segment lengths are MIN_SEGMENT_MARKERS + 0..9, i.e. 3..12. */
const SEGMENT_MARKER_RANGE = 10;

const KIND_INFORMATIVE = 0;
const KIND_MONOMORPHIC = 1;
const KIND_RP_HET = 2;

const RP_ID = 'RP_SYN';
const DONOR_ID = 'DONOR_SYN';

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface MarkerTable {
  n: number;
  chrom: Uint16Array;
  /** Index of the marker within its chromosome. */
  k: Uint32Array;
  pos: Float64Array;
  ref: Uint8Array;
  alt: Uint8Array;
  /** Allele index (0 = REF, 1 = ALT) the recurrent parent carries. */
  rpAllele: Uint8Array;
  kind: Uint8Array;
}

function chromName(c: number): string {
  return `Gm${String(c + 1).padStart(2, '0')}`;
}

function markerId(spec: SynthSpec, c: number, k: number): string {
  const width = Math.max(2, String(spec.markersPerChrom).length);
  return `syn_${chromName(c)}_${String(k + 1).padStart(width, '0')}`;
}

function candidateId(spec: SynthSpec, i: number): string {
  const width = Math.max(3, String(spec.nCandidates).length);
  return `SYN_${String(i + 1).padStart(width, '0')}`;
}

/** The marker stream: every per-marker decision, in marker order, and nothing else. */
function markerTable(spec: SynthSpec): MarkerTable {
  const n = spec.nChrom * spec.markersPerChrom;
  const t: MarkerTable = {
    n,
    chrom: new Uint16Array(n),
    k: new Uint32Array(n),
    pos: new Float64Array(n),
    ref: new Uint8Array(n),
    alt: new Uint8Array(n),
    rpAllele: new Uint8Array(n),
    kind: new Uint8Array(n),
  };
  const rand = mulberry32(spec.seed);
  let m = 0;
  for (let c = 0; c < spec.nChrom; c++) {
    let pos = FIRST_POS_BP;
    for (let k = 0; k < spec.markersPerChrom; k++, m++) {
      if (k > 0) pos += MIN_STEP_BP + Math.floor(rand() * STEP_RANGE_BP);
      const ref = Math.floor(rand() * 4);
      const alt = (ref + 1 + Math.floor(rand() * 3)) % 4;
      const rpAllele = rand() < 0.5 ? 0 : 1;
      const u = rand();
      t.chrom[m] = c;
      t.k[m] = k;
      t.pos[m] = pos;
      t.ref[m] = ref;
      t.alt[m] = alt;
      t.rpAllele[m] = rpAllele;
      t.kind[m] =
        u < MONOMORPHIC_RATE
          ? KIND_MONOMORPHIC
          : u < MONOMORPHIC_RATE + RP_HET_RATE
            ? KIND_RP_HET
            : KIND_INFORMATIVE;
    }
  }
  return t;
}

export function synthCounts(spec: SynthSpec): SynthCounts {
  const t = markerTable(spec);
  let nInformative = 0;
  for (let m = 0; m < t.n; m++) if (t.kind[m] === KIND_INFORMATIVE) nInformative++;
  return { nMarkers: t.n, nSamples: spec.nCandidates + 2, nInformative };
}

/**
 * Donor segments per candidate as inclusive marker-index ranges, flattened
 * as [start0, end0, start1, end1, ...]. Each spans 3..12 consecutive
 * informative markers of one chromosome (fewer when the chromosome has
 * fewer), and every marker between its ends carries the donor call.
 */
function plantSegments(spec: SynthSpec, t: MarkerTable, rand: () => number): Int32Array[] {
  const informativeByChrom: number[][] = Array.from({ length: spec.nChrom }, () => []);
  for (let m = 0; m < t.n; m++) {
    if (t.kind[m] === KIND_INFORMATIVE) informativeByChrom[t.chrom[m] as number]?.push(m);
  }
  const out: Int32Array[] = [];
  for (let i = 0; i < spec.nCandidates; i++) {
    const ranges = new Int32Array(spec.segmentsPerLine * 2).fill(-1);
    for (let s = 0; s < spec.segmentsPerLine; s++) {
      const inf = informativeByChrom[Math.floor(rand() * spec.nChrom)] ?? [];
      const len = Math.min(
        inf.length,
        MIN_SEGMENT_MARKERS + Math.floor(rand() * SEGMENT_MARKER_RANGE),
      );
      const start = Math.floor(rand() * (inf.length - len + 1));
      if (len === 0) continue;
      ranges[2 * s] = inf[start] as number;
      ranges[2 * s + 1] = inf[start + len - 1] as number;
    }
    out.push(ranges);
  }
  return out;
}

/** VCF 4.2 text, one line per yield including header lines, LF-terminated. */
export function* synthVcfLines(spec: SynthSpec): Generator<string> {
  const t = markerTable(spec);
  const rand = mulberry32(spec.seed ^ 0x9e3779b9);
  const segments = plantSegments(spec, t, rand);
  const candidates = Array.from({ length: spec.nCandidates }, (_, i) => candidateId(spec, i));

  yield '##fileformat=VCFv4.2\n';
  yield '##source=backcross tests/support/synth-vcf.ts (synthetic data, coordinates are fictitious)\n';
  yield `#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\t${[RP_ID, DONOR_ID, ...candidates].join('\t')}\n`;

  for (let m = 0; m < t.n; m++) {
    const c = t.chrom[m] as number;
    const a = t.rpAllele[m] as number;
    const kind = t.kind[m] as number;
    const d = kind === KIND_MONOMORPHIC ? a : 1 - a;
    const rpLike = `${a}/${a}`;
    const donorCall = `${d}/${d}`;
    const fields: string[] = [
      chromName(c),
      String(t.pos[m]),
      markerId(spec, c, t.k[m] as number),
      NUC[t.ref[m] as number] as string,
      NUC[t.alt[m] as number] as string,
      '.',
      'PASS',
      '.',
      'GT',
      kind === KIND_RP_HET ? '0/1' : rpLike,
      donorCall,
    ];
    for (let i = 0; i < spec.nCandidates; i++) {
      if (rand() < spec.missingRate) {
        fields.push('./.');
        continue;
      }
      const ranges = segments[i] as Int32Array;
      let inSegment = false;
      for (let s = 0; s < ranges.length; s += 2) {
        const lo = ranges[s] as number;
        if (lo >= 0 && m >= lo && m <= (ranges[s + 1] as number)) {
          inSegment = true;
          break;
        }
      }
      fields.push(inSegment ? donorCall : rpLike);
    }
    yield `${fields.join('\t')}\n`;
  }
}

export function synthSamplesCsv(spec: SynthSpec): string {
  const rows = [
    'sample_id,line_name,role,generation,family_id,notes',
    `${RP_ID},RP synthetic,recurrent_parent,,,"synthetic recurrent parent"`,
    `${DONOR_ID},DONOR synthetic,donor_parent,,,"synthetic donor"`,
  ];
  for (let i = 0; i < spec.nCandidates; i++) {
    const id = candidateId(spec, i);
    rows.push(`${id},${id.replace('_', '-')},candidate,BC5F3,FAM1,""`);
  }
  return `${rows.join('\n')}\n`;
}

export function synthMarkersCsv(spec: SynthSpec): string {
  const t = markerTable(spec);
  const rows = ['marker_id,chrom,pos_bp,cm'];
  for (let m = 0; m < t.n; m++) {
    const c = t.chrom[m] as number;
    const pos = t.pos[m] as number;
    const cm = Math.round((pos / 1_000_000) * CM_PER_MB * 10_000) / 10_000;
    rows.push(`${markerId(spec, c, t.k[m] as number)},${chromName(c)},${pos},${cm}`);
  }
  return `${rows.join('\n')}\n`;
}
