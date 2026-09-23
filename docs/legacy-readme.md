# Backcross (archived README)

This is the former repository landing page, retained as a historical record on 2026-09-22. For current usage and status, see [the main README](../README.md).

Status: pre-alpha (0.1.0 unreleased). Open source under the MIT licence.

Backcross is a free, open-source web tool for plant breeders who develop near-isogenic lines by backcrossing. Given SNP genotype calls for a set of finished lines and their recurrent and donor parents, it answers the questions a breeder asks before releasing a line: where the donor introgression sits and how large it is, how much of the recurrent-parent genome has been recovered, whether each target locus carries the donor allele, and whether any line looks like a mislabelled sample, a residual heterozygote or an outcross.

It classifies every call by parent of origin, estimates recurrent-parent proportion three ways (count-, bp- and cM-weighted), calls donor segments with breakpoint bounds, checks user-defined target regions, flags QC problems per line and per marker, compares lines pairwise, draws graphical genotypes for every line on one screen, and exports CSV tables and a self-contained HTML report. It reads VCF, HapMap and wide CSV files as they come, and chromosome names currently follow soybean (Glycine max). Everything runs inside your browser tab: genotype data for unreleased lines is never uploaded. The same compute core runs from the command line in Node.

- **Use it:** https://piercetaylor.github.io/backcross/
- **Try it with synthetic data:** https://piercetaylor.github.io/backcross/?demo=synthetic loads a small generated dataset (six lines, 500 markers) and opens the summary. The data are synthetic, not from any breeding program.
- **Cite it:** there is no paper yet. Please cite the repository, https://github.com/piercetaylor/backcross, with the version or commit you used.
- **Licence:** MIT (LICENSE).

Backcross was called Isoline Browser before 2026-09-16 (docs/adr/0017).

## What exists now

Parsers for VCF 4.2+ (plain or bgzip), HapMap and wide CSV (nucleotide or A/B/H), the samples.csv and markers.csv contracts, parent-of-origin classification, RPP with three estimators, donor segment calling with breakpoint bounds (docs/adr/0008), target-region status with linkage-drag bounds, per-line, per-marker and dataset QC flags, the per-line summary, segments and target check CSVs, CLI `summarize`, `segments` and `targets` commands, a synthetic fixture with independently derived expectations, and passing tests. The Upload, Summary and QC, Lines and Graphical genotype screens run over a Web Worker and draw every line on one canvas with per-pixel binning. Pairwise comparison, the Compare and Export screens, zoom and hover in the genotype view, and the HTML report are M2; see PLAN.md, "Milestones".

## Quickstart

Requires Node 22.19 or later.

```
npm ci
npm test                      # vitest: fixture smoke tests and contract tests
npm run lint                  # eslint + prettier --check
npm run typecheck             # tsc --noEmit
npm run dev                   # Vite dev server; open http://localhost:5173 and load the fixture files
node src/cli.ts summarize --genotypes tests/fixtures/synthetic/genotypes.vcf \
  --samples tests/fixtures/synthetic/samples.csv \
  --markers tests/fixtures/synthetic/markers.csv [--profile ID|FILE] [--crop ID] --out summary.csv
node src/cli.ts segments  ... --out segments.csv        # same inputs; donor segments per line
node src/cli.ts targets   ... --target rhg1=Gm18:1.6Mb-1.7Mb --out targets.csv
```

`npm run build` writes a static site to dist/ (base path from `VITE_BASE_PATH`, see .env.example) that can be served from GitHub Pages or any static server.

## Input files

Genotypes as VCF, HapMap or wide CSV; samples.csv with exactly one `recurrent_parent` and one `donor_parent`; optional markers.csv with cM positions; an optional token profile (TASSEL, SoyBase report, DArT, Axiom, KASP, or your own JSON); and a crop, chosen on the Upload screen or with `--crop`, which decides how chromosome names are normalised and ordered (soybean, maize, rice, sorghum, wheat, barley, oat, common bean or cotton; soybean is the default). The input contract is specified in contract/data-contract.md and is shared byte for byte with the sibling progeny-selector project so files move between the two tools unchanged. What each format accepts, reads as missing and rejects is tabulated in docs/input-coding.md.

## Documents

PLAN.md (problem, algorithms, UI, milestones, verification), docs/data-formats.md, docs/input-coding.md, docs/reference-repos.md, docs/adr/ (MADR decision records), CHANGELOG.md, CONTRIBUTING.md.

## Licence

MIT (LICENSE).
