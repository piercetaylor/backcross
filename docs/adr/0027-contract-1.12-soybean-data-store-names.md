# Contract 1.12.0: the soybean scheme reads the SoyBase / LIS Data Store names

Status: accepted. Date: 2026-09-27. Format: MADR 4.0.0 [web] https://adr.github.io/madr/.

## Context and Problem Statement

A VCF downloaded from the SoyBase / LIS Data Store names its chromosomes `glyma.Wm82.gnm4.Gm01` or, for gnm5, `glyma.Wm82.gnm5.Chr01` in CHROM. Under contract 1.11.0 the `soybean` scheme (`^(?:gm|chr|chromosome|lg)?[_\s-]?0*([1-9]|1[0-9]|20)$`, the 1.2.0 rule) kept these names as written, so they were ordered after `Gm20` in natural order and could not match a markers.csv or a target region written as `Gm01`. The same held for the Wm82 V1.1 spelling `GLYMAchr_01`.

The maintainer's standing instruction for this run ("consult fable, research any questions") delegated the decision under the criterion **never silently wrong, tolerant of standard exports**. A Fable agent did the research on 2026-09-26, and the main session re-verified its two key claims by fetch on 2026-09-27.

## Decision Drivers

- Never silently wrong: a Data Store name must land on the chromosome it names, in every Wm82 version, and no spelling read before 1.12.0 may change its reading.
- Tolerant of standard exports: a Data Store VCF should load without an edit to CHROM.
- The scheme model of ADR 0020 D6.1 is unchanged: one pattern whose capture groups yield the key. No alias table is added.
- No input read before changes meaning, so this is a minor bump (ADR 0013).

## Considered Options

1. **Read the Data Store prefix and `GLYMAchr` in the soybean pattern.**
2. **Keep the Data Store names as written** and ask users to rewrite CHROM.

## Decision Outcome

**Chosen: option 1, shipped as contract 1.12.0, a minor bump.** The soybean pattern becomes `^(?:glyma\.wm82\.gnm[0-9]+\.(?:gm|chr)|glymachr|gm|chr|chromosome|lg)?[_\s-]?0*([1-9]|1[0-9]|20)$`, applied case-insensitively as before. The keys and canonical names are unchanged. `contract/crops/soybean.json` and `SOYBEAN_SCHEME` in `src/core/chromosomes.ts` change in step, and the LIS gnm5 README joins the scheme's sources (the NCBI assembly report was already the first).

**The verified facts.**

- NCBI's GCF_000004515.6 (Glycine_max_v4.0) assembly report names chromosome 1 `Gm01`, with GenBank `CM000834.4` and RefSeq `NC_016088.4` [web] https://ftp.ncbi.nlm.nih.gov/genomes/all/GCF/000/004/515/GCF_000004515.6_Glycine_max_v4.0/GCF_000004515.6_Glycine_max_v4.0_assembly_report.txt. The same CM000834 to CM000853 accession lineage carries chromosomes 1 to 20 in every Wm82 version (V1.1 `GLYMAchr_01`, v2.0 and v2.1 `Chr01`, v4.0 `Gm01`), so no Wm82 assembly renumbers a chromosome.
- The LIS Data Store README for Wm82.gnm5.NRKG gives `chromosome_prefix: Chr`, while gnm1, gnm2, gnm4 and gnm6 use `Gm` [web] https://data.legumeinfo.org/Glycine/max/genomes/Wm82.gnm5.NRKG/README.Wm82.gnm5.NRKG.yml. Data Store sequence names are `glyma.Wm82.gnmN.GmNN` or, for gnm5, `glyma.Wm82.gnm5.ChrNN`; the gnm6 seqid_map maps `Gm01` to `glyma.Wm82.gnm6.Gm01`.

The pattern was checked in JavaScript `RegExp` and Python `re` (flag i, joining the defined groups) on 28 spellings. Every spelling the 1.2.0 rule read maps identically (`Gm01`, `gm1`, `chr7`, `Chr_07`, `chromosome 13`, `LG_7`, `lg7`, `7`, `07`, `20`). Newly read: `glyma.Wm82.gnm4.Gm01` as `Gm01`, `glyma.Wm82.gnm5.Chr13` as `Gm13`, `glyma.Wm82.gnm2.Gm20` as `Gm20`, `GLYMAchr_01` and `GLYMAchr01` as `Gm01`, and `glyma.wm82.gnm12.gm05` as `Gm05`.

**Kept as written, and why.**

| Spelling                                     | Reason                                                                                                                                                                                                          |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `21`, `Gm00`, `glyma.Wm82.gnm2.Gm21`         | Outside 1..20: soybean has 20 chromosomes.                                                                                                                                                                      |
| `scaffold_22`, `glyma.Wm82.gnm4.scaffold_22` | Unplaced scaffolds, with or without the Data Store prefix.                                                                                                                                                      |
| `glyma.Lee.gnm1.Gm01`                        | Another cultivar: the Williams 82 numbering is not asserted for other genotypes' assemblies.                                                                                                                    |
| `glyma.Wm82.gnm4.LG7`                        | `LG` is not a Data Store prefix, so the pattern does not take it after `glyma.Wm82.gnmN.`; it does take `Gm` or `Chr` after any `gnmN` (for example `glyma.Wm82.gnm4.Chr01`), and each lands on its own number. |
| `glyma.Wm82.gnm6.01`                         | A bare number after the prefix is not a Data Store spelling.                                                                                                                                                    |
| `NC_016088.4`                                | RefSeq accessions need a lookup table, not a pattern; deferred. Visible, not silent.                                                                                                                            |
| `MT`, `Pltd`, `ChrUn`                        | Organelles and unanchored bins pass through, as in every scheme.                                                                                                                                                |

Every spelling above is asserted in `tests/crops.test.ts`, and the case `crop-soybean-data-store-spellings` pins `glyma.Wm82.gnm4.Gm13`, `glyma.Wm82.gnm5.Chr07` and `GLYMAchr_07` as read and `glyma.Wm82.gnm4.scaffold_22` as kept as written, so the reading is checked in both repositories. No existing case changes its expectation beyond the contract version.

**Supersedes one sentence.** ADR 0020 and the 1.5.0 text said the soybean scheme "reproduces the 1.2.0 rule exactly". From 1.12.0 it reads every spelling of the 1.2.0 rule and, in addition, the Data Store names and `GLYMAchr_01`. ADR 0020 keeps its dated wording; the live documents (`contract/data-contract.md`, `src/io/crops.ts`, `docs/input-coding.md`) carry the new sentence.

### Consequences

- Good: a Data Store VCF of any Wm82 version loads with `Gm01`..`Gm20` names, orders correctly and matches markers.csv and target regions written as `Gm01`.
- Neutral: the canonical names stay `Gm01`..`Gm20`, so an export does not preserve the Data Store spelling.
- Bad: a file on RefSeq accessions (`NC_016088.4`) still needs its CHROM rewritten.

## Revisit when

- A RefSeq accession table is wanted, so `NC_016088.4` and its siblings can be read.
- A Wm82 assembly renumbers a chromosome, or the Data Store publishes a Wm82 assembly under another chromosome prefix.

## More Information

Contract 1.12.0: `contract/crops/soybean.json`, `contract/data-contract.md` ("Chromosome names"), `contract/VERSION`, `contract/README.md`, the case `contract/cases/crop-soybean-data-store-spellings/`. Mirrored byte for byte into `progeny-selector`, whose record is its ADR 0032.
