# Backcross interface rework: implementation spec

Written 2026-09-29 for the maintainer's request that the tool look like a polished, credible scientific webserver rather than a default React app. Six phases, each small enough for one implementer, each with the exact files, CSS, markup, copy and acceptance checks, so the doer makes no design decision. Repository: `C:\Users\pierc\Projects\Plant_Breeding_Projects\backcross`. Live: https://piercetaylor.github.io/backcross/ and `?demo=synthetic`.

What does not change, anywhere in this spec: the Okabe-Ito class colours and textures (`src/core/palette.ts`, `src/ui/canvas/textures.ts`), everything the renderer paints inside the canvas, the compute core, the worker protocol, the data contract, the export formats and file names, the APG grid, the focus order the browser tests assert, the print rules, the twelve-step neutral ramp, IBM Plex, the left rail of six steps, and 1 px borders in place of shadows. `src/ui/tokens.css` stays the only place a colour or dimension is written; every rule below is token-only, and no component file gains a literal.

Gates every phase must pass before it is handed back: `npm run lint`, `npm run typecheck`, `npm test`, `CI=true npm run test:browser`, `npm run build` (which runs `scripts/check-bundle.mjs`). No new runtime dependency is needed by any phase. The one binary asset added (phase c) is 105,310 bytes and is imported as a module, so it is fingerprinted into `dist/assets/` as a `.webp`; the bundle check only inspects `.js` files and the entry chunk (98,825 bytes today against a 262,144 limit) grows by well under 10 kB across all phases.

---

## 1. Survey findings

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

---

## 2. Design direction

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

### 2.1 Which recorded decisions this amends

ADR 0009 (2026-09-11), as amended 2026-09-16 by ADR 0017:

1. "A collapsible left rail of the six steps over a light content area" holds, but the rail stops carrying the brand. A full-width, static, soil-900 masthead above rail and content carries the mark, the wordmark, the version and the project links. Reason: every serious genome application surveyed puts a slim dark band over a light data surface (Ensembl 32 px, Galaxy 40 px, JBrowse 48 px, BlobToolKit 68 px, SoyBase and LIS 80 px; section 1), and a light rail beside light data reads as an admin template. The masthead is not sticky, so nothing new can obscure a focused element (SC 2.4.11).
2. "Chrome carries a crop palette" gains two soil steps, `--crop-soil-800` and `--crop-soil-300`, for the masthead's hover fill and muted text. Wheat gold stays decorative only, exactly as ADR 0017's 2026-09-26 amendment argued (it is the one crop colour under CIEDE2000 10 from a decoded class), and with the old seed-and-leaf mark gone it now appears nowhere on screen. The token is kept so the test's enumeration and the ADR remain true; it may be removed in a later record.
3. The mark changes from a leaf over a seed to a chromosome pair with one introgressed segment. The segment is a tint of the mark's own colour, not a hue, so it cannot be read as a genotype class.
4. The genotype view's chromosome strip becomes a chromosome header: name, ideogram bar and Mb ruler per track. The renderer's `trackLayouts()` additionally reports each track's `startBp` and `endBp`; nothing it draws changes.
5. A page footer carries the citation, version, licence and privacy sentence. ADR 0030 chose `CITATION.cff` only; the footer's sentence points at it rather than duplicating a reference format.
6. Type scale gains `--text-2xl` (24 px) and `--text-3xl` (30 px), used by the landing only. The 13 px interface and 14 px prose sizes that `tests/tokens.test.ts` pins are unchanged.

Not amended: no dark data surface, no hue in the chrome beyond the crop palette and the alert, the texture encoding, density as a user control, React Aria, print behaviour, the 24 px canvas row period.

---

## 3. Token changes (`src/ui/tokens.css`)

All additions go inside the existing `:root` block, in the groups named. The file has no dark set (ADR 0017: "There is no dark set, because tokens.css had none"); none is added, and nothing below is wrapped in a media query. Nothing is removed. One value changes: `--chromosome-strip-height`.

Add after `--crop-wheat-500: #c99a2e;`:

```css
/* Two more soil steps (docs/adr/0009, amended 2026-09-29): the masthead's hover fill and its muted text. */
--crop-soil-800: #3e3225;
--crop-soil-300: #b9ac98;
```

Add after `--color-text-on-primary: var(--neutral-1);`:

```css
/* The masthead: the one dark chrome surface. Text on it is parchment; its focus ring is parchment too, since leaf-900 vanishes on soil. */
--color-bg-masthead: var(--crop-soil-900);
--color-bg-masthead-hover: var(--crop-soil-800);
--color-text-on-dark: var(--crop-parchment-50);
--color-text-on-dark-muted: var(--crop-soil-300);
--color-focus-ring-on-dark: var(--crop-parchment-50);
/* Panels (marker detail, dataset facts) lift one step off the parchment page. */
--color-bg-panel: var(--neutral-1);
--color-bg-plot: var(--crop-parchment-50);
```

Add after `--color-canvas-label: var(--neutral-12);`:

```css
/* The chromosome header over the genotype canvas: ideogram, ruler and frame stay on the neutral ramp (docs/adr/0007). */
--color-ideogram-fill: var(--neutral-2);
--color-ideogram-stroke: var(--neutral-9);
--color-ruler: var(--neutral-9);
--color-ruler-label: var(--neutral-10);
--color-plot-frame: var(--neutral-7);
```

Add after `--text-xl: 20px;`:

```css
--text-2xl: 24px;
--text-3xl: 30px;
```

Add after `--leading-body: 1.5;`:

```css
--leading-display: 1.15;
```

Add after `--numeric: tabular-nums slashed-zero;`:

```css
--tracking-tight: -0.01em;
--tracking-caps: 0.06em;
--measure-prose: 62ch;
```

Add after `--logo-size: 24px;`:

```css
--masthead-height: 48px;
--hero-column-min: 320px;
--step-number-size: 28px;
--field-min: 200px;
```

Change `--chromosome-strip-height: 20px;` to `--chromosome-strip-height: 56px;` (the track stacks 4 px padding, an 11 px name row at 1.4 leading, an 8 px ideogram, a 16 px ruler and two 4 px gaps, 51.4 px, with the tick digits ending at 53.2 px) and add directly under it:

```css
--ideogram-height: 8px;
--ruler-height: 16px;
/* Smallest pixel gap between two ruler ticks; src/ui/canvas/ruler.ts picks the 1-2-5 step that clears it. */
--ruler-tick-min-gap: 56px;
```

Update the file's header comment: after the paragraph on the crop palette add one sentence: "The 2026-09-29 rework (docs/adr/0009, amendment of that date) added the masthead surface, the panel surface, the chromosome-header greys and the landing's display sizes; wheat gold is now unused on screen and kept only so ADR 0017's enumeration stays true."

### 3.1 Contrast, measured with `src/core/contrast.ts`

Every ratio below was computed by importing `contrastRatio` from `src/core/contrast.ts` under Node 24, which is the function `tests/tokens.test.ts` uses, so these are the numbers the test will produce.

| Pair (foreground on background)              | Hex               | Ratio       | Floor | Role                                         |
| -------------------------------------------- | ----------------- | ----------- | ----- | -------------------------------------------- |
| text-on-dark on bg-masthead                  | #fbf8f1 / #2e2419 | 14.32       | 4.5   | masthead title, links                        |
| text-on-dark on bg-masthead-hover            | #fbf8f1 / #3e3225 | 11.73       | 4.5   | hovered link                                 |
| text-on-dark-muted on bg-masthead            | #b9ac98 / #2e2419 | 6.81        | 4.5   | version label                                |
| text-on-dark-muted on bg-masthead-hover      | #b9ac98 / #3e3225 | 5.58        | 4.5   | version label, hovered row                   |
| focus-ring-on-dark on bg-masthead            | #fbf8f1 / #2e2419 | 14.32       | 3     | focus ring                                   |
| focus-ring-on-dark on bg-masthead-hover      | #fbf8f1 / #3e3225 | 11.73       | 3     | focus ring                                   |
| bg-masthead-hover on bg-masthead             | #3e3225 / #2e2419 | 1.22        | none  | hover fill only; the underline moves with it |
| ideogram-stroke and ruler on color-bg        | #757575 / #fbf8f1 | 4.34        | 3     | ideogram outline, tick marks                 |
| ideogram-stroke and ruler on color-bg-subtle | #757575 / #f3ecdc | 3.91        | 3     | same, if a track ever sits on the band       |
| ruler-label on color-bg                      | #5f5f5f / #fbf8f1 | 6.02        | 4.5   | tick labels                                  |
| ruler-label on color-bg-subtle               | #5f5f5f / #f3ecdc | 5.43        | 4.5   | same                                         |
| plot-frame on color-bg                       | #bdbdbd / #fbf8f1 | 1.77        | none  | decorative frame; same step as table rules   |
| text on bg-panel                             | #2e2419 / #ffffff | 15.19       | 4.5   | panel body                                   |
| text-secondary on bg-panel                   | #5b4a39 / #ffffff | 8.46        | 4.5   | panel titles                                 |
| text-tertiary on bg-panel                    | #5f5f5f / #ffffff | 6.39        | 4.5   | footer, credits                              |
| link on bg-panel                             | #255a30 / #ffffff | 8.13        | 4.5   | links inside a panel                         |
| alert on bg-panel                            | #a4161a / #ffffff | 7.75        | 4.5   | alert text in a panel                        |
| border-strong on bg-panel                    | #757575 / #ffffff | 4.61        | 3     | control outline in a panel                   |
| text-tertiary on color-bg / color-bg-subtle  | #5f5f5f           | 6.02 / 5.43 | 4.5   | footer, photo credit, ruler                  |
| text-secondary on color-bg / color-bg-subtle | #5b4a39           | 7.97 / 7.18 | 4.5   | kicker, step text (already asserted)         |

Existing pairs the tests already assert are unchanged, because no existing token value changes except the strip height (20 px to 56 px).

---

## 4. Logo: mark, wordmark, favicon

