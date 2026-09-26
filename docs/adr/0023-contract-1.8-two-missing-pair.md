# Contract 1.8.0: a pair of two missing characters is read as missing

Status: accepted. Date: 2026-09-26. Format: MADR 4.0.0 [web] https://adr.github.io/madr/.

## Context and Problem Statement

Contract 1.6.0 (ADR 0021) stated that a pair of one nucleotide and one of `N`, `-`, `.` is read as missing, and left one cell out on purpose: a pair of two of `N`, `-`, `.` that is not itself a missing token (`N/N`, `N-`, `./N`, `..`). ADR 0021 said the contract should say so "in as many words in both sections" and left whether to state a reading to the maintainer, and the contract has said since that the pair "is not defined by this version" in the HapMap and the wide-CSV section. Both tools read such a cell as missing. ADR 0021's first decision driver applies to this cell unchanged: "silence is what allows the two readings to drift apart".

The maintainer delegated the choice to research, under the criterion "best for academic and open-source plant-breeding users: reproducible with standard tools, tolerant of spreadsheet, pandas and R exports, never silently wrong".

## Decision Drivers

- The contract must not stay silent about a cell both tools accept; silence is what allows the two readings to drift apart (ADR 0021).
- Stating a reading both tools already had changes no input's meaning. ADR 0013 grants a minor bump only for an additive optional column or token, so the minor bump rests on the 1.6.0 precedent (ADR 0021) and on `contract/README.md`'s stricter-reading clause: input an earlier version never stated is not contract vocabulary. Once the reading is stated, rejecting the pair later would be a changed rule and a major bump.
- The maintainer's criterion: reproducible with standard tools, tolerant of spreadsheet, pandas and R exports.
- Never silently wrong: a cell that names no allele must not be turned into a genotype.

## Considered Options

1. **Read the pair as missing** — what both implementations already do.
2. **Reject the pair as `genotypes.unknown_cell`.**

## Decision Outcome

**Chosen: option 1, read the pair as missing, stated as contract 1.8.0, a minor bump by the 1.6.0 precedent (ADR 0021) and the stricter-reading clause of `contract/README.md`, because no input changes meaning.**

The agreement was measured before the contract was written: 576 probe cells run through both parsers, Node and Python, gave identical results. Without a profile (recorded as `default`), or under a profile whose `base` is `nucleotide` (`tassel`, `soybase-report`), all 27 cells (`N`, `-`, `.` paired with each other, in the two-character, slash and bar spellings) read as missing, in HapMap and in wide CSV alike. Under a profile whose `base` is `none` (`dart`, `axiom`, `kasp`) each such cell is `genotypes.unknown_cell` unless the profile lists that exact string as a missing token: `axiom` lists `--`, so `--` is missing there and the other 26 are errors. A pair containing `X` (`X/X`, `XN`, `N/X`, `X.`) is an error in both tools, because `X` is not a pair character; `XX` stays a HapMap missing token and an error in wide CSV.

Option 2 was rejected because it would turn files both tools read today into errors, which is a changed rule and a major bump, and because the cell carries no allele at all, which is exactly what "missing" means downstream.

**The pair belongs to the grammar, not to the missing-token lists**, as the half-missing pair does (ADR 0021). The clause names `N`, `-` and `.` only, so `X` does not join the pair characters. A wide CSV whose cells outside the nucleotide missing list include such a pair is read as nucleotide by `auto` detection (`src/io/wide-csv.ts`, `detectWideCsvMode`, skips the nucleotide missing list and, under a profile, that profile's tokens, and requires every other cell to be A, B or H for coded); the four of the 27 cells that are themselves missing tokens (`NN`, `--`, `./.`, `.|.`) are skipped by detection as before. This is unit-tested (`tests/contracts.test.ts`) rather than pinned in a case. Under a token profile the rule sits where the format's vocabulary sits: applied below the profile's own tokens when `base` is `nucleotide`, and absent when `base` is `none`.

### Consequences

- Good: the open sentence of ADR 0021 and of the contract is closed, and the reading both tools have always had is now checkable. Four contract cases carry it (`hapmap-two-missing-pair`, `wide-two-missing-pair`, `profile-tassel-two-missing-pair`, `err-profile-none-two-missing-pair`), and hand-built unit tests cover all 27 cells with no profile and under `tassel`, every one under `dart`, `kasp` and `axiom` (with `axiom`'s `--` as the listed exception), and the `X` pairs.
- Neutral: no existing test fails, no input changes meaning and no error kind is added; the new cases pin the reading against a future stricter parser.
- Bad: `-/-`, which TASSEL reads as a homozygous deletion, and `..`, a VCF-style pair of missing alleles, are both read as missing, so a deletion call in that spelling is lost rather than carried. The contract states the reading plainly so it is at least visible, and `docs/input-coding.md` states it below its per-format table.

## More Information

Contract 1.8.0: `contract/data-contract.md` ("HapMap", "Wide CSV", "Token profiles"), `contract/VERSION`, `contract/README.md`. Mirrored byte for byte into `progeny-selector` under the version and mirror rules of ADR 0013. Supersedes nothing; it amends the open sentence of ADR 0021 on the pair of two missing characters.
