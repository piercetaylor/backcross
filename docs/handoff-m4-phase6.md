# Handoff: M4 phase 6, the crop schemes

Written 2026-09-21, after phases 1 to 5 of `docs/m4-phases.md` were committed and pushed.

## Where things stand

Five of the six M4 phases are done, each committed in this repository, gates re-run in the main
session before every commit, and CI green on the pushed commit.

| Phase             | Commit    | What it did                                                                                          |
| ----------------- | --------- | ---------------------------------------------------------------------------------------------------- |
| 1, virtualisation | `0847003` | The canvas and gutter draw only the rows in view; the overview bins lines by column majority         |
| 3, vendor chunks  | `0ce4587` | `vendor-react`, `vendor` and a runtime chunk, checked by `scripts/check-bundle.mjs` inside the build |
| (rename)          | `8473292` | Isoline Browser became Backcross, crop palette, demo data, contract 1.2.1 (ADR 0017)                 |
| 2, target size    | `fea4bf7` | A 24 px row pitch, gutter buttons filling it, axe's `target-size` under `wcag22aa`                   |
| 4, contract 1.3.0 | `db7b34f` | Blank lines, `#` rows as data, RFC 4180 quoting in one linear pass (ADR 0018)                        |
| 5, contract 1.4.0 | `a951911` | Token profiles under `contract/profiles/`, `token_profile` on every export (ADR 0019)                |

`progeny-selector` carries the mirrored halves; `node scripts/check-contract-mirror.mjs
../progeny-selector` reports 200 files identical at the time of writing.

## What is left

1. **Phase 6, contract 1.5.0, the crop schemes.** The specification is `docs/m4-phases.md`
   lines 587 to 683, with the sibling half S6 at 673 to 683. Nine schemes (soybean the default,
   reproducing 1.2.0 behaviour, then maize, rice, sorghum, wheat, barley, oat, common bean and
   cotton), each an ordered canonical list plus one alias regular expression; the `lg` prefix stays
   soybean-only; cowpea, pea, sunflower and peanut are deferred as ambiguous; every CSV export
   gains a trailing `crop` column. Renumber the ADR the specification calls 0019: that number is
   taken by the token profiles, so the crop schemes are 0020 here and the next free number in
   `progeny-selector`.
2. **The M4 verification block in `PLAN.md`**, in the shape of M3's. `docs/m4-phases.md` section 9
   (line 684 onward) says what it must record. It needs runs the phases did not take:
   `npm run test:bench` in both browsers, before-and-after first-draw and memory figures, and
   `npm run a11y:lighthouse`. Phase 1's agent measured 13.8 s and 12.6 s to first draw on a loaded
   machine against M3's 10.5 s and 8.5 s, and could not attribute the difference; take fresh
   figures on a quiet machine rather than copying those.
3. **The local folder is still `isoline-browser`.** The GitHub repository, the package, the Pages
   base path and the documentation all say `backcross`. Rename the folder from a session that is
   not inside it, then fix the absolute paths in `.claude/settings.json` (three hook commands) and
   in `progeny-selector/docs/data-formats.md`, which already points at `../backcross`.

## Open questions for the maintainer

- **Export file names** still begin with `isoline-` (`isoline-summary.csv`, `isoline-report.html`
  and the rest). Renaming them changes a documented output format, which `CLAUDE.md` says to ask
  about first.
- **The crop palette's leaf green and wheat gold** are close in hue to two Okabe-Ito class colours.
  No chrome colour is used inside the genotype view or its legend, so nothing is ambiguous today;
  ADR 0017 records it.

## How the work was done, and what it cost

The cadence that worked: a Fable planner writes the phase specification, an implementer takes one
phase with `sed -n` line ranges, a Fable reviewer attacks the diff of a core or contract phase, the
implementer takes the findings back through `SendMessage`, and the main session re-runs every gate
before committing. Implementers run no git commands.

Both contract phases were worth reviewing. On 1.3.0 the reviewer found that a stray `"` in a CSV
(an inch mark in `6" pot`) made this repository silently drop every row after it while
`progeny-selector` read them all, and that the same input was quadratic. On 1.4.0 it found that a
wide CSV detected as coded under a nucleotide profile silently ignored the profile and still
recorded it in the exports. Neither had a failing test before the review.

Gate notes: browser tests need `CI=true` or a headed Firefox window loses focus; the sibling's
pytest summary line needs `-o addopts="-m 'not e2e'"` to appear; `npm run build` now fails on an
unexpected chunk, so a new dependency may need `scripts/check-bundle.mjs` updating.