The mark is a chromosome pair. The upper bar is whole; the lower bar carries one introgressed segment, drawn as the bar's own colour at 40 % opacity over a gap in the bar, so it reads as a lighter block on a dark bar and a darker block on a light one. It is single-colour by construction: the in-app component paints with `currentColor`, so it is parchment on the masthead and prints black. No gradient, no leaf, no circle. At 16 px the two bars are 3.3 px tall with a 3 px gap and the segment is 4.7 px wide, which survives a favicon; at 24 px in the masthead it is crisp on a 1x display because every edge falls on a half or whole pixel.

The wordmark is live text: "Backcross" in IBM Plex Sans 600 at `--text-lg` with `--tracking-tight`, followed by the version in Plex Mono at `--text-xs` in the muted colour. No SVG wordmark is shipped.

### 4.1 `src/ui/shell/BrandMark.tsx` (new; in-app)

```tsx
/**
 * The brand mark: a chromosome pair, the lower bar carrying one introgressed
 * segment (docs/adr/0009, amended 2026-09-29). Painted in currentColor with
 * the segment at reduced opacity, so it is single-colour by construction:
 * parchment on the masthead, black on paper. Decorative; whoever places it
 * supplies the accessible name (the masthead's <h1>).
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect className="brand-mark-bar" x="2" y="5" width="20" height="5" rx="2.5" />
      <path className="brand-mark-bar" d="M4.5 14H11v5H4.5a2.5 2.5 0 0 1 0-5Z" />
      <path className="brand-mark-bar" d="M18 14h1.5a2.5 2.5 0 0 1 0 5H18Z" />
      <rect className="brand-mark-segment" x="11" y="14" width="7" height="5" />
    </svg>
  );
}
```

Its two classes live in `src/ui/shell/shell.css` (phase b): `.brand-mark-bar { fill: currentColor; }` and `.brand-mark-segment { fill: currentColor; fill-opacity: 0.4; }`. Unitless `0.4` is not a length, so `tests/css-literals.test.ts` accepts it.

### 4.2 `public/favicon.svg` (replace the file's whole content)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <title>Backcross</title>
  <rect width="24" height="24" rx="4" fill="#fbf8f1"/>
  <g fill="#255a30">
    <rect x="2" y="5" width="20" height="5" rx="2.5"/>
    <path d="M4.5 14H11v5H4.5a2.5 2.5 0 0 1 0-5Z"/>
    <path d="M18 14h1.5a2.5 2.5 0 0 1 0 5H18Z"/>
    <rect x="11" y="14" width="7" height="5" fill-opacity="0.4"/>
  </g>
</svg>
```

Literals are permitted here: `public/` is outside both the ESLint component gate and the stylesheet test. The two hexes are `--crop-parchment-50` and `--crop-leaf-800`.

### 4.3 `public/brand/backcross-mark.svg` and `public/brand/backcross-mark-mono.svg` (new)

For the README, release notes and anyone embedding the mark. Full colour (leaf-800 on transparent):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96">
  <title>Backcross mark</title>
  <g fill="#255a30">
    <rect x="2" y="5" width="20" height="5" rx="2.5"/>
    <path d="M4.5 14H11v5H4.5a2.5 2.5 0 0 1 0-5Z"/>
    <path d="M18 14h1.5a2.5 2.5 0 0 1 0 5H18Z"/>
    <rect x="11" y="14" width="7" height="5" fill-opacity="0.4"/>
  </g>
</svg>
```

Single colour (inherits `currentColor`; use it inline in Markdown-rendered HTML or on paper):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96">
  <title>Backcross mark</title>
  <g fill="currentColor">
    <rect x="2" y="5" width="20" height="5" rx="2.5"/>
    <path d="M4.5 14H11v5H4.5a2.5 2.5 0 0 1 0-5Z"/>
    <path d="M18 14h1.5a2.5 2.5 0 0 1 0 5H18Z"/>
    <rect x="11" y="14" width="7" height="5" fill-opacity="0.4"/>
  </g>
</svg>
```

`index.html` keeps `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />` and gains, directly under it, `<meta name="theme-color" content="#2e2419" />` (the masthead colour, which mobile browsers paint into the tab strip). No PNG or ICO fallback: every browser this project tests supports SVG favicons.

---

## 5. Imagery

One photograph, used once, beside the landing copy. Chosen over an aerial field (Wikimedia, CC BY 2.0, United Soybean Board) because it is a US federal public-domain work with no attribution obligation beyond the credit the agency asks for, and because it shows research plots rather than a farm: the subject is the tool's audience's own work.

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

Treatment: crop to 2:1 anchored 4 % above the bottom edge, so the frame is plots and treeline with a band of sky; grayscale with 1 % auto-contrast; then a duotone from soil-900 through a mid soil (#8a785e) to parchment-100. The result is built from the chrome's own tokens, so it cannot compete with the Okabe-Ito classes on the canvas, and it reads as a plate rather than a stock photograph.

### 5.1 `scripts/process-hero.py` (new)

```python
"""Deterministic landing photo for Backcross (docs/adr/0009, amended 2026-09-29).

Usage:  py -3 scripts/process-hero.py <source.jpg> <out.webp>

Crops the source to 2:1 anchored 4 % above the bottom edge (plots and treeline,
a band of sky), resizes to 1200 x 600, and maps luminance onto a duotone from
soil-900 #2e2419 through #8a785e to parchment-100 #f3ecdc, so the photograph
is built from the chrome's own tokens and never competes with the Okabe-Ito
class colours. Requires Pillow (py -3 -m pip install pillow); no other tool.
Source: USDA ARS image D4630-1, photo by Anna Locke, public domain,
https://www.ars.usda.gov/ARSUserFiles/oc/images/photos/300dpi/kesa/D4630-1.jpg
"""
import sys
from PIL import Image, ImageOps

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
w, h = im.size
nh = w // 2
top = h - nh - int(0.04 * h)
im = im.crop((0, top, w, top + nh))
grey = ImageOps.autocontrast(ImageOps.grayscale(im), cutoff=1)
duo = ImageOps.colorize(grey, black=(0x2E, 0x24, 0x19), white=(0xF3, 0xEC, 0xDC),
                        mid=(0x8A, 0x78, 0x5E), midpoint=128)
duo = duo.resize((1200, 600), Image.LANCZOS)
duo.save(out, "WEBP", quality=78, method=6)
print(out, duo.size)
```

Phase c produces the asset with two commands from the repository root (a worktree has no access to this session's files):

```
curl -L -A "Mozilla/5.0" -o "$TEMP/D4630-1.jpg" https://www.ars.usda.gov/ARSUserFiles/oc/images/photos/300dpi/kesa/D4630-1.jpg
py -3 scripts/process-hero.py "$TEMP/D4630-1.jpg" src/ui/assets/hero-soybean-plots.webp
```

Expected output: `src/ui/assets/hero-soybean-plots.webp (1200, 600)`, 105,310 bytes on the maintainer's machine with Pillow 12.1.1 (run twice, byte-identical). The test ceiling of 120,000 bytes tolerates encoder drift on another Pillow. The source JPEG is not committed.

No second image. Empty states stay typographic (see phase e); a photograph in an empty state would be decoration.

---

## 6. Implementation phases

Order and parallelism. Phase a first, alone, merged before anything else starts: it adds the tokens every later phase names, and it splits `screens.css` so that b, c, d and e touch disjoint files. Phases b, c, d and e are then independent and may run in four worktrees at once; each lists the files it owns and the files it must not touch. Phase f last, after all four are merged. Every phase runs the five gates; the per-phase checks below are in addition.

Conventions for every phase: no literal colour or length in any `.tsx` or in any stylesheet other than `tokens.css` (`npm run lint` and `tests/css-literals.test.ts` enforce it); a new class name is lower-case hyphenated; every new file opens with the header comment style the repository uses (responsibility, then interface); copy is used exactly as written here, including punctuation, but whitespace is prettier's: run `npm run format` before the gates, since several TSX blocks below exceed the print width as pasted; commit as Conventional Commits with no attribution footer.

### Phase a: tokens, typography, base polish, stylesheet split

Files touched: `src/ui/tokens.css`, `src/ui/base.css`, `src/ui/screens/screens.css`, `src/ui/screens/upload.css` (new), `src/ui/screens/genotype.css` (new), the import lines only of `src/ui/screens/UploadScreen.tsx` and `src/ui/screens/GenotypeViewScreen.tsx`, `tests/tokens.test.ts`, `tests/css-literals.test.ts`.
Must not touch: `src/App.tsx`, `src/ui/shell/*`, any other screen, `src/ui/canvas/*`, `src/ui/lines/*`, `index.html`, `public/`.

a.1 Tokens: apply section 3 exactly.

a.2 `src/ui/base.css`:

- Replace the `h1, h2, h3` block and the three size rules with:

```css
h1,
h2,
h3 {
  margin: 0 0 var(--space-2);
  line-height: var(--leading-tight);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-tight);
}

h1 {
  font-size: var(--text-xl);
}

h2 {
  margin-bottom: var(--space-4);
  font-size: var(--text-xl);
}

h3 {
  margin-top: var(--space-5);
  font-size: var(--text-body);
  font-weight: var(--weight-medium);
}
```

- After the `button:disabled` rule add:

```css
button:active:enabled,
select:active:enabled {
  background: var(--color-bg-control-active);
}

/* Native file pickers: the button part takes the control treatment, the file name keeps the page font. */
input[type='file'] {
  max-width: 100%;
  font: inherit;
  color: var(--color-text-secondary);
}

input[type='file']::file-selector-button {
  height: var(--control-height-sm);
  margin-right: var(--space-2);
  padding: 0 var(--control-padding-x);
  font: inherit;
  color: var(--color-text);
  background: var(--color-bg-control);
  border: var(--border-1) solid var(--color-border);
  border-radius: var(--radius-2);
}

input[type='file']:enabled::file-selector-button:hover {
  background: var(--color-bg-control-hover);
}

/* Grouped parameters: a bordered group with the legend set into the border. */
fieldset {
  margin: 0 0 var(--space-4);
  padding: var(--space-3) var(--space-4) var(--space-2);
  border: var(--border-1) solid var(--color-border-subtle);
  border-radius: var(--radius-2);
}

legend {
  padding: 0 var(--space-1);
  font-weight: var(--weight-medium);
  color: var(--color-text-secondary);
}

