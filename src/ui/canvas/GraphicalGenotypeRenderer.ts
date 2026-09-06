/**
 * Canvas renderer for graphical genotypes. STUB (M1).
 *
 * Responsibility: draw N lines x 20 chromosomes as horizontal bars on a
 * single <canvas>, one row per line, chromosomes laid out left to right
 * scaled by physical length. Each informative marker paints a rectangle in
 * its class color; at zoomed-out scales markers are binned per pixel column
 * and the bin is colored by the majority class so 50K markers draw in one
 * pass. Hover uses binary search on marker positions for the pixel column.
 * Rendering is retained-mode: the renderer holds typed arrays (positions,
 * class per line) and redraws on viewport changes only. No React inside.
 *
 * Interface:
 *   new GraphicalGenotypeRenderer(canvas, layout)
 *   setData({ chromosomeOrder, chromLengthsBp, markerChromIndex, markerPosBp, lines: {sampleId, classes}[] })
 *   setViewport({ chrom?, startBp?, endBp? })
 *   hitTest(x, y) -> { sampleId, markerIndex } | null
 *   toDataUrl() for the HTML report
 */
export interface RendererLayout {
  rowHeight: number;
  rowGap: number;
  chromGap: number;
  labelWidth: number;
}

export const DEFAULT_LAYOUT: RendererLayout = {
  rowHeight: 14,
  rowGap: 4,
  chromGap: 6,
  labelWidth: 120,
};

export class GraphicalGenotypeRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly layout: RendererLayout;

  constructor(canvas: HTMLCanvasElement, layout: RendererLayout = DEFAULT_LAYOUT) {
    this.canvas = canvas;
    this.layout = layout;
  }

  setData(_data: unknown): void {
    throw new Error(
      'GraphicalGenotypeRenderer.setData: not implemented (planned for milestone M1)',
    );
  }
}
