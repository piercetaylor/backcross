# Interface design brief

Scope: the visual and interaction design of the six screens. The compute core, the data contracts and the canvas rendering model are settled elsewhere and are not reopened here. Decisions are recorded in docs/adr/0009; this document is the reasoning and the evidence behind them.

The problem being solved is not that the interface is ugly. It is that a tool a breeder is asked to trust with unreleased line data currently looks like an unfinished prototype, and behaves unlike the tools they already use. Those are different failures and the second one matters more.

## What the field already does

The closest prior art is Flapjack, from the James Hutton Institute, whose MABC weighting model this project already follows (docs/adr/0006). It ships the same statistic our line table shows: per-chromosome recurrent-parent proportion, an RPP total, a coverage value, linkage drag and per-QTL status [web] https://raw.githubusercontent.com/cropgeeks/flapjack/master/docs/mabc.rst.

Four things it does are worth copying.

**The canvas is surrounded, not floated over.** Line names sit in a fixed gutter to the left of the matrix; a chromosome summary and a marker map sit above; a scaled overview of the whole chromosome sits bottom left; marker and line overviews sit right and below [web] https://raw.githubusercontent.com/cropgeeks/flapjack/master/docs/genotype_visualization.rst. No control obscures data. The web port fixes the geometry: a 100 px line-name gutter, a 60 px map track, 17 px cells, 10 px marker labels, alternating `#FFFFFF`/`#D8D8D8` column backgrounds, `#333` text [web] https://raw.githubusercontent.com/cropgeeks/flapjack-bytes/master/src/GenotypeCanvas.js.

**Labels follow the axis you scan.** Line names are always drawn, shrunk to fit the gutter. Marker names are drawn only for the marker under the pointer. Labelling the scanned axis and deferring the other to hover is what makes tens of thousands of columns tractable.

**The table and the visualisation are one selection model.** Sorting the table reorders the view, and sorting the view reorders the table [web] https://raw.githubusercontent.com/cropgeeks/flapjack/master/docs/analysis_results_tables.rst. This is the single most transferable interaction in the survey, and today our Lines screen and Genotype screen share nothing but a set of sample ids.

**The table carries one action bar with a live readout.** Flapjack's strip under the table shows `Line count: 15, visible: 13, selected: 9`, then Select, Filter, Sort and Export. The readout tells a breeder how much of the dataset the current filter is hiding, which a scrollbar does not.

Every tool surveyed puts navigation in a left rail over a light data surface: Flapjack's data-set tree, Germinate's collapsible nested sidebar [web] https://germinate.hutton.ac.uk/demo/#/home, Galaxy's activity bar and panel [web] https://training.galaxyproject.org/training-material/topics/introduction/tutorials/galaxy-intro-short/tutorial.html, Geneious' sources panel [web] https://manual.geneious.com/en/latest/GeneiousInterface.html, SnapGene's project sidebar, JBrowse 2's track selector [web] https://jbrowse.org/jb2/docs/user_guides/basic_usage/. No tool in this space uses a dark data surface.

## Layout

A persistent, collapsible left rail listing the six steps with state (done, available, blocked), over a light content area. Vertical navigation is faster to scan than horizontal and carries a desktop-application association these users already have, at the cost of width [web] https://www.nngroup.com/articles/vertical-nav/, which is why it collapses for the genotype view.

Not a wizard. A wizard suits novice users and infrequent setup, and locks steps until their predecessors are complete [web] https://www.nngroup.com/articles/wizards/. Our users move back and forth between the table and the canvas continuously. Only one real gate exists, the parent declaration, and everything downstream of it is freely revisitable.

Not a flat tab bar either: tabs suit groupings that share a layout and differ only in data [web] https://www.nngroup.com/articles/tabs-used-right/, and our six screens have genuinely different shapes.

## Typography

IBM Plex Sans for the interface and IBM Plex Mono for identifiers and sequence strings, both OFL-1.1 and self-hosted with no third-party font request [web] https://github.com/IBM/plex. One superfamily covers interface, tabular data and any future equations, the vertical metrics already agree, and Plex reads as engineered rather than as startup-neutral.

Numbers get `font-variant-numeric: tabular-nums slashed-zero`, set on the table element so headers and cells share metrics. Proportional figures are the default in most faces, which means decimal points do not align and digits in the same place value do not sit above one another; scanning a column for magnitude then requires reading every number rather than comparing the shape of the column [web] https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric. Slashed zero matters because marker ids and plot ids contain both `O` and `0`.

