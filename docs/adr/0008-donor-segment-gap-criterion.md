# Donor-run gap criterion: consecutive-marker distance, in cM when mapped, decoupled from the RPP coverage cap

Status: accepted. Date: 2026-09-06.

## Context and Problem Statement

Donor segments are called as maximal runs of non-recurrent-parent calls along a chromosome (PLAN.md, algorithm 3). A run has to be broken where the data cannot support continuity: across a long stretch with no informative marker, or across too many missing calls. The scaffold's stub specified the RPP "maximum marker coverage" cap (2 Mb, docs/adr/0006) as the run-breaking distance, measured between consecutive non-RP calls. A first implementation of that rule, run on the synthetic fixture, fragmented every planted introgression that crossed a region of non-uniform marker spacing, produced about fifty segments for the sample-swap line, and never exercised `maxMissingSpan`, because the distance test always fired first. Which distance is compared, against what threshold, and in which unit?

## Decision Drivers

Breakpoints are created by recombination, whose rate per megabase differs about eighteenfold between soybean euchromatin and pericentromeric heterochromatin; marker density on the SoySNP50K and BARCSoySNP6K arrays differs four- to fivefold between the same compartments; a cM map is optional in this tool; parameters must be explainable to a breeder and identical in the sibling progeny-selector project.

## Considered Options

1. Keep one parameter for both the RPP cap and the run gap, measured between consecutive non-RP calls (the scaffold).
2. Separate parameters; measure the gap between consecutive informative markers; cM when a map is loaded, bp otherwise; fixed defaults.
3. As 2, but derive the bp default per dataset from the informative-marker gap distribution.

## Decision Outcome

Option 2, implemented in src/core/segments.ts and configured by `maxSegmentGapCm` (default 10 cM) and `maxSegmentGapBp` (default 10 Mb) in docs/data-formats.md.

The two quantities are separate in the only software that defines the former. Flapjack's maximum marker coverage appears only inside its weighted RPP calculation ("the user specifies the maximum length of genome a marker can accurately represent"), is specified in cM (the tutorial sets it to 10 cM), and plays no part in its linkage-drag calculation, which "looks for the first recombination on each side of the QTL region" [web] https://flapjack.hutton.ac.uk/en/latest/mabc.html, https://flapjack.hutton.ac.uk/en/latest/mabc_tutorial.html. The closest widely used run caller with an explicit gap, PLINK's runs-of-homozygosity scan, keeps the gap, density, length and marker-count controls as four independent parameters, and its gap is defined between consecutive SNPs regardless of call ("if two consecutive SNPs are more than 1000 kb apart, they cannot be in the same ROH"), with missing calls handled by a separate marker-count window [web] https://www.cog-genomics.org/plink/1.9/ibd. Measuring the gap between consecutive informative markers rather than between consecutive non-RP calls makes `maxMissingSpan` the only control on missingness, as in PLINK, and stops two missing calls from being read as a 6 Mb hole.

Genetic distance is the principled unit. Schmutz et al. 2010 report about 1 cM per 197 kb in euchromatin and 1 cM per 3.5 Mb in the pericentromeres, with 93 % of recombination in the 43 % of the genome that is euchromatic [web] https://www.nature.com/articles/nature08670, so a fixed physical gap is calibrated for one compartment and misapplied in the other. When markers.csv supplies cM the test is made in cM; for a step where either marker lacks a cM value the physical distance is used against `maxSegmentGapBp`. Without a map the physical test is used throughout, and the segments export records which criterion applied.

No published source gives a physical gap for soybean array data. The SoySNP50K and BARCSoySNP6K papers report mean spacing only (9.1 and 49.1 kb, 86 and 394 kb, euchromatic and heterochromatic) [web] https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0054985, https://pmc.ncbi.nlm.nih.gov/articles/PMC7702105/, and after thinning to markers informative for one parent pair the heterochromatic gaps are larger. PLINK's 1000 kb default has been evaluated empirically on livestock arrays (Meyermans et al. 2020: coverage above 99 % of the autosome at 1000 kb) [web] https://pmc.ncbi.nlm.nih.gov/articles/PMC6990544/ and would fragment 6K heterochromatin. The 10 Mb default is chosen to exceed the mean informative-marker spacing of either array in the pericentromeres by a wide margin, so that ordinary density variation does not break a true segment; the largest realised gap for a given parent pair can still exceed it, it is not a claim about biology, and it is reported with every segment table so a program can lower it. Option 3 was rejected for the first release because a dataset-dependent default makes two runs of the same line on different marker panels non-comparable and is harder to keep identical across the two repositories; the informative-marker gap distribution is instead shown in the summary so the user can judge the default.

### Consequences

Good: the planted single-chromosome segments in the fixture (NIL_01, NIL_02, NIL_04, NIL_06) are recovered with exact start, end and flank positions under both criteria, and the whole-genome donor line NIL_05 splits under the cM criterion only where the synthetic map (2.4 cM per Mb, so 10 cM is 4.2 Mb) places consecutive informative markers more than 10 cM apart, which is the rule working as specified; `maxMissingSpan` is live; the RPP cap can be tuned without moving breakpoints. Bad: two more parameters to document and to keep in step with progeny-selector; results with and without markers.csv can differ where cM and bp disagree, which the `gap_criterion` column makes visible. Neutral: docs/adr/0006 is amended to state that Flapjack's cap is a cM quantity and that 2 Mb is this project's euchromatic translation for map-less data.
