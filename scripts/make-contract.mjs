#!/usr/bin/env node
/**
 * Generates the contract cases under contract/cases/ and contract/MANIFEST.sha256.
 *
 * Every case is a hand-authored literal: the input files are written out
 * character by character below, and each `expect` object is written by hand
 * from those literals, never computed by a parser. Nothing here imports src/
 * or tests/; tests/contract-cases.test.ts runs the loaders on the files and
 * compares their output with the expectation, so the test checks the code
 * against a reading of contract/data-contract.md rather than against itself.
 *
 * Version 1.1.0 adds the inputs the maintainer decided on 2026-09-14
 * (docs/adr/0014): the shared chromosome pattern and natural order, the
 * per-mode wide-CSV missing-token lists and the HapMap list (NA ./. . .|.
 * X XX), IUPAC heterozygote codes read as two nucleotides in both HapMap
 * and wide CSV, rejection of every other cell (? B H 0 + A?, and X/XX in
 * wide CSV), CRLF and BOM, tab delimiters and RFC 4180 quoting in both CSV
 * files, an omitted line_name column, raw CHROM in `<CHROM>_<POS>` ids,
 * and the error kind genotypes.unknown_cell. Deliberately absent: a pair
 * of one nucleotide and one of N - . (`AN`, `A-`; undecided, PLAN.md); a
 * VCF with no GT field; half-missing GT such as `0/.`; and a
 * whole-file-detection case, which would exceed the 4 KB limit and is
 * unit-tested in each repository instead.
 *
 * Version 1.2.0 (docs/adr/0014, amendment of 2026-09-14): whole-valued
 * float and exponent positions read as integers in wide CSV, markers.csv
 * and HapMap; VCF POS decimal digits only, and an ID-less VCF record named
 * from the parsed POS; a fractional or negative position rejected with the error kind
 * genotypes.invalid_position; an all-empty wide-CSV row skipped.
 *
 * Version 1.3.0 (docs/adr/0018): blank and whitespace-only lines and
 * all-empty delimited rows skipped in every input, including before the
 * header (so the delimiter sniff reads the first non-blank line); `#` is
 * not a comment marker (a `#` row is data in the delimited files, an error
 * before the HapMap header, and a wrong-field-count data line after the VCF
 * `#CHROM` line, error kind genotypes.repeated_header); a quoted line break inside a samples.csv field; and the
 * error kind genotypes.column_count. No case carries two faults.
 *
 * Version 1.4.0 (docs/adr/0019): named token profiles. The profile files
 * under contract/profiles/ are committed, not written here; the manifest
 * hashes them with everything else. A case may carry
 * `options: { profile: '<id>' }`, written as options.json beside its files.
 * Cases read wide CSV and HapMap under soybase-report (H resolved to the
 * row's two alleles, the HapMap `alleles` column included; U missing), dart,
 * axiom, kasp and tassel, and two error kinds: genotypes.ambiguous_heterozygote
 * (an H at a marker showing one allele) and genotypes.profile_format (a
 * profile with a VCF, or with a wide CSV detected as coded A/B/H).
 *
 * Determinism: text is joined with explicit '\n'; gzip is fflate's gzipSync
 * with mtime 0, and bgzip is fflate's deflateSync framed here as BGZF
 * members (SAMv1.tex, section 4.1), so Node 22 and Node 24 write identical
 * bytes. contract/cases/ is removed and rewritten on every run. The manifest
 * hashes every file under contract/ except itself, sorted by path.
 *
 * Usage: node scripts/make-contract.mjs
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';

import { deflateSync, gzipSync } from 'fflate';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'contract');
const CASES = join(ROOT, 'cases');
const VERSION = readFileSync(join(ROOT, 'VERSION'), 'utf8').trim();
const MAX_CASE_BYTES = 4096;
// Raised from 64 KiB in contract 1.3.0 (docs/adr/0018): profiles, crop schemes and their cases follow.
const MAX_CONTRACT_BYTES = 128 * 1024;

const lines = (...rows) => rows.join('\n') + '\n';
const tsv = (...cells) => cells.join('\t');
const utf8 = (text) => new TextEncoder().encode(text);
const crlf = (...rows) => rows.join('\r\n') + '\r\n';
const bom = (text) => '﻿' + text;

// ---- compression ------------------------------------------------------------

function gzip(text) {
  return gzipSync(utf8(text), { level: 6, mtime: 0 });
}

const BGZF_EOF = Uint8Array.from([
  0x1f, 0x8b, 0x08, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0x06, 0x00, 0x42, 0x43, 0x02, 0x00,
  0x1b, 0x00, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

/** One BGZF member: gzip header with the BC extra subfield, raw deflate, CRC32, ISIZE. */
function bgzfMember(text) {
  const data = utf8(text);
  const body = deflateSync(data, { level: 6 });
  const total = 18 + body.length + 8;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  out.set([0x1f, 0x8b, 0x08, 0x04, 0, 0, 0, 0, 0x00, 0xff, 0x06, 0x00, 0x42, 0x43, 0x02, 0x00]);
  view.setUint16(16, total - 1, true);
  out.set(body, 18);
  view.setUint32(18 + body.length, crc32(data), true);
  view.setUint32(22 + body.length, data.length, true);
  return out;
}

