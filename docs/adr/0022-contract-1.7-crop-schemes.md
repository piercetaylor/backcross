# Contract 1.7.0: crop schemes for cowpea, pea and peanut

Status: accepted. Date: 2026-09-25. Format: MADR 4.0.0 [web] https://adr.github.io/madr/.

## Context and Problem Statement

Contract 1.5.0 (ADR 0020) shipped chromosome schemes for nine crops and deferred four under D6.3: cowpea, pea, sunflower and peanut, "because a bare number is ambiguous in each and a scheme that guessed would be silently wrong". Research on 2026-09-23, recorded in full in `docs/handoff-contract-1.7.md`, resolved three of the four from assembly reports and genome papers. Two questions were left for the maintainer: whether pea accepts a bare `1`..`7`, and whether cowpea keeps accepting a bare `1`..`11`. The maintainer delegated both ("ask fable", 2026-09-25) under the criterion **never silently wrong, tolerant of standard-tool exports**; the answers below are that delegated research, with the key sources re-fetched by the main session.

## Decision Drivers

- Never silently wrong: a spelling that two numberings share must not be read as one of them.
- Tolerant of standard-tool exports: a spelling that TASSEL, GAPIT, Ensembl or NCBI writes should be read without an edit.
- The scheme model of ADR 0020 D6.1 is unchanged: one pattern whose capture groups yield a key that is a substring of the input. No alias table is added in this version.
- A new optional crop id is additive, so this is a minor bump (ADR 0013).

## Considered Options

For pea:

1. **Accept a bare `1`..`7` as the karyotype number** (the pattern the 2026-09-23 research proposed).
2. **Refuse a bare number; accept `chr4`, `chromosome4`, and the paired forms `chr4LG4` and `4LG4`.**

For cowpea:

