# Backcross user guide

Backcross answers four questions about finished near-isogenic lines (NILs) and other backcross-derived lines: is the introgression where you intended, is the rest of the genome recurrent parent, is any line mislabelled, and is any line heterozygous or an outcross. It reads SNP genotypes for the two parents and your lines, and reports one row per line. You can use it in two ways: as a web page that runs in your browser (the site), or from the command line (the CLI). Both use the same code and give the same numbers.

## Prepare the inputs

You need two files, and a third if you have a map.

- **Genotype file.** A VCF, a bgzip-compressed VCF (`.vcf.gz`), a HapMap file, a wide CSV (one row per marker, one column per sample), or a BrAPI variant set fetched from a server.
- **`samples.csv`.** One row per sample: exactly one `recurrent_parent`, exactly one `donor_parent`, and every other row a `candidate`. See `tests/fixtures/synthetic/samples.csv` for a small synthetic example.
- **`markers.csv` (optional).** Marker positions, and genetic positions in cM. With cM, the results include `rpp_cm` and segments are split on a cM gap.

Every rule for these files is in `contract/data-contract.md`. What each genotype cell may hold is in `docs/input-coding.md`.

Choose the crop (chromosome scheme) and, if your file comes from a particular platform, the token profile (`tassel`, `soybase-report`, `dart`, `axiom` or `kasp`). The crop tells Backcross how your chromosome names are spelled; the default is soybean. If you edit a file in a spreadsheet, save it as CSV UTF-8. Never mix assemblies: every marker position must come from the same genome version, because Backcross does not convert between them.

## Run the site

- Open https://piercetaylor.github.io/backcross/. To see it work first, open https://piercetaylor.github.io/backcross/?demo=synthetic, which loads a synthetic dataset.
- To work offline, download the release zip (`backcross-<version>-site.zip`) and unzip it. Chrome and Edge refuse to run it from a `file://` address (Firefox may), so serve the folder from inside it with one line: `py -3 -m http.server 8000` (Windows), `python3 -m http.server 8000` (macOS, Linux) or `npx serve .` (Node). Then open http://localhost:8000/.

The steps run down the left rail:

1. Upload: choose the files, the crop and the token profile.
2. Summary and QC: one row per line, with its flags.
3. Lines: donor segments and target checks.
4. Graphical genotypes: the coloured genotype view.
5. Compare: two samples, marker by marker.
6. Export: download the tables and the report.

Genotype files are read and analysed inside your browser tab and never leave it.

## Run the CLI

From a release, run `node cli/backcross-cli.mjs`; from a clone of the repository, run `node src/cli.ts`. You need Node 22.19 or newer. The examples below use the synthetic fixture. Each prints CSV to the screen unless you add `--out file.csv`.

```
node src/cli.ts summarize  --genotypes tests/fixtures/synthetic/genotypes.vcf --samples tests/fixtures/synthetic/samples.csv
node src/cli.ts segments   --genotypes tests/fixtures/synthetic/genotypes.vcf --samples tests/fixtures/synthetic/samples.csv --markers tests/fixtures/synthetic/markers.csv
node src/cli.ts targets    --genotypes tests/fixtures/synthetic/genotypes.vcf --samples tests/fixtures/synthetic/samples.csv --target "locus=Gm13:28,500,000-29,100,000"
node src/cli.ts compare    --genotypes tests/fixtures/synthetic/genotypes.vcf --samples tests/fixtures/synthetic/samples.csv --a NIL_01 --b NIL_02
node src/cli.ts discordant --genotypes tests/fixtures/synthetic/genotypes.vcf --samples tests/fixtures/synthetic/samples.csv --a NIL_01 --b NIL_02
node src/cli.ts qc         --genotypes tests/fixtures/synthetic/genotypes.vcf --samples tests/fixtures/synthetic/samples.csv --out qc.csv
```

Every subcommand takes `--markers`, `--crop ID`, `--profile ID` (or the path of your own profile file) and `--out`. `summarize` also takes `--max-marker-coverage-bp` and `--max-marker-coverage-cm`. `segments` and `targets` take the segment options `--max-segment-gap-bp`, `--max-segment-gap-cm`, `--min-markers`, `--max-missing-span` and `--include-short`. `compare` and `discordant` take `--mode informative|all`. Run the CLI with no arguments to see the full list. Warnings go to the error stream, not into the CSV.

