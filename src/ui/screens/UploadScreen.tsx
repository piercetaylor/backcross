/**
 * Screen 1: upload and validate.
 *
 * Responsibility: three file pickers (genotypes: VCF/VCF.gz/HapMap/wide CSV;
 * samples.csv; optional markers.csv), a parameter panel seeded from
 * `params` and reported through `onParamsChange` on blur or Enter
 * (docs/data-formats.md, "Analysis parameters"), and a "Load" action that
 * reads the chosen files as ArrayBuffers and calls `onLoad`. Shows parser
 * warnings and a one-line dataset summary once `loaded` is set. Every
 * parameter input is disabled while `busy` is true, so a value cannot be
 * edited mid-chain. Props/callbacks only: this screen never touches the
 * worker, App does.
 *
 * Props: params, onParamsChange, busy, onLoad, loaded.
 */
import { useState } from 'react';

import type { QcThresholds, RppParams, SegmentParams } from '../../core/types.ts';
import type { WorkerRequest, WorkerResult } from '../../workers/protocol.ts';

export interface AnalysisParams {
  rpp: RppParams;
  segments: SegmentParams;
  qc: QcThresholds;
}

export type LoadedState = Extract<WorkerResult, { type: 'loaded' }>;
export type LoadPayload = Extract<WorkerRequest, { type: 'load' }>['payload'];

/**
 * A number input that keeps its own text so a field being edited never
 * reflects `Number('')` (0, which passes `Number.isFinite`) as a live
 * parameter value. `onChange` fires only on blur or Enter, and only when
 * the text parses to a finite number; an unparsable or empty field is left
 * as typed until blur, at which point it snaps back to the last committed
 * `value`. The text resyncs to `value` whenever it changes from outside
 * (a successful commit, or a rollback after a failed request) but never
 * while the user is simply typing, since editing itself never changes
 * `value`.
 */
function NumberField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(() => String(value));
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(String(value));
  }

  const trimmed = text.trim();
  const parsed = trimmed === '' ? NaN : Number(trimmed);
  const valid = Number.isFinite(parsed);

  function commitIfValid() {
    if (valid && parsed !== value) onChange(parsed);
  }

  return (
    <label style={{ display: 'block', marginBottom: 6 }}>
      {label}{' '}
      <input
        type="number"
        value={text}
        disabled={disabled}
        aria-invalid={!valid}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          commitIfValid();
          if (!valid) setText(String(value));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitIfValid();
        }}
      />
    </label>
  );
}

export function UploadScreen({
  params,
  onParamsChange,
  busy,
  onLoad,
  loaded,
}: {
  params: AnalysisParams;
  onParamsChange: (next: AnalysisParams) => void;
  busy: boolean;
  onLoad: (payload: LoadPayload) => void;
  loaded: LoadedState | null;
}) {
  const [genotypeFile, setGenotypeFile] = useState<File | null>(null);
  const [samplesFile, setSamplesFile] = useState<File | null>(null);
  const [markersFile, setMarkersFile] = useState<File | null>(null);

  const canLoad = genotypeFile !== null && samplesFile !== null && !busy;

  async function handleLoad() {
    if (genotypeFile === null || samplesFile === null) return;
    const [genotypes, samples, markers] = await Promise.all([
      genotypeFile.arrayBuffer(),
      samplesFile.arrayBuffer(),
      markersFile === null ? Promise.resolve(undefined) : markersFile.arrayBuffer(),
    ]);
    onLoad({
      genotypeFileName: genotypeFile.name,
      genotypes,
      samples,
      ...(markers === undefined ? {} : { markers }),
    });
  }

  return (
    <section>
      <h2>Upload and validate</h2>
      <p>Files are processed in this browser tab and never uploaded anywhere.</p>

      <div>
        <label>
          Genotype file (VCF, HapMap, or wide CSV){' '}
          <input type="file" onChange={(e) => setGenotypeFile(e.target.files?.[0] ?? null)} />
        </label>
      </div>
      <div>
        <label>
          samples.csv{' '}
          <input
            type="file"
            accept=".csv,.tsv,.txt"
            onChange={(e) => setSamplesFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>
      <div>
        <label>
          markers.csv (optional){' '}
          <input
            type="file"
            accept=".csv,.tsv,.txt"
            onChange={(e) => setMarkersFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      <fieldset>
        <legend>RPP coverage cap</legend>
        <NumberField
          label="Maximum marker coverage (bp)"
          value={params.rpp.maxGapBp}
          disabled={busy}
          onChange={(v) => onParamsChange({ ...params, rpp: { ...params.rpp, maxGapBp: v } })}
        />
        <NumberField
          label="Maximum marker coverage (cM)"
          value={params.rpp.maxGapCm}
          disabled={busy}
          onChange={(v) => onParamsChange({ ...params, rpp: { ...params.rpp, maxGapCm: v } })}
        />
      </fieldset>

      <fieldset>
        <legend>Donor-run breaking</legend>
        <p>
          The cM gap applies only when markers.csv supplies a genetic map; otherwise the bp gap is
          used.
        </p>
        <NumberField
          label="Minimum markers per segment"
          value={params.segments.minMarkers}
          disabled={busy}
          onChange={(v) =>
            onParamsChange({ ...params, segments: { ...params.segments, minMarkers: v } })
          }
        />
        <NumberField
          label="Maximum marker gap (bp)"
          value={params.segments.maxGapBp}
          disabled={busy}
          onChange={(v) =>
            onParamsChange({ ...params, segments: { ...params.segments, maxGapBp: v } })
          }
        />
        <NumberField
          label="Maximum marker gap (cM)"
          value={params.segments.maxGapCm}
          disabled={busy}
          onChange={(v) =>
            onParamsChange({ ...params, segments: { ...params.segments, maxGapCm: v } })
          }
        />
        <NumberField
          label="Maximum missing-call span"
          value={params.segments.maxMissingSpan}
          disabled={busy}
          onChange={(v) =>
            onParamsChange({ ...params, segments: { ...params.segments, maxMissingSpan: v } })
          }
        />
      </fieldset>

      <fieldset>
        <legend>QC thresholds</legend>
        <NumberField
          label="Maximum line missing rate"
          value={params.qc.lineMissingMax}
          disabled={busy}
          onChange={(v) => onParamsChange({ ...params, qc: { ...params.qc, lineMissingMax: v } })}
        />
        <NumberField
          label="Maximum line heterozygosity rate"
          value={params.qc.lineHetMax}
          disabled={busy}
          onChange={(v) => onParamsChange({ ...params, qc: { ...params.qc, lineHetMax: v } })}
        />
        <NumberField
          label="Minimum marker call rate"
          value={params.qc.markerCallRateMin}
          disabled={busy}
          onChange={(v) =>
            onParamsChange({ ...params, qc: { ...params.qc, markerCallRateMin: v } })
          }
        />
        <NumberField
          label="Maximum parent heterozygosity rate"
          value={params.qc.parentHetMax}
          disabled={busy}
          onChange={(v) => onParamsChange({ ...params, qc: { ...params.qc, parentHetMax: v } })}
        />
      </fieldset>

      <button type="button" onClick={() => void handleLoad()} disabled={!canLoad}>
        Load
      </button>

      {loaded !== null && (
        <div>
          {loaded.warnings.length > 0 && (
            <ul>
              {loaded.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          <p>
            {loaded.nMarkers.toLocaleString()} markers, {loaded.nSamples.toLocaleString()} samples,{' '}
            {loaded.nInformative.toLocaleString()} informative; gap criterion: {loaded.gapCriterion}
          </p>
        </div>
      )}
    </section>
  );
}
