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

## Addendum, 2026-09-29: the public-release rework

Read 2026-09-29: page text by fetch, and pixel values by computed style in a browser pane at 800 to 1280 px wide. Where a page could not be read it is named as such; nothing is inferred from memory of a site.

**Genome browsers and portals**

- JBrowse 2, application (https://jbrowse.org/code/jb2/main/?config=test_data%2Fvolvox%2Fconfig.json): 48 px app bar in #0d233f navy, 13.7 px Roboto, menus left, session title centred, logo right. The linear view is a 1 px bordered card. The overview bar is a flat rectangle with comma-formatted bp ticks and a shaded wedge down to the zoomed window; track labels sit at the left of each track; a ruler of coordinates runs across the top (https://jbrowse.org/jb2/docs/user_guides/basic_usage/). Site (https://jbrowse.org/jb2/): white nav, one-line 28 px H1, two buttons, a large screenshot of the product; footer in #303846 with the Diesh et al. 2023 citation, funders and the Apache 2.0 licence.
- Ensembl (https://www.ensembl.org/): 32 px top bar in #1b2c39 slate with wordmark, a release badge ("Release 2026-07") and the EMBL-EBI mark, over a 60 px white icon toolbar; body Lato 13 px in #1b2c39 on #fefefe. A species page (https://www.ensembl.org/genome/GCA_000001735.1) states facts as a table of 12 px labels and 18 px values.
- Galaxy (https://usegalaxy.org/): 40 px masthead in #2c3143, Atkinson Hyperlegible 13.6 px on white; a narrow left activity rail of icon plus label; a right history panel; empty state is one sentence in a pale info box ("This history is empty."); footer is one small mono line, "Galaxy version 26.1.2.dev0, commit <hash>".
- UCSC (https://genome.ucsc.edu/, fetch only): dark menu bar with "Cite Us" in header and footer; footer copyright and donate. The ideogram lives inside hgTracks, which sat behind a bot check and was not read.
- SoyBase (https://www.soybase.org/) and LIS (https://www.legumeinfo.org/): the same UIkit/Tripal template, an 80 px masthead in dark green and #87a96b sage respectively with logo, tagline ("Integrating Genetics and Genomics to Advance Soybean Research") and social icons; a one-sentence mission line, quick searches, a tool grid, no photography; ProximaNova 16 px, H1 38 px weight 300; peach and cream button clusters that read as noise. Footer: "funded by the USDA-ARS", developer credit, USDA and NCGR logos.
- Gramene (https://www.gramene.org/): 99 px #f8f9fa navbar with the search inside it; a pale-green "Welcome to Gramene release 69" banner; a two-column icon grid in mixed illustration styles; a slim sticky footer strip "Cite · Privacy · Funding · Links".
- Phytozome (https://phytozome-next.jgi.doe.gov/): white bar with the JGI logo and a green "Phytozome 14" ribbon; no hero; a zebra-striped recent-releases table; Roboto 15 px, green #629c2e headings and links.
- MaizeGDB: not read (403 and a Cloudflare challenge).

**Breeding and analysis tools**

- Germinate demo (https://germinate.hutton.ac.uk/demo): 300 px #2a2a2e charcoal sidebar with icons and count badges; stat tiles in saturated orange, olive, teal and purple; a wheat-photo carousel with a translucent caption box; Source Sans Pro. Its marketing site (https://germinateplatform.github.io/get-germinate/) has a cyan-to-teal diagonal gradient hero and a footer reading "This template is made with by Colorlib".
- Flapjack-bytes (https://raw.githubusercontent.com/cropgeeks/flapjack-bytes/master/docs/images/flapjack-bytes.png; the live demo did not load): flat teal Bootstrap bar; marker-name leader lines fan out above the columns; pastel nucleotide cells; plain fieldsets ("Controls", "Color Schemes"). The brief already records its geometry from source: 100 px gutter, 60 px map track, 17 px cells.
- Breedbase / CassavaBase (https://cassavabase.org/): 51 px #f8f8f8 Bootstrap 3 navbar, Helvetica 14 px, olive #a2ad00 headings, a full-bleed root-photo carousel with translucent white text that is hard to read, two stacked modals on load. SGN (https://solgenomics.net/) adds a footer citation directive, "Cite SGN using Fernandez-Pozo et al, 2014", with GMOD and BrAPI logos.
- Nextstrain (https://nextstrain.org/): no masthead bar; a wordmark, a five-word tagline, a 3 by 2 grid of icon plus title plus two lines, then cards with thumbnails of real analyses; Lato, H1 32 px weight 300; footer with the Bioinformatics 2018 citation, AGPL and CC-BY-4.0 statements, six funder logos. Auspice (https://nextstrain.org/zika): a 160 px left control panel, an 18 px title and a provenance line ("Built with... Data updated 2026-09-25").
- BlobToolKit (https://blobtoolkit.genomehubs.org/): 68 px #00102e navy masthead; the hero is a hexbin plot of real data under a 57 px Comfortaa headline; footer with BBSRC funding and people.

**Craft references**

- Linear (https://linear.app/ ; https://linear.app/now/how-we-redesigned-the-linear-ui): 73 px header with a 1 px rgba(255,255,255,.08) hairline, secondary text #8a8f98, Inter Variable; the product UI is the hero. The redesign note: text and neutral icons made darker, less chrome colour, denser and quieter sidebar, tabs, headers and panels, "a more neutral and timeless appearance".
- Stripe docs (https://docs.stripe.com/): white, body #3c4257 at 14 px, three columns of short link lists, 13 px Menlo code, one primary button. Vercel docs (https://vercel.com/docs): 64 px sticky header, 1 px #1f1f1f hairlines, 14 px sidebar text, Geist. Observable (https://observablehq.com/): centred wordmark, dark navy hero, Source Serif 4 body against Inter UI.

**What transfers**

1. Every serious genome application has a slim dark masthead over a light data surface: Ensembl 32 px #1b2c39, Galaxy 40 px #2c3143, JBrowse 48 px #0d233f, BlobToolKit 68 px #00102e, SoyBase and LIS 80 px in green. Backcross's masthead is 48 px in soil-900, the warm counterpart of that navy range.
2. Interface type is 13 to 15 px (Ensembl 13, Galaxy 13.6, JBrowse 13.7) in a humanist or neutral sans; only marketing heroes exceed 40 px. Backcross keeps 13 px Plex and caps the landing at 24 px.
3. A version and cite line is always present and quiet: Galaxy's mono "version, commit" footer line, Gramene's sticky Cite strip, Auspice's provenance line, UCSC's "Cite Us". Backcross puts version and commit in the masthead and the citation in the footer.
4. Landings are a one-line value statement, a launch action and real entry points; the strongest heroes show the product or real data (JBrowse's screenshot, BlobToolKit's plot, Nextstrain's thumbnails). Photography appears in the weaker sites and fails where text is laid over it (CassavaBase, Germinate). Backcross therefore keeps copy off the photograph, duotones it into the chrome's own tokens, and leads with the demo button; decision 23 records the product-image follow-up.
5. Inside the browsers: a coordinate ruler above the tracks, an overview bar with a window marker, labels in a left gutter, and a 1 px frame around the view. JBrowse's overview is a flat rectangle with comma bp labels; Backcross draws a rounded bar because it is an ideogram of a whole chromosome and labels in Mb, the unit its hover panel and breeders use.
6. Empty states are one sentence in a pale box (Galaxy). Rails are icon-or-number plus short label on a neutral ground.
7. Template tells seen in this field, all avoided here: gradient and diagonal-cut heroes, a visible theme credit, Bootstrap 3 navbars and pill tabs, saturated multicolour stat tiles, stacked consent modals, mixed illustration styles, translucent overlays on photographs, and display faces at weight 200.

Backcross should read as an instrument built by the people who use it: a static, self-hosted scientific webserver in the tradition of SoyBase, Ensembl Plants and JBrowse, not a SaaS landing page. The chrome stays warm and quiet (parchment page, soil text, one leaf green for the primary action, one crimson for alerts) so that the only saturated colour on any screen is genotype data. What changes is the frame around the data: a slim dark masthead that names the tool, its version and its documentation, the way every credible genome browser does; a footer that tells a reader how to cite it; a landing band that says in one sentence what the tool answers, with four numbered steps and one restrained duotone photograph of soybean research plots; a chromosome header that draws each chromosome as an ideogram with a Mb ruler, so the graphical genotype sits under a coordinate system the way it does in Flapjack or a genome browser rather than under a row of labels; and tables, panels and forms that share one vocabulary of rules, weights and spacing. Nothing is added that a breeder would have to learn.

Do:

- Keep IBM Plex Sans for the interface and Plex Mono for identifiers, coordinates and versions; use weight and a single 13 px interface size for hierarchy, with 24 px reserved for the landing lede alone.
- Use 1 px rules (`--color-border-subtle` inside a component, `--color-border` around one) and background steps for structure; radii stay 2 px and 4 px.
- Put the tool's name, version and commit in the masthead and the citation in the footer, on every screen.
- Give every panel a header with a small medium-weight title and a bottom rule (marker detail, key, facts).
- Right-align numbers in every table, tabular figures throughout.
- Draw the chromosome ideogram and ruler in neutral greys only; class colours and the crop palette never appear in the chromosome header.
- Let the photograph be one duotone image built from the chrome's own tokens, beside the copy, never under it.

Do not (the default-AI tells the brief already rules out, restated so an implementer does not reintroduce one):

- No indigo, violet or blue accent; no gradient anywhere, including on headings and photo overlays.
- No three-across card grid; no cards at all for things that are not cards (the four steps are a list, the facts are a list).
- No uniform large radius; no drop shadows on static surfaces.
- No emoji or icon fonts; the only icons are the brand mark, the rail's tick and chevrons already there, and the checkbox glyphs.
- No Inter, no system-ui fallback promoted to first choice.
- No hero copy of the "Unlock insights" register; every sentence names a file, a statistic or an action.
- No text over a photograph; no stock-photo colour; no decorative illustration.
- No sticky masthead: WCAG 2.4.11 is asserted by tests and a sticky header would re-open it.

|                                 |                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Subject                         | Soybean field plots under low-cost camera monitoring for drought response, USDA ARS                                                                                                                                                                                                                                                                                                                      |
| Photo page                      | https://www.ars.usda.gov/oc/images/photos/apr21/d4630-1/ (image id D4630-1)                                                                                                                                                                                                                                                                                                                              |
| Direct download of the original | https://www.ars.usda.gov/ARSUserFiles/oc/images/photos/300dpi/kesa/D4630-1.jpg (verified 2026-09-29: HTTP 200, `image/jpeg`, 3,026,640 bytes, 2700 x 2025 px)                                                                                                                                                                                                                                            |
| Photographer                    | Anna Locke                                                                                                                                                                                                                                                                                                                                                                                               |
| Licence                         | Public domain. The gallery's terms at https://www.ars.usda.gov/oc/images/copyright/ state: "Photos in our Image Gallery are available free of charge and are copyright-free, public domain, images unless otherwise indicated." The photo's page indicates nothing otherwise. The same page asks that ARS be credited, in the form "Photo by (photographer's name), USDA Agricultural Research Service". |
| Credit line displayed           | Photo: Anna Locke, USDA Agricultural Research Service (public domain).                                                                                                                                                                                                                                                                                                                                   |
| Where the credit is displayed   | As the `<figcaption>` directly under the photograph on the Upload screen (phase c), and in docs/design-brief.md's addendum (phase f).                                                                                                                                                                                                                                                                    |
| Processed file                  | `src/ui/assets/hero-soybean-plots.webp`, 1200 x 600 px, WebP quality 78, 105,310 bytes; imported as a module by `UploadScreen.tsx`, so Vite fingerprints it and the relative-base release zip resolves it                                                                                                                                                                                                |
| Processing                      | `py -3 scripts/process-hero.py <D4630-1.jpg> src/ui/assets/hero-soybean-plots.webp`; the script is below and is deterministic (two runs produce byte-identical output; verified). Pillow 12.1.1 is already installed for `py -3` on the maintainer's machine; `sharp` is not installed and is not added.                                                                                                 |

The five-user test the brief asked for is still owed.
