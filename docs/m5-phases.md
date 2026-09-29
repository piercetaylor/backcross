<!-- Saved from the M5 planner's handback of 2026-09-29. Run `npx prettier --write docs/m5-phases.md` after saving: docs/*.md are prettier-checked by `npm run lint`, and the tables below are not pre-aligned. -->

# M5: first public release, implementation phases

This document decomposes milestone M5, the first public release (PLAN.md, "Milestones"), into eleven phases in this repository, one commit each, plus a maintainer release procedure at the end. Written 2026-09-29 by the planner from CLAUDE.md, PLAN.md, docs/data-formats.md, docs/adr/0028 and 0029, package.json, src/cli.ts, src/export/provenance.ts, .github/workflows/ci.yml, vite.config.ts, README.md, CHANGELOG.md, CONTRIBUTING.md, and the house format of docs/m4-phases.md and docs/m2.5-phases.md. State at the audit of 2026-09-29: M0 to M4 complete, all gates green (925 node tests, 118 browser tests), tree clean, contract 1.12.0 mirrored in `../progeny-selector`, `npm audit` clean, no tag, no release. Every decision below was delegated by the maintainer to Fable research and settled on 2026-09-29 under one criterion: best for academic and open-source plant breeders, meaning reproducible with readr, pandas and spreadsheets, never silently wrong, citable. Section 1 records them; docs/adr/0030 (phase 1) is their record.

The doer of a phase makes no design decision. Where this file names a constant, a file, a signature, a column, a string or a message, that is the value. Where a fact could not be verified this session it says so instead of asserting it.

## 1. Settled decisions, parameters and maintainer actions

| id  | decision (settled 2026-09-29 unless noted)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | phase |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Q1  | First release is **v0.1.0** (`RELEASE_VERSION = 0.1.0`, already in package.json). App and contract versions stay independent; the release notes say "Implements input data contract 1.12.0".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 3, 9  |
| Q2  | CLI distribution: a single-file ESM bundle `dist-cli/backcross-cli.mjs` built by **esbuild** (pinned devDependency; Vite 8 is Rolldown-based and `node_modules/esbuild` is absent, verified 2026-09-29), attached to every GitHub Release. `"private": true` stays, no `bin`, no npm publish. `node src/cli.ts` stays the developer path.                                                                                                                                                                                                                                                                                                                                                       | 5     |
| Q3  | The RPP coverage cap is renamed to the stem **`max_marker_coverage`** everywhere (columns, CLI flags, env vars, `RppParams`, labels), because `max_gap` collides with segments.csv `gap_criterion` and ADR 0008's donor-run gap. Nothing is released, so no aliases.                                                                                                                                                                                                                                                                                                                                                                                                                            | 6     |
| Q4  | Provenance: three constant-per-row columns **`tool`, `tool_version`, `tool_commit`** after `crop` in the six analysis CSVs (summary, qc, segments, targets, pairwise, discordant), not in `brapi-callsets.csv`. `tool = backcross`; `tool_version` = package.json version; `tool_commit` = `g` + 7 hex of HEAD, `-dirty` appended when tracked files differ from HEAD (`git status --porcelain --untracked-files=no` prints anything; untracked files ignored), first 7 hex of `GITHUB_SHA` with no dirty check when set, `NA` when git is unavailable. No comment line, no sidecar. HTML report: a "Software" summary row and `<meta name="generator">`. The contract version is not a column. | 5, 7  |
| Q5  | **CITATION.cff only**, no `.zenodo.json` (Zenodo ignores the CFF when `.zenodo.json` exists). Content in 12.1. README gains "Cite" and "Sibling tool".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 8     |
| Q6  | **Joint release** with progeny-selector on the same day; each release note names contract 1.12.0 and links the sibling's release.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 9, 16 |
| Q7  | cM chromosome-end rule (Fable research via progeny-selector, confirmed against R/qtl `calc.genoprob` `off.end` and OneMap `draw_map.R`): under cM both terminal informative markers get c/2 on their outer side whatever p is; bp is unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 2     |
| Q8  | ADR 0028's "M5" (assembly-length table) is relabelled "a later milestone" by a dated amendment line, not a rewrite (main session, 2026-09-29).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 1     |

Parameters that stay open until the release commit (section 16): `RELEASE_DATE` (the tag day, ISO `YYYY-MM-DD`) and `SIBLING_RELEASE_URL` (the progeny-selector release page for the same day).

Maintainer actions that are settings, not commits (like `ENABLE_PAGES`): enable GitHub private vulnerability reporting (SECURITY.md points at it) before phase 4 merges; enable the Zenodo–GitHub integration for `piercetaylor/backcross` before tagging, so the first tag mints a concept DOI (the DOI goes into CITATION.cff in the release after 0.1.0, never before it exists); decide whether blank issues stay enabled (phase 4 sets `blank_issues_enabled: false`).

## 2. Maintainer questions: inconsistencies found, none resolved silently

1. PLAN.md:79-113 (repository layout: three export files, one CLI command, no `contract/`) and PLAN.md:117 (Testing and CI: M0-era, no browser, bench, Lighthouse or r-reader jobs) are stale. Phase 1 rewrites both from `git ls-files`. Confirm the layout block stays in PLAN.md rather than moving to docs/README.md.
2. PLAN.md:121 says dist/ can be "opened from a USB stick with `npm run preview`", which needs node_modules; and Chromium refuses module scripts from `file://` regardless of workers, so the built site never runs from a file address there (Firefox not asserted here; phase 9 records a one-time check). Phase 9 rewrites the sentence to the static-server instruction.
3. ci.yml:48-52 promises to tighten the 120 s hang guard "to 3-5x the first recorded CI baseline", but no CI baseline was ever recorded because `npm run test:bench` prints nothing under vitest 5's default reporter (PLAN.md:399). CLAUDE.md:33 likewise tells the maintainer to record "the bench's printed" figures. Phase 11 fixes the script first, then tightens in two steps.
4. ci.yml:70 (comment) and CHANGELOG.md:17 say the r-reader job reads "five" CLI tables; the job reads six (ci.yml:97-103). Phases 1 and 3.
5. docs/m3-phases.md:307 (Q4) says a CI drift check fetches the sibling's `MANIFEST.sha256`; scripts/check-contract-mirror.mjs:7-8 says "a local gate, not a CI step"; ci.yml has no such job. Phase 11 adds a contract-mirror CI job (recommended, 15.3) and finalises the wording; phase 1 marks Q4 as pending phase 11.
6. docs/m3-phases.md:305 (Q2) reads "OPEN, deliberately" although contract 1.1.0 (docs/adr/0014, 2026-09-14) shipped all four items. Phase 1 marks it settled in place, as Q1 and Q3 were.
7. docs/data-formats.md:47 says "Every table below carries ... two trailing columns", but the call-set table (data-formats.md:69-71) carries neither, and Q4 excludes it from the provenance columns too. Phase 7 words the exception explicitly.
8. docs/adr/0028 lines 42 and 58 use "M5" for the assembly-length table; M5 is the release milestone (Q8). Phase 1 appends the amendment line.
9. src/cli.ts:2 says Node >= 22.18; package.json, README.md:15 and CONTRIBUTING.md:14 say 22.19. Phase 1 makes it 22.19.
10. package.json:5 `description` says soybean only; thirteen crops are supported. Phase 1.
11. CONTRIBUTING.md:31 says changing an output column is a `feat!` with a CHANGELOG entry under Changed, but the `crop` precedent (CHANGELOG.md:37) recorded a trailing column under Added with plain `feat`. This spec follows the precedent: phase 6's rename goes under Changed without `!` (nothing is released, so nothing breaks), phase 7's additions under Added, and phase 2's value change under Changed without `!`. Confirm.
12. CHANGELOG.md has three `### Added` headings (lines 10, 35, 59), a `### Documentation` heading (line 24) that is not a Keep a Changelog type, a `[0.1.0] - Unreleased` heading (line 95) that duplicates `[Unreleased]`, and no link references. Phase 3.
13. README.md:34 says "cite this repository with the commit or version used", but no export records either until phase 7; README.md:5 says "version 0.1.0 is untagged", which the release commit changes. Phases 7, 8 and 16.
14. vite.config.ts:108-110 justifies `connectTimeout: 120_000` with "Twelve pages start at once, six per browser", but `fileParallelism: false` (line 180) runs one file at a time since M3; the 2026-09-29 connect timeout therefore happened under serial files and the stated cause is stale. Phase 11 rewrites the comment.
15. src/export/provenance.ts keeps `crop` optional, but every runtime caller (ExportScreen x6, worker, CLI) passes it; only tests/export-ids.test.ts:42 omits it. Phase 7 leaves it optional to bound the change. Confirm.
16. docs/input-coding.md:3 says "under contract 1.9.0"; the contract is 1.12.0. Phase 1.
17. PLAN.md:353 and :401 list "`readr` on the browser-only CSVs" as unverified, but the pairwise, discordant and QC tables are CLI tables since 2026-09-27 and the r-reader job reads them; `brapi-callsets.csv` is still browser-only and unread. Phase 1 closes with that qualification.
18. PLAN.md:409 describes the RPP chromosome-end difference that ADR 0028 resolved on 2026-09-27. Phase 1 appends the closure.
19. Phase 2 changes `rpp_cm` values, so `tests/fixtures/synthetic/expected.json` is regenerated. If any file under `contract/cases/` encodes an RPP value (`grep -rl rpp contract/cases` must be empty; the planner believes the cases carry calls and chromosome order only), the change is a contract matter and the doer stops. The joint release (Q6) needs progeny-selector to ship the same cM rule the same day; which sibling ADR or commit carries it is not recorded here. Confirm.
20. docs/m4-phases.md invariants 8 and 9 both require `git diff --exit-code` in the gates and "the doer never runs git". This spec reads that as: read-only git (`git diff`, `git ls-files`, `git rev-parse`, `git status`) is allowed; the doer never commits, tags or pushes.

## 3. Invariants that every phase respects

