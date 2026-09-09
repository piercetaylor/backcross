# Retained-mode canvas rendering with per-pixel binning and the Okabe-Ito palette

Status: accepted. Date: 2026-09-04.

## Context and Problem Statement

The genotype view must draw every line across 20 chromosomes at 50K markers, zoom to a region, and answer hover queries, on a laptop. SVG or DOM elements per marker do not scale. Colours must remain distinguishable for colour-vision-deficient users.

## Considered Options

1. SVG rectangles per marker.
2. One HTML canvas per line with immediate-mode redraw.
3. One canvas with a retained typed-array model, per-pixel-column binning by majority class, binary-search hit testing (the flapjack-bytes approach [web] https://github.com/cropgeeks/flapjack-bytes).
4. WebGL.

## Decision Outcome

Option 3 (src/ui/canvas/GraphicalGenotypeRenderer.ts). Colours come from src/core/palette.ts using the Okabe-Ito palette as shipped in R's grDevices `palette.colors("Okabe-Ito")` [web] https://raw.githubusercontent.com/wch/r-source/trunk/src/library/grDevices/R/colorstuff.R: recurrent parent blue #0072B2, donor vermilion #D55E00, heterozygous yellow #F0E442, nonparental reddish purple #CC79A7, missing white #FFFFFF, uninformative light grey #D9D9D9 (the last two are neutral fills outside the palette). Class labels are always available in tooltips and tables so colour is never the only cue.

### Consequences

Good: one draw pass for any marker count; export to PNG via `toDataUrl` for the HTML report; no React re-render per frame. Bad: binning hides isolated single-marker calls at coarse zoom (the majority rule); a hatch marking bins that contain a minority class was planned for M2 but was not implemented, so this remains outstanding: at coarse zoom the per-pixel majority rule still hides a minority class inside a bin with no visual cue that it is there. The current mitigation is the hover panel, which names the marker under the pointer and so lets a reader inspect a bin's contents one column at a time, but it does not flag which bins are worth inspecting. Missing calls do not compete in the majority: a column is drawn as missing only when it holds no called marker, and among called classes ties go to the recurrent parent. Where markers are sparser than pixels, which is what zooming into a region produces, each marker is extended across the columns nearer to it than to any other marker, so the track reads as contiguous blocks instead of one hairline per marker; this draws the interval a marker represents, the same convention the bp-weighted RPP uses (docs/adr/0006), and asserts nothing about the genome between markers, which the hover panel makes explicit by naming the marker a column came from. Neutral: WebGL is unnecessary at this scale and would complicate the report export.
