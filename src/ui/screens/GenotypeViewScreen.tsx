/**
 * Screen 4: graphical genotypes. PLACEHOLDER (M1/M2).
 *
 * Responsibility: host the canvas renderer (ui/canvas/GraphicalGenotypeRenderer.ts)
 * for the selected lines: 20 chromosome tracks per line, one row per line,
 * class colors from core/palette.ts, zoom to a region (drag or typed
 * "Gm13:28.5-29.1Mb"), hover detail (marker id, position, alleles, class),
 * and target-region overlays. The screen passes class arrays and positions
 * into the renderer; it does not compute anything.
 */
export function GenotypeViewScreen() {
  return (
    <section>
      <h2>Graphical genotypes</h2>
      <p>Placeholder.</p>
    </section>
  );
}
