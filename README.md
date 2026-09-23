# Backcross

Backcross characterizes near-isogenic lines from SNP genotype calls. It compares each line with its recurrent and donor parents, estimates recurrent-parent genome recovery, locates donor segments, checks target regions, and flags genotype quality concerns. The browser app displays graphical genotypes and exports CSV tables and an HTML report. A Node command-line interface uses the same analysis core.

**Status:** Pre-release software (version 0.1.0 is untagged). [Open the app](https://piercetaylor.github.io/backcross/) or [load the synthetic demo](https://piercetaylor.github.io/backcross/?demo=synthetic). The demo contains six generated lines and 500 markers; it does not represent a breeding program.

## Data and interpretation

The app accepts VCF, HapMap, and wide CSV genotype files, a `samples.csv` manifest naming one recurrent and one donor parent, and an optional `markers.csv` genetic map. BrAPI v2.1 allele-matrix loading is also available. Crop-specific chromosome conventions cover soybean, maize, rice, sorghum, wheat, barley, oat, common bean, and cotton. [The input contract](contract/data-contract.md) and [coding reference](docs/input-coding.md) specify accepted fields and calls.

Results describe the supplied markers and parent calls. Sparse or uneven marker coverage leaves segment breakpoints uncertain and can change genome-recovery estimates; the report includes the parameters used. Files selected from disk are analyzed in the browser tab. A BrAPI load requests genotype data from the server the user selects. No real genotype dataset is included in this repository.

## Run locally

Node.js 22.19 or newer is required.

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. For batch output, the synthetic fixture provides a working CLI example:

```sh
node src/cli.ts summarize --genotypes tests/fixtures/synthetic/genotypes.vcf --samples tests/fixtures/synthetic/samples.csv --markers tests/fixtures/synthetic/markers.csv --out summary.csv
```

The `segments` and `targets` commands produce separate CSV files; run `node src/cli.ts` for their options. `npm run build` creates a static site in `dist/`.

## Verification and documentation

`npm test`, `npm run typecheck`, `npm run lint`, and `npm run test:browser` check the analysis and interface. The synthetic fixture has independently generated expected values; [the plan](PLAN.md) records measured performance and remaining verification limits. [Data formats and exports](docs/data-formats.md), [design decisions](docs/adr/), and the [archived README](docs/legacy-readme.md) provide detail.

The software is available under the [MIT license](LICENSE). There is no associated paper; cite this repository with the commit or version used.