## Read the results

**Recurrent parent percentage (RPP).** `rpp_count` is the share of informative markers where the line carries the recurrent parent allele. `rpp_bp` and `rpp_cm` weight each marker by the stretch of genome it stands for, in base pairs or in cM (cM needs a map). After n backcrosses the expected recurrent share is 1 - (1/2)^(n+1); for example 0.9375 after three. The stretch a marker may stand for is capped by the maximum marker coverage. The default is 2 Mb, a translation of soybean euchromatic marker spacing; for another crop, set `--max-marker-coverage-bp` yourself, or supply cM. The caps used are written in every summary row. At the ends of a chromosome a terminal marker is credited half the cap on its outer side.

**Segments.** A segment is a run of donor (or heterozygous) markers. `start_bp` and `end_bp` are the outermost non-recurrent markers, and the flank columns are the recurrent markers just outside them, so the true breakpoint lies between the two. `gap_criterion` says whether runs were split on a cM gap (`cm`) or a bp gap (`bp`).

**Targets.** For each region you name, the status is `donor`, `het`, `rp`, `recombinant` (a mixture) or `no_data`. `drag_min_bp` and `drag_max_bp` bound the donor DNA outside the region: at least as far as the outermost donor marker, at most as far as the recurrent flank.

**QC flags.** A line can carry several, joined with `|`.

- `high_missing`: too many missing calls.
- `high_het`: too many heterozygous calls.
- `nonparental_alleles`: alleles that belong to neither parent.
- `closer_to_donor`: closer to the donor than to the recurrent parent, so a swapped sample or swapped parents.
- `identical_to_rp`: indistinguishable from the recurrent parent.
- `no_informative_calls`: no marker that separates the parents is called in this line.
- `parent_heterozygous`: a parent is heterozygous at too many markers.

Two flags about the whole dataset, `parents_identical` and `low_marker_call_rate`, appear in the HTML report only.

**Graphical genotype.** One row per line, one cell per marker: recurrent parent, donor, heterozygous, missing and non-parental each have a colour and a texture, so the picture does not depend on colour alone. Where there are more markers than pixels, each pixel shows the majority class of the markers it covers.

## Exports

The Export screen writes `backcross-summary.csv`, `backcross-qc.csv`, `backcross-segments.csv`, `backcross-targets.csv`, `backcross-pairwise.csv` and `backcross-discordant-markers.csv`, plus `backcross-report.html`, a single self-contained page you can print to PDF. The CLI writes the same tables. Every table ends with five provenance columns (`token_profile`, `crop`, `tool`, `tool_version`, `tool_commit`), so a file names the release that made it. A missing value is `NA`. Every column is described in `docs/data-formats.md`.

## Limitations and what is not validated yet

- One donor parent per analysis.
- Diploid calls only.
- Positions are not converted between assemblies.
- The 2 Mb default is a soybean euchromatic translation, not a general rule.
- There is no imputation or error correction.
- The CLI uses the default QC thresholds; the site lets you set them on the Upload screen.
- For a very large GBS VCF, pre-filter it first, for example with `bcftools view -R regions.bed`.
- In Chrome and Edge the site does not run from `file://`; serve it over HTTP as above.

## Validation status

- Real data: one soybean cross, the SoySNP50K Clark x PI86024 NILs (8 NILs), where the count-based RPP agreed with progeny-selector to six decimals for all eight lines (PLAN.md, 2026-09-26). There is no other real dataset.
- Token profiles (`tassel`, `soybase-report`, `dart`, `axiom`, `kasp`): synthetic files only.
- Crop schemes for the twelve crops other than soybean: synthetic files against published nomenclature only.
- Browsers: the test suite runs in Chromium and Firefox. Safari has never been run.
- Accessibility: axe and Lighthouse run in the test suite. There has been no screen-reader session.
- There has been no usability session with a breeder.
- Paper output: print media is emulated, never printed.
- readr: the six CLI tables are read back in CI; `brapi-callsets.csv` is not.
- BrAPI: the loader is tested against recorded responses under `tests/fixtures/brapi/`. Its paging was observed on test-server.brapi.org on 2026-09-15 (docs/adr/0015); PLAN.md records no other live server.

## Supported browsers

Current Chromium browsers (Chrome, Edge) and Firefox, on a laptop. Mobile layouts are not a goal.
