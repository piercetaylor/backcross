# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Large bgzipped VCFs load with memory under twice their inflated size; the file is read as a stream inside the worker. The bound is measured after the load in Chromium and accounted for the genotype builder in both browsers; the decompressor's transient buffers are not measured.
- Corrupted or truncated gzip and bgzip genotype files are now rejected with an error naming the damaged member's byte offset, instead of loading wrong or missing genotypes: every member's CRC32 and length are checked, and a bgzip file must end with its end-of-file block.

- A left rail of the six steps in place of the row of screen buttons. Each step says whether it is the one showing, already done, or still blocked for want of a dataset; blocked steps are announced as disabled and are stepped over by the arrow keys, which now run down the rail rather than across a row. The rail collapses to a numbered strip -- on its own on the graphical genotype screen, where horizontal room is the scarce resource, and by a control that pins it either way for the rest of the session. The heading and the reminder that files never leave the browser tab move into it, and "Skip to main content" is still the first thing a keyboard reaches.

- The graphical genotype canvas surrounded by its context. The line names have moved out of the canvas into a gutter beside it, which stays put while the canvas scrolls sideways and toggles that line's place in the shared selection when clicked; a chromosome strip above the canvas names each track, and on a single chromosome gives the shown window's start and end in Mb; and below the canvas, on a single chromosome, a whole-chromosome overview marks where the window falls and recentres it when clicked. Figures in the exported HTML report are unchanged and keep their labels drawn inside the image.

- Every screen now takes its colours, spacing and type from the design tokens rather than from values written into the component. The app's own stylesheets (`base.css`, `shell.css`, `screens.css`) name tokens and nothing else, and the canvas renderer is handed its font and colours read from the stylesheet instead of holding its own. Visible consequences: an error is now a bar in the one reserved alert colour (docs/adr/0009, amended 2026-09-11) rather than a bare paragraph, a QC line flagged as closer to the donor is shaded and has its flags set in a heavier weight instead of being tinted pink, and the call-rate histogram's bars are a neutral chart colour rather than the recurrent-parent class colour, which they were never reporting. The lint gate that enforces this now covers every component file, with the legacy allowlist deleted.

- The Lines table rebuilt on React Aria's `Table`, which is a `role="grid"` widget rather than a static table: sorting from a column header, multi-row selection with a header checkbox, and a header that stays put while the rows scroll, with enough scroll padding that a row reached by keyboard never lands underneath it. A density control (Compact, Default, Comfortable) in the Lines action bar sets the table's row height and the height of the action bar's own controls; it is session state and is deliberately not remembered across reloads. The selection rule is unchanged -- the table speaks only for the rows the filter leaves visible, and a selected line hidden by the filter stays selected.

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
