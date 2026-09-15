# Spec: shared data contract 1.1.0 across isoline-browser (canonical) and progeny-selector (mirror)

Repos: `C:\Users\pierc\Projects\Plant_Breeding_Projects\isoline-browser` (IB) and `C:\Users\pierc\Projects\Plant_Breeding_Projects\progeny-selector` (PS). Phase A runs first and entirely in IB; Phase B runs after A and entirely in PS, except its last gate, which is run from IB. Doers never run git; the "git diff" gates are the main session's.

---

## OPEN QUESTIONS for the maintainer (answer before dispatch; the spec below states what is implemented provisionally)

1. **HapMap missing tokens.** Contract says `N`, `NN`, `-`, `--`, empty. IB `src/io/hapmap.ts:27` accepts additionally `NA`, `./.`, `.`; PS HapMap uses the shared `MISSING_TOKENS` (`constants.py:118`), i.e. additionally `NA`, `.`, `./.`, `.|.`, `?`. Different supersets. Provisional: neither HapMap set is changed except `?` leaves PS's; no case exercises the extras. Which list is the contract's, and should both parsers be brought to exactly it?
2. **Which missing set does A/B/H auto-detection skip?** The contract's "every non-missing cell" is ambiguous once nucleotide and coded have different missing sets. Provisional (both repos): detection skips the nucleotide set (the union), so a file of A/B/H plus `--` is detected as coded and then rejected loudly by the coded parser (case `err-coded-unknown-cell`, kind `genotypes.unknown_cell`). Under the other reading it would be parsed as nucleotide with B and H as allele symbols in IB and rejected in PS.
3. **`?` and other non-nucleotide single letters in nucleotide mode.** Decision 6 says PS must reject `?`. PS `parse_nucleotide_call` returns `None` (missing) for any single character outside ACGT and IUPAC (`calls.py:45`), so removing `?` from the token set alone leaves `?` missing; the branch must raise. That also rejects `B`, `H`, `X`, `?` in nucleotide mode, while IB `nucleotidePair` (`wide-csv.ts:103`) accepts any single character as an allele symbol (`?` becomes a homozygous `?/?` call). No shared `?` case is possible until IB's side is decided. Provisional: PS raises; IB unchanged; PS-only unit test.
4. **Decision 4 asks to "add a coded case without parent columns".** `contract/cases/wide-coded-parents-absent` already is one and its `sampleIds` already exclude the parents. Provisional: no second case; the existing one is the decision-4 proof for PS.
5. **`.gitattributes` for CRLF case files.** IB `.gitattributes:14` (`contract/** text eol=lf`) and PS (`* text=auto eol=lf`) normalise CRLF to LF at `git add`, so a CRLF case would be committed as LF, `MANIFEST.sha256` would not match a fresh clone, and the mirror would differ. Provisional: both repos add `contract/cases/** -text` (eol has no effect once text is unset; existing LF files are untouched) and PS adds `*.gz binary`, `*.bgz binary`. Confirm.
6. **New error kind `genotypes.unknown_cell`** is needed for the coded-rejection case. It is additive (README kind list, `ErrorKind` union). Confirm it fits the minor bump.
7. **Contract "Genotype file" paragraph describes IB, not both.** "detected by file name … and then by content" and "VCF is parsed as a stream, so the inflated text is never held": PS is extension-only (its ADR 0002 says content detection is not attempted) and holds text. Provisional: unchanged; no case can distinguish because every case has a proper extension.
8. **Wide CSV fixed-column order.** PS `read_wide_csv` requires `marker_id, chrom, pos_bp` in positions 0–2 (`wide_csv.py:33`); IB finds them by name in any position. Contract is silent. Provisional: unchanged, no case.
9. **`scripts/check_contract.py`** (PS) is named by `docs/m3-phases.md` S1 (line 219) but not by decision 10, which points at IB's `check-contract-mirror.mjs`. Provisional: not written.
10. **PLAN.md ownership.** IB PLAN.md lines 138–150 ("Open for M3 …" and "Also open, found 2026-09-14 …") and PS PLAN.md Handoff line 237 ("Coordination: … S1 … S2") describe exactly what 1.1.0 settles. PS CLAUDE.md says the main session updates the Handoff. Replacement text is given in A6/B6; confirm the doer applies it or the main session does.
11. **PS `CLAUDE.md` line 32** still says `docs/data-formats.md` is the shared contract; after B the contract is `contract/`. Maintainer-only file; not touched by this spec.
12. **PS `chromosome6` test.** `tests/test_classify.py:57` asserts `chromosome6` → `Gm06`; the new shared pattern keeps `chromosome`, so it still passes. Listed only because PLAN.md line 138 named `chromosomeN` as undecided; decision 6 decides it as accepted.

### Maintainer answers, 2026-09-14

Answers that differ from the provisional text are marked **CHANGED**; the phases below must be revised to match before dispatch.

1. **CHANGED.** The contract's HapMap missing list becomes `N`, `NN`, `-`, `--`, empty, `NA`, `./.`, `.` (additive). Both parsers accept exactly that list in HapMap: IB unchanged in effect; PS drops `.|.` and `?` from its HapMap set. One new case exercises the added tokens.
2. As provisional: detection skips the nucleotide missing set.
3. **CHANGED.** Both repositories reject a single character outside ACGT and IUPAC in nucleotide wide CSV (`?`, `B`, `H`, `X`, …). IB `nucleotidePair` (`src/io/wide-csv.ts`) changes; one shared rejection case replaces the PS-only test.
4. As provisional: no second case.
5. As provisional: `contract/cases/** -text` in both; PS adds `*.gz binary`, `*.bgz binary`.
6. As provisional: `genotypes.unknown_cell` is part of the minor bump.
7. **CHANGED.** The "Genotype file" paragraph is reworded to the shared minimum: a proper extension is required; content detection and streaming are described as implementation notes that a repository may add.
8. **CHANGED.** The contract states that wide CSV's first three columns are `marker_id`, `chrom`, `pos_bp` in that order; IB's by-name lookup is documented as accepting more. Wording only, no code change.
9. **CHANGED.** PS gets `scripts/check_contract.py` (recompute `MANIFEST.sha256`, optionally diff against `../isoline-browser/contract`), added to its gates.
10. The main session applies the PLAN.md and Handoff text after review, not the doer.
11. The main session updates PS `CLAUDE.md` line 32 to point at `contract/`.
12. `chromosomeN` is accepted in 1.1.0; the PLAN.md open item closes.

Consequence for M3 phase 4: this spec takes ADR `0014`, so the BrAPI loader ADR becomes `0015`.

### Follow-ups raised by the revision, 2026-09-14

- **Version: 1.1.0**, decided by the maintainer. Input that 1.0.0 never stated is not contract vocabulary, so rejecting it is a stricter reading, not a changed rule; ADR 0014 records this interpretation in one sentence.
- `check_contract.py` verifies only and never writes (the PS copy is the mirror); `docs/m3-phases.md:219` "recomputes" is read as "recomputes and compares". Taken as given.
- Answer 8 needs no IB case: IB's wider acceptance is documented, not tested.
- **`.|.` in a HapMap cell is missing in both repositories** (maintainer, 2026-09-14, on research): the HapMap missing list is N, NN, -, --, empty, NA, ./., ., .|., matching wide CSV. IB `src/io/hapmap.ts` adds the token; PS keeps it; case `hapmap-missing-na-dot` includes it.
- **Cross-crop decisions (maintainer, 2026-09-14, on Fable's cross-crop research).** Token meaning follows the file format, not the crop: soybean and maize both distribute TASSEL HapMap. 1.1.0 core, safe for any diploid crop: R Y S W K M expand to the heterozygote in HapMap and wide CSV; `?`, single `B` or `H`, and two-character cells with a non-nucleotide (`A?`, `N?`) are rejected; `0` and `+` are rejected; `-`/`--` stay missing (TASSEL's deletion reading recorded in ADR 0014); `X` and `XX` are added to the HapMap missing list and stay rejected in wide CSV. The contract states that inputs are diploid calls and polyploid dosage is out of scope. Named token profiles (`tassel`, `soybase-report` with H/U, `dart`, `axiom`, user-supplied) in `contract/profiles/`, recorded in every export, are deferred to contract 1.2.0 after M3; PLAN.md and ADR 0014 record the design. Crop selector: deferred to 1.2.0 together with token profiles (maintainer, 2026-09-14). 1.1.0 stays soybean-only for chromosome names and says so in the contract. Before 1.2.0 is designed, research verifies whether genotype-token conventions and nomenclature really are the same across crops. If they are, the crop selector is a chromosome scheme only; if not, each crop's profile carries its own tokens. First-release crops: soybean (default), maize, rice, sorghum, and the other staples bred in public universities that the research names. A user-facing `docs/input-coding.md` (format → accepted, missing and rejected tokens) is added in A6, linked from the README and the Upload screen's help text; the crop section arrives with 1.2.0.
- **Cross-crop research result (Fable, 2026-09-14; full report `docs/research/cross-crop-genotype-conventions.md`, input to 1.2.0).** Across 14 crops, every token difference traces to a platform or format (TASSEL, DArT, GenomeStudio, Axiom, KASP, Flapjack) or to ploidy, never to a crop community. The 1.2.0 crop selector is therefore a chromosome scheme plus a ploidy flag, and token profiles are a separate axis keyed by platform, with at most a per-crop default. Chromosome schemes need per-assembly alias tables, not one regex per crop (renumbering, subgenome letters, unanchored bins). Does not change 1.1.0.
- **Main-session resolutions of the second revision's four residual points (2026-09-14).** (1) IB HapMap `A.`/`.A` now read as missing through the shared `calls.ts`, like every other half-missing pair; no fixture or case contains one; the ADR's "half-missing unchanged" is read as "unchanged in wide CSV and PS, aligned in IB HapMap". (2) `INPUT_CODING_URL` is confirmed: `git remote -v` gives `https://github.com/piercetaylor/isoline-browser.git` and the default branch is `main`. (3) The contract keeps the sentence saying half-missing pairs are not defined by this version. (4) A1 adds to both the HapMap and the wide-CSV cell paragraphs: "Cells are trimmed and compared case-insensitively." In A4 the half-missing list is `['AN', 'A-', '-A', 'A.', './A', 'N/A']` (without `'NA/'`), as the section's closing note says.
- SUPERSEDED research note: cross-crop research the maintainer asked for ("what works for all crops vs is specific to one"; keep crops isolated if needed; make it adaptable, since the project is open source): the three items below may move to a per-load dialect profile rather than the strict core. Research so far (TASSEL source, SoySNP50K HapMap): TASSEL rejects anything outside A C G T R Y S W K M + - 0 N X Z and treats X/XX as missing and -/-- as a deletion; SoySNP50K codes every het as an IUPAC single letter; SoyBase allele reports use H for het and U for missing. (a) whether the stray-character rejection extends to HapMap in both repositories; (b) `.|.` in a HapMap cell: reject, missing or undecided; (c) a single IUPAC letter in nucleotide wide CSV (IB homozygous symbol, PS heterozygote) and two-character cells with a stray character (`A?`).

---

## Acceptance matrix (decision → proof)