Numeric columns are right-aligned so magnitudes and decimal places line up; text is left-aligned; numeric, boolean and short identifier columns are never truncated [web] https://eui.elastic.co/docs/components/tables/layout-guidelines/.

## Colour

The genotype classes are the only saturated colour in the product. The interface is a single neutral ramp with no hue in it.

This is forced rather than stylistic. Okabe-Ito already occupies orange, sky blue, bluish green, yellow, blue, vermilion and reddish purple, so almost no saturated hue remains for a chrome accent that would not collide with a data class. Selection is therefore a neutral fill plus a border-weight change, and focus is a high-contrast neutral ring. Roles are assigned across the ramp the way Radix does: background at the lightest steps, component fills next, borders above those with the strongest border step reserved for focus rings, text at the darkest two [web] https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale.

Structure comes from 1 px borders, not shadows. JupyterLab, which is explicit that Material Design "is not optimized for dense, information rich UIs", ships no elevation tokens at all and builds structure from four numbered greys [web] https://jupyterlab.readthedocs.io/en/stable/developer/css.html. Shadow is reserved for genuinely floating layers. Inputs still need a visible boundary: Figma's UI3 deliberately added input backgrounds and dropdown borders because minimalism had destroyed affordance [web] https://www.figma.com/blog/behind-our-redesign-ui3/.

The class palette itself does not change. ABHgenotypeR, the standard R package for this plot, already defaults to Okabe-Ito members [web] https://rdrr.io/cran/ABHgenotypeR/src/R/plotGenos.R, and our missing-as-white and uninformative-as-light-grey match Flapjack's own defaults [web] https://raw.githubusercontent.com/cropgeeks/flapjack/master/src/jhi/flapjack/gui/Prefs.java. Users will recognise the colours from ggplot output, which is worth more than any refinement.

## Shape encoding, which is not optional

Okabe-Ito is built for hue discriminability under colour-vision deficiency, not for luminance separation. Measured against a white ground:

| pair                              | luminance contrast |
| --------------------------------- | ------------------ |
| recurrent blue vs donor vermilion | 1.34:1             |
| donor vs nonparental              | 1.26:1             |
| heterozygous vs missing           | 1.32:1             |

Recurrent parent against donor, the single most important distinction the tool draws, separates by hue almost alone. A graphical genotype photocopied, printed in black and white, or projected badly is unreadable. Separately, heterozygous yellow at 1.32:1, missing white at 1.00:1 and uninformative grey at 1.41:1 all fall below the 3:1 that WCAG 2.2 requires for graphical objects [web] https://www.w3.org/TR/WCAG22/.

Each class therefore gets a texture as well as a colour, and swatches get a border. Okabe and Ito say so themselves: use "not only different colors but also a combination of different shapes, positions, line types and coloring patterns" [web] https://jfly.uni-koeln.de/color/. Flapjack's own answer to the same problem is drawing heterozygotes as a split diagonal block rather than a third flat colour [web] https://pmc.ncbi.nlm.nih.gov/articles/PMC2995120/.

This also closes the minority-class hatch that docs/adr/0007 still records as outstanding. One mechanism settles three problems: greyscale legibility, the WCAG floor, and flagging bins whose majority hides a minority class.

## Density

| property                  | value                    | basis                                     |
| ------------------------- | ------------------------ | ----------------------------------------- |
| table row height, default | 32 px                    | Carbon `sm`; Elastic's default is 34 px   |
| compact / comfortable     | 28 px / 40 px            | between Carbon `xs` and `sm`; Carbon `md` |
| vertical cell padding     | 7 px top, 6 px bottom    | Carbon `sm` and `md`                      |
| horizontal cell padding   | 12 to 16 px              | Carbon uses 16 px                         |
| interface type            | 13 px                    | JupyterLab `--jp-ui-font-size1`           |
| reading prose             | 14 px                    | JupyterLab `--jp-content-font-size1`      |
| spacing scale             | 4, 8, 12, 16, 24, 32, 48 | 4 px base                                 |

