# Rename to Backcross, crop palette, demo data

Status: accepted. Date: 2026-09-16. Format: MADR 4.0.0 [web] https://adr.github.io/madr/.

## Context and Problem Statement

The tool is being shared with academic and open-source plant breeders. Three things stood in the way. The name "Isoline Browser" described the first use case rather than the work the tool supports, which is the backcross program as a whole. The interface followed ADR 0009's hueless chrome, which reads as unfinished to a first-time visitor. And a visitor with no genotype file of their own had nothing to load, so the only way to see the tool work was to clone the repository and pick the fixture files by hand.

What should the tool be called, how much colour may the chrome carry, and how does a visitor try it without data?

## Decision Drivers

The maintainer decided all three on 2026-09-16. Recorded history keeps the old name. ADR 0007's class palette and everything drawn inside the genotype canvas stay as they are. Every text and background pair must meet WCAG AA, and the axe browser tests must stay green. Nothing but generated data may be served. CLAUDE.md says only the worker calls `fetch`.

## Decision Outcome

**The tool is Backcross; the repository slug is `backcross`.** It was called Isoline Browser before 2026-09-16. The package name, page title, rail heading, report title and footer, Pages base path (`/backcross/`), README, working notes and repository links now use the new name. ADRs 0001 to 0016, the phase and handoff documents, existing CHANGELOG entries and PLAN.md's verification blocks keep the old name, because they record what was true when they were written. The data contract's README and specification name the repository, so the contract goes to 1.2.1, a patch release that changes wording only, and is mirrored into progeny-selector. The synthetic VCF's `##source` header, written by `scripts/make-fixture.mjs`, still says `isoline-browser`: changing it would regenerate the committed fixture, so it is left for a separate decision. Export file names (`isoline-summary.csv`, `isoline-report.html` and so on) are an output format and are also left unchanged.

**The chrome carries a crop palette** (amending ADR 0009's "Chrome carries no hue"). Nine `--crop-*` tokens in `src/ui/tokens.css` define the palette. Leaf green (`#2f6b3b`, `#255a30`, `#1b4424`, and the tint `#e3eedc`) colours the primary button, links, the brand mark, the rail's current-step marker and the focus ring. Soil brown (`#2e2419`, `#5b4a39`) colours body and secondary text. Parchment (`#fbf8f1`, `#f3ecdc`) colours the page, the rail, the alert and the Upload screen's intro band. Wheat gold (`#c99a2e`) is used only for the intro band's edge and the seed in the mark. Only the role aliases change. The twelve-step neutral ramp stays grey. The canvas label, legend swatch border and canvas overlays keep their neutral tokens, and nothing inside the genotype canvas reads a crop token. None of the nine is an Okabe-Ito member. Wheat gold measures 2.43:1 on the page and 2.19:1 on the band, below 3:1, so it never carries text, state or focus. The measured ratios, all re-derived by `tests/tokens.test.ts`, are listed below:

| Pair                                                         | Ratio               |
| ------------------------------------------------------------ | ------------------- |
| text `#2e2419` on page `#fbf8f1` / band `#f3ecdc`            | 14.32 / 12.91       |
| secondary text `#5b4a39` on page / band                      | 7.97 / 7.18         |
| link `#255a30` on page / band                                | 7.66 / 6.91         |
| white on primary `#2f6b3b` / hovered `#255a30`               | 6.39 / 8.13         |
| primary `#2f6b3b` on page / band                             | 6.02 / 5.43         |
| focus ring `#1b4424` on page / band / rail-current `#e3eedc` | 10.43 / 9.40 / 9.23 |
| alert `#a4161a` on page / band                               | 7.31 / 6.59         |

The palette is a set of warm neutrals with one green and a gold edge, which keeps it restrained. The mark is a single leaf over a seed, set beside the heading text and hidden from assistive technology. The same drawing is used as `public/favicon.svg`. There is no dark set, because tokens.css had none.

**The synthetic fixture is served as a demo, and the worker fetches it.** At build time, a Vite plugin in `vite.config.ts` copies `tests/fixtures/synthetic/{genotypes.vcf,samples.csv,markers.csv}` into the site under `demo/synthetic/`, and the dev server serves the same three files, so no duplicate is committed. The Upload screen's intro band has a "Try the demo dataset" button, a "Copy link to this demo" button and a one-line note that the data are synthetic. Opening the page at `?demo=synthetic` loads the demo on arrival and goes to Summary. An unknown value shows an error in the app alert. The fetch is done in the worker because CLAUDE.md says only the worker calls `fetch`. The UI sends a new `loadDemo` request that carries the three URLs, resolved from `import.meta.env.BASE_URL`. The worker fetches them through the same `fetchImpl` the BrAPI loader uses, then passes the bytes to `loadFiles`, the function the `load` request runs. From parsing onward, a demo takes exactly the path that user-picked files take. `src/ui/demo.ts` reads the query parameter and builds the URLs and the share link; it fetches nothing.

### Consequences

Good: the name matches the work; a visitor can see every screen working from a single link; the chrome looks deliberate without touching the data encoding; every new colour pair has a test.

Bad: the palette brings back the collision risk ADR 0009 was written to avoid. Leaf green and Okabe-Ito's bluish green (`#009E73`), and wheat gold and Okabe-Ito's orange (`#E69F00`), are near each other in hue. The mitigation is that crop colours stay out of the canvas and legend, the gold never appears as a fill a reader must decode, and the greens are much darker than the data green. The worker now fetches files from the page's own origin as well as from a BrAPI server. A renamed repository relies on GitHub's redirect for existing links until they are updated.

Neutral: the demo loads the same committed fixture the tests use, so it changes whenever the generator changes.
