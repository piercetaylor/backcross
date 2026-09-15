# Isoline Browser

Status: scaffold / pre-alpha (0.1.0 unreleased).

Isoline Browser characterises finished soybean near-isogenic lines against their recurrent and donor parents from SNP genotype files, entirely inside the browser tab: parent-of-origin classification, recurrent-parent proportion (count-, bp- and cM-weighted), donor segment calling, target-region checks, pairwise comparison, QC flags, graphical genotypes across the 20 Glycine max chromosomes, and CSV/HTML exports. Nothing is uploaded to a server. The same compute core runs from the command line in Node.

## What exists now

Parsers for VCF 4.2+ (plain or bgzip), HapMap and wide CSV (nucleotide or A/B/H), the samples.csv and markers.csv contracts, parent-of-origin classification, RPP with three estimators, donor segment calling with breakpoint bounds (docs/adr/0008), target-region status with linkage-drag bounds, per-line, per-marker and dataset QC flags, the per-line summary, segments and target check CSVs, CLI `summarize`, `segments` and `targets` commands, a synthetic fixture with independently derived expectations, and passing tests. The Upload, Summary and QC, Lines and Graphical genotype screens run over a Web Worker and draw every line on one canvas with per-pixel binning. Pairwise comparison, the Compare and Export screens, zoom and hover in the genotype view, and the HTML report are M2; see PLAN.md, "Milestones".

## Quickstart

Requires Node 22.18 or later.

```
npm ci
npm test                      # vitest: fixture smoke tests and contract tests
npm run lint                  # eslint + prettier --check
npm run typecheck             # tsc --noEmit
npm run dev                   # Vite dev server; open http://localhost:5173 and load the fixture files
node src/cli.ts summarize --genotypes tests/fixtures/synthetic/genotypes.vcf \
  --samples tests/fixtures/synthetic/samples.csv \
  --markers tests/fixtures/synthetic/markers.csv --out summary.csv
node src/cli.ts segments  ... --out segments.csv        # same inputs; donor segments per line
node src/cli.ts targets   ... --target rhg1=Gm18:1.6Mb-1.7Mb --out targets.csv
```

`npm run build` writes a static site to dist/ (base path from `VITE_BASE_PATH`, see .env.example) that can be served from GitHub Pages or any static server.

## Input files

Genotypes as VCF, HapMap or wide CSV; samples.csv with exactly one `recurrent_parent` and one `donor_parent`; optional markers.csv with cM positions. The input contract is specified in contract/data-contract.md and is shared byte for byte with the sibling progeny-selector project so files move between the two tools unchanged. What each format accepts, reads as missing and rejects is tabulated in docs/input-coding.md.

## Documents

PLAN.md (problem, algorithms, UI, milestones, verification), docs/data-formats.md, docs/input-coding.md, docs/reference-repos.md, docs/adr/ (MADR decision records), CHANGELOG.md, CONTRIBUTING.md.

## Licence

MIT (LICENSE).
