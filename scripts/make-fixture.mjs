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
  maxGapBp: SEG_MAX_GAP_BP,
  maxGapCm: SEG_MAX_GAP_CM,
  maxMissingSpan: MAX_MISSING_SPAN,
};
expected.segments = { cm: {}, bp: {} };
for (const s of candidates) {
  expected.segments.cm[s] = callSegmentsPlain(planted[s], 'cm');
  expected.segments.bp[s] = callSegmentsPlain(planted[s], 'bp');
}

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

expected.markerReasons = Object.fromEntries(
  markers.filter((m) => !m.informative).map((m) => [m.id, m.reason]),
);
writeFileSync(join(OUT, 'expected.json'), JSON.stringify(expected, null, 1) + '\n');
console.log(
  `wrote fixture to ${OUT}: ${M} markers, ${samples.length} samples, ${expected.nInformative} informative`,
);
