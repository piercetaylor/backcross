/**
 * Screen 1: upload and validate.
 *
 * Responsibility: a Source switch between Files and BrAPI server; for Files
 * a genotype file picker (VCF/VCF.gz/HapMap/wide CSV), for BrAPI three text
 * fields (Base URL, Variant set id, and an optional access token that lives
 * in this component's state only, never in storage, a URL or `loaded`) and a
 * "Download call-set table" button that asks App for the variant set's call
 * sets (`onFetchCallSets`) and downloads them as brapi-callsets.csv, so
 * samples.csv can be written before a load; then the samples.csv and optional
 * markers.csv pickers, a parameter panel seeded from
 * `params` and reported through `onParamsChange` on blur or Enter
 * (docs/data-formats.md, "Analysis parameters"), and a "Load" action that
 * passes the genotype `File` as-is (the worker reads it as a stream,
 * docs/adr/0012), reads samples.csv and markers.csv as ArrayBuffers, and
 * calls `onLoad` with a 'load' request, or with a 'loadBrapi' request carrying
 * the BrAPI source (docs/adr/0015). While a BrAPI load runs (`brapiLoading`)
 * a Cancel button calls `onCancelBrapi`; it is not disabled by `busy`. Shows parser
 * warnings and a one-line dataset summary once `loaded` is set. Links
 * docs/input-coding.md (the accepted, missing and rejected codes per format)
 * from the intro paragraph. Every
 * file picker and parameter input is disabled while `busy` is true, so
 * neither a file nor a value can be changed mid-chain. Props/callbacks only: this screen never touches the
 * worker, App does. Cancel moves focus to the screen heading before it unmounts, so focus never
 * drops to the body (tests/browser/focus-order.test.tsx).
 *
 * The intro band (docs/adr/0017) carries the privacy sentence, a "Try the demo
 * dataset" button that calls `onLoad` with a 'loadDemo' request for the
 * synthetic fixture the site serves under demo/synthetic/ (the worker fetches
 * it and loads it as it loads picked files), a "Copy link to this demo"
 * button that writes the page's `?demo=synthetic` address, with `&crop=<id>`
 * for any crop but soybean, to the clipboard
 * and reports the outcome in a polite status line, and a note that the demo
 * data are synthetic. The input-coding link stays the band's first tab stop.
 *
 * Under the genotype-file input (contract 1.4.0, docs/adr/0019) a React Aria
 * `Select` labelled "Token profile" offers "Contract default (by format)" and
 * each built-in profile's name (BUILTIN_PROFILES order), and a file input
 * labelled "Custom token profile (JSON, optional)" takes a profile JSON: it is
 * read, parsed and validated (validateProfile) on selection; an invalid file
 * shows the validation message in a role="alert" and blocks Load, and a valid
 * one disables the select and is sent as the `profile` object. For a BrAPI
 * source the select is disabled at the default with a help text. Both load
 * payloads carry `profile`.
 *
 * A second `Select`, labelled "Crop" (contract 1.5.0 and 1.7.0, docs/adr/0020
 * and 0022), offers the twelve built-in crop chromosome schemes in
 * BUILTIN_CROPS order with soybean first; it starts at the loaded dataset's
 * crop, else soybean, and it chooses which
 * spellings normalise to which canonical chromosome names, and the files,
 * BrAPI and demo load payloads all carry `crop`.
 *
 * Props: params, onParamsChange, busy, loaded, onLoad, onFetchCallSets,
 * onCancelBrapi, brapiLoading.
 */
import { useRef, useState } from 'react';
import {
  Button,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  RadioGroup,
  Select,
  SelectValue,
  TextField,
} from 'react-aria-components';