function bgzip(...memberTexts) {
  const parts = [...memberTexts.map(bgzfMember), BGZF_EOF];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

// ---- shared literals --------------------------------------------------------

const VCF_HEADER = tsv('#CHROM', 'POS', 'ID', 'REF', 'ALT', 'QUAL', 'FILTER', 'INFO', 'FORMAT');
const HAPMAP_HEADER = tsv(
  'rs#',
  'alleles',
  'chrom',
  'pos',
  'strand',
  'assembly#',
  'center',
  'protLSID',
  'assayLSID',
  'panelLSID',
  'QCcode',
);
/** strand, assembly#, center, protLSID, assayLSID, panelLSID, QCcode. */
const HAPMAP_FIXED = ['+', 'NA', 'NA', 'NA', 'NA', 'NA', 'NA'];

const SAMPLES_RP_DONOR_L1_L2 = lines(
  'sample_id,line_name,role,generation,family_id,notes',
  'RP,Recurrent,recurrent_parent,,,',
  'DONOR,Donor,donor_parent,,,',
  'L1,Line 1,candidate,BC5F3,FAM1,',
  'L2,Line 2,progeny,BC5F3,FAM1,',
);

const SAMPLES_RP_DONOR_L1 = lines(
  'sample_id,line_name,role,generation,family_id,notes',
  'RP,Recurrent,recurrent_parent,,,',
  'DONOR,Donor,donor_parent,,,',
  'L1,Line 1,candidate,,,',
);

/** Records split so the bgzip case can put the member boundary on a line boundary. */
const COMPRESSED_VCF_HEAD = lines(
  '##fileformat=VCFv4.2',
  tsv(VCF_HEADER, 'RP', 'DONOR', 'L1'),
  tsv('Gm18', '500', 'z1', 'A', 'C', '.', 'PASS', '.', 'GT', '0/0', '1/1', '0/1'),
);
const COMPRESSED_VCF_TAIL = lines(
  tsv('Gm18', '900', 'z2', 'G', 'T', '.', 'PASS', '.', 'GT', '1/1', '0/0', './.'),
  tsv('Gm18', '1500', 'z3', 'T', 'A', '.', 'PASS', '.', 'GT', '0/0', '1/1', '1/1'),
);

const COMPRESSED_VCF_EXPECT = {
  contractVersion: VERSION,
  coded: false,
  chromosomeOrder: ['Gm18'],
  markers: [
    { id: 'z1', chrom: 'Gm18', posBp: 500, cm: null },
    { id: 'z2', chrom: 'Gm18', posBp: 900, cm: null },
    { id: 'z3', chrom: 'Gm18', posBp: 1500, cm: null },
  ],
  sampleIds: ['RP', 'DONOR', 'L1'],
  calls: {
    RP: [
      ['A', 'A'],
      ['T', 'T'],
      ['T', 'T'],
    ],
    DONOR: [
      ['C', 'C'],
      ['G', 'G'],
      ['A', 'A'],
    ],
    L1: [['A', 'C'], null, ['A', 'A']],
  },
};

/** Contract 1.3.0 cases: markers r1 (Gm02, 1000) and r2 (Gm02, 2000), written by hand. */
const R1_R2_EXPECT = {
  contractVersion: VERSION,
  coded: false,
  chromosomeOrder: ['Gm02'],
  markers: [
    { id: 'r1', chrom: 'Gm02', posBp: 1000, cm: null },
    { id: 'r2', chrom: 'Gm02', posBp: 2000, cm: null },
  ],
  sampleIds: ['RP', 'DONOR', 'L1'],
  calls: {
    RP: [
      ['A', 'A'],
      ['C', 'C'],
    ],
    DONOR: [
      ['G', 'G'],
      ['T', 'T'],
    ],
    L1: [
      ['A', 'A'],
      ['T', 'T'],
    ],
  },
};

const WIDE_SIMPLE = lines(
  'marker_id,chrom,pos_bp,RP,DONOR,L1',
  'e1,Gm04,1000,A,G,A/G',
  'e2,Gm04,2000,C,T,C',
);

// ---- cases ------------------------------------------------------------------

/**
 * Each case: `files` maps a file name to its text or bytes; exactly one of
 * `expect` (ContractExpect) or `error` (an ErrorKind) is given.
 */
/** vcf-basic's genotype file, reused by err-profile-with-vcf. */
const VCF_BASIC_GENOTYPES = lines(
  '##fileformat=VCFv4.2',
  '##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">',
  tsv(VCF_HEADER, 'RP', 'DONOR', 'L1', 'L2'),
  tsv('Gm07', '1000', 'v_phase', 'A', 'G', '.', 'PASS', '.', 'GT', '0/0', '1/1', '0|1', '1|0'),
  tsv('Gm07', '2000', '.', 'C', 'T', '.', 'PASS', '.', 'GT', '0', '1', './.', '.'),
  tsv('Gm07', '3000', 'v_multi', 'G', 'A,T', '.', 'PASS', '.', 'GT', '0/0', '2/2', '0/2', '1/2'),
  tsv(
    'Gm07',
    '4000',
    'v_gtlast',
    'T',
    'C',
    '.',
    'PASS',
    '.',
    'DP:GT',
    '11:0/0',
    '9:1/1',
    '8:0/1',
    '7:.|.',
  ),
);

const cases = [
  {
    // Phased and unphased GT, haploid GT, multiallelic ALT, ID `.`, GT not first in FORMAT.
    name: 'vcf-basic',
    files: {
      'genotypes.vcf': VCF_BASIC_GENOTYPES,
      'samples.csv': SAMPLES_RP_DONOR_L1_L2,
    },
    expect: {
      contractVersion: VERSION,
      coded: false,
      chromosomeOrder: ['Gm07'],
      markers: [
        { id: 'v_phase', chrom: 'Gm07', posBp: 1000, cm: null },
        { id: 'Gm07_2000', chrom: 'Gm07', posBp: 2000, cm: null },
        { id: 'v_multi', chrom: 'Gm07', posBp: 3000, cm: null },
        { id: 'v_gtlast', chrom: 'Gm07', posBp: 4000, cm: null },
      ],
      sampleIds: ['RP', 'DONOR', 'L1', 'L2'],
      calls: {
        RP: [
          ['A', 'A'],
          ['C', 'C'],
          ['G', 'G'],
          ['T', 'T'],
        ],
        DONOR: [
          ['G', 'G'],
          ['T', 'T'],
          ['T', 'T'],
          ['C', 'C'],
        ],
        L1: [['A', 'G'], null, ['G', 'T'], ['C', 'T']],
        L2: [['A', 'G'], null, ['A', 'T'], null],
      },
    },
  },
  {
    name: 'vcf-gzip-one-member',
    files: {
      'genotypes.vcf.gz': gzip(COMPRESSED_VCF_HEAD + COMPRESSED_VCF_TAIL),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    expect: COMPRESSED_VCF_EXPECT,
  },
  {
    // Two BGZF members split at a line boundary, then the 28-byte EOF block.
    name: 'vcf-bgzip-two-members-eof',
    files: {
      'genotypes.vcf.gz': bgzip(COMPRESSED_VCF_HEAD, COMPRESSED_VCF_TAIL),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    expect: COMPRESSED_VCF_EXPECT,
  },
  {
    // Two-letter, slash-pair and single IUPAC cells (A C G T R Y S W K M); N NN - -- empty missing.
    name: 'hapmap-iupac',
    files: {
      'genotypes.hmp.txt': lines(
        tsv(
          'rs#',
          'alleles',
          'chrom',
          'pos',
          'strand',
          'assembly#',
          'center',
          'protLSID',
          'assayLSID',
          'panelLSID',
          'QCcode',
          'RP',
          'DONOR',
          'L1',
          'L2',
          'L3',
        ),
        tsv(
          'h1',
          'A/G',
          'Gm13',
          '100',
          '+',
          'NA',
          'NA',
          'NA',
          'NA',
          'NA',
          'NA',
          'AA',
          'GG',
          'AG',
          'R',
          'N',
        ),
        tsv(
          'h2',
          'C/T',
          'Gm13',
          '200',
          '+',
          'NA',
          'NA',
          'NA',
          'NA',
          'NA',
          'NA',
          'C',
          'T',
          'Y',
          'C/T',
          'NN',
        ),
        tsv(
          'h3',
          'C/G',
          'Gm13',
          '300',
          '+',
          'NA',
          'NA',
          'NA',
          'NA',
          'NA',
          'NA',
          'S',
          'G',
          '',
          '--',
          '-',
        ),
        tsv(
          'h4',
          'A/T',
          'Gm13',
          '400',
          '+',
          'NA',
          'NA',
          'NA',
          'NA',
          'NA',
          'NA',
          'W',
          'AA',
          'TT',
          'TA',
          'A',
        ),
        tsv(
          'h5',
          'G/T',
          'Gm13',
          '500',
          '+',
          'NA',
          'NA',
          'NA',
          'NA',
          'NA',
          'NA',
          'K',
          'G',
          'T',
          'G/T',
          'GT',
        ),
        tsv(
          'h6',
          'A/C',
          'Gm13',
          '600',
          '+',
          'NA',
          'NA',
          'NA',
          'NA',
          'NA',
          'NA',
          'M',
          'CC',
          'A/C',
          'CA',
          'N',
        ),
      ),
      'samples.csv': lines(
        'sample_id,line_name,role,generation,family_id,notes',
        'RP,Recurrent,recurrent_parent,,,',
        'DONOR,Donor,donor_parent,,,',
        'L1,Line 1,candidate,,,',
        'L2,Line 2,candidate,,,',
        'L3,Line 3,progeny,,,',
      ),
    },
    expect: {
      contractVersion: VERSION,
      coded: false,
      chromosomeOrder: ['Gm13'],
      markers: [
        { id: 'h1', chrom: 'Gm13', posBp: 100, cm: null },
        { id: 'h2', chrom: 'Gm13', posBp: 200, cm: null },
        { id: 'h3', chrom: 'Gm13', posBp: 300, cm: null },
        { id: 'h4', chrom: 'Gm13', posBp: 400, cm: null },
        { id: 'h5', chrom: 'Gm13', posBp: 500, cm: null },
        { id: 'h6', chrom: 'Gm13', posBp: 600, cm: null },
      ],
      sampleIds: ['RP', 'DONOR', 'L1', 'L2', 'L3'],
      calls: {
        RP: [
          ['A', 'A'],
          ['C', 'C'],
          ['C', 'G'],
          ['A', 'T'],
          ['G', 'T'],
          ['A', 'C'],
        ],
        DONOR: [
          ['G', 'G'],
          ['T', 'T'],
          ['G', 'G'],
          ['A', 'A'],
          ['G', 'G'],
          ['C', 'C'],
        ],
        L1: [['A', 'G'], ['C', 'T'], null, ['T', 'T'], ['T', 'T'], ['A', 'C']],
        L2: [['A', 'G'], ['C', 'T'], null, ['A', 'T'], ['G', 'T'], ['A', 'C']],
        L3: [null, null, null, ['A', 'A'], ['G', 'T'], null],
      },
    },
  },
  {
    // Nucleotide vocabulary, comma delimited: A AA A/T A|T AT; empty N NA - ./. missing.
    name: 'wide-nucleotide-comma',
    files: {
      'genotypes.csv': lines(
        'marker_id,chrom,pos_bp,RP,DONOR,L1,L2,L3',
        'w1,Gm05,1000,A,G,A/G,AA,',
        'w2,Gm05,2000,CC,TT,C|T,N,CT',
        'w3,Gm05,3000,G,T,NA,GT,-',
        'w4,Gm05,4000,T,C,./.,TC,T',
      ),
      'samples.csv': lines(
        'sample_id,line_name,role,generation,family_id,notes',
        'RP,Recurrent,recurrent_parent,,,',
        'DONOR,Donor,donor_parent,,,',
        'L1,Line 1,candidate,,,',
        'L2,Line 2,candidate,,,',
        'L3,Line 3,candidate,,,',
      ),
    },
    expect: {
      contractVersion: VERSION,
      coded: false,
      chromosomeOrder: ['Gm05'],
      markers: [
        { id: 'w1', chrom: 'Gm05', posBp: 1000, cm: null },
        { id: 'w2', chrom: 'Gm05', posBp: 2000, cm: null },
        { id: 'w3', chrom: 'Gm05', posBp: 3000, cm: null },
        { id: 'w4', chrom: 'Gm05', posBp: 4000, cm: null },
      ],
      sampleIds: ['RP', 'DONOR', 'L1', 'L2', 'L3'],
      calls: {
        RP: [
          ['A', 'A'],
          ['C', 'C'],
          ['G', 'G'],
          ['T', 'T'],
        ],
        DONOR: [
          ['G', 'G'],
          ['T', 'T'],
          ['T', 'T'],
          ['C', 'C'],
        ],
        L1: [['A', 'G'], ['C', 'T'], null, null],
        L2: [['A', 'A'], null, ['G', 'T'], ['C', 'T']],
        L3: [null, ['C', 'T'], null, ['T', 'T']],
      },
    },
  },
  {
    // A/B/H coding detected automatically; parents named in samples.csv, absent from the file.
    name: 'wide-coded-parents-absent',
    files: {
      'genotypes.csv': lines(
        'marker_id,chrom,pos_bp,BC_01,BC_02,BC_03',
        'c1,Gm13,1000,A,B,H',
        'c2,Gm13,2000,H,,A',
        'c3,Gm13,3000,N,A,B',
        'c4,Gm13,4000,B,NA,A',
      ),
      'samples.csv': lines(
        'sample_id,line_name,role,generation,family_id,notes',
        'RP_ABSENT,Recurrent,recurrent_parent,,,',
        'DONOR_ABSENT,Donor,donor_parent,,,',
        'BC_02,BC 02,progeny,BC2F1,F1,',
        'BC_01,BC 01,progeny,BC2F1,F1,',
        'BC_03,BC 03,candidate,BC2F1,F1,',
      ),
    },
    expect: {
      contractVersion: VERSION,
      coded: true,
      chromosomeOrder: ['Gm13'],
      markers: [
        { id: 'c1', chrom: 'Gm13', posBp: 1000, cm: null },
        { id: 'c2', chrom: 'Gm13', posBp: 2000, cm: null },
        { id: 'c3', chrom: 'Gm13', posBp: 3000, cm: null },
        { id: 'c4', chrom: 'Gm13', posBp: 4000, cm: null },
      ],
      sampleIds: ['BC_02', 'BC_01', 'BC_03'],
      calls: {
        BC_02: [['B', 'B'], null, ['A', 'A'], null],
        BC_01: [['A', 'A'], ['A', 'B'], null, ['B', 'B']],
        BC_03: [
          ['A', 'B'],
          ['A', 'A'],
          ['B', 'B'],
          ['A', 'A'],
        ],
      },
    },
  },
  {
    // Gm07 Gm7 chr07 Chr7 7 07 all normalise to Gm07; Gm2 and 20 to Gm02 and Gm20; a scaffold sorts last.
    name: 'chrom-spellings',
    files: {
      'genotypes.csv': lines(
        'marker_id,chrom,pos_bp,RP,DONOR,L1',
        's_scaf,scaffold_12,500,A,G,A',
        's_chr7,Chr7,4000,A,G,G',
        's_07,07,6000,A,G,A/G',
        's_gm2,Gm2,2000,C,T,C',
        's_gm07,Gm07,1000,A,G,A',
        's_20,20,100,C,T,T',
        's_chr07,chr07,3000,A,G,G',
        's_gm7,Gm7,2000,A,G,A',
        's_7,7,5000,A,G,G',
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    expect: {
      contractVersion: VERSION,
      coded: false,
      chromosomeOrder: ['Gm02', 'Gm07', 'Gm20', 'scaffold_12'],
      markers: [
        { id: 's_gm2', chrom: 'Gm02', posBp: 2000, cm: null },
        { id: 's_gm07', chrom: 'Gm07', posBp: 1000, cm: null },
        { id: 's_gm7', chrom: 'Gm07', posBp: 2000, cm: null },
        { id: 's_chr07', chrom: 'Gm07', posBp: 3000, cm: null },
        { id: 's_chr7', chrom: 'Gm07', posBp: 4000, cm: null },
        { id: 's_7', chrom: 'Gm07', posBp: 5000, cm: null },
        { id: 's_07', chrom: 'Gm07', posBp: 6000, cm: null },
        { id: 's_20', chrom: 'Gm20', posBp: 100, cm: null },
        { id: 's_scaf', chrom: 'scaffold_12', posBp: 500, cm: null },
      ],
      sampleIds: ['RP', 'DONOR', 'L1'],
      calls: {
        RP: [
          ['C', 'C'],
          ['A', 'A'],
          ['A', 'A'],
          ['A', 'A'],
          ['A', 'A'],
          ['A', 'A'],
          ['A', 'A'],
          ['C', 'C'],
          ['A', 'A'],
        ],
        DONOR: [
          ['T', 'T'],
          ['G', 'G'],
          ['G', 'G'],
          ['G', 'G'],
          ['G', 'G'],
          ['G', 'G'],
          ['G', 'G'],
          ['T', 'T'],
          ['G', 'G'],
        ],
        L1: [
          ['C', 'C'],
          ['A', 'A'],
          ['A', 'A'],
          ['G', 'G'],
          ['G', 'G'],
          ['G', 'G'],
          ['A', 'G'],
          ['T', 'T'],
          ['A', 'A'],
        ],
      },
    },
  },
  {
    // Case-insensitive headers, empty line_name, optional columns omitted, a genotype column
    // absent from the manifest dropped, samples in manifest order rather than file order.
    name: 'samples-manifest-defaults',
    files: {
      'genotypes.csv': lines(
        'marker_id,chrom,pos_bp,EXTRA,L2,RP,L1,DONOR',
        'd1,Gm01,100,A,A,A,A/G,G',
        'd2,Gm01,200,T,C/T,C,CC,T',
      ),
      'samples.csv': lines(
        'SAMPLE_ID,Line_Name,Role',
        'DONOR,,donor_parent',
        'L1,,progeny',
        'RP,,recurrent_parent',
        'L2,Line two,candidate',
      ),
    },
    expect: {
      contractVersion: VERSION,
      coded: false,
      chromosomeOrder: ['Gm01'],
      markers: [
        { id: 'd1', chrom: 'Gm01', posBp: 100, cm: null },
        { id: 'd2', chrom: 'Gm01', posBp: 200, cm: null },
      ],
      sampleIds: ['DONOR', 'L1', 'RP', 'L2'],
      calls: {
        DONOR: [
          ['G', 'G'],
          ['T', 'T'],
        ],
        L1: [
          ['A', 'G'],
          ['C', 'C'],
        ],
        RP: [
          ['A', 'A'],
          ['C', 'C'],
        ],
        L2: [
          ['A', 'A'],
          ['C', 'T'],
        ],
      },
    },
  },
  {
    // markers.csv moves k2 past k3 and gives cM to three markers; k4, absent from the map,
    // keeps its genotype-file position and has no cM.
    name: 'markers-override-partial-cm',
    files: {
      'genotypes.csv': lines(
        'marker_id,chrom,pos_bp,RP,DONOR,L1',
        'k1,Gm03,1000,A,G,A',
        'k2,Gm03,2000,C,T,T',
        'k3,Gm03,3000,G,A,G/A',
        'k4,Gm03,4000,T,C,C',
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
      'markers.csv': lines(
        'marker_id,chrom,pos_bp,cm',
        'k1,Gm03,1000,0.5',
        'k2,Gm03,3500,2.25',
        'k3,Gm03,3000,1.75',
      ),
    },
    expect: {
      contractVersion: VERSION,
      coded: false,
      chromosomeOrder: ['Gm03'],
      markers: [
        { id: 'k1', chrom: 'Gm03', posBp: 1000, cm: 0.5 },
        { id: 'k3', chrom: 'Gm03', posBp: 3000, cm: 1.75 },
        { id: 'k2', chrom: 'Gm03', posBp: 3500, cm: 2.25 },
        { id: 'k4', chrom: 'Gm03', posBp: 4000, cm: null },
      ],
      sampleIds: ['RP', 'DONOR', 'L1'],
      calls: {
        RP: [
          ['A', 'A'],
          ['G', 'G'],
          ['C', 'C'],
          ['T', 'T'],
        ],
        DONOR: [
          ['G', 'G'],
          ['A', 'A'],
          ['T', 'T'],
          ['C', 'C'],
        ],
        L1: [
          ['A', 'A'],
          ['A', 'G'],
          ['T', 'T'],
          ['C', 'C'],
        ],
      },
    },
  },
  {
    name: 'err-two-recurrent-parents',
    files: {
      'genotypes.csv': WIDE_SIMPLE,
      'samples.csv': lines(
        'sample_id,line_name,role',
        'RP,,recurrent_parent',
        'DONOR,,recurrent_parent',
        'L1,,candidate',
      ),
    },
    error: 'manifest.roles',
  },
  {
    name: 'err-unknown-role',
    files: {
      'genotypes.csv': WIDE_SIMPLE,
      'samples.csv': lines(
        'sample_id,line_name,role',
        'RP,,recurrent_parent',
        'DONOR,,donor_parent',
        'L1,,parent',
      ),
    },
    error: 'manifest.unknown_role',
  },
  {
    name: 'err-sample-missing',
    files: {
      'genotypes.csv': WIDE_SIMPLE,
      'samples.csv': lines(
        'sample_id,line_name,role',
        'RP,,recurrent_parent',
        'DONOR,,donor_parent',
        'L1,,candidate',
        'GHOST,,candidate',
      ),
    },
    error: 'dataset.sample_missing',
  },
  {
    name: 'err-duplicate-marker',
    files: {
      'genotypes.csv': lines(
        'marker_id,chrom,pos_bp,RP,DONOR,L1',
        'e1,Gm04,1000,A,G,A/G',
        'e1,Gm04,2000,C,T,C',
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    error: 'genotypes.duplicate_marker',
  },
  {
    // Tab-delimited .tsv with a UTF-8 BOM and CRLF line ends; the four missing tokens new in
    // 1.1.0 (.|. NN -- .) plus an empty cell; samples.csv tab-delimited, CRLF, BOM, no line_name.
    name: 'wide-nucleotide-tab-crlf-bom',
    files: {
      'genotypes.tsv': bom(
        crlf(
          tsv('marker_id', 'chrom', 'pos_bp', 'RP', 'DONOR', 'L1', 'L2'),
          tsv('t1', 'Gm09', '1000', 'A', 'G', '.|.', 'AG'),
          tsv('t2', 'Gm09', '2000', 'C', 'T', 'NN', '.'),
          tsv('t3', 'Gm09', '3000', 'G', 'T', '--', 'G/T'),
          tsv('t4', 'Gm09', '4000', 'T', 'C', '', 'T'),
        ),
      ),
      'samples.csv': bom(
        crlf(
          tsv('sample_id', 'role', 'family_id'),
          tsv('RP', 'recurrent_parent', ''),
          tsv('DONOR', 'donor_parent', ''),
          tsv('L1', 'candidate', 'FAM1'),
          tsv('L2', 'progeny', 'FAM1'),
        ),
      ),
    },
    expect: {
      contractVersion: VERSION,
      coded: false,
      chromosomeOrder: ['Gm09'],
      markers: [
        { id: 't1', chrom: 'Gm09', posBp: 1000, cm: null },
        { id: 't2', chrom: 'Gm09', posBp: 2000, cm: null },
        { id: 't3', chrom: 'Gm09', posBp: 3000, cm: null },
        { id: 't4', chrom: 'Gm09', posBp: 4000, cm: null },
      ],
      sampleIds: ['RP', 'DONOR', 'L1', 'L2'],
      calls: {
        RP: [
          ['A', 'A'],
          ['C', 'C'],
          ['G', 'G'],
          ['T', 'T'],
        ],
        DONOR: [
          ['G', 'G'],
          ['T', 'T'],
          ['T', 'T'],
          ['C', 'C'],
        ],
        L1: [null, null, null, null],
        L2: [['A', 'G'], null, ['G', 'T'], ['T', 'T']],
      },
    },
  },
  {
    // RFC 4180 quoting: quoted header cell, quoted marker id and calls, embedded commas and
    // doubled quotes in samples.csv.
    name: 'samples-quoted-fields',
    files: {
      'genotypes.csv': lines(
        'marker_id,chrom,pos_bp,RP,DONOR,"L1"',
        '"q1",Gm11,1000,A,G,"A/G"',
        'q2,Gm11,2000,C,T,"C"',
      ),
      'samples.csv': lines(
        'sample_id,line_name,role,notes',
        'RP,"Williams, 82",recurrent_parent,"say ""hi"""',
        'DONOR,Donor,donor_parent,',
        '"L1","Line, one",candidate,"a, b"',
      ),
    },
    expect: {
      contractVersion: VERSION,
      coded: false,
      chromosomeOrder: ['Gm11'],
      markers: [
        { id: 'q1', chrom: 'Gm11', posBp: 1000, cm: null },
        { id: 'q2', chrom: 'Gm11', posBp: 2000, cm: null },
      ],
      sampleIds: ['RP', 'DONOR', 'L1'],
      calls: {
        RP: [
          ['A', 'A'],
          ['C', 'C'],
        ],
        DONOR: [
          ['G', 'G'],
          ['T', 'T'],
        ],
        L1: [
          ['A', 'G'],
          ['C', 'C'],
        ],
      },
    },
  },
  {
    // ID `.` takes CHROM as written (chr13_..., 13_...), not the normalised Gm13; CRLF line ends.
    name: 'vcf-id-dot-crlf',
    files: {
      'genotypes.vcf': crlf(
        '##fileformat=VCFv4.2',
        tsv(VCF_HEADER, 'RP', 'DONOR', 'L1'),
        tsv('chr13', '19000000', '.', 'C', 'T', '.', 'PASS', '.', 'GT', '0/0', '1/1', '1/1'),
        tsv('13', '21000000', '.', 'G', 'A', '.', 'PASS', '.', 'GT', '0/0', '1/1', '0/1'),
        tsv('Gm13', '23000000', 'v3', 'A', 'G', '.', 'PASS', '.', 'GT', '0/0', '1/1', '0/0'),
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    expect: {
      contractVersion: VERSION,
      coded: false,
      chromosomeOrder: ['Gm13'],
      markers: [
        { id: 'chr13_19000000', chrom: 'Gm13', posBp: 19000000, cm: null },
        { id: '13_21000000', chrom: 'Gm13', posBp: 21000000, cm: null },
        { id: 'v3', chrom: 'Gm13', posBp: 23000000, cm: null },
      ],
      sampleIds: ['RP', 'DONOR', 'L1'],
      calls: {
        RP: [
          ['C', 'C'],
          ['G', 'G'],
          ['A', 'A'],
        ],
        DONOR: [
          ['T', 'T'],
          ['A', 'A'],
          ['G', 'G'],
        ],
        L1: [
          ['T', 'T'],
          ['A', 'G'],
          ['A', 'A'],
        ],
      },
    },
  },
  {
    // Chromosome_07, LG7, Gm-7 and "gm 7" normalise to Gm07; ch7 does not; non-soybean names
    // sort after Gm20 in natural order (ch7, scaffold_2, scaffold_10), then by position.
    name: 'chrom-natural-order',
    files: {
      'genotypes.csv': lines(
        'marker_id,chrom,pos_bp,RP,DONOR,L1',
        'n_s10,scaffold_10,100,A,G,A',
        'n_lg,LG7,300,A,G,A/G',
        'n_s2,scaffold_2,100,C,T,T',
        'n_chromo,Chromosome_07,100,C,T,C',
        'n_ch,ch7,100,A,G,G',
        'n_space,gm 7,400,G,T,G',
        'n_dash,Gm-7,200,A,C,C',
        'n_s2b,scaffold_2,50,A,G,A',
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    expect: {
      contractVersion: VERSION,
      coded: false,
      chromosomeOrder: ['Gm07', 'ch7', 'scaffold_2', 'scaffold_10'],
      markers: [
        { id: 'n_chromo', chrom: 'Gm07', posBp: 100, cm: null },
        { id: 'n_dash', chrom: 'Gm07', posBp: 200, cm: null },
        { id: 'n_lg', chrom: 'Gm07', posBp: 300, cm: null },
        { id: 'n_space', chrom: 'Gm07', posBp: 400, cm: null },
        { id: 'n_ch', chrom: 'ch7', posBp: 100, cm: null },
        { id: 'n_s2b', chrom: 'scaffold_2', posBp: 50, cm: null },
        { id: 'n_s2', chrom: 'scaffold_2', posBp: 100, cm: null },
        { id: 'n_s10', chrom: 'scaffold_10', posBp: 100, cm: null },
      ],
      sampleIds: ['RP', 'DONOR', 'L1'],
      calls: {
        RP: [
          ['C', 'C'],
          ['A', 'A'],
          ['A', 'A'],
          ['G', 'G'],
          ['A', 'A'],
          ['A', 'A'],
          ['C', 'C'],
          ['A', 'A'],
        ],
        DONOR: [
          ['T', 'T'],
          ['C', 'C'],
          ['G', 'G'],
          ['T', 'T'],
          ['G', 'G'],
          ['G', 'G'],
          ['T', 'T'],
          ['G', 'G'],
        ],
        L1: [
          ['C', 'C'],
          ['C', 'C'],
          ['A', 'G'],
          ['G', 'G'],
          ['G', 'G'],
          ['A', 'A'],
          ['T', 'T'],
          ['A', 'A'],
        ],
      },
    },
  },
  {
    // The eleven HapMap missing tokens of 1.1.0: N NN - -- empty (1.0.0) and NA ./. . .|. X XX
    // (added); every other cell is a plain call so the case proves only the token list.
    name: 'hapmap-missing-na-dot',
    files: {
      'genotypes.hmp.txt': lines(
        tsv(HAPMAP_HEADER, 'RP', 'DONOR', 'L1', 'L2'),
        tsv('p1', 'A/G', 'Gm02', '100', ...HAPMAP_FIXED, 'AA', 'GG', 'NA', './.'),
        tsv('p2', 'C/T', 'Gm02', '200', ...HAPMAP_FIXED, 'CC', 'TT', '.', 'CT'),
        tsv('p3', 'A/T', 'Gm02', '300', ...HAPMAP_FIXED, 'N', 'NN', '-', '--'),
        tsv('p4', 'G/T', 'Gm02', '400', ...HAPMAP_FIXED, 'G', 'T', '', 'GT'),
        tsv('p5', 'A/C', 'Gm02', '500', ...HAPMAP_FIXED, 'X', 'XX', '.|.', 'AC'),
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1_L2,
    },
    expect: {
      contractVersion: VERSION,
      coded: false,
      chromosomeOrder: ['Gm02'],
      markers: [
        { id: 'p1', chrom: 'Gm02', posBp: 100, cm: null },
        { id: 'p2', chrom: 'Gm02', posBp: 200, cm: null },
        { id: 'p3', chrom: 'Gm02', posBp: 300, cm: null },
        { id: 'p4', chrom: 'Gm02', posBp: 400, cm: null },
        { id: 'p5', chrom: 'Gm02', posBp: 500, cm: null },
      ],
      sampleIds: ['RP', 'DONOR', 'L1', 'L2'],
      calls: {
        RP: [['A', 'A'], ['C', 'C'], null, ['G', 'G'], null],
        DONOR: [['G', 'G'], ['T', 'T'], null, ['T', 'T'], null],
        L1: [null, null, null, null, null],
        L2: [null, ['C', 'T'], null, ['G', 'T'], ['A', 'C']],
      },
    },
  },
  {
    // R Y S W K M in nucleotide wide CSV read as their two nucleotides, as in HapMap.
    name: 'wide-nucleotide-iupac',
    files: {
      'genotypes.csv': lines(
        'marker_id,chrom,pos_bp,RP,DONOR,L1,L2',
        'i1,Gm15,100,A,G,R,A/G',
        'i2,Gm15,200,C,T,Y,C',
        'i3,Gm15,300,C,G,S,G|C',
        'i4,Gm15,400,A,T,W,T',
        'i5,Gm15,500,G,T,K,GT',
        'i6,Gm15,600,A,C,M,N',
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1_L2,
    },
    expect: {
      contractVersion: VERSION,
      coded: false,
      chromosomeOrder: ['Gm15'],
      markers: [
        { id: 'i1', chrom: 'Gm15', posBp: 100, cm: null },
        { id: 'i2', chrom: 'Gm15', posBp: 200, cm: null },
        { id: 'i3', chrom: 'Gm15', posBp: 300, cm: null },
        { id: 'i4', chrom: 'Gm15', posBp: 400, cm: null },
        { id: 'i5', chrom: 'Gm15', posBp: 500, cm: null },
        { id: 'i6', chrom: 'Gm15', posBp: 600, cm: null },
      ],
      sampleIds: ['RP', 'DONOR', 'L1', 'L2'],
      calls: {
        RP: [
          ['A', 'A'],
          ['C', 'C'],
          ['C', 'C'],
          ['A', 'A'],
          ['G', 'G'],
          ['A', 'A'],
        ],
        DONOR: [
          ['G', 'G'],
          ['T', 'T'],
          ['G', 'G'],
          ['T', 'T'],
          ['T', 'T'],
          ['C', 'C'],
        ],
        L1: [
          ['A', 'G'],
          ['C', 'T'],
          ['C', 'G'],
          ['A', 'T'],
          ['G', 'T'],
          ['A', 'C'],
        ],
        L2: [['A', 'G'], ['C', 'C'], ['C', 'G'], ['T', 'T'], ['G', 'T'], null],
      },
    },
  },
  {
    // Detected as coded (A, B, H; `--` is skipped by detection as a nucleotide missing token),
    // then `--` is rejected because it is not a coded missing token.
    name: 'err-coded-unknown-cell',
    files: {
      'genotypes.csv': lines(
        'marker_id,chrom,pos_bp,BC_01,BC_02',
        'c1,Gm13,1000,A,B',
        'c2,Gm13,2000,H,--',
      ),
      'samples.csv': lines(
        'sample_id,line_name,role',
        'RP_ABSENT,,recurrent_parent',
        'DONOR_ABSENT,,donor_parent',
        'BC_01,,progeny',
        'BC_02,,progeny',
      ),
    },
    error: 'genotypes.unknown_cell',
  },
  {
    // `?` is neither a call nor a missing token in nucleotide wide CSV.
    name: 'err-nucleotide-unknown-cell',
    files: {
      'genotypes.csv': lines('marker_id,chrom,pos_bp,RP,DONOR,L1', 'u1,Gm02,1000,A,G,?'),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    error: 'genotypes.unknown_cell',
  },
  {
    // The T makes the file nucleotide, so a single H is a stray coded letter, not a call.
    name: 'err-nucleotide-single-h',
    files: {
      'genotypes.csv': lines('marker_id,chrom,pos_bp,RP,DONOR,L1', 'u1,Gm02,1000,A,T,H'),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    error: 'genotypes.unknown_cell',
  },
  {
    // `0` is not a call (TASSEL's `0` is rejected in both formats).
    name: 'err-nucleotide-zero',
    files: {
      'genotypes.csv': lines('marker_id,chrom,pos_bp,RP,DONOR,L1', 'u1,Gm02,1000,A,T,0'),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    error: 'genotypes.unknown_cell',
  },
  {
    // A two-character cell with a non-nucleotide is an error, not half-missing.
    name: 'err-nucleotide-pair-stray',
    files: {
      'genotypes.csv': lines('marker_id,chrom,pos_bp,RP,DONOR,L1', 'u1,Gm02,1000,A,T,A?'),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    error: 'genotypes.unknown_cell',
  },
  {
    // XX is missing in HapMap only; in wide CSV it is an error.
    name: 'err-nucleotide-xx',
    files: {
      'genotypes.csv': lines('marker_id,chrom,pos_bp,RP,DONOR,L1', 'u1,Gm02,1000,A,T,XX'),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    error: 'genotypes.unknown_cell',
  },
  {
    // `?` in a HapMap cell.
    name: 'err-hapmap-unknown-cell',
    files: {
      'genotypes.hmp.txt': lines(
        tsv(HAPMAP_HEADER, 'RP', 'DONOR', 'L1'),
        tsv('e1', 'A/G', 'Gm02', '100', ...HAPMAP_FIXED, 'AA', 'GG', '?'),
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    error: 'genotypes.unknown_cell',
  },
  {
    // `+` in a HapMap cell (TASSEL's insertion symbol) is rejected.
    name: 'err-hapmap-plus',
    files: {
      'genotypes.hmp.txt': lines(
        tsv(HAPMAP_HEADER, 'RP', 'DONOR', 'L1'),
        tsv('e1', 'A/G', 'Gm02', '100', ...HAPMAP_FIXED, 'AA', 'GG', '+'),
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    error: 'genotypes.unknown_cell',
  },
  {
    // A single B (not a nucleotide, not an IUPAC code) in a HapMap cell is rejected.
    name: 'err-hapmap-single-b',
    files: {
      'genotypes.hmp.txt': lines(
        tsv(HAPMAP_HEADER, 'RP', 'DONOR', 'L1'),
        tsv('e1', 'A/G', 'Gm02', '100', ...HAPMAP_FIXED, 'AA', 'GG', 'B'),
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    error: 'genotypes.unknown_cell',
  },
  {
    // Whole-valued positions written as a float, in exponent notation or with a leading `+`
    // are the integer, in the genotype file and in markers.csv (contract 1.2.0). No override:
    // every markers.csv position equals the genotype-file one, so only cm is added.
    name: 'wide-position-whole-float',
    files: {
      'genotypes.csv': lines(
        'marker_id,chrom,pos_bp,RP,DONOR,L1',
        'f1,Gm06,1000.0,A,G,A',
        'f2,Gm06,2e3,C,T,C/T',
        'f3,Gm06,3.0E3,G,A,A',
        'f4,Gm06,+4000,T,C,T',
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
      'markers.csv': lines(
        'marker_id,chrom,pos_bp,cm',
        'f1,Gm06,1000,0.5',
        'f2,Gm06,2000.0,1.25',
        'f3,Gm06,3e3,2.5',
        'f4,Gm06,4.0E3,3.75',
      ),
    },
    expect: {
      contractVersion: VERSION,
      coded: false,
      chromosomeOrder: ['Gm06'],
      markers: [
        { id: 'f1', chrom: 'Gm06', posBp: 1000, cm: 0.5 },
        { id: 'f2', chrom: 'Gm06', posBp: 2000, cm: 1.25 },
        { id: 'f3', chrom: 'Gm06', posBp: 3000, cm: 2.5 },
        { id: 'f4', chrom: 'Gm06', posBp: 4000, cm: 3.75 },
      ],
      sampleIds: ['RP', 'DONOR', 'L1'],
      calls: {
        RP: [
          ['A', 'A'],
          ['C', 'C'],
          ['G', 'G'],
          ['T', 'T'],
        ],
        DONOR: [
          ['G', 'G'],
          ['T', 'T'],
          ['A', 'A'],
          ['C', 'C'],
        ],
        L1: [
          ['A', 'A'],
          ['C', 'T'],
          ['A', 'A'],
          ['T', 'T'],
        ],
      },
    },
  },
  {
    // HapMap `pos` written as 1e3 and 2000.0 is 1000 and 2000.
    name: 'hapmap-position-whole-float',
    files: {
      'genotypes.hmp.txt': lines(
        tsv(HAPMAP_HEADER, 'RP', 'DONOR', 'L1'),
        tsv('g1', 'A/G', 'Gm06', '1e3', ...HAPMAP_FIXED, 'AA', 'GG', 'AG'),
        tsv('g2', 'C/T', 'Gm06', '2000.0', ...HAPMAP_FIXED, 'CC', 'TT', 'TT'),
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    expect: {
      contractVersion: VERSION,
      coded: false,
      chromosomeOrder: ['Gm06'],
      markers: [
        { id: 'g1', chrom: 'Gm06', posBp: 1000, cm: null },
        { id: 'g2', chrom: 'Gm06', posBp: 2000, cm: null },
      ],
      sampleIds: ['RP', 'DONOR', 'L1'],
      calls: {
        RP: [
          ['A', 'A'],
          ['C', 'C'],
        ],
        DONOR: [
          ['G', 'G'],
          ['T', 'T'],
        ],
        L1: [
          ['A', 'G'],
          ['T', 'T'],
        ],
      },
    },
  },
  {
    // A VCF record with ID `.` is named from the parsed POS, as bcftools `%CHROM\_%POS` does:
    // POS written 01000 gives the id Gm06_1000.
    name: 'vcf-position-digits-id',
    files: {
      'genotypes.vcf': lines(
        '##fileformat=VCFv4.2',
        tsv(VCF_HEADER, 'RP', 'DONOR', 'L1'),
        tsv('Gm06', '01000', '.', 'A', 'G', '.', 'PASS', '.', 'GT', '0/0', '1/1', '0/1'),
        tsv('Gm06', '2000', 'x2', 'C', 'T', '.', 'PASS', '.', 'GT', '0/0', '1/1', '1/1'),
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    expect: {
      contractVersion: VERSION,
      coded: false,
      chromosomeOrder: ['Gm06'],
      markers: [
        { id: 'Gm06_1000', chrom: 'Gm06', posBp: 1000, cm: null },
        { id: 'x2', chrom: 'Gm06', posBp: 2000, cm: null },
      ],
      sampleIds: ['RP', 'DONOR', 'L1'],
      calls: {
        RP: [
          ['A', 'A'],
          ['C', 'C'],
        ],
        DONOR: [
          ['G', 'G'],
          ['T', 'T'],
        ],
        L1: [
          ['A', 'G'],
          ['T', 'T'],
        ],
      },
    },
  },
  {
    // VCF POS is an Integer: `1e3` is rejected even though HapMap and CSV accept it.
    name: 'err-vcf-position-float',
    files: {
      'genotypes.vcf': lines(
        '##fileformat=VCFv4.2',
        tsv(VCF_HEADER, 'RP', 'DONOR', 'L1'),
        tsv('Gm06', '1e3', 'x1', 'A', 'G', '.', 'PASS', '.', 'GT', '0/0', '1/1', '0/1'),
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    error: 'genotypes.invalid_position',
  },
  {
    // A position with a non-zero fraction is an error naming the line and the value.
    name: 'err-position-fraction',
    files: {
      'genotypes.csv': lines(
        'marker_id,chrom,pos_bp,RP,DONOR,L1',
        'u1,Gm02,1000,A,G,A',
        'u2,Gm02,100.7,A,G,G',
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    error: 'genotypes.invalid_position',
  },
  {
    // A row whose every cell is empty (`,,,,,`) is skipped; the two real rows load.
    name: 'wide-empty-row-skipped',
    files: {
      'genotypes.csv': lines(
        'marker_id,chrom,pos_bp,RP,DONOR,L1',
        'r1,Gm02,1000,A,G,A',
        ',,,,,',
        'r2,Gm02,2000,C,T,T',
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    expect: {
      contractVersion: VERSION,
      coded: false,
      chromosomeOrder: ['Gm02'],
      markers: [
        { id: 'r1', chrom: 'Gm02', posBp: 1000, cm: null },
        { id: 'r2', chrom: 'Gm02', posBp: 2000, cm: null },
      ],
      sampleIds: ['RP', 'DONOR', 'L1'],
      calls: {
        RP: [
          ['A', 'A'],
          ['C', 'C'],
        ],
        DONOR: [
          ['G', 'G'],
          ['T', 'T'],
        ],
        L1: [
          ['A', 'A'],
          ['T', 'T'],
        ],
      },
    },
  },
  // ---- contract 1.3.0: lines and rows (docs/adr/0018) ----
  {
    // Empty, space-only and tab-only lines before, inside and after the VCF header are skipped.
    name: 'vcf-blank-lines-skipped',
    files: {
      'genotypes.vcf': lines(
        '',
        '##fileformat=VCFv4.2',
        '   ',
        '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tRP\tDONOR\tL1',
        'Gm02\t1000\tr1\tA\tG\t.\t.\t.\tGT\t0/0\t1/1\t0/0',
        '\t\t',
        'Gm02\t2000\tr2\tC\tT\t.\t.\t.\tGT\t0/0\t1/1\t1/1',
        ' ',
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    expect: R1_R2_EXPECT,
  },
  {
    // A space-only line before the rs# header and blank lines in the body are skipped.
    name: 'hapmap-blank-lines-skipped',
    files: {
      'genotypes.hmp.txt': lines(
        '  ',
        tsv(
          'rs#',
          'alleles',
          'chrom',
          'pos',
          'strand',
          'assembly#',
          'center',
          'protLSID',
          'assayLSID',
          'panelLSID',
          'QCcode',
          'RP',
          'DONOR',
          'L1',
        ),
        tsv('r1', 'A/G', 'Gm02', '1000', '+', 'NA', 'NA', 'NA', 'NA', 'NA', 'NA', 'AA', 'GG', 'AA'),
        '\t\t\t\t\t\t\t\t\t\t\t\t\t',
        '',
        tsv('r2', 'C/T', 'Gm02', '2000', '+', 'NA', 'NA', 'NA', 'NA', 'NA', 'NA', 'CC', 'TT', 'TT'),
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    expect: R1_R2_EXPECT,
  },
  {
    // A space-only line before the header: the delimiter is sniffed from the header.
    name: 'wide-blank-lines-skipped',
    files: {
      'genotypes.csv': lines(
        '   ',
        'marker_id,chrom,pos_bp,RP,DONOR,L1',
        'r1,Gm02,1000,A,G,A',
        '  ',
        'r2,Gm02,2000,C,T,T',
        '',
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    expect: R1_R2_EXPECT,
  },
  {
    // Tab-delimited with a space-only first line: a sniff that read line 1 would choose `,`.
    name: 'wide-tab-blank-line-before-header',
    files: {
      'genotypes.csv': lines(
        '   ',
        tsv('marker_id', 'chrom', 'pos_bp', 'RP', 'DONOR', 'L1'),
        tsv('r1', 'Gm02', '1000', 'A', 'G', 'A'),
        '  ',
        tsv('r2', 'Gm02', '2000', 'C', 'T', 'T'),
        '',
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    expect: R1_R2_EXPECT,
  },
  {
    // samples.csv: an empty line before the header, an all-empty row and a space-only line are skipped.
    name: 'samples-blank-rows-skipped',
    files: {
      'genotypes.csv': lines(
        'marker_id,chrom,pos_bp,RP,DONOR,L1',
        'r1,Gm02,1000,A,G,A',
        'r2,Gm02,2000,C,T,T',
      ),
      'samples.csv': lines(
        '',
        'sample_id,line_name,role,generation,family_id,notes',
        'RP,,recurrent_parent,,,',
        ',,,,,',
        'DONOR,,donor_parent,,,',
        '   ',
        'L1,,candidate,,,',
      ),
    },
    expect: R1_R2_EXPECT,
  },
  {
    // markers.csv: an all-empty row and a space-only line are skipped; the map still applies.
    name: 'markers-blank-rows-skipped',
    files: {
      'genotypes.csv': lines(
        'marker_id,chrom,pos_bp,RP,DONOR,L1',
        'r1,Gm02,1000,A,G,A',
        'r2,Gm02,2000,C,T,T',
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
      'markers.csv': lines(
        'marker_id,chrom,pos_bp,cm',
        ',,,',
        'r1,Gm02,1500,1.5',
        '   ',
        'r2,Gm02,2000,2.5',
      ),
    },
    expect: {
      contractVersion: VERSION,
      coded: false,
      chromosomeOrder: ['Gm02'],
      markers: [
        { id: 'r1', chrom: 'Gm02', posBp: 1500, cm: 1.5 },
        { id: 'r2', chrom: 'Gm02', posBp: 2000, cm: 2.5 },
      ],
      sampleIds: ['RP', 'DONOR', 'L1'],
      calls: {
        RP: [
          ['A', 'A'],
          ['C', 'C'],
        ],
        DONOR: [
          ['G', 'G'],
          ['T', 'T'],
        ],
        L1: [
          ['A', 'A'],
          ['T', 'T'],
        ],
      },
    },
  },
  {
    // `#` is not a comment marker: a wide-CSV row beginning with `#` is a marker named `#r2`.
    name: 'wide-hash-row-is-data',
    files: {
      'genotypes.csv': lines(
        'marker_id,chrom,pos_bp,RP,DONOR,L1',
        'r1,Gm02,1000,A,G,A',
        '#r2,Gm02,2000,C,T,T',
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    expect: {
      contractVersion: VERSION,
      coded: false,
      chromosomeOrder: ['Gm02'],
      markers: [
        { id: 'r1', chrom: 'Gm02', posBp: 1000, cm: null },
        { id: '#r2', chrom: 'Gm02', posBp: 2000, cm: null },
      ],
      sampleIds: ['RP', 'DONOR', 'L1'],
      calls: {
        RP: [
          ['A', 'A'],
          ['C', 'C'],
        ],
        DONOR: [
          ['G', 'G'],
          ['T', 'T'],
        ],
        L1: [
          ['A', 'A'],
          ['T', 'T'],
        ],
      },
    },
  },
  {
    // A quoted notes field holding a line break is one row (RFC 4180 section 2, rule 6).
    name: 'samples-quoted-newline',
    files: {
      'genotypes.csv': lines(
        'marker_id,chrom,pos_bp,RP,DONOR,L1',
        'r1,Gm02,1000,A,G,A',
        'r2,Gm02,2000,C,T,T',
      ),
      'samples.csv':
        'sample_id,line_name,role,generation,family_id,notes\nRP,,recurrent_parent,,,\nDONOR,,donor_parent,,,\nL1,"NIL 1",candidate,BC5F3,FAM1,"first line\nsecond line"\n',
    },
    expect: R1_R2_EXPECT,
  },
  {
    // A samples.csv row beginning with `#` is data: `#L1` names a sample with no genotype column.
    name: 'err-samples-hash-row',
    files: {
      'genotypes.csv': lines(
        'marker_id,chrom,pos_bp,RP,DONOR,L1',
        'r1,Gm02,1000,A,G,A',
        'r2,Gm02,2000,C,T,T',
      ),
      'samples.csv': lines(
        'sample_id,role',
        'RP,recurrent_parent',
        'DONOR,donor_parent',
        '#L1,candidate',
      ),
    },
    error: 'dataset.sample_missing',
  },
  {
    // HapMap has no comment lines: the first non-blank line must be the rs# header.
    name: 'err-hapmap-hash-before-header',
    files: {
      'genotypes.hmp.txt': lines(
        '# exported 2026-09-16',
        tsv(
          'rs#',
          'alleles',
          'chrom',
          'pos',
          'strand',
          'assembly#',
          'center',
          'protLSID',
          'assayLSID',
          'panelLSID',
          'QCcode',
          'RP',
          'DONOR',
          'L1',
        ),
        tsv('r1', 'A/G', 'Gm02', '1000', '+', 'NA', 'NA', 'NA', 'NA', 'NA', 'NA', 'AA', 'GG', 'AA'),
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    error: 'genotypes.no_header',
  },
  {
    // A `#` line after #CHROM is a data line with one field: the wrong field count.
    name: 'err-vcf-hash-line-after-header',
    files: {
      'genotypes.vcf': lines(
        '##fileformat=VCFv4.2',
        '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tRP\tDONOR\tL1',
        'Gm02\t1000\tr1\tA\tG\t.\t.\t.\tGT\t0/0\t1/1\t0/0',
        '# a note',
        'Gm02\t2000\tr2\tC\tT\t.\t.\t.\tGT\t0/0\t1/1\t1/1',
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    error: 'genotypes.repeated_header',
  },
  {
    // A `"` that is not at the start of a field is a literal character: `6" pot` does not open a quote.
    name: 'samples-midfield-quote-literal',
    files: {
      'genotypes.csv': lines(
        'marker_id,chrom,pos_bp,RP,DONOR,L1',
        'r1,Gm02,1000,A,G,A',
        'r2,Gm02,2000,C,T,T',
      ),
      'samples.csv': lines(
        'sample_id,line_name,role,generation,family_id,notes',
        'RP,,recurrent_parent,,,',
        'L1,6" pot,candidate,,,',
        'DONOR,,donor_parent,,,',
      ),
      'markers.csv': lines('marker_id,chrom,pos_bp,cm', 'r1,Gm02,1000,1.5', 'r2,Gm02,2000,2.5'),
    },
    expect: {
      contractVersion: VERSION,
      coded: false,
      chromosomeOrder: ['Gm02'],
      markers: [
        { id: 'r1', chrom: 'Gm02', posBp: 1000, cm: 1.5 },
        { id: 'r2', chrom: 'Gm02', posBp: 2000, cm: 2.5 },
      ],
      sampleIds: ['RP', 'L1', 'DONOR'],
      calls: {
        RP: [
          ['A', 'A'],
          ['C', 'C'],
        ],
        L1: [
          ['A', 'A'],
          ['T', 'T'],
        ],
        DONOR: [
          ['G', 'G'],
          ['T', 'T'],
        ],
      },
    },
  },
  {
    // A quote opened at the start of a field on line 3 and never closed is an error naming line 3.
    name: 'err-markers-unterminated-quote',
    files: {
      'genotypes.csv': lines(
        'marker_id,chrom,pos_bp,RP,DONOR,L1',
        'r1,Gm02,1000,A,G,A',
        'r2,Gm02,2000,C,T,T',
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
      'markers.csv': lines('marker_id,chrom,pos_bp,cm', 'r1,Gm02,1000,1.5', 'r2,Gm02,"2000,2.5'),
    },
    error: 'delimited.unterminated_quote',
  },
  {
    // A second #CHROM line after the header is an error, even with the right field count.
    name: 'err-vcf-second-header',
    files: {
      'genotypes.vcf': lines(
        '##fileformat=VCFv4.2',
        '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tRP\tDONOR\tL1',
        'Gm02\t1000\tr1\tA\tG\t.\t.\t.\tGT\t0/0\t1/1\t0/0',
        '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tRP\tDONOR\tL1',
        'Gm02\t2000\tr2\tC\tT\t.\t.\t.\tGT\t0/0\t1/1\t1/1',
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    error: 'genotypes.repeated_header',
  },
  {
    // A no-break space (U+00A0) is not a blank character: that line is the header, and it is not rs#.
    name: 'err-hapmap-nbsp-line-before-header',
    files: {
      'genotypes.hmp.txt': lines(
        String.fromCharCode(0xa0),
        tsv(
          'rs#',
          'alleles',
          'chrom',
          'pos',
          'strand',
          'assembly#',
          'center',
          'protLSID',
          'assayLSID',
          'panelLSID',
          'QCcode',
          'RP',
          'DONOR',
          'L1',
        ),
        tsv('r1', 'A/G', 'Gm02', '1000', '+', 'NA', 'NA', 'NA', 'NA', 'NA', 'NA', 'AA', 'GG', 'AA'),
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    error: 'genotypes.no_header',
  },
  {
    // A coded A/B/H file with a blank first line is still detected as coded: the header is not scanned as cells.
    name: 'wide-coded-blank-line-before-header',
    files: {
      'genotypes.csv': lines(
        '   ',
        'marker_id,chrom,pos_bp,RP,DONOR,L1',
        'r1,Gm02,1000,A,B,H',
        'r2,Gm02,2000,A,B,B',
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    expect: {
      contractVersion: VERSION,
      coded: true,
      chromosomeOrder: ['Gm02'],
      markers: [
        { id: 'r1', chrom: 'Gm02', posBp: 1000, cm: null },
        { id: 'r2', chrom: 'Gm02', posBp: 2000, cm: null },
      ],
      sampleIds: ['RP', 'DONOR', 'L1'],
      calls: {
        RP: [
          ['A', 'A'],
          ['A', 'A'],
        ],
        DONOR: [
          ['B', 'B'],
          ['B', 'B'],
        ],
        L1: [
          ['A', 'B'],
          ['B', 'B'],
        ],
      },
    },
  },
  {
    // H is the heterozygote of the row's two alleles; U is missing (contract 1.4.0).
    name: 'profile-soybase-report-wide',
    options: { profile: 'soybase-report' },
    files: {
      'genotypes.csv': lines(
        'marker_id,chrom,pos_bp,RP,DONOR,L1',
        'r1,Gm02,1000,A,G,H',
        'r2,Gm02,2000,C,T,U',
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    expect: {
      contractVersion: VERSION,
      coded: false,
      chromosomeOrder: ['Gm02'],
      markers: [
        { id: 'r1', chrom: 'Gm02', posBp: 1000, cm: null },
        { id: 'r2', chrom: 'Gm02', posBp: 2000, cm: null },
      ],
      sampleIds: ['RP', 'DONOR', 'L1'],
      calls: {
        RP: [
          ['A', 'A'],
          ['C', 'C'],
        ],
        DONOR: [
          ['G', 'G'],
          ['T', 'T'],
        ],
        L1: [['A', 'G'], null],
      },
    },
  },
  {
    // r3: both parents AA, so the alleles column supplies the second allele of H.
    name: 'profile-soybase-report-hapmap',
    options: { profile: 'soybase-report' },
    files: {
      'genotypes.hmp.txt': lines(
        tsv(HAPMAP_HEADER, 'RP', 'DONOR', 'L1'),
        tsv('r1', 'A/G', 'Gm02', '1000', ...HAPMAP_FIXED, 'AA', 'GG', 'H'),
        tsv('r2', 'C/T', 'Gm02', '2000', ...HAPMAP_FIXED, 'CC', 'TT', 'U'),
        tsv('r3', 'A/G', 'Gm02', '3000', ...HAPMAP_FIXED, 'AA', 'AA', 'H'),
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    expect: {
      contractVersion: VERSION,
      coded: false,
      chromosomeOrder: ['Gm02'],
      markers: [
        { id: 'r1', chrom: 'Gm02', posBp: 1000, cm: null },
        { id: 'r2', chrom: 'Gm02', posBp: 2000, cm: null },
        { id: 'r3', chrom: 'Gm02', posBp: 3000, cm: null },
      ],
      sampleIds: ['RP', 'DONOR', 'L1'],
      calls: {
        RP: [
          ['A', 'A'],
          ['C', 'C'],
          ['A', 'A'],
        ],
        DONOR: [
          ['G', 'G'],
          ['T', 'T'],
          ['A', 'A'],
        ],
        L1: [['A', 'G'], null, ['A', 'G']],
      },
    },
  },
  {
    // DArT 0/1/2/-: allele symbols 0 and 1; never tested for A/B/H coding.
    name: 'profile-dart-wide',
    options: { profile: 'dart' },
    files: {
      'genotypes.csv': lines(
        'marker_id,chrom,pos_bp,RP,DONOR,L1',
        'r1,Gm02,1000,0,1,2',
        'r2,Gm02,2000,0,1,-',
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    expect: {
      contractVersion: VERSION,
      coded: false,
      chromosomeOrder: ['Gm02'],
      markers: [
        { id: 'r1', chrom: 'Gm02', posBp: 1000, cm: null },
        { id: 'r2', chrom: 'Gm02', posBp: 2000, cm: null },
      ],
      sampleIds: ['RP', 'DONOR', 'L1'],
      calls: {
        RP: [
          ['0', '0'],
          ['0', '0'],
        ],
        DONOR: [
          ['1', '1'],
          ['1', '1'],
        ],
        L1: [['0', '1'], null],
      },
    },
  },
  {
    // Axiom AA/BB/AB and the numeric form 0/2 with NoCall.
    name: 'profile-axiom-wide',
    options: { profile: 'axiom' },
    files: {
      'genotypes.csv': lines(
        'marker_id,chrom,pos_bp,RP,DONOR,L1',
        'r1,Gm02,1000,AA,BB,AB',
        'r2,Gm02,2000,0,2,NoCall',
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    expect: {
      contractVersion: VERSION,
      coded: false,
      chromosomeOrder: ['Gm02'],
      markers: [
        { id: 'r1', chrom: 'Gm02', posBp: 1000, cm: null },
        { id: 'r2', chrom: 'Gm02', posBp: 2000, cm: null },
      ],
      sampleIds: ['RP', 'DONOR', 'L1'],
      calls: {
        RP: [
          ['A', 'A'],
          ['A', 'A'],
        ],
        DONOR: [
          ['B', 'B'],
          ['B', 'B'],
        ],
        L1: [['A', 'B'], null],
      },
    },
  },
  {
    // KASP SNPviewer X:X/Y:Y/X:Y with ? missing.
    name: 'profile-kasp-wide',
    options: { profile: 'kasp' },
    files: {
      'genotypes.csv': lines(
        'marker_id,chrom,pos_bp,RP,DONOR,L1',
        'r1,Gm02,1000,X:X,Y:Y,X:Y',
        'r2,Gm02,2000,X:X,Y:Y,?',
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    expect: {
      contractVersion: VERSION,
      coded: false,
      chromosomeOrder: ['Gm02'],
      markers: [
        { id: 'r1', chrom: 'Gm02', posBp: 1000, cm: null },
        { id: 'r2', chrom: 'Gm02', posBp: 2000, cm: null },
      ],
      sampleIds: ['RP', 'DONOR', 'L1'],
      calls: {
        RP: [
          ['X', 'X'],
          ['X', 'X'],
        ],
        DONOR: [
          ['Y', 'Y'],
          ['Y', 'Y'],
        ],
        L1: [['X', 'Y'], null],
      },
    },
  },
  {
    // X and XX are missing in a wide CSV under tassel (an error without it: err-nucleotide-xx).
    name: 'profile-tassel-wide',
    options: { profile: 'tassel' },
    files: {
      'genotypes.csv': lines(
        'marker_id,chrom,pos_bp,RP,DONOR,L1',
        'r1,Gm02,1000,A,G,X',
        'r2,Gm02,2000,C,T,XX',
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    expect: {
      contractVersion: VERSION,
      coded: false,
      chromosomeOrder: ['Gm02'],
      markers: [
        { id: 'r1', chrom: 'Gm02', posBp: 1000, cm: null },
        { id: 'r2', chrom: 'Gm02', posBp: 2000, cm: null },
      ],
      sampleIds: ['RP', 'DONOR', 'L1'],
      calls: {
        RP: [
          ['A', 'A'],
          ['C', 'C'],
        ],
        DONOR: [
          ['G', 'G'],
          ['T', 'T'],
        ],
        L1: [null, null],
      },
    },
  },
  {
    // H at a marker whose row shows one allele: the second allele is unknown.
    name: 'err-profile-ambiguous-het',
    options: { profile: 'soybase-report' },
    files: {
      'genotypes.csv': lines('marker_id,chrom,pos_bp,RP,DONOR,L1', 'r1,Gm02,1000,A,A,H'),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    error: 'genotypes.ambiguous_heterozygote',
  },
  {
    // GT indices carry no tokens, so a chosen profile with a VCF is an error.
    name: 'err-profile-with-vcf',
    options: { profile: 'dart' },
    files: {
      'genotypes.vcf': VCF_BASIC_GENOTYPES,
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    error: 'genotypes.profile_format',
  },
  {
    // H is claimed by the profile and does not vote; A and B make the file coded, which a profile cannot read.
    name: 'err-profile-nucleotide-on-coded',
    options: { profile: 'soybase-report' },
    files: {
      'genotypes.csv': lines(
        'marker_id,chrom,pos_bp,RP,DONOR,L1',
        'r1,Gm02,1000,A,B,H',
        'r2,Gm02,2000,A,B,B',
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    error: 'genotypes.profile_format',
  },
];

// ---- write ------------------------------------------------------------------

rmSync(CASES, { recursive: true, force: true });
for (const c of cases) {
  const dir = join(CASES, c.name);
  mkdirSync(dir, { recursive: true });
  const files = { ...c.files };
  if (c.options !== undefined) files['options.json'] = JSON.stringify(c.options, null, 2) + '\n';
  if ((c.expect === undefined) === (c.error === undefined)) {
    throw new Error(`${c.name}: give exactly one of expect or error`);
  }
  if (c.expect !== undefined) files['expected.json'] = JSON.stringify(c.expect, null, 2) + '\n';
  else
    files['expected-error.json'] =
      JSON.stringify({ contractVersion: VERSION, kind: c.error }, null, 2) + '\n';
  let bytes = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = typeof content === 'string' ? utf8(content) : content;
    writeFileSync(join(dir, name), data);
    bytes += data.length;
  }
  if (bytes > MAX_CASE_BYTES) throw new Error(`${c.name}: ${bytes} bytes, over ${MAX_CASE_BYTES}`);
}

/** Every file under `dir`, as posix paths relative to contract/. */
function walk(dir, rel = '') {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = join(dir, name);
      const relPath = rel === '' ? name : posix.join(rel, name);
      return statSync(path).isDirectory() ? walk(path, relPath) : [relPath];
    });
}

const paths = walk(ROOT)
  .filter((p) => p !== 'MANIFEST.sha256')
  .sort();
let total = 0;
const manifest = paths.map((p) => {
  const data = readFileSync(join(ROOT, ...p.split('/')));
  total += data.length;
  return `${createHash('sha256').update(data).digest('hex')}  ${p}`;
});
writeFileSync(join(ROOT, 'MANIFEST.sha256'), manifest.join('\n') + '\n');
if (total > MAX_CONTRACT_BYTES) {
  throw new Error(`contract/ holds ${total} bytes, over ${MAX_CONTRACT_BYTES}`);
}
console.log(`contract ${VERSION}: ${cases.length} cases, ${paths.length} files, ${total} bytes`);
