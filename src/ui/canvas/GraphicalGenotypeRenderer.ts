/**
 * Canvas renderer for graphical genotypes (docs/adr/0007).
 *
 * Responsibility: draw N lines x chromosomes as horizontal bars on a single
 * <canvas>, one row per line, chromosomes laid out left to right scaled by
 * each chromosome's length -- the last marker position observed on it, since
 * no assembly length is loaded, so a chromosome with markers only near its
 * start draws narrow -- (whole genome), one chromosome, or a bp window of one
 * chromosome (see Viewport). Each pixel column is colored by the majority
 * class over the markers that land in it (src/ui/canvas/binning.ts), so 50K
 * markers draw in one pass regardless of zoom level. Rendering is
 * retained-mode: the renderer holds the data it was given (setData) and the
 * current viewport (setViewport) and redraws only on `draw()`. No React
 * inside; the screen owns the <canvas> element and calls draw() after any
 * prop change.
 *
 * Hit testing (hitTest) reuses the same per-chromosome pixel layout the draw
 * pass computes (chromLayouts), so a hover position and the pixels drawn for
 * it cannot drift apart. The nearest-marker search is factored out as the
 * standalone, DOM-free function nearestMarkerIndex so it is unit-testable
 * without a canvas (tests/viewport.test.ts).
 *
 * Per M2.5 phase 3, a minority-class overlay is drawn over each run of the
 * majority binning: where a bin's second-most-common called class has a
 * texture (src/core/palette.ts, src/ui/canvas/textures.ts), that texture is
 * painted over the run in the majority's fill colour, so a bin that hid a
 * non-recurrent call under a recurrent majority (docs/adr/0007's outstanding
 * hatch) now shows it. Patterns are built lazily from the renderer's own
 * canvas context and cached per device pixel ratio.
 *
 * Colours, font and geometry are given to the renderer, never read from the
 * page by it (M2.5 phase 5): the screen reads the tokens through
 * src/ui/canvas/read-theme.ts and passes a RendererLayout and a
 * RendererTheme in. DEFAULT_LAYOUT and DEFAULT_THEME hold the M2 values, so
 * a Node caller and the self-contained HTML report (src/export/report.ts,
 * which cannot reference the app stylesheet) draw exactly what they drew
 * before. This module is outside the literal-value lint gate by
 * construction, and these two constants are why.
 *
 * Interface:
 *   new GraphicalGenotypeRenderer(canvas, layout?, theme?)
 *   setData(data: GenotypeClassesData | null) — null clears the retained data
 *   setViewport({ chrom?, startBp?, endBp? })
 *   getViewport(): Viewport
 *   setSize(cssWidth) — called by the screen from a ResizeObserver
 *   setSelection(range: { x0, x1 } | null) — drag-selection overlay, CSS px
 *   setRowWindow({ first, count } | null) — draw and hit-test only these rows; null (the default) is every row
 *   draw() — with no data, clears the canvas to a minimal empty frame
 *   toDataUrl() for the HTML report
 *   hitTest(x, y) — nearest marker under a CSS-pixel point, or null
 *   chromosomeAt(x) — which chromosome track a CSS-pixel x falls in, or null
 *   bpOnChrom(chrom, x) — bp position of a CSS-pixel x on one chromosome's
 *     track, clamped to that track; the drag-to-zoom math
 *   xForBp(chrom, bp) — the inverse of bpOnChrom, for the overview's window
 *   trackLayouts() — { chrom, x, widthPx }[] for the chromosome strip
 *   nearestMarkerIndex(positions, markerIndices, targetBp) — module-level export
 */
import { CLASS_COLORS } from '../../core/index.ts';
import { CallClass } from '../../core/types.ts';
import type { CallClassValue } from '../../core/types.ts';
import type { GenotypeClassesData } from '../../workers/protocol.ts';
import { binClassesWithMinority } from './binning.ts';
import { buildClassPatterns } from './textures.ts';
import type { ClassPatterns } from './textures.ts';
import type { RowWindow } from './row-window.ts';

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

