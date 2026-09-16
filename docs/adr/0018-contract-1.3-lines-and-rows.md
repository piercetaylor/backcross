# Contract 1.3.0: blank lines, `#` as data, quoted line breaks, two-fault rows and `genotypes.column_count`

Status: accepted. Date: 2026-09-16. Format: MADR 4.0.0 [web] https://adr.github.io/madr/.

## Context and Problem Statement

Contract 1.2.0 (ADR 0014, amendment of 2026-09-14) left comment and whitespace-only lines, quoted line breaks and rows with two faults outside the contract, and the two repositories read them differently. Which lines does every input skip, is `#` a comment marker, may a quoted field hold a line break, and which error does a row with two faults report? The maintainer delegated every design decision under one criterion: best for academic and open-source plant-breeding users, meaning reproducible with standard tools (TASSEL, bcftools, the VCF specification, R and pandas exports), tolerant of spreadsheet exports, never silently wrong (docs/m4-phases.md, section 6).

## Decision Drivers

A file that loads in one repository loads in the other with the same markers, samples and calls, or fails in both. A line that a standard tool keeps is never dropped silently. Spreadsheet and hand-edit artefacts that carry no data do not stop a load.

## Before

- **This repository** skipped lines starting with `#` in the wide CSV, samples.csv and markers.csv (`src/io/csv.ts`, `forEachRow`) and, in HapMap, every line before the `rs#` header and `#` lines after it. It skipped only truly empty lines, so a spaces-only line split to one field and was a column-count error in VCF and HapMap and a one-field row in samples.csv and markers.csv, and a tabs-only line with the right field count was `invalid position ""` in VCF and HapMap; in the wide CSV since 1.2.0 either was an all-empty row that was skipped. An all-empty or whitespace-only markers.csv row was an `empty marker_id` error. `forEachRow` split on newlines before quoting and could not read a quoted field spanning lines. The delimiter was sniffed from line 1.
- **progeny-selector** treated a `#` line as data (a column-count error in wide CSV and HapMap, an extra row in samples.csv and markers.csv) and needed the HapMap header on line 1. It skipped whitespace-only lines in every reader, skipped an all-empty markers.csv row, and read a quoted field spanning lines, naming the row's last physical line.
- **Two faults in one row**: progeny-selector checked HapMap cells before `pos` and VCF FORMAT before POS; this repository checked the position first.

Neither behaviour was in the contract and no case exercised either.

## Decision Outcome

**D4.1: `#` is not a comment marker in any input.** R's `read.csv` (`comment.char = ""`), `readr::read_csv` (`comment = ""`) and pandas `read_csv` (`comment=None`) treat a `#` line as data by default; bcftools rejects a `#` line after the VCF header; TASSEL's HapMap reader reads line 1 as the header. This repository's silent skipping of `#` rows in the wide CSV, samples.csv and markers.csv, and its scan for the `rs#` line, would drop or misread lines that every standard tool keeps. In VCF, `##` lines and `#CHROM` are the header as the specification defines them; any other `#` line after `#CHROM` is a data line with the wrong field count and is an error. In HapMap the header is the first line that is not blank. In the three delimited files a row beginning with `#` is a row.

**D4.2: a blank line is skipped wherever it occurs, including before the header, and so is a delimited row whose every field is empty or whitespace.** "Blank" means empty or holding only spaces and tabs. Spreadsheets and hand edits leave such lines; they carry no data, so skipping them is not silent loss, and it generalises 1.2.0's all-empty wide-CSV row to every input. The header is the first line that is not skipped, and the delimiter sniff reads that line. progeny-selector's VCF and HapMap readers already skipped blank body lines; its HapMap, wide-CSV and manifest readers did not skip a blank line before the header and change with this version (its docs/adr/0013).

