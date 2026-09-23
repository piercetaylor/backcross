# Input coding reference

What each genotype format accepts, reads as missing, and rejects, under contract 1.6.0 (`contract/data-contract.md`). The same rules apply in progeny-selector, so a file that loads here loads there. Cells are trimmed and case-insensitive. Every call is diploid (two alleles per sample per marker); polyploid dosage is out of scope. Chromosome names are read under the crop scheme chosen at load time (see "Crop chromosome schemes" below); any name the scheme does not match is kept as written.

| Format               | Accepted calls                                                                                                                               | Missing                                                          | Rejected (error naming the line and cell)                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| VCF 4.2+             | GT allele indices into REF,ALT (`0/1`, `0\|1`, `1/2`); haploid `1` as homozygous                                                             | `.` as either allele (`./.`, `.`)                                | a record whose FORMAT has no GT                                                                                       |
| HapMap               | `AA`, `AT`, `A/T`, `A\|T`, `A`; one IUPAC code `R Y S W K M` read as the heterozygote (R = A/G, Y = C/T, S = C/G, W = A/T, K = G/T, M = A/C) | empty, `N`, `NN`, `NA`, `-`, `--`, `.`, `./.`, `.\|.`, `X`, `XX` | `?`, `B`, `H`, `0`, `+`, any other single character; a pair with a character outside A C G T N - . (`A?`, `N?`, `RR`) |
| Wide CSV, nucleotide | as HapMap                                                                                                                                    | empty, `N`, `NN`, `NA`, `-`, `--`, `.`, `./.`, `.\|.`            | as HapMap, plus `X` and `XX`                                                                                          |
| Wide CSV, coded      | `A` (recurrent parent), `B` (donor), `H` (heterozygous)                                                                                      | empty, `N`, `NA`                                                 | everything else, including `-`, `--`, `.`, `./.`, `.\|.`, `NN`                                                        |

A wide CSV is read as coded when every cell outside the nucleotide missing list is `A`, `B` or `H` and at least one `B` or `H` occurs; otherwise as nucleotide, where a single `B` or `H` is then an error.

Blank and whitespace-only lines, and rows whose every field is empty, are skipped in every file; `#` does not start a comment; a quoted field may contain a line break.

A pair of one nucleotide and one of `N`, `-`, `.`, in either order and in any of the three spellings (`AN`, `-A`, `A/N`), is read as missing in HapMap and in a nucleotide wide CSV (contract 1.6.0, docs/adr/0021). It is part of the pair grammar, not a missing token, so `AX` and `A?` stay errors.

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

## Crop chromosome schemes

A crop scheme (contract 1.5.0, `contract/crops/`, docs/adr/0020) decides which chromosome spellings normalise to which canonical names and in what order. Choose one on the Upload screen or with `--crop` on the command line; `soybean` is the default and reproduces the previous soybean-only rule exactly. A name the scheme's pattern does not match is never changed: unanchored bins (`ChrUn`, `Un0`, `chr00`) and organelles (`MT`, `Pltd`, `Mt`, `Pt`) pass through and are ordered after the canonical names in natural order. Positions are never converted between assemblies. Every CSV export records the scheme in a trailing `crop` column.

| id            | canonical names              | assembly the names come from                    | accepted prefixes                     |
| ------------- | ---------------------------- | ----------------------------------------------- | ------------------------------------- |
| `soybean`     | `Gm01`..`Gm20`               | Williams 82 (Wm82.a2.v1 / a4.v1 / a6.v1 naming) | `Gm`, `Chr`, `Chromosome`, `LG`, none |
| `maize`       | `chr1`..`chr10`              | Zm-B73-REFERENCE-NAM-5.0                        | `chr`, `chromosome`, none             |
| `rice`        | `Chr1`..`Chr12`              | IRGSP-1.0 / MSU7                                | `chr`, `chromosome`, none             |
| `sorghum`     | `Chr01`..`Chr10`             | BTx623 v3.1.1 (NCBIv3)                          | `chr`, `chromosome`, none             |
| `wheat`       | `Chr1A`..`Chr7D` (21)        | IWGSC CS RefSeq v2.1                            | `chr`, `chromosome`, none             |
| `barley`      | `chr1H`..`chr7H`             | MorexV3                                         | `chr`, `chromosome`, none             |
| `oat`         | `chr1A`..`chr7D` (21, A C D) | OT3098 v2                                       | `chr`, `chromosome`, none             |
| `common-bean` | `Chr01`..`Chr11`             | G19833 v2.1                                     | `chr`, `Pv`, `chromosome`, none       |
| `cotton`      | `A01`..`A13`, `D01`..`D13`   | TM-1 UTX v2.1                                   | `chr`, `chromosome`, none             |

The `LG` prefix is accepted only under `soybean`: in other crops a linkage-group number need not equal a chromosome number, so reading it as one would be silently wrong. Cowpea, pea, sunflower and peanut are not shipped in this version because a bare number is ambiguous in each; potato is dosage-called and out of scope.
