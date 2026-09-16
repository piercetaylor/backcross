/**
 * Screen 4: graphical genotypes.
 *
 * Responsibility: host the canvas renderer (ui/canvas/GraphicalGenotypeRenderer.ts)
 * for the visible lines, in display order: one row per line, class
 * colours from core/palette.ts with a text legend, and a whole-genome,
 * single-chromosome, or zoomed bp-window viewport. Which lines those are,
 * and in what order, is the shared model in ui/lines/ that the Lines table
 * also reads (docs/adr/0009, amended 2026-09-11) -- drawing only the
 * selection is now the `selectedOnly` filter rather than a rule of its
 * own. `LineActionBar` sits above the canvas so that sorting or filtering
 * here moves the table too, the reverse direction of the same state. This screen owns the
 * <canvas> element and the renderer instance and feeds them the `classes`
 * data App already fetched from the worker; it does not request or compute
 * that data itself. The one exception is per-marker hover detail, requested
 * on demand through the optional onRequestMarkerDetail prop (see below).
 *
 * Zoom (chromosome selector, a typed region field reusing the locus grammar
 * from core/targets.ts, and drag-to-zoom on the canvas) and hover detail are
 * implemented here (M2, docs/adr/0007). The hover panel shows the cheap
 * fields (line, chromosome, bp position, class) the instant the hit test
 * resolves, from the local classesData arrays -- so the panel never lags the
 * pointer -- then debounces (MARKER_DETAIL_DEBOUNCE_MS) a 'markerDetail'
 * worker request for the hovered marker and enriches the panel with the
 * marker id, cM (when finite) and allele symbols for the hovered line plus
 * the recurrent/donor parents, once it resolves. A request is skipped
 * entirely while the pointer stays on the same marker (hoverKeyRef), so a
 * sweep across the canvas debounces down to one request per marker actually
 * settled on, not one per mousemove. A monotonic sequence number
 * (detailSeqRef), the same pattern App.tsx uses for its own overlapping
 * request chains, discards a response for a marker that is no longer
 * hovered; a failed request is swallowed (a quiet "detail unavailable" note,
 * cheap fields left untouched) rather than surfaced as a page error. No
 * request is made while a drag-to-zoom is in progress (handleMouseMove
 * returns before calling updateHover), and mouseleave/a null hit test clears
 * the panel.
 *
 * aria-live: the panel's visible text (no aria-live) updates immediately and
 * twice per hovered marker -- once with the cheap fields, again when the
 * enrichment lands -- exactly so it never lags the pointer. Announcing both
 * of those changes would read as a distracting double-announcement per
 * marker, so aria-live="polite" lives instead on a visually-hidden sibling
 * paragraph whose text (settledText) is written only at the point a hover
 * settles: once immediately if there is no onRequestMarkerDetail prop
 * (nothing more is ever coming), otherwise once when the debounced request
 * resolves or rejects for the still-hovered marker.
 *
 * The canvas and its context (M2.5 phase 5): the line names are no longer
 * drawn inside the canvas. The renderer is given `labelWidth: 0` and the
 * names become an HTML gutter beside it -- an <ol> of buttons, sticky
 * against the horizontal scroll, each one row period tall by the same two
 * tokens the renderer bins rows with (screens.css), and each a toggle for
 * that line's membership of the shared selection. Above the canvas a
 * chromosome strip labels each track from renderer.trackLayouts(), plus the
 * window's edges in Mb on a single chromosome; below it, on a single
 * chromosome, a whole-chromosome overview canvas marks the current window,
 * and a click on it recentres that window (the keyboard equivalent is the
 * main canvas's own arrow keys, which pan the same window). The overview is
 * bounded by --overview-height: past that many lines it bins lines into its
 * pixel rows (ui/canvas/line-binning.ts), each row the per-marker majority
 * of the lines it covers, so every line is represented. The main canvas and
 * the gutter draw only the rows inside the scroll container's viewport plus
 * OVERSCAN_ROWS each side (ui/canvas/row-window.ts); the <ol> and the canvas
 * host are full-height spacers and the drawn rows are offset inside them, so
 * scrollbars, the sticky gutter and hit testing keep their geometry. Under
 * print media every row is drawn. Colours, font and geometry come
 * from the stylesheet through ui/canvas/read-theme.ts, read once when the
 * renderer is created; the renderer holds no literal that reaches this
 * screen, and this screen holds no dimension of its own. Both canvases are
 * `role="img"` with a description: the main one is focusable and
 * keyboard-operated, and its label states the keys (docs/m3-phases.md,
 * phase 5). A screen reader in browse mode does not switch to focus mode
 * for an image, so those keys reach the canvas only after the user
 * switches modes; unverified without assistive technology.
 *
 * onRequestMarkerDetail is optional: App.tsx wires it to the worker's
 * `markerDetail` request (`(markerIndex, sampleIds) =>
 * client.request('markerDetail', { markerIndex, sampleIds })`). Without the
 * prop the panel still shows the cheap fields correctly; it just never
 * enriches -- kept optional so this screen does not require a live worker
 * client to render or be tested.
 *
 * The <canvas> and its host are mounted unconditionally (not gated on
 * `loaded`), so the renderer-creation and ResizeObserver effects -- both
 * keyed `[]` -- always find a live canvas on first mount, regardless of
 * whether a dataset is loaded yet; the "Load a dataset first." message is
 * shown alongside it instead of replacing it. When `classesData` becomes
 * null (nothing selected, or the dataset unloads), the draw effect still
 * runs and clears the retained data so stale rows are not left on screen.
 *
 * Props: loaded, classesData, loading, counts, sort, onSortChange, filter,
 * onFilterChange, regions, selected, onSelectionChange, onSelectAllVisible,
 * onSelectNone, onRequestMarkerDetail?.
 */
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';