**D4.3: a quoted field may contain a line break, in all three delimited files** (RFC 4180 section 2, rule 6 [web] https://www.rfc-editor.org/rfc/rfc4180). Excel writes a quoted line break for a cell containing one, which a `notes` column invites; Python's `csv` (progeny-selector) and readr read them. `forEachRow` extends a physical line while its quote count is odd. Error messages that name a line name the row's first physical line here and the last in progeny-selector (`csv.reader.line_num`); line numbers are not contract vocabulary and stay as each repository writes them.

**D4.4: a row with more than one fault reports one of them; which one is unspecified, and no case carries two faults.** Aligning the check order across two parsers buys nothing a user can act on: either message names the line, and fixing one fault reveals the other.

**D4.5: new error kind `genotypes.column_count`** for a data line whose field count differs from the header's, which the `#`-after-header VCF case needs and which both repositories already emit under their own wording.

**D4.6: `MAX_CONTRACT_BYTES` becomes 128 KiB.** The cap in ADR 0013 and docs/m3-phases.md invariant 4 was 64 KB; this version adds about 10 KB and contract 1.4.0 and 1.5.0 about 20 KB. The cap exists to keep the mirror small enough to copy by hand and review; 128 KiB still is.

Version 1.3.0 is a minor version under ADR 0013. The cases, in `scripts/make-contract.mjs` after `wide-empty-row-skipped`: `vcf-blank-lines-skipped`, `hapmap-blank-lines-skipped`, `wide-blank-lines-skipped`, `wide-tab-blank-line-before-header`, `samples-blank-rows-skipped`, `markers-blank-rows-skipped`, `wide-hash-row-is-data`, `samples-quoted-newline`, `err-samples-hash-row`, `err-hapmap-hash-before-header`, `err-vcf-hash-line-after-header`.

### Consequences

Good: a file with a blank first line now loads in both repositories; a quoted line break now loads here; a `marker_id` or `sample_id` that begins with `#` is read as written, as R and pandas read it; the two repositories read every line the same way and the contract says which way.

Bad: a file with `#` comment lines that loaded here now errors naming the line (a HapMap with a `#` line before the `rs#` header, a VCF with a `#` line after `#CHROM`, a samples.csv whose `#` row names a sample with no genotype column, or a wide CSV whose `#` row fails its column count or position).

Neutral: which fault a two-fault row reports stays different between the repositories, by decision.

## Amendment, 2026-09-16: review findings (still contract 1.3.0, unreleased)

Maintainer decisions after review, under the criterion that the two readers agree and neither is silently wrong.

1. **Quoting.** A `"` opens a quoted field only as the first character of a field; anywhere else it is a literal character, as Python's `csv` module reads it (`6" pot`). Text after a closing quote is appended to the field in both repositories (`"x"y` is `xy`); no case asserts it. `forEachRow` is one linear scanner that carries the quote state across physical lines, so a stray opening quote no longer costs a rescan of the accumulated row per line.
2. **Unterminated quote.** A quoted field still open at the end of the file is an error in both repositories naming the physical line where the field opened, error kind `delimited.unterminated_quote` (the name is provisional; it applies to all three delimited files). Before, this repository kept the rest of the file as one field and progeny-selector's non-strict `csv` reader did the same.
3. **VCF.** A line beginning with a single `#` after the `#CHROM` line, including a second `#CHROM` line with the right field count, is an explicit error in both repositories, reported under the new error kind `genotypes.repeated_header` (decided after review; `err-vcf-hash-line-after-header` moves to it too, since its `# a note` line is caught by the same check). D4.1's reason ("a data line with the wrong field count") does not hold for a same-width second `#CHROM` line, which both repositories previously accepted silently by replacing the sample list.
4. **Blank** is empty or only spaces and tabs in both repositories; progeny-selector's `str.strip()` checks and this repository's `String.prototype.trim()` check on fields both treated a no-break space as blank.
5. **Line breaks inside a quoted field** are read as a single LF in both, whether the file wrote LF or CRLF.
6. **The sniff** reads the first physical line that is not blank (data-contract.md wording corrected).
7. progeny-selector: an unparseable markers.csv `cm` raises `DataContractError` naming the line instead of a bare `ValueError`.

Cases added: `samples-midfield-quote-literal`, `err-markers-unterminated-quote`, `err-vcf-second-header`, `err-hapmap-nbsp-line-before-header`, `wide-coded-blank-line-before-header` (a coded file with a blank first line; the mode scan no longer assumes the header is line 1).
