# VCF, HapMap and wide CSV inputs with a samples.csv manifest as the shared data contract

Status: accepted. Date: 2026-09-04.

## Context and Problem Statement

Genotype calls reach the program as VCF from sequencing or array pipelines, HapMap from TASSEL-based GBS, and spreadsheets exported from KASP or array software. The sibling progeny-selector project reads the same lines one generation earlier. Which formats are accepted, and how are parents and roles declared so that files move between the two tools unchanged?

## Decision Drivers

No reformatting by the user; explicit parent declaration (never infer the recurrent parent from REF); interoperability with the sibling project; support for coded A/B/H matrices that lack parent columns; validation at one boundary.

## Considered Options

1. VCF only.
2. VCF, HapMap and wide CSV, with roles in a separate samples.csv manifest.
3. A bespoke JSON project file.

## Decision Outcome

Option 2, specified in docs/data-formats.md and mirrored in the sibling repository. Roles, generation and family live in samples.csv; positions may be overridden by markers.csv (with cM). The VCF reader uses only CHROM, POS, ID, REF, ALT, FORMAT and GT [web] https://samtools.github.io/hts-specs/VCFv4.2.pdf; HapMap uses the 11 fixed columns [web] https://statgen-esalq.github.io/Hapmap-and-VCF-formats-and-its-integration-with-onemap/; wide CSV auto-detects nucleotide versus A/B/H coding.

### Consequences

Good: every file the program already has loads without editing; the manifest is a small file a breeder can write in a spreadsheet; the two tools share fixtures and contract tests. Bad: three parsers to maintain; format detection by content has edge cases (a `.txt` that is neither); coded input hides genotyping errors that nucleotide input would expose as nonparental alleles. Deferred: BrAPI allele-matrix loading (M3) and a second donor for pyramided lines (contract extension with `donor_parent_2`).
