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

**2026-09-11.** The minority-class hatch listed above as outstanding is now implemented, as a per-class texture (docs/adr/0009, M2.5 phase 3): each bin's majority class is drawn as its solid fill, optionally overlaid with its own texture, and a second, minority texture is layered on top wherever a called class other than the majority also landed in that bin, so a non-majority call is visible without a hover. The overlay never applies to a column that `fillBetweenMarkers` only extended into, since such a column holds no markers of its own; the open question in docs/adr/0009 about filling the interval between disagreeing flanking markers stays open. The same layered-glyph mechanism -- a base fill plus a smaller overlaid mark carrying a qualifier -- is what cBioPortal's OncoPrint uses for a per-cell qualifier (docs/design-survey.md).

## Amendment, 2026-09-16

M4 phase 1 (docs/m4-phases.md, section 3) virtualises the genotype view. The main canvas and its line gutter now draw a row window: the rows that intersect the viewport of the genotype scroll container, which owns vertical scrolling under a `--geno-scroll-max-height` bound, plus four rows of overscan on each side (`OVERSCAN_ROWS`, src/ui/canvas/row-window.ts). The gutter `<ol>` and the canvas host keep the full height of every row, so they act as spacers and the scrollbars keep their geometry; the drawn canvas and the rendered gutter rows are offset inside them by the window's first row times the row period. `GraphicalGenotypeRenderer.setRowWindow` limits both `draw()` and `hitTest()` to the window, and `hitTest` adds the window's first row to the row under the pointer, so hover detail names the right line after a scroll. A renderer with no window draws every row, so the HTML report and Node callers are unchanged. Under print media the bound is lifted and every row is drawn.

The overview below a single chromosome no longer draws an evenly spaced subsample when there are more lines than its pixel rows. It bins lines into rows first (src/ui/canvas/line-binning.ts): each pixel row covers a contiguous run of lines in display order, and at each marker takes the majority of the covered lines' classes by `majorityClass` (src/ui/canvas/binning.ts), the same rule and tie order the column stage applies, with missing calls never competing against a call. The renderer then bins those synthetic lines into columns as before. Two-stage binning, lines to rows and then markers to columns, is not identical to a single majority over every call in the cell; the renderer, hit testing and textures stay unchanged in exchange, and every line now contributes to the pixel row it falls in.

Measured: `npm run test:bench` (50,000 markers by 200 lines, headless, 2026-09-16) reported Load -> first draw 13,763 ms in Chromium and 12,641 ms in Firefox, against 10,462 ms and 8,543 ms recorded for M3 (PLAN.md). Load -> "Lines: 200" on the same run was 12,642 ms and 11,167 ms, against 9,457 ms and 7,188 ms for M3, so the machine was slower across the whole load rather than at the draw. The bench times the load end to end and does not isolate the draw; the earlier 124 ms whole-genome draw figure was not re-measured by it.