Row-height figures are from Carbon's data-table stylesheet [web] https://raw.githubusercontent.com/carbon-design-system/carbon/main/packages/styles/scss/components/data-table/_data-table.scss; type sizes from JupyterLab's light theme variables [web] https://raw.githubusercontent.com/jupyterlab/jupyterlab/main/packages/theme-light-extension/style/variables.css.

Density ships as a user control rather than a fixed choice, as Elastic's data grid does [web] https://eui.elastic.co/docs/components/data-grid/style-and-display/: a breeder scanning 400 lines and a student reading 12 rows want different things. Header rows are the same height as body rows, distinguished by weight and a bottom border rather than a filled band. Horizontal rules only, no zebra striping at these row heights. Columns scroll horizontally on overflow and are never compressed to fit.

## Components

React Aria, style-free, for the table, menus, dialogs, tabs and form controls [web] https://react-aria.adobe.com/. It is chosen over Radix for one decisive reason: it ships a real table and grid with keyboard multi-selection and column resizing, and Radix has no data grid. This application is a table.

It implements the W3C APG grid pattern, which is what a hand-rolled table will not: one tab stop into the grid rather than one per cell, arrow keys moving a cell without wrapping at the edges, Home and End within a row, Ctrl+Home and Ctrl+End to the grid's corners [web] https://www.w3.org/WAI/ARIA/apg/patterns/grid/.

The cost is stated plainly. Every pixel is ours, there is no visual language to inherit, and we own the full state matrix for each component: default, hover, focus-visible, active, selected, disabled, loading, error, and their combinations. That is where hand-built systems actually fail. The mitigation is that every colour and dimension lives in a CSS custom property and no literal value appears in a component file.

Note what this decision is not. shadcn/ui is Radix plus Tailwind styling distributed as copy-in source, so declining it declines a visual default, not an accessibility layer.

## Accessibility floor

WCAG 2.2 Level AA, with two criteria called out because a table tool fails them specifically.

- **1.4.11 Non-text Contrast**: 3:1 for graphical objects and component boundaries. This governs class swatches, table borders and input outlines. Three of our six class colours fail it against white and need borders.
- **2.4.11 Focus Not Obscured**: new in 2.2. Arrow down to a row that scrolls under a sticky header and the criterion is failed. This must be tested, not assumed.
- **1.4.1 Use of Color** is satisfied by the texture encoding above, not by tooltips alone.
- Focus indicators follow 2.4.13, which is AAA but cheap: a 2 px ring with a 2 px offset meets both its size and its state-change requirements [web] https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html.

## What we are deliberately not doing, and why that list is short

The brief was partly to avoid looking machine-generated. The evidence for what that means is thinner than the discourse suggests: most of it comes from agencies selling design services, and no study asks whether anyone can identify a generated interface from visual features. One tell is well sourced, because its author documented it: Tailwind's creator apologised publicly for making every Tailwind UI button `bg-indigo-500`, which propagated into training data [web] https://x.com/adamwathan/status/1953510802159219096.

So the list is: no indigo or violet accent, no gradient headline, no three-across card grid for things that are not cards, no uniform radius applied without hierarchy, no Inter, no emoji as icons, and none of the copy register catalogued at [web] https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing.

Inter is worth a note because it is the most-repeated claim and the weakest: Linear chose it deliberately and wrote about why [web] https://linear.app/now/how-we-redesigned-the-linear-ui. The tell is defaulting, not the typeface. We avoid it on signalling grounds, not quality.

The more useful framing is that the real risk is not looking generated. It is looking unfinished, and behaving unlike the tools these users already know. A table that does not sort like the ones in R, a genotype map that does not sit inside its context the way Flapjack's does, and a filter that hides rows without saying how many, will each cost more trust than any typeface.

## Open question for the maintainer

When markers are sparser than pixels, we extend each marker across the interval nearer to it than to any other marker (docs/adr/0007), which is what made zoom usable. GenoTypeMapper does the opposite on purpose, leaving intervals uncoloured where adjacent markers disagree, "to omit imprecise representation of the genotypic data" [web] https://pmc.ncbi.nlm.nih.gov/articles/PMC7488165/. Both are defensible. The field's instinct runs against ours, and a reviewer may read a filled interval as a claim about genotype between markers. Worth deciding explicitly rather than by default; a middle path is to fill only where the flanking markers agree.

## The test that beats all of the above

None of this has been in front of a breeder. Five users, asked to find the line with the largest donor segment and export a report, will say more about this design than every source cited here.
