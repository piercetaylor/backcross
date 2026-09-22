# Contract 1.5.0: crop chromosome schemes

Status: accepted. Date: 2026-09-22. Format: MADR 4.0.0 [web] https://adr.github.io/madr/.

## Context and Problem Statement

Up to contract 1.4.0 (ADR 0019) chromosome names were soybean-only: `Gm01`..`Gm20`, one alias pattern, every other name kept as written. A maize `chr1` was displayed as `Gm01`, a wheat `Chr1A` was an unrecognised name ordered after the soybean chromosomes, and a rice `Chr12` and a `chr12` were the same name only by accident of the soybean pattern. ADR 0014's amendment deferred "token profiles and the crop selector"; docs/m4-phases.md ships the profiles as contract 1.4.0 (ADR 0019) and the crop chromosome schemes as 1.5.0, this record. The maintainer delegated every design decision under one criterion: best for academic and open-source plant-breeding users, meaning reproducible with standard tools, tolerant of spreadsheet exports, never silently wrong. The research behind the decisions is docs/research/cross-crop-genotype-conventions.md; a bracketed number below is one of its references and `[web]` means the page was fetched, `[search]` that only a search snippet was seen.

The specification numbered this record 0019, which phase 5 had already taken; it is 0020 here, and `progeny-selector` takes 0020 for the sibling half (S6).

## Decision Outcome

**D6.1: a crop scheme is a JSON document with an ordered list of canonical chromosome names, a parallel list of keys, and one alias regular expression whose capture groups yield the key.** The research asked for per-assembly alias tables (design consequence 1); this first release ships one alias pattern per crop that unifies the verified spellings, and the file carries an `assembly` field naming the reference the canonical spelling comes from, so a second assembly can be added as a second file later. Key derivation: join the defined capture groups, upper-case, strip the leading zeros of each digit run; look the key up in `keys`. A miss keeps the name as written and orders it after the canonical names in natural order, exactly the 1.2.0 rule, so unanchored bins (`ChrUn`, `chrUn`, `Un0`, `chr00`) and organelles (`MT`, `Pltd`, `Mt`, `Pt`) pass through unchanged (design consequence 4).

**D6.2: `soybean.json` is the 1.2.0 pattern verbatim (`gm|chr|chromosome|lg` prefixes, 1..20) and is the default; every other scheme accepts only `chr` and `chromosome` prefixes** (and `pv` for common bean, whose v2.1 names carry it). The `LG` prefix is a soybean concession from contract 1.1.0; in other crops a linkage-group number need not equal a chromosome number, so accepting it would be silently wrong.

**D6.3: the first release ships nine crops: soybean, maize, rice, sorghum, wheat, barley, oat, common bean, cotton.** Cowpea (`Vu01(old4)`: the NCBI sequence name embeds a renumbering [35, web]), pea (`1LG6`: the chromosome number differs from the linkage-group number [36, web]), sunflower (two live assemblies with the assembly baked into the name [38, 39, web]) and peanut (names seen in search snippets only [31]) are deferred to a later version, because a bare number is ambiguous in each and a scheme that guessed would be silently wrong. Potato is dosage-called and out of scope [41].

**D6.4: the scheme is chosen at load time, lives on the `Dataset` as `crop` (its id), and every later normalisation (`markers.csv`, target regions, BrAPI `referenceName`) uses it.** The worker answers `targets` requests from the resident dataset, so the compiled scheme travels beside it.

**D6.5: a trailing `crop` column in every per-line and pairwise CSV export, after `token_profile`, and a "Crop" row in the report**, for the same reason as D5.5: appended last, so a reader that picks the earlier columns by position is unaffected.

**D6.6: no ploidy flag beyond an informational `ploidy` field.** Every shipped crop is diploid-called, the allopolyploids on subgenome-specific markers (design consequence 6), and the contract already states diploid calls only, so a flag would decide nothing.

### Schema

`id` (`^[a-z0-9][a-z0-9-]{0,31}$`), `name` (non-empty), `species` (non-empty), `ploidy` (a positive integer), `assembly` (non-empty), `chromosomes` (canonical names in order), `keys` (parallel, upper-case, no leading zeros), `pattern` (a regular expression source valid in both JavaScript `RegExp` and Python `re`, applied case-insensitively to the trimmed name and anchored by the pattern itself), `sources` (strings). `chromosomes` and `keys` have the same length, neither holds a duplicate, and `pattern` compiles. Where the pattern has two groups the key is their concatenation (`1` + `A` gives `1A`; `A` + `1` gives `A1`).

