# Genotype storage as two unordered allele-index Uint8Arrays per dataset

Status: accepted. Date: 2026-09-04.

## Context and Problem Statement

Calls arrive as VCF allele indices, HapMap nucleotides and A/B/H codes, must be classified against two parents, and must fit in browser memory for 50K markers × hundreds of samples. How are calls stored in memory?

## Considered Options

1. Strings per cell ("A/T").
2. One byte per cell encoding the parent-of-origin class directly at parse time.
3. Two Uint8Array allele indices per cell (`allele1 <= allele2`, 255 = missing) indexing a per-marker allele table, with classification as a separate pass.

## Decision Outcome

Option 3 (src/core/types.ts, src/io/builder.ts). Cell index is `m * nSamples + s`. The layout is format-neutral, keeps raw alleles available for the "all markers" comparison mode and for nonparental detection, supports multiallelic markers, and costs 2 bytes per call (50K × 500 samples = 50 MB). Classification into classes (1 byte per candidate call) is a second pass so parents can be changed without re-parsing.

### Consequences

Good: parsers are simple and share one builder; typed arrays transfer to and from the worker without copying; classification is a tight loop. Bad: allele tables are per marker (string arrays), which is the one non-typed structure; more than 254 alleles at a marker is unsupported (not a realistic case for SNPs). Neutral: phase is discarded by ordering the pair.
