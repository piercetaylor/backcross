# contract/

The input data contract shared by isoline-browser and progeny-selector. `data-contract.md` is the specification, `VERSION` its version, `cases/` the machine-checked examples and `MANIFEST.sha256` the hash of every other file here. The canonical copy lives in isoline-browser; progeny-selector holds a byte-for-byte mirror.

## Version

`VERSION` is SemVer, and the same string appears on the `Contract version:` line of `data-contract.md` and in each repository's `docs/data-formats.md`. Bump the major version for a changed or removed column, vocabulary token or rule; the minor version for an additive optional column or token; the patch version for wording only. Any change under `contract/` bumps the version.

Version 1.0.0 asserts only the intersection: inputs both repositories already handle identically and both documents state. An input one repository accepts and the other does not gets a case only once the maintainer decides it belongs in the contract, as a minor bump.

## Mirror rule

Edit the canonical copy in isoline-browser, run `npm run contract`, and copy the whole directory into progeny-selector unchanged. Each repository's tests recompute `MANIFEST.sha256` and check that `VERSION` appears in its `docs/data-formats.md`. `node scripts/check-contract-mirror.mjs ../progeny-selector` byte-compares the two copies and exits 1 on any difference.

## Adding a case

1. Add a literal to `cases` in `scripts/make-contract.mjs`: the input files as text, and either `expect` or `error`. Write the expectation by hand from the input, never by running either repository's parser.
2. A case directory holds `genotypes.<ext>` (the extension selects the format), `samples.csv`, optionally `markers.csv`, and `expected.json` or `expected-error.json`. Keep it under 4 KB and the directory under 64 KB.
3. `expected.json`: markers in chromosome order then position, `cm` null when absent; `sampleIds` in manifest order, only samples with a genotype column; `calls` per sample, per marker, as the two allele symbols sorted, or null when missing. `expected-error.json` names an error kind: `manifest.roles`, `manifest.unknown_role`, `manifest.duplicate_sample`, `dataset.sample_missing`, `genotypes.duplicate_marker`, `genotypes.no_gt` or `genotypes.no_header`. Each repository maps a kind to its own error message in its test.
4. Run `npm run contract`, bump `VERSION` and the version line in `data-contract.md`, run the tests in both repositories.
