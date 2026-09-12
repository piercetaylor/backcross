# Bundle size: raise the warning threshold to 600 kB, do not split the chunk

Status: accepted. Date: 2026-09-12. Format: MADR 4.0.0 [web] https://adr.github.io/madr/.

## Context and Problem Statement

M2.5 added `react-aria-components`, which took the main chunk from 249.83 kB to 533.84 kB minified (165.18 kB gzipped) and made Vite print its "chunks are larger than 500 kB" warning. ADR 0009 accepted the dependency and cited a 244 kB bundle as a driver without saying what the dependency would cost. Should the chunk be split, or the warning addressed another way?

## Decision Drivers

The tool is static, client-only and opened by breeders who load files and then work for an extended session; it is not a casually visited page. Upload is the landing screen, and Lines and Graphical genotypes, the two screens that import React Aria, are where users go next. The decision should rest on what changes for the user, not on the presence of a warning.

## Considered Options

1. Raise `build.chunkSizeWarningLimit`.
2. Split React and React Aria into a vendor chunk with `manualChunks`.
3. Lazy-load the two screens that import React Aria, with `React.lazy` and dynamic `import()`.
4. Change nothing.

## Decision Outcome

Option 1, set to 600 kB: just above the current 534 kB, so the warning is recalibrated rather than silenced.

The threshold is compared against the uncompressed chunk because "the JavaScript size itself is related to the execution time" [web] https://vite.dev/config/build-options. It is a proxy for parse and execute cost. For this chunk that cost is tens of milliseconds on a laptop, paid once at the start of a session, and the transfer is 165 kB gzipped. No quantity a user experiences changed materially.

Option 2 was rejected. `manualChunks` creates shared chunks and "can change the behaviour of the application if side effects are triggered before the corresponding modules are actually used" [web] https://rollupjs.org/configuration-options/#output-manualchunks. It would deliver the same bytes in two requests on a first visit, so it improves neither download size nor time to interactive; its only benefit is cache reuse across deploys, and a React Aria upgrade would invalidate the vendor chunk anyway. On Vite 8, which bundles with Rolldown, `build.rollupOptions` is also a deprecated alias of `build.rolldownOptions`.

Option 3 is deferred, not rejected. A lazy component does not load until it is first rendered and suspends behind a fallback while it does [web] https://react.dev/reference/react/lazy, so it would genuinely keep React Aria off the landing screen, and it is the only option that reduces rather than moves the threshold. But users reach those screens straight after upload, so the saving is tens of milliseconds on a screen nobody waits on, paid for with a visible fallback on the first real navigation and a Suspense boundary that no current test exercises, since the tests render screens directly with `renderToString`.

### Consequences

Good: no added complexity, no behavioural risk, and the warning remains a live signal.

Bad: a threshold is now a setting that someone could raise again without thinking. The margin is deliberately small for that reason.

**Revisit when** the next per-screen dependency trips the 600 kB limit, a plotting library for Compare for example. That is the point at which option 3, lazy `LineTableScreen` and `GenotypeViewScreen` in `src/App.tsx`, earns its fallback and test cost, and this record should be superseded rather than the number raised.
