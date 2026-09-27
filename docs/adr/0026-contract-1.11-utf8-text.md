# Contract 1.11.0: text inputs are UTF-8

Status: accepted. Date: 2026-09-27. Format: MADR 4.0.0 [web] https://adr.github.io/madr/.

## Context and Problem Statement

The contract said that a UTF-8 byte-order mark before the first line is ignored, and never said that the text inputs are UTF-8. Neither tool rejected a byte sequence that is not UTF-8:

- backcross decoded every text input with a lenient `TextDecoder`, which replaces each ill-formed sequence with U+FFFD. That covered the one-shot genotype decode (`src/io/decompress.ts`, `bytesToText`), the streaming line splitter (`src/io/stream.ts`, `lines`), samples.csv and markers.csv in the worker and in the CLI, and a custom token profile. A Windows-1252 `é` in a `sample_id` became `U+FFFD`, which then failed to match the same id in the genotype file, or matched a different id that had been mangled the same way.
- progeny-selector decoded strictly and raised a raw `UnicodeDecodeError` with no line.

Other tools differ too. readr garbles Latin-1 without a word, pandas raises, and htslib does not validate, so bcftools passes a Latin-1 VCF. [research] VCF 4.2 says nothing about encoding. VCF 4.3 and 4.4 section 1.2 say UTF-8 [web] https://samtools.github.io/hts-specs/VCFv4.3.pdf.

## Decision Drivers

- Never silently wrong. A replaced byte changes a value with no sign that the file was damaged.
- The join key. `sample_id` joins the genotype file to samples.csv and is exported, so a guessed encoding would be wrong exactly where the value must match byte for byte.

## Considered Options

1. **Strict UTF-8**: an ill-formed sequence is an error naming the file and the physical line.
2. **Windows-1252 fallback**: decode as UTF-8 and fall back to cp1252 when that fails.
3. **U+FFFD and warn**: keep the replacement and add a warning.
4. **Leave the encoding unstated.**

## Decision Outcome

**Chosen: option 1, as contract 1.11.0, a minor bump.** Recorded verbatim from the adopted spec:

- D1: Strict UTF-8 for the five text inputs: VCF (plain, gzip or bgzip), HapMap, wide CSV, samples.csv and markers.csv. A bad byte is an error naming the file and the physical line. No code page is guessed, because `sample_id` is the join key across files and an exported value, so a guessed Windows-1252 would be wrong exactly where it must match. VCF 4.3 section 1.2 states UTF-8; 4.2 states nothing. So 1.0.0 never stated an encoding, rejecting one is a stricter reading under the contract/README.md rule, and the bump is minor. Cite [web] https://samtools.github.io/hts-specs/VCFv4.3.pdf. The ADR marks the claim that Excel's "CSV (Comma delimited)" writes ANSI as [unverified: Microsoft Q&A only], and the contract text leaves it out.
- D2: The error kind is `text.invalid_utf8`. Each existing family is named after the subject of its rule: `genotypes.*` the genotype file, `delimited.*` the three RFC 4180 files, `manifest.*` samples.csv, `dataset.*` cross-file. This rule's subject in data-contract.md is "every text input", which no existing family covers (VCF and HapMap sit outside `delimited.*`), so the family is `text`.
- D3: "Ill-formed" means outside Unicode Table 3-7:
  - `00-7F`
  - `C2-DF 80-BF`
  - `E0 A0-BF 80-BF`
  - `E1-EC 80-BF 80-BF`
  - `ED 80-9F 80-BF`
  - `EE-EF 80-BF 80-BF`
  - `F0 90-BF 80-BF 80-BF`
  - `F1-F3 80-BF 80-BF 80-BF`
  - `F4 80-8F 80-BF 80-BF`

  An overlong encoding (`C0 80`), an encoded surrogate (`ED A0 80`), a code point above U+10FFFF, a lone continuation byte, a lead byte never completed, and a sequence cut short by EOF are all errors. WHATWG `TextDecoder {fatal:true}` and CPython strict `utf-8` agree on this table, so no tool gets any leniency of its own.