/** The colours and font the canvas draws with; everything else on it is class data from src/core/palette.ts. */
export interface RendererTheme {
  /** A CSS font shorthand, as assigned to CanvasRenderingContext2D.font. */
  font: string;
  /** In-canvas row label (drawn only when layout.labelWidth > 0). */
  labelColor: string;
  /** Drag-selection overlay: a low-alpha fill and a darker stroke. */
  overlayFill: string;
  overlayStroke: string;
}

/**
 * The M2 literals, unchanged. The font was derived from rowHeight until
 * phase 5 (`max(9, rowHeight - 3)px`), which at DEFAULT_LAYOUT's rowHeight
 * of 14 is the 11px pinned here, so the report figure is identical; a
 * caller passing a different rowHeight now gets this size rather than a
 * derived one, which matters to nothing that draws labels (the screen
 * passes labelWidth: 0 and its own theme).
 */
export const DEFAULT_THEME: RendererTheme = {
  font: '11px system-ui, sans-serif',
  labelColor: '#000000',
  overlayFill: 'rgba(17, 17, 17, 0.15)',
  overlayStroke: 'rgba(17, 17, 17, 0.8)',
};

export interface Viewport {
  /** A single chromosome name, or undefined for the whole genome. */
  chrom?: string;
  /** With chrom set, a bp window on it; ignored (whole chromosome) unless both are a valid, non-empty range. */
  startBp?: number;
  endBp?: number;
}

interface ChromLayout {
  chrom: string;
  chromIdx: number;
  startBp: number;
  endBp: number;
  x: number;
  widthPx: number;
}

/** A hover point must land within this many CSS pixels of a marker's drawn position to count as a hit. */
const HIT_TEST_TOLERANCE_PX = 4;

/** Gap between the end of an in-canvas row label and the start of the first track. */
const LABEL_PADDING_PX = 4;

const UNINFORMATIVE_COLOR = CLASS_COLORS[CallClass.UNINFORMATIVE];

/**
 * Binary-searches `markerIndices` (indices into `positions`, already in
 * ascending position order -- one chromosome's slice of sortedMarkerOrder)
 * for the marker closest to `targetBp`. Returns the marker's index into the
 * marker arrays (an element of `markerIndices`, not a position within it), or
 * -1 when `markerIndices` is empty. A tie between the marker immediately
 * before and immediately after `targetBp` resolves to the one after.
 */
export function nearestMarkerIndex(
  positions: Float64Array | number[],
  markerIndices: number[],
  targetBp: number,
): number {
  const n = markerIndices.length;
  if (n === 0) return -1;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const pos = positions[markerIndices[mid] as number] as number;
    if (pos < targetBp) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return markerIndices[0] as number;
  const afterIdx = markerIndices[lo] as number;
  const afterPos = positions[afterIdx] as number;
  if (afterPos < targetBp) return afterIdx; // target is beyond the last marker
  const beforeIdx = markerIndices[lo - 1] as number;
  const beforePos = positions[beforeIdx] as number;
  const distAfter = afterPos - targetBp;
  const distBefore = targetBp - beforePos;
  return distAfter <= distBefore ? afterIdx : beforeIdx;
}

