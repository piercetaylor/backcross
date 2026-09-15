# Handoff: M3 phases 4 and 5

Written 2026-09-14 at the end of the session that shipped contracts 1.1.0 and 1.2.0. Open the new session **inside `isoline-browser/`** (CLAUDE.md), as Opus for the planning step. Read CLAUDE.md, then this file, then only the line ranges named below.

## Where things stand

- M3 phases 1–3 are committed and pushed: browser-mode tests, streaming bgzip VCF, contract 1.0.0.
- **Shared data contract is at 1.2.0 in both repositories.**
  - Contract 1.1.0: isoline-browser `a1d2b59`, progeny-selector `afae3ed`. Token vocabulary: one cell parser per repo (`src/io/calls.ts`, `io/calls.py`), IUPAC codes read as heterozygotes, stray cells rejected, whole-file A/B/H detection. Spec `docs/contract-1.1-phases.md`; decisions in `docs/adr/0014-contract-1.1-alignment.md`.
  - Contract 1.2.0: isoline-browser `b6ceeb9`, progeny-selector `1653bca`; gates pass in both (426 node and 22 browser tests here, 161 there) and the mirror check reports 108 identical files from both sides. Positions go through `src/io/position.ts` / `io/position.py`: whole floats accepted in HapMap and CSVs, VCF POS digits only, the ID-less VCF id comes from the parsed POS, negatives rejected, 0 accepted; all-empty wide-CSV rows skipped; empty `marker_id` is an error. Spec `docs/contract-1.2.0-positions.md`; recorded as amendments to ADR 0014 here and ADR 0010 there. Low divergences deferred in PLAN.md.
  - Contract 1.3.0, after M3: named token profiles and a crop selector. Research: `docs/research/cross-crop-genotype-conventions.md`.
  - Deferred and described in PLAN.md: `#` comment lines and whitespace-only lines differ between the repos.
  - Phases 4 and 5 do not change the contract. Mirror check after any contract change: `node scripts/check-contract-mirror.mjs ../progeny-selector`.
- M3 phase 4 (BrAPI loader) and phase 5 (accessibility review) are specified in `docs/m3-phases.md`: invariants at lines 7–18, resolution 6 (BrAPI) at line 57, phase 4 at lines 223–271, phase 5 at lines 273–294, gates at line 296, Q3 at line 304. Neither phase has started.

## Decisions already taken for phases 4 and 5 (maintainer, 2026-09-14)

1. **Q3 scope is in phase 4, in full.**
   - `sample_id` = `callSetName` when present and unique in the variant set, else `callSetDbId`. Colliding call sets fall back to the DbId with a warning; `loaded` already has a `warnings: string[]` channel (`src/workers/protocol.ts:139`).
   - The fetched call-set table (`callSetName`, `callSetDbId`, `sampleDbId`) is offered as a CSV download.
   - `callSetDbId` and `sampleDbId` are written into **every export**. That adds columns to documented output formats: the planner must specify the exact column names and positions for each export in `docs/data-formats.md`, and the empty values for file-loaded datasets. The worker owns the matrix, so exporters that name markers run inside the worker (CLAUDE.md, "Layout").
   - The phase 4 file table in m3-phases.md mentions none of the download or export work; the planner adds it.
2. **Live recording is approved.** `scripts/brapi-record.mjs` may call `https://test-server.brapi.org/brapi/v2` from this machine, writing to `data/brapi-recorded/` (gitignored), so the implementer can check fixture shapes against real responses. Never in CI or tests.
3. **Phase 5 dev dependencies are approved:** `axe-core`, `lighthouse`, `chrome-launcher`, plus the `npm run a11y:lighthouse` step in the CI `browser` job.
4. **ADR numbering:** contract 1.1 took `0014`, so the BrAPI ADR is `docs/adr/0015-brapi-allele-matrix-loader.md` and not the 0014 that m3-phases.md names. Correct that in the spec.
5. Q1, Q4 and Q5 in m3-phases.md are settled. Q2 is superseded by contract 1.1.0. Don't re-ask them.

## Facts found this session that the planner needs

