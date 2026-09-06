/**
 * Screen 4: graphical genotypes.
 *
 * Responsibility: host the canvas renderer (ui/canvas/GraphicalGenotypeRenderer.ts)
 * for the selected lines (or all candidates, when App passes the full
 * candidate set because nothing is selected): one row per line, class
 * colours from core/palette.ts with a text legend, and a whole-genome or
 * single-chromosome viewport. This screen owns the <canvas> element and the
 * renderer instance and feeds them the `classes` data App already fetched
 * from the worker; it does not request data or compute anything itself.
 *
 * Zoom by drag and hover detail are planned for M2 (docs/adr/0007); only the
 * chromosome selector is implemented here.
 *
 * The <canvas> and its host are mounted unconditionally (not gated on
 * `loaded`), so the renderer-creation and ResizeObserver effects -- both
 * keyed `[]` -- always find a live canvas on first mount, regardless of
 * whether a dataset is loaded yet; the "Load a dataset first." message is
 * shown alongside it instead of replacing it. When `classesData` becomes
 * null (nothing selected, or the dataset unloads), the draw effect still
 * runs and clears the retained data so stale rows are not left on screen.
 *
 * Props: loaded, classesData, loading.
 */
import { useEffect, useRef, useState } from 'react';

import { GraphicalGenotypeRenderer } from '../canvas/GraphicalGenotypeRenderer.ts';
import { CLASS_COLORS } from '../../core/index.ts';
import { CALL_CLASS_LABEL, CallClass } from '../../core/types.ts';
import type { CallClassValue } from '../../core/types.ts';
import type { GenotypeClassesData } from '../../workers/protocol.ts';
import type { LoadedState } from './UploadScreen.tsx';

const LEGEND_CLASSES: CallClassValue[] = [
  CallClass.RP_HOM,
  CallClass.DONOR_HOM,
  CallClass.HET,
  CallClass.MISSING,
  CallClass.UNINFORMATIVE,
  CallClass.NONPARENTAL,
];

const WHOLE_GENOME = '';

export function GenotypeViewScreen({
  loaded,
  classesData,
  loading,
}: {
  loaded: LoadedState | null;
  classesData: GenotypeClassesData | null;
  loading: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<GraphicalGenotypeRenderer | null>(null);
  const [chrom, setChrom] = useState<string>(WHOLE_GENOME);

  useEffect(() => {
    if (canvasRef.current === null) return;
    rendererRef.current = new GraphicalGenotypeRenderer(canvasRef.current);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      const renderer = rendererRef.current;
      if (width === undefined || renderer === null) return;
      renderer.setSize(width);
      renderer.draw();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (renderer === null) return;
    // Called with classesData === null too, so a cleared/empty selection
    // clears the previously drawn rows rather than leaving a stale frame.
    renderer.setData(classesData);
    renderer.setViewport(chrom === WHOLE_GENOME ? {} : { chrom });
    renderer.draw();
  }, [classesData, chrom]);

  return (
    <section>
      <h2>Graphical genotypes</h2>

      {loaded === null ? (
        <p>Load a dataset first.</p>
      ) : (
        <div>
          <label>
            View{' '}
            <select value={chrom} onChange={(e) => setChrom(e.target.value)}>
              <option value={WHOLE_GENOME}>Whole genome</option>
              {loaded.chromosomeOrder.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {/* Persistently mounted so a screen reader announces the text change,
          rather than mounting/unmounting the whole live region. */}
      <p aria-live="polite">{loading ? 'Loading class data...' : ''}</p>
      {!loading && loaded !== null && classesData === null && <p>No lines to draw.</p>}

      <div ref={containerRef} style={{ width: '100%', overflowX: 'auto', background: '#ffffff' }}>
        <canvas
          ref={canvasRef}
          aria-label="Graphical genotypes: one row per line, one track per chromosome; colours as in the legend"
        >
          Graphical genotype rendering is not supported in this browser.
        </canvas>
      </div>

      <ul
        aria-label="Class legend"
        style={{ display: 'flex', gap: 16, listStyle: 'none', padding: 0 }}
      >
        {LEGEND_CLASSES.map((cls) => (
          <li key={cls} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              aria-hidden="true"
              style={{
                display: 'inline-block',
                width: 12,
                height: 12,
                background: CLASS_COLORS[cls],
                border: '1px solid #999',
              }}
            />
            {CALL_CLASS_LABEL[cls]}
          </li>
        ))}
      </ul>
    </section>
  );
}