export class GraphicalGenotypeRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly layout: RendererLayout;
  readonly theme: RendererTheme;

  private data: GenotypeClassesData | null = null;
  private viewport: Viewport = {};
  private cssWidth = 800;
  private markersByChrom: number[][] = [];
  private selection: { x0: number; x1: number } | null = null;
  private patterns: ClassPatterns | null = null;
  private patternsDpr: number | null = null;
  private rowWindow: RowWindow | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    layout: RendererLayout = DEFAULT_LAYOUT,
    theme: RendererTheme = DEFAULT_THEME,
  ) {
    this.canvas = canvas;
    this.layout = layout;
    this.theme = theme;
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

  getViewport(): Viewport {
    return this.viewport;
  }

  /** Sets the canvas's CSS width; call from a ResizeObserver on the host element. */
  setSize(cssWidth: number): void {
    this.cssWidth = cssWidth;
  }

  /** Sets or clears the drag-selection overlay, in CSS pixels relative to the canvas. */
  setSelection(range: { x0: number; x1: number } | null): void {
    this.selection = range;
  }

  /**
   * Draw and hit-test only rows [first, first + count) of the data's lines;
   * null (the default) is every row. setData does not reset it: the screen
   * sets both before each draw.
   */
  setRowWindow(rowWindow: RowWindow | null): void {
    this.rowWindow = rowWindow;
  }

  /** The drawn rows: the row window clamped to the data, or every line when there is no window. */
  private drawnRows(nLines: number): { first: number; count: number } {
    const rw = this.rowWindow;
    const first = rw?.first ?? 0;
    const count = rw === null ? nLines : Math.min(rw.count, Math.max(0, nLines - first));
    return { first, count };
  }

  /** Resolves the viewport's requested bp window against one chromosome's length; whole-chromosome on no window or an invalid one. */
  private resolveWindow(lengthBp: number): { startBp: number; endBp: number } {
    const { startBp, endBp } = this.viewport;
    if (startBp === undefined || endBp === undefined) return { startBp: 0, endBp: lengthBp };
    const clampedStart = Math.max(0, Math.min(startBp, lengthBp));
    const clampedEnd = Math.max(0, Math.min(endBp, lengthBp));
    if (clampedEnd <= clampedStart) return { startBp: 0, endBp: lengthBp };
    return { startBp: clampedStart, endBp: clampedEnd };
  }

  /**
   * Per-chromosome pixel layout for the current viewport and plot width.
   * Shared by draw() and hitTest() so the two cannot disagree about where a
   * chromosome or a bp position falls on screen.
   */
  private chromLayouts(plotWidth: number): ChromLayout[] {
    const data = this.data;
    if (data === null) return [];
    const { chromGap } = this.layout;
    if (this.viewport.chrom !== undefined) {
      const idx = data.chromosomeOrder.indexOf(this.viewport.chrom);
      if (idx < 0) return [];
      const lengthBp = data.chromLengthsBp[idx] as number;
      const window = this.resolveWindow(lengthBp);
      return [
        {
          chrom: this.viewport.chrom,
          chromIdx: idx,
          startBp: window.startBp,
          endBp: window.endBp,
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
    const { first, count } = this.drawnRows(nLines);
    const cssHeight = Math.max(rowHeight, count * (rowHeight + rowGap));
    this.canvas.width = Math.round(this.cssWidth * dpr);
    this.canvas.height = Math.round(cssHeight * dpr);
    this.canvas.style.width = `${this.cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    const ctx = this.canvas.getContext('2d');
    if (ctx === null) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, cssHeight);
    if (data === null) return;

    if (this.patterns === null || this.patternsDpr !== dpr) {
      this.patterns = buildClassPatterns(ctx, dpr);
      this.patternsDpr = dpr;
    }
    const patterns = this.patterns;

    const plotWidth = Math.max(1, this.cssWidth - labelWidth);
    const chroms = this.chromLayouts(plotWidth);

    ctx.font = this.theme.font;
    ctx.textBaseline = 'middle';

    for (let r = 0; r < count; r++) {
      const line = data.lines[first + r];
      if (line === undefined) continue;
      const y = r * (rowHeight + rowGap);
      // labelWidth is 0 on screen from phase 5 (the line names are the HTML
      // gutter beside the canvas); the report still draws them in-canvas.
      if (labelWidth > 0) {
        ctx.fillStyle = this.theme.labelColor;
        ctx.fillText(line.sampleId, 0, y + rowHeight / 2, labelWidth - LABEL_PADDING_PX);
      }

      for (const chromLayout of chroms) {
        const { x, widthPx, startBp, endBp, chromIdx } = chromLayout;
        const plotX = labelWidth + x;
        // Background for the whole track, so gaps with no marker read as
        // uninformative rather than transparent.
        ctx.fillStyle = UNINFORMATIVE_COLOR;
        ctx.fillRect(plotX, y, widthPx, rowHeight);

        const markerIndices = this.markersByChrom[chromIdx] ?? [];
        const { majority, minority } = binClassesWithMinority(
          data.markerPosBp,
          line.classes,
          markerIndices,
          startBp,
          endBp,
          widthPx,
        );

        // Merge adjacent equal columns into one fillRect per run, to keep
        // draw calls proportional to the number of distinct runs rather than
        // to pixel width. The majority run is filled solid, then (if that
        // class carries a texture) the pattern is painted over the same
        // rectangle.
        let runStart = 0;
        for (let col = 1; col <= widthPx; col++) {
          const prev = majority[col - 1] as number;
          const cur = col < widthPx ? (majority[col] as number) : -1;
          if (cur === prev) continue;
          if (prev !== 255) {
            const cls = prev as CallClassValue;
            ctx.fillStyle = CLASS_COLORS[cls];
            ctx.fillRect(plotX + runStart, y, col - runStart, rowHeight);
            const pattern = patterns[cls];
            if (pattern !== null) {
              ctx.fillStyle = pattern;
              ctx.fillRect(plotX + runStart, y, col - runStart, rowHeight);
            }
          }
          runStart = col;
        }

        // A second run-merging pass over the minority channel: where a bin's
        // second-most-common called class has a texture, that texture alone
        // (no separate fill) is painted over the already-drawn majority run,
        // so a hidden non-majority call reads without changing the bin's
        // fill colour.
        runStart = 0;
        for (let col = 1; col <= widthPx; col++) {
          const prev = minority[col - 1] as number;
          const cur = col < widthPx ? (minority[col] as number) : -1;
          if (cur === prev) continue;
          if (prev !== 255) {
            const pattern = patterns[prev as CallClassValue];
            if (pattern !== null) {
              ctx.fillStyle = pattern;
              ctx.fillRect(plotX + runStart, y, col - runStart, rowHeight);
            }
          }
          runStart = col;
        }
      }
    }

    if (this.selection !== null) {
      const { x0, x1 } = this.selection;
      const left = Math.min(x0, x1);
      const width = Math.max(1, Math.abs(x1 - x0));
      // A dark border plus a low-alpha fill stays visible both on the white
      // background and over the saturated class colours.
      ctx.fillStyle = this.theme.overlayFill;
      ctx.fillRect(left, 0, width, cssHeight);
      ctx.strokeStyle = this.theme.overlayStroke;
      ctx.lineWidth = 1;
      ctx.strokeRect(left + 0.5, 0.5, Math.max(0, width - 1), Math.max(0, cssHeight - 1));
    }
  }

  toDataUrl(): string {
    return this.canvas.toDataURL('image/png');
  }

  /**
   * Finds the chromosome track a CSS-pixel x (relative to the canvas) falls
   * in, alongside its offset within the plot area. Shared by chromosomeAt,
   * pixelToBp and hitTest so all three agree with draw() about where a
   * chromosome sits on screen.
   */
  private findLayout(x: number): { layout: ChromLayout; plotX: number } | null {
    const { labelWidth } = this.layout;
    if (x < labelWidth) return null;
    const plotWidth = Math.max(1, this.cssWidth - labelWidth);
    const plotX = x - labelWidth;
    if (plotX < 0 || plotX >= plotWidth) return null;
    const layout = this.chromLayouts(plotWidth).find(
      (c) => plotX >= c.x && plotX < c.x + c.widthPx,
    );
    return layout === undefined ? null : { layout, plotX };
  }

  /** Which chromosome track a CSS-pixel x (relative to the canvas) falls in, or null outside every track. */
  chromosomeAt(x: number): string | null {
    if (this.data === null) return null;
    return this.findLayout(x)?.layout.chrom ?? null;
  }

  /**
   * Converts a CSS-pixel x (relative to the canvas) to a bp position on one
   * named chromosome's track, clamping x to that track's own pixel bounds
   * when it falls outside them (e.g. a drag that continued past the edge of
   * its starting chromosome's track in the whole-genome view). Null when
   * that chromosome has no track in the current viewport. Used to resolve a
   * drag-to-zoom selection to a bp range on the chromosome under the drag
   * start, regardless of where the drag ended.
   */
  bpOnChrom(chrom: string, x: number): number | null {
    const data = this.data;
    if (data === null) return null;
    const { labelWidth } = this.layout;
    const plotWidth = Math.max(1, this.cssWidth - labelWidth);
    const layout = this.chromLayouts(plotWidth).find((c) => c.chrom === chrom);
    if (layout === undefined) return null;
    const span = layout.endBp - layout.startBp;
    if (span <= 0) return null;
    const plotX = x - labelWidth;
    const relX = Math.min(Math.max(plotX - layout.x, 0), layout.widthPx);
    return layout.startBp + (relX / layout.widthPx) * span;
  }

  /**
   * The inverse of bpOnChrom: the CSS-pixel x (relative to the canvas) at
   * which `bp` falls on one named chromosome's track. `bp` outside the
   * track's own window is clamped to it, exactly as bpOnChrom clamps x, so
   * the two round-trip for every x inside the track. Null when that
   * chromosome has no track in the current viewport, or its track spans no
   * bp. Used by the overview canvas to draw the current window.
   */
  xForBp(chrom: string, bp: number): number | null {
    const data = this.data;
    if (data === null) return null;
    const { labelWidth } = this.layout;
    const plotWidth = Math.max(1, this.cssWidth - labelWidth);
    const layout = this.chromLayouts(plotWidth).find((c) => c.chrom === chrom);
    if (layout === undefined) return null;
    const span = layout.endBp - layout.startBp;
    if (span <= 0) return null;
    const clampedBp = Math.min(Math.max(bp, layout.startBp), layout.endBp);
    return labelWidth + layout.x + ((clampedBp - layout.startBp) / span) * layout.widthPx;
  }

  /**
   * Where each chromosome track sits along the canvas, in CSS pixels
   * relative to the canvas's left edge (labelWidth included, so a track's x
   * can be used to position an HTML element over the canvas). The screen's
   * chromosome strip reads this after every draw, so the strip and the
   * pixels underneath it cannot disagree.
   */
  trackLayouts(): { chrom: string; x: number; widthPx: number }[] {
    const { labelWidth } = this.layout;
    const plotWidth = Math.max(1, this.cssWidth - labelWidth);
    return this.chromLayouts(plotWidth).map((c) => ({
      chrom: c.chrom,
      x: labelWidth + c.x,
      widthPx: c.widthPx,
    }));
  }

  /**
   * Nearest marker under a CSS-pixel point (x, y relative to the canvas), or
   * null when the point is outside the plot area, outside every row (label
   * column, or the gap between rows), or more than a few pixels from the
   * nearest marker. markerIndex is an index into the marker arrays
   * (GenotypeClassesData.markerPosBp etc.), suitable for looking up position
   * and class.
   */
  hitTest(x: number, y: number): { sampleId: string; markerIndex: number } | null {
    const data = this.data;
    if (data === null) return null;
    const { rowHeight, rowGap } = this.layout;
    if (y < 0) return null;
    const rowPeriod = rowHeight + rowGap;
    const row = Math.floor(y / rowPeriod);
    const { first, count } = this.drawnRows(data.lines.length);
    if (row < 0 || row >= count) return null;
    const yInRow = y - row * rowPeriod;
    if (yInRow >= rowHeight) return null; // the gap between rows

    const found = this.findLayout(x);
    if (found === null) return null;
    const { layout, plotX } = found;

    const span = layout.endBp - layout.startBp;
    if (span <= 0) return null;
    const relX = plotX - layout.x;
    const targetBp = layout.startBp + (relX / layout.widthPx) * span;

    const markerIndices = this.markersByChrom[layout.chromIdx] ?? [];
    const m = nearestMarkerIndex(data.markerPosBp, markerIndices, targetBp);
    if (m < 0) return null;

    const markerPos = data.markerPosBp[m] as number;
    const pxPerBp = layout.widthPx / span;
    const distPx = Math.abs(markerPos - targetBp) * pxPerBp;
    if (distPx > HIT_TEST_TOLERANCE_PX) return null;

    const line = data.lines[first + row];
    if (line === undefined) return null;
    return { sampleId: line.sampleId, markerIndex: m };
  }
}
