# Contract 1.4.0: named token profiles

Status: accepted. Date: 2026-09-16. Format: MADR 4.0.0 [web] https://adr.github.io/madr/.

## Context and Problem Statement

Up to contract 1.3.0 (ADR 0018) the meaning of a genotype cell followed the file format alone: a SoyBase allele report's `H` and `U`, a DArT `0/1/2/-` matrix, an Axiom `AA/AB/BB` export or a KASP `X:Y` call was an `unexpected cell` error, and TASSEL's `X`/`XX` were missing in HapMap but an error in a wide CSV. ADR 0014's amendment deferred "token profiles and the crop selector"; docs/m4-phases.md (section 7) ships the profiles as contract 1.4.0 and the crop chromosome schemes as 1.5.0. The maintainer delegated every design decision under one criterion: best for academic and open-source plant-breeding users, meaning reproducible with standard tools, tolerant of spreadsheet exports, never silently wrong. This record lifts the decisions of that section; the spec numbered it 0018, which phase 4 had already taken.

## Decision Outcome

**D5.1: a profile is a JSON document with four vocabularies and a base flag, keyed by platform, never by crop.** The research (docs/research/cross-crop-genotype-conventions.md, verdict) found every token difference traces to a platform or format, none to a crop, so the profile axis is platform; the crop scheme (contract 1.5.0) is a separate axis and carries no tokens.

**D5.2: profile tokens take precedence over the format's core vocabulary; `base: "nucleotide"` keeps the core underneath, `base: "none"` replaces it.** SoyBase's report is nucleotides plus `H` and `U`, so it layers; DArT's `0/1/2/-` and Axiom's `AA/AB/BB/NoCall` are complete vocabularies, so they replace.

**D5.3: a heterozygote token that names no alleles (`H`, written `"*"`) resolves to the marker's two alleles seen on that row (HapMap's `alleles` column included); with any other number of alleles it is an error naming the cell**, kind `genotypes.ambiguous_heterozygote`. With two alleles observed the pair is determined; with one the second allele is unknown and inventing it would be silently wrong; with three the token is ambiguous.

**D5.4: a profile other than the default is an error with a VCF or a BrAPI source**, kind `genotypes.profile_format`, because GT indices carry no tokens and silently ignoring a chosen profile would be wrong.

**D5.5: the profile is recorded as a trailing `token_profile` column in every per-line and pairwise CSV export and as a "Token profile" row in the report's dataset summary.** Appended last so readers that pick existing columns by position are unaffected, unlike ADR 0015's insertion; the summary CSV's per-chromosome columns already made its tail variable. A user-supplied profile is recorded as `custom:<id>`; the absence of a profile as `default`. `brapi-callsets.csv` is unchanged.

**D5.6: auto-detection of A/B/H coding runs only under the default profile or a `base: "nucleotide"` profile, and cells the profile claims (its missing, homozygous and heterozygous tokens, compared upper-cased) do not vote; a `base: "none"` profile fixes nucleotide-family mode.** Under `soybase-report` a file whose cells are only `A`, `H` and `U` is not read as coded: only `A` votes. Coded mode chosen explicitly with a profile is an error.

**D5.7: five built-in profiles: `tassel`, `soybase-report`, `dart`, `axiom`, `kasp`.** The four named by the maintainer (ADR 0014) plus KASP SNPviewer, whose `X:X`/`X:Y`/`?` collides with TASSEL's `X` and is common in marker-assisted backcrossing labs; GenomeStudio `AA/AB/BB/--` is covered by `axiom`, which lists `--` as missing and says so in its description.

### Amendment, 2026-09-16: review findings (maintainer decisions, still 1.4.0)

- A non-default profile on a wide CSV whose coding is coded A/B/H, requested or detected, is the error `genotypes.profile_format`, naming the profile and how the coding was reached: under `base: "nucleotide"` the profile's tokens do not vote, so detection can still find A/B, and reading such a file with a nucleotide vocabulary would be silently wrong. Case `err-profile-nucleotide-on-coded`.
- A user-supplied profile is always recorded as `custom:<id>`, even when its id equals a built-in id; only the built-in object itself is recorded by id.
- Validation also rejects a token listed twice within a set after normalisation, a heterozygote pair of identical symbols, and unknown top-level keys.
- HapMap's `alleles` column is upper-cased before use; a `*` heterozygote at a marker one of whose alleles is `-` (an indel) is `genotypes.ambiguous_heterozygote` rather than resolving to a nucleotide and `-`.

### Schema

`id` (`^[a-z0-9][a-z0-9-]{0,31}$`), `name` (non-empty), `description`, `base` (`"nucleotide"` or `"none"`), `homozygous` (token to allele symbol, a symbol matching `^[^\s]+$`), `heterozygous` (token to `[symbol, symbol]` or `"*"`), `missing` (tokens), `sources` (strings). Tokens are compared case-insensitively after trimming; the three token sets are pairwise disjoint after upper-casing; `"*"` appears only in `heterozygous`; with `base: "none"`, `homozygous` is non-empty and `missing` contains `""`.

### Resolution order

A missing token of the profile; a missing token of the format when `base` is `nucleotide`; a homozygous token; a heterozygous token (`"*"` resolved after the row per D5.3); the format's vocabulary when `base` is `nucleotide`; otherwise `genotypes.unknown_cell`.

### The five files and their verification status

| profile          | source                                                                     | status                                                   |
| ---------------- | -------------------------------------------------------------------------- | -------------------------------------------------------- |
| `tassel`         | TASSEL 5 `NucleotideAlignmentConstants.java` (bitbucket)                   | [web], per the research                                  |
| `soybase-report` | the maintainer's note of 2026-09-14 (ADR 0014); SoyBase pages returned 403 | the maintainer's reading, not verified against SoyBase   |
| `dart`           | docs/research/cross-crop-genotype-conventions.md [3]                       | search only, not verified against DArT's document        |
| `axiom`          | docs/research/cross-crop-genotype-conventions.md [5], [6]                  | search only, not verified against Thermo Fisher's manual |
| `kasp`           | Biosearch Technologies SNPviewer product page                              | [web], per the research                                  |

Version 1.4.0 is a minor version under ADR 0013: every addition is optional, and a file read without a profile is read as under 1.3.0. The cases, in `scripts/make-contract.mjs` after `wide-coded-blank-line-before-header`: `profile-soybase-report-wide`, `profile-soybase-report-hapmap`, `profile-dart-wide`, `profile-axiom-wide`, `profile-kasp-wide`, `profile-tassel-wide`, `err-profile-ambiguous-het`, `err-profile-with-vcf`; a case chooses its profile with `options.json`.

### Consequences

Good: SoyBase, DArT, Axiom, GenomeStudio, KASP and TASSEL-converted wide CSV files load without hand-recoding, in both repositories, and every export says which vocabulary produced it.

Bad: a chosen profile is on every export, so every per-line and pairwise CSV gains a trailing column (readers by position keep their columns). A VCF or BrAPI source with a profile is an error rather than a silent no-op. A `"*"` heterozygote at a marker whose row shows one allele is an error, so a small file where the donor allele appears only in heterozygotes needs its `alleles` column (HapMap) or a homozygous donor call.
