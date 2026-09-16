# Vendor chunks through Rolldown's `codeSplitting`, and the bundle check

Status: accepted. Date: 2026-09-16. Format: MADR 4.0.0 [web] https://adr.github.io/madr/.

## Context and Problem Statement

ADR 0010 raised `build.chunkSizeWarningLimit` to 600 kB rather than split the chunk, because the split "improves neither download size nor time to interactive" and its only benefit, cache reuse across deploys, is weak. That is still true. But with one chunk, the warning threshold measures React Aria's size rather than this repository's own code, and 0010 itself called the raised threshold "a setting that someone could raise again without thinking". Should dependencies move into their own chunk so the default threshold measures this repository's code again?

## Decision Drivers

The threshold should measure what this repository adds, not the dependency it happens to have picked up. Whatever change is made should not introduce the side-effect-ordering risk 0010 raised against `manualChunks`.

## Considered Options

1. Leave the threshold raised, as 0010 decided.
2. Split `node_modules` into vendor chunks with Rolldown's `output.codeSplitting` groups, and restore the default 500 kB threshold.
3. Lazy-load the two screens that import React Aria (0010's option 3).

## Decision Outcome

Option 2.

**D3.1**: split `node_modules` into two vendor chunks with Rolldown's `output.codeSplitting` groups, and delete `build.chunkSizeWarningLimit` so Vite's default 500 kB warning is the threshold again. With the dependencies in their own chunks, the entry chunk holds this repository's code alone (roughly 100 kB today: the 249.83 kB pre-React-Aria main chunk minus React and ReactDOM), Vite's default threshold is back in force, and it now measures what this repository adds. Lazy screens (0010's option 3) stay deferred with the same reasoning 0010 gives; nothing here prevents them later.

**D3.2**: the option used is `build.rolldownOptions.output.codeSplitting.groups`, not `manualChunks`. Vite 8.2.2 bundles with Rolldown 1.2.7 (installed); `build.rollupOptions` "is an alias of `build.rolldownOptions`" [web] https://vite.dev/config/build-options; Rolldown's types say `manualChunks` "will be ignored" when `codeSplitting` is set and `advancedChunks` is deprecated in favour of `codeSplitting` (`node_modules/rolldown/dist/shared/define-config-*.d.mts`, `codeSplitting?: boolean | CodeSplittingOptions`, group fields `name`, `test`, `priority`; "it's recommended to use `[\\/]` to match the path separator").

**D3.3**: side-effect order is not a risk for these groups. ADR 0010 quoted Rollup's warning that a shared chunk "can change the behaviour of the application if side effects are triggered before the corresponding modules are actually used". The entry imports React, ReactDOM and React Aria before any app module runs (`src/main.tsx`), so every vendor side effect already precedes app code; the groups reproduce that order.

**D3.4**: a bundle check with fixed byte limits runs inside `npm run build`. No node test runs after a build, so the acceptance is a script (`scripts/check-bundle.mjs`) in the build gate and therefore in CI's `check` job. The build emits three app chunks, the worker, and Rolldown's small runtime chunk (`rolldown-runtime-*.js`, its shared `__esModule`-interop helpers, hoisted into its own chunk by code splitting rather than inlined as it was in the single-chunk build); the check permits at most one, up to 16,384 B.

**D3.5**: no claim about cache reuse is recorded until measured. Measured this session: `curl -sI` on the deployed site's `assets/index-CyGRy1Dt.js` (the pre-split build, `ENABLE_PAGES` is on) returned `Cache-Control: max-age=600`.

### Consequences

Good: the default threshold measures app code again; a failing build is louder than a warning that can be raised without thinking.

Bad: the page now loads three scripts on first visit instead of one; three chunks to reason about instead of one; the check's limits (`entryBytes`, `chunkBytes`) are settings too, though a failing build is a stronger signal than a warning.

**Revisit when** a screen-only dependency arrives (a plotting library for Compare, for example) and trips a chunk's limit. That is the point at which lazy screens (0010's option 3), `LineTableScreen` and `GenotypeViewScreen` in `src/App.tsx`, earn their fallback and test cost.
