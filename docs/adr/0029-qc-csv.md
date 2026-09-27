# A per-sample QC table, `qc.csv`

Status: accepted. Date: 2026-09-27. Format: MADR 4.0.0 [web] https://adr.github.io/madr/.

## Context and Problem Statement

`computeQc` (src/core/qc.ts, algorithm 6) derives a missing rate, a heterozygosity rate, a nonparental rate and a list of flags for every sample, parents included, but backcross wrote them only into the HTML report and the Summary and Lines screens. No CSV carried them, so a breeder could not filter or join sample QC in R or a spreadsheet, while progeny-selector already carries `missing_rate`, `het_rate` and `qc_flags` per line in its results.csv. The maintainer delegated the question ("ask fable") and it was decided on 2026-09-27 (Q-E1).

## Decision Drivers

- The standard per-sample QC files are PLINK's `.imiss` (`N_MISS`, `N_GENO`, `F_MISS`) and `.het` (`O(HOM)`, `N(NM)`, `F`) [web] https://www.cog-genomics.org/plink/1.9/formats; a breeder who knows those should find the same quantities.
- One R script should read both tools' flags: the same column name and separator as progeny-selector.
- Additive: no existing column or output changes.
- The layout rule of CLAUDE.md: an exporter that needs the genotype matrix runs inside the worker.

## Considered Options

1. **A new per-sample `qc.csv`**, one row per sample.
2. **QC columns appended to the per-line summary CSV**, which has candidates only and would leave the parents out.
3. **No table**; QC stays in the report.

## Decision Outcome

**Chosen: option 1.** A new documented output `qc.csv`, one row per sample in manifest order, the parents included, with columns `sample_id, call_set_db_id, sample_db_id, role, missing_rate, het_rate, nonparental_rate, qc_flags, token_profile, crop` (docs/data-formats.md, "QC CSV").

- Rates are written with six decimals; NaN is written as `NA`. `missing_rate` reproduces PLINK's `F_MISS`, and `het_rate` is 1 − `O(HOM)`/`N(NM)` over called markers.
- `qc_flags` joins the sample's flags with `|`, as progeny-selector's results.csv does (its pipeline.py), and is an empty cell when there is none. The `;` in the evidence gathered for the decision was a proposal, not either tool's practice.
- Dataset-level flags (`parents_identical`, `low_marker_call_rate`) stay in the HTML report; they are not per-sample facts.
- The BrAPI ids and the provenance columns follow the rule every export follows (docs/data-formats.md, "Outputs").

Written by `qcCsv` in src/export/qc-csv.ts, from the Export screen ("Download QC CSV", `backcross-qc.csv`) and the CLI subcommand `qc`, which takes no option of its own. The table needs only the QcReport's per-sample rows and the sample records, not the genotype matrix, so it is serialised on the main thread from the `qc` result the worker already returns; no new worker request is added. The Export screen uses the QC thresholds of the Upload screen; the CLI uses the defaults, and computes the RPP that `computeQc` needs at the default coverage caps, which no QC flag depends on.

### Consequences

- Good: sample QC can be filtered and joined by `sample_id` in R; scripts/read_exports.R reads `qc.csv` with explicit column types, and the CI r-reader job reads the CLI's output.
- Good: `qc_flags` has the same name and separator in both tools.
- Neutral: an additive output; the five existing tables are unchanged.
- Bad: the CLI's QC thresholds are not configurable, so a CLI `qc.csv` can differ from a browser one made with edited thresholds.

## More Information

The decision record is the maintainer-delegated decisions of 2026-09-27 (Q-E1). Tests: tests/qc-csv.test.ts, tests/cli-qc.test.ts, and the header and id checks in tests/export-ids.test.ts.
