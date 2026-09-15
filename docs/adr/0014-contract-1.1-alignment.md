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

Good: a file that loads in one tool loads in the other with the same markers, samples and calls, or fails in both; the vocabulary lives in one module per repository, so the next token decision is one edit each. Bad: this repository's coded mode now rejects `-`, `--`, `.`, `./.`, `.|.` and `NN`, which it accepted before 1.1.0; its nucleotide wide CSV rejects `?`, `B`, `H`, `X`, `0`, `+`, `A?` and every other stray cell it read as an allele symbol, and reads `R` as A/G rather than as a symbol; its HapMap rejects the same stray cells and now reads a pair with `.` (`A.`, `.A`) as missing, where it previously appended `.` as an allele; a user with such a file sees an error naming the line and the cell, and docs/input-coding.md tells them what is accepted. Neutral: half-missing pairs (`AN`, `A-`) stay undecided and are read as missing by both tools; token profiles and the crop selector wait for 1.2.0.

## More Information

docs/adr/0013-versioned-data-contract.md; contract/README.md; docs/input-coding.md; progeny-selector docs/adr/0010, which records the same decisions from the sibling's side.
