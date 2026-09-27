# Contract 1.10.0: the VCF GT grammar

Status: accepted. Date: 2026-09-26. Format: MADR 4.0.0 [web] https://adr.github.io/madr/.

## Context and Problem Statement

The contract's VCF section said "GT allele indices refer to the REF,ALT list (0 = REF); `.` is missing; `/` and `|` are treated alike (phase ignored); haploid GT is read as homozygous" and never stated the grammar of an allele index. Both tools read malformed GT without saying anything. Measured against backcross before this change (`src/io/vcf.ts`, `parseGt`, which split on the first separator and read each side with JavaScript `Number`) and against progeny-selector (`_parse_gt`, Python `int()` into int8):

| GT                               | backcross before 1.10.0                                                    | progeny-selector before 1.10.0 |
| -------------------------------- | -------------------------------------------------------------------------- | ------------------------------ |
| `-5/0`                           | allele 251 (`Number`, then a Uint8Array wrap)                              | int8 -5 stored                 |
| `1e1/0`                          | 10/0                                                                       | raw ValueError                 |
| `/0`, `0/`                       | 0/0 (`Number('') === 0`)                                                   | ValueError                     |
| empty GT                         | missing (skipped before `parseGt`)                                         | ValueError                     |
| `+1/0`, ` 0/1`, `01/0`           | read                                                                       | read (`int()`)                 |
| `1_0/0`                          | error                                                                      | 10/0 (`int()` accepts `_`)     |
| `0/0/1`                          | 0/0, the third allele silently dropped                                     | "non-diploid GT" error         |
| `\|0\|1` (VCF 4.4 leading phase) | 0/0 silently                                                               | error                          |
| index > ALT count                | unchecked                                                                  | checked                        |
| index >= 128                     | stored up to 254, 255 silently missing (MISSING_ALLELE), an error from 256 | raw OverflowError (int8)       |

VCF 4.2 section 1.4.2: "GT : genotype, encoded as allele values separated by either of / or |. The allele values are 0 for the reference allele ..., 1 for the first allele listed in ALT, 2 for the second allele list in ALT and so on." No VCF version allows a sign, an exponent, an underscore or whitespace in an allele value. htslib rejects `-5/0`, `1e1/0`, `/0` and `0/` with a fatal error (vcf.c, `vcf_parse_format`), and TASSEL (BuilderFromVCF.java) reads several of them as missing without a word. [research]

The maintainer's standing instruction for the run was to consult research, under the criterion "never silently wrong, tolerant of standard-tool exports".

## Decision Drivers

- Never silently wrong: a GT that names no allele of the record, or names one by a spelling no VCF writer produces, must not become a genotype.
- The two tools must agree; today they disagree on half the rows above.
- `contract/README.md`: input that 1.0.0 never stated is not contract vocabulary, so a version that rejects it is a stricter reading, not a changed rule, and a minor bump (precedent: 1.2.0 added an error kind as a minor version). An index outside REF,ALT already broke the stated rule.
- Haploid-as-homozygous is a stated rule and must be kept.

## Considered Options

1. **State the VCF grammar and reject everything else** as a new error kind `genotypes.invalid_gt`.
2. **Read malformed GT as missing**, as TASSEL does.
3. **Leave the grammar unstated.**

## Decision Outcome

**Chosen: option 1, as contract 1.10.0, a minor bump.** The GT sub-field is `.` or an allele index, or two of them separated by `/` or `|`. An allele index is `0` or `[1-9][0-9]*`, at most 127, and less than the number of alleles in REF and ALT together. An empty GT is read as missing. Anything else is `genotypes.invalid_gt`, naming the line and the value. Both tools use the same regular expression, `^(\.|0|[1-9][0-9]*)(?:[/|](\.|0|[1-9][0-9]*))?$`, written with `[0-9]` rather than `\d` because Python's `\d` matches Unicode digits, and progeny-selector applies it with `re.fullmatch` because `$` accepts a trailing newline. The GT is still the text before the first `:` of the sample field when GT is first in FORMAT. The ceiling of 127 keeps an index inside progeny-selector's int8 store.

In backcross the error reads `VCF line <n>: invalid GT "<value>"`, followed for a range failure by the reason; `tests/contract-cases.test.ts` maps the kind to `/invalid GT/`.

Option 2 was rejected because it is silently wrong: a truncated or mangled call disappears from the counts with no sign that the file was damaged. Option 3 leaves the two tools reading the same file differently.

**Kept as before:** `./.`, `.|.` and `.` are missing; a half-missing `./1` is missing (backcross drops a pair with either side missing); haploid `1` is read as 1/1; phased `1|0` is the unordered pair 0/1; a multiallelic index such as `2/2` with ALT `G,T` is T/T. **Stated as missing:** an empty GT, which backcross already read as missing (progeny-selector raised a ValueError). It names no allele, so reading it as missing cannot be silently wrong, and it is pinned in `vcf-gt-haploid-and-missing`. A sample field that ends before its GT sub-field (FORMAT `DP:GT`, sample `12`) is missing too, because VCF lets trailing sub-fields be dropped; backcross already read it so, progeny-selector raised a raw `IndexError`, and the contract case `vcf-gt-haploid-and-missing` now pins it (record h7).

### Consequences

- Good: every row of the table except the empty GT is now an error in both tools, pinned by eight contract cases (`err-vcf-gt-negative`, `-exponent`, `-underscore`, `-empty-side`, `-leading-zero`, `-triploid`, `-exceeds-alt`, `-leading-phase`), and two positive cases (`vcf-gt-haploid-and-missing`, `vcf-gt-multiallelic-index`) pin what stays readable. Unit tests in `tests/contracts.test.ts` cover every row, including the 127 and 128 boundary.
- Neutral: one error kind is added; no stated input changes meaning.
- Bad: a VCF 4.4 file that writes the leading phase indicator (`|0|1`) is rejected until the deferred item below is taken up.

## More Information

Deferred: reading the VCF 4.4 leading phase indicator when the file declares `##fileformat=VCFv4.4`. Neither parser gates on the version today, and accepting the indicator unconditionally would turn a truncated `/0` in a 4.2 file into hom-REF.

Contract 1.10.0: `contract/data-contract.md` ("VCF"), `contract/VERSION`, `contract/README.md`. Mirrored byte for byte into `progeny-selector` under the version and mirror rules of ADR 0013, where docs/adr/0030 records the mirror. Supersedes nothing.