/* The one-sentence explanation under a screen title or a control. */
.lede {
  max-width: var(--measure-prose);
  margin: 0 0 var(--space-4);
  font-size: var(--text-body);
  line-height: var(--leading-body);
  color: var(--color-text-secondary);
}

/* Typographic empty state: one sentence, no illustration. */
.empty-state {
  max-width: var(--measure-prose);
  margin: var(--space-4) 0;
  padding: var(--space-4);
  color: var(--color-text-secondary);
  border: var(--border-1) dashed var(--color-border);
  border-radius: var(--radius-2);
}
```

- Change `input[type='text'], input[type='number'], input[type='search'], textarea` so `background` is `var(--color-bg-panel)` (white fields on the parchment page: the affordance the brief's Figma UI3 note asks for). Add `input[type='number'] { width: var(--field-min); }` after the existing `input[type='number']` rule.

a.3 Split `src/ui/screens/screens.css` into three files. Move, do not rewrite, and keep each moved rule byte-identical apart from its file:

- `src/ui/screens/upload.css` (new) receives the "---- Upload ----" section (`.upload-hero`, `.upload-hero p:last-child`, `.demo-actions`, `.demo-note`, `.field`), the "---- Upload: Source switch ----" section (`.source-group`), and `.input-coding-link`. Header comment: "The Upload screen's layout. Token-only by rule (tests/css-literals.test.ts). Imported by UploadScreen.tsx alone."
- `src/ui/screens/genotype.css` (new) receives the "---- Graphical genotypes ----" section entire (`.geno-*`, `.marker-detail*`, `.keyboard-help`, `.legend`, `.legend li`) and, from the print block, the `.geno-toolbar, .keyboard-help, .marker-detail { display: none; }` and `.geno-scroll { max-height: none; overflow: visible; }` rules inside their own `@media print { }`. Header comment: the paragraph about the gutter arithmetic that is currently in screens.css's header, moved here verbatim, preceded by "The graphical genotype screen's layout. Token-only by rule. Imported by GenotypeViewScreen.tsx alone."
- `src/ui/screens/screens.css` keeps "---- Shared ----" (`.data-table*`), "---- Summary and QC ----" and "---- Compare ----"; delete the print block if nothing remains in it. Its header comment loses the gutter paragraph and gains: "Upload and genotype rules live in upload.css and genotype.css since 2026-09-29, so that the screens can be worked on independently."
- `UploadScreen.tsx`: `import './screens.css';` becomes `import './upload.css';`. `GenotypeViewScreen.tsx`: `import './screens.css';` becomes `import './genotype.css';` (it keeps `import '../canvas/legend.css';`). Confirm with `grep -n "data-table" src/ui/screens/UploadScreen.tsx src/ui/screens/GenotypeViewScreen.tsx` that neither uses a shared rule (neither does today).

a.4 `tests/css-literals.test.ts`: in `finds the stylesheets it is meant to be guarding`, add `expect(files).toContain('screens/upload.css');` and `expect(files).toContain('screens/genotype.css');`.

a.5 `tests/tokens.test.ts`:

- In `is exactly the enumerated set`, the array becomes: `'crop-leaf-100', 'crop-leaf-700', 'crop-leaf-800', 'crop-leaf-900', 'crop-parchment-100', 'crop-parchment-50', 'crop-soil-300', 'crop-soil-700', 'crop-soil-800', 'crop-soil-900', 'crop-wheat-500'`.
- Append inside `describe('the crop palette', ...)`, after the swatch-border test:

```ts
it('text and muted text on the masthead clear 4.5:1, at rest and hovered', () => {
  expectPairs(
    ['color-text-on-dark', 'color-text-on-dark-muted'],
    ['color-bg-masthead', 'color-bg-masthead-hover'],
    4.5,
  );
});

it('the masthead focus ring clears 3:1 on both masthead fills', () => {
  expectPairs(['color-focus-ring-on-dark'], ['color-bg-masthead', 'color-bg-masthead-hover'], 3);
});

it('text, secondary and tertiary text, links and the alert hue clear 4.5:1 on the panel surface', () => {
  expectPairs(
    ['color-text', 'color-text-secondary', 'color-text-tertiary', 'color-link', 'hue-alert'],
    ['color-bg-panel'],
    4.5,
  );
});

it('the strong border and the focus ring clear 3:1 on the panel surface', () => {
  expectPairs(['color-border-strong', 'color-focus-ring'], ['color-bg-panel'], 3);
});
```

- Add a new top-level describe after `the crop palette`:

```ts
/*
 * The chromosome header (docs/adr/0009, amended 2026-09-29) sits over the
 * genotype canvas, so it stays on the neutral ramp like everything else the
 * canvas touches (docs/adr/0007): no crop token, no class colour.
 */
describe('the chromosome header', () => {
  it('draws the ideogram, ruler and frame from the neutral ramp', () => {
    for (const name of [
      'color-ideogram-fill',
      'color-ideogram-stroke',
      'color-ruler',
      'color-ruler-label',
      'color-plot-frame',
    ]) {
      expect({ name, neutral: /^var\(--neutral-\d+\)$/.test(token(name)) }).toEqual({
        name,
        neutral: true,
      });
    }
  });

  it('the ideogram stroke and the ruler clear 3:1, and tick labels 4.5:1, on the plot and page surfaces', () => {
    const surfaces = ['color-bg-plot', 'color-bg', 'color-bg-subtle'];
    expectPairs(['color-ideogram-stroke', 'color-ruler'], surfaces, 3);
    expectPairs(['color-ruler-label'], surfaces, 4.5);
  });

  it('the strip is tall enough for a name row, the ideogram and the ruler', () => {
    const strip = Number.parseFloat(token('chromosome-strip-height'));
    const ideogram = Number.parseFloat(token('ideogram-height'));
    const ruler = Number.parseFloat(token('ruler-height'));
    const nameRow = Number.parseFloat(token('text-xs')) * Number.parseFloat(token('leading-ui'));
    // The track's top padding and its two gaps are --space-1 each (genotype.css).
    const gaps = 3 * Number.parseFloat(token('space-1'));
    expect(strip).toBeGreaterThanOrEqual(ideogram + ruler + nameRow + gaps);
  });
});
```

- In `describe('dimensions')` add: `it('the landing display sizes and the masthead height exist, and the interface size is unchanged', () => { expect(token('text-2xl')).toBe('24px'); expect(token('text-3xl')).toBe('30px'); expect(token('masthead-height')).toBe('48px'); });`

Acceptance: the five gates; `npm test -- tokens css-literals` green; `CI=true npm run test:browser` green with no change to any browser test (the split moves rules, and `print-media.test.tsx` still finds `.geno-toolbar` and `.marker-detail` at `display: none` and `.geno-scroll` unrolled). Visual check in `npm run dev`: nothing on any screen looks different except fieldset borders, white inputs, file-picker buttons and heading spacing.

### Phase b: masthead, rail, mark, favicon, footer

Depends on a. Parallel with c, d, e.
Files touched: `src/ui/shell/BrandMark.tsx` (new), `src/ui/shell/Masthead.tsx` (new), `src/ui/shell/Footer.tsx` (new), `src/ui/shell/Rail.tsx`, `src/ui/shell/shell.css`, `src/App.tsx`, `index.html`, `public/favicon.svg`, `public/brand/backcross-mark.svg` (new), `public/brand/backcross-mark-mono.svg` (new), `tests/rail.test.tsx`, `tests/shell-brand.test.tsx` (new), `tests/browser/print-media.test.tsx`.
Must not touch: `tokens.css`, `base.css`, any screen file, `src/ui/canvas/*`, `src/ui/lines/*`.

b.1 `BrandMark.tsx`: section 4.1 verbatim. `public/favicon.svg`, `public/brand/*.svg`, `index.html`: sections 4.2 and 4.3 verbatim.

b.2 `src/ui/shell/Masthead.tsx` (new):

```tsx
/**
 * The masthead: the tool's name, version and project links, above the rail
 * and the content column (docs/adr/0009, amended 2026-09-29). Static, never
 * sticky, so it can obscure nothing a reader has focused (WCAG 2.4.11).
 *
 * Responsibility: render the brand block and four external links. It holds
 * no state and reads only the build stamp (src/build-info.ts), so it renders
 * to a string in Node (tests/shell-brand.test.tsx).
 *
 * Interface: <Masthead />; REPOSITORY_URL; MASTHEAD_LINKS; versionLabel().
 */
import { buildInfo } from '../../build-info.ts';
import { BrandMark } from './BrandMark.tsx';
import './shell.css';

export const REPOSITORY_URL = 'https://github.com/piercetaylor/backcross';

export const MASTHEAD_LINKS = [
  { label: 'User guide', href: `${REPOSITORY_URL}/blob/main/docs/user-guide.md` },
  { label: 'Data formats', href: `${REPOSITORY_URL}/blob/main/docs/data-formats.md` },
  { label: 'Cite', href: `${REPOSITORY_URL}/blob/main/CITATION.cff` },
  { label: 'Source', href: REPOSITORY_URL },
] as const;

/** "v0.1.0 g1a2b3c4" from the build stamp, or "development build" where vite's define did not run. */
export function versionLabel(): string {
  const b = buildInfo();
  return b === null ? 'development build' : `v${b.version} ${b.commit}`;
}

export function Masthead() {
  return (
    <header className="masthead">
      <div className="masthead-brand">
        <BrandMark className="masthead-mark" />
        <h1 className="masthead-title">Backcross</h1>
        <span className="masthead-version">{versionLabel()}</span>
      </div>
      <nav className="masthead-links" aria-label="Project">
        {MASTHEAD_LINKS.map((link) => (
          <a key={link.label} href={link.href} target="_blank" rel="noreferrer">
            {link.label}
            <span className="visually-hidden"> (opens in a new tab)</span>
          </a>
        ))}
      </nav>
    </header>
  );
}
```

b.3 `src/ui/shell/Footer.tsx` (new):

```tsx
/**
 * The page footer: version, licence and how to cite,
 * at the foot of the content column on every screen (docs/adr/0009, amended
 * 2026-09-29; the citation itself is CITATION.cff, docs/adr/0030). Rendered
 * inside <main>, so it is not a contentinfo landmark and the skip link's
 * target still holds everything a reader might want. Stateless; renders to a
 * string in Node (tests/shell-brand.test.tsx).
 */