- D4: Message. The stable substring is `not valid UTF-8`, and the form is `<label> line <n>: not valid UTF-8 (byte 0x<HH> at position <p>)`.
  - `<n>` counts `\n` bytes, 1-based. 0x0A never occurs inside a multi-byte sequence.
  - `<p>` is the 1-based byte offset, within that physical line, of the ill-formed sequence's lead byte. CPython's `UnicodeDecodeError.start` and the validator below both give it. A BOM's three bytes count.
  - The position and label are tool wording, not contract vocabulary (the ADR 0018 D4.3 precedent).
  - backcross labels: `genotype file` (decoding precedes format detection in both entry points, so no format name is known yet), `samples.csv`, `markers.csv`, `token profile`.
  - progeny-selector prefix: `{path}: line {n}: ...`, as its `cannot read` message names the path.
- D5: The BOM stays ignored, as in 1.1.0. Both tools decode with the BOM left in (`ignoreBOM: true`; Python `utf-8-sig`) and strip one leading U+FEFF from the first line only. A U+FEFF starting a later line is data.
- D6: Precedence. backcross judges decoding per chunk; progeny-selector judges it per TextIOWrapper buffer, and its pass 1 reads the whole VCF. A UTF-8 error may therefore outrank an earlier row fault. Contract 1.3.0 D4.4 allows this, and no case carries two faults. Within backcross the two entries differ too: the synchronous entry (`parseGenotypesBytes`) inflates the whole gzip or BGZF stream before it decodes, so a truncated or corrupt trailing member outranks a bad byte there, while the streaming entry (`parseGenotypesSource`) decodes each member as it is inflated and reports the bad byte first. Both orders are allowed, and no case carries two faults.
- D7: `MAX_CONTRACT_BYTES` goes from 128 KiB to 256 KiB, doubling as ADR 0018 D4.6 did. The reason in current terms: contract/ is 131,047 bytes and 1.11.0 adds about 6 KB. The mirror is copied with `cp -r` and verified by `scripts/check-contract-mirror.mjs` and `scripts/check_contract.py`, so the cap now guards the reviewability of a version's diff, not hand copying. At about 4 KB per case, 256 KiB leaves room for roughly twenty more versions. The live figure lives only in make-contract.mjs and contract/README.md step 2; docs/m3-phases.md is historical and is not edited.
- D8: Out of scope, stated in the ADR:
  - BrAPI: a server response, not a file under the contract. backcross's `response.json()` replaces bad bytes; progeny-selector's `brapi.py:563-565` already wraps a decode error as "not a JSON object".
  - The built-in crop and profile JSON: bundled, and hashed in MANIFEST.
  - A user-supplied token-profile JSON is in scope for the tools but can't be a case, because no case can carry a custom profile. backcross checks it strictly after this change; progeny-selector already wraps it (`except (OSError, ValueError)`, and UnicodeDecodeError is a ValueError).
  - criteria.yaml is progeny-selector-only and outside the contract. It is wrapped as `CriteriaError` in phase 6, with no case.
- D9: Performance. The happy path adds no per-byte work.
  - backcross keeps one streaming decode per chunk plus at most one decode of the carried partial line. `lastIndexOf(0x0A)` scans only the chunk's tail line, and the validator runs only after a fatal decode fails.
  - progeny-selector keeps a strict `TextIOWrapper`; the locating re-read happens only after a `UnicodeDecodeError`.
  - The doer runs `npx vitest run --project bench --silent=false --reporter=verbose` once and reports first-draw ms against 4.9 s Chromium / 6.2 s Firefox in the handback. No timing assertion is added.

The cases, written by `scripts/make-contract.mjs`, with byte cases as `Uint8Array`:

