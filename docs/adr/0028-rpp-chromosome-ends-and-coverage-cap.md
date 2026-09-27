# RPP chromosome ends and the coverage cap: a symmetric end rule, a soybean bp default, and the cap in the summary CSV

Status: accepted. Date: 2026-09-27. Format: MADR 4.0.0 [web] https://adr.github.io/madr/.

## Context and Problem Statement

ADR 0006 chose Flapjack-style coverage-capped weights for `rpp_bp` and `rpp_cm` and said the chromosome ends use "the distance to the end when a length is known, matching the Flapjack documentation", with the consequence that the estimates are "comparable with Flapjack output on the same data". The NIL comparison with progeny-selector (PLAN.md, 2026-09-26) found `rpp_bp` up to 0.0027 away from progeny-selector's `rpp_total` at the two tools' different default caps and 0.0016 at a common cap, the remainder coming from the chromosome ends. Two questions followed, delegated by the maintainer ("ask fable") and decided on 2026-09-27 for both tools:

- **Q-A.** What is the end rule, and does it agree with Flapjack?
- **Q-B.** What is the coverage-cap default without a map, and how does a reader of an export know which cap it was computed with?

## Decision Drivers

- Never silently wrong: a documented number must not claim an agreement it does not have, and a change of default must be visible in the file it changes.
- One rule in both tools, so backcross's `rpp_bp` and progeny-selector's `rpp_total` differ only where their inputs differ.
- A default must have a written derivation.

## Considered Options

For the ends:

1. **Copy Flapjack's ends** as its code computes them.
2. **The symmetric rule** ADR 0006 already describes and src/core/rpp.ts already implements.

For the bp default:

1. **2,000,000 bp**, the derivation ADR 0006 gives.
2. **4,000,000 bp**, progeny-selector's former default.

## Decision Outcome

**Chosen: the symmetric end rule, a 2,000,000 bp default beside 10 cM, and the resolved caps written into the per-line summary CSV.**

**What Flapjack actually does.** Flapjack's MABC analysis credits the first marker of a chromosome the full min(pos, c) on its outer side and the last marker min(mapLength − pos, c), where c is the maximum marker coverage; and when a map declares no chromosome length, `ChromosomeMap.sort()` sets `mapLength` to the last marker's position, so the last marker normally gets 0 on its outer side. The ends are asymmetric by accident of the length source, not by a rule worth copying. The Fable decision of 2026-09-27 reports verifying this reading against the source [web] https://raw.githubusercontent.com/cropgeeks/flapjack/master/src/jhi/flapjack/analysis/MabcAnalysis.java and [web] https://raw.githubusercontent.com/cropgeeks/flapjack/master/src/jhi/flapjack/data/ChromosomeMap.java. Flapjack's default cap is 10 map units (`Prefs.java`: `mabcMaxMrkrCoverage = 10.0d`), and its documentation gives only cM examples and no bp figure [web] https://flapjack.hutton.ac.uk/en/latest/mabc.html.

**The end rule (Q-A).** With c the maximum coverage, each marker is credited on each side:

- interior sides: min(d/2, c/2), d the distance to the adjacent called marker;
- the first marker's outer side: min(p, c/2), always, since coordinate 0 is always known;
- the last marker's outer side: min(max(L − p, 0), c/2) when an assembly length L is known, else c/2.

This is `weightedSums` in src/core/rpp.ts as it stands, so backcross's numbers do not change. progeny-selector adopts the same rule (its first marker got the full cap when no length was known; its ADR 0033). backcross passes no chromosome lengths to `computeRpp` until it has an assembly table (deferred to M5). The worker's `computeChromLengthsBp`, the largest marker position per chromosome, is for drawing and must not be passed to `computeRpp`: it would reproduce Flapjack's accidental zero credit for the last marker.

**The coverage cap (Q-B).** 10 cM with a map and 2,000,000 bp without, in both tools; progeny-selector's bp default moves from 4,000,000 to 2,000,000. 2 Mb is **a soybean euchromatic translation, not a Flapjack value**: 10 cM at about 197 kb per cM in soybean euchromatin (Schmutz et al. 2010 [web] https://www.nature.com/articles/nature08670), the derivation ADR 0006 records. 4 Mb had no written derivation. The kb-per-cM rate differs by crop and by region of the genome, so **a user of another crop should set the cap** (`maxGapBp` on the Upload screen, `VITE_DEFAULT_MAX_GAP_BP`, or `--max-gap-bp` on the CLI) from that crop's own rate, or supply markers.csv with cM and read `rpp_cm`.

**The cap in the file.** The per-line summary CSV gains `max_gap_bp` and `max_gap_cm`, after the per-chromosome `rpp_count_<chrom>` columns and before `token_profile`, holding the resolved caps the weighted estimators were computed with, in the browser export and the CLI alike (docs/data-formats.md, "Per-line summary CSV"). They are written as given (`2000000`, `10`). progeny-selector's results.csv gains the matching `background_max_coverage`. Without these columns a file computed before a change of default and one computed after it were indistinguishable.

### Consequences

- Good: a summary CSV states the cap its `rpp_bp` and `rpp_cm` depend on, as ADR 0006 already required of the report; a change of cap or default is visible in the data.
- Good: the two tools share one end rule and one default, so their weighted estimates differ only through the length source (progeny-selector reads assembly lengths for soybean; backcross uses the cap).
- Bad: backcross's weighted RPP is not numerically comparable with Flapjack's at the chromosome ends. Interior weighting follows Flapjack; totals differ at chromosome ends by design. Neither tool's ADR may claim numeric agreement with Flapjack.
- Bad: the 2 Mb default is right only for soybean euchromatin; a user of another crop who keeps it gets a cap that means something other than 10 cM.
- Neutral: the summary CSV gains two columns before the provenance columns; a reader that selects columns by name is unaffected, and scripts/read_exports.R reads both as numbers.

## Revisit when

- backcross gets an assembly length table (M5), when the last marker's outer side is bounded by L as the rule already allows.
- A crop scheme wants its own bp default, which would make the default a property of the crop rather than a single number.

## More Information

Amends ADR 0006 (its dated amendment of 2026-09-27 corrects the two sentences about Flapjack). The decision record is the maintainer-delegated decisions of 2026-09-27 (Q-A, Q-B). progeny-selector's record is its ADR 0033.

## Flapjack's code, as fetched on 2026-09-27

From https://raw.githubusercontent.com/cropgeeks/flapjack/master/src/jhi/flapjack/analysis/MabcAnalysis.java: the first marker takes `gap = Math.min(pos, maxMarkerCoverage)`, an interior marker `gap = Math.min(pos1 - prevPos, maxMarkerCoverage)` split between the two neighbours, and the last marker `gapEnd = Math.min(chrLength - marker.position(), maxMarkerCoverage)` with `chrLength = as.mapLength(viewIndex)`. From https://raw.githubusercontent.com/cropgeeks/flapjack/master/src/jhi/flapjack/data/ChromosomeMap.java, `sort()`: "If the length hasn't been set at import time, then we'll use the position of the last marker as the map's length" (`if (length == 0f && markers.size() > 0) length = markers.get(markers.size()-1).getPosition();`). From https://raw.githubusercontent.com/cropgeeks/flapjack/master/src/jhi/flapjack/gui/Prefs.java: `public static double mabcMaxMrkrCoverage = 10.0d;`. So Flapjack credits the first marker the full cap-bounded distance to position 0, and the last marker nothing unless the map declares a length: an asymmetry this project does not copy.