import { DEFAULT_LAYOUT, GraphicalGenotypeRenderer } from '../canvas/GraphicalGenotypeRenderer.ts';
import type {
  RendererLayout,
  RendererTheme,
  Viewport,
} from '../canvas/GraphicalGenotypeRenderer.ts';
import { binLinesIntoRows } from '../canvas/line-binning.ts';
import { readOverviewHeight, readRendererLayout, readRendererTheme } from '../canvas/read-theme.ts';
import { visibleRowWindow } from '../canvas/row-window.ts';
import type { RowWindow } from '../canvas/row-window.ts';
import '../canvas/legend.css';
import './screens.css';
import { classSwatchCss } from '../../core/index.ts';
import { parseLocus } from '../../core/targets.ts';
import { CALL_CLASS_LABEL, CallClass } from '../../core/types.ts';
import type { CallClassValue, TargetRegion } from '../../core/types.ts';
import { LineActionBar } from '../lines/LineActionBar.tsx';
import type { LineFilter, LineSort } from '../lines/line-order.ts';
import type { GenotypeClassesData, MarkerDetailResult } from '../../workers/protocol.ts';
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

/** A drag shorter than this (CSS px) is treated as a click, not a zoom. */
const DRAG_CLICK_THRESHOLD_PX = 4;

/** Fraction of the current window's width panned per Left/Right key press. */
const PAN_FRACTION = 0.1;

/** Fraction the window shrinks or grows per +/- key press. */
const ZOOM_FRACTION = 0.2;

/** Delay before a hovered marker's detail is requested from the worker, so a sweep across the canvas does not queue one request per pixel. */
const MARKER_DETAIL_DEBOUNCE_MS = 120;

const NO_HOVER_MESSAGE = 'Hover or focus a marker on the canvas to see its detail.';

/** A bp position as Mb, for the chromosome strip's window edges. */
function mbLabel(bp: number): string {
  return `${(bp / 1_000_000).toFixed(1)} Mb`;
}

interface HoverInfo {
  sampleId: string;
  markerIndex: number;
  chrom: string;
  posBp: number;
  classLabel: string;
}

interface DragState {
  active: boolean;
  startX: number;
  /** Chromosome under the drag's starting pixel, or null when it started outside every track. */
  chrom: string | null;
}

/** The bp window a viewport resolves to on one chromosome, mirroring GraphicalGenotypeRenderer's own clamping so keyboard pan/zoom reasons about the same window that is on screen. */
function currentWindow(viewport: Viewport, lengthBp: number): { startBp: number; endBp: number } {
  const { startBp, endBp } = viewport;
  if (startBp === undefined || endBp === undefined) return { startBp: 0, endBp: lengthBp };
  const s = Math.max(0, Math.min(startBp, lengthBp));
  const e = Math.max(0, Math.min(endBp, lengthBp));
  if (e <= s) return { startBp: 0, endBp: lengthBp };
  return { startBp: s, endBp: e };
}

function chromLengthBp(data: GenotypeClassesData | null, chrom: string): number | null {
  if (data === null) return null;
  const idx = data.chromosomeOrder.indexOf(chrom);
  if (idx < 0) return null;
  return data.chromLengthsBp[idx] as number;
}