1. **Accept a bare `1`..`11` as the Vu numbering** (the handoff's pattern).
2. **Refuse a bare number, as pea does.**

## Decision Outcome

**Chosen: pea option 2 and cowpea option 1, shipped with peanut as contract 1.7.0, a minor bump.** `BUILTIN_CROPS` appends `cowpea`, `pea`, `peanut` after `cotton`; `soybean` stays the default.

**Pea refuses a bare `1`..`7`.** Published pea tables write both numberings as bare Arabic digits. Beji 2020, Table 3 footnote: "Chromosomes are named in consecutive numerical order from 1 to 7", beside linkage groups LG I-VII [web] https://pmc.ncbi.nlm.nih.gov/articles/PMC7430820/. Gali 2018 labels its groups LG1a-LG7c by linkage group [web] https://pmc.ncbi.nlm.nih.gov/articles/PMC6097431/. The two numberings agree only on chromosomes 4 and 7, so a linkage-group-numbered file read as karyotype numbers would be mislabelled on five chromosomes of seven. The standard tools do not force bare numbers: TASSEL and GAPIT studies keep `Chr1LG6_…`, `S2LG1_…` and `1LG6` in their marker and chromosome names ([web] https://pmc.ncbi.nlm.nih.gov/articles/PMC6888555/, https://pmc.ncbi.nlm.nih.gov/articles/PMC12551618/, G3 jkac168, https://academic.oup.com/g3journal/article/12/9/jkac168/6632660), and Ensembl serves `1LG6`..`7LG7` [web, fetched 2026-09-25] https://rest.ensembl.org/info/assembly/pisum_sativum?content-type=application/json. So the paired form is read with or without a prefix, and a karyotype number needs a `chr` or `chromosome` prefix. A wrong pairing such as `chr1LG1` falls through.

**Cowpea keeps accepting a bare `1`..`11`.** The Vu01-Vu11 numbering predates 2019: Lo 2018 writes "LGs were named and oriented based on cowpea pseudomolecules … from Vu01 to Vu11. Note that this numbering of LGs differs from the one used in previous cowpea genetic maps", and its Table 2 gives the correspondence carried in the `assembly` string [web, fetched 2026-09-25] https://pmc.ncbi.nlm.nih.gov/articles/PMC5908840/. Files on the older numbering were `LG1`- or `VuLG1`-prefixed (Muchero 2009, 2013), and the `LG` prefix stays refused (ADR 0020 D6.2), so `LG4` and `VuLG4` fall through. The one bare-integer cowpea file found (G3 2025 jkaf024, GAPIT, https://academic.oup.com/g3journal/article/15/4/jkaf024/8005447) uses the Vu numbering. NCBI's parenthetical form `Vu01(old4)` is read only in its eleven exact pairings; `Vu01(old7)` falls through. The `assembly` string no longer calls Vu01-Vu11 "the 2019 numbering".

**Peanut is shipped as researched, with a stated gap.** Both Tifrunner releases number 01-20, A subgenome 01-10 and B subgenome 11-20 (NCBI gnm1 `Arahy.01`, gnm2 `arahy.Tifrunner.gnm2.chr01`, LegumeInfo, Zhuang 2019). The gap: a key is a substring of the input, so the scheme cannot map `B01` to `11`. The `A01`..`A10` / `B01`..`B10` spelling and the `Aradu.A09` / `Araip.B08` names of Axiom_Arachis2 studies are therefore kept as written and ordered after the canonical names, under the 1.2.0 fallback. That is visible, not silently wrong: a user sees `B01` in the gutter and the export rather than a mislabelled `Arahy.11`. Closing it needs an alias table in the scheme schema.

**Sunflower stays deferred.** The deciding fact is whether `Ha412HOChrNN` equals `HanXRQChrNN` for all 17 chromosomes, and no fetched source says so. Newer assemblies are numbered "according to the reference HanXRQr2.0-SUNRISE" (https://pmc.ncbi.nlm.nih.gov/articles/PMC11707268/), and four loci keep their chromosome number in both references, which is four chromosomes of seventeen. An XRQ-only scheme does not avoid the risk, because a bare `1`..`17` would be read under either assembly. It unblocks on one explicit statement that the two numberings agree, or a whole-genome synteny table; if it unblocks, the canonical names are bare `1`..`17` as Ensembl exposes them.

**ADR 0020 D6.2 is extended, not changed.** As common bean accepts `pv`, cowpea accepts `vu` and peanut `arahy.` (optionally after `arahy.tifrunner.gnm1.` or `.gnm2.`), because those are the prefixes of their own assemblies. The `LG` prefix remains soybean-only.

### The three files

| id       | name / species / ploidy      | assembly                        | chromosomes (canonical) | keys      | accepted                                                                        | kept as written                                            |
| -------- | ---------------------------- | ------------------------------- | ----------------------- | --------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `cowpea` | Cowpea, Vigna unguiculata, 2 | IT97K-499-35 v1.1 (ASM411807v2) | `Vu01`..`Vu11`          | `1`..`11` | `Vu01`, `vu1`, `Vu_03`, `chr11`, `7`, `Vu01(old4)`, `Vu10(old10)`               | `Vu01(old7)`, `LG4`, `VuLG4`, `Vu12`                       |
| `pea`    | Pea, Pisum sativum, 2        | Cameor Pisum_sativum_v1a        | `chr1LG6`..`chr7LG7`    | `1`..`7`  | `chr4`, `Chr_04`, `chromosome4`, `chr 4`, `chr4LG4`, `4LG4`, `1LG6`, `07LG7`    | `4`, `04`, `chr1LG1`, `1LG1`, `LG4`, `LG6`, `chr8`, `chr0` |
| `peanut` | Peanut, Arachis hypogaea, 4  | Tifrunner gnm1 KYV3 / gnm2 J5K5 | `Arahy.01`..`Arahy.20`  | `1`..`20` | `Arahy.01`, `arahy.Tifrunner.gnm2.chr11`, `arahy.Tifrunner.gnm1.Arahy.05`, `20` | `A01`, `B01`, `Aradu.A09`, `Araip.B08`, `Arahy.21`         |

Each scheme's `sources` list carries its assembly reports and papers. Every spelling in the last two columns is asserted in `tests/crops.test.ts`, and the cases `crop-cowpea-spellings`, `crop-pea-spellings` and `crop-peanut-spellings` each pin at least one spelling the scheme keeps as written, so the refusal is checked in both repositories.

### Unverified

These were not fetched or not read in full, and nothing above rests on them alone: Tayeh 2015's own linkage-group labels; the Muñoz-Amatriaín 2017 text; PLINK's behaviour with a pea or cowpea chromosome column; the column contents of GenoPea and Axiom raw exports; a formal statement that ZW6 chromosome numbers equal Cameor's karyotype numbers (only consistent marker pairs were found, https://pmc.ncbi.nlm.nih.gov/articles/PMC10663473/).

### Consequences

- Good: three more crops read and order their chromosome names by their own assemblies; no existing scheme, default or output changes.
- Neutral: a pea user with bare karyotype numbers makes one edit (`4` to `chr4`), and sees the unedited names kept as written until then.
- Bad: a hand-stripped pre-2017 cowpea GoldenGate map file with bare old linkage-group numbers would be read as the Vu numbering; none was found. Peanut's subgenome spellings are kept as written until an alias table exists.

## Revisit when

- An alias table is added to the scheme schema: peanut's `A01`..`B10` and `Aradu.`/`Araip.` spellings can then be mapped.
- A whole-genome statement of HA412/XRQ synteny appears for sunflower.

## More Information

Contract 1.7.0: `contract/crops/cowpea.json`, `pea.json`, `peanut.json`, `contract/data-contract.md` ("Chromosome names"), `contract/VERSION`, `contract/README.md`. Mirrored byte for byte into `progeny-selector`, whose record is its ADR 0027. Amends ADR 0020 D6.3's deferral for three of its four crops.
