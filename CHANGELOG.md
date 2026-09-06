# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Donor segment calling with breakpoint bounds (`callSegments`), target-region status and linkage-drag estimates (`checkTargets`, `parseTargetSpec`), and per-line, per-marker and dataset QC flags (`computeQc`); segments CSV and target check CSV exports; fixture expectations for segments under both gap criteria.
- Upload, Summary and QC, Lines and Graphical genotype screens over a Web Worker that keeps the genotype matrix off the main thread: load with a parameter panel, per-line QC table and call-rate histogram, sortable line table with target-region status, and a canvas renderer with per-pixel majority binning (docs/adr/0007).
- Parameters `maxSegmentGapBp` (10 Mb) and `maxSegmentGapCm` (10 cM) for donor-run breaking, distinct from the RPP coverage cap, with env vars `VITE_DEFAULT_MAX_SEGMENT_GAP_BP` and `VITE_DEFAULT_MAX_SEGMENT_GAP_CM` (docs/adr/0008).
- Data-contract parsers for VCF 4.2 (plain and gzip/bgzip), HapMap, and wide CSV (nucleotide and coded A/B/H), with samples.csv and markers.csv validation at the boundary.
- Parent-of-origin classification per marker per candidate (RP-homozygous, donor-homozygous, heterozygous, missing, nonparental, uninformative).
- Recurrent parent proportion per line and per chromosome: marker-count, bp-weighted, and cM-weighted estimators.
- Per-line summary CSV export and a Node CLI (`node src/cli.ts summarize`).
- Synthetic 500-marker fixture with planted donor segments and analytically derived expectations; Vitest smoke and contract tests.
- Module stubs with fixed interfaces for donor segment calling, target-locus check, pairwise comparison, QC, canvas renderer, worker protocol, and the six UI screens.
- GitHub Actions workflow (lint, typecheck, test, build, fixture reproducibility, GitHub Pages deploy).

### Changed

- The donor-run gap is measured between consecutive informative markers (PLINK `--homozyg-gap` convention) rather than between consecutive non-RP calls, so `maxMissingSpan` is the only control on missing calls; the segments CSV gains a trailing `gap_criterion` column.
- The CLI rejects an option that belongs to another subcommand (for example `--max-gap-bp` on `segments`) with exit code 2 instead of ignoring it.

## [0.1.0] - Unreleased

Initial scaffold. No release has been made.
