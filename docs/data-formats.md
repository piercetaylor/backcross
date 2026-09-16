# Data formats

This document holds what is this repository's own: the platforms, target regions, analysis parameters, the BrAPI source and every output. The input file contract is `contract/data-contract.md`, shared with progeny-selector (contract/README.md gives the version rules). Validation happens once, at the boundary in src/io/ (`loaders.ts` for files, `brapi.ts` for a BrAPI server); error messages quote the offending file, line and column, or the BrAPI URL.

## Input contract

The input contract is `contract/data-contract.md`, version 1.2.1, shared byte for byte with progeny-selector. It defines chromosome names, the genotype file (VCF, HapMap, wide CSV), samples.csv, markers.csv and the class codes in exports; `contract/README.md` gives the version rules.

## BrAPI allele matrix (Backcross only, outside the shared contract)

A variant set can be loaded from a BrAPI v2.1 server (Genotyping module) instead of a genotype file; `samples.csv` and `markers.csv` are supplied exactly as for a file. The worker fetches, in this order and page by page, `GET {baseUrl}/callsets?variantSetDbId=`, `GET {baseUrl}/variants?variantSetDbId=` and `GET {baseUrl}/allelematrix?variantSetDbId=&dataMatrixAbbreviations=GT` over both dimensions (variant pages outer, call-set pages inner), and joins every matrix cell to its variant and call set by `variantDbId` and `callSetDbId`, never by position in the page. Each response's `sepPhased`, `sepUnphased` and `unknownString` are honoured; phasing is ignored; a token without a separator is a haploid call read as homozygous; a token with more than two alleles is an error (calls are diploid); a token with one missing allele is a missing call.

- `sample_id` is the call set's `callSetName` when it is present and unique within the variant set, else its `callSetDbId`; colliding names fall back to the DbId with a warning naming them. Each call set is one `sample_id`; replicates are given the same `line_name` in samples.csv. The call-set table (`brapi-callsets.csv`, below) is offered from the Upload screen so samples.csv is built from real values. `callSetDbId` and `sampleDbId` are kept and written into every export.
- `marker_id` is the first entry of `variantNames`, else `variantDbId`.
- `pos_bp = start + 1` (BrAPI `start` is 0-based) and `chrom = referenceName`, normalised as for files. A variant without `referenceName` or `start` takes both from markers.csv; if markers.csv does not list it, the load fails naming the marker. markers.csv otherwise overrides positions exactly as for a file.
- Allele symbols are `referenceBases` then `alternateBases`; when `referenceBases` is absent the symbols are the allele indices as text (`0`, `1`, …).
- Authentication: an optional bearer token, sent as `Authorization: Bearer <token>` on every request, kept only in the page's memory and never written anywhere.
- The server must allow this application's origin (CORS: `Access-Control-Allow-Origin`, and the `Authorization` header in the preflight when a token is used). A CORS refusal and a network failure look the same to the browser; the error says so.
- Each request times out after 60 s; a load can be cancelled from the Upload screen.
- Not supported: other authentication schemes, `/samples` and `/germplasm` lookups (a Gigwa import may auto-generate `callSetName`; the call-set table is the mitigation), polyploid calls.

## Soybean genotyping platforms

Typical inputs come from three platforms. SoySNP50K: 52,041 SNPs passed manufacturing on the Illumina Infinium iSelect BeadChip, of which 99 target unanchored scaffolds [web] https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0054985; the tool therefore accepts scaffold names in `chrom`. BARCSoySNP6K: about 6,000 SNPs selected from SoySNP50K (5,000 euchromatic, 1,000 heterochromatic) with positions on Wm82.a2.v1 [web] https://digitalcommons.unl.edu/cgi/viewcontent.cgi?article=2402&context=agronomyfacpub; a mapping study scored 5,403 loci from the chip [web] https://link.springer.com/article/10.1007/s11032-015-0209-5. GBS: variable marker counts (tens of thousands to over a million sites) with high missingness, usually delivered as VCF or TASSEL HapMap; the per-marker call-rate QC and `maxMissingSpan` parameter exist for this case.

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