import { buildInfo } from '../../build-info.ts';
import { REPOSITORY_URL } from './Masthead.tsx';
import './shell.css';

export function Footer() {
  const b = buildInfo();
  const release = b === null ? 'development build' : `${b.version} (${b.commit})`;
  const cited = b === null ? '' : ` (version ${b.version})`;
  return (
    <footer className="app-foot">
      <p>Backcross {release}. MIT licence.</p>
      <p>
        Cite: Taylor, P. (2026). Backcross: near-isogenic line characterisation from SNP genotypes
        {cited} [software].{' '}
        <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
          {REPOSITORY_URL}
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>
        . CITATION.cff in the repository carries the metadata for reference managers.
      </p>
    </footer>
  );
}
```

b.4 `src/ui/shell/Rail.tsx`: delete the `BackcrossMark` function and its doc comment; delete the `<h1 className=...>` element (the masthead owns the `<h1>`); update the header comment's "Collapsed" paragraph to: "Collapsed, a step shows its number alone, with the full label as both aria-label and title; the privacy sentence is hidden from sight but kept for assistive technology. The tool's name is the masthead's (Masthead.tsx)." Everything else, including `SCREENS`, the toolbar, the foot and the toggle, is unchanged.

b.5 `src/App.tsx`: import `Masthead` from `./ui/shell/Masthead.tsx` and `Footer` from `./ui/shell/Footer.tsx`. In the returned tree, keep the skip link as the first child of `.app-shell`, insert `<Masthead />` directly after it and before `<Rail ...>`, and insert `<Footer />` as the last child of `<main className="app-main" ...>` after the six screen conditionals. Update App's header comment where it describes the shell: "the skip link, the masthead, the rail and the content column, which ends in the footer".

b.6 `src/ui/shell/shell.css`:

- `.app-shell`: add `grid-template-rows: auto minmax(0, 1fr);` and `background: var(--color-bg-subtle);` (the rail column stays parchment-100 below a rail that is shorter than the page once the masthead has scrolled away).
- `.rail`: `height` becomes `calc(100vh - var(--masthead-height));`. Comment above it: "One masthead shorter than the viewport, so a page that fits the viewport has no scrollbar; scrolled past the masthead the rail sticks at the top and the shell's background fills the strip beneath it."
- Delete `.rail-title`, `.rail-logo`, `.rail-logo-leaf`, `.rail-logo-seed` and their comment.
- `.app-main`: add `display: flex; flex-direction: column; background: var(--color-bg);`.
- Add, before the "---- Rail ----" comment:

```css
/* ---- Masthead ---- */

/*
 * The one dark chrome surface (docs/adr/0009, amended 2026-09-29): static,
 * never sticky, spanning both grid columns. Its focus ring is parchment
 * because the page's leaf-900 ring is invisible on soil.
 */
.masthead {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-5);
  min-height: var(--masthead-height);
  padding: var(--space-2) var(--content-padding);
  color: var(--color-text-on-dark);
  background: var(--color-bg-masthead);
}

.masthead-brand {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.masthead-mark {
  flex: none;
  width: var(--logo-size);
  height: var(--logo-size);
}

.brand-mark-bar {
  fill: currentColor;
}

.brand-mark-segment {
  fill: currentColor;
  fill-opacity: 0.4;
}

.masthead-title {
  margin: 0;
  font-size: var(--text-lg);
  line-height: var(--leading-tight);
  color: inherit;
}

.masthead-version {
  margin-left: var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-variant-numeric: var(--numeric);
  color: var(--color-text-on-dark-muted);
}

.masthead-links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  margin-left: auto;
}

.masthead-links a {
  padding: var(--space-1) var(--space-2);
  color: var(--color-text-on-dark);
  text-decoration-color: var(--color-text-on-dark-muted);
  text-underline-offset: var(--space-1);
  border-radius: var(--radius-1);
}

.masthead-links a:hover {
  background: var(--color-bg-masthead-hover);
  text-decoration-color: currentColor;
}

.masthead :focus-visible {
  outline-color: var(--color-focus-ring-on-dark);
}
```

- Add, before the "---- Print ----" comment:

```css
/* ---- Footer ---- */

/* Pushed to the foot of the content column; prints, because the citation belongs on paper. */
.app-foot {
  max-width: var(--measure-prose);
  margin-top: auto;
  padding-top: var(--space-5);
  font-size: var(--text-sm);
  line-height: var(--leading-body);
  color: var(--color-text-tertiary);
  border-top: var(--border-1) solid var(--color-border-subtle);
}

.app-foot p {
  margin: var(--space-5) 0 0;
}

.app-foot p + p {
  margin-top: var(--space-1);
}
```

- In the print block add `.masthead { display: none; }` beside `.rail { display: none; }`, and make `.app-shell, .app-shell[data-rail='collapsed']` also set `grid-template-rows: none;`.

b.7 Tests:

- `tests/rail.test.tsx`: `carries the heading and the privacy sentence` becomes `carries the privacy sentence` and loses the `expect(html).toContain('Backcross')` line. `hides the heading and the privacy sentence from sight but keeps them` becomes `hides the privacy sentence from sight but keeps it`, loses its `toContain('Backcross')` line, and its count expectation becomes `toBeGreaterThanOrEqual(1)`. Add to both the blocked-rail and collapsed describes: `it('carries no heading; the masthead owns the h1', () => { expect(html).not.toContain('<h1'); });`.
- `tests/shell-brand.test.tsx` (new, node project), rendering with `renderToStaticMarkup` as `rail.test.tsx` does:
  - Masthead: contains `<h1 class="masthead-title">Backcross</h1>`; contains `class="masthead-version"`; `versionLabel()` matches `/^(v\d+\.\d+\.\d+ (g[0-9a-f]{7}(-dirty)?|NA)|development build)$/`; for each entry of `MASTHEAD_LINKS` the markup contains `href="${href}"`; every `<a` in the markup carries `target="_blank"` and `rel="noreferrer"`; the nav has `aria-label="Project"`; exactly one `<svg` and it carries `aria-hidden="true"`.
  - Footer: contains `Cite: Taylor, P. (2026). Backcross: near-isogenic line characterisation from SNP genotypes`; contains `MIT licence`; contains `href="https://github.com/piercetaylor/backcross"`.
- `tests/browser/print-media.test.tsx`: in the Lines case, after `expect(display('.rail')).toBe('none');` add `expect(display('.masthead')).toBe('none');`, and after the existing `columns()` assertion add `expect(getComputedStyle(shell).gridTemplateRows.split(/\s+/).length).toBe(1);` (`shell` is already in scope on line 55). Also add `expect(display('.app-foot')).not.toBe('none');`.

Acceptance: the five gates; `tests/rail.test.tsx` and `tests/shell-brand.test.tsx` green; `CI=true npm run test:browser` green, in particular `a11y-axe` (masthead pairs are in section 3.1), `focus-order` (the skip link is still the first Tab stop; the masthead links precede the rail and each shows the parchment ring; on the Summary screen one Tab from the rail toggle lands on the footer link, which is outside `.rail`, so the existing expectation holds) and `print-media`. `npm run a11y:lighthouse` stays above 90. Visual: at 1280 px the masthead is 48 px tall, brand left, four links right; the rail below it starts with "1. Upload"; the footer sits under the content, two lines, on every screen.

### Phase c: landing (Upload screen)

Depends on a. Parallel with b, d, e.
Files touched: `src/ui/screens/UploadScreen.tsx`, `src/ui/screens/upload.css`, `src/ui/assets/hero-soybean-plots.webp` (new; produced by the two commands in section 5.1), `scripts/process-hero.py` (new; section 5.1), `tests/upload-screen.test.tsx`, `tests/hero-asset.test.ts` (new).
Must not touch: `tokens.css`, `base.css`, `screens.css`, `src/App.tsx`, `src/ui/shell/*`, any other screen.

Frozen strings (tests assert them; do not alter a character): the heading text `Upload and validate`; button names `Try the demo dataset`, `Copy link to this demo`, `Load`, `Cancel`, `Download call-set table`; the sentence beginning `The demo data are synthetic`; the anchor `<a className="input-coding-link" href={INPUT_CODING_URL} target="_blank" rel="noreferrer">input coding reference<span className="visually-hidden"> (opens in a new tab)</span></a>`, which must remain the first focusable element in the section (tests/browser/focus-order.test.tsx), so it precedes the demo buttons in DOM order; the labels `Source`, `Files`, `BrAPI server`, `Genotype file (VCF, HapMap, or wide CSV)`, `Base URL`, `Variant set id`, `Access token (optional)`, `Token profile`, `Crop`, `Custom token profile (JSON, optional)`, `samples.csv`, `markers.csv (optional)`, every NumberField label and every fieldset legend.

c.1 `UploadScreen.tsx` markup. Add with the other imports: `import heroPhoto from '../assets/hero-soybean-plots.webp';` (Vite's client types, referenced by `src/vite-env.d.ts`, declare `*.webp`). Replace everything from `<section>` through the closing `</div>` of `upload-hero` with:

```tsx
    <section>
      <div className="landing">
        <div className="landing-copy">
          <p className="landing-kicker">Near-isogenic lines, characterised in the browser</p>
          <p className="landing-lede">
            How much of the recurrent parent does each line carry, and where does the donor remain?
          </p>
          <p className="lede">
            Backcross reads a genotype file and a sample manifest, then reports recurrent-parent
            recovery, donor segments, target-region status and QC for every line. The files are
            parsed by a Web Worker inside this tab; nothing is uploaded and there is no server.
          </p>
          <p className="landing-formats">
            Accepted, missing and rejected genotype codes per format:{' '}
            <a className="input-coding-link" href={INPUT_CODING_URL} target="_blank" rel="noreferrer">
              input coding reference<span className="visually-hidden"> (opens in a new tab)</span>
            </a>
            .
          </p>
          <div className="demo-actions">
            <button type="button" className="button-primary" disabled={busy} onClick={handleLoadDemo}>
              Try the demo dataset
            </button>
            <button type="button" onClick={() => void handleCopyDemoLink()}>
              Copy link to this demo
            </button>
            <span role="status" className="demo-note">
              {copyStatus}
            </span>
          </div>
          <p className="demo-note">
            The demo data are synthetic: generated by this project's test suite, not from any breeding
            program.
          </p>
          <ol className="landing-steps" role="list">
            <li>
              <span className="landing-step-n" aria-hidden="true">
                1
              </span>
              <span>
                Choose a VCF, HapMap or wide CSV genotype file and a samples.csv naming the recurrent
                and donor parents; markers.csv adds a genetic map.
              </span>
            </li>
            <li>
              <span className="landing-step-n" aria-hidden="true">
                2
              </span>
              <span>Check the dataset summary and per-line QC, then sort and filter the Lines table.</span>
            </li>
            <li>
              <span className="landing-step-n" aria-hidden="true">
                3
              </span>
              <span>
                Read the graphical genotypes: one row per line, one track per chromosome, zoomable to a
                region.
              </span>
            </li>
            <li>
              <span className="landing-step-n" aria-hidden="true">
                4
              </span>
              <span>
                Export CSV tables and an HTML report that record the version and commit that produced
                them.
              </span>
            </li>
          </ol>
        </div>
        <figure className="landing-figure">
          <img
            className="landing-photo"
            src={heroPhoto}
            alt=""
            width="1200"
            height="600"
            decoding="async"
          />
          <figcaption className="landing-credit">
            Soybean plots under camera monitoring for drought response. Photo: Anna Locke, USDA
            Agricultural Research Service (public domain).
          </figcaption>
        </figure>
      </div>

      <h2 ref={headingRef} tabIndex={-1}>
        Upload and validate
      </h2>
      <div className="upload-form">
```

and close the new `<div className="upload-form">` with a `</div>` immediately before `</section>`. `alt=""` is deliberate: the photograph is decorative and the caption is visible text. The visible digits are `aria-hidden` because the ordered list already announces position.

c.2 Inside `upload-form`: wrap each fieldset's `NumberField`s in `<div className="field-grid">` (the `<p>` explaining the cM gap stays above the grid inside its fieldset). Wrap the `Load` and `Cancel` buttons in `<div className="form-actions">` and give the `Load` button `className="button-primary"` (one primary control per region: the demo button belongs to the landing band, Load to the form). Give the post-load `<div>` the class `load-result` and its `<p>` the class `lede`.

c.3 `upload.css`: delete `.upload-hero` and `.upload-hero p:last-child`. Keep `.demo-actions`, `.demo-note`, `.field`, `.source-group`, `.input-coding-link`; change `.field` to `margin-bottom: var(--space-3);`. Add:

```css
/* ---- Landing band ---- */

