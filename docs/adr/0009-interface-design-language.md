# Domain-native interface: left rail, linked table and canvas, neutral chrome, React Aria, IBM Plex

Status: accepted. Date: 2026-09-11. Format: MADR 4.0.0 [web] https://adr.github.io/madr/.

## Context and Problem Statement

M1 and M2 built working screens with inline styles, native controls and no design tokens: twenty `style` attributes, no stylesheet, `system-ui`, and a bundle with three runtime dependencies. The numbers are right and the interaction is sound, but the tool looks unfinished, and a breeder is being asked to trust it with unreleased line data. A second requirement was that it must not read as machine-generated from a component-library default.

The screens also drifted apart. The Lines table and the graphical genotype share only a set of sample ids, so sorting one does nothing to the other, and neither reports how much of the dataset a filter is hiding.

What visual and interaction language should the six screens use, and what may it cost in dependencies?

## Decision Drivers

Users are breeders and graduate students fluent in R who already use Flapjack, TASSEL and ggplot; the tool must behave like an instrument they recognise. Genotype data never leaves the tab, so no third-party font or asset request. ADR 0001 keeps React as the shell only. ADR 0007 fixes the class palette. M3 owes a Lighthouse accessibility score above 90. Colour is never the only carrier of meaning. The bundle is 244 kB and static-hosted.

## Considered Options

1. Keep native controls and hand-write CSS, adding no dependency.
2. Adopt a styled component library (shadcn/ui, Material UI, Mantine).
3. Adopt a headless accessibility library and write all styling, with self-hosted typography.

## Decision Outcome

Option 3: React Aria for behaviour, IBM Plex Sans and Mono self-hosted, all styling ours. The reasoning and the sources are in docs/design-brief.md; this record carries the decisions.

**Layout.** A collapsible left rail of the six steps over a light content area, matching every tool surveyed in this field (Flapjack, Germinate, Galaxy, Geneious, SnapGene, JBrowse 2); none uses a dark data surface. Not a wizard, because users move back and forth between table and canvas and only the parent declaration is a real gate. The genotype canvas is surrounded by its context the way Flapjack's is, with labels in a fixed left gutter and the overview below, rather than having controls float over data.

**The table and the canvas become one selection model.** Sorting or filtering either reorders both, and selection is shared. The Lines table gains a single action bar with a live count of total, visible and selected lines. This is Flapjack's behaviour and the most valuable interaction we are missing.

**Chrome carries no hue.** Okabe-Ito already occupies seven saturated hues, so any chrome accent would collide with a data class. Selection is a neutral fill plus a border-weight change; focus is a high-contrast neutral ring. Structure is 1 px borders, not shadows, following JupyterLab, which ships no elevation tokens because Material Design "is not optimized for dense, information rich UIs".

**Every genotype class gains a texture as well as a colour.** Okabe-Ito is built for hue discriminability under colour-vision deficiency, not luminance separation: recurrent blue against donor vermilion is 1.34:1, so a graphical genotype is unreadable photocopied or in black and white, and three of the six classes fall below the 3:1 that WCAG 2.2 requires for graphical objects. Okabe and Ito's own guidance is to combine colour with shape and pattern, and Flapjack draws heterozygotes as a split diagonal block for this reason. The same mechanism closes the minority-class hatch that ADR 0007 records as outstanding.

**Density is a user control**, defaulting to 32 px rows with 13 px interface type, following Carbon's row heights and JupyterLab's type scale, with Elastic's rule that the reader may override it.

React Aria is chosen over Radix because it ships a real table and grid implementing the W3C APG grid pattern, and Radix has no data grid; this application is a table. Option 2 was rejected because a styled library would have to be fought rather than used, and shadcn/ui in particular is Radix plus Tailwind defaults, which is precisely the generated-looking surface to avoid. Option 1 was rejected because the APG grid pattern is hard to implement correctly and claiming accessibility we had not earned would be worse than not claiming it.

### Consequences

Good: the tool reads as domain software rather than as a template; the table gains correct keyboard and screen-reader behaviour toward the M3 target; the greyscale and WCAG failures above are fixed by one mechanism; a breeder can sort in one view and see the other follow.

Bad: two new runtime dependencies and a font payload, against a project that has kept to three; every component state is ours to specify, which is where hand-built systems fail; the first screens ship slower because nothing is inherited. The mitigation is that every colour and dimension lives in a CSS custom property and no literal value appears in a component file.

Neutral: ADR 0001's "React is used only for the shell" still holds, since React Aria supplies behaviour rather than screens. The class palette of ADR 0007 is unchanged; only its encoding gains a second channel.

## Open question, recorded rather than settled