| Decision                                                 | Proof                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 delimiters                                             | case `wide-nucleotide-tab-crlf-bom` (tab genotypes + tab samples), case `samples-quoted-fields` (RFC 4180 in both files); PS `test_io.py::test_manifest_tab_no_line_name`, `::test_wide_csv_tab_quoted_bom_crlf`                                                                                                                 |
| 2 line_name optional                                     | case `wide-nucleotide-tab-crlf-bom` (samples.csv has no `line_name`); PS `test_manifest_tab_no_line_name`                                                                                                                                                                                                                        |
| 3 drop + manifest order                                  | existing case `samples-manifest-defaults` (fails on PS today, passes after B); PS `test_extra_columns_dropped_manifest_order`                                                                                                                                                                                                    |
| 4 synthetic parents excluded                             | existing case `wide-coded-parents-absent`; PS `test_coded_synthetic_parents_tracked`                                                                                                                                                                                                                                             |
| 5 raw CHROM in id                                        | case `vcf-id-dot-crlf`; PS `test_vcf_plain_and_gzip` (`"6_2000"`)                                                                                                                                                                                                                                                                |
| 6 chromosome pattern                                     | case `chrom-natural-order` (`Chromosome_07`, `LG7`, `Gm-7`, `gm 7`; `ch7` not normalised); IB `contracts.test.ts` chromosome test; PS `test_chromosome_normalisation`                                                                                                                                                            |
| 6 missing tokens, wide CSV                               | case `wide-nucleotide-tab-crlf-bom` (`.\|.`, `NN`, `--`, `.`, empty); case `err-coded-unknown-cell`; IB `contracts.test.ts` "treats the full nucleotide missing list…", "coded mode rejects…"; PS `test_wide_missing_tokens_per_mode`                                                                                            |
| HapMap missing list (N NN - -- empty NA ./. . .\|. X XX) | case `hapmap-missing-na-dot` (all eleven tokens); IB `contracts.test.ts` "HapMap reads the contract's missing list…"; PS `test_hapmap_missing_tokens`                                                                                                                                                                            |
| IUPAC expansion in both formats                          | existing case `hapmap-iupac`; case `wide-nucleotide-iupac` (R Y S W K M in wide CSV); IB `contracts.test.ts` "expands IUPAC codes…"; PS `test_nucleotide_iupac_expands`                                                                                                                                                          |
| rejected cells, wide nucleotide                          | cases `err-nucleotide-unknown-cell` (`?`), `err-nucleotide-single-h` (`H` in a nucleotide file), `err-nucleotide-zero` (`0`), `err-nucleotide-pair-stray` (`A?`), `err-nucleotide-xx` (`XX`); IB `contracts.test.ts` "rejects…" (`?`, `B`, `H`, `X`, `XX`, `0`, `+`, `A?`, `N?`, `RR`); PS `test_nucleotide_rejects_stray_cells` |
| rejected cells, HapMap                                   | cases `err-hapmap-unknown-cell` (`?`), `err-hapmap-plus` (`+`), `err-hapmap-single-b` (`B`); IB `contracts.test.ts` "HapMap rejects…"; PS `test_hapmap_rejects_stray_cells`                                                                                                                                                      |
| 6 CRLF + BOM                                             | cases `wide-nucleotide-tab-crlf-bom` (BOM+CRLF, both files), `vcf-id-dot-crlf`; PS `test_vcf_crlf_bom`                                                                                                                                                                                                                           |
| 7 whole-file detection                                   | IB `contracts.test.ts` "scans every row…"; PS `test_coding_detection_scans_every_row` (contract cases cannot: 2000 rows exceed the 4 KB limit)                                                                                                                                                                                   |
| answers 7, 8; diploid-only; soybean-only names           | wording only, no parser change; proved only by identical bytes in both copies (rows "9 version" and "10 mirror")                                                                                                                                                                                                                 |
| half-missing cells (`AN`, `A-`)                          | undecided: no case; IB `contracts.test.ts` "reads half-missing pairs as missing (undecided…)" and PS `test_half_missing_pairs_unchanged` pin today's behaviour so a later decision is a visible test change                                                                                                                      |
| 8 natural order                                          | case `chrom-natural-order` (`scaffold_2` < `scaffold_10`); IB existing `buildChromosomeOrder` test; PS `test_chromosome_natural_order`                                                                                                                                                                                           |
| dup marker / sort                                        | existing cases `err-duplicate-marker`, `chrom-spellings` (rows out of position order)                                                                                                                                                                                                                                            |
| 9 version                                                | IB `contract-cases.test.ts` "VERSION appears verbatim…"; PS `test_contract_cases.py::test_version_in_docs`                                                                                                                                                                                                                       |
| 10 mirror                                                | `node scripts/check-contract-mirror.mjs ../progeny-selector` exits 0 (from IB); `python scripts/check_contract.py ../isoline-browser` exits 0 (from PS); PS `test_manifest_matches_files`; PS `tests/test_check_contract.py`                                                                                                     |
| docs/input-coding.md                                     | IB `npm run lint` (no literal in `UploadScreen.tsx`), `npm run build`; browser test `load-path.test.tsx` still passes (the paragraph text it does not query changes)                                                                                                                                                             |

---

# ============ PHASE A: isoline-browser ============

Files touched: `contract/data-contract.md`, `contract/README.md`, `contract/VERSION`, `contract/cases/**` (generated), `contract/MANIFEST.sha256` (generated), `scripts/make-contract.mjs`, `src/io/calls.ts` (new), `src/io/wide-csv.ts`, `src/io/hapmap.ts`, `src/io/vcf.ts` (comment only), `src/core/chromosomes.ts` (comment only), `src/ui/screens/UploadScreen.tsx`, `src/ui/screens/screens.css`, `tests/contracts.test.ts`, `tests/contract-cases.test.ts`, `tests/support/normalise.ts`, `.gitattributes`, `docs/data-formats.md`, `docs/input-coding.md` (new), `docs/adr/0014-contract-1.1-alignment.md` (new), `README.md`, `CHANGELOG.md`, `PLAN.md` (main session only). Not touched: `scripts/make-fixture.mjs`, `tests/fixtures/**`, `src/io/vcf.ts` code, `src/io/builder.ts`, `src/io/loaders.ts`, `src/io/index.ts`.

Order matters: A1 (text) before A2 (`npm run contract`), because the manifest hashes `data-contract.md`, `README.md` and `VERSION`. `contract/` is Prettier-ignored; `docs/` is not.

## === PHASE A1: contract text ===

**`contract/VERSION`**: content becomes `1.1.0\n`.

**`contract/data-contract.md`**

Line 3 → `Contract version: 1.1.0`

Line 9, replace the first two sentences ("Accepted spellings … in natural order.") with:

> Chromosome names in this version are soybean-only: the 20 Glycine max chromosomes are normalised to `Gm01`..`Gm20` and every other name is kept as written; schemes for other crops are a later version. Accepted spellings for the 20 Glycine max chromosomes: an optional prefix `Gm`, `Chr`, `Chromosome` or `LG` (case-insensitive), an optional single separator `_`, space or `-`, then the number 1..20 with any number of leading zeros; so `Gm01`, `gm1`, `Chr07`, `chr7`, `Chromosome_07`, `LG7`, `Gm-7`, `7` and `07` all normalise to `Gm07`. As a pattern on the trimmed cell: `^(?:gm|chr|chromosome|lg)?[_\s-]?0*([1-9]|1[0-9]|20)$`, case-insensitive. All are normalised to `Gm01`..`Gm20` for display, ordering and export. Any other name (scaffolds, unplaced contigs, `ch7`) is kept unchanged and ordered after Gm20 in natural order: the name is split into digit runs and text runs, digit runs compare numerically and text runs lexically, so `scaffold_2` precedes `scaffold_10`.

Line 13 (the whole "Genotype file" paragraph), replace with:

> One of three formats, selected by file extension: `.vcf`; `.hmp.txt`, `.hmp` or `.hapmap`; `.csv`, `.tsv` or `.txt`; each optionally followed by `.gz` or `.bgz` for gzip or bgzip compression, which is inflated first, including multi-member bgzip streams. A genotype file must carry one of these extensions; every case under cases/ does. A repository may additionally detect the format from content (`##fileformat=VCF`, a leading `rs#` header, otherwise wide CSV) and may parse a compressed VCF as a stream instead of inflating it to text, but neither is required by this contract. Every genotype is a diploid call, two alleles per sample per marker or missing; polyploid dosage is out of scope. Every text input (genotype file, samples.csv, markers.csv) may use LF or CRLF line ends, and a UTF-8 byte-order mark before the first line is ignored.

Line 17, replace "Records with ID `.` get the id `<chrom>_<pos>`." with:

> Records with ID `.` or empty get the id `<CHROM>_<POS>` from CHROM exactly as written in the file, before chromosome normalisation, so a record `chr13 19000000 .` is `chr13_19000000`, the string bcftools writes for `%CHROM_%POS`.

Line 21 (HapMap), replace the two sentences "Cells are two nucleotides (`AA`, `AT`), a slash pair (`A/T`) or one IUPAC letter (A, C, G, T; R, Y, S, W, K, M for heterozygotes). `N`, `NN`, `-`, `--` and empty cells are missing." with:

> Cells are two nucleotides (`AA`, `AT`), a slash or bar pair (`A/T`, `A|T`), one nucleotide (`A`, homozygous) or one IUPAC heterozygote code (R, Y, S, W, K, M), which is read as its two nucleotides (R = A/G, Y = C/T, S = C/G, W = A/T, K = G/T, M = A/C). Missing cells are `N`, `NN`, `NA`, `-`, `--`, `.`, `./.`, `.|.`, `X`, `XX` and empty (TASSEL reads `-` as a deletion and `X` as unknown; both are missing here). Any other cell is an error naming the cell: `?`, `B`, `H`, `0`, `+`, any other single character, and a two-character or slash cell containing a character other than A, C, G, T, N, `-` or `.` (`A?`, `N?`). A pair of one nucleotide and one of N, `-`, `.` (`AN`, `A-`) is not defined by this version.

Line 32, replace "Comma or tab delimited (sniffed), RFC 4180 quoting. Two cell vocabularies:" with:

> Comma or tab delimited (sniffed from the header line: more tabs than commas means tab), RFC 4180 quoting. The first three columns are `marker_id`, `chrom` and `pos_bp` in that order, header names case-insensitive, and every column after them is a sample; a file that places the three elsewhere is outside the contract. isoline-browser finds the three by name in any position and treats every other column as a sample, which accepts more than the contract requires. Two cell vocabularies:

Lines 34–39, replace the vocabulary table and the `auto` paragraph with:

```
| mode       | homozygous                                        | heterozygous                                     | missing                                                       |
| ---------- | ------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------- |
| nucleotide | `A`, `AA`                                         | `A/T`, `A\|T`, `AT`, one IUPAC code R Y S W K M  | empty, `N`, `NN`, `NA`, `-`, `--`, `.`, `./.`, `.\|.`         |
| coded      | `A` (recurrent-parent allele), `B` (donor allele) | `H`                                              | empty, `N`, `NA`                                              |

Mode `auto` scans every cell of the file, not a leading window: it selects coded when every cell outside the nucleotide missing set is in {A, B, H} and at least one B or H occurs; otherwise nucleotide. In nucleotide mode an IUPAC code is read as its two nucleotides, as in HapMap, and any other cell is an error naming the cell: `?`, a single `B` or `H` (a nucleotide file cannot mix in coded letters), `X`, `XX`, `0`, `+`, any other single character, and a two-character or slash cell containing a character other than A, C, G, T, N, `-` or `.` (`A?`, `N?`); `X` and `XX` are missing in HapMap only. A pair of one nucleotide and one of N, `-`, `.` (`AN`, `A-`) is not defined by this version. In coded mode any cell outside {A, B, H} and the coded missing set is an error, so `-`, `--`, `.`, `./.`, `.\|.` and `NN` are errors there. `?` is not a missing token in either mode. In coded mode allele 0 is A and allele 1 is B at every marker, so the parents may be absent from the file; the manifest still names them.
```

Line 61, replace "Genotype columns absent from the manifest are dropped with a warning; manifest samples absent from the genotype file are an error." with:

> Genotype columns absent from the manifest are dropped with a warning, and the loaded samples are in manifest order, not genotype-file order; manifest samples absent from the genotype file are an error, except the two parents of a coded file, which need no column. A loader may create parent columns internally for a coded file (all A, all B), but such parents are not part of its reported sample list: in a case's `expected.json`, `sampleIds` and `calls` hold only samples with a column in the genotype file.

**`contract/README.md`**

Line 9, replace the paragraph with:

> Version 1.0.0 asserted only the intersection: inputs both repositories already handled identically and both documents stated. Version 1.1.0 (isoline-browser docs/adr/0014, decided 2026-09-14) adds the shared chromosome pattern with the `Chromosome` and `LG` prefixes and `_`, space and `-` separators, natural order for non-soybean names, the full missing-token list per wide-CSV mode and for HapMap (`NA`, `./.`, `.`, `.|.`, `X`, `XX` added there), IUPAC heterozygote codes read as two nucleotides in both HapMap and wide CSV, rejection of every other cell (`?`, `B`, `H`, `0`, `+`, `A?`, and `X`/`XX` in wide CSV), whole-file A/B/H detection, CRLF line ends and a leading BOM, an optional `line_name` column, manifest-order samples with absent genotype columns dropped, `<CHROM>_<POS>` ids from the raw CHROM, the extension-only minimum for format selection, the fixed first three wide-CSV columns, diploid-only calls, soybean-only chromosome names, and the error kind `genotypes.unknown_cell`. An input one repository accepts and the other does not still gets a case only once the maintainer decides it belongs, as a minor bump. Input that 1.0.0 never stated is not contract vocabulary, so a version that rejects it is a stricter reading, not a changed rule.

Line 19, replace "`genotypes.no_gt` or `genotypes.no_header`." with "`genotypes.no_gt`, `genotypes.no_header` or `genotypes.unknown_cell`."

**`docs/data-formats.md`** line 7: `version 1.0.0` → `version 1.1.0`.

## === PHASE A2: generator cases (`scripts/make-contract.mjs`) ===

Header comment lines 12–20, replace with:

```
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
```

After line 46 (`const utf8 = ...`) add:

```js
const crlf = (...rows) => rows.join('\r\n') + '\r\n';
const bom = (text) => '\uFEFF' + text;
```

After line 87 (`const VCF_HEADER = ...`) add:

```js
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
```

(The existing `hapmap-iupac` literal is left as it is; its bytes must not change.)

Append these fifteen entries to `cases` (before the closing `];`, line 749 before the edits above), verbatim:

```js
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
```

`SAMPLES_RP_DONOR_L1_L2` (line 89) and `SAMPLES_RP_DONOR_L1` (line 97) already exist. Then run `npm run contract` (from IB root). It rewrites `contract/cases/` and `contract/MANIFEST.sha256`; it throws if any case exceeds 4096 bytes or `contract/` exceeds 64 KiB (report if so; do not raise the limits). Expected count: 28 cases.

## === PHASE A3: loader changes ===

**Dependency check (done; nothing to fix).** No IB fixture, test or case contains a cell the new rules reject or reinterpret: `scripts/make-fixture.mjs:50` (`NUC = ['A','C','G','T']`), `:462-465` (HapMap cells `c[0]+c[1]` or `NN`), `:476-480` (wide cells a nucleotide, `x/y` or `NA`), `:490-495` (coded A/B/H/N); `tests/fixtures/synthetic/genotypes.hmp.txt` has no single-letter cell (the only `+` is the fixed strand column); `tests/contracts.test.ts:79-80` uses A, T, A/T, NA and coded A/B/H/N; `stream.test.ts:324` and `smoke.test.ts:118` load the fixture; case `hapmap-iupac` already expects R Y S W K M expanded; no wide case has a single non-ACGT cell. `scripts/make-fixture.mjs` and `tests/fixtures/**` are therefore untouched and `npm run fixture` must produce no diff (A7).

