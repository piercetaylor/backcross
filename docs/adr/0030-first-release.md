# First release: version, CLI distribution, cap naming, provenance, citation

Status: accepted. Date: 2026-09-29. Format: MADR 4.0.0 [web] https://adr.github.io/madr/.

## Context and Problem Statement

M5 is the first public release (PLAN.md, docs/m5-phases.md). At the audit of 2026-09-29 M0 to M4 were complete and every gate was green (925 node tests, 118 browser tests), the tree was clean, contract 1.12.0 was mirrored in `../progeny-selector`, `npm audit` was clean, and there was no tag and no release. Six questions had to be settled before anything is published: which version the first release carries, how the command-line tool is distributed, what the RPP coverage cap is called, how an export records the software that made it, how the tool is cited, and whether the two sibling tools release together. The maintainer delegated all of them to Fable research, settled on 2026-09-29.

## Decision Drivers

- The criterion of the delegation: best for academic and open-source plant breeders, meaning reproducible with readr, pandas and spreadsheets, never silently wrong, citable.
- Nothing is released yet, so a rename or a new column breaks no one.
- The shared contract is the statement the two tools have in common; a release note must not make it false in either tool.

## Considered Options and Decision Outcome

**Q1, the version: v0.1.0.** Chosen over 1.0.0 and over a date version. 0.1.0 signals that the output columns may still change before 1.0, and it matches every existing mention (`RELEASE_VERSION = 0.1.0` and the package.json version). The app and the contract versions stay independent; the release notes say "Implements input data contract 1.12.0".

**Q2, CLI distribution: a single-file ESM bundle built by esbuild.** The bundle `dist-cli/backcross-cli.mjs` is attached to every GitHub Release; `node src/cli.ts` stays the developer path. esbuild is a pinned devDependency because Vite 8 is Rolldown-based and no longer ships it (`node_modules/esbuild` is absent, verified 2026-09-29). A bundle, because a breeder should not need `npm ci` to run a table command. No npm publish and no `bin`: the site zip and the Release asset are the distribution, `"private": true` stays, and a `bin` entry would point at a gitignored file.

**Q3, the cap name: `max_marker_coverage`.** The RPP coverage cap takes this stem everywhere (columns, CLI flags, environment variables, `RppParams`, labels), because `max_gap` collides with the segments.csv `gap_criterion` and with the donor-run gap of ADR 0008. It is renamed now, before anything is released, and no aliases are kept.

**Q4, provenance: three columns `tool`, `tool_version`, `tool_commit`.** They are constant per row, follow `crop` in the six analysis CSVs (summary, qc, segments, targets, pairwise, discordant), and are absent from `brapi-callsets.csv`, which precedes a load. Three columns so that readr and pandas users select by name. `tool` is `backcross`; `tool_version` is the package.json version; `tool_commit` is `g` and seven hex characters of HEAD, as `git describe` writes it, with `-dirty` appended when tracked files differ from HEAD (`git status --porcelain --untracked-files=no` prints anything; untracked files are ignored), so that a locally built export cannot claim a commit it does not match. When `GITHUB_SHA` is set, its first seven hex characters are used with no dirty check; when git is unavailable the value is `NA`, the tables' missing token. There is no comment line, because readr and pandas would need a `comment` argument to read it, and no sidecar file. The HTML report carries a "Software" summary row and a `<meta name="generator">`. The contract version is not a column.

**Q5, citation: CITATION.cff only.** GitHub's "Cite this repository" and Zenodo both read it, and a `.zenodo.json` would override it (Zenodo ignores the CFF when `.zenodo.json` exists), so only the CFF is kept. The README gains "Cite" and "Sibling tool" sections.

**Q6, a joint release with progeny-selector on the same day.** Both tools implement contract 1.12.0, and a same-day release keeps the shared statement true in both notes; each release note names contract 1.12.0 and links the sibling's release.

### Consequences

- Good: exports are citable, reproducible and self-describing; a reader can tell which software and commit produced a table.
- Good: the CLI runs from one file on any Node 22.19 or later, with no install step.
- Bad: three more columns in every analysis table.
- Bad: a `-dirty` value appears in an export made from a hand-modified tree.
- Bad: the CLI bundle must be rebuilt for every release.
- Neutral: the contract is untouched; `contract/VERSION` stays 1.12.0.

## Revisit when

- The first Zenodo DOI exists: add `identifiers` to CITATION.cff, in the release after 0.1.0.

## More Information

The decisions are the maintainer-delegated Fable research of 2026-09-29. Amends ADR 0028 by a dated amendment of 2026-09-29 (the assembly-length table is deferred to a later milestone, and phases 2 and 6 add paragraphs). The sibling's record of the same decisions is progeny-selector's docs/adr/0035; the cM first-marker end rule (docs/m5-phases.md, Q7) was settled by the same research route on 2026-09-29 and is recorded in the ADR 0028 amendment of phase 2.