import './screens.css';
import type { QcThresholds, RppParams, SegmentParams } from '../../core/types.ts';
import { callSetsCsv } from '../../export/callsets-csv.ts';
import type { BrapiCallSet, BrapiSource } from '../../io/brapi.ts';
import { BUILTIN_CROPS, DEFAULT_CROP_ID } from '../../io/crops.ts';
import { BUILTIN_PROFILES, DEFAULT_PROFILE_ID, validateProfile } from '../../io/profiles.ts';
import type { TokenProfile } from '../../io/profiles.ts';
import type { WorkerRequest, WorkerResult } from '../../workers/protocol.ts';
import { demoLoadPayload, demoShareLink } from '../demo.ts';
import type { DemoLoadPayload } from '../demo.ts';
import { downloadText } from '../download.ts';
import { LineRadio } from '../lines/LineActionBar.tsx';

/** docs/input-coding.md on the repository; the static site does not serve docs/. */
const INPUT_CODING_URL = 'https://github.com/piercetaylor/backcross/blob/main/docs/input-coding.md';

const PROFILE_OPTIONS = [
  { id: DEFAULT_PROFILE_ID, label: 'Contract default (by format)' },
  ...[...BUILTIN_PROFILES.values()].map((p) => ({ id: p.id, label: p.name })),
];

/** BUILTIN_CROPS order, which puts soybean (the default) first (contract 1.5.0). */
const CROP_OPTIONS = [...BUILTIN_CROPS.values()].map((c) => ({ id: c.id, label: c.name }));

export interface AnalysisParams {
  rpp: RppParams;
  segments: SegmentParams;
  qc: QcThresholds;
}

