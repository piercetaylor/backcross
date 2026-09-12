# Browser-mode tests: Vitest with Playwright on Chromium and Firefox

Status: accepted. Date: 2026-09-12. Format: MADR 4.0.0 [web] https://adr.github.io/madr/.

## Context and Problem Statement

Until M3 every test ran with `environment: 'node'`. M2.5 asserted the Lines grid, the density control and the genotype screen from server-rendered markup and arithmetic, and said in each module's header what that could not show: the APG grid keyboard pattern, a row's rendered height, whether the gutter lines up with the canvas rows, and the fallbacks in `src/ui/canvas/read-theme.ts`, which need `getComputedStyle`. M3 also needs a figure for loading 50,000 markers by 200 lines through the real application, with a memory bound from phase 2. How should the application be tested in a browser?

## Decision Drivers

The tests must drive the real application, including its Web Worker, through its real file inputs; they must run in the same toolchain as the node tests, so one config and one assertion library; and they must cover more than one engine, since the maintainer's users open the tool in whatever browser they have. The memory figure must include the worker, because the worker owns the genotype matrix (ADR 0001).

## Considered Options

1. Vitest browser mode with the Playwright provider, Chromium and Firefox.
2. jsdom or happy-dom under Vitest.
3. Playwright Test as a second runner against `vite preview`.

## Decision Outcome

Option 1, as the maintainer decided on 2026-09-12. jsdom has no layout, no canvas and no workers, so it cannot answer any of the questions above. Playwright Test could, but it would be a second runner with its own assertions and config, and it cannot import a module into the page the way `tests/browser/theme-tokens.test.tsx` imports `read-theme.ts`.

Three Vitest projects share `vite.config.ts`. `node` is every existing test and is what `npm test` runs. `browser` (`tests/browser/`) runs per commit through `npm run test:browser`. `bench` (`tests/bench/`) runs the 50K x 200 load per milestone through `npm run test:bench`, one browser at a time, because two browsers loading it side by side time each other. CI runs both browser projects in a `browser` job after `check`, headless, with the bench's time budget loosened to a hang guard (docs/m3-phases.md, Q5).

Memory is measured with `performance.measureUserAgentSpecificMemory()`, which counts dedicated workers, in Chromium only. It requires cross-origin isolation, so the two browser projects serve COOP `same-origin` and COEP `require-corp`; GitHub Pages cannot send those headers, so the measurement is test-only. `tests/browser/isolation-probe.test.ts` checked on 2026-09-12 that Vitest's tester iframe loads under those headers and the call resolves. Playwright's default headless Chromium is a separate "headless shell" build that rejects the call with a `SecurityError` even when isolated, so the Chromium instance launches the full browser (`launchOptions: { channel: 'chromium' }`), which resolves it headed and headless alike. The CDP heap-size fallback that docs/m3-phases.md held in reserve is therefore not built. Firefox has no equivalent API and gets the accounting assertion of phase 2 only.

### Consequences

Good: every M2.5 claim that was "not verifiable here" for want of a browser now has a test, in two engines, in the runner the repository already uses.

Bad: `npm run test:browser` needs Playwright's browsers installed once per machine, and a browser run takes tens of seconds where the node project takes a few. Locally the tests open headed windows, as Vitest's default is headless only under `CI`; in a headed window on the maintainer's laptop, Playwright's clicks on the collapsed rail's steps did not reach the page, so the test harness navigates the rail by its keyboard contract instead. Memory is a Chromium figure; a Firefox regression in memory would be seen only through phase 2's accounting.

**Revisit when** Firefox ships a whole-process memory API, or when Vitest's browser mode stops supporting the Playwright provider.