### The nine files and their verification status

| id            | name / species / ploidy              | assembly                                        | chromosomes (canonical)      | keys                     | verification                                                                                                                                                                             |
| ------------- | ------------------------------------ | ----------------------------------------------- | ---------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `soybean`     | Soybean, Glycine max, 2              | Williams 82 (Wm82.a2.v1 / a4.v1 / a6.v1 naming) | `Gm01`..`Gm20`               | `1`..`20`                | contract 1.2.0; `Gm01` NCBI [9, web], `1` Ensembl [10, web]                                                                                                                              |
| `maize`       | Maize, Zea mays, 2                   | Zm-B73-REFERENCE-NAM-5.0                        | `chr1`..`chr10`              | `1`..`10`                | `chr1` NCBI [11, web]; `1` Ensembl [12, web]                                                                                                                                             |
| `rice`        | Rice, Oryza sativa, 2                | IRGSP-1.0 / MSU7                                | `Chr1`..`Chr12`              | `1`..`12`                | `Chr1` MSU7 [16, web]; `1` NCBI and Ensembl [14, 15, web], fetched; `chr01` RAP-DB is covered by the pattern                                                                             |
| `sorghum`     | Sorghum, Sorghum bicolor, 2          | BTx623 v3.1.1 (NCBIv3)                          | `Chr01`..`Chr10`             | `1`..`10`                | `Chr01` NCBI [19, web]                                                                                                                                                                   |
| `wheat`       | Wheat, Triticum aestivum, 6          | IWGSC CS RefSeq v2.1                            | `Chr1A`..`Chr7D` (21, A B D) | `1A`..`7D`               | `Chr1A` and `1A` NCBI [21, web], fetched; the IWGSC native `chr1A` is covered by the pattern                                                                                             |
| `barley`      | Barley, Hordeum vulgare, 2           | MorexV3                                         | `chr1H`..`chr7H`             | `1H`..`7H`               | `1H` Ensembl [23, web]; `chr1H` IPK [24, search]: the canonical form is this plan's decision, following the prefixed community form                                                      |
| `oat`         | Oat, Avena sativa, 6                 | OT3098 v2                                       | `chr1A`..`chr7D` (21, A C D) | `1A`..`7D`               | `1A` Ensembl [26, web]; `chr1A` PepsiCo [27, search]: the canonical form is this plan's decision                                                                                         |
| `common-bean` | Common bean, Phaseolus vulgaris, 2   | G19833 v2.1                                     | `Chr01`..`Chr11`             | `1`..`11`                | `Chr01`..`Chr11` NCBI GCF_000499845.2, P. vulgaris v2.0, the JGI G19833 assembly [web], fetched 2026-09-22; `1` Ensembl [28, web]; the `pv` prefix follows the community `Pv01` spelling |
| `cotton`      | Upland cotton, Gossypium hirsutum, 4 | TM-1 UTX v2.1                                   | `A01`..`A13`, `D01`..`D13`   | `A1`..`A13`, `D1`..`D13` | `A01` NCBI [34, web]                                                                                                                                                                     |

Every canonical spelling in the table rests on a source that was fetched and read: the NCBI assembly reports for soybean, maize, rice, sorghum, wheat, common bean and cotton, and the Ensembl karyotypes for barley and oat, whose prefixed `chr` forms follow the community convention. Each scheme's `sources` list carries those URLs.

## Consequences

A maize `chr1` is no longer displayed as `Gm01`. A dataset loaded without choosing a crop is read exactly as contract 1.2.0 read it, so no earlier output changes. Positions are still never converted between assemblies: choosing a crop changes names and their order, never coordinates. The nine cases `crop-<id>-spellings` under `contract/cases/` pin each scheme's accepted spellings, its canonical output and its order.

## Revisit when

- A second assembly of a shipped crop needs its own names (add an `assemblies` list to the schema rather than a second `id`).
- A user-supplied scheme is asked for; this version ships the built-ins only.
- One of the deferred crops gets an unambiguous public convention: cowpea's renumbering, pea's linkage-group names, sunflower's two live assemblies, peanut's `Arahy.NN`.