function getCanvasXY(e: ReactMouseEvent<HTMLCanvasElement>): { x: number; y: number } {
  const rect = e.currentTarget.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

export function GenotypeViewScreen({
  loaded,
  classesData,
  loading,
  counts,
  sort,
  onSortChange,
  filter,
  onFilterChange,
  regions,
  selected,
  onSelectionChange,
  onSelectAllVisible,
  onSelectNone,
  onRequestMarkerDetail,
}: {
  loaded: LoadedState | null;
  /** The visible lines in display order (App applies the order; see ui/lines/classes-order.ts). */
  classesData: GenotypeClassesData | null;
  loading: boolean;
  counts: { total: number; visible: number; selected: number };
  sort: LineSort | null;
  onSortChange: (s: LineSort | null) => void;
  filter: LineFilter;
  onFilterChange: (f: LineFilter) => void;
  /** Target regions, for the action bar's sort column list. */
  regions: TargetRegion[];
  /** The shared line selection; the gutter both shows it and toggles it. */
  selected: Set<string>;
  onSelectionChange: (next: Set<string>) => void;
  onSelectAllVisible: () => void;
  onSelectNone: () => void;
  /** Fetches marker detail (id, cM, alleles, per-sample calls) for a hover. Omitted when the host has no wiring to the worker yet; the panel then shows only the cheap fields. */
  onRequestMarkerDetail?: (markerIndex: number, sampleIds: string[]) => Promise<MarkerDetailResult>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** The flex child holding the canvases: the ResizeObserver's target, so its width already excludes the gutter, and the element the tokens are read from. */
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<GraphicalGenotypeRenderer | null>(null);
  const overviewRef = useRef<HTMLCanvasElement | null>(null);
  const overviewRendererRef = useRef<GraphicalGenotypeRenderer | null>(null);
  const themeRef = useRef<RendererTheme | null>(null);
  const overviewHeightRef = useRef(0);
  const dragRef = useRef<DragState>({ active: false, startX: 0, chrom: null });
  /** `${sampleId}:${markerIndex}` of the marker a detail request was last scheduled for, so lingering on the same marker across mousemove events does not reschedule. */
  const hoverKeyRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Bumped whenever a pending detail request is superseded, so a late response for a marker that is no longer hovered is discarded. */
  const detailSeqRef = useRef(0);
  /** Pending requestAnimationFrame id for a coalesced resize redraw, or null when none is scheduled. */
  const resizeRafRef = useRef<number | null>(null);
  /** The renderer layout read from the tokens at mount; the row period the gutter and the row window use. */
  const layoutRef = useRef<RendererLayout | null>(null);
  /** The .geno-scroll element, which owns vertical scrolling and whose viewport the row window follows. */
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  /** Pending requestAnimationFrame id for a coalesced scroll update of the row window, or null. */
  const windowRafRef = useRef<number | null>(null);
  /** The overview's last line-binning result, reused while classesData and the row count are unchanged (a pan or zoom does not rebin). */
  const overviewBinRef = useRef<{
    data: GenotypeClassesData;
    rows: number;
    lines: GenotypeClassesData['lines'];
  } | null>(null);
  /** The current row count, for the print listener, which is set up once. */
  const nRowsRef = useRef(0);

  const [viewport, setViewport] = useState<Viewport>({});
  /** CSS width of the canvas host, from the ResizeObserver; 0 until it first reports. */
  const [plotWidth, setPlotWidth] = useState(0);
  /** Where each chromosome track sits, for the strip; refreshed after every draw. */
  const [tracks, setTracks] = useState<{ chrom: string; x: number; widthPx: number }[]>([]);
  const [regionText, setRegionText] = useState('');
  const [regionError, setRegionError] = useState<string | null>(null);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [detail, setDetail] = useState<MarkerDetailResult | null>(null);
  const [detailNote, setDetailNote] = useState<string | null>(null);
  /** Text for the aria-live region: written only when a hover settles (see header comment). */
  const [settledText, setSettledText] = useState(NO_HOVER_MESSAGE);
  /** The rows the main canvas and the gutter lay out and draw (ui/canvas/row-window.ts). */
  const [rowWindow, setRowWindow] = useState<RowWindow>({ first: 0, count: 0 });
  /** True under print media, where every row is drawn. */
  const [printing, setPrinting] = useState(false);

  /**
   * Recomputes the row window from the scroller's viewport and sets it only
   * when it changed. Called from the scroll handler, the ResizeObserver and
   * the draw effect.
   */
  function updateRowWindow() {
    const scroller = scrollerRef.current;
    const layout = layoutRef.current ?? DEFAULT_LAYOUT;
    const nRows = classesData?.lines.length ?? 0;
    const period = layout.rowHeight + layout.rowGap;
    let next: RowWindow;
    if (printing || scroller === null) {
      next = { first: 0, count: nRows };
    } else {
      // When the list shrank below the scroll position, bring the scroller
      // back to the last full viewport of rows rather than leaving it past them.
      const maxTop = Math.max(0, nRows * period - scroller.clientHeight);
      if (scroller.scrollTop > maxTop) scroller.scrollTop = maxTop;
      next = visibleRowWindow(
        Math.min(scroller.scrollTop, maxTop),
        scroller.clientHeight,
        period,
        nRows,
      );
    }
    setRowWindow((prev) => (prev.first === next.first && prev.count === next.count ? prev : next));
  }
  // The ResizeObserver and a pending scroll frame outlive the render that set
  // them up, so they call the latest render's updateRowWindow through this
  // ref rather than a stale one whose classesData and printing are old.
  const updateRowWindowRef = useRef(updateRowWindow);
  useEffect(() => {
    updateRowWindowRef.current = updateRowWindow;
    nRowsRef.current = classesData?.lines.length ?? 0;
  });

  /** Coalesces scroll events into one row-window update per frame, as the resize handler does. */
  function handleScroll() {
    if (windowRafRef.current !== null) cancelAnimationFrame(windowRafRef.current);
    windowRafRef.current = requestAnimationFrame(() => {
      windowRafRef.current = null;
      updateRowWindowRef.current();
    });
  }

  // The canvas learns the design tokens once, here. labelWidth is overridden
  // to 0 because this screen draws the line names in HTML beside the canvas;
  // ExportScreen keeps DEFAULT_LAYOUT, so the report's figures keep theirs.
  useEffect(() => {
    const canvas = canvasRef.current;
    const host = containerRef.current;
    if (canvas === null || host === null) return;
    const theme = readRendererTheme(host);
    themeRef.current = theme;
    layoutRef.current = readRendererLayout(host);
    overviewHeightRef.current = readOverviewHeight(host);
    rendererRef.current = new GraphicalGenotypeRenderer(
      canvas,
      { ...readRendererLayout(host), labelWidth: 0 },
      theme,
    );
  }, []);

  // Coalesced into a single requestAnimationFrame per resize burst: a
  // whole-genome draw at 50,000 markers by 200 lines measures about 124 ms,
  // so redrawing synchronously on every ResizeObserver callback during a
  // window-resize drag would visibly thrash. A new callback cancels any
  // frame still pending from the previous one, so only the last size in a
  // burst is ever drawn.
  //
  // The scroller is observed too: its clientHeight follows the
  // --geno-scroll-max-height vh token on a window resize, and the row window
  // follows its clientHeight. Nothing reads the scroller's width.
  useEffect(() => {
    const container = containerRef.current;
    const scroller = scrollerRef.current;
    if (container === null) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === scroller) {
          updateRowWindowRef.current();
          continue;
        }
        const width = entry.contentRect.width;
        if (resizeRafRef.current !== null) cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = requestAnimationFrame(() => {
          resizeRafRef.current = null;
          // The draw effect below owns every draw, so a resize, a data change
          // and a viewport change all go through one path and the chromosome
          // strip is never left describing a width that is no longer on
          // screen.
          setPlotWidth(width);
        });
      }
    });
    ro.observe(container);
    if (scroller !== null) ro.observe(scroller);
    return () => {
      ro.disconnect();
      if (resizeRafRef.current !== null) {
        cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = null;
      }
      if (windowRafRef.current !== null) {
        cancelAnimationFrame(windowRafRef.current);
        windowRafRef.current = null;
      }
    };
  }, []);

  // Print media draws every row (the stylesheet lifts the scroller's bound).
  // Entering print commits the full row window synchronously (flushSync), on
  // beforeprint and on the print media change, so the print snapshot never
  // catches the screen's row window; leaving print recomputes the window
  // through the draw effect.
  useEffect(() => {
    const mq = window.matchMedia('print');
    const enterPrint = () => {
      flushSync(() => {
        setPrinting(true);
        setRowWindow({ first: 0, count: nRowsRef.current });
      });
    };
    const leavePrint = () => setPrinting(false);
    const onChange = (e: MediaQueryListEvent) => (e.matches ? enterPrint() : leavePrint());
    if (mq.matches) enterPrint();
    mq.addEventListener('change', onChange);
    window.addEventListener('beforeprint', enterPrint);
    window.addEventListener('afterprint', leavePrint);
    return () => {
      mq.removeEventListener('change', onChange);
      window.removeEventListener('beforeprint', enterPrint);
      window.removeEventListener('afterprint', leavePrint);
    };
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (renderer === null) return;
    // Called with classesData === null too, so a cleared/empty selection
    // clears the previously drawn rows rather than leaving a stale frame.
    if (plotWidth > 0) renderer.setSize(plotWidth);
    renderer.setData(classesData);
    renderer.setViewport(viewport);
    renderer.setRowWindow(rowWindow);
    renderer.draw();
    setTracks(renderer.trackLayouts());
    // A dataset change or a print flip recomputes the window for the new row
    // count; the state update re-runs this effect once and the comparison
    // guard in updateRowWindow stops it there.
    updateRowWindow();
  }, [classesData, viewport, plotWidth, printing, rowWindow]);

  // The overview is drawn by its own effect, which does not depend on the row
  // window: scrolling redraws only the main canvas.
  useEffect(() => {
    // The overview is a second renderer over the whole chromosome, one line
    // per row at whatever height divides --overview-height, with the current
    // window drawn as the same overlay a drag uses. Its layout depends on
    // the number of lines, and a renderer's layout is fixed at
    // construction, so it is rebuilt rather than mutated.
    const overviewCanvas = overviewRef.current;
    const chrom = viewport.chrom;
    if (overviewCanvas === null || chrom === undefined || classesData === null) {
      overviewRendererRef.current = null;
      return;
    }
    // The renderer sizes its canvas from the row count, so the overview can
    // only be bounded by --overview-height here: a row cannot be thinner than
    // one pixel, and past that many lines the canvas would grow instead of
    // the rows shrinking, pushing the page around. Beyond that point the
    // overview bins lines into its pixel rows (ui/canvas/line-binning.ts),
    // each row the per-marker majority of the lines it covers, so every line
    // is represented.
    const overviewHeight = Math.max(1, overviewHeightRef.current);
    const allLines = classesData.lines.length;
    const shownLines = Math.max(1, Math.min(allLines, overviewHeight));
    let overviewData = classesData;
    if (shownLines < allLines) {
      const cached = overviewBinRef.current;
      const lines =
        cached !== null && cached.data === classesData && cached.rows === shownLines
          ? cached.lines
          : binLinesIntoRows(classesData.lines, shownLines);
      overviewBinRef.current = { data: classesData, rows: shownLines, lines };
      overviewData = { ...classesData, lines };
    }
    const overview = new GraphicalGenotypeRenderer(
      overviewCanvas,
      {
        rowHeight: Math.max(1, Math.floor(overviewHeight / shownLines)),
        rowGap: 0,
        chromGap: 0,
        labelWidth: 0,
      },
      themeRef.current ?? undefined,
    );
    overview.setData(overviewData);
    overview.setViewport({ chrom });
    if (plotWidth > 0) overview.setSize(plotWidth);
    const length = chromLengthBp(classesData, chrom);
    if (length !== null && length > 0) {
      const shown = currentWindow(viewport, length);
      const x0 = overview.xForBp(chrom, shown.startBp);
      const x1 = overview.xForBp(chrom, shown.endBp);
      overview.setSelection(x0 === null || x1 === null ? null : { x0, x1 });
    }
    overview.draw();
    overviewRendererRef.current = overview;
  }, [classesData, viewport, plotWidth]);

  // A pending debounced detail request must not fire after unmount.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  /** The recurrent or donor parent's sample id, when that role is among the loaded samples. */
  function parentSampleId(role: 'recurrent_parent' | 'donor_parent'): string | null {
    return loaded?.samples.find((s) => s.role === role)?.sampleId ?? null;
  }

  function formatCheapLine(info: HoverInfo): string {
    return `${info.sampleId} — ${info.chrom}:${info.posBp.toLocaleString()} bp — ${info.classLabel}`;
  }

  /** Full description for a hover: cheap fields alone, or enriched with marker id/cM/alleles once `d` resolves; `note` is appended as a quiet parenthetical (e.g. a failed request). */
  function formatDetail(
    info: HoverInfo,
    d: MarkerDetailResult | null,
    note: string | null,
  ): string {
    let text = formatCheapLine(info);
    if (d !== null && d.markerIndex === info.markerIndex) {
      const cmPart = Number.isFinite(d.cm) ? `, ${d.cm.toFixed(1)} cM` : '';
      text = `${d.markerId} — ${text}${cmPart}`;
      const hovered = d.calls.find((c) => c.sampleId === info.sampleId);
      const rp = d.calls.find((c) => c.sampleId === parentSampleId('recurrent_parent'));
      const donor = d.calls.find((c) => c.sampleId === parentSampleId('donor_parent'));
      const alleleBits: string[] = [];
      if (hovered !== undefined) alleleBits.push(`${hovered.allele1}/${hovered.allele2}`);
      if (rp !== undefined) alleleBits.push(`RP ${rp.allele1}/${rp.allele2}`);
      if (donor !== undefined) alleleBits.push(`Donor ${donor.allele1}/${donor.allele2}`);
      if (alleleBits.length > 0) text += ` — ${alleleBits.join(', ')}`;
    }
    if (note !== null) text += ` (${note})`;
    return text;
  }

  /** Cancels any pending debounced request and discards its eventual response. */
  function invalidatePendingDetail() {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    detailSeqRef.current++;
  }

  function scheduleDetailRequest(info: HoverInfo) {
    invalidatePendingDetail();
    setDetail(null);
    setDetailNote(null);

    if (onRequestMarkerDetail === undefined) {
      // Nothing more is ever coming: the cheap fields are already the settled state.
      setSettledText(formatDetail(info, null, null));
      return;
    }

    const request = onRequestMarkerDetail;
    const seq = detailSeqRef.current;
    const sampleIds = Array.from(
      new Set(
        [info.sampleId, parentSampleId('recurrent_parent'), parentSampleId('donor_parent')].filter(
          (id): id is string => id !== null,
        ),
      ),
    );
    debounceTimerRef.current = setTimeout(() => {
      request(info.markerIndex, sampleIds)
        .then((result) => {
          if (detailSeqRef.current !== seq) return; // superseded by a later hover
          setDetail(result);
          setSettledText(formatDetail(info, result, null));
        })
        .catch(() => {
          if (detailSeqRef.current !== seq) return;
          setDetailNote('detail unavailable');
          setSettledText(formatDetail(info, null, 'detail unavailable'));
        });
    }, MARKER_DETAIL_DEBOUNCE_MS);
  }

  function clearHover() {
    invalidatePendingDetail();
    hoverKeyRef.current = null;
    setHoverInfo(null);
    setDetail(null);
    setDetailNote(null);
    setSettledText(NO_HOVER_MESSAGE);
  }

  function resetViewport() {
    setRegionError(null);
    clearHover();
    setViewport({});
  }

  function applyRegion() {
    const text = regionText.trim();
    if (text === '') {
      setRegionError('enter a region, e.g. Gm13:28.5-29.1Mb');
      return;
    }
    let parsed: { chrom: string; startBp: number; endBp: number } | null;
    try {
      parsed = parseLocus(text);
    } catch (err) {
      setRegionError(err instanceof Error ? err.message : String(err));
      return;
    }
    if (parsed === null) {
      setRegionError('not a region');
      return;
    }
    setRegionError(null);
    setViewport({ chrom: parsed.chrom, startBp: parsed.startBp, endBp: parsed.endBp });
  }

  function cancelDrag() {
    dragRef.current = { active: false, startX: 0, chrom: null };
    rendererRef.current?.setSelection(null);
    rendererRef.current?.draw();
  }

  function updateHover(x: number, y: number) {
    const renderer = rendererRef.current;
    if (renderer === null || classesData === null) {
      clearHover();
      return;
    }
    const hit = renderer.hitTest(x, y);
    if (hit === null) {
      clearHover();
      return;
    }
    const line = classesData.lines.find((l) => l.sampleId === hit.sampleId);
    if (line === undefined) {
      clearHover();
      return;
    }
    const chromIdx = classesData.markerChromIndex[hit.markerIndex] as number;
    const chrom = classesData.chromosomeOrder[chromIdx] as string;
    const posBp = classesData.markerPosBp[hit.markerIndex] as number;
    const cls = line.classes[hit.markerIndex] as CallClassValue;
    const next: HoverInfo = {
      sampleId: hit.sampleId,
      markerIndex: hit.markerIndex,
      chrom,
      posBp,
      classLabel: CALL_CLASS_LABEL[cls],
    };
    setHoverInfo(next);

    // Only (re)schedule a detail request when the marker under the pointer
    // actually changed; jitter within the same marker's hit area must not
    // clear already-fetched detail or queue a fresh request.
    const key = `${next.sampleId}:${next.markerIndex}`;
    if (hoverKeyRef.current !== key) {
      hoverKeyRef.current = key;
      scheduleDetailRequest(next);
    }
  }

  function handleMouseDown(e: ReactMouseEvent<HTMLCanvasElement>) {
    if (e.button !== 0) return;
    const { x } = getCanvasXY(e);
    const chrom = rendererRef.current?.chromosomeAt(x) ?? null;
    dragRef.current = { active: true, startX: x, chrom };
    clearHover();
  }

  function handleMouseMove(e: ReactMouseEvent<HTMLCanvasElement>) {
    const renderer = rendererRef.current;
    if (renderer === null) return;
    const { x, y } = getCanvasXY(e);
    if (dragRef.current.active) {
      renderer.setSelection({ x0: dragRef.current.startX, x1: x });
      renderer.draw();
      return;
    }
    updateHover(x, y);
  }

  function handleMouseUp(e: ReactMouseEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    dragRef.current = { active: false, startX: 0, chrom: null };
    const renderer = rendererRef.current;
    if (!drag.active || renderer === null) return;
    renderer.setSelection(null);
    renderer.draw();

    const { x } = getCanvasXY(e);
    if (Math.abs(x - drag.startX) < DRAG_CLICK_THRESHOLD_PX || drag.chrom === null) return;

    const startBp = renderer.bpOnChrom(drag.chrom, drag.startX);
    const endBp = renderer.bpOnChrom(drag.chrom, x);
    if (startBp === null || endBp === null) return;
    setRegionError(null);
    setViewport({
      chrom: drag.chrom,
      startBp: Math.round(Math.min(startBp, endBp)),
      endBp: Math.round(Math.max(startBp, endBp)),
    });
  }

  /** The gutter's half of the shared selection: one line in or out, leaving every other line alone. */
  function toggleSelected(sampleId: string) {
    const next = new Set(selected);
    if (!next.delete(sampleId)) next.add(sampleId);
    onSelectionChange(next);
  }

  /** Recentres the current window on the clicked bp, keeping its width; the window stays inside the chromosome. */
  function handleOverviewClick(e: ReactMouseEvent<HTMLCanvasElement>) {
    const chrom = viewport.chrom;
    const overview = overviewRendererRef.current;
    if (chrom === undefined || overview === null) return;
    const length = chromLengthBp(classesData, chrom);
    if (length === null || length <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const centre = overview.bpOnChrom(chrom, e.clientX - rect.left);
    if (centre === null) return;
    const { startBp, endBp } = currentWindow(viewport, length);
    const width = endBp - startBp;
    let s = centre - width / 2;
    let en = centre + width / 2;
    if (s < 0) {
      en -= s;
      s = 0;
    } else if (en > length) {
      s -= en - length;
      en = length;
    }
    setRegionError(null);
    setViewport({
      chrom,
      startBp: Math.round(Math.max(0, s)),
      endBp: Math.round(Math.min(length, en)),
    });
  }

  function handleMouseLeave() {
    if (dragRef.current.active) cancelDrag();
    clearHover();
  }

  function handleCanvasKeyDown(e: ReactKeyboardEvent<HTMLCanvasElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (dragRef.current.active) cancelDrag();
      else resetViewport();
      return;
    }
    if (e.key === '0') {
      e.preventDefault();
      resetViewport();
      return;
    }
    const chrom = viewport.chrom;
    if (chrom === undefined) return; // pan/zoom need a chromosome to pan/zoom on
    const length = chromLengthBp(classesData, chrom);
    if (length === null || length <= 0) return;
    const { startBp, endBp } = currentWindow(viewport, length);
    const width = endBp - startBp;

    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const delta = width * PAN_FRACTION * (e.key === 'ArrowLeft' ? -1 : 1);
      let s = startBp + delta;
      let en = endBp + delta;
      if (s < 0) {
        en -= s;
        s = 0;
      } else if (en > length) {
        s -= en - length;
        en = length;
      }
      setRegionError(null);
      setViewport({
        chrom,
        startBp: Math.round(Math.max(0, s)),
        endBp: Math.round(Math.min(length, en)),
      });
      return;
    }

    if (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_') {
      e.preventDefault();
      const zoomIn = e.key === '+' || e.key === '=';
      const factor = zoomIn ? 1 - ZOOM_FRACTION : 1 + ZOOM_FRACTION;
      const center = (startBp + endBp) / 2;
      const newWidth = Math.min(length, width * factor);
      let s = center - newWidth / 2;
      let en = center + newWidth / 2;
      if (s < 0) {
        en -= s;
        s = 0;
      } else if (en > length) {
        s -= en - length;
        en = length;
      }
      setRegionError(null);
      setViewport({
        chrom,
        startBp: Math.round(Math.max(0, s)),
        endBp: Math.round(Math.min(length, en)),
      });
    }
  }

  // The row window's geometry: every row's height is laid out, only the
  // window's rows are rendered.
  const nRows = classesData?.lines.length ?? 0;
  const rowLayout = layoutRef.current ?? DEFAULT_LAYOUT;
  const rowPeriod = rowLayout.rowHeight + rowLayout.rowGap;
  const windowLines =
    classesData === null
      ? []
      : classesData.lines.slice(rowWindow.first, rowWindow.first + rowWindow.count);

  // The strip's window edges: only meaningful on a single chromosome.
  const windowChrom = viewport.chrom;
  const windowLength = windowChrom === undefined ? null : chromLengthBp(classesData, windowChrom);
  const windowEdges =
    windowChrom === undefined || windowLength === null || windowLength <= 0
      ? null
      : currentWindow(viewport, windowLength);

  return (
    <section>
      <h2>Graphical genotypes</h2>

      {/* The same sort and filter the Lines table reads: changing either
          here reorders or re-filters both screens. */}
      <LineActionBar
        counts={counts}
        sort={sort}
        onSortChange={onSortChange}
        filter={filter}
        onFilterChange={onFilterChange}
        regions={regions}
        showSortControl
        onSelectAllVisible={onSelectAllVisible}
        onSelectNone={onSelectNone}
      />

      {loaded === null ? (
        <p>Load a dataset first.</p>
      ) : (
        <div className="geno-toolbar">
          <label>
            View{' '}
            <select
              value={viewport.chrom ?? WHOLE_GENOME}
              onChange={(e) => {
                const value = e.target.value;
                setRegionError(null);
                setViewport(value === WHOLE_GENOME ? {} : { chrom: value });
              }}
            >
              <option value={WHOLE_GENOME}>Whole genome</option>
              {loaded.chromosomeOrder.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              applyRegion();
            }}
          >
            <label>
              Region{' '}
              <input
                type="text"
                value={regionText}
                onChange={(e) => setRegionText(e.target.value)}
                placeholder="Gm13:28.5-29.1Mb"
                aria-describedby={regionError !== null ? 'genotype-region-error' : undefined}
              />
            </label>{' '}
            <button type="submit">Apply</button>
          </form>

          <button type="button" onClick={resetViewport}>
            Whole genome
          </button>
        </div>
      )}

      {regionError !== null && (
        <p role="alert" className="alert" id="genotype-region-error">
          {regionError}
        </p>
      )}

      {/* Persistently mounted so a screen reader announces the text change,
          rather than mounting/unmounting the whole live region. */}
      <p aria-live="polite">{loading ? 'Loading class data...' : ''}</p>
      {!loading && loaded !== null && classesData === null && <p>No lines to draw.</p>}

      <div className="geno-layout">
        <div className="geno-plot">
          {/* One track per chromosome, placed from the renderer's own layout
              in CSS pixels, so a name sits over the pixels it names. The
              offsets are measurements, not design values, and stay inline. */}
          <div className="geno-strip">
            {tracks.map((track) => (
              <div
                key={track.chrom}
                className="geno-strip-track"
                style={{ left: track.x, width: track.widthPx }}
              >
                <span>{track.chrom}</span>
                {windowEdges !== null && (
                  <span className="geno-strip-window">
                    <span>{mbLabel(windowEdges.startBp)}</span>
                    <span>{mbLabel(windowEdges.endBp)}</span>
                  </span>
                )}
              </div>
            ))}
          </div>

          <div ref={scrollerRef} className="geno-scroll" onScroll={handleScroll}>
            {/* The line names, one per drawn canvas row. Each <li> is one row
                period tall by the same tokens the canvas bins rows with, so
                the two stay in step at any density or zoom. The <ol> is the
                full height of every row and the drawn rows are offset inside
                it by the row window; both are measurements from the tokens. */}
            <ol
              className="geno-gutter"
              aria-label="Lines"
              data-rows={nRows}
              data-first-row={rowWindow.first}
              style={{ height: nRows * rowPeriod, paddingTop: rowWindow.first * rowPeriod }}
            >
              {windowLines.map((line) => (
                <li key={line.sampleId}>
                  <button
                    type="button"
                    aria-pressed={selected.has(line.sampleId)}
                    title={line.sampleId}
                    onClick={() => toggleSelected(line.sampleId)}
                  >
                    {line.sampleId}
                  </button>
                </li>
              ))}
            </ol>

            <div
              ref={containerRef}
              className="geno-canvas-host"
              style={{ height: Math.max(rowPeriod, nRows * rowPeriod) }}
            >
              <canvas
                ref={canvasRef}
                className="geno-canvas"
                style={{ marginTop: rowWindow.first * rowPeriod }}
                role="img"
                tabIndex={0}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                onKeyDown={handleCanvasKeyDown}
                aria-label="Graphical genotypes: one row per line, one track per chromosome; colours as in the legend. Drag to zoom; arrow keys pan; plus and minus zoom; 0 resets; escape cancels or resets."
              >
                Graphical genotype rendering is not supported in this browser.
              </canvas>
            </div>
          </div>

          {/* The whole chromosome at a glance, with the current window
              marked; clicking recentres it. Panning by keyboard is the
              main canvas's arrow keys, which move the same window. Outside
              the scroller, so it stays visible while the rows scroll. */}
          {viewport.chrom !== undefined && (
            <canvas
              ref={overviewRef}
              className="geno-overview"
              role="img"
              onClick={handleOverviewClick}
              aria-label={`Overview of the whole of ${viewport.chrom}, with the shown window marked. Click to recentre the window.`}
            />
          )}
        </div>

        <div className="marker-detail">
          <h3>Marker detail</h3>
          {/* Visible text: updates immediately (cheap fields, then the
              enrichment once it lands) so the panel never lags the pointer.
              Not itself aria-live -- see the hidden paragraph below. */}
          <p className="marker-detail-text">
            {hoverInfo === null ? NO_HOVER_MESSAGE : formatDetail(hoverInfo, detail, detailNote)}
          </p>
          {/* aria-live region: announces once per settled hover (see header
              comment), not once for the cheap fields and again for the
              enrichment. */}
          <p aria-live="polite" className="visually-hidden">
            {settledText}
          </p>
        </div>
      </div>

      <p className="keyboard-help">
        Keyboard, with the canvas focused: Left/Right pan; +/- zoom in and out; 0 resets to whole
        genome; Escape cancels a drag in progress, or otherwise resets to whole genome.
      </p>

      <p className="keyboard-help">
        A column drawn in one class and overlaid with another class&apos;s pattern holds calls of
        both; the fill is the majority.
      </p>
      <ul className="legend" aria-label="Class legend">
        {LEGEND_CLASSES.map((cls) => (
          <li key={cls}>
            <span
              aria-hidden="true"
              className="class-swatch"
              style={{ background: classSwatchCss(cls) }}
            />
            {CALL_CLASS_LABEL[cls]}
          </li>
        ))}
      </ul>
    </section>
  );
}
