# Input coding reference

What each genotype format accepts, reads as missing, and rejects, under contract 1.2.0 (`contract/data-contract.md`). The same rules apply in progeny-selector, so a file that loads here loads there. Cells are trimmed and case-insensitive. Every call is diploid (two alleles per sample per marker); polyploid dosage is out of scope. Chromosome names are soybean-only in this version (`Gm01`..`Gm20`; any other name is kept as written).

| Format               | Accepted calls                                                                                                                               | Missing                                                          | Rejected (error naming the line and cell)                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| VCF 4.2+             | GT allele indices into REF,ALT (`0/1`, `0\|1`, `1/2`); haploid `1` as homozygous                                                             | `.` as either allele (`./.`, `.`)                                | a record whose FORMAT has no GT                                                                                       |
| HapMap               | `AA`, `AT`, `A/T`, `A\|T`, `A`; one IUPAC code `R Y S W K M` read as the heterozygote (R = A/G, Y = C/T, S = C/G, W = A/T, K = G/T, M = A/C) | empty, `N`, `NN`, `NA`, `-`, `--`, `.`, `./.`, `.\|.`, `X`, `XX` | `?`, `B`, `H`, `0`, `+`, any other single character; a pair with a character outside A C G T N - . (`A?`, `N?`, `RR`) |
| Wide CSV, nucleotide | as HapMap                                                                                                                                    | empty, `N`, `NN`, `NA`, `-`, `--`, `.`, `./.`, `.\|.`            | as HapMap, plus `X` and `XX`                                                                                          |
| Wide CSV, coded      | `A` (recurrent parent), `B` (donor), `H` (heterozygous)                                                                                      | empty, `N`, `NA`                                                 | everything else, including `-`, `--`, `.`, `./.`, `.\|.`, `NN`                                                        |

A wide CSV is read as coded when every cell outside the nucleotide missing list is `A`, `B` or `H` and at least one `B` or `H` occurs; otherwise as nucleotide, where a single `B` or `H` is then an error.

A pair of one nucleotide and one of `N`, `-`, `.` (`AN`, `A-`) is read as missing by both tools today but is not yet part of the contract.

Crop-specific token profiles (TASSEL, SoyBase allele reports with `H`/`U`, DArT, Axiom, your own) arrive with contract 1.3.0; until then token meaning follows the file format, not the crop.
