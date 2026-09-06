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
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { config } from './config.ts';
import type { GapCriterion } from './core/segments.ts';
import type { DonorSegment, LineRpp, QcReport, TargetCheck, TargetRegion } from './core/types.ts';
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [classesData, setClassesData] = useState<GenotypeClassesData | null>(null);
  const [classesKey, setClassesKey] = useState<string | null>(null);
  const [classesLoading, setClassesLoading] = useState(false);

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

  // Full candidate list in rpp order (== classification.candidateCols order,
  // the order the worker uses for segmentsByCandidate and 'classes' rows);
  // the genotype view draws the selection, or every candidate when nothing
  // is selected.
  const candidateIds = useMemo(() => rpp?.map((r) => r.sampleId) ?? [], [rpp]);
  const genotypeSampleIds = useMemo(
    () => (selected.size > 0 ? candidateIds.filter((id) => selected.has(id)) : candidateIds),
    [candidateIds, selected],
  );

  useEffect(() => {
    if (screen !== 'genotypes' || loaded === null) return;
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
      <header>
        <h1 style={{ fontSize: 20, margin: 0 }}>Isoline Browser</h1>
        <p style={{ margin: '4px 0 12px', color: '#555' }}>
          Files are processed in this browser tab and never uploaded.
        </p>
        <nav aria-label="Screens">
          {SCREENS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setScreen(s.id)}
              aria-current={screen === s.id ? 'page' : undefined}
              style={{ marginRight: 8, fontWeight: screen === s.id ? 700 : 400 }}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </header>
      {error !== null && <p role="alert">{error}</p>}
      <main style={{ marginTop: 16 }}>
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
          <GenotypeViewScreen loaded={loaded} classesData={classesData} loading={classesLoading} />
        )}
        {screen === 'compare' && <CompareScreen />}
        {screen === 'export' && <ExportScreen />}
      </main>
    </div>
  );
}