/*
 * Copy beside a photograph, never under it: text contrast is then a token
 * pair the tests measure, not a guess over a picture. auto-fit stacks the two
 * columns below --hero-column-min without a media query, which would need a
 * literal length.
 */
.landing {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--hero-column-min)), 1fr));
  gap: var(--space-6);
  align-items: start;
  margin-bottom: var(--space-6);
  padding-bottom: var(--space-6);
  border-bottom: var(--border-1) solid var(--color-border-subtle);
}

.landing-copy {
  max-width: var(--measure-prose);
}

.landing-kicker {
  margin: 0 0 var(--space-2);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  letter-spacing: var(--tracking-caps);
  text-transform: uppercase;
  color: var(--color-text-secondary);
}

.landing-lede {
  margin: 0 0 var(--space-3);
  font-size: var(--text-2xl);
  line-height: var(--leading-display);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-tight);
}

.landing-formats {
  margin: 0 0 var(--space-4);
  font-size: var(--text-body);
  line-height: var(--leading-body);
}

.landing-steps {
  display: grid;
  gap: var(--space-3);
  margin: var(--space-5) 0 0;
  padding: 0;
  list-style: none;
}

.landing-steps li {
  display: grid;
  grid-template-columns: var(--step-number-size) minmax(0, 1fr);
  gap: var(--space-3);
  align-items: start;
  font-size: var(--text-body);
  line-height: var(--leading-body);
}

.landing-step-n {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--step-number-size);
  height: var(--step-number-size);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-variant-numeric: var(--numeric);
  color: var(--color-text-secondary);
  border: var(--border-1) solid var(--color-border);
  border-radius: var(--radius-2);
}

.landing-figure {
  margin: 0;
}

.landing-photo {
  display: block;
  width: 100%;
  height: auto;
  border: var(--border-1) solid var(--color-border-subtle);
  border-radius: var(--radius-2);
}

.landing-credit {
  margin-top: var(--space-2);
  font-size: var(--text-xs);
  line-height: var(--leading-body);
  color: var(--color-text-tertiary);
}

/* ---- Form ---- */

.upload-form {
  max-width: var(--measure-prose);
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--field-min)), 1fr));
  gap: var(--space-2) var(--space-4);
}

.form-actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-4);
}

.load-result {
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  background: var(--color-bg-panel);
  border: var(--border-1) solid var(--color-border-subtle);
  border-radius: var(--radius-2);
}
```

Update `UploadScreen.tsx`'s header-comment paragraph that begins "The intro band (docs/adr/0017)" to: "The landing band (docs/adr/0009, amended 2026-09-29) carries the kicker, the lede, the input-coding link (still the section's first tab stop), the demo actions, the synthetic-data note, four numbered steps and a public-domain USDA ARS photograph with its credit; the form follows under the heading."

c.4 Tests:

- `tests/upload-screen.test.tsx`: add `it('credits the photograph and marks it decorative', () => { expect(html).toContain('Photo: Anna Locke, USDA Agricultural Research Service (public domain).'); expect(html).toMatch(/<img[^>]*class="landing-photo"[^>]*alt=""/); });` and `it('keeps the input-coding link ahead of the demo button', () => { expect(html.indexOf('input-coding-link')).toBeLessThan(html.indexOf('Try the demo dataset')); });`.
- `tests/hero-asset.test.ts` (new, node): reads `src/ui/assets/hero-soybean-plots.webp`; asserts it exists, is at most 120,000 bytes, and that its first four bytes are `RIFF` and bytes 8 to 12 are `WEBP`; asserts `scripts/process-hero.py` exists and contains `D4630-1`.

Acceptance: the five gates; `tests/upload-screen.test.tsx` and `tests/hero-asset.test.ts` green; `CI=true npm run test:browser` green, notably `demo.test.tsx`, `focus-order.test.tsx` (first Tab after the rail lands on the input-coding link) and `a11y-axe` on the Upload screen; `npm run a11y:lighthouse` above 90 (Lighthouse audits this screen under mobile emulation, where `auto-fit` stacks the photograph under the copy). Visual at 1280 px with the rail expanded: two columns, copy left, plate right, credit under it, then "Upload and validate" and the form at prose width.

### Phase d: chromosome browser

Depends on a. Parallel with b, c, e.
Files touched: `src/ui/screens/GenotypeViewScreen.tsx`, `src/ui/screens/genotype.css`, `src/ui/canvas/GraphicalGenotypeRenderer.ts` (the `trackLayouts` method and its header line only), `src/ui/canvas/read-theme.ts`, `src/ui/canvas/ruler.ts` (new), `tests/ruler.test.ts` (new), `tests/viewport.test.ts` (one expectation).
Must not touch: `tokens.css`, `base.css`, `screens.css`, `legend.css`, `textures.ts`, `binning.ts`, `line-binning.ts`, `row-window.ts`, anything under `src/core/` or `src/workers/`, `src/App.tsx`, `src/ui/lines/*`. Nothing the renderer draws changes: `draw()`, `hitTest()`, `setRowWindow()`, the overview and the report are untouched.

Frozen: every class name a browser test selects (`.geno-canvas-host`, `canvas.geno-canvas`, `.geno-strip-track`, `.geno-gutter li`, `.geno-toolbar`, `.marker-detail`, `.marker-detail-text`, `.geno-scroll`, `.keyboard-help`, `.legend`, `.class-swatch`); the accessible names `View` (combobox), `Region` (textbox), `Apply`, `Whole genome`, `Lines` (the gutter list); the canvas `aria-label`s; `NO_HOVER_MESSAGE`; `formatDetail`'s output; the two keyboard-help sentences; the legend items.

d.1 `src/ui/canvas/ruler.ts` (new):

```ts
/**
 * Ruler ticks for a chromosome header track (docs/adr/0009, amended
 * 2026-09-29).
 *
 * Responsibility: choose a 1-2-5 step in base pairs whose spacing on a track
 * clears a minimum pixel gap, and place labelled ticks at its multiples. Pure,
 * no DOM, so tests/ruler.test.ts runs it in Node. The screen reads the gap
 * from --ruler-tick-min-gap (read-theme.ts) and the track geometry from
 * GraphicalGenotypeRenderer.trackLayouts(), so this file holds no dimension.
 *
 * Interface:
 *   tickStep(spanBp, widthPx, minGapPx) -> step in bp, or null when no step
 *     from 1 kb to 500 Mb fits
 *   formatMb(bp, stepBp) -> the position in Mb with as many decimals as the
 *     step needs: 0 at 1 Mb and above, 1 at 100 to 500 kb, 2 at 10 to 50 kb,
 *     3 at 1 to 5 kb
 *   rulerTicks(startBp, endBp, widthPx, minGapPx) -> RulerTick[]; the last
 *     tick's label carries the unit; a track that fits fewer than two ticks
 *     gets none, since a lone "0 Mb" on a 30 px whole-genome track says
 *     nothing. `align` keeps a label inside its track: 'start' within half a
 *     gap of the left edge, 'end' within half a gap of the right edge.
 */
export interface RulerTick {
  bp: number;
  /** CSS pixels from the track's left edge. */
  x: number;
  label: string;
  align: 'start' | 'center' | 'end';
}

const MANTISSAS = [1, 2, 5];
const MIN_EXPONENT = 3;
const MAX_EXPONENT = 8;

export function tickStep(spanBp: number, widthPx: number, minGapPx: number): number | null {
  if (!(spanBp > 0) || !(widthPx > 0) || !(minGapPx > 0)) return null;
  for (let exponent = MIN_EXPONENT; exponent <= MAX_EXPONENT; exponent++) {
    for (const mantissa of MANTISSAS) {
      const step = mantissa * 10 ** exponent;
      if ((widthPx * step) / spanBp >= minGapPx) return step;
    }
  }
  return null;
}