**VCF and BrAPI.** `src/io/vcf.ts:24-26` imports only `MISSING_ALLELE` and `GenotypeBuilder`; `builder.ts` is unchanged; there is no BrAPI code yet (M3 phase 4, ADR 0015) and it will supply allele indices, not cells. Nothing below touches either path.

**New `src/io/calls.ts`** (verbatim; run `npx prettier --write src/io/calls.ts`):

```ts
/**
 * Per-cell nucleotide vocabulary shared by the HapMap and wide-CSV parsers
 * (contract/data-contract.md 1.1.0, "HapMap" and "Wide CSV"). Mirrors
 * progeny-selector src/progeny_selector/io/calls.py so both repositories
 * accept and reject the same cells. VCF (GT indices) and the BrAPI loader
 * do not use it.
 *
 * Responsibility: read one cell as an unordered pair of allele symbols,
 * null for a missing token, or throw naming the cell:
 *   - trimmed and upper-cased; a token in `missing` (NUCLEOTIDE_MISSING
 *     for wide CSV, HAPMAP_MISSING for HapMap, which adds X and XX) -> null;
 *   - one character: A C G T -> homozygous; R Y S W K M -> the IUPAC
 *     heterozygote; anything else ("?", "B", "H", "X", "0", "+") -> error;
 *   - two characters, or three with "/" or "|" in the middle: each must be
 *     A C G T or one of N - . ; a pair containing N, - or . is read as
 *     missing (half-missing cells such as "AN" are undecided in 1.1.0;
 *     this keeps the pre-1.1.0 wide-CSV reading); any other character
 *     ("A?", "N?", "RR") -> error;
 *   - anything else -> error.
 *
 * Interface: NUCLEOTIDE_MISSING, HAPMAP_MISSING, IUPAC_HET,
 * parseNucleotideCell(raw, missing, where) -> [string, string] | null,
 * symbolIndex(alleles, symbol) -> number (appends an unseen symbol).
 */

export const NUCLEOTIDE_MISSING: ReadonlySet<string> = new Set([
  '',
  'N',
  'NN',
  'NA',
  '-',
  '--',
  '.',
  './.',
  '.|.',
]);

export const HAPMAP_MISSING: ReadonlySet<string> = new Set([...NUCLEOTIDE_MISSING, 'X', 'XX']);

export const IUPAC_HET: Readonly<Record<string, readonly [string, string]>> = {
  R: ['A', 'G'],
  Y: ['C', 'T'],
  S: ['C', 'G'],
  W: ['A', 'T'],
  K: ['G', 'T'],
  M: ['A', 'C'],
};

const NUCLEOTIDES: ReadonlySet<string> = new Set(['A', 'C', 'G', 'T']);
const HALF_MISSING: ReadonlySet<string> = new Set(['N', '-', '.']);

export function parseNucleotideCell(
  raw: string,
  missing: ReadonlySet<string>,
  where: string,
): [string, string] | null {
  const cell = raw.trim().toUpperCase();
  if (missing.has(cell)) return null;
  const fail = (): never => {
    throw new Error(
      `${where}: unexpected cell "${cell}" (expected A, C, G, T, an IUPAC code R Y S W K M, a pair such as A/T or AT, or a missing token)`,
    );
  };
  if (cell.length === 1) {
    if (NUCLEOTIDES.has(cell)) return [cell, cell];
    const het = IUPAC_HET[cell];
    return het === undefined ? fail() : [het[0], het[1]];
  }
  let pair: [string, string];
  if (cell.length === 2) pair = [cell[0] as string, cell[1] as string];
  else if (cell.length === 3 && (cell[1] === '/' || cell[1] === '|'))
    pair = [cell[0] as string, cell[2] as string];
  else return fail();
  for (const c of pair) if (!NUCLEOTIDES.has(c) && !HALF_MISSING.has(c)) return fail();
  if (HALF_MISSING.has(pair[0]) || HALF_MISSING.has(pair[1])) return null;
  return pair;
}

export function symbolIndex(alleles: string[], symbol: string): number {
  let i = alleles.indexOf(symbol);
  if (i === -1) {
    alleles.push(symbol);
    i = alleles.length - 1;
  }
  return i;
}
```

**`src/io/wide-csv.ts`**

- Line 16 (`import { MISSING_ALLELE } ...`): delete (no longer used). After the `builder.ts` imports add `import { NUCLEOTIDE_MISSING, parseNucleotideCell, symbolIndex } from './calls.ts';`.
- Line 23 (`const MISSING_CELLS = ...`): replace with

```ts
/** Coded-mode missing cells; anything else outside A, B, H is an error in coded mode. */
const CODED_MISSING = new Set(['', 'N', 'NA']);
```

- `detectWideCsvMode` (lines 26–45): delete `let rows = 0;` and `rows++;`; line 32 → `if (lineNumber === 1 || !onlyCoded) return;`; line 36 → `if (NUCLEOTIDE_MISSING.has(cell)) continue;`. Signature unchanged.
- `parseWideCsv` lines 82–97 (the per-sample loop) become:

```ts
for (let s = 0; s < sampleCols.length; s++) {
  const raw = f[sampleCols[s] as number] as string;
  if (resolved === 'coded') {
    const cell = raw.trim().toUpperCase();
    if (CODED_MISSING.has(cell)) continue;
    if (cell === 'A') builder.setCall(offset, s, 0, 0);
    else if (cell === 'B') builder.setCall(offset, s, 1, 1);
    else if (cell === 'H') builder.setCall(offset, s, 0, 1);
    else
      throw new Error(
        `coded genotype CSV line ${lineNumber}: unexpected cell "${cell}" (expected A, B, H or missing)`,
      );
  } else {
    const pair = parseNucleotideCell(
      raw,
      NUCLEOTIDE_MISSING,
      `wide genotype CSV line ${lineNumber}`,
    );
    if (pair === null) continue;
    builder.setCall(offset, s, symbolIndex(alleles, pair[0]), symbolIndex(alleles, pair[1]));
  }
}
```

- Delete `nucleotidePair` (lines 103–109) and `alleleIndex` (lines 111–119).
- Header comment lines 5–12 replace with:

```
 * column per sample. Two cell vocabularies are supported:
 *   - nucleotide (calls.ts): "A" (homozygous), "A/T", "A|T" or "AT"
 *     (heterozygous), "AA", one IUPAC code R Y S W K M (its two
 *     nucleotides); missing = "", "N", "NN", "NA", "-", "--", ".", "./.",
 *     ".|."; any other cell ("?", "B", "H", "X", "XX", "0", "+", "A?") is an
 *     error naming the cell.
 *   - coded: A = recurrent-parent allele, B = donor allele, H = heterozygous;
 *     missing = "", "N", "NA" only, any other cell is an error. Allele 0 is A and
 *     allele 1 is B at every marker, so origin is defined without parent columns.
 * Mode 'auto' scans every row of the file (no row window) and selects coded when
 * every cell outside the nucleotide missing set is in {A, B, H} and at least one
 * B or H occurs; otherwise nucleotide.
```

- Run `npx prettier --write src/io/wide-csv.ts`.

**`src/io/hapmap.ts`**

- Line 14 (`import { MISSING_ALLELE } ...`): delete. After the `builder.ts` imports add `import { HAPMAP_MISSING, parseNucleotideCell, symbolIndex } from './calls.ts';`.
- Delete `IUPAC_HET` (lines 18–25) and `MISSING_CELLS` (line 27).
- Lines 53–58 (the per-sample loop) become:

```ts
for (let s = 0; s < nSamples; s++) {
  const pair = parseNucleotideCell(f[11 + s] as string, HAPMAP_MISSING, `HapMap line ${i + 1}`);
  if (pair === null) continue;
  builder.setCall(offset, s, symbolIndex(alleles, pair[0]), symbolIndex(alleles, pair[1]));
}
```

- Delete `cellToSymbols` (lines 63–73) and `alleleIndex` (lines 75–83). The `alleles` column handling (lines 46–49) is unchanged.
- Header comment lines 6–10 replace with:

```
 * columns that follow. Cells go through calls.ts: two characters ("AA",
 * "AT"), a slash or bar pair ("A/T"), one nucleotide, or one IUPAC code
 * (R, Y, S, W, K, M) read as its two nucleotides; missing = "", "N", "NN",
 * "NA", "-", "--", ".", "./.", ".|.", "X", "XX" (contract 1.1.0); any other
 * cell is an error naming the cell. The allele list is seeded from the
 * `alleles` column ("A/T") and extended when a cell carries another
 * nucleotide.
```

- Run `npx prettier --write src/io/hapmap.ts`.

**`src/io/vcf.ts`** line 10, comment only: `Records without an ID get `${chrom}_${pos}`` → `Records with ID "." or empty get `${chrom}_${pos}` from CHROM as written, before normalisation (contract 1.1.0).` No code change.

**`src/core/chromosomes.ts`** lines 4–7, comment only: replace with `map the chromosome spellings the contract accepts (prefix Gm, Chr, Chromosome or LG, optional _, space or - separator, 1..20 with leading zeros; contract/data-contract.md 1.1.0, soybean-only in this version) onto Gm01..Gm20, keep other names unchanged, and provide a stable display order (Gm01..Gm20, then the rest in natural order).` Regex `NUMBERED` unchanged.

**`tests/support/normalise.ts`** line 38: add `| 'genotypes.unknown_cell'` to `ErrorKind`.

**`tests/contract-cases.test.ts`** line 37, add after it:

```ts
  'genotypes.unknown_cell': /unexpected cell/,
```

