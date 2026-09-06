/**
 * Screen 3: line table. PLACEHOLDER (M1).
 *
 * Responsibility: one row per candidate with RPP (count, bp, cM), donor
 * segment count, largest segment, target-locus status per region, QC flags;
 * sortable by any column; multi-select feeds the genotype view and export.
 * Sorting is done on the result arrays in the main thread (a few hundred
 * rows), not in the worker.
 */
export function LineTableScreen() {
  return (
    <section>
      <h2>Lines</h2>
      <p>Placeholder.</p>
    </section>
  );
}