- **Genotype cells.** Contract 1.1.0 moved nucleotide-cell parsing into `src/io/calls.ts`, used by HapMap and wide CSV only. The BrAPI loader parses GT allele-index tokens with its own `parseBrapiCall` and must not route them through `calls.ts`. It still yields diploid calls only (the contract says so), and a haploid token reads as homozygous, as in VCF.
- **Comparator.** Phase 4's acceptance compares against the VCF-loaded fixture through `tests/support/normalise.ts`, whose `ErrorKind` now includes `genotypes.unknown_cell` and `genotypes.invalid_position`.
- **Phase 5, Lighthouse path.** Probe before the implementer builds `scripts/lighthouse-a11y.mjs`: does Playwright's `chromium.executablePath()` honour `PLAYWRIGHT_BROWSERS_PATH` on this machine? The default `%LOCALAPPDATA%\ms-playwright` cache cannot launch browsers here (CLAUDE.md). The m3 spec says this was not re-verified.
- **Phase 5, exceptions list.** `KNOWN_A11Y_EXCEPTIONS` must stay empty. If axe flags React Aria's own markup, that is a question for the maintainer (a dated ADR 0009 amendment), not something the implementer resolves.
- **Phase 5 findings carried over** from the contract 1.1 review:
  - The Upload screen's new "input coding reference" link (`src/ui/screens/UploadScreen.tsx`) opens a new tab with `rel="noreferrer"` but gives no accessible new-tab indication (advisory; WCAG G201).
  - No test asserts the link exists.
- **Other review leftovers, not phase 4 or 5 scope; record them or leave them:**
  - `detectWideCsvMode` (`src/io/wide-csv.ts:36`) assumes the header is physical line 1 and the three fixed columns come first, so a leading blank or `#` line, or a coded file with those columns elsewhere, can be misdetected. That input is outside the contract, and the contract text now says so.
  - No test loads a HapMap or `markers.csv` with CRLF line ends or a BOM.
- **Contract 1.3.0** (named token profiles plus a crop selector) is after M3 and not part of these phases. Research: `docs/research/cross-crop-genotype-conventions.md`.

## How the work is done

Rules from the maintainer's memory files; they apply unchanged.

- **Planning.** A planner on model `fable` (read-only) writes an exhaustive spec for phase 4, and later for phase 5, from the ranges above plus the files each phase touches. The spec flags every conflict between the plan, the ADRs and the code, and lists questions for the maintainer. The main session saves the spec to disk and asks those questions **before** dispatch. If Fable hits its session limit, re-run the step on Opus.
- **Implementation.** Implementer on model `opus` for phase 4 (IO boundary, worker protocol, data contract); Sonnet is fine for phase 5's tests and scripts unless a UI change touches shared contracts.
  - Give the implementer line ranges, and the prompt must say **"do not run git"**.
  - Cap its report at about 30 lines.
- **Review.** A reviewer on model `fable` checks the diff when it touches `src/io/`, `src/workers/` or `contract/`. Findings go back to the same implementer by SendMessage, not to a new agent.
- **Order.** Phases 4 and 5 run **sequentially**: phase 5 reviews the BrAPI form that phase 4 adds.
- **Gates.** The main session re-runs every gate itself: `npm run lint`, `typecheck`, `test`, `test:browser`, `build`, then `npm run fixture && npm run contract && git diff --exit-code -- tests/fixtures contract`.
  - For browser tests, set `PLAYWRIGHT_BROWSERS_PATH=%USERPROFILE%\.cache\ms-playwright` if the shell doesn't have it.
  - Per milestone: `npm run test:bench` and `npm run a11y:lighthouse`, with figures recorded in an M3 verification block in PLAN.md (see the "Gates and CI after M3" section of m3-phases.md).
- **Commits.**
  - Stage explicit paths only.
  - Use Conventional Commits, and add a CHANGELOG entry under `[Unreleased]`.
  - **No AI attribution of any kind.**
  - Push after each committed phase without asking.
  - Write the commit message to a file and use `git commit -F <file>` from the Bash tool. In PowerShell, `git commit -F - @'…'@` treats the message as a path and fails.
- **Context budget.** Advisor at most twice per phase. Past about 100k tokens of context, update this handoff and start a new chat.

## First actions for the new session

1. Run `node scripts/check-contract-mirror.mjs ../progeny-selector` and `git status --short` in both repos; both should be clean. Positions and cells are now fixed input rules: the BrAPI loader takes positions from `start + 1` or markers.csv (already integers) and GT allele indices, so it touches neither `position.ts` nor `calls.ts`, but markers.csv positions it applies go through `parseMarkerMap`, which uses the 1.2.0 grammar.
2. Send the phase 4 planner (model `fable`) to `docs/m3-phases.md` lines 1–58 and 223–271, and to this file's decisions 1, 2 and 4. Files it must read: `src/workers/protocol.ts`, `src/workers/analysis.worker.ts`, `src/io/builder.ts`, `src/io/vcf.ts`, `src/io/loaders.ts`, `src/ui/screens/UploadScreen.tsx`, `src/App.tsx`, `src/export/**`, `docs/data-formats.md` (outputs), `scripts/make-fixture.mjs`, `tests/support/normalise.ts`.
3. Save its spec as `docs/m3-phase4-brapi.md`, bring its questions to the maintainer, then dispatch.
