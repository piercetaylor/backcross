# Data formats

This document is the contract for every file the Isoline Browser reads or writes. The input contract is shared verbatim with the sibling progeny-selector project; a change here is a breaking change (see CONTRIBUTING.md). Validation happens once, in src/io/loaders.ts; error messages quote the offending file, line and column.

## Chromosome names

Accepted spellings for the 20 Glycine max chromosomes: `Gm01`..`Gm20`, `Gm1`..`Gm20`, `chr01`/`Chr1`/`chr1`, and bare `1`..`20` or `01`..`20`. All are normalised to `Gm01`..`Gm20` for display, ordering and export. Any other name (scaffolds, unplaced contigs) is kept unchanged and ordered after Gm20 in natural order. Positions are 1-based base pairs on whichever Williams 82 assembly the user's files use; the tool does not convert between assemblies. SoyBase lists the Wm82.a1.v1.1, Wm82.a2.v1 and Wm82.a4.v1 assemblies with Gm01–Gm20 naming, and explains the naming pattern: in `Wm82.a4.v1` the middle field is the assembly version and the last field the annotation version [web] https://www.soybase.org/resources/genome_info/. A newer near-gapless assembly, Wm82.a6, was built from the single-plant sub-line Wm82-ISU-01 and released through Phytozome v13 [web] https://www.biorxiv.org/content/10.1101/2024.04.26.591401v1 (published as Espina et al. 2024, Plant Journal 120:1221–1235, DOI 10.1111/tpj.17026, as listed in PubMed search results; the publisher page returned 403 when fetched). The SoyBase genome-information page fetched on 2026-09-04 did not list a6, so which assembly is "current" for a given program's marker positions is an open question recorded in PLAN.md.

## Soybean genotyping platforms

Typical inputs come from three platforms. SoySNP50K: 52,041 SNPs passed manufacturing on the Illumina Infinium iSelect BeadChip, of which 99 target unanchored scaffolds [web] https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0054985; the tool therefore accepts scaffold names in `chrom`. BARCSoySNP6K: about 6,000 SNPs selected from SoySNP50K (5,000 euchromatic, 1,000 heterochromatic) with positions on Wm82.a2.v1 [web] https://digitalcommons.unl.edu/cgi/viewcontent.cgi?article=2402&context=agronomyfacpub; a mapping study scored 5,403 loci from the chip [web] https://link.springer.com/article/10.1007/s11032-015-0209-5. GBS: variable marker counts (tens of thousands to over a million sites) with high missingness, usually delivered as VCF or TASSEL HapMap; the per-marker call-rate QC and `maxMissingSpan` parameter exist for this case.

## Genotype file

One of three formats, detected by file name (`.vcf`, `.hmp.txt`/`.hmp`/`.hapmap`, `.csv`/`.tsv`/`.txt`) and then by content (`##fileformat=VCF`, a leading `rs#` header, otherwise wide CSV). Gzip and bgzip compression (`.gz`, `.bgz`) are inflated first, including multi-member bgzip streams.

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

## Target regions

Typed in the UI or passed to the CLI as `name=Gm13:28,500,000-29,100,000` or `name=<marker_id>` for a single marker; without `name=` the whole text is the name. The locus is `CHROM:START-END` or `CHROM:POS`, where CHROM is any accepted chromosome spelling (it need not exist in the dataset; a region with no markers reports `no_data`), the separator is `-`, `–` or `..`, a reversed range is swapped, and each number takes optional thousands separators (`,`, `_`, space) and an optional unit `bp`, `kb` or `Mb` (default bp). In a range a unit on the end number also applies to a unit-less start number (`28.5-29.1Mb`); a decimal number with no unit anywhere is rejected rather than guessed. A region is `{name, chrom, startBp, endBp}`; informative markers inside `[startBp, endBp]` determine status.

## Analysis parameters