(Every rejection in both parsers now says `unexpected cell "<cell>"`; `hapmap.ts`'s "cannot interpret genotype cell" no longer exists.)

## === PHASE A4: unit tests (`tests/contracts.test.ts`) ===

Imports: add `import { HAPMAP_MISSING, NUCLEOTIDE_MISSING, parseNucleotideCell } from '../src/io/calls.ts';` and `import { parseHapMap } from '../src/io/hapmap.ts';` (keep import order alphabetical by path for eslint).

Chromosome test (line 46): list becomes `['Gm07', 'gm7', 'Chr07', 'chr7', '7', '07', 'GM_07', 'LG7', 'Chromosome_07', 'lg-7', 'gm 7']`; after line 51 add `expect(normalizeChromosome('ch7')).toBe('ch7');`.

Inside `describe('wide CSV vocabulary', ...)` add four tests:

```ts
it('scans every row for A/B/H detection, not a leading window', () => {
  const header = 'marker_id,chrom,pos_bp,S1\n';
  const rows = (n: number, cell: string): string =>
    Array.from({ length: n }, (_, i) => `m${i},Gm01,${i + 1},${cell}`).join('\n') + '\n';
  expect(detectWideCsvMode(header + rows(2100, 'A') + 'late,Gm01,9999,B\n')).toBe('coded');
  expect(detectWideCsvMode(header + 'h,Gm01,1,H\n' + rows(2100, 'A') + 'late,Gm01,9999,T\n')).toBe(
    'nucleotide',
  );
});

it('treats the full nucleotide missing list as missing', () => {
  const text = 'marker_id,chrom,pos_bp,S1,S2,S3\nm1,Gm01,100,.|.,NN,--\nm2,Gm01,200,.,,A\n';
  const g = parseWideCsv(text, 'nucleotide').genotypes;
  expect(Array.from(g.allele1)).toEqual([255, 255, 255, 255, 255, 0]);
});

it('coded mode rejects nucleotide-only missing tokens', () => {
  const text = 'marker_id,chrom,pos_bp,S1,S2\nm1,Gm01,100,A,B\nm2,Gm01,200,H,--\n';
  expect(detectWideCsvMode(text)).toBe('coded');
  expect(() => parseWideCsv(text)).toThrow(/unexpected cell "--"/);
  expect(() => parseWideCsv('marker_id,chrom,pos_bp,S1\nm1,Gm01,100,H\nm2,Gm01,200,NN\n')).toThrow(
    /unexpected cell "NN"/,
  );
});

it('nucleotide mode expands IUPAC codes and rejects every other stray cell', () => {
  // T in S1 forces nucleotide detection even when the other cell is B or H.
  const row = (cell: string): string => `marker_id,chrom,pos_bp,S1,S2\nm1,Gm01,100,T,${cell}\n`;
  for (const bad of ['?', 'B', 'H', 'X', 'XX', '0', '+', 'A?', 'N?', 'RR']) {
    expect(detectWideCsvMode(row(bad)), bad).toBe('nucleotide');
    expect(() => parseWideCsv(row(bad)), bad).toThrow(`unexpected cell "${bad}"`);
  }
  const g = parseWideCsv(row('R')).genotypes;
  expect(Array.from(g.allele1)).toEqual([0, 1]);
  expect(Array.from(g.allele2)).toEqual([0, 2]);
});
```

Add a new `describe` after it:

```ts
describe('nucleotide cell vocabulary (src/io/calls.ts)', () => {
  const wide = (cell: string) => parseNucleotideCell(cell, NUCLEOTIDE_MISSING, 'w');
  const hapmap = (cell: string) => parseNucleotideCell(cell, HAPMAP_MISSING, 'h');

  it('expands IUPAC codes to the heterozygote in both formats', () => {
    const expected: Record<string, [string, string]> = {
      R: ['A', 'G'],
      Y: ['C', 'T'],
      S: ['C', 'G'],
      W: ['A', 'T'],
      K: ['G', 'T'],
      M: ['A', 'C'],
    };
    for (const [code, pair] of Object.entries(expected)) {
      expect(wide(code), code).toEqual(pair);
      expect(hapmap(code.toLowerCase()), code).toEqual(pair);
    }
    expect(wide(' a/t ')).toEqual(['A', 'T']);
    expect(wide('G|C')).toEqual(['G', 'C']);
    expect(wide('AA')).toEqual(['A', 'A']);
    expect(wide('C')).toEqual(['C', 'C']);
  });

  it('reads the missing lists, X and XX in HapMap only', () => {
    for (const tok of ['', 'N', 'NN', 'NA', '-', '--', '.', './.', '.|.']) {
      expect(wide(tok), tok).toBeNull();
      expect(hapmap(tok), tok).toBeNull();
    }
    expect(hapmap('X')).toBeNull();
    expect(hapmap('XX')).toBeNull();
    expect(() => wide('X')).toThrow('w: unexpected cell "X"');
    expect(() => wide('XX')).toThrow('w: unexpected cell "XX"');
  });

  it('rejects every other cell in both formats', () => {
    for (const bad of ['?', 'B', 'H', '0', '+', 'Z', 'A?', 'N?', '?/?', 'RR', 'ACG', 'A//T']) {
      expect(() => wide(bad), bad).toThrow(`w: unexpected cell "${bad}"`);
      expect(() => hapmap(bad), bad).toThrow(`h: unexpected cell "${bad}"`);
    }
  });

  it('reads half-missing pairs as missing (undecided in 1.1.0; pins current behaviour)', () => {
    for (const cell of ['AN', 'NA/', 'A-', '-A', 'A.', './A', 'N/A']) {
      expect(wide(cell), cell).toBeNull();
      expect(hapmap(cell), cell).toBeNull();
    }
  });
});

describe('HapMap vocabulary', () => {
  const header =
    'rs#\talleles\tchrom\tpos\tstrand\tassembly#\tcenter\tprotLSID\tassayLSID\tpanelLSID\tQCcode\tS1\tS2\tS3\n';
  const fixed = '+\tNA\tNA\tNA\tNA\tNA\tNA';

  it("reads the contract's missing list including .|., X and XX", () => {
    const g = parseHapMap(
      header +
        `m1\tA/G\tGm01\t100\t${fixed}\t.|.\tX\tXX\n` +
        `m2\tA/G\tGm01\t200\t${fixed}\tR\tNA\tA\n`,
    ).genotypes;
    expect(Array.from(g.allele1)).toEqual([255, 255, 255, 0, 255, 0]);
    expect(Array.from(g.allele2)).toEqual([255, 255, 255, 1, 255, 0]);
  });

  it('rejects ?, +, 0 and single B or H naming the line', () => {
    for (const bad of ['?', '+', '0', 'B', 'H']) {
      expect(
        () => parseHapMap(header + `m1\tA/G\tGm01\t100\t${fixed}\tAA\tGG\t${bad}\n`),
        bad,
      ).toThrow(`HapMap line 2: unexpected cell "${bad}"`);
    }
  });
});
```

(`MISSING_ALLELE` is 255; tests may use the imported constant instead of the literal. `NA/` above is `NA/` three characters with `/` not in the middle, so it must throw, not be null: remove `'NA/'` from the half-missing list; the list is `['AN', 'A-', '-A', 'A.', './A', 'N/A']`.) Run `npx prettier --write tests/contracts.test.ts`.

## === PHASE A5: `.gitattributes` (OQ 5) ===

After line 14 (`contract/** text eol=lf`) add:

```
# Case files are the generator's bytes verbatim, including the CRLF cases of 1.1.0;
# with text unset git performs no conversion in either direction.
contract/cases/** -text
```

## === PHASE A6: ADR, docs/input-coding.md, README, Upload screen, CHANGELOG, PLAN ===

**New `docs/adr/0014-contract-1.1-alignment.md`** (run `npx prettier --write` on it):

```markdown
# Contract 1.1.0: one behaviour for the drifted inputs, decided item by item

Status: accepted. Date: 2026-09-14. Format: MADR 4.0.0 [web] https://adr.github.io/madr/.

## Context and Problem Statement

Contract 1.0.0 (docs/adr/0013) shipped the intersection of what isoline-browser and progeny-selector already read identically, and PLAN.md carried the list of inputs on which the two repositories, or a repository and the contract text, disagreed: delimiters and quoting, an optional `line_name`, genotype columns absent from the manifest, coded parents without columns, the id of a VCF record with ID `.`, undocumented chromosome spellings and missing tokens, IUPAC single letters read as a symbol here and as a heterozygote there, stray characters read as a symbol here and as missing there, the row window of A/B/H detection, the order of non-soybean chromosome names, and contract text that described this repository (content detection, streaming, columns found by name) rather than both. Which behaviour does the contract state for each, and which repository changes?

## Decision Drivers

Files must move between the two tools unchanged, so every input either loads the same in both or is rejected in both. Each expectation is written by hand from the specification, never by running a parser. Token meaning follows the file format, not the crop: soybean and maize both distribute TASSEL HapMap, so a rule that is safe for any diploid crop belongs in the core and a crop-specific reading belongs in a named profile. The contract bumps minor for additive tokens and rules.

## Considered Options

For each item: adopt this repository's behaviour, adopt the sibling's, or reject the input in both. For the vocabulary: a strict shared core now with named token profiles later, or per-load profiles now.

## Decision Outcome

Decided by the maintainer on 2026-09-14; contract 1.1.0.

1. Delimiters: wide CSV, samples.csv and markers.csv are comma or tab delimited, sniffed from the header line (more tabs than commas means tab), with RFC 4180 quoting. progeny-selector adopts the sniff; this repository already had it.
2. `line_name` is optional in both; only `sample_id` and `role` are required.
3. Genotype columns absent from samples.csv are dropped with a warning and the loaded samples follow manifest order. progeny-selector adopts this repository's `assembleDataset` behaviour.
4. Coded A/B/H files may omit the parent columns. Each repository may represent absent parents as it likes internally (this repository keeps them without columns; progeny-selector synthesises all-A and all-B columns), but a loader's reported sample list excludes parents that have no column in the file, and progeny-selector records which parents it synthesised.
5. A VCF record with ID `.` or empty is named `<CHROM>_<POS>` from CHROM as written in the file, before normalisation, matching bcftools `%CHROM_%POS`. progeny-selector adopts the raw form.
6. One chromosome pattern for both: optional prefix `Gm`, `Chr`, `Chromosome` or `LG`, optional `_`, space or `-`, then 1..20 with leading zeros; progeny-selector drops its `ch` prefix. Non-soybean names sort after Gm20 in natural (numeric-aware) order. Chromosome names are soybean-only in 1.1.0 and the contract says so. CRLF line ends and a leading UTF-8 byte-order mark are accepted on every text input.
7. One nucleotide cell vocabulary for HapMap and nucleotide wide CSV, held in one module per repository (`src/io/calls.ts` here, `io/calls.py` there): A C G T homozygous; R Y S W K M read as the IUPAC heterozygote in both formats, so this repository stops reading them as a one-letter symbol; pairs `AT`, `A/T`, `A|T`. Missing tokens: `""`, `N`, `NN`, `NA`, `-`, `--`, `.`, `./.`, `.|.` in wide CSV, the same plus `X` and `XX` in HapMap (TASSEL reads `-`/`--` as a deletion and `X`/`XX` as unknown; both are missing here, since neither tool models indels); `""`, `N`, `NA` in coded wide CSV. Everything else is an error naming the cell in both repositories: `?`, a single `B` or `H` in a nucleotide file, `0`, `+`, any other single character, `X`/`XX` in wide CSV, and a pair containing a character outside A C G T N - . (`A?`, `N?`). A pair of one nucleotide and one of N - . (`AN`, `A-`) is not decided; both repositories keep reading it as missing and PLAN.md lists it. Inputs are diploid calls; polyploid dosage is out of scope and the contract says so.
8. A/B/H auto-detection reads every non-missing cell in the file; this repository's 2000-row window and progeny-selector's 200-row window are removed.
9. Contract text describes the shared minimum, not this repository: a genotype file is selected by extension and must carry one; content detection and streaming are optional implementation notes. Wide CSV's first three columns are `marker_id`, `chrom`, `pos_bp` in that order; this repository's by-name lookup is documented as accepting more. No code changes for this item.

Version: 1.1.0, a minor bump under docs/adr/0013, on this reading of its rule: input that 1.0.0 never stated (`?`, a stray `B`, `A?`) is not contract vocabulary, so rejecting it is a stricter reading of the existing vocabulary, not a changed or removed rule.

Deferred to contract 1.2.0, after M3: named token profiles under `contract/profiles/` (`tassel`; `soybase-report`, where `H` is heterozygous and `U` missing; `dart`; `axiom`; user-supplied), recorded in every export, and a crop selector deferred together with them. Before 1.2.0 is designed, research verifies whether genotype-token conventions and chromosome nomenclature really are the same across crops: if they are, the crop selector is a chromosome scheme only; if not, each crop's profile carries its own tokens. First-release crops: soybean (default), maize, rice, sorghum and the other staples bred in public universities that the research names. PLAN.md carries the same design note.

Each item has a case under `contract/cases/` except whole-file detection, whose case would exceed the size limit and which each repository unit-tests, and item 9, which no case can distinguish. The error kind `genotypes.unknown_cell` is added for a cell that is neither a call nor a missing token in the resolved format and mode.

### Consequences

Good: a file that loads in one tool loads in the other with the same markers, samples and calls, or fails in both; the vocabulary lives in one module per repository, so the next token decision is one edit each. Bad: this repository's coded mode now rejects `-`, `--`, `.`, `./.`, `.|.` and `NN`, which it accepted before 1.1.0; its nucleotide wide CSV rejects `?`, `B`, `H`, `X`, `0`, `+`, `A?` and every other stray cell it read as an allele symbol, and reads `R` as A/G rather than as a symbol; its HapMap rejects the same stray cells; a user with such a file sees an error naming the line and the cell, and docs/input-coding.md tells them what is accepted. Neutral: half-missing pairs (`AN`, `A-`) stay undecided and are read as missing by both tools; token profiles and the crop selector wait for 1.2.0.

## More Information

docs/adr/0013-versioned-data-contract.md; contract/README.md; docs/input-coding.md; progeny-selector docs/adr/0010, which records the same decisions from the sibling's side.
```

**New `docs/input-coding.md`** (run `npx prettier --write` on it):

```markdown
# Input coding reference

What each genotype format accepts, reads as missing, and rejects, under contract 1.1.0 (`contract/data-contract.md`). The same rules apply in progeny-selector, so a file that loads here loads there. Cells are trimmed and case-insensitive. Every call is diploid (two alleles per sample per marker); polyploid dosage is out of scope. Chromosome names are soybean-only in this version (`Gm01`..`Gm20`; any other name is kept as written).

| Format               | Accepted calls                                                                                                                               | Missing                                                          | Rejected (error naming the line and cell)                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| VCF 4.2+             | GT allele indices into REF,ALT (`0/1`, `0\|1`, `1/2`); haploid `1` as homozygous                                                             | `.` as either allele (`./.`, `.`)                                | a record whose FORMAT has no GT                                                                                       |
| HapMap               | `AA`, `AT`, `A/T`, `A\|T`, `A`; one IUPAC code `R Y S W K M` read as the heterozygote (R = A/G, Y = C/T, S = C/G, W = A/T, K = G/T, M = A/C) | empty, `N`, `NN`, `NA`, `-`, `--`, `.`, `./.`, `.\|.`, `X`, `XX` | `?`, `B`, `H`, `0`, `+`, any other single character; a pair with a character outside A C G T N - . (`A?`, `N?`, `RR`) |
| Wide CSV, nucleotide | as HapMap                                                                                                                                    | empty, `N`, `NN`, `NA`, `-`, `--`, `.`, `./.`, `.\|.`            | as HapMap, plus `X` and `XX`                                                                                          |
| Wide CSV, coded      | `A` (recurrent parent), `B` (donor), `H` (heterozygous)                                                                                      | empty, `N`, `NA`                                                 | everything else, including `-`, `--`, `.`, `./.`, `.\|.`, `NN`                                                        |

A wide CSV is read as coded when every cell outside the nucleotide missing list is `A`, `B` or `H` and at least one `B` or `H` occurs; otherwise as nucleotide, where a single `B` or `H` is then an error.

A pair of one nucleotide and one of `N`, `-`, `.` (`AN`, `A-`) is read as missing by both tools today but is not yet part of the contract.

Crop-specific token profiles (TASSEL, SoyBase allele reports with `H`/`U`, DArT, Axiom, your own) arrive with contract 1.2.0; until then token meaning follows the file format, not the crop.
```

**`README.md`**

- Line 32, append to the paragraph: ` What each format accepts, reads as missing and rejects is tabulated in docs/input-coding.md.`
- Line 36: `docs/data-formats.md,` → `docs/data-formats.md, docs/input-coding.md,`.

**`src/ui/screens/UploadScreen.tsx`**

- After line 22 (the last import) add:

```ts
/** docs/input-coding.md on the repository; the static site does not serve docs/. */
const INPUT_CODING_URL =
  'https://github.com/piercetaylor/isoline-browser/blob/main/docs/input-coding.md';
```

- Line 128 (`<p>Files are processed in this browser tab and never uploaded anywhere.</p>`) becomes:

```tsx
<p>
  Files are processed in this browser tab and never uploaded anywhere. Accepted, missing and
  rejected genotype codes per format:{' '}
  <a className="input-coding-link" href={INPUT_CODING_URL} target="_blank" rel="noreferrer">
    input coding reference
  </a>
  .
</p>
```

- Header comment line 10–11: after `Shows parser` … `once \`loaded\` is set.`add the sentence`Links docs/input-coding.md (the accepted, missing and rejected codes per format) from the intro paragraph.`
- No colour, dimension or `style` attribute is added, so `eslint/ui-literal-selectors.json` passes; run `npx prettier --write src/ui/screens/UploadScreen.tsx`.

**`src/ui/screens/screens.css`**: after `.keyboard-help { ... }` (line 271) add:

```css
.input-coding-link {
  color: var(--color-text);
  text-decoration: underline;
}
```

(`--color-text` is an existing token, used at `src/ui/base.css:34`.)

**`CHANGELOG.md`** under `## [Unreleased]` / `### Changed` (line 10), add as the first bullet:

```
- Data contract 1.1.0 (docs/adr/0014): the chromosome pattern now states the `Chromosome` and `LG` prefixes and the `_`, space and `-` separators (soybean-only in this version); non-soybean names order naturally; one nucleotide vocabulary for HapMap and wide CSV (`src/io/calls.ts`): IUPAC codes R Y S W K M are read as the heterozygote in wide CSV too, the missing tokens are listed per format and mode (`.|.` added; `X`, `XX` in HapMap only; coded mode accepts only empty, `N` and `NA`, so `-`, `--`, `.`, `./.`, `.|.` and `NN` in an A/B/H file are now errors naming the cell), and every other cell (`?`, a stray `B` or `H`, `0`, `+`, `A?`, `X`/`XX` in wide CSV) is now an error naming the line and cell instead of an allele symbol; A/B/H auto-detection reads the whole file instead of its first 2000 rows; CRLF line ends and a leading byte-order mark are documented; `line_name` is documented optional; samples load in manifest order with absent genotype columns dropped; a VCF record with ID `.` is named from CHROM as written; the genotype-file paragraph and the wide-CSV column order state the shared minimum; calls are diploid only. Fifteen new cases under `contract/cases/`. New docs/input-coding.md, linked from the README and the Upload screen.
```

**`docs/data-formats.md`**: done in A1; run `npx prettier --write docs/data-formats.md`.

**`PLAN.md`** (answer 10: applied by the main session after review, not by the doer). Replacement for lines 138–150 (the two "Open for M3" / "Also open" blocks and the S1 sentence):

> **Settled 2026-09-14 by the maintainer, recorded in docs/adr/0014 and shipped as contract 1.1.0**: delimiters and quoting, optional `line_name`, dropped extra columns with manifest order, coded parents without columns, raw CHROM in `<CHROM>_<POS>`, the shared chromosome pattern and natural order (soybean-only names), one nucleotide vocabulary for HapMap and wide CSV (IUPAC codes expand to the heterozygote in both; missing lists per format; `?`, stray `B`/`H`, `0`, `+`, `A?` and `X`/`XX` in wide CSV rejected), whole-file A/B/H detection, CRLF and BOM, extension-only format selection as the shared minimum, the fixed first three wide-CSV columns, diploid-only calls. Still open: a pair of one nucleotide and one of N, `-`, `.` (`AN`, `A-`), read as missing by both tools and not in the contract. Contract 1.2.0, after M3: named token profiles under `contract/profiles/` (`tassel`, `soybase-report` with H het and U missing, `dart`, `axiom`, user-supplied), recorded in every export, and a crop selector deferred with them; research first verifies whether token conventions and nomenclature are the same across crops (if yes, the selector is a chromosome scheme only; if not, each crop's profile carries its tokens); first-release crops soybean (default), maize, rice, sorghum and the other public-university staples the research names.

## === PHASE A7: gates (IB, from repo root) ===

```
npm run lint
npm run typecheck
npm test
npm run test:browser      # needs PLAYWRIGHT_BROWSERS_PATH (CLAUDE.md)
npm run build
npm run fixture
npm run contract
```

Report the last line printed by `npm run contract` (`contract 1.1.0: 28 cases, N files, B bytes`). `npm run fixture` must change no file under `tests/fixtures/` (A3's dependency check). The main session runs `git diff --exit-code -- tests/fixtures contract` and the commit.

---

# ============ PHASE B: progeny-selector ============

Prerequisite: Phase A committed. Files touched: `contract/**` (new, copied), `.gitignore`, `.gitattributes`, `src/progeny_selector/constants.py`, `src/progeny_selector/io/delimited.py` (new), `io/calls.py`, `io/manifest.py`, `io/wide_csv.py`, `io/vcf.py`, `io/hapmap.py`, `core/chrom.py`, `model/dataset.py`, `core/pipeline.py`, `tests/test_contract_cases.py` (new), `tests/test_io.py`, `tests/test_classify.py`, `docs/data-formats.md`, `docs/adr/0010-contract-1.1-alignment.md` (new), `CHANGELOG.md`, `PLAN.md` (OQ 10). `scripts/make_fixture.py` and `tests/fixtures/**` are unchanged: the fixture is a VCF with parents first, every column in the manifest, Gm01..Gm20 only, so decisions 2, 3, 4, 8 change no fixture byte (verified by the fixture gate in B7).

## === PHASE B1: mirror and git attributes ===

1. Copy `..\isoline-browser\contract` to `.\contract` byte for byte (PowerShell: `Copy-Item -Recurse -Force ..\isoline-browser\contract .\contract`; no text-mode tool). The result holds `README.md`, `VERSION`, `data-contract.md`, `MANIFEST.sha256`, `cases/<28 dirs>`.
2. `.gitignore`: after line 37 (`!tests/fixtures/**`) add `!contract/**`.
3. `.gitattributes`: append

```

# The data contract (contract/) is mirrored byte for byte from isoline-browser and hashed
# in MANIFEST.sha256; its text is LF on every checkout, its case files are the generator's
# bytes verbatim (some are CRLF by design), and its gzip and bgzip cases are never normalised.
contract/** text eol=lf
contract/cases/** -text
*.gz binary
*.bgz binary
```

## === PHASE B2: constants and call parsing ===

**Sharing check.** PS's HapMap reader shares the wide-CSV missing set: `io/hapmap.py:21` imports `parse_nucleotide_call`, which reads `MISSING_TOKENS` (`io/calls.py:20,37`); `grep MISSING_TOKENS src/` finds no other user. Separation: the `missing` parameter below (default = the wide-CSV nucleotide set, so `read_wide_csv` is unaffected) and a `HAPMAP_MISSING` literal that `read_hapmap` passes explicitly (B3). `parse_nucleotide_call` already expands IUPAC codes (`calls.py:43-44`) and already raises for a two-character cell with a stray character (`calls.py:46-50`); the only behaviour changes in PS are `?` leaving the missing set, the single-character branch raising instead of returning `None` (`calls.py:45`), and `X`/`XX` joining the HapMap set.

**`src/progeny_selector/constants.py`** line 118: replace `MISSING_TOKENS = ...` with

```python
# Wide-CSV missing tokens per mode (contract/data-contract.md 1.1.0, "Wide CSV"). `?` is not missing.
WIDE_NUCLEOTIDE_MISSING: frozenset[str] = frozenset({"", "N", "NN", "NA", "-", "--", ".", "./.", ".|."})
WIDE_CODED_MISSING: frozenset[str] = frozenset({"", "N", "NA"})
# HapMap missing tokens (contract 1.1.0, "HapMap"): the wide-CSV nucleotide list plus TASSEL's X/XX.
HAPMAP_MISSING: frozenset[str] = WIDE_NUCLEOTIDE_MISSING | {"X", "XX"}
```

`MISSING_TOKENS` is deleted (its only user is `calls.py`).

**New `src/progeny_selector/io/delimited.py`**:

```python
"""Text opening and delimiter sniffing shared by every reader.

Responsibility: open plain or gzip/bgzip text as UTF-8 with a leading
byte-order mark removed (contract 1.1.0 accepts CRLF and a BOM on every
text input), and choose the delimiter of a CSV/TSV from its header line
by the contract's rule: more tabs than commas means tab, otherwise comma.

Interface:
    open_text(path, newline=None) -> TextIO
    read_text(path) -> str            (newline="" so the csv module sees CRLF itself)
    sniff_delimiter(text) -> str      ("\\t" or ",")
"""

from __future__ import annotations

import gzip
from pathlib import Path
from typing import TextIO


def open_text(path: str | Path, newline: str | None = None) -> TextIO:
    if str(path).endswith((".gz", ".bgz")):
        return gzip.open(path, "rt", encoding="utf-8-sig", newline=newline)
    return open(path, encoding="utf-8-sig", newline=newline)


def read_text(path: str | Path) -> str:
    with open_text(path, newline="") as fh:
        return fh.read()


def sniff_delimiter(text: str) -> str:
    first = text.split("\n", 1)[0]
    return "\t" if first.count("\t") > first.count(",") else ","
```

**`src/progeny_selector/io/calls.py`**

- Line 20: `from progeny_selector.constants import WIDE_CODED_MISSING, WIDE_NUCLEOTIDE_MISSING`.
- `parse_nucleotide_call` signature becomes `parse_nucleotide_call(text: str, missing: frozenset[str] = WIDE_NUCLEOTIDE_MISSING) -> tuple[str, str] | None`; line 37 `if t in missing:`; lines 44–45 (`if t in IUPAC_HET: ... return None`) become:

```python
        if t in IUPAC_HET:
            return IUPAC_HET[t]
        raise ValueError(f"unrecognised nucleotide call {text!r}")
```

- Line 35 docstring: `"""Accept "A", "AA", "AT", "A/T", "A|T" and the IUPAC codes R Y S W K M (expanded); return the sorted allele pair, None for a token in ``missing`` or a pair with N, - or . (half-missing, undecided in contract 1.1.0); ValueError for any other cell ("?", "B", "H", "X", "0", "+", "A?")."""`
- `parse_coded_call`: line 56 `if t in WIDE_CODED_MISSING:`; line 64 message `f"unrecognised coded call {text!r} (expected A, B, H, N, NA or empty)"`.
- `detect_coding`: line 72 `if t in WIDE_NUCLEOTIDE_MISSING:` (OQ 2). The `len(seen) > 8` early exit stays (it cannot change the result). Docstring: `"""'abh' when every cell outside the nucleotide missing set is A, B or H and at least one B or H occurs; else 'nucleotide'. Scans every value given."""`
- Module docstring line 1: `"""Shared call-string parsing for HapMap and wide-CSV inputs (contract/data-contract.md 1.1.0; mirrors isoline-browser src/io/calls.ts).`; line 8: `parse_nucleotide_call(text, missing=WIDE_NUCLEOTIDE_MISSING) -> tuple[str, str] | None (None = missing; ValueError for any other cell, including "?")`.

## === PHASE B3: readers ===

**`src/progeny_selector/io/manifest.py`**

- Line 18 add `import io`; add `from progeny_selector.io.delimited import read_text, sniff_delimiter`.
- Line 26: `SAMPLE_REQUIRED = ("sample_id", "role")`.
- `_read_rows` lines 31–32 become:

```python
    text = read_text(path)
    reader = csv.DictReader(io.StringIO(text, newline=""), delimiter=sniff_delimiter(text))
    if reader.fieldnames is None:
        raise DataContractError(f"{path}: empty file")
```

(remove the `with open(...)` block; the rest of the function body is unchanged, dedented).

- `build_dataset` (lines 117–134) becomes:

```python
def build_dataset(gm: GenotypeMatrix, samples: list[Sample]) -> Dataset:
    """Join manifest and genotypes: synthesise parents for coded input and record them, drop genotype
    columns absent from the manifest, order the columns as the manifest, report mismatches."""
    warnings: list[str] = []
    rp = next(s for s in samples if s.role == "recurrent_parent")
    dp = next(s for s in samples if s.role == "donor_parent")
    synthetic: tuple[str, ...] = ()
    if gm.coded:
        before = set(gm.sample_ids)
        gm = add_synthetic_parents(gm, rp.sample_id, dp.sample_id)
        synthetic = tuple(s for s in (rp.sample_id, dp.sample_id) if s not in before)
        if synthetic:
            warnings.append("A/B/H-coded input: parent columns synthesised (recurrent = A, donor = B)")
    manifest_ids = [s.sample_id for s in samples]
    absent = [s for s in manifest_ids if s not in gm.sample_ids]
    if absent:
        raise DataContractError(f"samples in manifest but not in genotype file: {absent[:10]}{'...' if len(absent) > 10 else ''}")
    extra = [s for s in gm.sample_ids if s not in set(manifest_ids)]
    if extra:
        warnings.append(f"{len(extra)} genotype column(s) not in samples.csv dropped: {', '.join(extra[:5])}{', ...' if len(extra) > 5 else ''}")
    gm = gm.select_samples(manifest_ids)
    return Dataset(genotypes=gm, samples=samples, warnings=warnings, synthetic_sample_ids=synthetic)
```

- Docstring line 5: `validate them against contract/data-contract.md`.

**`src/progeny_selector/io/wide_csv.py`**

- Replace imports `csv, gzip` with `import csv`, `import io`; add `from progeny_selector.io.delimited import read_text, sniff_delimiter`.
- `read_wide_csv` lines 28–42 become:

```python
    path = Path(path)
    text = read_text(path)
    reader = csv.reader(io.StringIO(text, newline=""), delimiter=sniff_delimiter(text))
    header = [h.strip() for h in next(reader, [])]
    if tuple(h.lower() for h in header[:3]) != FIXED:
        raise DataContractError(f"wide CSV must start with columns {FIXED}, found {header[:3]}")
    sample_ids = header[3:]
    if not sample_ids:
        raise DataContractError("wide CSV has no sample columns")
    records = [row for row in reader if any(cell.strip() for cell in row)]
    if not records:
        raise DataContractError("wide CSV has no marker rows")
    if coding == "auto":
        coding = detect_coding(cell for row in records for cell in row[3:])
```

- Lines 49–55 (the per-row parse) wrapped:

```python
        try:
            markers.append(Marker(marker_id=row[0].strip(), chrom=normalize_chrom(row[1]), pos_bp=int(float(row[2]))))
            if coding == "abh":
                pairs = np.array([parse_coded_call(c) for c in row[3:]], dtype=np.int8)
                alleles.append(["A", "B"])
            else:
                allele_list, pairs = encode_marker([parse_nucleotide_call(c) for c in row[3:]])
                alleles.append(allele_list)
        except ValueError as exc:
            raise DataContractError(f"line {line_no}: {exc}") from exc
```

- Docstring lines 3–5: `parse nucleotide calls ("A", "AT", "A/T", IUPAC codes expanded; any other cell such as "?", a stray "B" or "H", "X", "0", "+" or "A?" is an error) or A/B/H coding with auto-detection over every row; the first three columns are marker_id, chrom, pos_bp in that order (contract 1.1.0); comma or tab delimited (sniffed from the header), RFC 4180 quoting, CRLF and a leading BOM accepted; when coded, the parents may be absent from the file and are synthesised as all-A (recurrent) and all-B (donor) by build_dataset, which records them in Dataset.synthetic_sample_ids.`

**`src/progeny_selector/io/vcf.py`**

- Delete `_open_text` (lines 25–28) and `import gzip`; add `from progeny_selector.io.delimited import open_text`; line 49 `with open_text(path) as fh:`.
- Lines 56 and 63: `line.rstrip("\n")` → `line.rstrip("\r\n")`.
- Line 75: `marker_id = mid if mid not in (".", "") else f"{chrom}_{pos}"`.
- Docstring line 7: `Records with ID "." or empty get "<CHROM>_<POS>" from CHROM as written in the file, before normalisation (contract 1.1.0).`

**`src/progeny_selector/io/hapmap.py`**

- Docstring lines 3–7 replace with:

```
Responsibility: parse the 11 fixed columns (rs#, alleles, chrom, pos, strand,
assembly#, center, protLSID, assayLSID, panelLSID, QCcode) followed by one
column per sample; calls go through calls.parse_nucleotide_call with the HapMap
missing list "", N, NN, NA, -, --, ., ./., .|., X, XX (contract/data-contract.md
1.1.0, "HapMap"); IUPAC codes expand; any other cell is an error naming the line.
Column facts [web]
https://statgen-esalq.github.io/Hapmap-and-VCF-formats-and-its-integration-with-onemap/.
```

- Delete `import gzip` and the `opener` line; add `from progeny_selector.constants import HAPMAP_MISSING` and `from progeny_selector.io.delimited import open_text`; line 33 `with open_text(path) as fh:`.
- Lines 34 and 41: `rstrip("\n")` → `rstrip("\r\n")`.
- Line 44 becomes:

```python
            try:
                calls = [parse_nucleotide_call(t, HAPMAP_MISSING) for t in fields[N_FIXED:]]
            except ValueError as exc:
                raise DataContractError(f"line {line_no}: {exc}") from exc
```

## === PHASE B4: chromosomes, dataset, pipeline ===

**`src/progeny_selector/core/chrom.py`**

- Line 20: `_SOY_PATTERN = re.compile(r"^(?:gm|chr|chromosome|lg)?[_\s-]?0*([1-9]|1[0-9]|20)$", re.IGNORECASE)`; add `_DIGIT_RUN = re.compile(r"([0-9]+)")`.
- Docstring lines 3–6: `map the chromosome spellings accepted by the contract (prefix Gm, Chr, Chromosome or LG, optional _, space or - separator, 1..20 with leading zeros; contract/data-contract.md 1.1.0) onto the canonical "Gm06", keep other names unchanged, and provide a sort key that puts Gm01..Gm20 first and everything else after them in natural (numeric-aware) order, the same order as isoline-browser's compareChromosomes.`
- Line 10: `chrom_sort_key(name: str) -> tuple[int, tuple[tuple[int, str], ...]]`.
- Replace `chrom_sort_key` (lines 32–37) with:

```python
def _natural_key(name: str) -> tuple[tuple[int, str], ...]:
    """Split on digit runs: even parts are text, odd parts are numbers, so aligned parts share a type."""
    parts = _DIGIT_RUN.split(name)
    return tuple((int(p), "") if i % 2 else (0, p) for i, p in enumerate(parts))

def chrom_sort_key(name: str) -> tuple[int, tuple[tuple[int, str], ...]]:
    """Gm01..Gm20 numerically first, then any other name in natural order (scaffold_2 before scaffold_10)."""
    canonical = normalize_chrom(name)
    if canonical in SOYBEAN_CHROMOSOMES:
        return (SOYBEAN_CHROMOSOMES.index(canonical), ())
    return (len(SOYBEAN_CHROMOSOMES), _natural_key(canonical))
```

Callers (`core/background.py:45,88`, `core/strip.py:60`, `model/dataset.py:113`) use it only as `key=`; no change.

**`src/progeny_selector/model/dataset.py`**

- In `GenotypeMatrix`, after `with_samples_added` add:

```python
    def select_samples(self, sample_ids: list[str]) -> GenotypeMatrix:
        """Columns for ``sample_ids`` in that order; every id must be present."""
        idx = [self.sample_index(s) for s in sample_ids]
        if idx == list(range(self.n_samples)):
            return self
        return GenotypeMatrix(
            markers=self.markers,
            sample_ids=list(sample_ids),
            alleles=self.alleles,
            calls=self.calls[:, idx],
            coded=self.coded,
        )
```

- In `Dataset`, after `warnings: list[str] = field(default_factory=list)` add `synthetic_sample_ids: tuple[str, ...] = ()` with the docstring line `synthetic_sample_ids: parents of a coded file that had no genotype column and were synthesised by build_dataset; they are not part of the loaded sample list the contract describes.`
- Interface docstring: add `GenotypeMatrix.select_samples(sample_ids) -> GenotypeMatrix` and `Dataset.synthetic_sample_ids`.
- Line 26 docstring: `Raised when an input file violates contract/data-contract.md or docs/data-formats.md.`

**`src/progeny_selector/core/pipeline.py`** line 62:

```python
    dataset = Dataset(genotypes=gm, samples=dataset.samples, warnings=list(dataset.warnings), synthetic_sample_ids=dataset.synthetic_sample_ids)
```

## === PHASE B5: tests ===

**`tests/test_io.py`**

- After line 5 (`import gzip`) add `import re`.
- Line 44: `assert gm.markers[1].marker_id == "6_2000"` (decision 5; CHROM is `6` on that line).
- Line 89 unchanged (still 4 samples, the "synthesised" warning stays). Add after it: `assert ds.synthetic_sample_ids == ("RP", "DONOR") and ds.genotypes.sample_ids == ["RP", "DONOR", "P1", "P2"]`.
- Add tests:

```python
HAPMAP_HEADER = "rs#\talleles\tchrom\tpos\tstrand\tassembly#\tcenter\tprotLSID\tassayLSID\tpanelLSID\tQCcode"
HAPMAP_FIXED = "+\tNA\tNA\tNA\tNA\tNA\tNA"


def test_manifest_tab_no_line_name(tmp_path: Path):
    s = tmp_path / "s.tsv"
    s.write_bytes("\ufeffsample_id\trole\r\nRP\trecurrent_parent\r\nDONOR\tdonor_parent\r\nP1\tprogeny\r\n".encode())
    rows = read_samples(s)
    assert [x.sample_id for x in rows] == ["RP", "DONOR", "P1"] and rows[2].line_name == "P1"


def test_wide_csv_tab_quoted_bom_crlf(tmp_path: Path):
    p = tmp_path / "g.tsv"
    p.write_bytes('\ufeffmarker_id\tchrom\tpos_bp\tRP\tDONOR\t"P1"\r\nm1\tGm06\t1000\tA\tT\t"A/T"\r\nm2\tGm06\t2000\tC\tG\t.|.\r\n'.encode())
    gm = read_wide_csv(p)
    assert gm.sample_ids == ["RP", "DONOR", "P1"]
    assert tuple(gm.calls[0, 2]) == (0, 1) and tuple(gm.calls[1, 2]) == (-1, -1)


def test_extra_columns_dropped_manifest_order(tmp_path: Path):
    p = tmp_path / "g.csv"
    p.write_text("marker_id,chrom,pos_bp,EXTRA,P1,RP,DONOR\nm1,Gm06,1000,A,A/T,A,T\n")
    s = tmp_path / "s.csv"
    s.write_text("sample_id,role\nDONOR,donor_parent\nP1,progeny\nRP,recurrent_parent\n")
    ds = load_dataset(p, s)
    assert ds.genotypes.sample_ids == ["DONOR", "P1", "RP"]
    assert tuple(ds.genotypes.calls[0, 1]) == (0, 1)
    assert any(w.startswith("1 genotype column(s) not in samples.csv dropped: EXTRA") for w in ds.warnings)


def test_coded_synthetic_parents_tracked(tmp_path: Path):
    p = tmp_path / "c.csv"
    p.write_text("marker_id,chrom,pos_bp,P2,P1\nm1,Gm06,1000,B,H\n")
    s = tmp_path / "s.csv"
    s.write_text("sample_id,role\nRP,recurrent_parent\nP1,progeny\nDONOR,donor_parent\nP2,progeny\n")
    ds = load_dataset(p, s)
    assert ds.synthetic_sample_ids == ("RP", "DONOR")
    assert ds.genotypes.sample_ids == ["RP", "P1", "DONOR", "P2"]


def test_wide_missing_tokens_per_mode(tmp_path: Path):
    p = tmp_path / "g.csv"
    p.write_text("marker_id,chrom,pos_bp,S1,S2,S3\nm1,Gm06,100,.|.,NN,--\nm2,Gm06,200,.,,A\n")
    gm = read_wide_csv(p)
    assert (gm.calls[0] == -1).all() and tuple(gm.calls[1, 2]) == (0, 0)
    p.write_text("marker_id,chrom,pos_bp,S1,S2\nm1,Gm06,100,A,B\nm2,Gm06,200,H,--\n")
    with pytest.raises(DataContractError, match="line 3: unrecognised coded call '--'"):
        read_wide_csv(p)


def test_nucleotide_iupac_expands(tmp_path: Path):
    p = tmp_path / "g.csv"
    p.write_text("marker_id,chrom,pos_bp,S1,S2\nm1,Gm06,100,T,R\nm2,Gm06,200,y,S\n")
    gm = read_wide_csv(p)
    assert gm.alleles[0] == ["A", "G", "T"] and tuple(gm.calls[0, 1]) == (0, 1)
    assert gm.alleles[1] == ["C", "G", "T"] and tuple(gm.calls[1, 0]) == (0, 2) and tuple(gm.calls[1, 1]) == (0, 1)


def test_nucleotide_rejects_stray_cells(tmp_path: Path):
    p = tmp_path / "g.csv"
    for bad in ("?", "B", "H", "X", "XX", "0", "+", "A?", "N?", "RR"):  # T in S1 forces nucleotide detection
        p.write_text(f"marker_id,chrom,pos_bp,S1,S2\nm1,Gm06,100,T,{bad}\n")
        with pytest.raises(DataContractError, match=rf"line 2: unrecognised nucleotide call '{re.escape(bad)}'"):
            read_wide_csv(p)


def test_half_missing_pairs_unchanged(tmp_path: Path):
    """Undecided in contract 1.1.0 (PLAN.md): a pair with N, - or . reads as missing, as before."""
    p = tmp_path / "g.csv"
    p.write_text("marker_id,chrom,pos_bp,S1,S2,S3,S4\nm1,Gm06,100,T,AN,A-,./A\n")
    gm = read_wide_csv(p)
    assert (gm.calls[0, 1:] == -1).all() and gm.alleles[0] == ["T"]


def test_hapmap_missing_tokens(tmp_path: Path):
    p = tmp_path / "g.hmp.txt"
    p.write_text(
        f"{HAPMAP_HEADER}\tS1\tS2\tS3\tS4\n"
        f"m1\tA/T\t6\t1000\t{HAPMAP_FIXED}\tNA\t./.\t.\tAT\n"
        f"m2\tA/T\t6\t2000\t{HAPMAP_FIXED}\tN\tNN\t-\t--\n"
        f"m3\tA/T\t6\t3000\t{HAPMAP_FIXED}\t\tA\tT\tW\n"
        f"m4\tA/T\t6\t4000\t{HAPMAP_FIXED}\t.|.\tX\tXX\tA\n"
    )
    gm = load_genotypes(p)
    assert (gm.calls[0, :3] == -1).all() and tuple(gm.calls[0, 3]) == (0, 1)
    assert (gm.calls[1] == -1).all()
    assert tuple(gm.calls[2, 0]) == (-1, -1) and tuple(gm.calls[2, 1]) == (0, 0) and tuple(gm.calls[2, 3]) == (0, 1)
    assert (gm.calls[3, :3] == -1).all() and tuple(gm.calls[3, 3]) == (0, 0)


def test_hapmap_rejects_stray_cells(tmp_path: Path):
    p = tmp_path / "g.hmp.txt"
    for bad in ("?", "+", "0", "B", "H", "A?"):
        p.write_text(f"{HAPMAP_HEADER}\tS1\tS2\n" f"m1\tA/T\t6\t1000\t{HAPMAP_FIXED}\tAA\t{bad}\n")
        with pytest.raises(DataContractError, match=rf"line 2: unrecognised nucleotide call '{re.escape(bad)}'"):
            load_genotypes(p)


def test_coding_detection_scans_every_row(tmp_path: Path):
    header = "marker_id,chrom,pos_bp,S1\n"
    body = "".join(f"m{i},Gm01,{i + 1},A\n" for i in range(250))
    p = tmp_path / "late.csv"
    p.write_text(header + body + "late,Gm01,999,B\n")
    assert read_wide_csv(p).coded
    p.write_text(header + "h,Gm01,1,H\n" + body + "late,Gm01,999,T\n")
    with pytest.raises(DataContractError, match="unrecognised nucleotide call 'H'"):
        read_wide_csv(p)  # detected as nucleotide because of the late T; a single H is then an error


def test_vcf_crlf_bom(tmp_path: Path):
    p = tmp_path / "g.vcf"
    p.write_bytes(("\ufeff" + VCF.replace("\n", "\r\n")).encode())
    gm = load_genotypes(p)
    assert gm.sample_ids == ["RP", "DONOR", "P1"] and tuple(gm.calls[2, 2]) == (-1, -1)
```

(`test_hapmap_missing_tokens` row m3: the empty S1 cell sits between two tabs, so `split("\t")` keeps it; m4: `A` alone at a marker whose other cells are missing gives alleles `["A"]`, call `(0, 0)`.)

**`tests/test_classify.py`** `test_chromosome_normalisation` becomes:

```python
def test_chromosome_normalisation():
    for name in ("Gm06", "gm6", "chr6", "Chr06", "6", "06", "chromosome6", "Chromosome_06", "LG6", "Gm-6", "gm 6"):
        assert normalize_chrom(name) == "Gm06"
    assert normalize_chrom("scaffold_12") == "scaffold_12"
    assert normalize_chrom("ch6") == "ch6"
    assert chrom_sort_key("Gm20") < chrom_sort_key("scaffold_12")
    assert chrom_sort_key("Gm02") < chrom_sort_key("Gm10")


def test_chromosome_natural_order():
    names = ["scaffold_10", "Gm10", "scaffold_2", "Gm02", "Gm01", "ch7"]
    assert sorted(names, key=chrom_sort_key) == ["Gm01", "Gm02", "Gm10", "ch7", "scaffold_2", "scaffold_10"]
```

**New `tests/test_contract_cases.py`**:

```python
"""The shared data contract (contract/README.md), checked against this repository's loaders.

Every directory under contract/cases/ is loaded through load_dataset (genotypes.<ext>,
samples.csv, optional markers.csv), normalised to the language-neutral shape of
expected.json and compared; an error case must raise DataContractError matching the
pattern its kind maps to below. The kind-to-pattern table lives here, not in the
contract, so rewording a message is a change to this test. The manifest and the
version string are checked too. Mirrors isoline-browser tests/contract-cases.test.ts.
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import pytest

from progeny_selector.core.chrom import chrom_sort_key
from progeny_selector.io import load_dataset
from progeny_selector.model.dataset import DataContractError, Dataset

CONTRACT = Path(__file__).resolve().parent.parent / "contract"
CASES = CONTRACT / "cases"
VERSION = (CONTRACT / "VERSION").read_bytes().decode("utf-8").strip()

ERROR_KIND_PATTERNS: dict[str, str] = {
    "manifest.roles": r"exactly one (recurrent_parent|donor_parent) required|no progeny or candidate samples",
    "manifest.unknown_role": r"has role .* expected one of",
    "manifest.duplicate_sample": r"duplicate sample_id",
    "dataset.sample_missing": r"samples in manifest but not in genotype file",
    "genotypes.duplicate_marker": r"duplicate marker_id in genotype file",
    "genotypes.no_gt": r"FORMAT has no GT",
    "genotypes.no_header": r"VCF data line before #CHROM header|VCF contains no variant records|HapMap header must start with rs#|wide CSV must start with columns",
    "genotypes.unknown_cell": r"unrecognised (coded|nucleotide) call",
}

CASE_NAMES = sorted(p.name for p in CASES.iterdir() if p.is_dir())

def normalise_dataset(ds: Dataset, version: str) -> dict:
    """expected.json shape: markers in (chromosome order, position), cm None when absent; sampleIds in
    manifest order excluding synthetic parents; calls as sorted allele symbols or None."""
    gm = ds.genotypes.sorted_by_position()
    sample_ids = [s for s in gm.sample_ids if s not in ds.synthetic_sample_ids]
    calls: dict[str, list[list[str] | None]] = {}
    for sid in sample_ids:
        col = gm.sample_index(sid)
        per_marker: list[list[str] | None] = []
        for m in range(gm.n_markers):
            a, b = int(gm.calls[m, col, 0]), int(gm.calls[m, col, 1])
            per_marker.append(None if a < 0 or b < 0 else sorted([gm.alleles[m][a], gm.alleles[m][b]]))
        calls[sid] = per_marker
    return {
        "contractVersion": version,
        "coded": gm.coded,
        "chromosomeOrder": sorted({m.chrom for m in gm.markers}, key=chrom_sort_key),
        "markers": [{"id": m.marker_id, "chrom": m.chrom, "posBp": m.pos_bp, "cm": m.cm} for m in gm.markers],
        "sampleIds": sample_ids,
        "calls": calls,
    }

def _genotype_file(case_dir: Path) -> Path:
    names = [p for p in case_dir.iterdir() if p.name.startswith("genotypes.")]
    assert len(names) == 1, case_dir.name
    return names[0]

def _load(case_dir: Path) -> Dataset:
    markers = case_dir / "markers.csv"
    return load_dataset(_genotype_file(case_dir), case_dir / "samples.csv", markers if markers.exists() else None)

def test_cases_exist_with_one_expectation_each() -> None:
    assert CASE_NAMES
    for name in CASE_NAMES:
        files = {p.name for p in (CASES / name).iterdir()}
        assert len({"expected.json", "expected-error.json"} & files) == 1, name

@pytest.mark.parametrize("name", CASE_NAMES)
def test_case(name: str) -> None:
    case_dir = CASES / name
    expected_path = case_dir / "expected.json"
    if expected_path.exists():
        expected = json.loads(expected_path.read_bytes().decode("utf-8"))
        assert normalise_dataset(_load(case_dir), VERSION) == expected
    else:
        err = json.loads((case_dir / "expected-error.json").read_bytes().decode("utf-8"))
        assert err["contractVersion"] == VERSION
        assert err["kind"] in ERROR_KIND_PATTERNS, f"unknown error kind {err['kind']}"
        with pytest.raises(DataContractError, match=ERROR_KIND_PATTERNS[err["kind"]]):
            _load(case_dir)

def test_manifest_matches_files() -> None:
    paths = sorted(p.relative_to(CONTRACT).as_posix() for p in CONTRACT.rglob("*") if p.is_file() and p.name != "MANIFEST.sha256")
    recomputed = "".join(f"{hashlib.sha256((CONTRACT / p).read_bytes()).hexdigest()}  {p}\n" for p in paths)
    assert (CONTRACT / "MANIFEST.sha256").read_bytes().decode("utf-8") == recomputed

def test_version_in_docs() -> None:
    assert re.fullmatch(r"\d+\.\d+\.\d+", VERSION)
    assert f"Contract version: {VERSION}\n" in (CONTRACT / "data-contract.md").read_bytes().decode("utf-8")
    formats = (CONTRACT.parent / "docs" / "data-formats.md").read_bytes().decode("utf-8")
    assert f"version {VERSION}" in formats
```

`rglob` must be sorted as posix strings so it equals the generator's sort; `Path.relative_to(...).as_posix()` on Windows gives forward slashes.

(`ERROR_KIND_PATTERNS` entry `"genotypes.unknown_cell": r"unrecognised (coded|nucleotide) call"` matches every new error case, HapMap included, because `hapmap.py` wraps the `ValueError` with `line N:` in B3.)

## === PHASE B5b: `scripts/check_contract.py` and its test (answer 9) ===

Named by IB `docs/m3-phases.md:219` ("recomputes `MANIFEST.sha256` and diffs against `../isoline-browser/contract` when given a path"). It verifies and never writes: PS holds the mirror and the canonical copy is regenerated in IB by `npm run contract`. Stdlib only; ruff lints `scripts/` (`pyproject.toml:51`, line length 140); mypy does not (`packages = ["progeny_selector"]`), so annotate anyway. The manifest algorithm equals `make-contract.mjs:785-794`: every file except `MANIFEST.sha256`, posix paths relative to `contract/`, sorted, `<sha256 hex>  <path>` per line, LF, trailing LF. The mirror messages equal `check-contract-mirror.mjs:42-45,52`.

**CLI**: `python scripts/check_contract.py [--contract DIR] [SIBLING_REPO]`. `SIBLING_REPO` is a repository root; its `contract/` is compared. `--contract` defaults to this repository's `contract/` and exists so the test can point the script at a temporary copy.

**Exit codes**: 0 manifest matches (and, when a sibling is given, every file is byte-identical); 1 manifest mismatch or mirror difference, one line per difference on stderr; 2 usage error (argparse) or a path that does not exist.

**stdout on success**: `contract <VERSION>: manifest ok, <N> files` then, with a sibling, `contract mirror: <N> files identical`.

**New `scripts/check_contract.py`** (verbatim):

```python
#!/usr/bin/env python3
"""Verify the mirrored data contract: MANIFEST.sha256 and, optionally, the canonical copy.

Responsibility: recompute the manifest of contract/ exactly as isoline-browser's
scripts/make-contract.mjs writes it (every file except MANIFEST.sha256, posix paths
relative to contract/, sorted, "<sha256 hex>  <path>" per line, LF) and compare it with
the committed MANIFEST.sha256; when a sibling repository root is given, also byte-compare
every file with <sibling>/contract, as isoline-browser's scripts/check-contract-mirror.mjs
does from the other side. Never writes: this repository holds the mirror, and the
canonical copy is regenerated in isoline-browser.

Usage: python scripts/check_contract.py [--contract DIR] [SIBLING_REPO]
Exit codes: 0 manifest matches (and the mirror is identical, when checked);
1 manifest mismatch or mirror difference, one line per difference on stderr;
2 usage error or a path that does not exist.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

REPO_CONTRACT = Path(__file__).resolve().parents[1] / "contract"
MANIFEST = "MANIFEST.sha256"

def relative_files(root: Path) -> list[str]:
    """Every file under root except the manifest, as sorted posix paths relative to root."""
    return sorted(p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file() and p.name != MANIFEST)

def manifest_text(root: Path) -> str:
    return "".join(f"{hashlib.sha256((root / p).read_bytes()).hexdigest()}  {p}\n" for p in relative_files(root))

def _entries(text: str) -> dict[str, str]:
    """path -> digest for each manifest line."""
    out: dict[str, str] = {}
    for line in text.splitlines():
        digest, sep, path = line.partition("  ")
        if sep:
            out[path] = digest
    return out

def check_manifest(root: Path) -> list[str]:
    """Differences between the committed manifest and a recomputation; empty when identical."""
    committed = (root / MANIFEST).read_bytes().decode("utf-8")
    recomputed = manifest_text(root)
    if committed == recomputed:
        return []
    have, want = _entries(committed), _entries(recomputed)
    problems: list[str] = []
    for path in sorted(set(have) | set(want)):
        if path not in have:
            problems.append(f"not in manifest: {path}")
        elif path not in want:
            problems.append(f"listed but absent: {path}")
        elif have[path] != want[path]:
            problems.append(f"hash differs: {path}")
    if not problems:
        problems.append("MANIFEST.sha256 differs from the recomputation in order or line ends")
    return problems

def check_mirror(ours: Path, theirs: Path) -> list[str]:
    """Files missing on either side or differing in bytes; empty when the copies are identical."""
    a, b = set(relative_files(ours) + [MANIFEST]), set(relative_files(theirs) + [MANIFEST])
    differences: list[str] = []
    for path in sorted(a | b):
        if path not in b:
            differences.append(f"missing in sibling: {path}")
        elif path not in a:
            differences.append(f"only in sibling: {path}")
        elif (ours / path).read_bytes() != (theirs / path).read_bytes():
            differences.append(f"differs: {path}")
    return differences

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify contract/MANIFEST.sha256 and, optionally, the mirror against a sibling checkout.")
    parser.add_argument("sibling", nargs="?", help="root of the isoline-browser checkout; its contract/ is byte-compared with ours")
    parser.add_argument("--contract", type=Path, default=REPO_CONTRACT, help="contract directory to check (default: this repository's)")
    args = parser.parse_args(argv)
    root = args.contract.resolve()
    if not (root / MANIFEST).is_file():
        print(f"check_contract: {root / MANIFEST} does not exist", file=sys.stderr)
        return 2
    theirs: Path | None = None
    if args.sibling is not None:
        theirs = Path(args.sibling).resolve() / "contract"
        if not theirs.is_dir():
            print(f"check_contract: {theirs} does not exist", file=sys.stderr)
            return 2
    problems = check_manifest(root)
    for line in problems:
        print(f"contract manifest: {line}", file=sys.stderr)
    if not problems:
        version_file = root / "VERSION"
        version = version_file.read_text(encoding="utf-8").strip() if version_file.is_file() else "?"
        print(f"contract {version}: manifest ok, {len(relative_files(root))} files")
    differences: list[str] = []
    if theirs is not None:
        differences = check_mirror(root, theirs)
        for line in differences:
            print(f"contract mirror: {line}", file=sys.stderr)
        if not differences:
            print(f"contract mirror: {len(relative_files(root)) + 1} files identical")
    return 1 if problems or differences else 0

if __name__ == "__main__":
    sys.exit(main())
```

(`check_mirror` includes `MANIFEST.sha256` itself, as `check-contract-mirror.mjs:31-35` does, so the "files identical" count equals IB's.)

**New `tests/test_check_contract.py`** (verbatim):

```python
"""scripts/check_contract.py: manifest recomputation and the optional byte-compare with a sibling checkout."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "check_contract.py"
CONTRACT = ROOT / "contract"

def run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True, check=False)

def copy_contract(repo: Path) -> Path:
    shutil.copytree(CONTRACT, repo / "contract")
    return repo / "contract"

def test_committed_contract_passes() -> None:
    result = run()
    assert result.returncode == 0, result.stderr
    assert result.stdout.startswith("contract ") and "manifest ok" in result.stdout

def test_manifest_mismatch_exits_1(tmp_path: Path) -> None:
    ours = copy_contract(tmp_path / "ours")
    (ours / "VERSION").write_bytes((ours / "VERSION").read_bytes() + b"x")
    (ours / "cases" / "extra.txt").write_bytes(b"x")
    result = run("--contract", str(ours))
    assert result.returncode == 1
    assert "contract manifest: hash differs: VERSION" in result.stderr
    assert "contract manifest: not in manifest: cases/extra.txt" in result.stderr

def test_identical_sibling_exits_0(tmp_path: Path) -> None:
    ours = copy_contract(tmp_path / "ours")
    copy_contract(tmp_path / "sibling")
    result = run("--contract", str(ours), str(tmp_path / "sibling"))
    assert result.returncode == 0, result.stderr
    assert "contract mirror:" in result.stdout and "files identical" in result.stdout

def test_differing_sibling_exits_1(tmp_path: Path) -> None:
    ours = copy_contract(tmp_path / "ours")
    theirs = copy_contract(tmp_path / "sibling")
    (theirs / "cases" / "vcf-basic" / "samples.csv").write_bytes(b"sample_id,role\n")
    (theirs / "extra.txt").write_bytes(b"x")
    (ours / "cases" / "ours-only.txt").write_bytes(b"x")
    result = run("--contract", str(ours), str(tmp_path / "sibling"))
    assert result.returncode == 1
    assert "contract mirror: differs: cases/vcf-basic/samples.csv" in result.stderr
    assert "contract mirror: only in sibling: extra.txt" in result.stderr
    assert "contract mirror: missing in sibling: cases/ours-only.txt" in result.stderr

def test_missing_paths_exit_2(tmp_path: Path) -> None:
    assert run("--contract", str(tmp_path / "nowhere")).returncode == 2
    ours = copy_contract(tmp_path / "ours")
    assert run("--contract", str(ours), str(tmp_path / "no-sibling")).returncode == 2
```

(In `test_differing_sibling_exits_1` the manifest check also fails for `ours` because of `ours-only.txt`; the exit code is 1 either way and the test asserts only the mirror lines.)

**Gate lines**

- PS `CLAUDE.md`, gates block (lines 17–21): after the line `pytest -q` add `python3 scripts/check_contract.py            # contract/ manifest; add ../isoline-browser to byte-compare with the canonical copy`. This inserts one line, so the line the main session edits under answer 11 moves from 32 to 33. Line 32's text is not touched.
- PS `.github/workflows/ci.yml`: after the `fixture is reproducible` step (lines 34–37) add

```yaml
- name: contract manifest matches its files
  run: python scripts/check_contract.py
```

(No sibling in CI; the mirror comparison is a local gate, as in IB `docs/m3-phases.md:213`.)

## === PHASE B6: docs, ADR, CHANGELOG, PLAN ===

**`docs/data-formats.md`**: replace lines 1–77 (title through the markers.csv paragraph) with:

```markdown
# Data formats

This document is the contract for every file progeny-selector reads or writes. The input contract is `contract/data-contract.md`; criteria.yaml and the outputs are specific to this tool. Validation happens once, in `progeny_selector.io`; violations raise `DataContractError` or `CriteriaError` naming the file, line and column. A change to this document is a breaking change (CONTRIBUTING.md).

## Input contract

The input contract is `contract/data-contract.md`, version 1.1.0, mirrored byte for byte from isoline-browser, where the canonical copy lives. It defines chromosome names (soybean-only in this version), the genotype file (VCF, HapMap, wide CSV; diploid calls only), the cell vocabulary per format (IUPAC codes expand to the heterozygote; `?`, stray `B`/`H`, `0`, `+`, `A?` are errors; `X`/`XX` are missing in HapMap only), samples.csv, markers.csv and the class codes; `contract/README.md` gives the version rules, `tests/test_contract_cases.py` runs every case under `contract/cases/` through `load_dataset`, and `scripts/check_contract.py` recomputes `MANIFEST.sha256` and, given `../isoline-browser`, byte-compares the mirror with the canonical copy. isoline-browser's docs/input-coding.md tabulates the accepted, missing and rejected codes per format and applies here unchanged. What this tool adds on top of the contract: the genotype format is chosen by file extension alone (`.vcf`, `.hmp.txt`, `.hmp`, `.hapmap`, `.csv`, `.tsv`, `.txt`, each optionally `.gz` or `.bgz`), which is the contract's minimum; for an A/B/H-coded file whose parents have no column the loader creates them internally (recurrent = all A, donor = all B, with a warning) and lists them in `Dataset.synthetic_sample_ids`; a pair of one nucleotide and one of N, `-`, `.` (`AN`, `A-`) is read as missing, which the contract has not yet decided; the Wm82.a4.v1 chromosome lengths in `constants.py` are the chromosome ends for drag bounds and marker weights when positions are in bp; `generation` values such as `BC2F1`, `BC3F2`, `F2`, `BC1`, `BC2S1` are parsed for expected values and unparseable strings are kept and flagged `generation_unparsed`; `family_id` groups progeny for per-family ranks and top-N selection; and markers absent from markers.csv have no cM, which disables cM mode for the whole dataset (all markers need cM).
```

Lines 79 onward (`## criteria.yaml …` through the end) unchanged.

**New `docs/adr/0010-contract-1.1-alignment.md`**:

```markdown
# Contract 1.1.0: mirror the shared contract and align the loaders with it

Status: accepted. Date: 2026-09-14.

## Context and Problem Statement

`docs/data-formats.md` was said to be shared verbatim with isoline-browser, but the two had drifted and nothing ran one repository's inputs through the other's parser. isoline-browser's ADR 0013 moved the shared input specification into a `contract/` directory with hand-authored cases, canonical there and mirrored here. Its ADR 0014 records the maintainer's decisions of 2026-09-14 on every input the two loaders read differently, including one nucleotide cell vocabulary for HapMap and wide CSV that is safe for any diploid crop, with crop-specific token profiles deferred to contract 1.2.0. What does this repository change to read every case identically?

## Decision Outcome

`contract/` is mirrored byte for byte from `../isoline-browser/contract` (its README gives the mirror rule) and `tests/test_contract_cases.py` loads every case through `load_dataset`. `scripts/check_contract.py` recomputes `MANIFEST.sha256` and, given the sibling's path, byte-compares the mirror with the canonical copy; it is a per-commit gate here, and `node scripts/check-contract-mirror.mjs ../progeny-selector` is the same check from the other side. The shared sections of `docs/data-formats.md` are replaced by a pointer to the contract version.

Loader changes, each from isoline-browser docs/adr/0014: samples.csv, markers.csv and the wide CSV sniff comma or tab from the header line and accept RFC 4180 quoting (`io/delimited.py`); `line_name` is optional; genotype columns absent from samples.csv are dropped and the loaded columns follow manifest order (`build_dataset`); synthesised coded parents are recorded in `Dataset.synthetic_sample_ids`, so the contract's sample list, which excludes them, can be reported; a VCF record with ID `.` is named `<CHROM>_<POS>` from CHROM as written; the chromosome pattern gains the `LG` prefix and the space and `-` separators and loses `ch`; non-soybean names sort in natural order (`chrom_sort_key`); `io/calls.py` is the one cell vocabulary, now mirrored by isoline-browser's `src/io/calls.ts`: the missing tokens are exactly the contract's per wide-CSV mode and for HapMap (`HAPMAP_MISSING` = the nucleotide list plus `X`, `XX`; `?` leaves every set), IUPAC codes still expand, and a single character outside A, C, G, T and the IUPAC codes now raises instead of reading as missing, so `?`, a stray `B` or `H`, `0`, `+` and `A?` are errors in both formats (shared cases `err-nucleotide-*`, `err-hapmap-*`); A/B/H detection scans every row instead of the first 200; every reader strips a leading UTF-8 byte-order mark. The wide-CSV fixed column order this reader always required is now the contract's rule.

### Consequences

Good: every contract case loads here with the same markers, samples and calls as in isoline-browser, and a future divergence is a failing test in the repository that diverged; the one vocabulary module makes the next token decision a one-line edit mirrored in both repositories. Bad: files that relied on `?` as missing, on the `ch6` spelling, on a single unknown letter reading as missing, or on genotype-file column order now load differently or fail with a message naming the line and cell. Open, listed in isoline-browser docs/adr/0014 and PLAN.md: a pair of one nucleotide and one of N, `-`, `.` (`AN`, `A-`), read as missing here and there; named token profiles and a crop selector in contract 1.2.0.

## More Information

isoline-browser docs/adr/0013 and 0014 and docs/input-coding.md; contract/README.md; docs/adr/0002.
```

**`CHANGELOG.md`** under `## [Unreleased]` / `### Added` (line 7): add

```
- The shared input contract, version 1.1.0, mirrored byte for byte from isoline-browser under `contract/` and checked by `tests/test_contract_cases.py`, which loads every case through `load_dataset` and verifies the manifest hashes (docs/adr/0010).
- `scripts/check_contract.py`, a per-commit gate that recomputes `contract/MANIFEST.sha256` and, given `../isoline-browser`, byte-compares the mirror with the canonical copy.
```

and a new `### Changed` section between `### Added` and `### Fixed` (line 21):

```
### Changed

- Loaders aligned with contract 1.1.0 (docs/adr/0010): samples.csv, markers.csv and wide CSV may be tab-delimited and quoted; `line_name` is optional; genotype columns not in samples.csv are dropped and samples load in manifest order; a VCF record with ID `.` is named from CHROM as written (`chr13_19000000`, not `Gm13_19000000`); chromosome names accept the `LG` prefix and space or `-` separators, no longer accept `ch6`, and non-soybean names order naturally (`scaffold_2` before `scaffold_10`); `?` is no longer a missing token anywhere, and in HapMap and nucleotide wide CSV a single character outside A, C, G, T and the IUPAC codes (`?`, `B`, `H`, `0`, `+`) is an error naming the line and cell rather than a missing call; the HapMap missing tokens are exactly the contract's eleven (`X`, `XX` added, `?` removed); A/B/H auto-detection reads the whole file instead of its first 200 rows; a leading byte-order mark is accepted on every input.
```

**`PLAN.md`** (answer 10: applied by the main session after review, not by the doer). Line 237, replace the Coordination bullet with: `- Coordination: contract 1.1.0 mirrored and the loaders aligned (docs/adr/0010; isoline-browser docs/adr/0014). Any further contract change starts in isoline-browser and is mirrored here by copying \`contract/\`; \`python scripts/check_contract.py ../isoline-browser\` proves the copy. Undecided in 1.1.0: half-missing pairs (\`AN\`, \`A-\`), read as missing. Contract 1.2.0 (after M3): named token profiles under \`contract/profiles/\` and a crop selector, designed in isoline-browser PLAN.md and docs/adr/0014.`

## === PHASE B7: gates ===

From PS root, with the venv interpreter (`.venv\Scripts\python.exe`; `python3` is not the M1-verified interpreter):

```
ruff check . && ruff format --check .
mypy
pytest -q
python scripts/make_fixture.py                        # must print "500 markers, 40 progeny, 11 pass; informative 475"
python scripts/check_contract.py ../isoline-browser   # must print "contract 1.1.0: manifest ok, N files" and "contract mirror: N+1 files identical", exit 0
```

Then from IB root: `node scripts/check-contract-mirror.mjs ../progeny-selector` must print `contract mirror: N+1 files identical` with the same count (28 case directories). The main session runs `git diff --exit-code -- tests/fixtures` and commits.
