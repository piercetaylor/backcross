# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Data-contract parsers for VCF 4.2 (plain and gzip/bgzip), HapMap, and wide CSV (nucleotide and coded A/B/H), with samples.csv and markers.csv validation at the boundary.
- Parent-of-origin classification per marker per candidate (RP-homozygous, donor-homozygous, heterozygous, missing, nonparental, uninformative).
- Recurrent parent proportion per line and per chromosome: marker-count, bp-weighted, and cM-weighted estimators.
- Per-line summary CSV export and a Node CLI (`node src/cli.ts summarize`).
- Synthetic 500-marker fixture with planted donor segments and analytically derived expectations; Vitest smoke and contract tests.
- Module stubs with fixed interfaces for donor segment calling, target-locus check, pairwise comparison, QC, canvas renderer, worker protocol, and the six UI screens.
- GitHub Actions workflow (lint, typecheck, test, build, fixture reproducibility, GitHub Pages deploy).

## [0.1.0] - Unreleased

Initial scaffold. No release has been made.