export function formatMb(bp: number, stepBp: number): string {
  const decimals = Math.max(0, 6 - Math.floor(Math.log10(stepBp)));
  return (bp / 1e6).toFixed(decimals);
}

export function rulerTicks(
  startBp: number,
  endBp: number,
  widthPx: number,
  minGapPx: number,
): RulerTick[] {
  const span = endBp - startBp;
  const step = tickStep(span, widthPx, minGapPx);
  if (step === null) return [];
  const ticks: RulerTick[] = [];
  const first = Math.ceil(startBp / step) * step;
  for (let bp = first; bp <= endBp; bp += step) {
    const x = ((bp - startBp) / span) * widthPx;
    const align = x < minGapPx / 2 ? 'start' : x > widthPx - minGapPx / 2 ? 'end' : 'center';
    ticks.push({ bp, x, label: formatMb(bp, step), align });
  }
  if (ticks.length < 2) return [];
  const last = ticks[ticks.length - 1];
  if (last !== undefined) last.label = `${last.label} Mb`;
  return ticks;
}
```

d.2 `tests/ruler.test.ts` (new, node), asserting exactly:

- `tickStep(1_000_000, 1200, 56)` is `50_000`; `tickStep(55_000_000, 800, 56)` is `5_000_000`; `tickStep(55_000_000, 30, 56)` is `200_000_000`; `tickStep(0, 800, 56)`, `tickStep(1e6, 0, 56)` and `tickStep(1e6, 800, 0)` are `null`.
- `formatMb(10_300_000, 50_000)` is `'10.30'`; `formatMb(5_000_000, 5_000_000)` is `'5'`; `formatMb(200_000, 100_000)` is `'0.2'`; `formatMb(1_500, 1_000)` is `'0.002'` and `formatMb(2_500, 1_000)` is `'0.003'` (both run under Node 24).
- `rulerTicks(0, 55_000_000, 800, 56)` has 12 ticks; `ticks[0]` is `{ bp: 0, x: 0, label: '0', align: 'start' }`; `ticks[11]` is `{ bp: 55_000_000, x: 800, label: '55 Mb', align: 'end' }`; `ticks[5]` has `label: '25'` and `align: 'center'`.
- `rulerTicks(10_250_000, 10_750_000, 600, 56)` has 11 ticks with labels `['10.25', '10.30', '10.35', '10.40', '10.45', '10.50', '10.55', '10.60', '10.65', '10.70', '10.75 Mb']`.
- `rulerTicks(0, 1_000_000, 800, 56)` has 11 ticks, first label `'0.0'`, last `'1.0 Mb'`.
- `rulerTicks(0, 55_000_000, 30, 56)` is `[]` (one tick would fit; none is shown); `rulerTicks(5, 5, 800, 56)` is `[]`.

d.3 `GraphicalGenotypeRenderer.ts`: add, next to `Viewport`, `export interface TrackLayout { chrom: string; x: number; widthPx: number; startBp: number; endBp: number; }` with the doc line "One chromosome track as the screen's header sees it: x includes the label column; startBp and endBp are the window drawn." Change `trackLayouts()` to return `TrackLayout[]` and map `startBp: c.startBp, endBp: c.endBp` alongside the three existing fields; update header line 55 to `trackLayouts() — TrackLayout[]: { chrom, x, widthPx, startBp, endBp } for the chromosome header`. No other line of the file changes.

`tests/viewport.test.ts` line 180 becomes `expect(renderer.trackLayouts()).toEqual([{ chrom: 'Gm01', x: 120, widthPx: 800, startBp: 0, endBp: CHROM_A_LENGTH_BP }]);` and the first `trackLayouts` case gains `expect(tracks[1]?.endBp).toBe(CHROM_B_LENGTH_BP);`.

d.4 `read-theme.ts`: add, after `readOverviewHeight`:

```ts
/** The ruler's smallest tick spacing in CSS pixels, from --ruler-tick-min-gap (src/ui/canvas/ruler.ts). */
const DEFAULT_RULER_TICK_MIN_GAP = 56;

export function readRulerTickMinGap(el: Element): number {
  return readPx(getComputedStyle(el), '--ruler-tick-min-gap', DEFAULT_RULER_TICK_MIN_GAP, true);
}
```

and add `readRulerTickMinGap(el) -> number` to the header's Interface list, with the sentence "the screen holds no dimension of its own to fall back to" already there covering it.

d.5 `GenotypeViewScreen.tsx`:

- Imports: `import { rulerTicks } from '../canvas/ruler.ts';`, `import { readRulerTickMinGap } from '../canvas/read-theme.ts';` (alongside the existing read-theme imports), and `import type { TrackLayout } from '../canvas/GraphicalGenotypeRenderer.ts';`. The `tracks` state becomes `useState<TrackLayout[]>([])`.
- Add `const [tickMinGap, setTickMinGap] = useState<number | null>(null);` and, in the effect that calls `readRendererLayout(host)` on the canvas host, also call `setTickMinGap(readRulerTickMinGap(host));`. The screen holds no dimension of its own: `null` means no ticks (`rulerTicks` is not called), and the fallback lives in read-theme.ts.
- After `<h2>Graphical genotypes</h2>` add `<p className="lede">One row per line in the Lines table's order, one track per chromosome. Drag on the canvas or type a region to zoom; hover a column for the marker under it.</p>`.
- Toolbar: the two `<label>`s become `<label className="geno-field"><span className="geno-field-label">View</span><select ...>` and `<label className="geno-field"><span className="geno-field-label">Region</span><input ...>`; the `<form>` gains `className="geno-region-form"`. Controls and handlers are unchanged. (An accessible name computed from a wrapping label excludes the named control itself, so `View` and `Region` still name them.)
- `<p>No lines to draw.</p>` becomes `<p className="empty-state">No lines to draw.</p>`; `<p>Load a dataset first.</p>` becomes `<p className="empty-state">Load a dataset first.</p>`.
- Replace the `geno-plot` block's contents (the strip, the scroller and the overview) with:

```tsx
<div className="geno-plot">
  <div className="geno-frame">
    {/* Chromosome header: a corner over the gutter, then one track per
                chromosome placed from the renderer's own layout in CSS pixels
                (measurements, not design values, so they stay inline). Each
                track is its name, an ideogram bar and a Mb ruler
                (ui/canvas/ruler.ts). */}
    <div className="geno-header">
      <div className="geno-corner">{nRows} lines</div>
      <div className="geno-strip">
        {tracks.map((track) => {
          const ticks =
            tickMinGap === null
              ? []
              : rulerTicks(track.startBp, track.endBp, track.widthPx, tickMinGap);
          return (
            <div
              key={track.chrom}
              className="geno-strip-track"
              style={{ left: track.x, width: track.widthPx }}
            >
              <div className="geno-strip-head">
                <span className="geno-strip-name">{track.chrom}</span>
                {windowEdges !== null && (
                  <span className="geno-strip-window">
                    <span>{mbLabel(windowEdges.startBp)}</span>
                    <span>{mbLabel(windowEdges.endBp)}</span>
                  </span>
                )}
              </div>
              <div className="geno-ideogram" aria-hidden="true" />
              <div className="geno-ruler" aria-hidden="true">
                {ticks.map((tick) => (
                  <span
                    key={tick.bp}
                    className="geno-tick"
                    data-align={tick.align}
                    style={{ left: tick.x }}
                  >
                    {tick.label}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>

    {/* the existing <div ref={scrollerRef} className="geno-scroll" ...> block, unchanged */}

    {/* the existing overview <canvas>, unchanged */}
  </div>
</div>
```

- Wrap the legend: replace `<ul className="legend" aria-label="Class legend">...</ul>` with `<div className="geno-key"><span className="geno-key-title">Key</span><ul className="legend" aria-label="Class legend">` (list items unchanged) `</ul></div>`, and move this `geno-key` block to sit directly after the closing `</div>` of `geno-layout`, before the two `keyboard-help` paragraphs.
- Update the header comment's paragraph on the chromosome strip: "The chromosome header labels each track from renderer.trackLayouts(): its name, the drawn window's edges when zoomed, an ideogram bar and a Mb ruler whose 1-2-5 step is chosen by ui/canvas/ruler.ts to clear --ruler-tick-min-gap."

d.6 `genotype.css`. Replace the `.geno-toolbar`, `.geno-strip`, `.geno-strip-track`, `.geno-strip-window`, `.geno-overview`, `.marker-detail`, `.marker-detail h3`, `.marker-detail-text`, `.keyboard-help`, `.legend` and `.legend li` rules with the following; leave `.geno-layout`, `.geno-plot`, `.geno-scroll`, `.geno-gutter*`, `.geno-canvas-host`, `.geno-canvas` and the print block as they are, except for the two additions named at the end.

