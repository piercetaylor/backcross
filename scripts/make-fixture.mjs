#!/usr/bin/env node
/**
 * Generates the synthetic test fixture under tests/fixtures/synthetic/.
 *
 * Design (deterministic, seed 20240904):
 *   - 20 chromosomes Gm01..Gm20, 25 markers each (500 markers). Spacing is a
 *     uniform 2 Mb except on Gm05 and Gm12 (random 0.5-4 Mb gaps) so that
 *     bp-weighted RPP differs from count-based RPP there.
 *   - The recurrent parent (RP) allele is REF or ALT at random, so nothing may
 *     assume REF = RP.
 *   - 30 markers are monomorphic between parents, 5 have a heterozygous RP,
 *     5 have a missing donor call: 40 uninformative markers, 460 informative.
 *   - Six candidates with planted donor segments, missing calls, one
 *     nonparental allele, one het segment, and one sample-swap-like line.
 *
 * Expected values are derived from the planted classes with the formulas in
 * PLAN.md (algorithms 2 and 3) and written to expected.json: class counts, RPP
 * by all three estimators, and donor segments under both gap criteria of
 * docs/adr/0008 (cM when markers.csv is loaded, bp when it is not). The
 * segment caller here is a second, deliberately plain implementation of the
 * rule so that src/core/segments.ts is checked against something it does not
 * share code with. Outputs: genotypes.vcf,
 * genotypes.hmp.txt, genotypes_wide.csv (nucleotide), genotypes_coded.csv
 * (A/B/H, informative markers only), samples.csv, markers.csv, expected.json.
 *
 * BrAPI outputs under tests/fixtures/brapi/: the Gm13 markers, syn_Gm02_03..05 and
 * syn_Gm07_04 (hets, half-missing and phased tokens, a third allele), and all eight
 * samples as a variant set `variantset1` served in pages (callsets.p0/p1,
 * variants.p0/p1, variants-nopos.p0 with null positions and bases, and the GT
 * allelematrix.v{0,1}.c{0,1}). Their shapes follow the BrAPI v2.1 Genotyping
 * schemas and the test-server responses recorded with scripts/brapi-record.mjs
 * (a shape check only, never a data source); every value is synthetic.
 *
 * Usage: node scripts/make-fixture.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures', 'synthetic');
mkdirSync(OUT, { recursive: true });

// ---- deterministic PRNG (mulberry32) ---------------------------------------
let seed = 20240904;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

// ---- markers ---------------------------------------------------------------
const N_CHROM = 20;
const PER_CHROM = 25;
const NONUNIFORM = new Set(['Gm05', 'Gm12']);
const NUC = ['A', 'C', 'G', 'T'];

const markers = []; // {id, chrom, pos, cm, ref, alt, rp, donor, informative, reason, extraAllele?}
for (let c = 1; c <= N_CHROM; c++) {
  const chrom = `Gm${String(c).padStart(2, '0')}`;
  let pos = 1_000_000;
  for (let k = 0; k < PER_CHROM; k++) {
    if (k > 0) pos += NONUNIFORM.has(chrom) ? Math.round(500_000 + rand() * 3_500_000) : 2_000_000;
    const ref = pick(NUC);
    const alt = pick(NUC.filter((n) => n !== ref));
    const rpIsRef = rand() < 0.5;
    markers.push({
      id: `syn_${chrom}_${String(k + 1).padStart(2, '0')}`,
      chrom,
      pos,
      cm: Math.round((pos / 1_000_000) * 2.4 * 100) / 100, // ~2.4 cM/Mb, synthetic
      ref,
      alt,
      rp: rpIsRef ? ref : alt,
      donor: rpIsRef ? alt : ref,
      informative: true,
      reason: 'informative',
    });
  }
}
const M = markers.length;

// Uninformative markers: monomorphic (30), RP heterozygous (5), donor missing (5).
const shuffled = markers.map((_, i) => i).sort(() => rand() - 0.5);
shuffled.slice(0, 30).forEach((i) => {
  markers[i].donor = markers[i].rp;
  markers[i].informative = false;
  markers[i].reason = 'monomorphic';
});
shuffled.slice(30, 35).forEach((i) => {
  markers[i].informative = false;
  markers[i].reason = 'rp_het';
});
shuffled.slice(35, 40).forEach((i) => {
  markers[i].informative = false;
  markers[i].reason = 'donor_missing';
});

// ---- samples and planted classes -------------------------------------------
// class codes as in src/core/types.ts: 0 missing, 1 rp_hom, 2 donor_hom, 3 het, 5 nonparental
const candidates = ['NIL_01', 'NIL_02', 'NIL_03', 'NIL_04', 'NIL_05', 'NIL_06'];
const idx = (chrom, k) =>
  markers.findIndex((m) => m.chrom === chrom && m.id.endsWith(`_${String(k).padStart(2, '0')}`));
const planted = {}; // sampleId -> Uint8Array of class per marker (before uninformative masking)
for (const s of candidates) planted[s] = new Uint8Array(M).fill(1);

function plant(sample, chrom, from, to, cls) {
  for (let k = from; k <= to; k++) planted[sample][idx(chrom, k)] = cls;
}
// NIL_01: one homozygous donor segment on Gm13 markers 10-14; 1% missing.
plant('NIL_01', 'Gm13', 10, 14, 2);
for (let m = 0; m < M; m++) if (rand() < 0.01) planted.NIL_01[m] = 0;
// NIL_02: Gm13 10-14 donor, Gm02 3-5 heterozygous.
plant('NIL_02', 'Gm13', 10, 14, 2);
plant('NIL_02', 'Gm02', 3, 5, 3);
// NIL_03: RP-like with one nonparental call (Gm07 marker 4) and one isolated donor call (Gm18 marker 20).
planted.NIL_03[idx('Gm07', 4)] = 5;
markers[idx('Gm07', 4)].extraAllele = NUC.find(
  (n) => n !== markers[idx('Gm07', 4)].ref && n !== markers[idx('Gm07', 4)].alt,
);
planted.NIL_03[idx('Gm18', 20)] = 2;
// NIL_04: Gm13 9-15 donor with markers 11-12 missing inside; Gm05 1-5 donor at the chromosome start.
plant('NIL_04', 'Gm13', 9, 15, 2);
planted.NIL_04[idx('Gm13', 11)] = 0;
planted.NIL_04[idx('Gm13', 12)] = 0;
plant('NIL_04', 'Gm05', 1, 5, 2);
// NIL_05: sample-swap-like; donor everywhere except Gm01 1-10.
planted.NIL_05.fill(2);
plant('NIL_05', 'Gm01', 1, 10, 1);
// NIL_06: 15% missing, heterozygous segment Gm12 12-25 (non-uniform spacing).
for (let m = 0; m < M; m++) if (rand() < 0.15) planted.NIL_06[m] = 0;
plant('NIL_06', 'Gm12', 12, 25, 3);

// ---- expected values --------------------------------------------------------
const MAX_GAP_BP = 2_000_000;
const MAX_GAP_CM = 10;
function weighted(positions, scores, cap) {
  let num = 0;
  let den = 0;
  const n = positions.length;
  for (let i = 0; i < n; i++) {
    const p = positions[i];
    const left = i === 0 ? Math.min(p, cap) : Math.min((p - positions[i - 1]) / 2, cap);
    const right = i === n - 1 ? cap : Math.min((positions[i + 1] - p) / 2, cap);
    const w = left + right;
    num += w * scores[i];
    den += w;
  }
  return [num, den];
}
const SCORE = { 1: 1, 2: 0, 3: 0.5 };
const expected = {
  nMarkers: M,
  nInformative: markers.filter((m) => m.informative).length,
  lines: {},
};
for (const s of candidates) {
  const cls = planted[s];
  const counts = { rp_hom: 0, donor_hom: 0, het: 0, missing: 0, nonparental: 0, uninformative: 0 };
  let numBp = 0;
  let denBp = 0;
  let numCm = 0;
  let denCm = 0;
  const byChrom = {};
  for (let c = 1; c <= N_CHROM; c++) {
    const chrom = `Gm${String(c).padStart(2, '0')}`;
    const posBp = [];
    const posCm = [];
    const scores = [];
    let nCalled = 0;
    let numCount = 0;
    for (let m = 0; m < M; m++) {
      if (markers[m].chrom !== chrom) continue;
      if (!markers[m].informative) {
        counts.uninformative++;
        continue;
      }
      const k = cls[m];
      if (k === 0) counts.missing++;
      else if (k === 5) counts.nonparental++;
      else {
        counts[k === 1 ? 'rp_hom' : k === 2 ? 'donor_hom' : 'het']++;
        nCalled++;
        numCount += SCORE[k];
        posBp.push(markers[m].pos);
        posCm.push(markers[m].cm);
        scores.push(SCORE[k]);
      }
    }
    const [nb, db] = weighted(posBp, scores, MAX_GAP_BP / 2);
    const [nc, dc] = weighted(posCm, scores, MAX_GAP_CM / 2);
    numBp += nb;
    denBp += db;
    numCm += nc;
    denCm += dc;
    byChrom[chrom] = {
      nCalled,
      rppCount: nCalled ? numCount / nCalled : null,
      rppBp: db ? nb / db : null,
    };
  }
  const nCalled = counts.rp_hom + counts.donor_hom + counts.het;
  expected.lines[s] = {
    counts,
    rppCount: (counts.rp_hom + 0.5 * counts.het) / nCalled,
    rppBp: numBp / denBp,
    rppCm: numCm / denCm,
    byChromosome: byChrom,
  };
}
expected.params = { maxGapBp: MAX_GAP_BP, maxGapCm: MAX_GAP_CM };

// ---- expected donor segments (algorithm 3, docs/adr/0008) -------------------
// Independent implementation: walk informative markers per chromosome, break a
// run when consecutive informative markers are farther apart than the gap
// (cM when a map is present, else bp), when more than MAX_MISSING_SPAN skipped
// markers separate two non-RP calls, or at an RP call. Missing (0) and
// nonparental (5) calls are skipped; runs shorter than MIN_MARKERS are dropped.
const SEG_MAX_GAP_BP = 10_000_000;
const SEG_MAX_GAP_CM = 10;
const MIN_MARKERS = 2;
const MAX_MISSING_SPAN = 3;
const nz = (x) => (Number.isNaN(x) ? null : x); // JSON has no NaN

function callSegmentsPlain(cls, criterion) {
  const segments = [];
  for (let c = 1; c <= N_CHROM; c++) {
    const chrom = `Gm${String(c).padStart(2, '0')}`;
    const inf = markers
      .map((mk, m) => ({ mk, m }))
      .filter(({ mk }) => mk.chrom === chrom && mk.informative)
      .sort((a, b) => a.mk.pos - b.mk.pos);
    const runs = [];
    let run = null;
    let skipped = 0;
    for (let i = 0; i < inf.length; i++) {
      const { mk, m } = inf[i];
      if (run !== null && i > 0) {
        const prev = inf[i - 1].mk;
        const tooFar =
          criterion === 'cm'
            ? Math.abs(mk.cm - prev.cm) > SEG_MAX_GAP_CM
            : mk.pos - prev.pos > SEG_MAX_GAP_BP;
        if (tooFar) {
          runs.push(run);
          run = null;
          skipped = 0;
        }
      }
      const k = cls[m];
      if (k === 0 || k === 5) {
        if (run !== null && ++skipped > MAX_MISSING_SPAN) {
          runs.push(run);
          run = null;
          skipped = 0;
        }
        continue;
      }
      if (k === 1) {
        if (run !== null) runs.push(run);
        run = null;
        skipped = 0;
        continue;
      }
      if (run === null) run = [];
      run.push(i);
      skipped = 0;
    }
    if (run !== null) runs.push(run);
    for (const r of runs) {
      if (r.length < MIN_MARKERS) continue;
      const first = inf[r[0]];
      const last = inf[r[r.length - 1]];
      let leftFlankBp = NaN;
      for (let i = r[0] - 1; i >= 0; i--)
        if (cls[inf[i].m] === 1) {
          leftFlankBp = inf[i].mk.pos;
          break;
        }
      let rightFlankBp = NaN;
      for (let i = r[r.length - 1] + 1; i < inf.length; i++)
        if (cls[inf[i].m] === 1) {
          rightFlankBp = inf[i].mk.pos;
          break;
        }
      const nDonorHom = r.filter((i) => cls[inf[i].m] === 2).length;
      const nHet = r.length - nDonorHom;
      segments.push({
        chrom,
        startBp: first.mk.pos,
        endBp: last.mk.pos,
        leftFlankBp: nz(leftFlankBp),
        rightFlankBp: nz(rightFlankBp),
        nMarkers: r.length,
        nDonorHom,
        nHet,
        class: nHet === 0 ? 'donor' : nDonorHom === 0 ? 'het' : 'mixed',
        startCm: criterion === 'cm' ? first.mk.cm : null,
        endCm: criterion === 'cm' ? last.mk.cm : null,
      });
    }
  }
  return segments;
}
expected.segmentParams = {
  minMarkers: MIN_MARKERS,
  maxSegmentGapBp: SEG_MAX_GAP_BP,
  maxSegmentGapCm: SEG_MAX_GAP_CM,
  maxMissingSpan: MAX_MISSING_SPAN,
};
expected.segments = { cm: {}, bp: {} };
for (const s of candidates) {
  expected.segments.cm[s] = callSegmentsPlain(planted[s], 'cm');
  expected.segments.bp[s] = callSegmentsPlain(planted[s], 'bp');
}

// ---- expected pairwise comparisons (algorithm 5) ----------------------------
// Independent implementation. Mode informative compares planted classes at
// informative markers where both samples have a parental call (RP_HOM,
// DONOR_HOM or HET; the RP is RP_HOM and the donor DONOR_HOM by definition).
// Mode all compares unordered allele pairs at every marker where both are
// called, and reports identity by state as the mean of shared alleles / 2.
// The cell() function below is hoisted, so it can be used here.
function classOfSample(sample, m) {
  if (!markers[m].informative) return null;
  if (sample === 'RP_Williams') return 1;
  if (sample === 'DONOR_PI') return 2;
  const k = planted[sample][m];
  return k === 1 || k === 2 || k === 3 ? k : null;
}
function genomeOrder() {
  return markers
    .map((mk, m) => ({ mk, m }))
    .sort((a, b) =>
      a.mk.chrom === b.mk.chrom ? a.mk.pos - b.mk.pos : a.mk.chrom < b.mk.chrom ? -1 : 1,
    )
    .map(({ m }) => m);
}
function comparePlain(a, b, mode) {
  const byChrom = {};
  for (let c = 1; c <= N_CHROM; c++)
    byChrom[`Gm${String(c).padStart(2, '0')}`] = { nCompared: 0, nDiscordant: 0 };
  const discordant = [];
  let shared = 0;
  let coCalled = 0;
  let nSkippedMissing = 0;
  let nSkippedNonparental = 0;
  for (const m of genomeOrder()) {
    const chrom = markers[m].chrom;
    let compared = false;
    let differs = false;
    if (mode === 'informative') {
      const ka = classOfSample(a, m);
      const kb = classOfSample(b, m);
      if (ka !== null && kb !== null) {
        compared = true;
        differs = ka !== kb;
      } else if (markers[m].informative) {
        // Count why the marker was not compared: a nonparental call (planted
        // class 5) is a contamination signal, a missing call is not.
        const raw = (x) => (x === 'RP_Williams' || x === 'DONOR_PI' ? 1 : planted[x][m]);
        if (raw(a) === 5 || raw(b) === 5) nSkippedNonparental++;
        else nSkippedMissing++;
      }
    } else {
      const ca = cell(m, a);
      const cb = cell(m, b);
      if (ca !== null && cb !== null) {
        compared = true;
        const pa = [...ca].sort().join('');
        const pb = [...cb].sort().join('');
        differs = pa !== pb;
        // shared alleles between two unordered pairs: 0, 1 or 2
        const sa = [...ca].sort();
        const sb = [...cb].sort();
        let n = 0;
        const rest = [...sb];
        for (const x of sa) {
          const i = rest.indexOf(x);
          if (i >= 0) {
            n++;
            rest.splice(i, 1);
          }
        }
        shared += n;
        coCalled++;
      }
    }
    if (compared) {
      byChrom[chrom].nCompared++;
      if (differs) {
        byChrom[chrom].nDiscordant++;
        discordant.push(markers[m].id);
      }
    }
  }
  const nCompared = Object.values(byChrom).reduce((s, r) => s + r.nCompared, 0);
  return {
    sampleA: a,
    sampleB: b,
    mode,
    nCompared,
    nDiscordant: discordant.length,
    nSkippedMissing: mode === 'informative' ? nSkippedMissing : 0,
    nSkippedNonparental: mode === 'informative' ? nSkippedNonparental : 0,
    discordantMarkers: discordant,
    byChromosome: byChrom,
    ibs: mode === 'all' && coCalled > 0 ? shared / 2 / coCalled : null,
  };
}
expected.compare = [
  ['NIL_01', 'NIL_02', 'informative'],
  ['NIL_03', 'RP_Williams', 'informative'],
  ['NIL_05', 'DONOR_PI', 'informative'],
  ['NIL_01', 'NIL_04', 'all'],
  ['NIL_06', 'RP_Williams', 'all'],
  ['NIL_03', 'RP_Williams', 'all'],
].map(([a, b, mode]) => comparePlain(a, b, mode));

// ---- genotype cells ---------------------------------------------------------
const samples = ['RP_Williams', 'DONOR_PI', ...candidates];
function cell(m, s) {
  // returns [allele symbol 1, allele symbol 2] or null for missing
  const mk = markers[m];
  if (s === 'RP_Williams') return mk.reason === 'rp_het' ? [mk.ref, mk.alt] : [mk.rp, mk.rp];
  if (s === 'DONOR_PI') return mk.reason === 'donor_missing' ? null : [mk.donor, mk.donor];
  const k = planted[s][m];
  if (!mk.informative) {
    // At uninformative markers candidates carry the RP genotype (or missing where the RP is unknown).
    if (mk.reason === 'rp_het') return null;
    return [mk.rp, mk.rp];
  }
  if (k === 0) return null;
  if (k === 1) return [mk.rp, mk.rp];
  if (k === 2) return [mk.donor, mk.donor];
  if (k === 3) return [mk.rp, mk.donor];
  return [mk.extraAllele, mk.extraAllele];
}

// VCF
const vcf = [
  '##fileformat=VCFv4.2',
  '##source=isoline-browser make-fixture.mjs (synthetic data, Wm82-like coordinates are fictitious)',
];
vcf.push(`#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\t${samples.join('\t')}`);
for (let m = 0; m < M; m++) {
  const mk = markers[m];
  const alts = mk.extraAllele ? [mk.alt, mk.extraAllele] : [mk.alt];
  const alleles = [mk.ref, ...alts];
  const gts = samples.map((s) => {
    const c = cell(m, s);
    if (c === null) return './.';
    return `${alleles.indexOf(c[0])}/${alleles.indexOf(c[1])}`;
  });
  vcf.push(
    `${mk.chrom}\t${mk.pos}\t${mk.id}\t${mk.ref}\t${alts.join(',')}\t.\tPASS\t.\tGT\t${gts.join('\t')}`,
  );
}
writeFileSync(join(OUT, 'genotypes.vcf'), vcf.join('\n') + '\n');

// HapMap
const hmp = [
  `rs#\talleles\tchrom\tpos\tstrand\tassembly#\tcenter\tprotLSID\tassayLSID\tpanelLSID\tQCcode\t${samples.join('\t')}`,
];
for (let m = 0; m < M; m++) {
  const mk = markers[m];
  const alleles = [mk.ref, mk.alt, ...(mk.extraAllele ? [mk.extraAllele] : [])].join('/');
  const cells = samples.map((s) => {
    const c = cell(m, s);
    return c === null ? 'NN' : c[0] + c[1];
  });
  hmp.push(
    `${mk.id}\t${alleles}\t${mk.chrom.replace('Gm', 'chr')}\t${mk.pos}\t+\tNA\tNA\tNA\tNA\tNA\tNA\t${cells.join('\t')}`,
  );
}
writeFileSync(join(OUT, 'genotypes.hmp.txt'), hmp.join('\n') + '\n');

// Wide nucleotide CSV (chromosome spelled as plain numbers to exercise normalization)
const wide = [`marker_id,chrom,pos_bp,${samples.join(',')}`];
for (let m = 0; m < M; m++) {
  const mk = markers[m];
  const cells = samples.map((s) => {
    const c = cell(m, s);
    if (c === null) return 'NA';
    return c[0] === c[1] ? c[0] : `${c[0]}/${c[1]}`;
  });
  wide.push(`${mk.id},${Number(mk.chrom.slice(2))},${mk.pos},${cells.join(',')}`);
}
writeFileSync(join(OUT, 'genotypes_wide.csv'), wide.join('\n') + '\n');

// Coded CSV: informative markers only; nonparental has no symbol and becomes N.
const coded = [`marker_id,chrom,pos_bp,${samples.join(',')}`];
for (let m = 0; m < M; m++) {
  const mk = markers[m];
  if (!mk.informative) continue;
  const cells = samples.map((s) => {
    if (s === 'RP_Williams') return 'A';
    if (s === 'DONOR_PI') return 'B';
    const k = planted[s][m];
    return k === 1 ? 'A' : k === 2 ? 'B' : k === 3 ? 'H' : 'N';
  });
  coded.push(`${mk.id},${mk.chrom},${mk.pos},${cells.join(',')}`);
}
writeFileSync(join(OUT, 'genotypes_coded.csv'), coded.join('\n') + '\n');

// samples.csv
const manifest = ['sample_id,line_name,role,generation,family_id,notes'];
manifest.push('RP_Williams,Williams 82,recurrent_parent,,,"synthetic recurrent parent"');
manifest.push('DONOR_PI,PI 000000,donor_parent,,,"synthetic donor"');
const notes = {
  NIL_01: 'one donor segment Gm13',
  NIL_02: 'donor segment Gm13 plus het segment Gm02',
  NIL_03: 'one nonparental call Gm07, isolated donor call Gm18',
  NIL_04: 'donor segment Gm13 with missing calls inside; Gm05 start segment',
  NIL_05: 'mostly donor genome (sample swap pattern)',
  NIL_06: '15% missing; het segment Gm12',
};
candidates.forEach((s) =>
  manifest.push(`${s},${s.replace('_', '-')},candidate,BC5F3,FAM1,"${notes[s]}"`),
);
writeFileSync(join(OUT, 'samples.csv'), manifest.join('\n') + '\n');

// markers.csv with cM
const map = ['marker_id,chrom,pos_bp,cm'];
for (const mk of markers) map.push(`${mk.id},${mk.chrom},${mk.pos},${mk.cm}`);
writeFileSync(join(OUT, 'markers.csv'), map.join('\n') + '\n');

// BrAPI v2.1 responses (docs/m3-phase4-brapi.md section 7) for the Gm13 markers
// plus syn_Gm02_03..05 (an RP het, a NIL_02 het segment, missing candidates) and
// syn_Gm07_04 (the third allele), in VCF order. Values are the synthetic cells
// above; only the field names follow the server. On the four extra markers the
// GT tokens vary in spelling, always classification-equivalent to the VCF call
// (TOKEN_VARIANTS below); elsewhere a homozygote is collapsed ("0") and a
// missing call is ".".
const BRAPI_OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures', 'brapi');
mkdirSync(BRAPI_OUT, { recursive: true });
const VS = 'variantset1';
const CS_PAGE = 5;
const V_PAGE = 15;
const BRAPI_EXTRA = new Set(['syn_Gm02_03', 'syn_Gm02_04', 'syn_Gm02_05', 'syn_Gm07_04']);
const brapiMarkers = markers
  .map((mk, m) => ({ mk, m }))
  .filter(({ mk }) => mk.chrom === 'Gm13' || BRAPI_EXTRA.has(mk.id));
// Token spellings on the extra markers, keyed by marker id then sample. Hets as
// unphased "0/1" and "1/0" and phased "0|1"; half-missing "./1" and "0/." where
// the VCF call is ./. (vcf.ts reads both as missing).
const TOKEN_VARIANTS = {
  syn_Gm02_03: { RP_Williams: '0/1', NIL_01: './1', NIL_02: '0/.' },
  syn_Gm02_04: { NIL_02: '0|1' },
  syn_Gm02_05: { NIL_02: '1/0' },
};
const brapiStatus = [{ message: 'Request accepted, response successful', messageType: 'INFO' }];
let brapiBytes = 0;
function writeBrapi(name, obj) {
  const text = JSON.stringify(obj, null, 1) + '\n';
  brapiBytes += Buffer.byteLength(text);
  writeFileSync(join(BRAPI_OUT, name), text);
}
function page(data, currentPage, pageSize, totalCount, pageTokens = false) {
  return {
    '@context': null,
    metadata: {
      datafiles: [],
      pagination: {
        currentPage,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
        // The test server adds token fields to /variants pagination only.
        ...(pageTokens
          ? { currentPageToken: String(currentPage), nextPageToken: '', prevPageToken: '' }
          : {}),
      },
      status: brapiStatus,
    },
    result: { data },
  };
}
const callSetRows = samples.map((s, i) => ({
  additionalInfo: {},
  callSetDbId: `callset${i + 1}`,
  callSetName: s,
  created: null,
  externalReferences: null,
  sampleDbId: `sample${i + 1}`,
  studyDbId: 'study1',
  updated: null,
  variantSetDbIds: [VS],
}));
writeBrapi('callsets.p0.json', page(callSetRows.slice(0, CS_PAGE), 0, CS_PAGE, samples.length));
writeBrapi('callsets.p1.json', page(callSetRows.slice(CS_PAGE), 1, CS_PAGE, samples.length));
const brapiAlleles = (mk) => [mk.ref, ...(mk.extraAllele ? [mk.alt, mk.extraAllele] : [mk.alt])];
const variantDbIdOf = (k) =>
  k === brapiMarkers.length ? brapiMarkers[k - 1].mk.id : `variant${k}`;
const variantRows = brapiMarkers.map(({ mk }, i) => {
  const k = i + 1;
  const [ref, ...alts] = brapiAlleles(mk);
  return {
    additionalInfo: {},
    alternate_bases: [], // legacy snake_case field the test server also emits
    alternateBases: alts,
    ciend: null,
    cipos: null,
    created: null,
    end: mk.pos,
    externalReferences: null,
    filtersApplied: false,
    filtersFailed: [],
    filtersPassed: true,
    referenceBases: ref,
    referenceDbId: `ref_${mk.chrom}`,
    referenceName: mk.chrom,
    referenceSetDbId: 'refset1',
    referenceSetName: null,
    start: mk.pos - 1,
    svlen: null,
    updated: null,
    variantDbId: variantDbIdOf(k),
    variantNames: k === brapiMarkers.length ? [] : [mk.id],
    variantSetDbId: [VS],
    variantType: 'SNP',
  };
});
writeBrapi(
  'variants.p0.json',
  page(variantRows.slice(0, V_PAGE), 0, V_PAGE, brapiMarkers.length, true),
);
writeBrapi(
  'variants.p1.json',
  page(variantRows.slice(V_PAGE), 1, V_PAGE, brapiMarkers.length, true),
);
const noposRows = variantRows.map((row) => ({
  ...row,
  alternateBases: null,
  end: null,
  referenceBases: null,
  referenceDbId: null,
  referenceName: null,
  start: null,
}));
writeBrapi(
  'variants-nopos.p0.json',
  page(noposRows, 0, brapiMarkers.length, brapiMarkers.length, true),
);
for (let v = 0; v < 2; v++) {
  for (let c = 0; c < 2; c++) {
    const vRows = brapiMarkers.slice(v * V_PAGE, (v + 1) * V_PAGE);
    const vIds = vRows.map((_, i) => variantDbIdOf(v * V_PAGE + i + 1));
    const cSamples = samples.slice(c * CS_PAGE, (c + 1) * CS_PAGE);
    const cIds = cSamples.map((_, j) => `callset${c * CS_PAGE + j + 1}`);
    const dataMatrix = vRows.map(({ mk, m }) => {
      const alleles = brapiAlleles(mk);
      const extra = BRAPI_EXTRA.has(mk.id);
      return cSamples.map((s) => {
        const cl = cell(m, s);
        const variant = TOKEN_VARIANTS[mk.id]?.[s];
        if (variant !== undefined) return variant;
        if (cl === null) return extra ? './.' : '.';
        const i0 = alleles.indexOf(cl[0]);
        const i1 = alleles.indexOf(cl[1]);
        if (extra) return `${i0}/${i1}`; // spelled out, e.g. syn_Gm07_04 NIL_03 "2/2"
        return i0 === i1 ? String(i0) : `${i0}/${i1}`;
      });
    });
    writeBrapi(`allelematrix.v${v}.c${c}.json`, {
      atContext: null,
      '@context': null,
      metadata: {
        datafiles: [],
        pagination: { currentPage: 0, pageSize: 1000, totalCount: 1, totalPages: 1 },
        status: brapiStatus,
      },
      result: {
        callSetDbIds: cIds,
        dataMatrices: [
          {
            dataMatrixAbbreviation: 'GT',
            dataMatrixName: 'Genotype',
            dataMatrix,
            dataType: 'string',
          },
        ],
        expandHomozygotes: false,
        pagination: [
          {
            dimension: 'VARIANTS',
            page: v,
            pageSize: V_PAGE,
            totalCount: brapiMarkers.length,
            totalPages: 2,
          },
          {
            dimension: 'CALLSETS',
            page: c,
            pageSize: CS_PAGE,
            totalCount: samples.length,
            totalPages: 2,
          },
        ],
        sepPhased: '/',
        sepUnphased: '|',
        unknownString: '.',
        variantDbIds: vIds,
        variantSetDbIds: [VS],
      },
    });
  }
}

expected.markerReasons = Object.fromEntries(
  markers.filter((m) => !m.informative).map((m) => [m.id, m.reason]),
);
writeFileSync(join(OUT, 'expected.json'), JSON.stringify(expected, null, 1) + '\n');
console.log(
  `wrote fixture to ${OUT}: ${M} markers, ${samples.length} samples, ${expected.nInformative} informative; BrAPI responses to ${BRAPI_OUT}: ${brapiBytes} bytes`,
);
