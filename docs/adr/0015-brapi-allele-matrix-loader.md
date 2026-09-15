# BrAPI allele-matrix loader: fetch inside the worker through GenotypeBuilder, call-set names as sample ids, call-set ids in every export

Status: accepted. Date: 2026-09-15. Format: MADR 4.0.0 [web] https://adr.github.io/madr/.

## Context and Problem Statement

PLAN.md names BrAPI Genotyping as the second source of genotypes after files. A breeding programme that keeps its SNP data in Gigwa, Germinate or Breedbase should not have to export a VCF to characterise its near-isogenic lines. The worker owns the genotype matrix and never sends it back (ADR 0001). Contracts 1.1.0 and 1.2.0 (ADR 0014) fixed how cells and positions are read from files, but a BrAPI server delivers neither as file text. How does a BrAPI variant set become the same `Dataset` a file produces? Which id names each sample? And how does an exported row lead back to the server record it came from?

## Decision Drivers

No genotype on the main thread. One `Dataset` for every source, so every analysis, screen and exporter stays unaware of where the data came from. `samples.csv` still declares the recurrent and donor parents. Sample ids must survive a rename on the server. No real genotype data in the repository. The public test server, test-server.brapi.org, returns null positions and bases for some variants.

## Considered Options

1. Fetch on the main thread and transfer the pages to the worker.
2. Fetch inside the worker and push each variant and call into the existing `GenotypeBuilder`.
3. A server-side proxy that converts BrAPI to VCF.

For the sample id: `callSetName`; `callSetDbId`; `sampleDbId`; or `callSetName` when unique, else `callSetDbId`. For test data: recorded real responses, or synthetic pages generated alongside the synthetic fixture. For positions: `start + 1` only, or `start + 1` with a markers.csv fallback.

## Decision Outcome

Option 2. `src/io/brapi.ts` is the only module that calls `fetch`, and only the worker calls it. It pages `/callsets`, `/variants` and `/allelematrix` (GT only) for one variant set, joins the matrix to variants and call sets by their DbIds, and pushes into `GenotypeBuilder`. The result then goes through the same `assembleDataset` that files use, so `samples.csv` roles, markers.csv and every downstream check apply unchanged. Option 1 would put every genotype page on the main thread, which ADR 0001 forbids. Option 3 needs a server this client-only app does not have (ADR 0003).

1. **Positions** are BrAPI's 0-based `start` plus 1. A variant with no `referenceName` or `start` takes its chromosome and position from markers.csv, which is read with the 1.2.0 grammar. With no markers.csv entry either, the load fails with an error naming the marker. A non-integer `start` is an error.
2. **Marker id** is `variantNames` when it is a non-empty string, or its first non-empty entry when it is an array; a name of `.` counts as absent. Otherwise it is `variantDbId`. Gigwa and Germinate put the VCF ID or marker name in `variantNames` and an opaque key in `variantDbId`, and markers.csv is keyed by the marker name.
3. **Calls.** GT tokens are allele indices parsed by `parseBrapiCall`, never by the nucleotide vocabulary in `src/io/calls.ts`. `/` and `|` are separators, the server's `unknownString` means missing, a half-missing call reads as missing, and a haploid token reads as homozygous, as in VCF. Diploid calls only, and an index of 255 or more is an error. Allele symbols come from `referenceBases` and `alternateBases`; where the bases are absent, the symbols are the index strings.
4. **Sample id** is the trimmed `callSetName` when it is non-empty and unique in the variant set, else `callSetDbId`, with one warning per shared name. If the resulting ids still collide, the load fails. Replicate call sets stay separate samples. `callSetDbId` and `sampleDbId` are carried on each `SampleRecord`.
5. **Traceability.** Every CSV export gains `call_set_db_id` and `sample_db_id` immediately after its sample id column (`_a`/`_b` pairs in the pairwise tables). The cells are written bare-empty for a file-loaded dataset. The HTML report shows the two columns only for a BrAPI dataset and always shows a Source row. A call-set table, `brapi-callsets.csv` with columns `sample_id,call_set_name,call_set_db_id,sample_db_id`, can be downloaded from the Upload screen before loading, because `samples.csv` is needed to load and is built from it.
6. **Paging.** `/callsets` and `/allelematrix` page by number. `/variants` follows `nextPageToken` when the server gives one, otherwise it sends the page number as both `page` and `pageToken`. On 2026-09-15 test-server.brapi.org ignored `page` on `/variants` and returned page 0 again, honoured `pageToken=<page number>`, and returned an empty `nextPageToken`. A page that repeats an earlier one is an error, not a silent duplicate. So are repeated ids within `/variants`, `/callsets` or a matrix page, because a repeated call-set id in a matrix page would otherwise merge two call sets into one sample.
7. **Transport.** An optional bearer token is sent in the `Authorization` header only; it never appears in a URL, error, warning, result, report or recording. A base URL carrying a user name or password is rejected. Each request times out after 60 s. A load can be cancelled through an out-of-band worker message, because the worker queues ordinary requests (ADR 0012). A network failure and a CORS refusal cannot be told apart, so the error names both causes.
8. **Test data.** The BrAPI fixture under `tests/fixtures/brapi/` is generated by `scripts/make-fixture.mjs` from the synthetic dataset, stays under 64 KB, and covers unphased, phased, half-missing and multi-allelic tokens. The acceptance test compares a BrAPI load against the VCF load of the same data through `tests/support/normalise.ts`. `scripts/brapi-record.mjs` records real test-server responses into the gitignored `data/brapi-recorded/`. Its output was used to check the fixture's field names and to find the `/variants` paging behaviour; no test or CI job calls the network.

**Who decided.** Decision 1 of `docs/handoff-m3-phases-4-5.md` was taken by the maintainer on 2026-09-14: the sample-id rule, the call-set table and the ids in every export. On 2026-09-15 the maintainer delegated seven detail questions to research by Fable: column placement, the empty value, the report, the call-set table's columns and timing, the marker id, cancel, and the recorder token. The criterion was what best serves academic and open-source plant-breeding users: reproducible with standard tools, tolerant of spreadsheet, pandas and R exports, never silently wrong. The research checked the BrAPI v2.1 Variant schema, Gigwa's `Mgdb2BrapiV2Impl`, `germinate-brapi`, Breedbase's `CXGN/BrAPI/v2/Variants.pm`, QBMS, the readr, data.table and pandas reader defaults, and test-server.brapi.org, where `variantNames` was confirmed to be an array. The questions and answers are in `docs/m3-phase4-brapi.md`, section B.

### Consequences

Good:

- A BrAPI variant set becomes the same `Dataset` as a file.
- No genotype reaches the main thread.
- Every exported row leads back to server ids.
- The data contract is unchanged; outputs are documented in `docs/data-formats.md`.

Bad:

- The server must allow this app's origin through CORS, which the app cannot work around.
- Gigwa names call sets with numeric strings, so its sample ids are opaque until `samples.csv` maps them to line names.
- Every CSV gains two columns, so readers that pick columns by position must be updated.
- The paging rule for `/variants` is built on one server's behaviour; a server that ignores both `page` and `pageToken` fails with the repeated-page error instead of loading.

**Revisit when** naming through `/samples` or `/germplasm` is needed, a server requires an authentication scheme other than a bearer token, or a variant set is too large to page within one worker request.
