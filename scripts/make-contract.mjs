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
const MAX_CONTRACT_BYTES = 64 * 1024;

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
const cases = [
  {
    // Phased and unphased GT, haploid GT, multiallelic ALT, ID `.`, GT not first in FORMAT.
    name: 'vcf-basic',
    files: {
      'genotypes.vcf': lines(
        '##fileformat=VCFv4.2',
        '##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">',
        tsv(VCF_HEADER, 'RP', 'DONOR', 'L1', 'L2'),
        tsv(
          'Gm07',
          '1000',
          'v_phase',
          'A',
          'G',
          '.',
          'PASS',
          '.',
          'GT',
          '0/0',
          '1/1',
          '0|1',
          '1|0',
        ),
        tsv('Gm07', '2000', '.', 'C', 'T', '.', 'PASS', '.', 'GT', '0', '1', './.', '.'),
        tsv(
          'Gm07',
          '3000',
          'v_multi',
          'G',
          'A,T',
          '.',
          'PASS',
          '.',
          'GT',
          '0/0',
          '2/2',
          '0/2',
          '1/2',
        ),
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
      ),
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
];

// ---- write ------------------------------------------------------------------

rmSync(CASES, { recursive: true, force: true });
for (const c of cases) {
  const dir = join(CASES, c.name);
  mkdirSync(dir, { recursive: true });
  const files = { ...c.files };
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
