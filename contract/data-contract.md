# Data contract

Contract version: 1.0.0

The input files shared by isoline-browser and progeny-selector. This directory is the canonical copy in isoline-browser and is mirrored byte for byte into progeny-selector; README.md gives the version rules and the cases under cases/ are the machine-checked examples.

## Chromosome names

Accepted spellings for the 20 Glycine max chromosomes: `Gm01`..`Gm20`, `Gm1`..`Gm20`, `chr01`/`Chr1`/`chr1`, and bare `1`..`20` or `01`..`20`. All are normalised to `Gm01`..`Gm20` for display, ordering and export. Any other name (scaffolds, unplaced contigs) is kept unchanged and ordered after Gm20 in natural order. Positions are 1-based base pairs on whichever Williams 82 assembly the user's files use; the tool does not convert between assemblies. SoyBase lists the Wm82.a1.v1.1, Wm82.a2.v1 and Wm82.a4.v1 assemblies with Gm01–Gm20 naming, and explains the naming pattern: in `Wm82.a4.v1` the middle field is the assembly version and the last field the annotation version [web] https://www.soybase.org/resources/genome_info/. A newer near-gapless assembly, Wm82.a6, was built from the single-plant sub-line Wm82-ISU-01 and released through Phytozome v13 [web] https://www.biorxiv.org/content/10.1101/2024.04.26.591401v1 (published as Espina et al. 2024, Plant Journal 120:1221–1235, DOI 10.1111/tpj.17026, as listed in PubMed search results; the publisher page returned 403 when fetched). The SoyBase genome-information page fetched on 2026-09-04 did not list a6, so which assembly is "current" for a given program's marker positions is an open question recorded in PLAN.md.

## Genotype file

One of three formats, detected by file name (`.vcf`, `.hmp.txt`/`.hmp`/`.hapmap`, `.csv`/`.tsv`/`.txt`) and then by content (`##fileformat=VCF`, a leading `rs#` header, otherwise wide CSV). Gzip and bgzip compression (`.gz`, `.bgz`) are inflated first, including multi-member bgzip streams. VCF is parsed as a stream, so the inflated text is never held; HapMap and wide CSV are inflated to text first.

### VCF 4.2 or later

Fixed columns `#CHROM POS ID REF ALT QUAL FILTER INFO FORMAT` followed by one column per sample, as in the VCF 4.2 specification [web] https://samtools.github.io/hts-specs/VCFv4.2.pdf. Only CHROM, POS, ID, REF, ALT, FORMAT and the GT sub-field are read. GT allele indices refer to the REF,ALT list (0 = REF); `.` is missing; `/` and `|` are treated alike (phase ignored); haploid GT is read as homozygous; multiallelic ALT is supported. Records with ID `.` get the id `<chrom>_<pos>`. INFO, QUAL and FILTER are ignored; filter upstream with bcftools.

### HapMap (TASSEL style)

Eleven fixed columns `rs# alleles chrom pos strand assembly# center protLSID assayLSID panelLSID QCcode`, then one column per taxon [web] https://statgen-esalq.github.io/Hapmap-and-VCF-formats-and-its-integration-with-onemap/; TASSEL's own description states that only `chrom` and `pos` must be populated, genotypes are two characters (`AA`) or single nucleotide codes, and `N` is missing [web] https://bitbucket.org/tasseladmin/tassel-5-source/wiki/UserManual/Load/Load. Cells are two nucleotides (`AA`, `AT`), a slash pair (`A/T`) or one IUPAC letter (A, C, G, T; R, Y, S, W, K, M for heterozygotes). `N`, `NN`, `-`, `--` and empty cells are missing. Tab-delimited.

### Wide CSV

| column            | type    | rule                                                               |
| ----------------- | ------- | ------------------------------------------------------------------ |
| marker_id         | text    | unique                                                             |
| chrom             | text    | any accepted chromosome spelling                                   |
| pos_bp            | integer | 1-based position                                                   |
| `<sample_id>` ... | text    | one column per sample; header is the sample_id used in samples.csv |

Comma or tab delimited (sniffed), RFC 4180 quoting. Two cell vocabularies:

| mode       | homozygous                                        | heterozygous        | missing                      |
| ---------- | ------------------------------------------------- | ------------------- | ---------------------------- |
| nucleotide | `A`, `AA`                                         | `A/T`, `A\|T`, `AT` | empty, `N`, `NA`, `-`, `./.` |
| coded      | `A` (recurrent-parent allele), `B` (donor allele) | `H`                 | empty, `N`, `NA`             |

Mode `auto` selects coded when every non-missing cell is in {A, B, H} and at least one B or H occurs; otherwise nucleotide. In coded mode allele 0 is A and allele 1 is B at every marker, so the parents may be absent from the file; the manifest still names them.

Example (nucleotide):

```
marker_id,chrom,pos_bp,RP_Williams,DONOR_PI,NIL_01
syn_Gm13_10,Gm13,19000000,C,T,T
syn_Gm13_11,13,21000000,G,A,G/A
syn_Gm13_12,chr13,23000000,A,A,A
```

## samples.csv (sample manifest)

| column     | required | values                                                                |
| ---------- | -------- | --------------------------------------------------------------------- |
| sample_id  | yes      | must match a genotype column (except parents of a coded file); unique |
| line_name  | no       | display name; defaults to sample_id                                   |
| role       | yes      | `recurrent_parent`, `donor_parent`, `candidate`, `progeny`            |
| generation | no       | e.g. `BC5F3`; display and expected-value lookup only                  |
| family_id  | no       | grouping label; defaults to empty                                     |
| notes      | no       | free text                                                             |

Exactly one `recurrent_parent` and exactly one `donor_parent` per file; at least one `candidate` or `progeny`. Column names are case-insensitive; comma or tab delimited. Genotype columns absent from the manifest are dropped with a warning; manifest samples absent from the genotype file are an error. Pyramided lines with two donors are a later extension: the contract will add `donor_parent_2` and a per-marker donor assignment rather than change the meaning of existing columns.

Example:

```
sample_id,line_name,role,generation,family_id,notes
RP_Williams,Williams 82,recurrent_parent,,,
DONOR_PI,PI 000000,donor_parent,,,
NIL_01,NIL-01,candidate,BC5F3,FAM1,one donor segment Gm13
```

## markers.csv (marker map, optional)

| column    | required | values                                                          |
| --------- | -------- | --------------------------------------------------------------- |
| marker_id | yes      | matches the genotype file                                       |
| chrom     | yes      | any accepted spelling                                           |
| pos_bp    | yes      | integer                                                         |
| cm        | no       | genetic position; enables cM-weighted RPP and cM segment bounds |

Map positions override genotype-file positions when they differ (the count of overrides is reported as a warning); markers absent from the map keep their genotype-file position and have no cM.

## Class codes in exports

Where a class is written it uses the labels `missing, rp_hom, donor_hom, het, uninformative, nonparental` (numeric codes 0–5 in src/core/types.ts; the numbers are stable and are never renumbered).
