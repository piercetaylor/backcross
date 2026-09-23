# Contract 1.6.0: a half-missing pair is read as missing

Status: accepted. Date: 2026-09-23. Format: MADR 4.0.0 [web] https://adr.github.io/madr/.

## Context and Problem Statement

Contract 1.1.0 (ADR 0014) fixed the per-cell nucleotide vocabulary shared by HapMap and wide CSV, but left one cell out: a pair of one nucleotide and one missing character, `AN`, `A-`, `A.` and the same with C, G or T, in either order and in any of the three spellings (`AN`, `A/N`, `A|N`). ADR 0014 recorded it as "neutral: half-missing pairs stay undecided and are read as missing by both tools", and `PLAN.md` and `progeny-selector`'s `docs/data-formats.md` have carried it as the last open item of the shared contract ever since. The contract's own text said the pair "is not defined by this version" in both the HapMap and the wide-CSV section, so a file containing one had no defined reading even though both tools read it.

## Decision Drivers

- The contract must not stay silent about a cell both tools accept; silence is what allows the two readings to drift apart.
- A rule that changes no input's meaning is a minor bump (ADR 0013); a rule that changed one would be major.
- Never silently wrong: a cell that carries half a call must not be turned into a genotype.

## Considered Options

1. **Read the pair as missing** — what both implementations already do.
2. **Read the pair as a homozygote of the called nucleotide** (`AN` -> `A/A`).
3. **Reject the pair as `genotypes.unknown_cell`.**

## Decision Outcome

**Chosen: option 1, read the pair as missing, stated as contract 1.6.0, a minor bump.**

The two implementations were compared cell by cell before the contract was written: `src/io/calls.ts:100-101` rejects a pair character outside A C G T N `-` `.` and returns `null` when either character is one of the three, and `src/progeny_selector/io/calls.py:92-95` does the same with `None`. The callers pass the same missing sets (`hapmap.ts:80` and `hapmap.py:70` the HapMap list, `wide-csv.ts:158` and `wide_csv.py:83` the wide-CSV list), and both coding detectors (`wide-csv.ts:54-89`, `calls.py:125-138`) treat such a cell as a non-missing, non-coded cell, so a file holding one is read as nucleotide. No input changes meaning: this is a rule the contract never stated, not a rule it stated differently.

Option 2 was rejected because a half-called cell is evidence about one chromatid only; calling it homozygous invents a second allele and would count towards recurrent-parent recovery. Option 3 was rejected because it would break files both tools read today, which is a major bump for no gain, and because the information the cell carries — this sample has no usable diploid call here — is exactly what "missing" means downstream.

**The pair belongs to the grammar, not to the missing-token lists.** It is a shape (`nucleotide` + one of `N`, `-`, `.`), not a token, so: the other character must be one of those three, leaving `AX` and `A?` errors; the pair does not join the missing lists, so wide-CSV `auto` detection still sees a non-missing cell and reads the file as nucleotide; and under a token profile (1.4.0) the rule sits where the format's vocabulary sits — applied below the profile's own tokens when `base` is `nucleotide`, and absent when `base` is `none`, where such a cell is `genotypes.unknown_cell` unless the profile lists that exact string. A profile's `missing` tokens are not half-missing characters either: `AX` under `tassel` and `AU` under `soybase-report` remain errors.

A pair of two of `N`, `-`, `.` that is not itself a missing token (`N/N`, `N-`, `./N`) is outside this decision, and the contract says so in as many words in both sections: "not defined by this version", the wording 1.1.0 used for the half-missing pair. Both tools read such a cell as missing; whether the contract should say so is the maintainer's decision, and until it does the pair must not be read as an error licensed by silence.

### Consequences

- Good: the last open item of the shared vocabulary is closed, and the reading both tools have always had is now checkable. Four contract cases carry it (`hapmap-half-missing-pair`, `wide-half-missing-pair`, `profile-tassel-half-missing-pair`, `err-profile-none-half-missing-pair`), and each repository has hand-built unit tests over all four nucleotides, all three missing characters, both orders and all three spellings.
- Neutral: no input changes meaning, no error kind is added, and no user-visible behaviour changes in either tool.
- Bad: a cell such as `A-`, which under TASSEL's reading of `-` as a deletion is a heterozygous indel call, loses that call to "missing" rather than being carried as an A/deletion heterozygote. The contract states the reading plainly so it is at least visible, and `docs/input-coding.md` states it in the paragraph below its per-format table.

## More Information

Contract 1.6.0: `contract/data-contract.md` ("HapMap", "Wide CSV", "Token profiles"), `contract/VERSION`, `contract/README.md`. Mirrored byte for byte into `progeny-selector` under the version and mirror rules of ADR 0013. Supersedes nothing; it states what ADR 0014 left open.
