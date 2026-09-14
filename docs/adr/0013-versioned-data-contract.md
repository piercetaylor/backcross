# Versioned data contract: a canonical contract/ directory, mirrored into progeny-selector and checked by hash

Status: accepted. Date: 2026-09-14. Format: MADR 4.0.0 [web] https://adr.github.io/madr/.

## Context and Problem Statement

ADR 0002 made the input files a contract shared with progeny-selector, and both repositories carried a `docs/data-formats.md` said to be shared verbatim. By M3 the two documents had drifted: progeny-selector documents `chromosome6`, IUPAC single letters in the nucleotide wide CSV, a 200-row window for A/B/H detection and synthesised coded parents, and this repository's code accepts `.` and `NN` as wide-CSV missing calls that its document does not list. Nothing detected the drift, because nothing compared the documents or ran one repository's inputs through the other's parser. How should the shared contract be held so that drift is detected and a change is deliberate?

## Decision Drivers

The two repositories use different languages and toolchains, so a check must work from files alone. A change to the contract must be visible as a change, with its size stated. Tests must compare each parser with an expectation neither parser produced. The maintainer left open, on 2026-09-12, which of the four drifted inputs belong in the contract (docs/m3-phases.md, question 2).

## Considered Options

1. A `contract/` directory, canonical in this repository and mirrored byte for byte into progeny-selector: the shared sections of the specification, a SemVer `VERSION`, generated cases with hand-authored expectations, and a `MANIFEST.sha256` each repository's tests recompute.
2. Keep two `docs/data-formats.md` and diff them in review.
3. A separate contract repository or package both depend on.

## Decision Outcome

Option 1. `contract/data-contract.md` holds the shared input sections moved verbatim out of `docs/data-formats.md` (chromosome names, the genotype file formats, samples.csv, markers.csv, class codes) under a `Contract version:` line; `docs/data-formats.md` keeps platforms, target regions, analysis parameters and outputs and points to the contract by version. `scripts/make-contract.mjs` writes each case under `contract/cases/` from literals, with the expectation written by hand rather than computed by either repository's code, so a case tests a parser against a reading of the specification. Expectations use allele symbols, sorted per call, and null for missing, because this repository stores missing as 255 and progeny-selector as -1. Error cases name a kind; each repository maps kinds to its own messages in its test. Gzip and bgzip cases are compressed with fflate in the script, so the committed bytes do not depend on the Node version.

`VERSION` is SemVer: major for a changed or removed column, vocabulary token or rule; minor for an additive optional column or token; patch for wording. Any change under `contract/` bumps it. `tests/contract-cases.test.ts` runs every case through both genotype entries, recomputes the manifest, and checks that the version string appears in `data-contract.md` and `docs/data-formats.md`; CI regenerates the cases and fails on a difference. `scripts/check-contract-mirror.mjs <sibling>` byte-compares the two copies and is a local gate, not a CI step.

Version 1.0.0 is the intersection only: inputs both repositories already handle identically and both documents state. None of the four drifted inputs is in it, and neither are inputs one document states but the other does not (a tab-delimited or quoted wide CSV, a samples.csv without a `line_name` column) or that neither states (CRLF line ends, a VCF with no GT field). Each is added, if the maintainer decides it belongs, as a minor version with its own case.

Option 2 is what failed. Option 3 adds a release process and a dependency to two small repositories for a directory of under 64 KB.

### Consequences

Good: drift in the specification or a case is a hash mismatch in both repositories' tests, and a parser that disagrees with a case fails in the repository that disagrees. Bad: the mirror is copied by hand and is only as current as the last copy; the manifest proves a copy is internally consistent, not that it matches the canonical one, which is what the mirror script is for. Neutral: until progeny-selector adds its copy and its contract tests (S1 in docs/m3-phases.md), nothing checks that it parses the cases as expected.

## More Information

docs/m3-phases.md, phase 3, resolution 5 and questions 2 and 4; docs/adr/0002-input-data-contract.md; contract/README.md.