| parameter         | default    | source                                                                                                                                  |
| ----------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| maxGapBp          | 2,000,000  | VITE_DEFAULT_MAX_GAP_BP; RPP coverage cap, the interval one marker represents (bp); used for bp-weighted RPP only                       |
| maxGapCm          | 10         | VITE_DEFAULT_MAX_GAP_CM; the RPP coverage cap in cM                                                                                     |
| maxSegmentGapBp   | 10,000,000 | VITE_DEFAULT_MAX_SEGMENT_GAP_BP; break a donor run when consecutive informative markers are farther apart than this; used without a map |
| maxSegmentGapCm   | 10         | VITE_DEFAULT_MAX_SEGMENT_GAP_CM; the same test in cM, used whenever markers.csv supplies cM (docs/adr/0008)                             |
| minSegmentMarkers | 2          | VITE_DEFAULT_MIN_SEGMENT_MARKERS                                                                                                        |
| maxMissingSpan    | 3          | VITE_DEFAULT_MAX_MISSING_SPAN; skipped (missing or nonparental) informative markers allowed between two non-RP calls of one run         |
| lineMissingMax    | 0.10       | VITE_QC_LINE_MISSING_MAX                                                                                                                |
| lineHetMax        | 0.05       | VITE_QC_LINE_HET_MAX                                                                                                                    |
| markerCallRateMin | 0.80       | VITE_QC_MARKER_CALLRATE_MIN                                                                                                             |
| parentHetMax      | 0.02       | VITE_QC_PARENT_HET_MAX                                                                                                                  |

## Outputs

### Per-line summary CSV (implemented)

One row per candidate. Columns: `sample_id, n_informative, n_called, n_rp_hom, n_donor_hom, n_het, n_missing, n_nonparental, rpp_count, rpp_bp, rpp_cm, rpp_count_Gm01 ... rpp_count_Gm20` (one wide column per chromosome in display order). Numbers are written with six decimals; NaN is written as `NA` so `readr::read_csv` reads it as missing.

### Segments CSV (implemented)

`sample_id, chrom, start_bp, end_bp, left_flank_bp, right_flank_bp, n_markers, n_donor_hom, n_het, class, start_cm, end_cm, length_bp, length_cm, gap_criterion`; class is `donor`, `het` or `mixed`; flank columns are `NA` at chromosome ends; cM columns are `NA` without a map; `gap_criterion` is `cm` or `bp`, the dataset-level test (docs/adr/0008): `cm` when markers.csv supplied cM, in which case any step where either marker lacks a cM value was tested in bp instead (the loader warns how many markers that affects).

### Target check CSV (implemented)

`sample_id, target, chrom, start_bp, end_bp, status, n_informative_in_region, segment_start_bp, segment_end_bp, drag_min_bp, drag_max_bp`; status is `donor`, `het`, `rp`, `recombinant` (any mixture of classes, including donor with het) or `no_data`. `drag_min_bp` and `drag_max_bp` sum, over the two sides of the region, the donor DNA outside it: at least to the outermost non-RP marker of the overlapping segment, at most to its flanking RP marker; a side where the region extends past the segment contributes 0. Both are `NA` when no segment overlaps the region; `drag_max_bp` is `NA` when a flank is missing.

### Pairwise comparison CSV (implemented)

`sample_a, sample_b, mode, chrom, n_compared, n_discordant` per chromosome plus an overall row with chrom `ALL`, and a second file listing discordant markers `sample_a, sample_b, marker_id, chrom, pos_bp, class_a, class_b`. Every chromosome in the dataset gets a row, including those where nothing was compared. In mode `all` a difference can fall on an uninformative marker, where both class columns read `uninformative`; the class columns carry parent-of-origin, which is undefined there, and the marker id and position identify the site.

### HTML report (implemented)

A single self-contained HTML file (no external resources, no scripts) with the dataset summary, loader warnings, the analysis parameters every number was computed with (docs/adr/0006 requires the coverage cap to be stated), the QC table, the per-line table, donor segments, target checks, and a graphical genotype image, as a PNG data URI with the class legend, for each line rendered into the report. The set of lines with a figure need not match the set in the tables (for example, only the lines selected in the genotype view at export time); the report itself states how many lines have a figure out of the total in the tables and lists the sample ids without one. PDF via the browser print dialog, using the report's own print stylesheet.

## Class codes in exports

Where a class is written it uses the labels `missing, rp_hom, donor_hom, het, uninformative, nonparental` (numeric codes 0–5 in src/core/types.ts; the numbers are stable and are never renumbered).
