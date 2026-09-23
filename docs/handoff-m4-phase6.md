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

1. ~~**Phase 6, contract 1.5.0, the crop schemes.**~~ Done 2026-09-22 at `d4ad0e8`, with the S6
   corrections at `0d306ba` and `33245c0`: nine schemes, the `lg` prefix soybean-only, a trailing
   `crop` column on every CSV export, recorded as `docs/adr/0020` here and in `progeny-selector`
   as the renumbering below required.
2. ~~**The M4 verification block in `PLAN.md`**.~~ Done 2026-09-22 at `68eed50`: the block is
   appended to `PLAN.md` in M3's shape, with fresh bench figures on a quiet machine (first draw
   4.9 s in Chromium and 6.2 s in Firefox, against M3's 10.5 s and 8.5 s; Chromium memory 1.33 x
   the inflated file, against 1.67 x), Lighthouse 100, `contract 1.5.0: 68 cases` and 245 mirrored
   files. Phase 1's figures were not copied. CLAUDE.md's State paragraph names M4 complete.
3. ~~**The local folder is still `isoline-browser`**.~~ Done 2026-09-23: the folder is now
   `backcross`, beside `progeny-selector`. The rename needed a session whose working directory was
   outside it; with one inside, Windows refuses to rename the root while every subdirectory renames
   freely. `.claude/settings.json` carried four hook commands, not the three counted here
   (SessionStart, PreToolUse Read, PreToolUse Skill|Agent, Stop), and `.claude/` is gitignored, so
   that edit is local. `progeny-selector/docs/data-formats.md` already said `../backcross`; what
   did point at the old folder was that repository's `CLAUDE.md` and `PLAN.md`.

## Open questions for the maintainer

- ~~**Export file names** still begin with `isoline-`.~~ Answered 2026-09-22: they now begin
  `backcross-` (`backcross-summary.csv`, `backcross-report.html` and the rest). The names live only
  in `src/ui/screens/ExportScreen.tsx`; the contract, its mirror and `docs/data-formats.md` name no
  download, so `contract/VERSION` did not move. Recorded as an amendment to ADR 0017, which keeps
  0020 free for the crop schemes. The synthetic VCF's `##source` header was thought to still say
  `isoline-browser`; checked 2026-09-23, it says `backcross` and has since `8473292`, and
  `npm run fixture` reproduces the committed files, so there was nothing to decide.
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
