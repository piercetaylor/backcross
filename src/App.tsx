/**
 * Application shell.
 *
 * Responsibility: own the single analysis worker (wrapped in AnalysisClient)
 * and all session state -- the loaded dataset summary, the active analysis
 * parameters, the latest RPP/QC/segments/targets results, the line
 * selection, and which screen is showing -- and route between the six
 * screens in PLAN.md ("UI walkthrough"). Screens receive plain props and
 * callbacks; only this file talks to the worker.
 *
 * Sequencing after a successful 'load': request 'rpp', then 'qc' (which
 * needs a LineRpp[] and so must follow rpp), then 'segmentsAll', awaited in
 * order so a failure is attributable to one step; then navigate to Summary.
 * Editing a parameter after load does not re-parse: changing rpp params
 * re-requests rpp (+ qc, which depends on it); changing segment params
 * re-requests segmentsAll (+ targets, if any specs are active); changing QC
 * thresholds re-requests qc only.
 *
 * Overlapping chains: a `useRef` sequence counter is bumped at the start of
 * every load/param-change chain. Each chain checks the counter against its
 * own value after every awaited step and bails out (no `set*` call, no
 * `busy` clear) once a later chain has started, so the last change always
 * wins and state is never a mix of two parameter sets. A chain that fails
 * while still current rolls `params` back to the value it had before that
 * chain's edit and reports the error; results already on screen are left as
 * they were. `runLoad` reads params through `paramsRef`, which always holds
 * the latest committed value, rather than the closure captured when the
 * Load button was clicked. Parameter inputs are disabled (via `busy`) while
 * any chain is in flight.
 *
 * Keyboard navigation (M2): the screen nav is a roving-tabindex toolbar
 * (role="toolbar") -- only the active screen's button is in the Tab order,
 * and Left/Right/Home/End move focus between buttons and activate (navigate
 * to) the one focus lands on, the standard toolbar/tab pattern. A "Skip to
 * main content" link is the first focusable element on the page, targeting
 * the focusable <main>. A global :focus-visible outline replaces the
 * browser default, which is not reliably visible against this app's white
 * background.
 *
 * Compare (M2): `compare` holds the latest 'compare' worker result;
 * `runCompare` issues that request. Like `handleApplyTargets`, it is
 * deliberately not on the shared sequence counter (the Compare screen is
 * reachable at any time and a failure must not disturb an in-flight param
 * chain or clobber the previous result), and it is cleared on every new
 * load.
 *
 * Export (M2): the 'classes' fetch effect below (keyed on `screen`,
 * `genotypeSampleIds`) also runs on the Export screen, not only Graphical
 * genotypes, since the HTML report's per-line figures are rendered from the
 * same worker-fetched, selection-keyed `classesData` rather than a second
 * request. Everything else ExportScreen needs (rpp, qc,
 * segmentsByCandidate, targets, params, gapCriterion, compare, busy) is
 * already tracked here and passed straight through; `busy` lets it disable
 * the one export that issues its own worker request (discordant-markers
 * CSV) while a load or parameter chain could still replace the dataset that
 * request would run against.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import { config } from './config.ts';
import type { GapCriterion } from './core/segments.ts';
import type {
  DonorSegment,
  LineRpp,
  PairwiseDiff,
  QcReport,
  SampleRecord,
  TargetCheck,
  TargetRegion,
} from './core/types.ts';
import { CompareScreen } from './ui/screens/CompareScreen.tsx';
import { ExportScreen } from './ui/screens/ExportScreen.tsx';
import { GenotypeViewScreen } from './ui/screens/GenotypeViewScreen.tsx';
import { LineTableScreen } from './ui/screens/LineTableScreen.tsx';
import { SummaryScreen } from './ui/screens/SummaryScreen.tsx';
import type { AnalysisParams, LoadedState, LoadPayload } from './ui/screens/UploadScreen.tsx';
import { UploadScreen } from './ui/screens/UploadScreen.tsx';
import { AnalysisClient } from './workers/client.ts';
import type { GenotypeClassesData } from './workers/protocol.ts';

export type Screen = 'upload' | 'summary' | 'lines' | 'genotypes' | 'compare' | 'export';

const SCREENS: { id: Screen; label: string }[] = [
  { id: 'upload', label: '1. Upload' },
  { id: 'summary', label: '2. Summary and QC' },
  { id: 'lines', label: '3. Lines' },
  { id: 'genotypes', label: '4. Graphical genotypes' },
  { id: 'compare', label: '5. Compare' },
  { id: 'export', label: '6. Export' },
];

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Stable empty fallbacks for CompareScreen's `samples`/`chromosomeOrder`
// props while nothing is loaded, so its effect (keyed on the `samples`
// array's identity) does not re-fire on every unrelated App render.
const NO_SAMPLES: SampleRecord[] = [];
const NO_CHROMOSOMES: string[] = [];

export function App() {
  const [screen, setScreen] = useState<Screen>('upload');
  const [params, setParams] = useState<AnalysisParams>({
    rpp: config.rpp,
    segments: config.segments,
    qc: config.qc,
  });
  const [loaded, setLoaded] = useState<LoadedState | null>(null);
  const [rpp, setRpp] = useState<LineRpp[] | null>(null);
  const [qc, setQc] = useState<QcReport | null>(null);
  const [segmentsByCandidate, setSegmentsByCandidate] = useState<DonorSegment[][] | null>(null);
  const [gapCriterion, setGapCriterion] = useState<GapCriterion | null>(null);
  const [targetSpecs, setTargetSpecs] = useState<string[]>([]);
  const [targets, setTargets] = useState<{ regions: TargetRegion[]; checks: TargetCheck[] } | null>(
    null,
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [compare, setCompare] = useState<PairwiseDiff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [classesData, setClassesData] = useState<GenotypeClassesData | null>(null);
  const [classesKey, setClassesKey] = useState<string | null>(null);
  const [classesLoading, setClassesLoading] = useState(false);

  const mainRef = useRef<HTMLElement | null>(null);
  const navButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const clientRef = useRef<AnalysisClient | null>(null);
  // Always holds the latest committed `params`, so runLoad reads the
  // current value instead of the click-time closure.
  const paramsRef = useRef<AnalysisParams>(params);
  // Bumped at the start of every load/param-change chain; a chain compares
  // its own snapshot against the live value to detect it has been
  // superseded (see the module header comment).
  const requestSeqRef = useRef(0);

  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  useEffect(() => {
    const worker = new Worker(new URL('./workers/analysis.worker.ts', import.meta.url), {
      type: 'module',
    });
    const client = new AnalysisClient(worker);
    clientRef.current = client;
    return () => {
      client.terminate();
      clientRef.current = null;
    };
  }, []);

  function getClient(): AnalysisClient {
    const client = clientRef.current;
    if (client === null) throw new Error('worker not ready');
    return client;
  }

  async function runLoad(payload: LoadPayload) {
    const seq = ++requestSeqRef.current;
    setError(null);
    setBusy(true);
    try {
      const transfer: Transferable[] = [payload.genotypes, payload.samples];
      if (payload.markers !== undefined) transfer.push(payload.markers);
      const client = getClient();
      const loadRes = await client.request('load', payload, transfer);
      if (requestSeqRef.current !== seq) return;
      setLoaded(loadRes);
      setRpp(null);
      setQc(null);
      setSegmentsByCandidate(null);
      setGapCriterion(null);
      setTargets(null);
      setTargetSpecs([]);
      setSelected(new Set());
      setCompare(null);
      setClassesData(null);
      setClassesKey(null);

      const rppRes = await client.request('rpp', paramsRef.current.rpp);
      if (requestSeqRef.current !== seq) return;
      setRpp(rppRes.lines);
      const qcRes = await client.request('qc', paramsRef.current.qc);
      if (requestSeqRef.current !== seq) return;
      setQc(qcRes.report);
      const segRes = await client.request('segmentsAll', { params: paramsRef.current.segments });
      if (requestSeqRef.current !== seq) return;
      setSegmentsByCandidate(segRes.byCandidate);
      setGapCriterion(segRes.gapCriterion);
      setScreen('summary');
    } catch (e) {
      if (requestSeqRef.current === seq) setError(errorMessage(e));
    } finally {
      if (requestSeqRef.current === seq) setBusy(false);
    }
  }

  async function handleParamsChange(next: AnalysisParams) {
    const prev = params;
    setParams(next);
    if (loaded === null) return;
    const rppChanged = next.rpp !== prev.rpp;
    const segChanged = next.segments !== prev.segments;
    const qcChanged = next.qc !== prev.qc;
    if (!rppChanged && !segChanged && !qcChanged) return;
    const seq = ++requestSeqRef.current;
    setBusy(true);
    setError(null);
    try {
      const client = getClient();
      if (rppChanged) {
        const r = await client.request('rpp', next.rpp);
        if (requestSeqRef.current !== seq) return;
        setRpp(r.lines);
        const q = await client.request('qc', next.qc);
        if (requestSeqRef.current !== seq) return;
        setQc(q.report);
      } else if (qcChanged) {
        const q = await client.request('qc', next.qc);
        if (requestSeqRef.current !== seq) return;
        setQc(q.report);
      }
      if (segChanged) {
        const s = await client.request('segmentsAll', { params: next.segments });
        if (requestSeqRef.current !== seq) return;
        setSegmentsByCandidate(s.byCandidate);
        setGapCriterion(s.gapCriterion);
        if (targetSpecs.length > 0) {
          const t = await client.request('targets', { specs: targetSpecs, params: next.segments });
          if (requestSeqRef.current !== seq) return;
          setTargets({ regions: t.regions, checks: t.checks });
        }
      }
    } catch (e) {
      // Only roll back if this chain is still the current one; a chain that
      // has already been superseded must not clobber a newer edit's params.
      if (requestSeqRef.current === seq) {
        setParams(prev);
        setError(errorMessage(e));
      }
    } finally {
      if (requestSeqRef.current === seq) setBusy(false);
    }
  }

  // Deliberately not on the shared sequence counter: Apply is reachable
  // from the Lines screen at any time, including while a param chain is in
  // flight, and must not cause that chain's own rpp/qc/segments results to
  // be discarded. targetSpecs/targets are updated together only on success,
  // so a failed apply never leaves them mismatched with each other.
  async function handleApplyTargets(specs: string[]) {
    if (loaded === null) return;
    setBusy(true);
    setError(null);
    try {
      const t = await getClient().request('targets', { specs, params: params.segments });
      setTargetSpecs(specs);
      setTargets({ regions: t.regions, checks: t.checks });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // Deliberately not on the shared sequence counter, for the same reason as
  // handleApplyTargets above: the Compare screen is reachable at any time,
  // including while a param chain is in flight, and a compare request must
  // not race that chain's own state updates. A failure leaves the previous
  // `compare` result on screen and only reports the error.
  async function runCompare(sampleA: string, sampleB: string, mode: 'informative' | 'all') {
    if (loaded === null) return;
    setBusy(true);
    setError(null);
    try {
      const res = await getClient().request('compare', { sampleA, sampleB, mode });
      setCompare(res.diff);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // Full candidate list in rpp order (== classification.candidateCols order,
  // the order the worker uses for segmentsByCandidate and 'classes' rows);
  // the genotype view draws the selection, or every candidate when nothing
  // is selected.
  const candidateIds = useMemo(() => rpp?.map((r) => r.sampleId) ?? [], [rpp]);
  const genotypeSampleIds = useMemo(
    () => (selected.size > 0 ? candidateIds.filter((id) => selected.has(id)) : candidateIds),
    [candidateIds, selected],
  );

  // Also runs on the Export screen: the HTML report's per-line figures reuse
  // this same worker-fetched, selection-keyed class data (see
  // ui/screens/ExportScreen.tsx) rather than issuing a second 'classes'
  // request, so the report shows the same lines the genotype view would.
  useEffect(() => {
    if ((screen !== 'genotypes' && screen !== 'export') || loaded === null) return;
    const ids = genotypeSampleIds;
    const key = ids.join(',');
    if (key === classesKey) return;
    if (ids.length === 0) {
      setClassesData(null);
      setClassesKey(key);
      return;
    }
    let cancelled = false;
    setClassesLoading(true);
    getClient()
      .request('classes', { sampleIds: ids })
      .then((res) => {
        if (cancelled) return;
        setClassesData(res);
        setClassesKey(key);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setClassesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [screen, loaded, genotypeSampleIds, classesKey]);

  // Roving-tabindex toolbar: Left/Right/Home/End move focus between screen
  // buttons and activate (navigate to) the one focus lands on. Only the
  // active screen's button is in the Tab order (see the button's tabIndex
  // below); this handler moves both the React `screen` state and the DOM
  // focus together so the two never disagree about which button is current.
  function handleNavKeyDown(e: ReactKeyboardEvent<HTMLElement>) {
    const idx = SCREENS.findIndex((s) => s.id === screen);
    let nextIdx: number;
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % SCREENS.length;
    else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + SCREENS.length) % SCREENS.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = SCREENS.length - 1;
    else return;
    e.preventDefault();
    const next = SCREENS[nextIdx];
    if (next === undefined) return;
    setScreen(next.id);
    navButtonRefs.current[nextIdx]?.focus();
  }

  return (
    <div
      style={{
        fontFamily: 'system-ui, sans-serif',
        maxWidth: 1200,
        margin: '0 auto',
        padding: 16,
        // The app is deliberately single-theme (no dark mode); pin an
        // explicit background/foreground so labels drawn by the canvas
        // renderer (which hard-codes black text) stay legible against a
        // dark host page.
        background: '#ffffff',
        color: '#111111',
      }}
    >
      {/* Global focus style (the browser default is not reliably visible on
          this app's white background) and the skip-link's hidden-until-focus
          styling; a plain <style> tag rather than a separate stylesheet, since
          this file is the only one this change may touch. */}
      <style>{`
        *:focus-visible {
          outline: 3px solid #005fcc;
          outline-offset: 2px;
        }
        .skip-link {
          position: absolute;
          left: -9999px;
          top: 0;
          background: #ffffff;
          color: #111111;
          padding: 8px 12px;
          border: 2px solid #005fcc;
          z-index: 1000;
        }
        .skip-link:focus {
          left: 8px;
          top: 8px;
        }
      `}</style>
      <a
        href="#main-content"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Skip to main content
      </a>
      <header>
        <h1 style={{ fontSize: 20, margin: 0 }}>Isoline Browser</h1>
        <p style={{ margin: '4px 0 12px', color: '#555' }}>
          Files are processed in this browser tab and never uploaded.
        </p>
        <nav role="toolbar" aria-label="Screens" onKeyDown={handleNavKeyDown}>
          {SCREENS.map((s, i) => (
            <button
              key={s.id}
              ref={(el) => {
                navButtonRefs.current[i] = el;
              }}
              type="button"
              onClick={() => setScreen(s.id)}
              aria-current={screen === s.id ? 'page' : undefined}
              tabIndex={screen === s.id ? 0 : -1}
              style={{ marginRight: 8, fontWeight: screen === s.id ? 700 : 400 }}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </header>
      {error !== null && <p role="alert">{error}</p>}
      <main id="main-content" ref={mainRef} tabIndex={-1} style={{ marginTop: 16 }}>
        {screen === 'upload' && (
          <UploadScreen
            params={params}
            onParamsChange={(next) => void handleParamsChange(next)}
            busy={busy}
            onLoad={(payload) => void runLoad(payload)}
            loaded={loaded}
          />
        )}
        {screen === 'summary' && (
          <SummaryScreen
            loaded={loaded}
            qc={qc}
            segmentParams={params.segments}
            gapCriterion={gapCriterion}
          />
        )}
        {screen === 'lines' && (
          <LineTableScreen
            loaded={loaded}
            rpp={rpp}
            segmentsByCandidate={segmentsByCandidate}
            targets={targets}
            targetSpecs={targetSpecs}
            qc={qc}
            selected={selected}
            onSelectionChange={setSelected}
            onApplyTargets={(specs) => void handleApplyTargets(specs)}
          />
        )}
        {screen === 'genotypes' && (
          <GenotypeViewScreen
            loaded={loaded}
            classesData={classesData}
            loading={classesLoading}
            onRequestMarkerDetail={(markerIndex, sampleIds) =>
              getClient().request('markerDetail', { markerIndex, sampleIds })
            }
          />
        )}
        {screen === 'compare' && (
          <CompareScreen
            samples={loaded?.samples ?? NO_SAMPLES}
            compare={compare}
            runCompare={(a, b, mode) => void runCompare(a, b, mode)}
            busy={busy}
            chromosomeOrder={loaded?.chromosomeOrder ?? NO_CHROMOSOMES}
          />
        )}
        {screen === 'export' && (
          <ExportScreen
            loaded={loaded}
            rpp={rpp}
            qc={qc}
            segmentsByCandidate={segmentsByCandidate}
            targets={targets}
            params={params}
            gapCriterion={gapCriterion}
            compare={compare}
            classesData={classesData}
            classesLoading={classesLoading}
            busy={busy}
            onRequestDiscordantMarkersCsv={(sampleA, sampleB, mode) =>
              getClient()
                .request('discordantMarkersCsv', { sampleA, sampleB, mode })
                .then((r) => r.csv)
            }
          />
        )}
      </main>
    </div>
  );
}