Every table below carries `call_set_db_id` and `sample_db_id` (the BrAPI call set behind the sample; empty for a dataset loaded from a file) immediately after its sample id column(s); the pairwise tables carry them for both samples, suffixed `_a` and `_b`.

### Per-line summary CSV (implemented)

One row per candidate. Columns: `sample_id, call_set_db_id, sample_db_id, n_informative, n_called, n_rp_hom, n_donor_hom, n_het, n_missing, n_nonparental, rpp_count, rpp_bp, rpp_cm, rpp_count_Gm01 ... rpp_count_Gm20` (one wide column per chromosome in display order). Numbers are written with six decimals; NaN is written as `NA` so `readr::read_csv` reads it as missing.

### Segments CSV (implemented)

`sample_id, call_set_db_id, sample_db_id, chrom, start_bp, end_bp, left_flank_bp, right_flank_bp, n_markers, n_donor_hom, n_het, class, start_cm, end_cm, length_bp, length_cm, gap_criterion`; class is `donor`, `het` or `mixed`; flank columns are `NA` at chromosome ends; cM columns are `NA` without a map; `gap_criterion` is `cm` or `bp`, the dataset-level test (docs/adr/0008): `cm` when markers.csv supplied cM, in which case any step where either marker lacks a cM value was tested in bp instead (the loader warns how many markers that affects).

### Target check CSV (implemented)

`sample_id, call_set_db_id, sample_db_id, target, chrom, start_bp, end_bp, status, n_informative_in_region, segment_start_bp, segment_end_bp, drag_min_bp, drag_max_bp`; status is `donor`, `het`, `rp`, `recombinant` (any mixture of classes, including donor with het) or `no_data`. `drag_min_bp` and `drag_max_bp` sum, over the two sides of the region, the donor DNA outside it: at least to the outermost non-RP marker of the overlapping segment, at most to its flanking RP marker; a side where the region extends past the segment contributes 0. Both are `NA` when no segment overlaps the region; `drag_max_bp` is `NA` when a flank is missing.

### Pairwise comparison CSV (implemented)

`sample_a, sample_b, call_set_db_id_a, sample_db_id_a, call_set_db_id_b, sample_db_id_b, mode, chrom, n_compared, n_discordant` per chromosome plus an overall row with chrom `ALL`, and a second file listing discordant markers `sample_a, sample_b, call_set_db_id_a, sample_db_id_a, call_set_db_id_b, sample_db_id_b, marker_id, chrom, pos_bp, class_a, class_b`. Every chromosome in the dataset gets a row, including those where nothing was compared. In mode `all` a difference can fall on an uninformative marker, where both class columns read `uninformative`; the class columns carry parent-of-origin, which is undefined there, and the marker id and position identify the site.

### Call-set table CSV (implemented)

`sample_id, call_set_name, call_set_db_id, sample_db_id`, one row per call set of the variant set in server order, downloadable from the Upload screen before a load (`brapi-callsets.csv`), so `samples.csv` is written from the ids the server actually uses.

### HTML report (implemented)

A single self-contained HTML file (no external resources, no scripts) with the dataset summary, loader warnings, the analysis parameters every number was computed with (docs/adr/0006 requires the coverage cap to be stated), the QC table, the per-line table, donor segments, target checks, and a graphical genotype image, as a PNG data URI with the class legend, for each line rendered into the report. The set of lines with a figure need not match the set in the tables (for example, only the lines selected in the genotype view at export time); the report itself states how many lines have a figure out of the total in the tables and lists the sample ids without one. PDF via the browser print dialog, using the report's own print stylesheet. When the dataset came from a BrAPI server, the dataset summary names the variant set and server, and the per-line tables carry `call_set_db_id` and `sample_db_id`.
