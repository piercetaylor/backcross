# Streaming load: the genotype File is read and inflated chunk by chunk inside the worker

Status: accepted. Date: 2026-09-12. Format: MADR 4.0.0 [web] https://adr.github.io/madr/.

## Context and Problem Statement

Until M3 the Upload screen read the whole genotype file into an `ArrayBuffer` on the main thread and transferred it to the worker, which inflated it to one `Uint8Array`, decoded that to one string and split the string line by line. At 50,000 markers by 200 lines the compressed buffer, the inflated bytes, the decoded text and the per-line split arrays were all reachable at once. PLAN.md asks that a large file load with memory under twice the file size. How should the genotype file reach the parser, and against what is "twice the file size" measured?

## Decision Drivers

The worker owns the genotype matrix and never sends it back (ADR 0001), so parsing stays in the worker. No new dependency. bgzip is the format large VCFs arrive in, and it is a concatenation of gzip members closed by a 28-byte empty member. The bound must be measurable in a test, including the worker's memory.

## Considered Options

1. Hand the `File` to the worker and stream it: `Blob.stream()`, fflate inflating gzip members one at a time with their trailers verified, a streaming `TextDecoder`, and a line-at-a-time VCF parser.
2. The same, inflating with the platform's `DecompressionStream('gzip')`.
3. Keep the whole-buffer path and reduce copies within it.

## Decision Outcome

Option 1. The `File` is posted to the worker as-is; a `File` is structured-cloneable, not transferable, and is cloned by reference to the same underlying data. The worker reads it with `blob.stream().getReader()` (`src/io/stream.ts`), inflates it chunk by chunk through `GzipReader` (`inflateIfGzip`, `src/io/decompress.ts`), counts the inflated bytes, splits lines with `TextDecoder` in streaming mode, detects the format on a head window of up to 4,096 characters with the same `detectGenotypeFormat` the whole-text path calls, and pushes each line into `VcfLineParser` (`src/io/vcf.ts`), which writes into the same `GenotypeBuilder` as before. The inflated text is never held. HapMap and wide CSV are still collected to text and parsed as before; they are not the large-file case. The CLI reads through the same entry, `parseGenotypesSource`, from a Node read stream.

Option 2 is rejected: the Compression Streams specification allows a gzip stream only one member and makes trailing data a `TypeError` [web] https://compression.spec.whatwg.org/, so it cannot inflate bgzip. fflate's streaming `Gunzip` continues into the next member when one ends with input remaining (fflate 0.8.0 CHANGELOG), but on its own it is not enough: it checks neither the CRC32 nor the ISIZE trailer of any member, so a flipped trailer bit or a corrupted deflate block that still decodes yields wrong genotypes silently, and it ends cleanly at any member boundary, so a BGZF file cut between blocks loads as a shorter dataset with no error. `GzipReader` therefore frames and verifies members itself. When the first member carries the BGZF `BC` subfield, every member is framed exactly by its BSIZE (at most 64 KiB), its raw deflate data inflated with fflate's `inflateSync`, and its output checked against CRC32 and ISIZE; every member must carry `BC`, and the stream must end with the 28-byte BGZF end-of-file block, byte for byte as htslib checks it, or it is rejected as truncated. Otherwise the stream is plain gzip: `Gunzip` inflates, its public `onmember` handler delimits members, and each member's running CRC32 and length are checked against the 8 bytes before the next member's offset, and the last member's against the last 8 bytes of the stream. Every error names the failing member's compressed byte offset, and the synchronous `gunzipAll` uses the same reader. Two limits remain in plain gzip: a stream cut inside a trailer cannot be told apart from corruption through `Gunzip`'s public interface, so it fails the trailer check with a message naming both causes, and a stream cut exactly between two members is a valid shorter gzip file, which the format cannot distinguish. `tests/stream.test.ts` covers valid, corrupted-CRC32, wrong-ISIZE, corrupted-deflate, missing-EOF-block and cut-mid-member streams, BGZF and plain, fed in 1-, 7- and 65,536-byte chunks and in one push. Option 3 cannot meet the bound: the decoded text alone is about the size of the inflated bytes.

"Under twice the file size" is defined against **inflated** bytes (`bytesInflated`), as the maintainer settled on 2026-09-12 (docs/m3-phases.md, Q1): against the compressed size the bound is unsatisfiable, since the two allele arrays alone are 2 bytes per call and a bgzipped GT column is a fraction of that. The worker's `loaded` result reports `bytesInflated`, `peakBuilderBytes` (the builder's own peak allele-array accounting, counting both the old and new arrays during a growth step and the capacity plus the final slices at `finish`) and `residentMatrixBytes` (the assembled dataset's `allele1` plus `allele2`). `tests/bench/load-50k-200.test.tsx` asserts `peakBuilderBytes + residentMatrixBytes < 2 × bytesInflated` in Chromium and Firefox, and in Chromium also that the `performance.measureUserAgentSpecificMemory()` delta across the load, which includes the worker, is under the same bound (ADR 0011).

The worker's message handler became asynchronous. Requests are queued and handled one at a time in arrival order, so a request posted during a load cannot observe a half-replaced dataset.

### Consequences

Good: the main thread never reads the genotype file; the worker never holds the compressed or the inflated file whole; the 50K × 200 bench records its memory against a stated bound in both browsers.

Bad: the bound is an accounting figure outside Chromium, and `peakBuilderBytes` counts what the code keeps reachable, not what the collector has freed. The Chromium figure is a delta measured after the load, and neither figure measures the decompressor's transient buffers (one BGZF member, or up to 1 MiB of retained compressed bytes for plain gzip, plus fflate's own working arrays). Verifying every member costs a CRC32 pass over the inflated bytes. For a CRLF file the head window used for format detection can reach a few characters further in the stream path than in the whole-text path, because line splitting strips the `\r`s; only a header straddling character 4,096 could be detected differently. That the `File` clone is a reference rather than a byte copy is not observable from script; the Chromium memory assertion is the check.

**Revisit when** a text format other than VCF is expected at 50K × 200 scale, or when the Chromium memory delta approaches the bound; the lever named in docs/m3-phases.md is the builder's growth factor.
