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
 * onFilterChange, regions, onSelectAllVisible, onSelectNone,
 * onRequestMarkerDetail?.
 */
import { useEffect, useRef, useState } from 'react';
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react';

import { GraphicalGenotypeRenderer } from '../canvas/GraphicalGenotypeRenderer.ts';
import type { Viewport } from '../canvas/GraphicalGenotypeRenderer.ts';
import { CLASS_COLORS } from '../../core/index.ts';
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

/** Visually hidden but still readable by assistive tech (the aria-live region for settled hover detail). */
const VISUALLY_HIDDEN_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

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
  onSelectAllVisible: () => void;
  onSelectNone: () => void;
  /** Fetches marker detail (id, cM, alleles, per-sample calls) for a hover. Omitted when the host has no wiring to the worker yet; the panel then shows only the cheap fields. */
  onRequestMarkerDetail?: (markerIndex: number, sampleIds: string[]) => Promise<MarkerDetailResult>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<GraphicalGenotypeRenderer | null>(null);
  const dragRef = useRef<DragState>({ active: false, startX: 0, chrom: null });
  /** `${sampleId}:${markerIndex}` of the marker a detail request was last scheduled for, so lingering on the same marker across mousemove events does not reschedule. */
  const hoverKeyRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Bumped whenever a pending detail request is superseded, so a late response for a marker that is no longer hovered is discarded. */
  const detailSeqRef = useRef(0);
  /** Pending requestAnimationFrame id for a coalesced resize redraw, or null when none is scheduled. */
  const resizeRafRef = useRef<number | null>(null);

  const [viewport, setViewport] = useState<Viewport>({});
  const [regionText, setRegionText] = useState('');
  const [regionError, setRegionError] = useState<string | null>(null);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [detail, setDetail] = useState<MarkerDetailResult | null>(null);
  const [detailNote, setDetailNote] = useState<string | null>(null);
  /** Text for the aria-live region: written only when a hover settles (see header comment). */
  const [settledText, setSettledText] = useState(NO_HOVER_MESSAGE);

  useEffect(() => {
    if (canvasRef.current === null) return;
    rendererRef.current = new GraphicalGenotypeRenderer(canvasRef.current);
  }, []);

  // Coalesced into a single requestAnimationFrame per resize burst: a
  // whole-genome draw at 50,000 markers by 200 lines measures about 124 ms,
  // so redrawing synchronously on every ResizeObserver callback during a
  // window-resize drag would visibly thrash. A new callback cancels any
  // frame still pending from the previous one, so only the last size in a
  // burst is ever drawn.
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width === undefined) return;
      if (resizeRafRef.current !== null) cancelAnimationFrame(resizeRafRef.current);
      resizeRafRef.current = requestAnimationFrame(() => {
        resizeRafRef.current = null;
        const renderer = rendererRef.current;
        if (renderer === null) return;
        renderer.setSize(width);
        renderer.draw();
      });
    });
    ro.observe(container);
    return () => {
      ro.disconnect();
      if (resizeRafRef.current !== null) {
        cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (renderer === null) return;
    // Called with classesData === null too, so a cleared/empty selection
    // clears the previously drawn rows rather than leaving a stale frame.
    renderer.setData(classesData);
    renderer.setViewport(viewport);
    renderer.draw();
  }, [classesData, viewport]);

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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
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
        <p role="alert" id="genotype-region-error">
          {regionError}
        </p>
      )}

      {/* Persistently mounted so a screen reader announces the text change,
          rather than mounting/unmounting the whole live region. */}
      <p aria-live="polite">{loading ? 'Loading class data...' : ''}</p>
      {!loading && loaded !== null && classesData === null && <p>No lines to draw.</p>}

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div
          ref={containerRef}
          style={{ flex: '1 1 auto', minWidth: 0, overflowX: 'auto', background: '#ffffff' }}
        >
          <canvas
            ref={canvasRef}
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

        <div style={{ width: 240, flex: '0 0 auto' }}>
          <h3 style={{ fontSize: 14, margin: '0 0 4px' }}>Marker detail</h3>
          {/* Visible text: updates immediately (cheap fields, then the
              enrichment once it lands) so the panel never lags the pointer.
              Not itself aria-live -- see the hidden paragraph below. */}
          <p style={{ minHeight: '4.5em', margin: 0, fontSize: 13 }}>
            {hoverInfo === null ? NO_HOVER_MESSAGE : formatDetail(hoverInfo, detail, detailNote)}
          </p>
          {/* aria-live region: announces once per settled hover (see header
              comment), not once for the cheap fields and again for the
              enrichment. */}
          <p aria-live="polite" style={VISUALLY_HIDDEN_STYLE}>
            {settledText}
          </p>
        </div>
      </div>

      <p style={{ fontSize: 12, color: '#555' }}>
        Keyboard, with the canvas focused: Left/Right pan; +/- zoom in and out; 0 resets to whole
        genome; Escape cancels a drag in progress, or otherwise resets to whole genome.
      </p>

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