| case                                  | input                    | bytes                                    | line, position |
| ------------------------------------- | ------------------------ | ---------------------------------------- | -------------- |
| `err-vcf-latin1-byte`                 | genotypes.vcf            | `E9` in the ID `g?2`                     | 4, 12          |
| `err-vcf-gzip-latin1-byte`            | genotypes.vcf.gz         | the same, in one gzip member             | 4, 12          |
| `err-vcf-overlong-byte`               | genotypes.vcf            | `C0 80`                                  | 4, 12          |
| `err-vcf-surrogate-byte`              | genotypes.vcf            | `ED A0 80`                               | 4, 12          |
| `err-vcf-truncated-sequence-at-eof`   | genotypes.vcf            | `E2 82` ending the file, no newline      | 4, 41          |
| `err-hapmap-latin1-byte`              | genotypes.hmp.txt        | `E9` in the rs# `h?2`                    | 3, 2           |
| `err-wide-latin1-byte`                | genotypes.csv            | `E9` in the marker_id `e?2`              | 3, 2           |
| `err-samples-latin1-byte`             | samples.csv              | `E9` in the notes `s?lection`            | 4, 24          |
| `err-markers-latin1-byte`             | markers.csv              | `E9` in the marker_id `e?2`              | 3, 2           |
| `vcf-bgzip-utf8-split-across-members` | genotypes.vcf.gz (bgzip) | `z2€` cut between `E2` and `82 AC`       | reads `z2€`    |
| `wide-utf8-non-ascii-ids`             | genotypes.csv, samples   | `Lé1`, `ré1`, `Línea 1` written as UTF-8 | reads them     |

Every error case is `text.invalid_utf8`. The line, position and lead byte are tool wording (D4), not part of the cases. backcross asserts them in four test files: `tests/contract-cases.test.ts` holds the exact message of every `text.invalid_utf8` case above and checks it through both the synchronous and the streaming entry; `tests/utf8.test.ts` checks the validator, `decodeUtf8` and `lines()` at several chunk sizes; and `tests/cli-utf8.test.ts` and `tests/browser/worker-utf8.test.ts` check the CLI and worker load sites for samples.csv and markers.csv.

In backcross, `src/io/utf8.ts` holds `InvalidUtf8Error`, the validator `firstInvalidUtf8`, `locateInvalidUtf8` and the one-shot `decodeUtf8`. `src/io/stream.ts` `lines()` cuts each chunk at its last `\n` and decodes with a fatal decoder. The worker, the CLI and the Upload screen decode samples.csv, markers.csv and a custom token profile with `decodeUtf8`; the CLI labels a custom profile `token profile file <path>` rather than D4's bare `token profile`, because its message already names the path. `tests/contract-cases.test.ts` maps the kind to `/not valid UTF-8/` and now runs every error case through the streaming entry as well as the synchronous one.

Option 2 was rejected because a guessed code page is silently wrong where it matters most: a cp1252 reading of a byte that was meant as something else yields a plausible `sample_id` that no longer matches. Option 3 keeps the value wrong, and a warning is easy to miss in a batch run. Option 4 leaves the two tools disagreeing: one replaces, the other raises without a line.

### Consequences

- Good: a file that is not UTF-8 fails in both tools with the file and the physical line named, and a non-ASCII id that is valid UTF-8 now has a case that pins it as read and matched byte for byte.
- Good: a character split across a bgzip member or a read boundary is pinned as read whole.
- Neutral: one error kind is added, and no well-formed input changes meaning. The BOM rule of 1.1.0 is unchanged.
- Bad: a Windows-1252 export of a `notes` column now fails and names the line. The fix is to save the file as "CSV UTF-8".

## More Information

Contract 1.11.0: `contract/data-contract.md` ("Genotype file"), `contract/VERSION`, `contract/README.md` (the Version paragraph, and steps 1 to 3 of "Adding a case"). Mirrored byte for byte into `progeny-selector` under the version and mirror rules of ADR 0013, where docs/adr/0031 records the mirror. ADR 0013 and 0018 justify the size cap by hand copying; D7 restates the reason, and those records are not edited. Supersedes nothing.