1. `src/core/` stays pure; `src/ui/` computes nothing; every colour and dimension lives in `src/ui/tokens.css` (`npm run lint`); the worker owns the genotype matrix, so an exporter that names markers runs inside the worker (docs/adr/0001).
2. No change under `contract/`; `contract/VERSION` stays 1.12.0; `node scripts/check-contract-mirror.mjs ../progeny-selector` passes at every commit. M5 changes documented outputs (phases 2, 6, 7) only in docs/data-formats.md, never in the contract.
3. Gates before every commit: `npm run lint`, `npm run typecheck`, `npm test`, `CI=true npm run test:browser`, `npm run build`, then `npm run fixture && npm run contract && git diff --exit-code -- tests/fixtures contract`. From phase 5 also `npm run build:cli`. Per milestone (section 16): `npm run test:bench`, `npm run a11y:lighthouse`.
4. New `.md` files and `.github/**/*.yml` are prettier-checked (only CHANGELOG.md, `contract/`, `tests/fixtures/` and package-lock.json are ignored); every phase runs `npm run format` on the files it creates before the gates.
5. Never commit real genotype data; every example in a template or guide is synthetic. No AI attribution anywhere. Conventional Commits; user-visible phases add a CHANGELOG entry under `[Unreleased]` (phases 2, 4, 5, 6, 7, 8, 9, 10; phases 1, 3 and 11 add none).
6. The doer never commits, tags or pushes.
7. Every URL is pinned to the GitHub account `piercetaylor` (the maintainer's email local part `piercetaylor2020` is not the account; docs/m3-phases.md Q4). No email address is published anywhere.
8. `docs/m5-phases.md` is this file; a doer does not edit it.

## 4. Order, models, reviewers, documented outputs

| phase | scope                                                             | model  | adversarial reviewer                  | touches a documented output (main session asks first) | depends on |
| ----- | ----------------------------------------------------------------- | ------ | ------------------------------------- | ----------------------------------------------------- | ---------- |
| 1     | Docs truth sweep; ADR 0030; ADR 0028 amendment; M5 in PLAN.md     | sonnet | no                                    | no                                                    | nothing    |
| 2     | cM chromosome-end rule in `weightedSums` and the fixture          | opus   | yes (genetics)                        | yes: `rpp_cm` values                                  | 1 (ADR)    |
| 3     | CHANGELOG to Keep a Changelog form; section script and test       | sonnet | no                                    | no                                                    | 2          |
| 4     | Community and hygiene files                                       | sonnet | no                                    | no                                                    | nothing    |
| 5     | esbuild CLI bundle; `src/build-info.ts`; `scripts/git-commit.mjs` | opus   | yes (byte-identical outputs)          | no (new artefact, same tables)                        | 1          |
| 6     | Coverage-cap rename `max_marker_coverage`                         | opus   | yes (core types, fixture)             | yes: summary CSV columns, CLI flags, env vars, report | 3          |
| 7     | Provenance stamp columns and report row                           | opus   | yes (every exporter, worker boundary) | yes: six CSVs, report                                 | 5, 6       |
| 8     | CITATION.cff, README Cite and Sibling tool, cffconvert CI step    | sonnet | no                                    | no                                                    | 7          |
| 9     | Release workflow, site zip, smoke script                          | opus   | yes (release artefacts)               | no                                                    | 3, 5, 7, 8 |
| 10    | User guide and docs index                                         | sonnet | no                                    | no                                                    | 6, 7       |
| 11    | CI hardening: bench, mirror job, connect timeout                  | sonnet | no                                    | no                                                    | 1          |

Phase 2 comes before 3 so the CHANGELOG entry it adds is consolidated with the rest. Phase 6 precedes 7 because both edit `summary-csv.ts`, `read_exports.R`, `data-formats.md` and the same test lines, and the provenance test constants are written once against the new names.

## 5. Phase 1: docs truth sweep

Commit: `docs: bring PLAN, CLAUDE, README and the ADRs to the state of the code; record ADR 0030`.

### 5.1 Edits

| file                                   | change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PLAN.md` :79-113                      | Regenerate the tree from `git ls-files` (top two levels; one comment per entry). It must name: `CITATION.cff`, `CODE_OF_CONDUCT.md`, `SECURITY.md` (marked "phase 4/8"; phases 4 and 8 remove the marks), `.github/workflows/ci.yml` (jobs `check`, `browser`, `r-reader`, `deploy`), `.github/workflows/release.yml` (marked "phase 9"), `contract/` (`data-contract.md`, `VERSION`, `README.md`, `MANIFEST.sha256`, `cases/`, `profiles/`, `crops/`), `docs/` (`README.md` and `user-guide.md` marked "phase 10", `data-formats.md`, `input-coding.md`, `design-brief.md`, `design-survey.md`, `reference-repos.md`, `legacy-readme.md`, the phase specs and handoffs, `research/`, `adr/`), `scripts/` (every file present plus `build-cli.mjs`, `git-commit.mjs`, `changelog-section.mjs`, `smoke-dist.mjs` marked by phase), `src/` (`main.tsx`, `App.tsx`, `config.ts`, `cli.ts`, `build-info.ts` marked "phase 5", `contract-version.ts` marked "phase 7", `core/`, `io/`, `workers/`, `export/` listing all ten files, `ui/`), `tests/` (`browser/`, `bench/`, `support/`, `fixtures/synthetic/`, `fixtures/brapi/`, the node tests as `*.test.ts`), `.gitattributes`, `eslint/`, `public/`. Line 104 becomes `cli.ts   node src/cli.ts <summarize\|segments\|targets\|compare\|discordant\|qc> ...`. |
| `PLAN.md` :117                         | Replace the last sentence ("Later milestones add ...") with: "Since M3 the `browser` job runs the browser-mode tests, the 50K x 200 bench and Lighthouse in Chromium and Firefox (docs/adr/0011); the `r-reader` job generates the six CLI tables from the fixture and reads them back with readr under explicit column types (`scripts/read_exports.R`); `npm run contract` regenerates the shared contract cases and CI fails on any diff (docs/adr/0013)."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `PLAN.md` Milestones, after :135       | New paragraph: "M5 first public release (in progress, docs/m5-phases.md): the documentation brought to the truth of the code; the cM chromosome-end rule (docs/adr/0028, amended); CHANGELOG in Keep a Changelog form; community and hygiene files; a single-file CLI bundle built by esbuild and attached to every release; the RPP coverage cap renamed `max_marker_coverage`; a provenance stamp (`tool`, `tool_version`, `tool_commit`) in every analysis CSV and the report; CITATION.cff; a tag-triggered release workflow producing a site zip that serves from any static folder; a user guide and docs index; and CI hardening. Every decision is in docs/adr/0030. Acceptance: `v0.1.0` tagged by the maintainer after review, the release workflow green, the zip's site loading the demo from a nested static path, the CLI bundle reproducing `node src/cli.ts` byte for byte on the fixture, `cffconvert --validate` passing, readr reading all six tables with the three provenance columns, and the M5 verification block recording the bench, Lighthouse and CI figures."                                                                                                                                                                                                                    |
| `PLAN.md` :353 and :401                | After "`readr` on the browser-only CSVs" insert " (closed 2026-09-27 for the pairwise, discordant and QC tables, which the CLI now writes and the r-reader job reads; `brapi-callsets.csv` remains browser-only and unread by readr)".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `PLAN.md` :409                         | Append to the paragraph: " (Resolved 2026-09-27, docs/adr/0028: both tools use the symmetric end rule and a 2 Mb bp default, so the remaining difference is the length source; the cM end rule was changed again in M5 phase 2, see the amendment.)"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `PLAN.md` after the 2026-09-26 block   | New block `### 2026-09-27 work, recorded 2026-09-29` (5.2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `CLAUDE.md` :15                        | Replace "The CLI gained `compare` and `discordant`, and CI reads every CLI table back with readr." with "The CLI gained `compare`, `discordant` and `qc`; `qc.csv` is a documented output (docs/adr/0029); the per-line summary CSV records the resolved RPP coverage caps, and docs/adr/0028 fixes the chromosome-end rule and the 2 Mb bp default; the `r-reader` CI job reads all six CLI tables back with readr." Append: "M5, the first public release, is specified in docs/m5-phases.md and its decisions are docs/adr/0030."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `CLAUDE.md` :40                        | "`0029` is the most recent" becomes "`0030` is the most recent".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `README.md` :28                        | Replace the sentence with: "The `segments`, `targets` and `qc` commands produce separate CSV files; `compare` and `discordant` write the pairwise comparison and discordant-marker CSVs for one pair of sample ids given as `--a` and `--b` (`--mode informative`, the default, or `all`). Every command takes `--crop ID` (one of the thirteen chromosome schemes, default `soybean`) and `--profile ID\|FILE` (a token profile for HapMap and wide CSV, or a JSON file of the same shape); run `node src/cli.ts` for the full option list. `npm run build` creates a static site in `dist/`."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `docs/m3-phases.md` :305               | Replace "OPEN, deliberately, by the maintainer's decision on 2026-09-12: record it and do not resolve it yet." with "SETTLED 2026-09-14 by the maintainer as contract 1.1.0 (docs/adr/0014), all four items taken as the union (recorded here 2026-09-29; the rest of this item is the 2026-09-12 state, kept for the record)."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `docs/m3-phases.md` :307               | Append: " (Correction 2026-09-29: no CI step was added; the check stayed local, scripts/check-contract-mirror.mjs. docs/m5-phases.md phase 11 decides.)"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `docs/input-coding.md` :3              | "under contract 1.9.0" becomes "under contract 1.12.0".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `.github/workflows/ci.yml` :70         | "Generates the five CLI CSV tables" becomes "Generates the six CLI CSV tables".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `package.json` :5                      | `"description": "Browser-based characterization and QC of near-isogenic lines against their recurrent and donor parents from SNP genotype files, with chromosome schemes for thirteen crops and the same analysis core as a Node CLI."`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/cli.ts` :2                        | `Node >= 22.19`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `docs/adr/0028-...md`                  | Append `## Amendment, 2026-09-29` with the single line: "M5 is the first public release milestone (PLAN.md, docs/m5-phases.md). The assembly-length table that this record defers 'to M5' (Decision Outcome, Revisit when) is deferred to a later milestone; the two mentions read accordingly." Phases 2 and 6 append further paragraphs to this same amendment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `docs/adr/0030-first-release.md` (new) | 5.3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

### 5.2 The "2026-09-27 work" verification block

Shape of the M3 and M4 blocks. First paragraph names what shipped between M4's block and the audit: contract 1.10.0 (0025), 1.11.0 (0026), 1.12.0 (0027); `qc.csv` and the `qc` subcommand (0029); the coverage caps in the summary CSV and the end rule (0028); CLI `compare` and `discordant`; the r-reader job over six tables; the palette and HapMap-order no-ops. Then a fenced block in which the doer pastes the real output of, run on 2026-09-29 or later: `npm test`, `CI=true npm run test:browser`, `npm run build`, `npm run fixture && npm run contract && git diff --exit-code -- tests/fixtures contract` (the `contract 1.12.0: N cases, M files, B bytes` line), `node scripts/check-contract-mirror.mjs ../progeny-selector`, `npm audit`. No number in this block is typed from memory; the audit's 925 and 118 are a cross-check only, and a mismatch is reported, not adjusted. "Not verified" repeats the M4 list (token profiles against real exports; the twelve non-soybean crops on a programme's file; paper output; screen readers; Safari) plus "`readr` on `brapi-callsets.csv`".

### 5.3 ADR 0030

`docs/adr/0030-first-release.md`, MADR 4.0.0 (format line copied from 0029), `Status: accepted. Date: 2026-09-29.`, title "First release: version, CLI distribution, cap naming, provenance, citation". Context: the audit state of the intro. Decision drivers: the criterion of the intro. Considered options and Decision outcome for Q1 to Q6 of section 1 in prose, each with its reason: Q1 (0.1.0 signals pre-1.0 column stability and matches every existing mention); Q2 (esbuild because Vite 8 no longer ships it, a bundle because breeders should not need `npm ci`, no npm publish because the zip and the Release asset are the distribution and a `bin` would point at a gitignored file); Q3 (the collision with `gap_criterion`, ADR 0008; rename before anything is released); Q4 (three columns so readr and pandas users select by name; `g`-prefixed commit as `git describe` writes it; `-dirty` because a locally built export must not claim a commit it does not match; `NA` as the tables' missing token; not in `brapi-callsets.csv` because it precedes a load; no comment line because readr and pandas would need a `comment` argument); Q5 (CFF is read by GitHub's "Cite this repository" and by Zenodo; `.zenodo.json` would override it); Q6 (both tools implement 1.12.0; a same-day release keeps the shared contract statement true in both notes). Consequences: good (citable, reproducible, self-describing exports), bad (three more columns in every table; a `-dirty` value in a hand-built export; the CLI bundle must be rebuilt per release), neutral (the contract is untouched). "Revisit when": the first Zenodo DOI exists (add `identifiers` to CITATION.cff); progeny-selector's pending research on the cM first-marker end rule concludes differently from Q7 (a note only, not a decision here). More information: the decisions are the maintainer-delegated Fable research of 2026-09-29; the sibling's record is its own ADR (number unknown here; the doer writes "see progeny-selector's CHANGELOG for its release").

### 5.4 Acceptance

`npm run lint` (prettier over the edited markdown), `npm run typecheck`, `npm test`. Extend `tests/contract-cases.test.ts` line 250's test: read `docs/input-coding.md` and assert `toContain(\`under contract ${VERSION}\`)`, so a future bump fails this test instead of an audit; and assert that `docs/adr/0030-first-release.md`exists (a`readFileSync` that throws), so CLAUDE.md:40's number is backed.

## 6. Phase 2: cM chromosome-end rule

Commit: `feat(core): cM RPP credits both terminal markers half the coverage on their outer side` (no `!`: nothing is released; the CHANGELOG entry is under Changed).

### 6.1 Rule (Q7)

With c the maximum marker coverage and cap = c/2, each called informative marker is credited per side: interior sides min(d/2, cap) as today. Outer sides:

- bp, unchanged: first marker min(p, cap); last marker min(max(L − p, 0), cap) when an assembly length L is known, else cap.
- cM, new: first marker cap; last marker cap. Reason (ADR 0028 amendment text below): a linkage map's 0 cM is its first marker, not the telomere, so the distance to the chromosome end is unknown at both ends; a physical assembly's origin is a chromosome end (VCF 4.3 places telomeres at POS 0 and N+1).

Example: informative markers at 0.0 and 5.0 cM, cap 10 cM: weights 7.5 and 7.5 (today 2.5 and 7.5).

### 6.2 Code

`src/core/rpp.ts`:

```ts
/**
 * Distance-weighted mean of `scores` at sorted `positions`.
 * `cap` is half the maximum coverage. `originIsEnd` says whether coordinate 0
 * is a chromosome end: true for bp (the first marker reaches back min(p, cap)),
 * false for cM (a map's 0 cM is its first marker, so the first marker gets cap).
 * The last marker reaches min(max(chromLength - p, 0), cap) when a length is
 * given, else cap. Returns [weightedSum, totalWeight].
 */
export function weightedSums(
  positions: number[],
  scores: number[],
  cap: number,
  originIsEnd: boolean,
  chromLength?: number,
): [number, number];
```

Line 53 becomes `const left = i === 0 ? (originIsEnd ? Math.min(p, cap) : cap) : Math.min((p - (positions[i - 1] as number)) / 2, cap);`. Line 151: `weightedSums(posBp, scores, capBp, true, chromLengthsBp?.get(chrom))`. Line 156: `weightedSums(posCm, scores, capCm, false)`. Header comment lines 16-19 restated with the rule of 6.1. `grep -rn weightedSums tests src` for any other caller; each passes the flag explicitly (no default parameter, so a caller cannot forget it).

`scripts/make-fixture.mjs` `weighted(positions, scores, cap)` (line 139) becomes `weighted(positions, scores, cap, originIsEnd)` with the same change on line 145; its two call sites (the doer finds them: one with `MAX_GAP_BP / 2`, one with `MAX_GAP_CM / 2`) pass `true` and `false`. Then `npm run fixture` regenerates `tests/fixtures/synthetic/expected.json`; the doer records in the commit body which lines' `rpp_cm` changed and by how much, and confirms `rpp_bp` and `rpp_count` are byte-identical in the diff. `npm run contract` must produce no diff (section 2, item 19; if it does, stop).

### 6.3 Tests

`tests/rpp.test.ts` (extend if it exists, else create; `grep -l weightedSums tests/*.ts`): `describe('weightedSums chromosome ends')`: (a) `weightedSums([0, 5], [1, 0], 5, false)` returns `[7.5, 15]`; (b) `weightedSums([0, 5], [1, 0], 5, true)` returns `[2.5, 10]` (the bp rule unchanged); (c) `weightedSums([3, 5], [1, 1], 5, true)` gives the first marker a left side of 3; (d) `weightedSums([3, 5], [1, 1], 5, false)` gives it 5; (e) with `chromLength` 6 under `true`, the last marker's right side is 1; (f) a single marker at 2 weighs 10 under `false` and 7 under `true`. (g) End to end: a two-marker dataset built with `tests/helpers.ts`' builders (or a literal `Dataset`) with cM 0.0 and 5.0, classes RP_HOM and DONOR_HOM, cM cap 10: `rppCm` is 0.5 (was 0.25); `rppBp` unchanged from the same dataset's bp positions. The fixture tests (`tests/smoke.test.ts` RPP to 12 decimals) pass against the regenerated `expected.json`, which is the two-implementation check.

### 6.4 Docs

- `docs/adr/0028`: append to the 2026-09-29 amendment: "**cM end rule (M5 phase 2, docs/m5-phases.md 6.1).** The two end bullets of 'The end rule (Q-A)' are replaced by: the first marker's outer side: min(p, c/2) when positions are in bp, since the assembly origin is a chromosome end (VCF 4.3 places telomeres at POS 0 and N+1); c/2 when positions are in cM, since a linkage map's 0 cM is its first marker, not the telomere, and the distance to the telomere is unknown at both ends; the last marker's outer side: min(max(L − p, 0), c/2) when positions are in bp and an assembly length L is known, else c/2. Decided by Fable research via progeny-selector, confirmed against R/qtl `calc.genoprob` `off.end` and OneMap `draw_map.R`; output semantics only, no contract bump."
- `docs/adr/0006`: one line at the end: "Amendment, 2026-09-29: the cM end rule is restated in docs/adr/0028's amendment of the same date (both terminal markers get c/2 under cM)."
- `PLAN.md` :59: after "(default 2 Mb; chromosome ends use the distance to the end when a length is known, else c/2)" insert "; under cM both ends get c/2, since 0 cM is the first marker, not the telomere (docs/adr/0028, amended 2026-09-29)".
- `docs/data-formats.md` parameter table row `maxGapCm`: append "; at both ends of a chromosome a terminal marker is credited half the cap on its outer side (docs/adr/0028)". (Phase 6 renames the row.)
- CHANGELOG `[Unreleased]` `### Changed`: "`rpp_cm` credits both terminal informative markers half the maximum marker coverage on their outer side, since a linkage map's 0 cM is its first marker rather than the telomere; `rpp_cm` therefore changes for a line whose first informative marker on a chromosome lies within c/2 of 0 cM. `rpp_bp` is unchanged (docs/adr/0028, amended 2026-09-29)."

## 7. Phase 3: CHANGELOG in Keep a Changelog form

Commit: `docs(changelog): one heading per type, link references, section script`.

### 7.1 Structure after this phase

```
# Changelog
<the two intro lines unchanged>

## [Unreleased]

### Added
<every entry from the three existing "### Added" blocks, in their current order: the block at line 10 first, then line 35, then line 59>

### Changed
<the existing "### Changed" block, then the "### Documentation" entry reworded as: "The README is a current overview with a reproducible synthetic example and links to the detailed records; the previous README is preserved in `docs/legacy-readme.md`.", then phase 2's entry (already under Changed)>

### Fixed
<the existing "### Fixed" block>

[Unreleased]: https://github.com/piercetaylor/backcross/commits/main
```

Removed: the `## [0.1.0] - Unreleased` section and its two lines. Reworded: line 17's "generates all five CLI CSV tables" becomes "generates every CLI CSV table (six since `qc`)". Type order is Added, Changed, Deprecated, Removed, Fixed, Security; absent types are omitted. Entry text is otherwise unchanged (phase 6 later edits the `max_gap` entry). The `[Unreleased]` link is the commits page until the first tag exists; `--release` (7.2) rewrites it to the compare form.

### 7.2 `scripts/changelog-section.mjs` (new, ESM, no dependencies) and `scripts/changelog-section.d.mts`

```js
// Reads and rewrites CHANGELOG.md's version sections (docs/adr/0030).
// Usage: node scripts/changelog-section.mjs <version>
//            prints that section's body (exit 1 if absent)
//        node scripts/changelog-section.mjs --release <version> <date> [<previous>]
//            renames [Unreleased] in place
export const REPO_URL = 'https://github.com/piercetaylor/backcross';
/** Body between `## [version] - YYYY-MM-DD` and the next `## [` or the link block; throws when the heading is absent or its date is not YYYY-MM-DD. */
export function sectionBody(text, version): string;
/** `## [Unreleased]` becomes `## [Unreleased]\n\n## [version] - date`; the link block becomes `[Unreleased]: REPO_URL/compare/v<version>...HEAD` and `[<version>]: REPO_URL/releases/tag/v<version>` (first release) or `REPO_URL/compare/v<previous>...v<version>` when `previous` is given; existing version links are kept. Throws when there is no `## [Unreleased]`, when `## [version]` already exists, or when Unreleased has no entries. */
export function releaseUnreleased(text, version, date, previous?): string;
```

### 7.3 `tests/changelog.test.ts` (new, node)

On the real `CHANGELOG.md`: exactly one `## [Unreleased]`; every `## [` heading other than Unreleased matches `/^## \[\d+\.\d+\.\d+\] - \d{4}-\d{2}-\d{2}$/`; within each section every `### ` heading is one of the six types, appears once, and in the canonical order; every `## [x]` has a `[x]: https://github.com/piercetaylor/backcross/...` line at the end; no `### Documentation`; no `Unreleased` inside a version heading. On a literal: `sectionBody` returns the body and throws on a missing heading; `releaseUnreleased` produces the exact expected text for a first release and for a second release with `previous`; it throws on an empty Unreleased.

### 7.4 Acceptance

`npm test` (the new test), `npm run lint`. CHANGELOG.md stays in `.prettierignore`.

## 8. Phase 4: community and hygiene files

Commit: `chore: code of conduct, security policy, issue and pull-request templates, Dependabot`.

### 8.1 Files

| path                                         | content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CODE_OF_CONDUCT.md`                         | Contributor Covenant 2.1 verbatim (prerequisite: the doer fetches https://www.contributor-covenant.org/version/2/1/code_of_conduct/code_of_conduct.md or the maintainer supplies it). The one edit: `[INSERT CONTACT METHOD]` becomes "by opening a GitHub issue at https://github.com/piercetaylor/backcross/issues or by contacting the maintainer through the GitHub profile https://github.com/piercetaylor". No email address anywhere in the file. The Covenant's own attribution paragraph stays (it is the licence's attribution, not AI attribution).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `SECURITY.md`                                | `# Security policy`; `## Scope`: "Backcross is a client-only web application and a Node CLI. There is no server, no account and no telemetry; genotype files chosen from disk are parsed and analysed inside the browser tab. The one network path is the optional BrAPI loader, which sends requests to a server the user names, with a bearer token the user supplies, kept only in the page's memory. Vulnerabilities in scope: anything that makes genotype data leave the tab other than through the user's own download or BrAPI request; script injection through the HTML report or an export (the report escapes every value); a dependency advisory that reaches the built site or the CLI bundle."; `## Supported versions`: "The latest release on the Releases page and the `main` branch."; `## Reporting`: "Use GitHub's private vulnerability reporting: Security tab, 'Report a vulnerability', at https://github.com/piercetaylor/backcross/security/advisories/new. Do not open a public issue for a vulnerability. Never attach real genotype data; a synthetic file made with `npm run fixture` is enough. Expect an acknowledgement within 14 days."; `## Dependencies`: "`npm audit` is part of the maintainer's release checklist and Dependabot opens weekly update pull requests (`.github/dependabot.yml`)." |
| `.github/ISSUE_TEMPLATE/bug_report.yml`      | `name: Bug report`, `description: Something is wrong in the site or the CLI`, `labels: [bug]`; body: markdown "Never attach real genotype data. Build a synthetic reproducer with `npm run fixture`, the demo (`?demo=synthetic`), or a hand-written file of a few markers."; dropdown `where` (Site at piercetaylor.github.io, Local build or `npm run dev`, CLI `node src/cli.ts`, CLI bundle `backcross-cli.mjs`), required; input `browser` "Browser and version (or Node version for the CLI)", required; input `os`, required; dropdown `format` (VCF, VCF bgzip, HapMap, wide CSV nucleotide, wide CSV A/B/H, BrAPI), required; input `crop_profile` "Crop and token profile (the Upload screen's selects, or `--crop`/`--profile`)"; textarea `reproducer` "Synthetic reproducer: files or the steps on the demo", required; textareas `expected` and `actual`, required; textarea `console` "Console errors or CLI stderr"; checkboxes `no_real_data` with one required option "This report contains no real genotype data."                                                                                                                                                                                                                                                                                                   |
| `.github/ISSUE_TEMPLATE/feature_request.yml` | `name: Feature request`, `labels: [enhancement]`; textarea `problem` "What you cannot do today, in breeding terms", required; textarea `proposal`; dropdown `scope` (Site, CLI, Both, Input contract shared with progeny-selector); markdown note: "A change to an input format or column is shared with progeny-selector (contract/data-contract.md) and is decided for both tools."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `.github/ISSUE_TEMPLATE/config.yml`          | `blank_issues_enabled: false`; `contact_links`: `name: User guide`, `url: https://github.com/piercetaylor/backcross/blob/main/docs/user-guide.md`, `about: How to prepare inputs, run the site or CLI and read the outputs`; `name: Security report`, `url: https://github.com/piercetaylor/backcross/security/advisories/new`, `about: Report a vulnerability privately`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `.github/pull_request_template.md`           | "## What and why" (one paragraph); "## Gates" checklist: `npm run lint`, `npm run typecheck`, `npm test`, `CI=true npm run test:browser`, `npm run build`, `npm run build:cli`, `npm run fixture && npm run contract && git diff --exit-code -- tests/fixtures contract`; "## Checklist": CHANGELOG entry under `[Unreleased]` for a user-visible change; no real genotype data; if `contract/` changed, `contract/VERSION` bumped and `node scripts/check-contract-mirror.mjs ../progeny-selector` passes with the sibling commit named; if a documented output changed, docs/data-formats.md and scripts/read_exports.R updated; a MADR record for a non-obvious decision; no AI attribution line in any commit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `.github/dependabot.yml`                     | `version: 2`; `updates`: (1) `package-ecosystem: npm`, `directory: /`, `schedule: { interval: weekly }`, `groups: { minor-and-patch: { update-types: [minor, patch] } }`, comment: "Exact pins (vitest, @vitest/browser-playwright, react-aria-components, axe-core, lighthouse, chrome-launcher, esbuild) are deliberate; a major bump is reviewed against the gates, never merged unread."; (2) `package-ecosystem: github-actions`, `directory: /`, `schedule: { interval: monthly }`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `README.md`                                  | After the licence sentence: "Contributions follow [CONTRIBUTING.md](CONTRIBUTING.md) and the [code of conduct](CODE_OF_CONDUCT.md); vulnerabilities go through [SECURITY.md](SECURITY.md)."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `CHANGELOG.md` `### Added`                   | "A code of conduct (Contributor Covenant 2.1), a security policy, issue and pull-request templates and Dependabot configuration."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

### 8.2 Acceptance

`npm run lint` (prettier over the new markdown and YAML). `tests/community-files.test.ts` (new, node): each of the seven files exists; `CODE_OF_CONDUCT.md` contains "Contributor Covenant" and does not match `/@/` (no email); `SECURITY.md` contains `security/advisories/new`; each issue form has `name:` and `body:` lines (a line-based check; no YAML dependency is added) and `bug_report.yml` contains "no real genotype data"; `dependabot.yml` contains `package-ecosystem: npm` and `github-actions`. GitHub validates the forms on the first push; the maintainer opens the New issue page after merge and records the result in the M5 block.

## 9. Phase 5: the CLI bundle, the build stamp and the commit resolver

Commit: `build(cli): single-file esbuild bundle with a version and commit stamp`.

### 9.1 Files

| path                                                                                     | change                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                                                                           | devDependency `esbuild` pinned exactly (`npm install --save-dev --save-exact esbuild`; record the number in the commit body); script `"build:cli": "node scripts/build-cli.mjs"`. `private` and the absence of `bin` unchanged (Q2).                |
| `scripts/git-commit.mjs` (new) + `scripts/git-commit.d.mts`                              | 9.2                                                                                                                                                                                                                                                 |
| `scripts/build-cli.mjs` (new) + `scripts/build-cli.d.mts`                                | 9.3                                                                                                                                                                                                                                                 |
| `src/build-info.ts` (new)                                                                | 9.4                                                                                                                                                                                                                                                 |
| `vite.config.ts`                                                                         | `define` (9.4)                                                                                                                                                                                                                                      |
| `src/cli.ts`                                                                             | `toolStamp()` (9.4), used by phase 7                                                                                                                                                                                                                |
| `scripts/check-bundle.mjs`, `tests/check-bundle.test.ts`                                 | New problem: any `.js` under `dist/assets` containing `__APP_VERSION__` or `__GIT_COMMIT__` ("define did not apply to <file>"); test case with a fake `analysis.worker-d.js` holding the identifier expects one problem naming it.                  |
| `.gitignore`, `.prettierignore`, `eslint.config.js` :9                                   | add `dist-cli/`.                                                                                                                                                                                                                                    |
| `.github/workflows/ci.yml` `check` job                                                   | after `npm run build`: `- run: npm run build:cli`.                                                                                                                                                                                                  |
| `tests/git-commit.test.ts`, `tests/build-info.test.ts`, `tests/cli-bundle.test.ts` (new) | 9.5                                                                                                                                                                                                                                                 |
| `README.md` "Run locally"                                                                | After the CLI example: "Every GitHub Release also carries `backcross-cli-<version>.mjs`, a single file that needs only Node 22.19: `node backcross-cli-<version>.mjs summarize ...` with the same options."                                         |
| `CHANGELOG.md` `### Added`                                                               | "A single-file CLI bundle, `dist-cli/backcross-cli.mjs`, built by `npm run build:cli` with esbuild and attached to every GitHub Release; it needs only Node 22.19 and takes the same subcommands and options as `node src/cli.ts` (docs/adr/0030)." |

### 9.2 `scripts/git-commit.mjs`

```js
// Resolves the short commit for the provenance stamp (docs/adr/0030, Q4).
// Returns 'g' + the first 7 hex of HEAD, with '-dirty' appended when tracked
// files differ from HEAD (`git status --porcelain --untracked-files=no` prints
// anything; untracked files are ignored); when GITHUB_SHA holds 40 hex (CI),
// 'g' + its first 7 with no dirty check; 'NA' when git is unavailable, the
// directory is not a checkout, or the output is not 7 hex.
// Shared by scripts/build-cli.mjs, vite.config.ts (`define`) and the
// unbundled CLI's fallback (src/cli.ts), so the three agree.
import { execFileSync } from 'node:child_process';
/**
 * @param {{ env?: NodeJS.ProcessEnv, exec?: typeof execFileSync, cwd?: string }} [opts]
 * @returns {string}
 */
export function resolveCommit({
  env = process.env,
  exec = execFileSync,
  cwd = process.cwd(),
} = {}) {
  /* ... */
}
```

`exec` is called as `exec('git', ['rev-parse', '--short=7', 'HEAD'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })`, then `exec('git', ['status', '--porcelain', '--untracked-files=no'], same)`. Any throw returns `'NA'`. The `.d.mts` declares the signature.

### 9.3 `scripts/build-cli.mjs`

```js
// Bundles src/cli.ts into one ESM file for release (docs/adr/0030, Q2).
// Usage: node scripts/build-cli.mjs            -> dist-cli/backcross-cli.mjs
import { build } from 'esbuild';
import { resolveCommit } from './git-commit.mjs';
/** @param {{ rootDir: string, outfile: string, version: string, commit: string }} o */
export async function buildCli(o) {
  await build({
    entryPoints: [join(o.rootDir, 'src', 'cli.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    banner: { js: '#!/usr/bin/env node' },
    define: {
      __APP_VERSION__: JSON.stringify(o.version),
      __GIT_COMMIT__: JSON.stringify(o.commit),
    },
    outfile: o.outfile,
    sourcemap: false,
    minify: false,
    legalComments: 'inline',
    logLevel: 'warning',
  });
}
```

Run as a script (`import.meta.url` equals `process.argv[1]` resolved, the check-bundle pattern): `rootDir` = the repository root, `outfile` = `dist-cli/backcross-cli.mjs`, `version` = `JSON.parse(readFileSync(package.json)).version`, `commit` = `resolveCommit({ cwd: rootDir })`; prints `cli bundle: <bytes> bytes, backcross <version> <commit>` and exits 0. The nine crop JSON imports and fflate are bundled; `node:` builtins stay external.

### 9.4 `src/build-info.ts`, `vite.config.ts` and `src/cli.ts`

```ts
/**
 * Build stamp (docs/adr/0030, Q4).
 *
 * Responsibility: expose the version and commit a bundler defined, without
 * importing anything, so it runs in the browser, the worker and Node alike.
 * vite.config.ts `define` stamps the app and the worker; scripts/build-cli.mjs
 * stamps the CLI bundle. Unbundled code (`node src/cli.ts`, vitest without a
 * define) sees null; src/cli.ts then resolves the stamp itself from
 * package.json and scripts/git-commit.mjs. Never reads git here.
 *
 * Interface: TOOL_NAME, BuildInfo, buildInfo() -> BuildInfo | null,
 * toolProvenance() -> { tool, toolVersion, toolCommit } ('NA' when unknown).
 */
declare const __APP_VERSION__: string | undefined;
declare const __GIT_COMMIT__: string | undefined;
export const TOOL_NAME = 'backcross';
export interface BuildInfo {
  version: string;
  commit: string;
}
export function buildInfo(): BuildInfo | null {
  if (typeof __APP_VERSION__ !== 'string' || typeof __GIT_COMMIT__ !== 'string') return null;
  return { version: __APP_VERSION__, commit: __GIT_COMMIT__ };
}
export interface ToolProvenance {
  tool: string;
  toolVersion: string;
  toolCommit: string;
}
export function toolProvenance(): ToolProvenance {
  const b = buildInfo();
  return { tool: TOOL_NAME, toolVersion: b?.version ?? 'NA', toolCommit: b?.commit ?? 'NA' };
}
```

`typeof` on an undeclared identifier never throws, and `declare const ...: string | undefined` keeps TypeScript from flagging the comparison. `toolProvenance` is consumed in phase 7; this phase creates it.

`vite.config.ts`: `import { fileURLToPath } from 'node:url'; import { resolveCommit } from './scripts/git-commit.mjs';` and, in the returned config, `define: { __APP_VERSION__: JSON.stringify(PKG_VERSION), __GIT_COMMIT__: JSON.stringify(resolveCommit({ cwd: ROOT })) }`, where `PKG_VERSION` is read from `./package.json` with the `readFileSync` already imported and `ROOT = fileURLToPath(new URL('.', import.meta.url))`. `definePlugin` is in Vite's shared plugin list for worker builds too (node_modules/vite/dist/node/chunks/node.js:30537, checked 2026-09-29); the check-bundle problem of 9.1 proves it on every build.

`src/cli.ts`: `import { fileURLToPath } from 'node:url'; import { resolveCommit } from '../scripts/git-commit.mjs'; import { buildInfo, TOOL_NAME } from './build-info.ts';` and

```ts
/** The bundle's stamp, or, unbundled, package.json's version and git's HEAD. */
function toolStamp(): { tool: string; toolVersion: string; toolCommit: string } {
  const b = buildInfo();
  if (b !== null) return { tool: TOOL_NAME, toolVersion: b.version, toolCommit: b.commit };
  const root = new URL('..', import.meta.url);
  const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as {
    version: string;
  };
  return {
    tool: TOOL_NAME,
    toolVersion: pkg.version,
    toolCommit: resolveCommit({ cwd: fileURLToPath(root) }),
  };
}
```

The relative import of a `.mjs` from a `.ts` file resolves under Node's type stripping and under esbuild; TypeScript sees `scripts/git-commit.d.mts` (the `tests/check-bundle.test.ts` precedent). ESLint's `scripts/**` block already disables type-checked rules for the `.mjs`. In the bundle the fallback branch is dead code because the defines fire.

### 9.5 Tests

- `tests/git-commit.test.ts`: four cases with a fake `exec`: clean (`rev-parse` returns `abc1234\n`, `status` returns `''`) gives `gabc1234`; dirty (`status` returns ` M src/x.ts\n`) gives `gabc1234-dirty`; no git (`exec` throws) gives `NA`; `env: { GITHUB_SHA: '0123456789abcdef0123456789abcdef01234567' }` gives `g0123456` and `exec` is never called. Plus: a non-hex `rev-parse` output gives `NA`; a 39-character `GITHUB_SHA` falls through to git.
- `tests/build-info.test.ts`: `buildInfo()` is `null` or `{ version: <package.json version>, commit: /^(g[0-9a-f]{7}(-dirty)?|NA)$/ }` (vitest may or may not apply Vite's `define` to node tests; both branches are correct); `toolProvenance().tool === 'backcross'`.
- `tests/cli-bundle.test.ts`: `beforeAll` (timeout 60_000) builds with `buildCli({ rootDir, outfile: join(mkdtempSync(join(tmpdir(), 'backcross-cli-')), 'backcross-cli.mjs'), version: <package.json version>, commit: resolveCommit({ cwd: rootDir }) })`, the same stamp the unbundled CLI resolves, so the comparison stays byte-identical after phase 7 adds the stamp to every table. For each of the six subcommands with the fixture arguments of ci.yml lines 97-102 (without `--out`), run `spawnSync(process.execPath, [bundle, ...args], { encoding: 'utf8' })` and `spawnSync(process.execPath, [join(root, 'src', 'cli.ts'), ...args], ...)`, and assert equal `status` (0), byte-equal `stdout`, and equal `stderr` after dropping lines matching `/ExperimentalWarning|--experimental-/` from both. Also: the bundle's first line is `#!/usr/bin/env node`; the bundle text contains neither `__APP_VERSION__` nor `__GIT_COMMIT__`; the bundle with no arguments exits 2 and prints the usage. `afterAll` removes the temp dir.

### 9.6 Acceptance

`npm run build:cli` prints the size line and `dist-cli/backcross-cli.mjs` exists (predicted under 1 MB; the doer records the bytes). `npm test` runs the three new tests. `npm run build` passes the extended check-bundle. Gates.

## 10. Phase 6: coverage-cap rename

Commit: `feat(core): rename the RPP coverage cap to max_marker_coverage in columns, flags, env and types` (no `!`; section 2, item 11). Touches documented outputs (Q3, settled).

### 10.1 Names

| old                                                                                  | new                                                                                                            |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `RppParams.maxGapBp`, `maxGapCm` (src/core/types.ts)                                 | `maxMarkerCoverageBp`, `maxMarkerCoverageCm` (values unchanged)                                                |
| summary CSV columns `max_gap_bp`, `max_gap_cm`                                       | `max_marker_coverage_bp`, `max_marker_coverage_cm` (same positions)                                            |
| CLI flags `--max-gap-bp`, `--max-gap-cm`                                             | `--max-marker-coverage-bp`, `--max-marker-coverage-cm`                                                         |
| env `VITE_DEFAULT_MAX_GAP_BP`, `VITE_DEFAULT_MAX_GAP_CM`                             | `VITE_DEFAULT_MAX_MARKER_COVERAGE_BP`, `VITE_DEFAULT_MAX_MARKER_COVERAGE_CM`                                   |
| report rows `RPP coverage cap (bp)`, `RPP coverage cap (cM)`                         | `RPP maximum marker coverage (bp)`, `RPP maximum marker coverage (cM)`                                         |
| Upload screen legend `RPP coverage cap`                                              | `RPP maximum marker coverage` (the two field labels already read "Maximum marker coverage (bp)/(cM)" and stay) |
| `scripts/make-fixture.mjs` `MAX_GAP_BP`, `MAX_GAP_CM`, `expected.params.maxGapBp/Cm` | `MAX_MARKER_COVERAGE_BP/_CM`, `expected.params.maxMarkerCoverageBp/Cm` (then `npm run fixture`)                |
| `scripts/read_exports.R` `max_gap_bp`, `max_gap_cm`                                  | the new column names, in `cols()` and the numeric check                                                        |

Files with occurrences on 2026-09-29 (`grep -rn "maxGap\|max_gap\|max-gap\|MAX_GAP" --exclude-dir=node_modules .`): .env.example, CHANGELOG.md, PLAN.md (:409, the `--max-gap-bp 4000000` mention), docs/data-formats.md (parameter table rows and the summary CSV paragraph), docs/adr/0006 and 0028 (dated records: untouched except the amendment), src/config.ts, src/cli.ts (usage, `parseArgs` options, `ALLOWED.summarize`, `numberOr` calls, header comment), src/core/rpp.ts, src/core/types.ts (:124 comment, :160 comment "Distinct from RppParams.maxGapBp"), src/export/summary-csv.ts, src/export/report.ts, src/ui/screens/UploadScreen.tsx, scripts/make-fixture.mjs, scripts/read_exports.R, tests/{smoke,report,helpers,export-ids,cli-qc,cli-compare,brapi}.test.ts and tests/fixtures/synthetic/expected.json (regenerated). `tests/cli-qc.test.ts:58` and `tests/cli-compare.test.ts` use `--max-gap-bp` as the foreign-option example: they become `--max-marker-coverage-bp` and the expected stderr `qc: option(s) not accepted here: --max-marker-coverage-bp`.

### 10.2 Docs

- `docs/data-formats.md`: parameter rows `maxMarkerCoverageBp` / `maxMarkerCoverageCm` with the new env names; the summary CSV paragraph names the new columns and flags.
- `docs/adr/0028` amendment (append): "**Names.** The columns are `max_marker_coverage_bp` and `max_marker_coverage_cm` (M5 phase 6, docs/adr/0030): the `max_gap` stem collided with `gap_criterion` of segments.csv and the donor-run gap of ADR 0008. The parameters `maxMarkerCoverageBp/Cm`, the flags `--max-marker-coverage-bp/-cm` and the env vars `VITE_DEFAULT_MAX_MARKER_COVERAGE_BP/_CM` follow. Nothing was released under the old names."
- CHANGELOG: the entry at (old) line 13 becomes "The per-line summary CSV gains `max_marker_coverage_bp` and `max_marker_coverage_cm`, the resolved RPP maximum marker coverage the weighted estimators were computed with, before `token_profile` (docs/adr/0028). ADR 0006 gains an amendment correcting its Flapjack comparability claims." New `### Changed` entry: "The RPP coverage cap is named maximum marker coverage everywhere: `maxMarkerCoverageBp`/`Cm`, `--max-marker-coverage-bp`/`-cm`, `VITE_DEFAULT_MAX_MARKER_COVERAGE_BP`/`_CM`, and the report rows; `max_gap` collided with the donor-run gap of docs/adr/0008 (docs/adr/0030)."
- `PLAN.md` :409: `--max-gap-bp 4000000` becomes `--max-marker-coverage-bp 4000000`.
- `.env.example` lines 9-11 with the new names.

### 10.3 Acceptance

`grep -rn "maxGap\|max_gap\|max-gap\|MAX_GAP" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=dist-cli .` returns only docs/adr/0006, docs/adr/0028 (pre-amendment text), docs/m4-phases.md and this file. `tests/smoke.test.ts:112` and `tests/export-ids.test.ts:65` assert the new header tail. `npm run fixture` regenerates `expected.json` with the renamed keys and unchanged values (the doer confirms in the diff that only the two key names changed). Gates; the r-reader job green with the renamed columns.

## 11. Phase 7: provenance stamp

Commit: `feat(export): tool, tool_version and tool_commit in every analysis CSV and the report`. Touches documented outputs (Q4, settled); the main session confirms with the maintainer before the phase starts (CLAUDE.md rule); no sibling file is affected.

### 11.1 `src/export/provenance.ts`

```ts
export interface ExportProvenance {
  /** 'default', a built-in profile id, or `custom:<id>`. */
  tokenProfile: string;
  crop?: string;
  /** Always TOOL_NAME, 'backcross' (src/build-info.ts). */
  tool: string;
  /** package.json version stamped at build time; 'NA' when unknown. */
  toolVersion: string;
  /** 'g' + 7 hex of HEAD at build time, '-dirty' when tracked files differed; 'NA' when unknown. */
  toolCommit: string;
}
export function provenanceHeader(p: ExportProvenance): string[];
// ['token_profile', ...(p.crop === undefined ? [] : ['crop']), 'tool', 'tool_version', 'tool_commit']
export function provenanceCells(p: ExportProvenance): string[]; // csvField on each, same order
```

Header comment: "(docs/data-formats.md, 'Outputs'): the token profile (1.4.0), the crop (1.5.0), and from M5 the tool stamp (docs/adr/0030): `tool`, `tool_version`, `tool_commit`, constant on every row so a table names the software that wrote it." The six exporters (`lineSummaryCsv`, `qcCsv`, `segmentsCsv`, `targetsCsv`, `pairwiseCsv`, `discordantMarkersCsv`) need no change: they spread `provenanceHeader`/`provenanceCells`. `callSetsCsv` is untouched.

### 11.2 Callers (eight)

| site                                                           | change                                                                                                                                                                                                                                                |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ui/screens/ExportScreen.tsx` :217, :238, :259, :280, :300 | each `{ tokenProfile: loaded.tokenProfile, crop: loaded.crop }` becomes `{ tokenProfile: loaded.tokenProfile, crop: loaded.crop, ...toolProvenance() }` (`import { toolProvenance } from '../../build-info.ts'`; a constant read, not a computation). |
| `src/ui/screens/ExportScreen.tsx` :177 `buildReportHtml`       | `ReportInput.provenance` gets the same object.                                                                                                                                                                                                        |
| `src/workers/analysis.worker.ts` :426                          | `{ tokenProfile: ds.tokenProfile, crop: ds.crop, ...toolProvenance() }`.                                                                                                                                                                              |
| `src/cli.ts` :241                                              | `const provenance = { tokenProfile: dataset.tokenProfile, crop: dataset.crop, ...toolStamp() };`                                                                                                                                                      |

### 11.3 Report (`src/export/report.ts`)

- New `src/contract-version.ts`: `/** The input data contract this build implements; tests/contract-cases.test.ts asserts it equals contract/VERSION. */ export const CONTRACT_VERSION = '1.12.0';`. `tests/contract-cases.test.ts` line 250's test gains `expect(CONTRACT_VERSION).toBe(VERSION)`.
- Dataset summary: after the `Crop` row, `['Software', escapeHtml(\`${p.tool} ${p.toolVersion} (${p.toolCommit}), input data contract ${CONTRACT_VERSION}\`)]`with`p = input.provenance`.
- `<head>`: `<meta name="generator" content="${escapeHtml(\`${p.tool} ${p.toolVersion} ${p.toolCommit}\`)}">`after`<meta charset>`.
- Footer unchanged. Header comment: a sentence naming the Software row and the generator meta.

### 11.4 Docs and R

- `docs/data-formats.md` :47 becomes: "Every analysis table below (all but the call-set table, which is written before a load) carries `call_set_db_id` and `sample_db_id` ... and five trailing columns: `token_profile` (...), `crop` (...), `tool` (`backcross`), `tool_version` (the package.json version the export was made with) and `tool_commit` (`g` followed by the seven-hex short commit the build came from, with `-dirty` appended when the working tree had uncommitted changes to tracked files; `NA` when the build could not read git, as from a source download). The three tool columns are constant on every row so a reader that selects by name can join tables and a file names its own release (docs/adr/0030)." Each table's column list gains `, tool, tool_version, tool_commit` after `crop`. HTML report paragraph: "The dataset summary ... a Crop row ... and a Software row (`backcross <version> (<commit>), input data contract <version>`); the page's `<meta name="generator">` carries the same stamp."
- `scripts/read_exports.R`: each of the six `cols()` gains `tool = col_character(), tool_version = col_character(), tool_commit = col_character()`; new helper `stop_on_missing_columns(df, path, cols)` (stops when any named column is absent, since a `cols()` entry for an absent column only warns) called in each reader with `c("token_profile", "crop", "tool", "tool_version", "tool_commit")`, and `if (any(df$tool != "backcross")) stop(sprintf("%s: tool column is not backcross", path))` inside it. Header comment names the five provenance columns.
- CHANGELOG `### Added`: "Every analysis CSV (summary, QC, segments, targets, pairwise, discordant markers) gains three trailing columns after `crop`: `tool` (`backcross`), `tool_version` and `tool_commit` (`g` + seven hex, `-dirty` when built from an uncommitted tree, `NA` when git was unavailable), and the HTML report a Software row and a `generator` meta tag, so a result names the release that produced it (docs/adr/0030). `brapi-callsets.csv` is unchanged."

### 11.5 Tests

- `tests/helpers.ts`: `export const TEST_TOOL = { tool: 'backcross', toolVersion: '0.0.0-test', toolCommit: 'g0000000' } as const;` and `export const TEST_PROVENANCE: ExportProvenance = { tokenProfile: 'default', crop: 'soybean', ...TEST_TOOL };`.
- Every `{ tokenProfile: ... }` literal in tests (24 across 14 files: brapi, cli-compare, cli-qc, compare, export-ids, fixture-compare, fixture-segments, fixture-targets, qc-csv, qc, report, segments, smoke, targets) gains `...TEST_TOOL` or uses `TEST_PROVENANCE`.
- Header literals updated to end `,token_profile,crop,tool,tool_version,tool_commit` (or `,token_profile,tool,tool_version,tool_commit` where crop is omitted): tests/export-ids.test.ts :65-81, :128, :140; fixture-compare :103, :111; fixture-segments :97; fixture-targets :105; qc-csv :16, :48, :90; smoke :112. Row-tail assertions: `export-ids` :130 `,default,maize` becomes `,default,maize,backcross,0.0.0-test,g0000000`; :142 likewise.
- `tests/export-ids.test.ts`: new `describe('tool columns (docs/adr/0030)')`: every CSV header ends with `tool,tool_version,tool_commit`; every row ends with `backcross,0.0.0-test,g0000000`; a `toolCommit` containing a comma is quoted (`csvField`).
- CLI tests (`cli-compare`, `cli-qc`, and `cli-targets` if it asserts a header): the header is `provenanceHeader({ tokenProfile: 'default', crop: 'soybean', ...TEST_TOOL })`; the last three cells of a data row are `backcross`, the package.json version, and a match of `/^(g[0-9a-f]{7}(-dirty)?|NA)$/`.
- `tests/report.test.ts`: `toContain('<dt>Software</dt><dd>backcross 0.0.0-test (g0000000), input data contract ' + CONTRACT_VERSION + '</dd>')` and `toContain('<meta name="generator" content="backcross 0.0.0-test g0000000">')`; the report still contains no `http://`.
- `tests/cli-bundle.test.ts` (phase 5) passes unchanged: both CLIs stamp from the same tree.
- Worker path: `grep -rl discordant tests/browser` for a test that downloads the discordant CSV; if one exists, assert the downloaded text's header ends `tool,tool_version,tool_commit` and the row's `tool_version` equals the package.json version (Vite's `define` applies in dev). If none exists, add the assertion to whichever browser test already exercises `onRequestDiscordantMarkersCsv`; if none does, record "not asserted in the browser" in the commit body and the M5 block.

### 11.6 Acceptance

Gates; the r-reader job green with the new columns (CI); `npm run build` proves `define` reached the worker (phase 5's check).

## 12. Phase 8: CITATION.cff, README Cite and Sibling tool

Commit: `docs: CITATION.cff, citation and sibling-tool sections, cffconvert check in CI`.

### 12.1 `CITATION.cff` (exact)

```yaml
cff-version: 1.2.0
message: 'If you use this software, please cite it as below.'
type: software
title: 'Backcross: near-isogenic line characterisation from SNP genotypes'
authors:
  - family-names: Taylor
    given-names: Pierce
license: MIT
repository-code: 'https://github.com/piercetaylor/backcross'
url: 'https://piercetaylor.github.io/backcross/'
version: 0.1.0
date-released: '2026-09-29'
keywords:
  - plant breeding
  - near-isogenic lines
  - marker-assisted backcrossing
  - recurrent parent genome
  - soybean
  - SNP genotyping
references:
  - type: software
    title: progeny-selector
    authors:
      - family-names: Taylor
        given-names: Pierce
    repository-code: 'https://github.com/piercetaylor/progeny-selector'
    url: 'https://piercetaylor.github.io/progeny-selector/'
    notes: 'Sibling tool; both read input data contract 1.12.0'
```

`date-released` is provisional (the phase commit date) and is set to `RELEASE_DATE` by the release commit (section 16); the release workflow fails if it disagrees with the CHANGELOG section date. No `doi` / `identifiers` until Zenodo has minted one. No `.zenodo.json` (Q5).

### 12.2 README

Replace line 34's last sentence with two sections:

```
## Cite

Cite the version you used: `CITATION.cff` carries the metadata GitHub's "Cite this repository" button and Zenodo read, and every CSV export and HTML report record the release and commit that produced them (`tool_version`, `tool_commit`; docs/data-formats.md). The software is available under the [MIT license](LICENSE).

## Sibling tool

Backcross characterises finished near-isogenic lines; [progeny-selector](https://github.com/piercetaylor/progeny-selector) ranks progeny during the programme, generation by generation. Both read input data contract 1.12.0 (`contract/data-contract.md`), so genotype, `samples.csv` and `markers.csv` files move between them unchanged.
```

Line 5's "(version 0.1.0 is untagged)" is left for the release commit (section 16).

### 12.3 CI and tests

- `.github/workflows/ci.yml` `check` job, after `npm run typecheck`: `- name: CITATION.cff is valid CFF 1.2.0` / `run: pipx install cffconvert==2.0.0 && cffconvert --validate` (Python and pipx are on `ubuntu-latest`; no npm dependency). If `cffconvert==2.0.0` is not the current release when the doer runs it, use the latest and record the number in the commit body.
- `tests/citation.test.ts` (new, node; line-based, no YAML dependency): `CITATION.cff` has `cff-version: 1.2.0`; its `version:` equals package.json's `version`; `date-released:` matches `"\d{4}-\d{2}-\d{2}"`; it contains `repository-code: "https://github.com/piercetaylor/backcross"` and `input data contract ` + `contract/VERSION`; `README.md` contains `## Cite`, `## Sibling tool` and `progeny-selector`.
- CHANGELOG `### Added`: "`CITATION.cff` (validated in CI with cffconvert), a README citation section, and a sibling-tool section cross-linking progeny-selector."

## 13. Phase 9: release workflow, site zip, smoke script

Commit: `ci: tag-triggered release workflow producing the site zip and the CLI bundle`.

### 13.1 Facts the design rests on

- ci.yml triggers on `push: branches: [main]` and pull requests; a tag push matches neither, so release.yml runs the gates itself (a duplicated job, commented as such; a reusable workflow is not introduced).
- Chromium refuses `type="module"` scripts from `file://` (origin `null`), so the built site cannot be opened as a file there whatever the base; Firefox is not asserted here. The zip therefore ships a one-line static-server instruction, unconditionally. The doer opens `dist/index.html` from `file://` once in Chromium and once in Firefox and records both results (nothing more) in the commit body for the M5 block.
- `base: './'` makes every asset URL relative; `demoLoadPayload` (src/ui/demo.ts:69) resolves `BASE_URL` against `location.href`, so the demo works when `index.html` is the served folder's root document, which is the zip's layout. Vite rewrites a worker's own `import.meta.url` to `self.location.href` in worker builds (node.js:27720), so the module worker resolves under a relative base. The smoke script proves both from a nested path.

### 13.2 Files

| path                                  | content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/release.yml` (new) | 13.3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `scripts/smoke-dist.mjs` (new)        | 13.4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `docs/release-readme.txt` (new)       | Plain text copied into the zip as `README.txt`: "Backcross (https://github.com/piercetaylor/backcross)" / "SITE. This folder is the built web application. Browsers refuse to run it from a file:// address, so serve the folder over HTTP from any static server, run from inside this folder: `py -3 -m http.server 8000` (Windows), `python3 -m http.server 8000` (macOS, Linux) or `npx serve .` (Node); then open http://localhost:8000/ . Genotype files never leave the browser. Add ?demo=synthetic to the address to load the bundled synthetic demo." / "CLI. cli/backcross-cli.mjs needs Node 22.19 or newer and nothing else: `node cli/backcross-cli.mjs summarize --genotypes FILE --samples samples.csv [--markers markers.csv]`. Subcommands: summarize, segments, targets, compare, discordant, qc; run it without arguments for the options." / "Inputs: contract/data-contract.md in the repository. Outputs and their columns: docs/data-formats.md. User guide: docs/user-guide.md. Licence: MIT (LICENSE). Cite: CITATION.cff." |
| `PLAN.md` :121                        | Replace "or opened from a USB stick with `npm run preview`" with "or carried on a USB stick as the release zip (`backcross-<version>-site.zip`, built with a relative base) and served from any static server (`python3 -m http.server`); a browser will not run the module scripts from a `file://` address".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `package.json`                        | script `"smoke:dist": "node scripts/smoke-dist.mjs dist"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `CHANGELOG.md` `### Added`            | "Each GitHub Release carries `backcross-<version>-site.zip`, the built site with a relative base that serves from any static folder (with a one-line server instruction, since browsers do not run module scripts from `file://`), the CLI bundle, LICENSE and CITATION.cff; and the CLI bundle on its own. The release body is that version's CHANGELOG section plus the contract version it implements."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `CONTRIBUTING.md`                     | New section `## Releasing` in five lines pointing at docs/m5-phases.md section 16: bump `package.json` `version`, run `node scripts/changelog-section.mjs --release <version> <date>`, set `CITATION.cff` `version` and `date-released`, commit `chore(release): <version>`, tag `v<version>` and push the tag; the workflow does the rest and fails if the three disagree.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

### 13.3 `release.yml`

```yaml
# Builds and publishes a GitHub Release when a version tag is pushed. Runs
# the gates itself: ci.yml is keyed on branches and pull requests and does
# not see a tag push. Never runs on a push to main. The maintainer tags
# after review (docs/m5-phases.md, section 16).
name: release
on:
  push:
    tags: ['v*']
permissions:
  contents: read
jobs:
  gates:
    runs-on: ubuntu-latest
    steps: # identical to ci.yml's check job through the fixture/contract diff, plus build:cli
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v6
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: sudo apt-get update && sudo apt-get install -y tabix
      - run: npm test
        env: { BGZIP_BIN: bgzip }
      - run: npm run build
      - run: npm run build:cli
      - run: |
          npm run fixture
          npm run contract
          git diff --exit-code -- tests/fixtures contract
  release:
    needs: gates
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v6
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - name: tag, package.json, CHANGELOG and CITATION.cff agree
        run: |
          VERSION="${GITHUB_REF_NAME#v}"
          test "$(node -p 'require("./package.json").version')" = "$VERSION"
          node scripts/changelog-section.mjs "$VERSION" > notes.md
          DATE="$(grep -m1 "^## \[$VERSION\] - " CHANGELOG.md | sed 's/.* - //')"
          grep -q "^version: $VERSION$" CITATION.cff
          grep -q "^date-released: \"$DATE\"$" CITATION.cff
          echo "VERSION=$VERSION" >> "$GITHUB_ENV"
      - run: npm run build
        env: { VITE_BASE_PATH: ./ }
      - run: npm run build:cli
      - uses: r-lib/actions/setup-r@v2
        with: { use-public-rspm: true }
      # readr install as ci.yml's r-reader job, including its fallback step.
      - id: r-deps
        uses: r-lib/actions/setup-r-dependencies@v2
        continue-on-error: true
        with: { packages: any::readr }
      - if: steps.r-deps.outcome == 'failure'
        run: Rscript -e 'install.packages("readr", repos = "https://cloud.r-project.org")'
      - name: the bundle reproduces the fixture tables and readr reads them
        run:
          | # the six ci.yml r-reader commands with `node dist-cli/backcross-cli.mjs` in place of `node src/cli.ts`
          ...
          Rscript scripts/read_exports.R summary.csv segments.csv targets.csv pairwise.csv discordant.csv qc.csv
      - run: npx playwright install --with-deps chromium
      - run: node scripts/smoke-dist.mjs dist
      - name: assemble the zip
        run: |
          STAGE="backcross-$VERSION"
          mkdir -p "$STAGE/cli"
          cp -r dist/. "$STAGE/"
          cp dist-cli/backcross-cli.mjs "$STAGE/cli/backcross-cli.mjs"
          cp LICENSE CITATION.cff "$STAGE/"
          cp docs/release-readme.txt "$STAGE/README.txt"
          zip -qr "backcross-$VERSION-site.zip" "$STAGE"
          cp dist-cli/backcross-cli.mjs "backcross-cli-$VERSION.mjs"
          printf '\nImplements input data contract %s.\n' "$(cat contract/VERSION)" >> notes.md
      - name: create the GitHub Release
        env: { GH_TOKEN: '${{ github.token }}' }
        run: gh release create "$GITHUB_REF_NAME" --title "Backcross $VERSION" --notes-file notes.md "backcross-$VERSION-site.zip" "backcross-cli-$VERSION.mjs"
```

`gh` is preinstalled on `ubuntu-latest`; no third-party release action is added. The sibling release link (Q6) is part of the CHANGELOG section written by the release commit (section 16), so `notes.md` carries it. `workflow_dispatch` is deliberately absent: a manual run without a tag has no version to release.

### 13.4 `scripts/smoke-dist.mjs`

```js
// Serves a built site from a nested path and loads the demo in Chromium, so a
// relative-base build (VITE_BASE_PATH=./) is proven to find its scripts, its
// module worker and demo/synthetic/ from wherever the folder is served
// (docs/adr/0030; docs/m5-phases.md 13.4).
// Usage: node scripts/smoke-dist.mjs <distDir>
// Exit 0: the Summary heading appeared; 2: no Chromium or no distDir; 1: anything else.
```

Serves `<distDir>` with `node:http` on `127.0.0.1:4174` under the prefix `/nested/backcross/` (`/nested/backcross/` and `/nested/backcross/index.html` both serve `index.html`; MIME map: `.html text/html`, `.js text/javascript`, `.css text/css`, `.svg image/svg+xml`, `.json application/json`, `.csv text/csv`, `.vcf text/plain`, `.woff2 font/woff2`, `.map application/json`, `.txt text/plain`; anything else 404). Launches Playwright `chromium` headless (`chromium.executablePath()` honours `PLAYWRIGHT_BROWSERS_PATH` as in `lighthouse-a11y.mjs`), collects `pageerror`, console `error` messages and `worker` events, opens `http://127.0.0.1:4174/nested/backcross/?demo=synthetic`, waits up to 60 s for `page.getByRole('heading', { name: 'Dataset summary and QC' })`, then requires at least one worker event and no collected error. Prints `smoke-dist: ok (<ms> ms, <n> requests)` or the first error. No vitest test is added for it (it would need a build and a browser inside `npm test`); the script runs in release.yml and once locally by the doer, recorded in the commit body.

### 13.5 Acceptance

`npm run build:cli`, then `VITE_BASE_PATH=./ npm run build && npm run smoke:dist` pass locally (headless Chromium via Playwright). The workflow file passes `npm run lint` (prettier). The workflow itself runs only when the maintainer pushes the tag (section 16); it is not exercised in M5's commits.

## 14. Phase 10: user guide and docs index

Commit: `docs: user guide for breeders and a docs index`.

### 14.1 `docs/user-guide.md`

Short, second person, no code beyond commands. Headings, each with the content it must carry:

1. `# Backcross user guide`: one paragraph on what it answers (is the introgression where intended, is the rest recurrent parent, is any line mislabelled, heterozygous or an outcross) and the two ways to run it.
2. `## Prepare the inputs`: the genotype file (VCF, bgzip VCF, HapMap, wide CSV, or a BrAPI variant set), `samples.csv` (one `recurrent_parent`, one `donor_parent`, candidates), optional `markers.csv` (cM enables `rpp_cm` and the cM segment gap); pointer to `contract/data-contract.md` for every rule and `docs/input-coding.md` for what each cell may hold; the crop (chromosome scheme) and token profile selects; "save as CSV UTF-8"; never mix assemblies.
3. `## Run the site`: the Pages URL, the demo link, the release zip and the one-line server (docs/release-readme.txt text), the six steps in the rail, files never leave the tab.
4. `## Run the CLI`: `node src/cli.ts` or the release bundle; the six subcommands with one example each; `--crop`, `--profile`, `--max-marker-coverage-bp/-cm`, the segment options; `--out`.
5. `## Read the results`: RPP (`rpp_count`, `rpp_bp`, `rpp_cm`; expected 1 − (1/2)^(n+1) after n backcrosses; the maximum marker coverage and its soybean 2 Mb derivation, set it for another crop or supply cM; the cM end rule in one sentence); segments (start/end are the outermost non-RP markers, flanks bound the breakpoint, `gap_criterion`); targets (`donor`, `het`, `rp`, `recombinant`, `no_data`; drag min/max); QC flags, each in one clause (`high_missing`, `high_het`, `nonparental_alleles`, `closer_to_donor` "swapped sample or swapped parents", `identical_to_rp`, `no_informative_calls`, `parent_heterozygous`; dataset flags in the report only); the graphical genotype (colours and textures, one row per line, majority binning).
6. `## Exports`: the six CSVs and the report, file names as the Export screen writes them, the five provenance columns, `NA` for missing, pointer to docs/data-formats.md for every column.
7. `## Limitations and what is not validated yet`: one donor per analysis; diploid calls only; positions are not converted between assemblies; the 2 Mb default is a soybean euchromatic translation; no imputation or error correction; CLI QC thresholds are the defaults; very large GBS VCFs: pre-filter with `bcftools view -R`; the site does not run from `file://`.
8. `## Validation status` (exact list): "Real data: one soybean cross, the SoySNP50K Clark x PI86024 NILs, where the count-based RPP agreed with progeny-selector to six decimals for all eight lines (PLAN.md, 2026-09-26); no other real dataset. Token profiles (`tassel`, `soybase-report`, `dart`, `axiom`, `kasp`): synthetic files only. Crop schemes for the twelve crops other than soybean: synthetic files against published nomenclature only. Browsers: the test suite runs in Chromium and Firefox; Safari has never been run. Accessibility: axe and Lighthouse in the suite; no screen-reader session. No usability session with a breeder. Paper output: print media emulated, never printed. readr: the six CLI tables are read in CI; `brapi-callsets.csv` is not. BrAPI: the loader is tested against recorded responses under `tests/fixtures/brapi/`; whether a live server was ever used is stated as PLAN.md's M3 block records it (the doer copies that fact, not a guess)."
9. `## Supported browsers`: current Chromium (Chrome, Edge) and Firefox on a laptop; mobile layouts are a non-goal.

### 14.2 `docs/README.md`

Two lists with one line per file. "For users": user-guide.md, data-formats.md, input-coding.md, ../contract/data-contract.md, ../CITATION.cff, ../SECURITY.md. "Internal records": adr/ (one line: "MADR decisions, 0001 to 0030"), the phase specs (m2.5-phases, m3-phases, m3-phase4-brapi, m3-phase5-a11y, m4-phases, m5-phases), the handoffs, contract-1.1-phases and contract-1.2.0-positions, design-brief, design-survey, reference-repos, research/, legacy-readme, release-readme.txt. README.md "Verification and documentation" gains "[the user guide](docs/user-guide.md)" first and "[docs index](docs/README.md)".

### 14.3 Acceptance

`npm run lint`; `tests/docs-index.test.ts` (new): every path named in `docs/README.md` exists; `docs/user-guide.md` contains the nine headings above and the string "Validation status"; every `docs/*.md` and `docs/*.txt` file is named in `docs/README.md` (so a new doc must be indexed). CHANGELOG `### Added`: "A user guide for breeders (docs/user-guide.md) with a validation-status section, and a docs index (docs/README.md)."

## 15. Phase 11: CI hardening

Commit: `ci: print and bound the bench, check the contract mirror, longer browser connect timeout`.

### 15.1 Bench budget, two steps

- `package.json`: `"test:bench": "vitest run --project bench --silent=false --reporter=verbose"`, so the figures print locally and in CI (PLAN.md:399 records that the default reporter prints nothing). `CLAUDE.md` :33 and PLAN.md :399 reworded: "`npm run test:bench` prints the figures".
- ci.yml `browser` job: `VITE_BENCH_BUDGET_MS: '60000'` with the comment (lines 48-52) rewritten: "Interim CI budget of 60 s (about ten times the M4 laptop Firefox first draw of 6.2 s, half the former 120 s hang guard; docs/m5-phases.md 15.1). Once one green run has printed its figures, set this to four times the slower browser's first-draw figure, rounded up to the next 5 s, and record both in PLAN.md's M5 block." Step 2 is a one-line follow-up commit by the main session after the first CI log is read; it is not a doer phase.

### 15.2 Firefox connect timeout

vitest 5.0.0 rejects `Failed to connect to the browser session ... within the timeout` from `BrowserSessions.createSession` after `browser.connectTimeout` (node_modules/vitest/dist/chunks/index.B89dZ0-N.js:6424-6425); it is a session-level rejection before any test runs, so `test.retry` (which retries failed tests) cannot catch it and is not used. `connectTimeout` is the supported knob: `vite.config.ts` :110 becomes `connectTimeout: 180_000` and the comment on lines 108-109 becomes: "Files run one at a time (fileParallelism below), so this is not contention between pages: on a cold CI runner the first Firefox session missed 120 s once (2026-09-29; the rerun passed), so the first connection is given three minutes. If it recurs, the alternative is a targeted rerun of the step when the log holds that message, not a longer timeout." The alternative (a shell step that reruns `npm run test:browser` once when its log contains the message) is recorded here as a maintainer decision, not implemented.

### 15.3 Contract-mirror job (recommended: add it)

The claim in docs/m3-phases.md Q4 is made true rather than dropped, because the repositories are public and the check is one script with no dependencies:

```yaml
# Byte-compares contract/ with progeny-selector's mirror (docs/adr/0013).
# Red between a contract bump here and the sibling's mirror commit is
# expected and is the signal; deploy does not wait for this job.
contract-mirror:
  needs: check
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v7
    - uses: actions/checkout@v7
      with:
        repository: piercetaylor/progeny-selector
        path: progeny-selector
    - uses: actions/setup-node@v6
      with: { node-version: 22 }
    - run: node scripts/check-contract-mirror.mjs progeny-selector
```

Docs finalised in this phase: `scripts/check-contract-mirror.mjs` :7-8 "A local gate and the `contract-mirror` CI job (docs/m5-phases.md 15.3)."; `contract/README.md` :13 append "CI runs the same check against a fresh checkout of progeny-selector."; docs/m3-phases.md :307's correction gains "(phase 11 added `contract-mirror`, which checks the sibling out rather than fetching its manifest)"; CLAUDE.md :38 "and `node scripts/check-contract-mirror.mjs ../progeny-selector` must then pass" gains "(CI runs it as `contract-mirror`)".

### 15.4 Acceptance

`npm run test:bench` prints `Load -> first draw ... ms` locally; `npm run lint` on ci.yml. The CI results of this commit are read by the main session for 15.1 step 2 and for the M5 block.

## 16. Milestone close and the release procedure (main session and maintainer)

1. After phase 11, run the per-milestone gates and append `### M5 run, <date>` to PLAN.md in the M4 block's shape: gate outputs; `npm run test:bench` figures (both browsers) beside M4's; Lighthouse; `check-bundle` sizes and the CLI bundle's bytes; `npm run smoke:dist` output; the CI bench figures and the budget set in 15.1 step 2; the `file://` results from 13.1; the GitHub rendering of the issue forms; "Not verified" (the user guide's list, plus: the release workflow until the tag).
2. Maintainer release commit `chore(release): 0.1.0` on the day of the joint release: `node scripts/changelog-section.mjs --release 0.1.0 <RELEASE_DATE>`; add at the top of the 0.1.0 section's `### Added` the line "Released together with progeny-selector (<SIBLING_RELEASE_URL>); both implement input data contract 1.12.0."; set `CITATION.cff` `date-released: "<RELEASE_DATE>"`; README line 5 to "**Status:** version 0.1.0 (see [Releases](https://github.com/piercetaylor/backcross/releases))."; run the gates (`tests/changelog.test.ts` and `tests/citation.test.ts` prove the three agree).
3. `git tag v0.1.0 && git push origin v0.1.0`; release.yml runs; its Release body is the 0.1.0 section plus the contract line. No tag is pushed by any doer or in any M5 phase.
4. After the Release exists: Zenodo mints the DOI (if the integration was enabled in time); the next release adds `identifiers: [{ type: doi, value: <concept DOI> }]` to CITATION.cff.