export type LoadedState = Extract<WorkerResult, { type: 'loaded' }>;
export type LoadPayload = Extract<WorkerRequest, { type: 'load' }>['payload'];
export type BrapiLoadPayload = Extract<WorkerRequest, { type: 'loadBrapi' }>['payload'];
export type LoadRequest =
  | { type: 'load'; payload: LoadPayload }
  | { type: 'loadBrapi'; payload: BrapiLoadPayload }
  | { type: 'loadDemo'; payload: DemoLoadPayload };

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
    <label className="field">
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
  onFetchCallSets,
  onCancelBrapi,
  brapiLoading,
}: {
  params: AnalysisParams;
  onParamsChange: (next: AnalysisParams) => void;
  busy: boolean;
  onLoad: (request: LoadRequest) => void;
  loaded: LoadedState | null;
  onFetchCallSets: (
    source: BrapiSource,
  ) => Promise<{ callSets: BrapiCallSet[]; warnings: string[] }>;
  onCancelBrapi: () => void;
  /** True from a loadBrapi dispatch until its 'loaded' or error; shows the Cancel button. */
  brapiLoading: boolean;
}) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const [genotypeFile, setGenotypeFile] = useState<File | null>(null);
  const [samplesFile, setSamplesFile] = useState<File | null>(null);
  const [markersFile, setMarkersFile] = useState<File | null>(null);
  const [source, setSource] = useState<'files' | 'brapi'>('files');
  const [baseUrl, setBaseUrl] = useState('');
  const [variantSetDbId, setVariantSetDbId] = useState('');
  const [token, setToken] = useState('');
  const [callSetsError, setCallSetsError] = useState<string | null>(null);
  const [callSetsWarnings, setCallSetsWarnings] = useState<string[]>([]);
  const [copyStatus, setCopyStatus] = useState('');
  const [profileId, setProfileId] = useState<string>(DEFAULT_PROFILE_ID);
  const [cropId, setCropId] = useState<string>(loaded?.crop ?? DEFAULT_CROP_ID);
  const [customProfile, setCustomProfile] = useState<TokenProfile | null>(null);
  const [customProfileError, setCustomProfileError] = useState<string | null>(null);

  async function handleCustomProfile(file: File | null) {
    setCustomProfile(null);
    setCustomProfileError(null);
    if (file === null) return;
    try {
      setCustomProfile(validateProfile(JSON.parse(await file.text()) as unknown));
    } catch (e) {
      setCustomProfileError(e instanceof Error ? e.message : String(e));
    }
  }

  /** The profile a files load sends: the custom object, else the selected id. */
  const fileProfile: string | TokenProfile = customProfile ?? profileId;

  function handleLoadDemo() {
    onLoad({
      type: 'loadDemo',
      payload: {
        ...demoLoadPayload('synthetic', import.meta.env.BASE_URL, location.href),
        crop: cropId,
      },
    });
  }

  async function handleCopyDemoLink() {
    const link = demoShareLink(location.href, 'synthetic', cropId);
    try {
      await navigator.clipboard.writeText(link);
      setCopyStatus('Link copied.');
    } catch {
      setCopyStatus(`Copy failed; the link is ${link}`);
    }
  }

  function brapiSource(): BrapiSource {
    return { baseUrl, variantSetDbId, ...(token.trim() === '' ? {} : { token: token.trim() }) };
  }

  const canFetchCallSets =
    source === 'brapi' && baseUrl.trim() !== '' && variantSetDbId.trim() !== '' && !busy;

  const canLoad =
    samplesFile !== null &&
    !busy &&
    customProfileError === null &&
    (source === 'files'
      ? genotypeFile !== null
      : baseUrl.trim() !== '' && variantSetDbId.trim() !== '');

  async function handleFetchCallSets() {
    setCallSetsError(null);
    try {
      const r = await onFetchCallSets(brapiSource());
      downloadText('brapi-callsets.csv', callSetsCsv(r.callSets), 'text/csv');
      setCallSetsWarnings(r.warnings);
    } catch (e) {
      setCallSetsError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleLoad() {
    if (samplesFile === null) return;
    const [samples, markers] = await Promise.all([
      samplesFile.arrayBuffer(),
      markersFile === null ? Promise.resolve(undefined) : markersFile.arrayBuffer(),
    ]);
    if (source === 'brapi') {
      onLoad({
        type: 'loadBrapi',
        payload: {
          source: brapiSource(),
          samples,
          ...(markers === undefined ? {} : { markers }),
          profile: DEFAULT_PROFILE_ID,
          crop: cropId,
        },
      });
      return;
    }
    if (genotypeFile === null) return;
    const genotypes: Blob = genotypeFile;
    onLoad({
      type: 'load',
      payload: {
        genotypeFileName: genotypeFile.name,
        genotypes,
        samples,
        ...(markers === undefined ? {} : { markers }),
        profile: fileProfile,
        crop: cropId,
      },
    });
  }

  return (
    <section>
      <h2 ref={headingRef} tabIndex={-1}>
        Upload and validate
      </h2>
      <div className="upload-hero">
        <p>
          Files are processed in this browser tab and never uploaded anywhere. Accepted, missing and
          rejected genotype codes per format:{' '}
          <a className="input-coding-link" href={INPUT_CODING_URL} target="_blank" rel="noreferrer">
            input coding reference<span className="visually-hidden"> (opens in a new tab)</span>
          </a>
          .
        </p>
        <div className="demo-actions">
          <button type="button" className="button-primary" disabled={busy} onClick={handleLoadDemo}>
            Try the demo dataset
          </button>
          <button type="button" onClick={() => void handleCopyDemoLink()}>
            Copy link to this demo
          </button>
          <span role="status" className="demo-note">
            {copyStatus}
          </span>
        </div>
        <p className="demo-note">
          The demo data are synthetic: generated by this project's test suite, not from any breeding
          program.
        </p>
      </div>

      <RadioGroup
        className="source-group"
        orientation="horizontal"
        value={source}
        isDisabled={busy}
        onChange={(value) => setSource(value === 'brapi' ? 'brapi' : 'files')}
      >
        <Label>Source</Label>
        <LineRadio value="files">Files</LineRadio>
        <LineRadio value="brapi">BrAPI server</LineRadio>
      </RadioGroup>

      {source === 'files' && (
        <div className="field">
          <label>
            Genotype file (VCF, HapMap, or wide CSV){' '}
            <input
              type="file"
              disabled={busy}
              onChange={(e) => setGenotypeFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      )}
      {source === 'brapi' && (
        <>
          <TextField className="field" isDisabled={busy} value={baseUrl} onChange={setBaseUrl}>
            <Label>Base URL</Label>
            <Input type="url" autoComplete="url" placeholder="https://host/brapi/v2" />
          </TextField>
          <TextField
            className="field"
            isDisabled={busy}
            value={variantSetDbId}
            onChange={setVariantSetDbId}
          >
            <Label>Variant set id</Label>
            <Input type="text" autoComplete="off" />
          </TextField>
          <TextField className="field" isDisabled={busy} value={token} onChange={setToken}>
            <Label>Access token (optional)</Label>
            <Input type="password" autoComplete="off" />
          </TextField>
        </>
      )}
      <div className="field">
        <Select
          selectedKey={source === 'brapi' ? DEFAULT_PROFILE_ID : profileId}
          isDisabled={busy || source === 'brapi' || customProfile !== null}
          onSelectionChange={(key) => setProfileId(String(key))}
        >
          <Label>Token profile</Label>
          <Button className="line-select-button">
            <SelectValue />
          </Button>
          <Popover>
            <ListBox items={PROFILE_OPTIONS}>{(o) => <ListBoxItem>{o.label}</ListBoxItem>}</ListBox>
          </Popover>
        </Select>
        {source === 'brapi' && (
          <span>BrAPI sources carry allele indices; profiles apply to files.</span>
        )}
      </div>
      <div className="field">
        <Select
          selectedKey={cropId}
          isDisabled={busy}
          onSelectionChange={(key) => setCropId(String(key))}
        >
          <Label>Crop</Label>
          <Button className="line-select-button">
            <SelectValue />
          </Button>
          <Popover>
            <ListBox items={CROP_OPTIONS}>{(o) => <ListBoxItem>{o.label}</ListBoxItem>}</ListBox>
          </Popover>
        </Select>
        <span>
          Chooses the chromosome naming scheme; positions are not converted between assemblies.
        </span>
      </div>
      <div className="field">
        <label>
          Custom token profile (JSON, optional){' '}
          <input
            type="file"
            accept=".json,application/json"
            disabled={busy || source === 'brapi'}
            onChange={(e) => void handleCustomProfile(e.target.files?.[0] ?? null)}
          />
        </label>
        {customProfileError !== null && <span role="alert"> {customProfileError}</span>}
      </div>
      <div className="field">
        <label>
          samples.csv{' '}
          <input
            type="file"
            accept=".csv,.tsv,.txt"
            disabled={busy}
            onChange={(e) => setSamplesFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>
      <div className="field">
        <label>
          markers.csv (optional){' '}
          <input
            type="file"
            accept=".csv,.tsv,.txt"
            disabled={busy}
            onChange={(e) => setMarkersFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      {source === 'brapi' && (
        <div className="field">
          <button
            type="button"
            disabled={!canFetchCallSets}
            onClick={() => void handleFetchCallSets()}
          >
            Download call-set table
          </button>{' '}
          <span>
            Lists the variant set's call sets so samples.csv can be written from their ids.
          </span>
          {callSetsError !== null && <span role="alert"> {callSetsError}</span>}
          {callSetsWarnings.length > 0 && (
            <ul>
              {callSetsWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

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
          value={params.segments.maxSegmentGapBp}
          disabled={busy}
          onChange={(v) =>
            onParamsChange({ ...params, segments: { ...params.segments, maxSegmentGapBp: v } })
          }
        />
        <NumberField
          label="Maximum marker gap (cM)"
          value={params.segments.maxSegmentGapCm}
          disabled={busy}
          onChange={(v) =>
            onParamsChange({ ...params, segments: { ...params.segments, maxSegmentGapCm: v } })
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
      {source === 'brapi' && brapiLoading && (
        <button
          type="button"
          onClick={() => {
            onCancelBrapi();
            headingRef.current?.focus();
          }}
        >
          Cancel
        </button>
      )}

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
