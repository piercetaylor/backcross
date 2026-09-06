/**
 * Screen 1: upload and validate. PLACEHOLDER (M1).
 *
 * Responsibility: three file pickers (genotypes: VCF/VCF.gz/HapMap/wide CSV;
 * samples.csv; optional markers.csv), a parameter panel seeded from config
 * defaults, and a "Load" action that reads the files as ArrayBuffers and
 * posts a 'load' request to the worker. Shows parser errors verbatim and the
 * warnings list on success, then navigates to the summary screen.
 *
 * Props: defaults (AppConfig); onLoaded(summary) callback in M1.
 */
import type { AppConfig } from '../../config.ts';

export function UploadScreen({ defaults }: { defaults: Readonly<AppConfig> }) {
  return (
    <section>
      <h2>Upload and validate</h2>
      <p>
        Placeholder. Default maximum marker coverage: {defaults.rpp.maxGapBp.toLocaleString()} bp.
      </p>
    </section>
  );
}
