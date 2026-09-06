# Three RPP estimators with Flapjack-style coverage-capped weights

Status: accepted. Date: 2026-09-04.

## Context and Problem Statement

Recurrent-parent proportion can be computed by counting markers or by weighting each marker by the genome interval it represents. SoySNP50K density varies more than fivefold between euchromatic and heterochromatic regions [web] https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0054985, so counting over-represents gene-rich arms. Which estimator is reported, and how are heterozygous, missing and uninformative calls treated?

## Considered Options

1. Count-based only.
2. Weighted by physical or genetic interval with a cap, as in Flapjack's MABC analysis.
3. Both, reported side by side, plus a cM variant when a map exists.

## Decision Outcome

Option 3 (src/core/rpp.ts). Contribution is 1 for RP_HOM, 0.5 for HET, 0 for DONOR_HOM. Weighted estimators use, per side, min(half the distance to the adjacent called marker, half the maximum coverage), with chromosome ends using the distance to the end when a length is known, matching the Flapjack documentation [web] https://flapjack.hutton.ac.uk/en/latest/mabc.html. MISSING, NONPARENTAL and UNINFORMATIVE markers are excluded from numerator and denominator (equivalent to imputing the line's own mean [inference]). Defaults: 2 Mb and 10 cM coverage. The bp-weighted value is the display default; all three are exported.

### Consequences

Good: robust to uneven density; comparable with Flapjack output on the same data; the count estimator remains available for comparison with older spreadsheets. Bad: results depend on the coverage cap, which must be stated in reports; without markers.csv the cM estimator is NaN. Neutral: expected values by generation (1 − (1/2)^(n+1)) are shown as context only [web] https://iastate.pressbooks.pub/molecularplantbreeding/chapter/marker-assisted-backcrossing/.
