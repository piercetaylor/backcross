# Spec: contract 1.2.0 (patch) across isoline-browser (canonical) and progeny-selector (mirror)

IB = `C:\Users\pierc\Projects\Plant_Breeding_Projects\isoline-browser`; PS = `C:\Users\pierc\Projects\Plant_Breeding_Projects\progeny-selector`. Paths below are relative to those roots. Phase A runs entirely in IB, Phase B entirely in PS after A, Phase C is the mirror gate from both sides. Doers never run git; `git diff --exit-code` gates and the PLAN.md edits are the main session's. Baseline: IB `a1d2b59`, PS `afae3ed`, contract 1.1.0, 28 cases.

## FINAL DECISIONS AND DELTAS (authoritative; override everything below)

Decided 2026-09-14. Question 4 by the maintainer; questions 1, 2 and 5 delegated by the maintainer to Fable under the criterion "best for academic and open-source plant-breeding users" (reproducible with bcftools, TASSEL and R; forgiving of spreadsheet, pandas and R exports; never silently wrong). The VCF 4.3 POS text was verified against `samtools/hts-specs` `VCFv4.3.tex`: "(Integer, Required)" and "Telomeres are indicated by using positions 0 or N+1".

**V. Version 1.2.0, a minor bump.** Every version string below already reads 1.2.0. Wherever the text below calls it a "patch", read "minor". Specifically:

- The `contract/README.md` paragraph begins "Version 1.2.0 (isoline-browser docs/adr/0014, amended 2026-09-14) is a minor version:".
- In the ADR 0014 amendment, replace the sentence "Version 1.2.0, a patch: a whole-valued float is an integer value, so accepting it clarifies the existing `integer` rule rather than adding vocabulary, and rejecting a fraction follows this record's reading that unstated input is not vocabulary." with "Version 1.2.0, a minor bump under docs/adr/0013: the amendment adds an accepted position grammar and the error kind `genotypes.invalid_position`. Rejecting fractional and negative positions follows this record's reading that unstated input is not vocabulary."
- The ADR's last sentence becomes "Token profiles and the crop selector move to contract 1.3.0."
- The A2 header comment says "Version 1.2.0 (docs/adr/0014, amendment of 2026-09-14)".
- Profile references already moved to 1.3.0: the main session did that in both PLAN.md files, ADR 0014, ADR 0010, docs/input-coding.md and docs/research. Don't touch them again.

**D1. VCF POS is decimal digits only**; HapMap `pos`, wide-CSV `pos_bp` and markers.csv `pos_bp` keep the whole-float grammar.

- IB `src/io/position.ts`: replace the function in A3 with

```ts
const POSITION = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const DIGITS = /^\d+$/;

/** grammar 'number' (HapMap, wide CSV, markers.csv) or 'digits' (VCF POS, declared Integer by the VCF specification). */
export function parsePosition(
  raw: string,
  where: string,
  grammar: 'number' | 'digits' = 'number',
): number {
  const cell = raw.trim();
  const value = (grammar === 'digits' ? DIGITS : POSITION).test(cell) ? Number(cell) : NaN;
  if (!Number.isFinite(value) || Math.floor(value) !== value || value < 0) {
    const expected =
      grammar === 'digits'
        ? 'decimal digits; VCF POS is an Integer'
        : 'a whole number such as 1000, 1000.0 or 1e3';
    throw new Error(`${where}: invalid position "${cell}" (expected ${expected})`);
  }
  return value;
}
```

Also add one sentence to the module header: "VCF POS uses the 'digits' grammar."

- IB `src/io/vcf.ts:59-60` become:

```ts
const pos = parsePosition(f[1] as string, `VCF line ${lineNo}`, 'digits');
const id = f[2] === '.' || f[2] === '' ? `${chrom}_${pos}` : (f[2] as string);
```

`chrom` is the raw CHROM as today. Update the header comment line 10 to: Records with ID "." or empty get `${chrom}_${pos}` from CHROM as written and POS as the parsed integer (contract 1.2.0).

- PS `io/position.py`: `parse_position(text: str, grammar: str = "number") -> int`. When `grammar == "digits"`, the cell must fullmatch `_DIGITS_ONLY = re.compile(r"\d+", re.ASCII)` and the value is `int(cell)`; otherwise use the existing logic. The message suffix is `(expected decimal digits; VCF POS is an Integer)` for digits and the existing text otherwise. `ValueError` if `grammar` is neither value.
- PS `io/vcf.py`: parse POS before the id (line 70). Insert before it:

```python
            try:
                pos_bp = parse_position(pos, grammar="digits")
            except ValueError as exc:
                raise DataContractError(f"line {line_no}: {exc}") from exc
```

Then line 70 becomes `marker_id = mid if mid not in (".", "") else f"{chrom}_{pos_bp}"`, and line 76 uses `pos_bp=pos_bp`. That replaces the B2 vcf.py block.

- **Cases:** replace `vcf-position-whole-float` with two cases.
  1. `vcf-position-digits-id`: a VCF with a record `Gm06 01000 . A G … 0/0 1/1 0/1` (ID `.`, POS with a leading zero) and a record `Gm06 2000 x2 C T … 0/0 1/1 1/1`. Expected markers are `{ id: 'Gm06_1000', chrom: 'Gm06', posBp: 1000, cm: null }` and `{ id: 'x2', chrom: 'Gm06', posBp: 2000, cm: null }`. Calls: RP `[A,A],[C,C]`; DONOR `[G,G],[T,T]`; L1 `[A,G],[T,T]`. The comment says the id is built from the parsed POS, as bcftools `%CHROM\_%POS` does.
  2. `err-vcf-position-float`: one record `Gm06 1e3 x1 A G … 0/0 1/1 0/1`, error `genotypes.invalid_position`. Its comment says VCF POS is an Integer and `1e3` is rejected even though HapMap and CSV accept it.

  The expected case count is 34.

- **Tests:**
  - The IB "HapMap and VCF" test: the VCF part asserts that a one-record VCF with POS `1e3` throws `VCF line 3: invalid position "1e3"`, that a one-record VCF with POS `2000.0` throws `VCF line 3: invalid position "2000.0"`, and that `01000` with ID `.` loads as posBp 1000 with id `Gm01_1000`.
  - The IB grammar test adds a `'digits'` block: `'1000'` and `'01000'` are accepted; `'+1000'`, `'1000.0'`, `'1e3'`, `''` and `'-5'` throw.
  - PS `test_positions_whole_floats_accepted_fractions_rejected`: the VCF part asserts that `1e3` in POS raises `invalid position '1e3'`, and that POS `01000` with ID `.` gives marker id `<chrom>_1000`. Adapt to the `VCF` constant's CHROM and ID values and report.
  - `test_parse_position_grammar` gains the same `digits` block.
