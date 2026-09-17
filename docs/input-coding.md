# Input coding reference

What each genotype format accepts, reads as missing, and rejects, under contract 1.4.0 (`contract/data-contract.md`). The same rules apply in progeny-selector, so a file that loads here loads there. Cells are trimmed and case-insensitive. Every call is diploid (two alleles per sample per marker); polyploid dosage is out of scope. Chromosome names are soybean-only in this version (`Gm01`..`Gm20`; any other name is kept as written).

| Format               | Accepted calls                                                                                                                               | Missing                                                          | Rejected (error naming the line and cell)                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| VCF 4.2+             | GT allele indices into REF,ALT (`0/1`, `0\|1`, `1/2`); haploid `1` as homozygous                                                             | `.` as either allele (`./.`, `.`)                                | a record whose FORMAT has no GT                                                                                       |
| HapMap               | `AA`, `AT`, `A/T`, `A\|T`, `A`; one IUPAC code `R Y S W K M` read as the heterozygote (R = A/G, Y = C/T, S = C/G, W = A/T, K = G/T, M = A/C) | empty, `N`, `NN`, `NA`, `-`, `--`, `.`, `./.`, `.\|.`, `X`, `XX` | `?`, `B`, `H`, `0`, `+`, any other single character; a pair with a character outside A C G T N - . (`A?`, `N?`, `RR`) |
| Wide CSV, nucleotide | as HapMap                                                                                                                                    | empty, `N`, `NN`, `NA`, `-`, `--`, `.`, `./.`, `.\|.`            | as HapMap, plus `X` and `XX`                                                                                          |
| Wide CSV, coded      | `A` (recurrent parent), `B` (donor), `H` (heterozygous)                                                                                      | empty, `N`, `NA`                                                 | everything else, including `-`, `--`, `.`, `./.`, `.\|.`, `NN`                                                        |

A wide CSV is read as coded when every cell outside the nucleotide missing list is `A`, `B` or `H` and at least one `B` or `H` occurs; otherwise as nucleotide, where a single `B` or `H` is then an error.

Blank and whitespace-only lines, and rows whose every field is empty, are skipped in every file; `#` does not start a comment; a quoted field may contain a line break.

A pair of one nucleotide and one of `N`, `-`, `.` (`AN`, `A-`) is read as missing by both tools today but is not yet part of the contract.

Crop chromosome schemes arrive with contract 1.5.0.

## Token profiles

A token profile (contract 1.4.0, `contract/profiles/`, docs/adr/0019) changes how HapMap and wide-CSV cells are read. Choose one on the Upload screen, with `--profile` on the command line, or supply a JSON file of the same shape. Under `base` nucleotide the format's own vocabulary stays underneath the profile's tokens; under `none` the profile is the whole vocabulary. A heterozygote written `*` is the two alleles the marker shows on that row (HapMap's `alleles` column included), and is an error when the row shows any other number or an indel `-`; HapMap's `alleles` column is upper-cased first. A profile with a VCF, a BrAPI source, or a wide CSV that is coded A/B/H (requested or detected) is an error. A profile file is recorded as `custom:<id>` even when its id is a built-in's; unknown keys, a token listed twice and a heterozygote pair of identical symbols are rejected. Every CSV export records the profile in a trailing `token_profile` column.

| profile          | homozygous                               | heterozygous                | missing                                                         | base       |
| ---------------- | ---------------------------------------- | --------------------------- | --------------------------------------------------------------- | ---------- |
| `tassel`         | (format)                                 | (format)                    | `X`, `XX`                                                       | nucleotide |
| `soybase-report` | (format)                                 | `H` (the row's two alleles) | `U`                                                             | nucleotide |
| `dart`           | `0` -> 0, `1` -> 1                       | `2` -> 0/1                  | empty, `-`, `NA`                                                | none       |
| `axiom`          | `AA` -> A, `BB` -> B, `0` -> A, `2` -> B | `AB`, `BA`, `1` -> A/B      | empty, `NoCall`, `OTV`, `-1`, `-2`, `--`, `NA`                  | none       |
| `kasp`           | `X:X` -> X, `Y:Y` -> Y                   | `X:Y`, `Y:X` -> X/Y         | empty, `?`, `Uncallable`, `Missing`, `NTC`, `Dupe`, `Bad`, `NA` | none       |