```css
.geno-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  align-items: flex-end;
  margin-bottom: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-subtle);
  border-bottom: var(--border-1) solid var(--color-border-subtle);
}

.geno-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.geno-field-label {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.geno-region-form {
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
}

/* The plot and its header share one frame, the same 1 px rule tables use. */
.geno-frame {
  background: var(--color-bg-plot);
  border: var(--border-1) solid var(--color-plot-frame);
  border-radius: var(--radius-1);
}

/*
 * Chromosome header: a corner over the gutter, then one absolutely positioned
 * track per chromosome placed from renderer.trackLayouts(), so a name, its
 * ideogram and its ruler sit over the pixels they describe.
 */
.geno-header {
  display: flex;
  align-items: stretch;
  border-bottom: var(--border-1) solid var(--color-border-subtle);
}

.geno-corner {
  display: flex;
  flex: none;
  align-items: flex-end;
  box-sizing: border-box;
  width: var(--gutter-width);
  padding: var(--space-1);
  font-size: var(--text-xs);
  font-variant-numeric: var(--numeric);
  color: var(--color-text-secondary);
  border-right: var(--border-1) solid var(--color-border);
}

.geno-strip {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  height: var(--chromosome-strip-height);
  overflow: hidden;
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.geno-strip-track {
  position: absolute;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  height: 100%;
  padding-top: var(--space-1);
  overflow: hidden;
}

.geno-strip-head {
  display: flex;
  gap: var(--space-2);
  align-items: baseline;
  padding: 0 var(--space-1);
}

.geno-strip-name {
  font-weight: var(--weight-medium);
  color: var(--color-text);
}

.geno-strip-window {
  display: flex;
  flex: 1;
  justify-content: space-between;
  font-variant-numeric: var(--numeric);
}

/* Ideogram: a rounded bar on the neutral ramp (docs/adr/0007); no centromere, since the schemes carry none. */
.geno-ideogram {
  height: var(--ideogram-height);
  background: var(--color-ideogram-fill);
  border: var(--border-1) solid var(--color-ideogram-stroke);
  border-radius: var(--ideogram-height);
}

.geno-ruler {
  position: relative;
  height: var(--ruler-height);
  font-variant-numeric: var(--numeric);
  color: var(--color-ruler-label);
}

/* A tick is a label with its mark drawn above it; alignment keeps end labels inside the track. */
.geno-tick {
  position: absolute;
  top: 0;
  padding-top: var(--space-1);
  line-height: var(--leading-tight);
  transform: translateX(-50%);
}

.geno-tick::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  height: var(--space-1);
  border-left: var(--border-1) solid var(--color-ruler);
}

.geno-tick[data-align='start'] {
  transform: none;
}

.geno-tick[data-align='start']::before {
  left: 0;
}

.geno-tick[data-align='end'] {
  transform: translateX(-100%);
}

.geno-tick[data-align='end']::before {
  left: 100%;
}

.geno-overview {
  margin-top: 0;
  margin-left: var(--gutter-width);
  border-top: var(--border-1) solid var(--color-border-subtle);
}

/* The readout: a panel one step above the page, titled like every other panel. */
.marker-detail {
  flex: none;
  width: var(--detail-panel-width);
  padding: var(--space-3);
  background: var(--color-bg-panel);
  border: var(--border-1) solid var(--color-border-subtle);
  border-radius: var(--radius-1);
  font-variant-numeric: var(--numeric);
}

.marker-detail h3 {
  margin: 0 0 var(--space-2);
  padding-bottom: var(--space-1);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-secondary);
  border-bottom: var(--border-1) solid var(--color-border-subtle);
}

.marker-detail-text {
  margin: 0;
  min-height: calc(4 * var(--text-sm) * var(--leading-body));
  font-size: var(--text-sm);
  line-height: var(--leading-body);
}

/* The key under the plot: title, then the legend the print test inks. */
.geno-key {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-5);
  margin-top: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: var(--border-1) solid var(--color-border-subtle);
  border-radius: var(--radius-1);
}

.geno-key-title {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-secondary);
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.legend li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.keyboard-help {
  margin: var(--space-2) 0 0;
  font-size: var(--text-sm);
  color: var(--color-text-tertiary);
}
```

Additions to rules that stay: `.geno-gutter` gains `border-right: var(--border-1) solid var(--color-border);` (box-sizing is already border-box, so the width does not change); the print block gains `.geno-frame { border: 0; }` and `.geno-key { border: 0; padding: 0; }`.

Acceptance: the five gates; `tests/ruler.test.ts` and `tests/viewport.test.ts` green; `CI=true npm run test:browser` green, in particular `genotype-view`, `theme-tokens` (it still finds `.geno-strip-track` and `.geno-canvas-host`), `print-media` (toolbar and readout hidden, canvas, gutter and legend present), `focus-not-obscured`, `non-colour-cues`, `density` and `a11y-axe`; `npm run test:bench` figures within noise of the 2026-09-27 ones (the ruler is a few dozen spans per redraw). Visual on `?demo=synthetic`, step 4: the whole-genome view shows twenty named tracks with ideogram bars and, on the wider tracks, ruler ticks; selecting one chromosome shows its ideogram across the plot with ticks every 5 Mb at 800 px; zooming to a 500 kb region shows ticks every 50 kb labelled to two decimals with `Mb` on the last; the gutter has a right rule; the key sits under the frame; the readout is a white panel.

### Phase e: Summary, Lines, Compare, Export

Depends on a. Parallel with b, c, d.
Files touched: `src/ui/screens/SummaryScreen.tsx`, `src/ui/screens/CompareScreen.tsx`, `src/ui/screens/ExportScreen.tsx`, `src/ui/screens/LineTableScreen.tsx` (two lines), `src/ui/screens/screens.css`.
Must not touch: `tokens.css`, `base.css`, `upload.css`, `genotype.css`, `src/ui/lines/*` (the action bar and the APG grid stay as they are), `src/App.tsx`, `src/ui/shell/*`, any export module.

Frozen: every button label on the Export screen and every download file name (tests/export-ids.test.ts); `Dataset summary and QC`, `Lines`, `Compare two lines`, `Export` headings; `Load a dataset first.`; the Summary list item texts (`500 markers` is matched exactly by demo and load-path tests); `Select all visible` as the Lines and Genotypes screens' first tab stop; `Sample A` as Compare's; `Download per-line summary CSV` as Export's; the table header texts.

e.1 `screens.css`: replace the "---- Shared ----" section with the block below. Note that `.data-table tbody tr:hover` outranks `.qc-flagged` by specificity, so a flagged row shows the hover fill while hovered and its own fill otherwise; that is intended, not a defect to fix.

```css
/* ---- Shared ---- */

.data-table {
  border-collapse: collapse;
  font-variant-numeric: var(--numeric);
}

.data-table caption {
  padding: 0 0 var(--space-2);
  text-align: left;
  font-weight: var(--weight-medium);
  color: var(--color-text-secondary);
}

.data-table th,
.data-table td {
  height: var(--row-height);
  padding: 0 var(--cell-padding-x);
  text-align: left;
  white-space: nowrap;
  border-bottom: var(--border-1) solid var(--color-border-subtle);
}

.data-table thead th {
  font-weight: var(--weight-medium);
  color: var(--color-text-secondary);
  border-bottom: var(--border-2) solid var(--color-border);
}

.data-table th.num,
.data-table td.num {
  text-align: right;
}

.data-table .mono {
  font-family: var(--font-mono);
}

.data-table tbody tr:hover {
  background: var(--color-bg-row-hover);
}

/* Dataset facts: one line of counts, rules between them, on the panel surface. */
.facts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) 0;
  margin: 0 0 var(--space-4);
  padding: var(--space-2) 0;
  list-style: none;
  background: var(--color-bg-panel);
  border: var(--border-1) solid var(--color-border-subtle);
  border-radius: var(--radius-1);
  font-size: var(--text-body);
  font-variant-numeric: var(--numeric);
}

.facts li {
  padding: 0 var(--space-4);
  border-left: var(--border-1) solid var(--color-border-subtle);
}

.facts li:first-child {
  border-left: 0;
}

/* The Export screen: one row per download, the note beside its button. */
.export-list {
  max-width: var(--measure-prose);
  margin: 0;
  padding: 0;
  list-style: none;
}

.export-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
  padding: var(--space-3) 0;
  border-bottom: var(--border-1) solid var(--color-border-subtle);
}

.export-list li > span {
  color: var(--color-text-secondary);
}

.export-list li > ul {
  flex-basis: 100%;
  margin: 0;
  color: var(--color-text-secondary);
}
```

e.2 `SummaryScreen.tsx`: after the `<h2>` add `<p className="lede">Dataset counts, the parent polymorphism rate, informative-marker gaps and per-line QC against the thresholds set on the Upload screen.</p>`. The `<ul>` of counts (markers, informative markers, roles) becomes `<ul className="facts">`; its item texts do not change. The warnings `<ul>` above it stays as it is. In the per-line QC table, add `className="num"` to the `<th>` and `<td>` of `missing rate (all markers)`, `het rate (called)` and `nonparental rate (informative called)`, and `className="mono"` to the `sample_id` `<td>`. `<p>Load a dataset first.</p>` becomes `<p className="empty-state">Load a dataset first.</p>`.

e.3 `CompareScreen.tsx`: after the `<h2>` add `<p className="lede">Pairwise concordance between two samples over informative or all markers, with the discordant markers listed.</p>`. In the `Discordance by chromosome` table add `className="num"` to the `<th>` and `<td>` of `n_compared`, `n_discordant` and `discordant rate`, and `className="mono"` to the `chrom` `<td>`. The empty state `<p>` gets `className="empty-state"`.

e.4 `ExportScreen.tsx`: the existing `<p>Files are generated in this browser tab and are never uploaded anywhere.</p>` gets `className="lede"`; the `<ul>` of downloads becomes `<ul className="export-list">`; nothing inside an `<li>` changes. The empty state `<p>` gets `className="empty-state"`.

e.5 `LineTableScreen.tsx`: after `<h2>Lines</h2>` add `<p className="lede">One row per line with recurrent-parent proportion, coverage and segment counts; sorting, filtering and selecting here also drive the graphical genotypes.</p>`; the empty state `<p>` gets `className="empty-state"`. Nothing else in the file changes.