- **Contract text** (A1), in the position sentence: "Every position column (VCF `POS`, HapMap `pos`, wide-CSV and markers.csv `pos_bp`) is a non-negative integer. VCF `POS` must be written as decimal digits, as the VCF specification declares it Integer. The other position columns also accept a whole-valued number written with a fraction part or an exponent (`1000.0`, `1e3`, `1.0E3`, `1.9E+07`), read as that integer, which is how spreadsheets, pandas and R export integer columns. As a pattern on the trimmed cell: `^\d+$` for VCF `POS`, `^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$` elsewhere, with the value finite, equal to its floor and not negative." Then the existing "Anything else is an error…" sentence, then: "Position 0 is accepted (VCF uses 0 and N+1 for telomeres); a negative position is an error in every column." In the VCF paragraph (line 17), the `<CHROM>_<POS>` sentence ends "…from CHROM exactly as written in the file, before chromosome normalisation, and POS as the parsed integer, so a record `chr13 019000000 .` is `chr13_19000000`, the string bcftools writes for `%CHROM_%POS`." Keep the rest of that sentence's example consistent.

**D2. `<CHROM>_<POS>` uses the parsed integer** in both repos (covered by D1).

**D3. Negative positions are an error in every column; 0 is accepted.** This is already what the grammar does. Only the contract sentence in D1 is added.

**Questions 3, 6, 7, 8, 9 and 10 take the provisional text.** In the CHANGELOG entries of both repos, add "VCF POS must be decimal digits; a VCF record with ID `.` is named from the parsed POS" and say "contract 1.2.0".

**Maintainer answers, 2026-09-14 (superseded by the section above).** Question 4: the version is **1.2.0** (minor, following ADR 0013 literally), so token profiles and the crop selector move to **1.3.0** in PLAN.md, ADR 0014, the 1.1 spec's notes and the handoff. Every `1.2.0` below becomes `1.2.0` at dispatch, and the file will be renamed. Questions 1, 2 and 5 are pending Fable's recommendation. Questions 3, 6, 7, 8, 9 and 10 take the provisional text.

Written by the planner on 2026-09-14. The maintainer's answers to the flagged questions at the end are recorded under "Maintainer answers" once given; they override the text above them.

## 0. Verified current behaviour (basis for the rule; nothing here is a decision)

| Input                                               | IB today                                                                               | PS today                                                                                                    |
| --------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| wide CSV `pos_bp` `1000.0`, `1e3`, `1.0E3`, `+1000` | `Number()` at `src/io/wide-csv.ts:82` → 1000                                           | `int(float())` at `src/progeny_selector/io/wide_csv.py:54` → 1000                                           |
| wide CSV `pos_bp` `100.7`                           | kept as 100.7 (`builder.ts:60` checks only finite and `>= 0`)                          | truncated to 100                                                                                            |
| wide CSV `pos_bp` empty                             | `Number('')` = 0, accepted                                                             | `float('')` → `DataContractError("line N: could not convert…")`                                             |
| wide CSV all-empty row `,,,,,`                      | marker id `""` at 0 (`wide-csv.ts:79-84`)                                              | skipped (`wide_csv.py:42`)                                                                                  |
| wide CSV empty `marker_id`, other cells present     | accepted as id `""`                                                                    | accepted as id `""`                                                                                         |
| wide CSV line number in errors after a skipped row  | physical (`csv.ts:76`)                                                                 | wrong: `enumerate(records, start=2)` counts surviving rows (`wide_csv.py:50`)                               |
| HapMap `pos` float/exponent                         | `Number()` at `src/io/hapmap.ts:42`, fraction kept                                     | `int()` at `hapmap.py:52` → `DataContractError("line N: invalid position '1000.5'")` for any non-digit text |
| VCF `POS` float/exponent                            | `Number()` at `src/io/vcf.ts:59`, fraction kept                                        | bare `int(pos)` at `vcf.py:76`, no `try` → raw `ValueError` escapes (not `DataContractError`)               |
| markers.csv `pos_bp`                                | `Number()` + `isFinite` at `src/io/markers.ts:40-42`; fraction kept; negative accepted | `int(float())` at `manifest.py:93`, truncates; no line number available (`_read_rows` drops `line_num`)     |
| negative position                                   | genotype readers reject via `builder.ts:60-61`; markers.csv accepts                    | accepted everywhere                                                                                         |
| `cm`                                                | `Number()` at `markers.ts:44`, float                                                   | `float()` at `manifest.py:92`                                                                               |
| `inf`/`nan` text                                    | `Number('Infinity')` = Infinity → builder rejects; `Number('nan')` = NaN → rejects     | `int(float('inf'))` raises `OverflowError`, which escapes `except ValueError` at `wide_csv.py:61`           |
| `0x10`, `1_000`, Unicode digits                     | `Number('0x10')` = 16 accepted; others NaN                                             | Python `float` accepts `1_000` and Unicode digits; rejects `0x10`                                           |