Where markers are sparser than pixels we fill each marker across the interval nearest it (ADR 0007). GenoTypeMapper deliberately leaves such intervals uncoloured "to omit imprecise representation of the genotypic data". A filled interval can be read as a claim about genotype between markers. Filling only where the flanking markers agree is a middle path. This is not decided here.

## Amendments, 2026-09-11

Implementation planning (docs/m2.5-phases.md) found three places where this record was either contradicted by what the code would have to do, or silent where an implementer needed an answer. The maintainer settled all three. They are recorded here rather than worked around, and the sections above are left as first written.

**One hue is reserved for alerts.** "Chrome carries no hue" above is amended: a single non-Okabe-Ito crimson, `--hue-alert: #a4161a`, carries error and warning text and the alert bar. The reasoning above still holds for everything else, and nothing else in the interface may use it. The specific objection that forced this: with a wholly hueless chrome, an error is signalled by position and font weight alone, which is a thin channel for the one message a breeder cannot afford to miss. The colour is not an Okabe-Ito member, so it cannot be read as a genotype class; it is hue-shifted away from donor vermilion, which leans orange; it is forbidden inside the genotype canvas, so the two never appear together; and it measures 7.75:1 on the page surface and 7.24:1 on the subtle surface, so it carries text at AA rather than only a bar. Red rather than indigo or violet, which docs/design-brief.md rules out on separate signalling grounds. tests/tokens.test.ts asserts that exactly one `--hue-*` token exists and that it satisfies all of the above.

**Two classes stay untextured.** "Every genotype class gains a texture" above is amended to four of six. Recurrent homozygous and uninformative are drawn as plain fills; donor, heterozygous, nonparental and missing are textured. The reasoning: recurrent parent covers most of a near-isogenic line by construction, so texturing it textures nearly the whole canvas and makes the donor segments it is meant to contrast with stand out less, not more; and uninformative is the track background rather than a call about a genome. The two plain fills separate by 3.67:1 in luminance, so they remain distinct from one another in greyscale, and every class that a reader needs to pick out against the recurrent background is textured. The greyscale legibility this record demanded is therefore still delivered; what changes is that it is delivered by four textures rather than six.

**The canvas draws the visible rows, in display order.** This record said the table and the canvas become one selection model but did not say what the canvas draws. M2 drew the selection, or every candidate when the selection was empty. From M2.5 the canvas draws exactly the rows the Lines table is showing, in the order it is showing them, and "draw only my selection" becomes an explicit filter rather than implicit behaviour. The exported report's per-line figures inherit this, so a report shows the lines the user was looking at. This is Flapjack's behaviour and it is what makes the linked sorting in this record observable; under the old rule a filter would have changed the table and left the canvas alone.

## Amendments, 2026-09-15

The accessibility review (docs/m3-phases.md, phase 5) forced these decisions, taken in its spec (docs/m3-phase5-a11y.md), whose open questions the maintainer delegated to research on 2026-09-15; the sections above are left as first written.

**Print shows the data and hides the chrome.** This record said nothing about paper. Under `@media print` the rail, the skip link, the line action bars, the genotype toolbar, the keyboard help and the hover panel are not printed; the content column takes the whole sheet; the Lines table prints in full under a static header; and the legend swatches force `print-color-adjust: exact`, since a printer that drops backgrounds would print a legend of empty boxes. The graphical genotype canvas prints as the bitmap it is, textures included, which is what the greyscale argument above rests on. Asserted by tests/browser/print-media.test.tsx; paper itself stays unverified.

## Amendments, 2026-09-16

**The chrome carries a crop palette.** The maintainer amended "Chrome carries no hue" above on 2026-09-16. Leaf green, soil brown, wheat gold and parchment tokens now colour the page and rail surfaces, text, links, the primary button, the focus ring and the Upload screen's intro band. The neutral ramp, the Okabe-Ito class colours, the textures and everything drawn inside the genotype canvas are unchanged. The reserved alert hue still applies and is re-measured on the new surfaces. The decision, the ratios and the collision risk this record warned about are in docs/adr/0017, which also records the rename of the tool from Isoline Browser to Backcross.

**The canvas row period is 24 px and the gutter button fills it.** The 14 px canvas row with a 4 px gap made each gutter button a 14 px pointer target at an 18 px pitch, which fails WCAG 2.2 SC 2.5.8 without an applicable exception (the Lines rows are another screen). `--canvas-row-height` is 20 px, `--canvas-row-gap` 4 px, `--target-min` 24 px, and `tests/tokens.test.ts` asserts the period reaches the minimum. The report figures keep `DEFAULT_LAYOUT`. axe now runs `target-size` (`wcag22aa`) on every screen.