Acceptance: the five gates; `tests/export-ids.test.ts` and `tests/line-table.test.tsx` green untouched; `CI=true npm run test:browser` green, in particular `lines-grid-keyboard`, `focus-not-obscured` (the sticky Lines header is not touched), `focus-order` (the ledes are not focusable, so each screen's first tab stop is unchanged) and `print-media`. Visual: numbers right-aligned in the two `.data-table`s, facts on one ruled line, downloads as ruled rows.

### Phase f: records

Depends on a to e merged.
Files touched: `docs/ui-rework-phases.md` (new: this spec, copied verbatim), `docs/README.md` (one index line), `docs/adr/0009-interface-design-language.md`, `docs/adr/0017-rename-crop-palette-demo-data.md`, `docs/design-brief.md`, `CHANGELOG.md`, `CLAUDE.md`, `docs/user-guide.md` (descriptions only).
Must not touch: code, tests, `PLAN.md`, `contract/`.

f.0 Copy this document to `docs/ui-rework-phases.md`, run `npm run format` (prettier reformats the fenced code blocks; the text is not edited), and add to `docs/README.md`, in the list where `m5-phases.md` is indexed and in the same form as its neighbours, a line for `ui-rework-phases.md` described as "the 2026-09-29 interface rework: survey, tokens, mark, imagery and six phases" (tests/docs-index.test.ts checks that every file under docs/ is indexed; read its rule before writing the line).

f.1 Append to `docs/adr/0009-interface-design-language.md`:

```markdown
## Amendments, 2026-09-29

The first public release found the interface correct and dull: a rail, a light page and native controls, with nothing that told a visitor whose tool this was or how to cite it. The maintainer asked for the look of a credible scientific webserver and delegated the design to research; the spec is docs/ui-rework-phases.md, and the survey behind it is section 1 there and docs/design-brief.md's addendum of this date. The sections above are left as first written.

**A static masthead carries the brand; the rail carries the steps.** "A collapsible left rail of the six steps over a light content area" holds, but the tool's name, version, commit and project links move to a full-width soil-900 band above rail and content, the slim dark masthead that Ensembl (32 px), Galaxy (40 px), JBrowse 2 (48 px), BlobToolKit (68 px), SoyBase and LIS (80 px) all put over a light data surface and that a rail alone lacks. It is never sticky, because SC 2.4.11 is asserted by tests and a sticky band would reopen it; on paper it is not printed. Two soil steps, `--crop-soil-800` and `--crop-soil-300`, join the crop palette for its hover fill and muted text, and its focus ring is parchment, since leaf-900 vanishes on soil. Every text and ring pair on it is asserted by tests/tokens.test.ts.

**The mark is a chromosome pair with one introgressed segment.** The seed and leaf of docs/adr/0017 are retired. The segment is the bar's own colour at 40 % opacity, not a hue, so it cannot be read as a genotype class; the mark is single-colour by construction and is the favicon. Wheat gold now appears nowhere on screen; the token stays so that ADR 0017's enumeration and its collision measurements remain true.

**A footer cites the tool.** Version, commit, licence and a citation sentence pointing at CITATION.cff (docs/adr/0030) sit at the foot of the content column on every screen and print.

**The Upload screen opens with a landing band.** A kicker, a one-sentence question, a three-sentence answer, the input-coding link, the demo actions, four numbered steps and one photograph: USDA ARS image D4630-1 (Anna Locke, public domain), cropped and rendered as a duotone from soil-900 to parchment-100 by scripts/process-hero.py, so it is built from the chrome's own tokens and sits beside the copy, never under it. The credit is its caption.

**The chromosome strip is a chromosome header.** Each track shows its name, an ideogram bar and a Mb ruler whose 1-2-5 step src/ui/canvas/ruler.ts chooses to clear `--ruler-tick-min-gap`; the renderer's `trackLayouts()` reports each track's drawn window for it. Ideogram, ruler and frame stay on the neutral ramp, as everything the canvas touches does (docs/adr/0007). The plot, its header and the overview share one 1 px frame; the key sits under it; the readout is a panel.

**Two display sizes exist for the landing alone.** `--text-2xl` and `--text-3xl`; the 13 px interface and 14 px prose sizes are unchanged and still pinned by tests.
```

f.2 Append to `docs/adr/0017-rename-crop-palette-demo-data.md`:

```markdown
## Amendment, 2026-09-29

The seed-and-leaf mark this record introduced is retired for a chromosome-pair mark (docs/adr/0009, amendment of this date), and the intro band's wheat-gold edge went with the band. Wheat gold therefore appears nowhere on screen. `--crop-wheat-500` is kept so that the enumeration above, the 2026-09-26 distance measurements and tests/tokens.test.ts stay true; removing it is a separate, trivial decision. Two soil steps were added for the masthead; neither is an Okabe-Ito member and both are measured in that amendment.
```

f.3 `CHANGELOG.md`, under `## [Unreleased]`, a `### Changed` section (create it if absent, in the order Keep a Changelog uses and tests/changelog.test.ts checks):

```markdown
- The interface was reworked for the public release (docs/adr/0009, amended 2026-09-29): a masthead with a chromosome-pair mark, the version and commit, and links to the user guide, data formats, citation and source; a footer with the citation on every screen; a landing band on the Upload screen with four numbered steps and a public-domain USDA ARS photograph; per-chromosome ideograms and Mb rulers over the graphical genotypes, with the plot framed and the legend set as a key; and consistent tables, panels, fieldsets and file pickers. Class colours, textures, keyboard behaviour, the data contract and every export are unchanged.
```

f.4 `docs/design-brief.md`: append `## Addendum, 2026-09-29: the public-release rework`, consisting of section 1 of this spec (the survey, with its URLs), section 2's paragraph and the do/don't list, the imagery table of section 5 (URL, licence, credit, processing), and one closing sentence: "The five-user test the brief asked for is still owed."

f.5 `CLAUDE.md`, in "State", append one sentence after the M5 sentence: "The interface was reworked on 2026-09-29 from docs/ui-rework-phases.md (docs/adr/0009 and 0017, amendments of that date): masthead, footer, landing band, chromosome header; `src/ui/screens/screens.css` is split into `screens.css`, `upload.css` and `genotype.css`."

f.6 `docs/user-guide.md`: `grep -n "intro band\|rail\|heading\|Try the demo\|leaf\|seed" docs/user-guide.md` and reword only sentences that describe what a reader sees on the Upload screen or in the rail's head so they match the new screen (masthead carries the name; the demo button sits in the landing band under the lede). Add no section.

Acceptance: `npm test` (tests/changelog.test.ts, tests/docs-index.test.ts, tests/citation.test.ts), `npm run lint` (prettier formats Markdown), and a read-through that every claim in f.1 names a file that exists after phases a to e.

---

## 7. Decisions taken here, with the reasoning

1. **Masthead above a parchment rail, not a dark rail.** A dark sidebar over light content is the admin-template shape; a slim dark band over a light data surface is what JBrowse, Ensembl, Galaxy and UCSC do. It also leaves every tested rail pair alone.
2. **The masthead is static, not sticky.** SC 2.4.11 is asserted by `focus-not-obscured.test.tsx`; a sticky band would obscure elements the browser scrolls into view. Cost: the brand scrolls away on a long Lines table. Accepted.
3. **Wheat gold stays decorative and unused, rather than becoming the rail's current-step indicator.** ADR 0017's 2026-09-26 amendment keeps it away from the canvas because it is within CIEDE2000 10 of donor vermilion under deuteranopia; a rail indicator sits beside the canvas on step 4. The token is retained so the record's enumeration stays true.
4. **The mark's segment is a tint, not a colour.** A gold or brown segment would teach that donor is gold when every legend says vermilion.
5. **One photograph, USDA ARS D4630-1, over the Wikimedia aerial.** Public domain with a courtesy credit beats CC BY 2.0 with a checkoff-board credit, and research plots are the audience's own subject. Duotone from the tokens, beside the copy: no text over a photo, no unmeasurable contrast, no stock colour.
6. **Photo processed with Pillow via `py -3`, checked in as a 105 kB WebP, imported as a module.** `sharp` is not installed and would be a dev dependency for one image. A module import keeps the relative-base release zip working; a `public/` URL would not.
7. **No `srcset`.** A `sizes` attribute needs a px literal in a component file, which ESLint forbids; one 1200 px image at 105 kB is cheaper than the exception.
8. **The ruler is HTML spans from a pure function, not drawn on the canvas.** It keeps the renderer's drawing untouched, is unit-testable in Node, and prints like text. The renderer only reports each track's window.
9. **`trackLayouts()` gains two fields instead of a new method.** Additive, one test expectation changes, and the strip already consumes it.
10. **No centromere on the ideogram.** The crop schemes carry chromosome names and lengths, not centromere positions; drawing one would be invented data.
11. **Window-edge labels stay beside the ruler when zoomed.** The ruler shows rounded ticks; the edges show the exact window the user typed.
12. **`screens.css` is split in phase a.** Otherwise c, d and e collide in one file and cannot run in parallel worktrees.
13. **Ledes are `<p class="lede">`, not `<h2>` subtitles, and the landing's display line is a `<p>`.** The rail test and the demo tests pin the `<h2>` texts; a second `<h1>` would break heading order.
14. **`Load` becomes a primary button.** ADR 0009's "one per screen at most" is read per region: the landing band has the demo button, the form has Load. If the maintainer prefers the strict reading, drop `button-primary` from Load; nothing else depends on it.
15. **File pickers are styled through `::file-selector-button` rather than replaced.** Replacing them would change the labels the browser tests upload through.
16. **The corner label reads "6 lines", not "Lines: 6".** `Lines: 6,` is a regex the browser tests match against the action-bar readout.
17. **No dark theme.** `tokens.css` has none; adding one is a separate decision with a full contrast matrix.
18. **No responsive work beyond `auto-fit` grids.** A media query needs a literal length, which the stylesheet test forbids; `auto-fit` with `min(100%, var(--x))` stacks the landing and the field grids under mobile emulation, which is all Lighthouse exercises.
19. **The footer sits inside `<main>`.** The shell grid has no row for it; inside the content column it prints with the data and reaches the skip link's target.
20. **The old `upload-hero` and `rail-logo` rules are deleted, not kept.** No test names them (verified by grep across `tests/`).
21. **Under mobile emulation the masthead wraps to two lines and the rail's `calc(100vh - var(--masthead-height))` overshoots by one line.** Accepted: the rail already does not fit a 412 px viewport, Lighthouse audits accessibility only, and a second token for a wrapped height would be a guess.
22. **The footer does not repeat the privacy sentence.** It is in the rail (pinned by a test), the landing lede and the Export screen; a fourth copy reads as nervousness.
23. **A photograph now, a product image later.** The survey's strongest landings show the product or real data (JBrowse, BlobToolKit, Nextstrain) and photography appears in the weaker sites, always spoiled by text laid over it. The maintainer asked for free-use imagery, so the landing carries one duotone plate with the copy beside it and the demo button one click from the real product. Once phases b to e have landed, a follow-up may replace or join the plate with a 1200 by 600 PNG of the demo's graphical genotype view (captured from the built site, saved under `src/ui/assets/`, same `<figure>` and caption slot with the caption "The demo dataset's graphical genotypes: six synthetic lines, twenty chromosomes."); capturing it before then would freeze a screen this spec changes.
