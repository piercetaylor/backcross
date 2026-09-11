# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- A texture per genotype class on the graphical genotype canvas and its legend, implementing the minority-class hatch ADR 0007 recorded as outstanding: donor, heterozygous, nonparental and missing calls each carry a distinct diagonal, crosshatch or dot pattern in addition to their Okabe-Ito colour, and a bin whose majority call hides a different call underneath now shows that call's texture overlaid on the majority fill. Recurrent-parent and uninformative stay plain fills (ADR 0009, amended 2026-09-11). The overlay never appears on a column that only holds an interval-fill extension between two markers, so it asserts nothing about the genome between markers. `classSwatchCss` (src/core/palette.ts) draws the same encoding as a CSS `background` value in the app legend and the self-contained HTML report.

- One selection model behind the Lines table and the graphical genotype view: a shared sort, a filter (free text over sample, line, generation, family and QC flags, plus flagged-only and selected-only) and one row model, so sorting or filtering from either screen reorders the other. An action bar on both screens reads `Lines: n, visible: n, selected: n`; "Select all" and "Select none" act on the visible rows and leave hidden selected lines alone. Reordering is done on the main thread, so a sort issues no worker request.
- Donor segment calling with breakpoint bounds (`callSegments`), target-region status and linkage-drag estimates (`checkTargets`, `parseTargetSpec`), and per-line, per-marker and dataset QC flags (`computeQc`); segments CSV and target check CSV exports; fixture expectations for segments under both gap criteria.
- Upload, Summary and QC, Lines and Graphical genotype screens over a Web Worker that keeps the genotype matrix off the main thread: load with a parameter panel, per-line QC table and call-rate histogram, sortable line table with target-region status, and a canvas renderer with per-pixel majority binning (docs/adr/0007).
- Genotype-view zoom and hover, reading a marker's position, id, class and sample at any zoom level; a Compare screen for pairwise line comparison; an Export screen producing the HTML report and all CSV exports; keyboard navigation across screens; and parameter editing after load without re-parsing the genotype file (M2 milestone, PLAN.md).
- Pairwise line comparison in both modes, with per-chromosome counts, discordant markers in genome order and identity by state (the SNPRelate definition) in mode `all`; the two pairwise CSVs of docs/data-formats.md.
- A self-contained HTML report: dataset summary, warnings, the parameters every number was computed with, QC, lines, donor segments, target checks and a graphical genotype image for each line rendered into the report, with a print stylesheet for PDF.
- Parameters `maxSegmentGapBp` (10 Mb) and `maxSegmentGapCm` (10 cM) for donor-run breaking, distinct from the RPP coverage cap, with env vars `VITE_DEFAULT_MAX_SEGMENT_GAP_BP` and `VITE_DEFAULT_MAX_SEGMENT_GAP_CM` (docs/adr/0008).
- Data-contract parsers for VCF 4.2 (plain and gzip/bgzip), HapMap, and wide CSV (nucleotide and coded A/B/H), with samples.csv and markers.csv validation at the boundary.
- Parent-of-origin classification per marker per candidate (RP-homozygous, donor-homozygous, heterozygous, missing, nonparental, uninformative).
- Recurrent parent proportion per line and per chromosome: marker-count, bp-weighted, and cM-weighted estimators.
- Per-line summary CSV export and a Node CLI (`node src/cli.ts summarize`).
- Synthetic 500-marker fixture with planted donor segments and analytically derived expectations; Vitest smoke and contract tests.
- Module stubs with fixed interfaces for donor segment calling, target-locus check, pairwise comparison, QC, canvas renderer, worker protocol, and the six UI screens.
- GitHub Actions workflow (lint, typecheck, test, build, fixture reproducibility, GitHub Pages deploy).

### Changed

- The graphical genotype view draws the visible rows in display order, and the HTML report's figures inherit that order. This replaces the rule that it drew the selection, or every candidate when nothing was selected; the selected-only filter is the equivalent of the old behaviour (docs/adr/0009, amended 2026-09-11). The CSV exports are unchanged: they are computed over the whole dataset by contract.
- Line table columns sort naturally on embedded numbers, so `NIL_2` now sorts before `NIL_10` rather than after it. Numeric columns place NA last whichever way the column points, and ties keep the worker's candidate order. The table gains a sortable `family_id` column, and the QC flags column is now sortable.
- The canvas renderer extends each marker across the pixel columns nearer to it than to any other marker when markers are sparser than pixels, which is what zooming into a region produces, so a track reads as contiguous blocks instead of one hairline per marker (docs/adr/0007). This changes how every existing view is drawn.
- The donor-run gap is measured between consecutive informative markers (PLINK `--homozyg-gap` convention) rather than between consecutive non-RP calls, so `maxMissingSpan` is the only control on missing calls; the segments CSV gains a trailing `gap_criterion` column.
- docs/design-brief.md and docs/adr/0009: the interface design language for milestone M2.5, with the prior art it follows and the contrast measurements behind the texture encoding.
- The CLI rejects an option that belongs to another subcommand (for example `--max-gap-bp` on `segments`) with exit code 2 instead of ignoring it.

## [0.1.0] - Unreleased

Initial scaffold. No release has been made.