No `cm` column is parsed as an integer in either repo: no change to `cm`. Real-world inputs whose acceptance changes: none identified (fractional, negative, underscored and hexadecimal positions do not occur in VCF, TASSEL HapMap, SoySNP exports or Excel CSVs; Excel's `1.9E+07` is accepted by the new grammar).

## 1. The rule (exact contract wording, used verbatim in A1)

Position text, trimmed, must match `^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$` (ASCII digits only); the value must be finite, equal to its floor, and not negative. So `1000`, `+1000`, `1000.`, `1000.0`, `1e3`, `1.0E3`, `1.9E+07`, `0` are accepted as integers; empty, `100.7`, `.5`, `1e-3`, `-5`, `NaN`, `inf`, `Infinity`, `1e400`, `0x10`, `1_000`, `1,000`, `abc` are errors naming the line and the value. Applies to VCF `POS`, HapMap `pos`, wide-CSV `pos_bp`, markers.csv `pos_bp`. `cm` is untouched.

Wide CSV rows: a row whose every cell is empty or whitespace is skipped (checked before the column count); in any other row an empty `marker_id` or empty `pos_bp` is an error naming the line.

New error kind: `genotypes.invalid_position`.

---

# PHASE A: isoline-browser

Files touched: `contract/VERSION`, `contract/data-contract.md`, `contract/README.md`, `contract/cases/**` and `contract/MANIFEST.sha256` (generated), `scripts/make-contract.mjs`, `src/io/position.ts` (new), `src/io/wide-csv.ts`, `src/io/hapmap.ts`, `src/io/vcf.ts`, `src/io/markers.ts`, `tests/support/normalise.ts`, `tests/contract-cases.test.ts`, `tests/contracts.test.ts`, `docs/data-formats.md`, `docs/input-coding.md`, `docs/adr/0014-contract-1.1-alignment.md`, `CHANGELOG.md`. `PLAN.md`: main session only (A5.5). Not touched: `scripts/make-fixture.mjs`, `tests/fixtures/**`, `src/io/builder.ts`, `src/io/calls.ts`, `src/io/csv.ts`, `src/io/loaders.ts`, `src/io/index.ts`.

Order: A1 before A2 (the manifest hashes the text files). `contract/` is Prettier-ignored; `docs/`, `src/`, `tests/` and `CHANGELOG.md` are not.

## A1. Contract text and version

**`contract/VERSION`**: content `1.2.0\n`.

**`contract/data-contract.md`**

- Line 3: `Contract version: 1.2.0`.
- Line 13, append to the end of the paragraph (after "…before the first line is ignored."):

> Every position column (VCF `POS`, HapMap `pos`, wide-CSV and markers.csv `pos_bp`) is an integer written as decimal digits with an optional leading `+`; a whole-valued number written with a fraction part or an exponent (`1000.0`, `1e3`, `1.0E3`, `1.9E+07`) is read as that integer. As a pattern on the trimmed cell: `^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$` with the value finite, equal to its floor and not negative. Anything else is an error naming the line and the value: an empty cell, a non-zero fraction (`100.7`, `1e-3`), a negative number, `NaN`, `inf`, hexadecimal, or digits with `_` or `,` separators. `cm` is not a position and keeps its fraction.

- Line 32, replace the final sentence fragment "…so a coded file with them elsewhere may be misread. Two cell vocabularies:" with:

> …so a coded file with them elsewhere may be misread. A row whose every cell is empty or whitespace (`,,,`) is skipped; in any other row an empty `marker_id` or an empty `pos_bp` is an error naming the line. Two cell vocabularies:

- Lines 29 and 78 (the `pos_bp | integer` table cells): unchanged (the paragraph above governs; table alignment is hand-kept).

**`contract/README.md`**

- Line 9, append to the paragraph:

> Version 1.2.0 (isoline-browser docs/adr/0014, amended 2026-09-14) is a patch: a whole-valued position written as a float or in exponent notation (`1000.0`, `1e3`) is read as that integer in every position column, a fractional position is an error, an all-empty wide-CSV row is skipped, an empty `marker_id` or `pos_bp` in any other row is an error, and the error kind `genotypes.invalid_position` names a rejected position.

- Line 19: replace "`genotypes.no_gt`, `genotypes.no_header` or `genotypes.unknown_cell`." with "`genotypes.no_gt`, `genotypes.no_header`, `genotypes.unknown_cell` or `genotypes.invalid_position`."

**`docs/data-formats.md`** line 7: `version 1.1.0` → `version 1.2.0` (asserted by `tests/contract-cases.test.ts:139`).

## A2. Generator cases (`scripts/make-contract.mjs`)

Insert after line 23 (before the ` *` blank line preceding ` * Determinism:`):

```
 *
 * Version 1.2.0 (docs/adr/0014, amendment of 2026-09-14): whole-valued
 * float and exponent positions read as integers in wide CSV, markers.csv,
 * HapMap and VCF; a fractional position rejected with the error kind
 * genotypes.invalid_position; an all-empty wide-CSV row skipped.
```

Insert before line 1166 (`];`), verbatim. `lines`, `tsv`, `VCF_HEADER`, `HAPMAP_HEADER`, `HAPMAP_FIXED`, `SAMPLES_RP_DONOR_L1` exist (lines 47-48, 92, 93-107, 117-122).

```js
  {
    // Whole-valued positions written as a float, in exponent notation or with a leading `+`
    // are the integer, in the genotype file and in markers.csv (contract 1.2.0). No override:
    // every markers.csv position equals the genotype-file one, so only cm is added.
    name: 'wide-position-whole-float',
    files: {
      'genotypes.csv': lines(
        'marker_id,chrom,pos_bp,RP,DONOR,L1',
        'f1,Gm06,1000.0,A,G,A',
        'f2,Gm06,2e3,C,T,C/T',
        'f3,Gm06,3.0E3,G,A,A',
        'f4,Gm06,+4000,T,C,T',
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
      'markers.csv': lines(
        'marker_id,chrom,pos_bp,cm',
        'f1,Gm06,1000,0.5',
        'f2,Gm06,2000.0,1.25',
        'f3,Gm06,3e3,2.5',
        'f4,Gm06,4.0E3,3.75',
      ),
    },
    expect: {
      contractVersion: VERSION,
      coded: false,
      chromosomeOrder: ['Gm06'],
      markers: [
        { id: 'f1', chrom: 'Gm06', posBp: 1000, cm: 0.5 },
        { id: 'f2', chrom: 'Gm06', posBp: 2000, cm: 1.25 },
        { id: 'f3', chrom: 'Gm06', posBp: 3000, cm: 2.5 },
        { id: 'f4', chrom: 'Gm06', posBp: 4000, cm: 3.75 },
      ],
      sampleIds: ['RP', 'DONOR', 'L1'],
      calls: {
        RP: [
          ['A', 'A'],
          ['C', 'C'],
          ['G', 'G'],
          ['T', 'T'],
        ],
        DONOR: [
          ['G', 'G'],
          ['T', 'T'],
          ['A', 'A'],
          ['C', 'C'],
        ],
        L1: [
          ['A', 'A'],
          ['C', 'T'],
          ['A', 'A'],
          ['T', 'T'],
        ],
      },
    },
  },
  {
    // HapMap `pos` written as 1e3 and 2000.0 is 1000 and 2000.
    name: 'hapmap-position-whole-float',
    files: {
      'genotypes.hmp.txt': lines(
        tsv(HAPMAP_HEADER, 'RP', 'DONOR', 'L1'),
        tsv('g1', 'A/G', 'Gm06', '1e3', ...HAPMAP_FIXED, 'AA', 'GG', 'AG'),
        tsv('g2', 'C/T', 'Gm06', '2000.0', ...HAPMAP_FIXED, 'CC', 'TT', 'TT'),
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    expect: {
      contractVersion: VERSION,
      coded: false,
      chromosomeOrder: ['Gm06'],
      markers: [
        { id: 'g1', chrom: 'Gm06', posBp: 1000, cm: null },
        { id: 'g2', chrom: 'Gm06', posBp: 2000, cm: null },
      ],
      sampleIds: ['RP', 'DONOR', 'L1'],
      calls: {
        RP: [
          ['A', 'A'],
          ['C', 'C'],
        ],
        DONOR: [
          ['G', 'G'],
          ['T', 'T'],
        ],
        L1: [
          ['A', 'G'],
          ['T', 'T'],
        ],
      },
    },
  },
  {
    // VCF POS written as 1e3 and 2000.0 is 1000 and 2000. Both records carry an ID, so the
    // case does not pin what `<CHROM>_<POS>` would be for a float POS (see the 1.2.0 questions).
    name: 'vcf-position-whole-float',
    files: {
      'genotypes.vcf': lines(
        '##fileformat=VCFv4.2',
        tsv(VCF_HEADER, 'RP', 'DONOR', 'L1'),
        tsv('Gm06', '1e3', 'x1', 'A', 'G', '.', 'PASS', '.', 'GT', '0/0', '1/1', '0/1'),
        tsv('Gm06', '2000.0', 'x2', 'C', 'T', '.', 'PASS', '.', 'GT', '0/0', '1/1', '1/1'),
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    expect: {
      contractVersion: VERSION,
      coded: false,
      chromosomeOrder: ['Gm06'],
      markers: [
        { id: 'x1', chrom: 'Gm06', posBp: 1000, cm: null },
        { id: 'x2', chrom: 'Gm06', posBp: 2000, cm: null },
      ],
      sampleIds: ['RP', 'DONOR', 'L1'],
      calls: {
        RP: [
          ['A', 'A'],
          ['C', 'C'],
        ],
        DONOR: [
          ['G', 'G'],
          ['T', 'T'],
        ],
        L1: [
          ['A', 'G'],
          ['T', 'T'],
        ],
      },
    },
  },
  {
    // A position with a non-zero fraction is an error naming the line and the value.
    name: 'err-position-fraction',
    files: {
      'genotypes.csv': lines(
        'marker_id,chrom,pos_bp,RP,DONOR,L1',
        'u1,Gm02,1000,A,G,A',
        'u2,Gm02,100.7,A,G,G',
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    error: 'genotypes.invalid_position',
  },
  {
    // A row whose every cell is empty (`,,,,,`) is skipped; the two real rows load.
    name: 'wide-empty-row-skipped',
    files: {
      'genotypes.csv': lines(
        'marker_id,chrom,pos_bp,RP,DONOR,L1',
        'r1,Gm02,1000,A,G,A',
        ',,,,,',
        'r2,Gm02,2000,C,T,T',
      ),
      'samples.csv': SAMPLES_RP_DONOR_L1,
    },
    expect: {
      contractVersion: VERSION,
      coded: false,
      chromosomeOrder: ['Gm02'],
      markers: [
        { id: 'r1', chrom: 'Gm02', posBp: 1000, cm: null },
        { id: 'r2', chrom: 'Gm02', posBp: 2000, cm: null },
      ],
      sampleIds: ['RP', 'DONOR', 'L1'],
      calls: {
        RP: [
          ['A', 'A'],
          ['C', 'C'],
        ],
        DONOR: [
          ['G', 'G'],
          ['T', 'T'],
        ],
        L1: [
          ['A', 'A'],
          ['T', 'T'],
        ],
      },
    },
  },
```

Run `npm run contract` from IB root. Report the last line; it must read `contract 1.2.0: 34 cases, N files, B bytes`, and no size limit may throw.

## A3. Loader code

**New `src/io/position.ts`** (verbatim, then `npx prettier --write src/io/position.ts`):

```ts
/**
 * Position text shared by the VCF, HapMap, wide-CSV and markers.csv parsers
 * (contract/data-contract.md 1.2.0, "Genotype file"). Mirrors
 * progeny-selector src/progeny_selector/io/position.py, so both repositories
 * accept and reject the same cells.
 *
 * Responsibility: read one position cell as a non-negative whole number. The
 * trimmed cell must be decimal digits with an optional sign, fraction and
 * exponent ("1000", "+1000", "1000.0", "1e3", "1.0E3", "1.9E+07"), and the
 * value must be finite, equal to its floor and not negative. Anything else
 * throws naming `where` and the cell: empty, a non-zero fraction ("100.7",
 * "1e-3"), a negative number, NaN, Infinity, hexadecimal, "_" or ","
 * separators. Number() alone would read "" as 0 and "0x10" as 16, which is
 * why the grammar is checked first. Plain digits go through Number() too:
 * posBp is stored as float64, so nothing is gained by an integer path.
 *
 * Interface: parsePosition(raw, where) -> number.
 */

const POSITION = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

export function parsePosition(raw: string, where: string): number {
  const cell = raw.trim();
  const value = POSITION.test(cell) ? Number(cell) : NaN;
  if (!Number.isFinite(value) || Math.floor(value) !== value || value < 0) {
    throw new Error(
      `${where}: invalid position "${cell}" (expected a whole number such as 1000, 1000.0 or 1e3)`,
    );
  }
  return value;
}
```

**`src/io/wide-csv.ts`**

- After line 23 (`import { forEachRow, ... } from './csv.ts';`) add `import { parsePosition } from './position.ts';`.
- Replace lines 73-84 (from `if (f.length !== sampleCols.length + 3) {` through the closing `);` of `builder.push(`) with:

```ts
if (f.every((c) => c.trim() === '')) return;
if (f.length !== sampleCols.length + 3) {
  throw new Error(
    `wide genotype CSV line ${lineNumber}: expected ${sampleCols.length + 3} fields, got ${f.length}`,
  );
}
const id = (f[idCol] as string).trim();
if (id === '') throw new Error(`wide genotype CSV line ${lineNumber}: empty marker_id`);
const alleles = resolved === 'coded' ? ['A', 'B'] : [];
const offset = builder.push(
  id,
  f[chromCol] as string,
  parsePosition(f[posCol] as string, `wide genotype CSV line ${lineNumber}`),
  alleles,
);
```

- Header comment: after line 16 (`* B or H occurs; otherwise nucleotide.`) insert:

```
 * A row whose every cell is empty or whitespace is skipped; in any other row
 * an empty marker_id or an invalid pos_bp (position.ts) is an error naming
 * the line (contract 1.2.0).
```

`detectWideCsvMode` (lines 31-48) is unchanged: every cell of an all-empty row is `''`, which is in `NUCLEOTIDE_MISSING`.

**`src/io/hapmap.ts`**

- After line 18 add `import { parsePosition } from './position.ts';`.
- Line 42: `const pos = Number(f[3]);` → ``const pos = parsePosition(f[3] as string, `HapMap line ${i + 1}`);``
- Header comment line 10, after "cell is an error naming the cell.": add `` `pos` goes through position.ts (contract 1.2.0).``

**`src/io/vcf.ts`**

- After line 26 add `import { parsePosition } from './position.ts';`.
- Line 59: `const pos = Number(f[1]);` → ``const pos = parsePosition(f[1] as string, `VCF line ${lineNo}`);``
- Line 60 unchanged (id still uses the raw `f[1]`; see question 2).
- Header comment line 10, append: ` POS goes through position.ts (contract 1.2.0).`

**`src/io/markers.ts`**

- After line 14 add `import { parsePosition } from './position.ts';`.
- Replace lines 40-42 with:

```ts
const posBp = parsePosition(f[h.indexOf('pos_bp')] ?? '', `markers.csv line ${lineNumber}`);
```

- Header comment line 4: `Responsibility: read marker_id, chrom, pos_bp and optional cm.` → `Responsibility: read marker_id, chrom, pos_bp (position.ts, contract 1.2.0) and optional cm.`

`src/io/builder.ts:60-61` stays as a defensive guard; the readers now pre-empt it.

Run `npx prettier --write src/io/wide-csv.ts src/io/hapmap.ts src/io/vcf.ts src/io/markers.ts`.

## A4. Tests

**`tests/support/normalise.ts`** line 39: `| 'genotypes.unknown_cell';` → `| 'genotypes.unknown_cell'` followed by a new line `| 'genotypes.invalid_position';`.

**`tests/contract-cases.test.ts`** after line 38 add `  'genotypes.invalid_position': /invalid position/,` (the `Record<ErrorKind, RegExp>` type makes typecheck fail otherwise).

**`tests/contracts.test.ts`**

- After line 10 (`import { parseSampleManifest } ...`) add, in this order:

```ts
import { parseMarkerMap } from '../src/io/markers.ts';
import { parsePosition } from '../src/io/position.ts';
```

- Append after line 221 (end of file):

```ts
describe('positions (src/io/position.ts, contract 1.2.0)', () => {
  it('reads whole-valued decimal, float and exponent text as the integer', () => {
    const ok: [string, number][] = [
      ['1000', 1000],
      [' 1000 ', 1000],
      ['+1000', 1000],
      ['1000.', 1000],
      ['1000.0', 1000],
      ['1e3', 1000],
      ['1.0E3', 1000],
      ['1.9E+07', 19000000],
      ['1.5e3', 1500],
      ['0', 0],
    ];
    for (const [text, value] of ok) expect(parsePosition(text, 'p'), text).toBe(value);
  });

  it('rejects everything else naming the value', () => {
    const bad = [
      '',
      ' ',
      '100.7',
      '.5',
      '1e-3',
      '-5',
      'NaN',
      'Infinity',
      '1e400',
      '0x10',
      '1_000',
      '1,000',
      'abc',
    ];
    for (const text of bad) {
      expect(() => parsePosition(text, 'p'), text).toThrow(`p: invalid position "${text.trim()}"`);
    }
  });

  it('wide CSV: whole floats accepted, a fraction and an empty pos_bp rejected naming the line', () => {
    const g = parseWideCsv(
      'marker_id,chrom,pos_bp,S1,S2\nm1,Gm01,1000.0,A,T\nm2,Gm01,2e3,A,T\nm3,Gm01,3.0E3,A,T\nm4,Gm01,+4000,A,T\n',
    );
    expect(Array.from(g.markers.posBp)).toEqual([1000, 2000, 3000, 4000]);
    expect(() =>
      parseWideCsv('marker_id,chrom,pos_bp,S1,S2\nm1,Gm01,1000,A,T\nm2,Gm01,100.7,A,T\n'),
    ).toThrow('wide genotype CSV line 3: invalid position "100.7"');
    expect(() => parseWideCsv('marker_id,chrom,pos_bp,S1,S2\nm1,Gm01,,A,T\n')).toThrow(
      'wide genotype CSV line 2: invalid position ""',
    );
  });

  it('wide CSV: skips all-empty rows and rejects an empty marker_id naming the line', () => {
    const g = parseWideCsv(
      'marker_id,chrom,pos_bp,S1,S2\nm1,Gm01,100,A,T\n,,,,\n , , , , \nm2,Gm01,200,A,T\n',
    );
    expect(g.markers.ids).toEqual(['m1', 'm2']);
    expect(() =>
      parseWideCsv('marker_id,chrom,pos_bp,S1,S2\nm1,Gm01,100,A,T\n,Gm01,200,A,T\n'),
    ).toThrow('wide genotype CSV line 3: empty marker_id');
  });

  it('HapMap and VCF: whole floats accepted, a fraction rejected naming the line', () => {
    const header =
      'rs#\talleles\tchrom\tpos\tstrand\tassembly#\tcenter\tprotLSID\tassayLSID\tpanelLSID\tQCcode\tS1\tS2\n';
    const fixed = '+\tNA\tNA\tNA\tNA\tNA\tNA';
    const h = parseHapMap(
      header +
        `m1\tA/G\tGm01\t1e3\t${fixed}\tAA\tGG\n` +
        `m2\tA/G\tGm01\t2000.0\t${fixed}\tAA\tGG\n`,
    );
    expect(Array.from(h.markers.posBp)).toEqual([1000, 2000]);
    expect(() => parseHapMap(header + `m1\tA/G\tGm01\t100.7\t${fixed}\tAA\tGG\n`)).toThrow(
      'HapMap line 2: invalid position "100.7"',
    );
    const vcfHead =
      '##fileformat=VCFv4.2\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tS1\n';
    const v = parseVcf(
      vcfHead + 'Gm01\t1e3\tv1\tA\tG\t.\t.\t.\tGT\t0/1\nGm01\t2000.0\tv2\tA\tG\t.\t.\t.\tGT\t0/0\n',
    );
    expect(Array.from(v.markers.posBp)).toEqual([1000, 2000]);
    expect(() => parseVcf(vcfHead + 'Gm01\t3000.5\tv3\tA\tG\t.\t.\t.\tGT\t0/0\n')).toThrow(
      'VCF line 3: invalid position "3000.5"',
    );
  });

  it('markers.csv: whole floats accepted, a fraction rejected naming the line', () => {
    const map = parseMarkerMap('marker_id,chrom,pos_bp,cm\nm1,6,1000.0,0.5\nm2,6,2e3,1.25\n');
    expect(map.get('m1')?.posBp).toBe(1000);
    expect(map.get('m2')).toEqual({ chrom: 'Gm06', posBp: 2000, cm: 1.25 });
    expect(() =>
      parseMarkerMap('marker_id,chrom,pos_bp,cm\nm1,6,1000,0.5\nm2,6,2000.25,\n'),
    ).toThrow('markers.csv line 3: invalid position "2000.25"');
  });
});
```

Run `npx prettier --write tests/contracts.test.ts`. If `parseVcf` or the shape of `markers.posBp`/`markers.ids`/`parseMarkerMap`'s return type differs from what these tests assume, adapt the assertion to the real API without changing what is asserted, and report it.

## A5. Records

**`docs/adr/0014-contract-1.1-alignment.md`**, append at the end of the file:

```
## Amendments, 2026-09-14

**Positions written as whole-valued floats; all-empty wide-CSV rows (contract 1.2.0).** Decided by the maintainer on 2026-09-14. (1) Wherever a position is read from text (VCF `POS`, HapMap `pos`, wide-CSV and markers.csv `pos_bp`) the trimmed cell must match `^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$` with a finite, whole, non-negative value; a whole-valued number written as a float or in exponent notation (`1000.0`, `1e3`, `1.0E3`, `1.9E+07`) is that integer in both repositories, and anything else (a non-zero fraction such as `100.7`, an empty cell, a negative number, NaN, inf, hexadecimal, `_` or `,` separators) is an error naming the line and the value. `cm` is not a position and keeps its fraction. Before: this repository kept `100.7` as a fractional position and read an empty `pos_bp` as 0; progeny-selector truncated `100.7` to 100 in wide CSV and markers.csv, rejected any non-digit HapMap `pos`, and let a non-digit VCF `POS` escape as a bare `ValueError`. (2) A wide-CSV row whose every cell is empty or whitespace (`,,,`) is skipped in both, before the column count is checked; in any other row an empty `marker_id` or `pos_bp` is an error naming the line. Before, this repository created a marker with id `""` at position 0. (3) `#` comment lines and whitespace-only lines are deferred; PLAN.md records the divergence. Version 1.2.0, a patch: a whole-valued float is an integer value, so accepting it clarifies the existing `integer` rule rather than adding vocabulary, and rejecting a fraction follows this record's reading that unstated input is not vocabulary. The error kind `genotypes.invalid_position` is added for the cases. Cases: `wide-position-whole-float`, `hapmap-position-whole-float`, `vcf-position-whole-float`, `err-position-fraction`, `wide-empty-row-skipped`. The shared parser is `src/io/position.ts` here and `io/position.py` there. Contract 1.2.0 stays reserved for token profiles and the crop selector.
```

**`CHANGELOG.md`**, under `### Changed`, before the existing 1.1.0 item:

```
- Data contract 1.2.0 (docs/adr/0014, amended 2026-09-14): a position written as a whole-valued float or in exponent notation (`1000.0`, `1e3`, `1.9E+07`) is read as that integer in VCF, HapMap, wide CSV and markers.csv; a position with a fraction (`100.7`), an empty position or a negative one is now an error naming the line and value, where `100.7` was kept as a fractional position and an empty `pos_bp` read as 0; an all-empty wide-CSV row (`,,,`) is skipped instead of becoming a marker with an empty id at position 0, and an empty `marker_id` in any other row is an error. Five new cases under `contract/cases/`.
```

**`docs/input-coding.md`** line 3: `under contract 1.1.0` → `under contract 1.2.0` (no positions row; question 6).

**A5.5, main session only. `PLAN.md`**, insert after the "Settled 2026-09-14" paragraph as a new paragraph:

```
**Deferred, 2026-09-14 (contract 1.2.0 left it alone): comment and whitespace-only lines.** isoline-browser skips lines starting with `#` in the wide CSV, samples.csv and markers.csv (`src/io/csv.ts`, `forEachRow`) and, in HapMap, every line before the `rs#` header and `#` lines after it; progeny-selector treats a `#` line as data (a column-count error in wide CSV and HapMap, an extra row in samples.csv and markers.csv) and needs the HapMap header on line 1. Whitespace-only lines are the reverse: progeny-selector skips them in every reader, while isoline-browser skips only truly empty lines, so a spaces-only or tabs-only line is a column-count error in VCF, an `invalid position ""` error in HapMap, a one-field row in samples.csv and markers.csv, and, in the wide CSV since 1.2.0, an all-empty row that is skipped. Neither behaviour is in the contract and no case exercises either; the 1.2.0 case `wide-empty-row-skipped` uses only a full-width `,,,,,` row.
```

## A6. Gates (IB root)

```
npm run lint
npm run typecheck
npm test
npm run test:browser
npm run build
npm run fixture
npm run contract
```

Report the `npm run contract` line (`contract 1.2.0: 34 cases, …`) and the vitest totals. Main session then: `git diff --exit-code -- tests/fixtures` (must be clean; nothing in this patch touches the fixture generator) and `git diff --exit-code -- contract` after a second `npm run contract` (determinism).

---

# PHASE B: progeny-selector

Files touched: `contract/**` (copied), `src/progeny_selector/io/position.py` (new), `io/wide_csv.py`, `io/hapmap.py`, `io/vcf.py`, `io/manifest.py`, `tests/test_contract_cases.py`, `tests/test_io.py`, `docs/data-formats.md`, `docs/adr/0010-contract-1.1-alignment.md`, `CHANGELOG.md`. `PLAN.md` Handoff line 237: main session. Not touched: `io/calls.py`, `io/delimited.py`, `constants.py`, `scripts/check_contract.py`, `tests/test_check_contract.py` (it builds temp copies and hard-codes no counts), `scripts/make_fixture.py`, `tests/fixtures/**`.

Line numbers below were taken before the phase B review fixes of `afae3ed`; locate each edit by its quoted text, not by number alone.

## B1. Mirror

From PS root (PowerShell): `Remove-Item -Recurse -Force contract; Copy-Item -Recurse ..\isoline-browser\contract contract`. `.gitattributes` already has `contract/cases/** -text`, `*.gz binary`, `*.bgz binary`. Then `.venv\Scripts\python.exe scripts/check_contract.py ../isoline-browser` must print `contract 1.2.0: manifest ok, N files` and `contract mirror: N+1 files identical`, exit 0.

## B2. Loader code

**New `src/progeny_selector/io/position.py`** (verbatim):

```python
"""Position text shared by the VCF, HapMap, wide-CSV and markers.csv readers (contract/data-contract.md 1.2.0, "Genotype file";
mirrors isoline-browser src/io/position.ts).

Responsibility: read one position cell as a non-negative whole number. The trimmed cell must be ASCII decimal digits with an
optional sign, fraction and exponent ("1000", "+1000", "1000.0", "1e3", "1.0E3", "1.9E+07"), and the value must be finite,
equal to its floor and not negative. ValueError naming the cell for anything else: empty, a non-zero fraction ("100.7",
"1e-3"), a negative number, nan, inf, hexadecimal, "_" or "," separators. The grammar is checked before float() because
float() alone accepts "1_000", "nan", "inf" and non-ASCII digits, and int(float("inf")) raises OverflowError. Plain digits
are converted with int() so they never round-trip through float. Callers wrap the ValueError in DataContractError with the
line number.

Interface:
    parse_position(text: str) -> int
"""

from __future__ import annotations

import math
import re

_POSITION = re.compile(r"[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?", re.ASCII)
_DIGITS = re.compile(r"[+-]?\d+", re.ASCII)


def parse_position(text: str) -> int:
    cell = str(text).strip()
    message = f"invalid position {cell!r} (expected a whole number such as 1000, 1000.0 or 1e3)"
    if _POSITION.fullmatch(cell) is None:
        raise ValueError(message)
    if _DIGITS.fullmatch(cell):
        value = int(cell)
    else:
        as_float = float(cell)
        if not math.isfinite(as_float) or as_float != math.floor(as_float):
            raise ValueError(message)
        value = int(as_float)
    if value < 0:
        raise ValueError(message)
    return value
```

**`io/wide_csv.py`**

- Add `from progeny_selector.io.position import parse_position` in isort order (after `io.delimited`).
- Replace the block from `records = [row for row in reader if any(cell.strip() for cell in row)]` through the `Marker(... pos_bp=int(float(row[2])))` append with:

```python
    records = [(reader.line_num, row) for row in reader if any(cell.strip() for cell in row)]
    if not records:
        raise DataContractError("wide CSV has no marker rows")
    if coding == "auto":
        coding = detect_coding(cell for _, row in records for cell in row[3:])
    markers: list[Marker] = []
    alleles: list[list[str]] = []
    rows: list[np.ndarray] = []
    for line_no, row in records:
        if len(row) != len(header):
            raise DataContractError(f"line {line_no}: expected {len(header)} columns, found {len(row)}")
        marker_id = row[0].strip()
        if not marker_id:
            raise DataContractError(f"line {line_no}: empty marker_id")
        try:
            markers.append(Marker(marker_id=marker_id, chrom=normalize_chrom(row[1]), pos_bp=parse_position(row[2])))
```

(`reader.line_num` is the physical line of the row just yielded, so errors name the file's line even after skipped rows; `DataContractError` subclasses `ValueError`, so the `empty marker_id` raise sits outside the `try` to avoid double wrapping. Keep the rest of the loop body unchanged.)

- Docstring, `coding with auto-detection over every row;` → `coding with auto-detection over every row; a row whose every cell is empty or whitespace is skipped, an empty marker_id or an invalid pos_bp (position.py, contract 1.2.0) is an error naming the physical line;`.

**`io/hapmap.py`**

- Add `from progeny_selector.io.position import parse_position`.
- `pos_bp = int(fields[3])` → `pos_bp = parse_position(fields[3])`.
- `raise DataContractError(f"line {line_no}: invalid position {fields[3]!r}") from exc` → `raise DataContractError(f"line {line_no}: {exc}") from exc`.
- Docstring, append: `` `pos` goes through position.py (contract 1.2.0).``

**`io/vcf.py`**

- Add `from progeny_selector.io.position import parse_position`.
- Replace the line that appends `Marker(... pos_bp=int(pos))` with:

```python
            try:
                pos_bp = parse_position(pos)
            except ValueError as exc:
                raise DataContractError(f"line {line_no}: {exc}") from exc
            markers.append(Marker(marker_id=marker_id, chrom=normalize_chrom(chrom), pos_bp=pos_bp))
```

- The marker id from raw `pos` is unchanged (question 2).
- Docstring, append: ` POS goes through position.py (contract 1.2.0).`

**`io/manifest.py`**

- Add `from progeny_selector.io.position import parse_position`.
- `_read_rows` return type `-> list[dict[str, str]]` → `-> list[tuple[int, dict[str, str]]]`; `rows = []` → `rows: list[tuple[int, dict[str, str]]] = []`; `rows.append(clean)` → `rows.append((reader.line_num, clean))`.
- In `read_samples`, `for row in rows:` → `for _line_no, row in rows:`.
- In `read_markers`, `for row in rows:` → `for line_no, row in rows:`; replace the `Marker(... pos_bp=int(float(row["pos_bp"])) ...)` line with:

```python
        try:
            pos_bp = parse_position(row["pos_bp"])
        except ValueError as exc:
            raise DataContractError(f"{path}: line {line_no}: {exc}") from exc
        out[mid] = Marker(marker_id=mid, chrom=normalize_chrom(row["chrom"]), pos_bp=pos_bp, cm=cm)
```

- Docstring: `pos_bp, cm)` → `pos_bp via position.py, cm)`.

Run `.venv\Scripts\python.exe -m ruff format src tests` after the edits.

## B3. Tests

**`tests/test_contract_cases.py`**: add `    "genotypes.invalid_position": r"invalid position",` to `ERROR_KIND_PATTERNS`.

**`tests/test_io.py`**, append at the end. `VCF`, `HAPMAP_HEADER`/`HAPMAP_FIXED`, `read_wide_csv`, `read_markers`, `load_genotypes` are already imported. Existing `test_hapmap_invalid_position` keeps passing because the message still begins `invalid position '1000.5'`.

```python
def test_parse_position_grammar():
    """Contract 1.2.0: whole-valued text is the integer; everything else is a ValueError naming the cell."""
    from progeny_selector.io.position import parse_position

    ok = [("1000", 1000), (" 1000 ", 1000), ("+1000", 1000), ("1000.", 1000), ("1000.0", 1000), ("1e3", 1000), ("1.0E3", 1000), ("1.9E+07", 19000000), ("1.5e3", 1500), ("0", 0)]
    for text, value in ok:
        assert parse_position(text) == value, text
    for bad in ["", " ", "100.7", ".5", "1e-3", "-5", "nan", "inf", "Infinity", "1e400", "0x10", "1_000", "1,000", "abc", "\u0661\u0660"]:
        with pytest.raises(ValueError, match="invalid position"):
            parse_position(bad)


def test_positions_whole_floats_accepted_fractions_rejected(tmp_path: Path):
    wide = tmp_path / "g.csv"
    wide.write_text("marker_id,chrom,pos_bp,S1,S2\nm1,Gm06,1000.0,A,T\nm2,Gm06,2e3,A,T\nm3,Gm06,3.0E3,A,T\nm4,Gm06,+4000,A,T\n")
    assert [m.pos_bp for m in read_wide_csv(wide).markers] == [1000, 2000, 3000, 4000]
    wide.write_text("marker_id,chrom,pos_bp,S1,S2\nm1,Gm06,1000,A,T\nm2,Gm06,100.7,A,T\n")
    with pytest.raises(DataContractError, match=r"line 3: invalid position '100\.7'"):
        read_wide_csv(wide)
    hm = tmp_path / "g.hmp.txt"
    hm.write_text(f"{HAPMAP_HEADER}\tS1\tS2\nm1\tA/T\t6\t1e3\t{HAPMAP_FIXED}\tAA\tTT\nm2\tA/T\t6\t2000.0\t{HAPMAP_FIXED}\tAA\tTT\n")
    assert [m.pos_bp for m in load_genotypes(hm).markers] == [1000, 2000]
    vcf = tmp_path / "g.vcf"
    vcf.write_text(VCF.replace("\t1000\t", "\t1e3\t", 1).replace("\t2000\t", "\t2000.0\t", 1))
    assert [m.pos_bp for m in load_genotypes(vcf).markers] == [1000, 2000, 3000]
    vcf.write_text(VCF.replace("\t3000\t", "\t3000.5\t", 1))
    with pytest.raises(DataContractError, match=r"line 5: invalid position '3000\.5'"):
        load_genotypes(vcf)
    m = tmp_path / "m.csv"
    m.write_text("marker_id,chrom,pos_bp,cm\nm1,6,1000.0,0.5\nm2,6,2e3,1.25\n")
    mm = read_markers(m)
    assert mm["m1"].pos_bp == 1000 and mm["m2"].pos_bp == 2000 and mm["m2"].cm == 1.25
    m.write_text("marker_id,chrom,pos_bp,cm\nm1,6,1000,0.5\nm2,6,2000.25,\n")
    with pytest.raises(DataContractError, match=r"line 3: invalid position '2000\.25'"):
        read_markers(m)


def test_wide_csv_skips_all_empty_rows_and_names_physical_lines(tmp_path: Path):
    p = tmp_path / "g.csv"
    p.write_text("marker_id,chrom,pos_bp,S1,S2\nm1,Gm06,100,A,T\n,,,,\n , , , , \nm2,Gm06,200,A,T\n")
    assert [m.marker_id for m in read_wide_csv(p).markers] == ["m1", "m2"]
    p.write_text("marker_id,chrom,pos_bp,S1,S2\nm1,Gm06,100,A,T\n,Gm06,200,A,T\n")
    with pytest.raises(DataContractError, match="line 3: empty marker_id"):
        read_wide_csv(p)
    p.write_text("marker_id,chrom,pos_bp,S1,S2\nm1,Gm06,100,A,T\n\nm2,Gm06,,A,T\n")
    with pytest.raises(DataContractError, match=r"line 4: invalid position ''"):
        read_wide_csv(p)
```

(The last assertion proves the `reader.line_num` fix: with `enumerate(records, start=2)` the skipped blank line would make it "line 3". If the VCF fixture constant's positions or line layout differ from what the VCF assertions assume, adapt the replaced text and line number to the constant, keeping what is asserted, and report it.)

## B4. Records

**`docs/adr/0010-contract-1.1-alignment.md`**, append at the end:

```
## Amendments, 2026-09-14

**Contract 1.2.0 (isoline-browser docs/adr/0014, amended 2026-09-14).** Positions: every reader (VCF `POS`, HapMap `pos`, wide-CSV and markers.csv `pos_bp`) goes through `io/position.py`, the mirror of isoline-browser's `src/io/position.ts`: a whole-valued number written as a float or in exponent notation (`1000.0`, `1e3`, `1.9E+07`) is that integer, and a non-zero fraction, an empty cell, a negative number, nan, inf, hexadecimal or a separator is a `DataContractError` naming the line and the value. Before: wide CSV and markers.csv truncated `100.7` to 100 with `int(float())`, HapMap rejected any non-digit text, and VCF let a bare `ValueError` escape. Rows: a wide-CSV row whose every cell is empty or whitespace was already skipped and is now the contract's rule; an empty `marker_id` is an error; wide-CSV and markers.csv errors name the physical line (`csv.reader.line_num`) rather than the count of surviving rows. Deferred with the sibling: `#` comment lines and whitespace-only lines, which this repository treats as data and skips respectively. Error kind `genotypes.invalid_position` added to `tests/test_contract_cases.py`.
```

**`CHANGELOG.md`**, under `### Changed`:

```
- Contract 1.2.0 (docs/adr/0010, amended 2026-09-14): a position written as a whole-valued float or in exponent notation (`1000.0`, `1e3`, `1.9E+07`) is read as that integer in VCF, HapMap, wide CSV and markers.csv; a fractional `pos_bp` in wide CSV or markers.csv is now an error naming the line and value instead of being truncated, a non-integer VCF `POS` is a `DataContractError` instead of an uncaught `ValueError`, an empty `marker_id` in a wide CSV is an error, and wide-CSV and markers.csv errors name the physical line even after skipped rows.
```

**`docs/data-formats.md`** line 7: `version 1.1.0` → `version 1.2.0` (asserted by `tests/test_contract_cases.py`).

**Main session only:** `PLAN.md:237` "contract 1.1.0 mirrored" → "contract 1.2.0 mirrored".

## B5. Gates (PS root)

```
.venv\Scripts\python.exe -m ruff check .
.venv\Scripts\python.exe -m ruff format --check .
.venv\Scripts\python.exe -m mypy
.venv\Scripts\python.exe -m pytest -q -o addopts="" -m "not e2e"
.venv\Scripts\python.exe scripts/make_fixture.py
.venv\Scripts\python.exe scripts/check_contract.py ../isoline-browser
```

Report the pytest total (baseline 151, plus 3 new unit tests and 5 new parametrised cases). Main session: `git diff --exit-code -- tests/fixtures`.

---

# PHASE C: mirror gate (main session)

From IB: `node scripts/check-contract-mirror.mjs ../progeny-selector` exits 0. From PS: `.venv\Scripts\python.exe scripts/check_contract.py ../isoline-browser` prints `contract 1.2.0: manifest ok` and `… files identical`, exits 0. Commit IB first, then PS; no attribution trailers.

---

# Acceptance matrix

| Criterion                                                              | Proof                                                                                                                                                                                   |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| whole floats accepted, wide CSV and markers.csv                        | case `wide-position-whole-float`; IB `contracts.test.ts` "wide CSV: whole floats accepted…", "markers.csv: whole floats…"; PS `test_positions_whole_floats_accepted_fractions_rejected` |
| whole floats accepted, HapMap                                          | case `hapmap-position-whole-float`; IB "HapMap and VCF: whole floats…"; PS same test                                                                                                    |
| whole floats accepted, VCF                                             | case `vcf-position-whole-float`; IB and PS as above                                                                                                                                     |
| fraction rejected naming line and value                                | case `err-position-fraction` (`genotypes.invalid_position`); IB `contracts.test.ts` line-naming assertions for all four readers; PS line assertions                                     |
| exact grammar (empty, sign, NaN, inf, hex, separators, Unicode digits) | IB "reads whole-valued…" and "rejects everything else…"; PS `test_parse_position_grammar`                                                                                               |
| all-empty row skipped                                                  | case `wide-empty-row-skipped`; IB "wide CSV: skips all-empty rows…"; PS `test_wide_csv_skips_all_empty_rows_and_names_physical_lines`                                                   |
| empty marker_id / pos_bp is an error naming the line                   | IB and PS tests above (no case; question 8)                                                                                                                                             |
| PS line numbers physical after a skip                                  | PS `line 4: invalid position ''` assertion                                                                                                                                              |
| version 1.2.0 everywhere                                               | IB `contract-cases.test.ts` "VERSION appears verbatim…"; PS `test_version_in_docs`                                                                                                      |
| mirror                                                                 | Phase C                                                                                                                                                                                 |
| fixture untouched                                                      | `git diff --exit-code -- tests/fixtures` in both                                                                                                                                        |

---

# Flagged questions for the maintainer

1. **VCF POS.** The spec applies the uniform rule to VCF (both repos accept `1e3`). VCF 4.2 declares POS Integer and no tool emits floats; PS today crashes with a bare `ValueError` (`vcf.py:76`), IB accepts anything `Number()` reads. Alternative: digits-only for VCF in both. Provisional: uniform.
2. **`<CHROM>_<POS>` for an ID `.` record with a float POS** uses the raw text in both (`vcf.ts:60`, `vcf.py:70`), so POS `2000.0` gives id `Gm06_2000.0`. The case gives every record an ID so nothing is pinned. Should the id use the parsed integer?
3. **Decision 2 vs decision 3 overlap.** "Every cell empty or whitespace" includes a whitespace-only wide-CSV line; the spec checks the skip before the column count (matches PS today), so IB's whitespace-only wide-CSV line changes from a field-count error to skipped. Alternative: check after the count. The case uses only a full-width `,,,,,` row either way.
4. **Patch vs minor.** ADR 0013 and `contract/README.md` say patch = wording only; ADR 0014 counted the new kind `genotypes.unknown_cell` as part of a minor. This patch adds the kind `genotypes.invalid_position`, an acceptance grammar and a rejection of negative positions, each arguably a rule. Number left at 1.2.0 as instructed.
5. **Negative positions and zero.** Spec rejects negatives in both (IB genotype readers already do via `builder.ts`; IB markers.csv and all PS readers accepted them). Zero stays accepted (IB accepts it today) although the contract says "1-based".
6. **`docs/input-coding.md`** does not mention positions, so only its version string is bumped. Say if a positions row is wanted.
7. **markers.csv empty `marker_id`**: IB errors (`markers.ts:38`), PS accepts (`manifest.py`). Outside decision 2's wide-CSV scope; left divergent and untested.
8. **No case for empty `marker_id`/empty `pos_bp`** (unit tests only). Add one (`err-position-empty` would reuse `genotypes.invalid_position`; empty `marker_id` would need another kind)?
9. **PS previously accepted `1_000` and non-ASCII digits** via Python `float()` (not real-world); the grammar now rejects them. Listed for completeness.
10. **PS `PLAN.md:237`** and IB `PLAN.md` edits are main-session items; the spec does not hand them to a doer.
