/**
 * Canvas renderer for graphical genotypes (docs/adr/0007).
 *
 * Responsibility: draw N lines x chromosomes as horizontal bars on a single
 * <canvas>, one row per line, chromosomes laid out left to right scaled by
 * each chromosome's length -- the last marker position observed on it, since
 * no assembly length is loaded, so a chromosome with markers only near its
 * start draws narrow -- (whole genome) or one chromosome filling the width.
 * Each pixel column is colored by the majority class over the markers that
 * land in it (src/ui/canvas/binning.ts), so 50K markers draw in one pass
 * regardless of zoom level. Rendering is retained-mode: the renderer holds
 * the data it was given (setData) and the current viewport (setViewport) and
 * redraws only on `draw()`. No React inside; the screen owns the <canvas>
 * element and calls draw() after any prop change.
 *
 * Interface:
 *   new GraphicalGenotypeRenderer(canvas, layout?)
 *   setData(data: GenotypeClassesData | null) — null clears the retained data
 *   setViewport({ chrom? })
 *   setSize(cssWidth) — called by the screen from a ResizeObserver
 *   draw() — with no data, clears the canvas to a minimal empty frame
 *   toDataUrl() for the HTML report
 *   hitTest(x, y) — M2, throws
 */
import { CLASS_COLORS } from '../../core/index.ts';
import { CallClass } from '../../core/types.ts';
import type { CallClassValue } from '../../core/types.ts';
import type { GenotypeClassesData } from '../../workers/protocol.ts';
import { binMajorityClasses } from './binning.ts';

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

export interface Viewport {
  /** A single chromosome name, or undefined for the whole genome. */
  chrom?: string;
}

interface ChromLayout {
  chrom: string;
  chromIdx: number;
  startBp: number;
  endBp: number;
  x: number;
  widthPx: number;
}

const UNINFORMATIVE_COLOR = CLASS_COLORS[CallClass.UNINFORMATIVE];

export class GraphicalGenotypeRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly layout: RendererLayout;

  private data: GenotypeClassesData | null = null;
  private viewport: Viewport = {};
  private cssWidth = 800;
  private markersByChrom: number[][] = [];

  constructor(canvas: HTMLCanvasElement, layout: RendererLayout = DEFAULT_LAYOUT) {
    this.canvas = canvas;
    this.layout = layout;
  }

  /** Pass null to clear the retained data, e.g. when the selection empties. */
  setData(data: GenotypeClassesData | null): void {
    this.data = data;
    if (data === null) {
      this.markersByChrom = [];
      return;
    }
    // Group marker indices by chromosome, in sortedMarkerOrder (already
    // position order), once per data set rather than once per draw.
    const groups: number[][] = data.chromosomeOrder.map(() => []);
    for (let k = 0; k < data.sortedMarkerOrder.length; k++) {
      const m = data.sortedMarkerOrder[k] as number;
      const c = data.markerChromIndex[m] as number;
      (groups[c] as number[]).push(m);
    }
    this.markersByChrom = groups;
  }

  setViewport(viewport: Viewport): void {
    this.viewport = viewport;
  }

  /** Sets the canvas's CSS width; call from a ResizeObserver on the host element. */
  setSize(cssWidth: number): void {
    this.cssWidth = cssWidth;
  }

  private chromLayouts(plotWidth: number): ChromLayout[] {
    const data = this.data;
    if (data === null) return [];
    const { chromGap } = this.layout;
    if (this.viewport.chrom !== undefined) {
      const idx = data.chromosomeOrder.indexOf(this.viewport.chrom);
      if (idx < 0) return [];
      return [
        {
          chrom: this.viewport.chrom,
          chromIdx: idx,
          startBp: 0,
          endBp: data.chromLengthsBp[idx] as number,
          x: 0,
          widthPx: plotWidth,
        },
      ];
    }
    const totalLength = data.chromLengthsBp.reduce((a, b) => a + b, 0);
    const nGaps = Math.max(0, data.chromosomeOrder.length - 1);
    const usableWidth = Math.max(1, plotWidth - nGaps * chromGap);
    const layouts: ChromLayout[] = [];
    let x = 0;
    for (let i = 0; i < data.chromosomeOrder.length; i++) {
      const length = data.chromLengthsBp[i] as number;
      const widthPx =
        totalLength > 0 ? Math.max(1, Math.round((length / totalLength) * usableWidth)) : 0;
      layouts.push({
        chrom: data.chromosomeOrder[i] as string,
        chromIdx: i,
        startBp: 0,
        endBp: length,
        x,
        widthPx,
      });
      x += widthPx + chromGap;
    }
    return layouts;
  }

  draw(): void {
    const data = this.data;
    const { rowHeight, rowGap, labelWidth } = this.layout;
    const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    const nLines = data === null ? 0 : data.lines.length;
    const cssHeight = Math.max(rowHeight, nLines * (rowHeight + rowGap));
    this.canvas.width = Math.round(this.cssWidth * dpr);
    this.canvas.height = Math.round(cssHeight * dpr);
    this.canvas.style.width = `${this.cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    const ctx = this.canvas.getContext('2d');
    if (ctx === null) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, cssHeight);
    if (data === null) return;

    const plotWidth = Math.max(1, this.cssWidth - labelWidth);
    const chroms = this.chromLayouts(plotWidth);

    ctx.font = `${Math.max(9, rowHeight - 3)}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000000';

    data.lines.forEach((line, row) => {
      const y = row * (rowHeight + rowGap);
      ctx.fillStyle = '#000000';
      ctx.fillText(line.sampleId, 0, y + rowHeight / 2, labelWidth - 4);

      for (const chromLayout of chroms) {
        const { x, widthPx, startBp, endBp, chromIdx } = chromLayout;
        const plotX = labelWidth + x;
        // Background for the whole track, so gaps with no marker read as
        // uninformative rather than transparent.
        ctx.fillStyle = UNINFORMATIVE_COLOR;
        ctx.fillRect(plotX, y, widthPx, rowHeight);

        const markerIndices = this.markersByChrom[chromIdx] ?? [];
        const bins = binMajorityClasses(
          data.markerPosBp,
          line.classes,
          markerIndices,
          startBp,
          endBp,
          widthPx,
        );

        // Merge adjacent equal columns into one fillRect per run, to keep
        // draw calls proportional to the number of distinct runs rather than
        // to pixel width.
        let runStart = 0;
        for (let col = 1; col <= widthPx; col++) {
          const prev = bins[col - 1] as number;
          const cur = col < widthPx ? (bins[col] as number) : -1;
          if (cur === prev) continue;
          if (prev !== 255) {
            ctx.fillStyle = CLASS_COLORS[prev as CallClassValue];
            ctx.fillRect(plotX + runStart, y, col - runStart, rowHeight);
          }
          runStart = col;
        }
      }
    });
  }

  toDataUrl(): string {
    return this.canvas.toDataURL('image/png');
  }

  /** Hover detail (marker id, position, alleles, class) is planned for M2. */
  hitTest(_x: number, _y: number): { sampleId: string; markerIndex: number } | null {
    throw new Error(
      'GraphicalGenotypeRenderer.hitTest: not implemented (planned for milestone M2)',
    );
  }
}
