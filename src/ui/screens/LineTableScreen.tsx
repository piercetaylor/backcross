/**
 * Screen 3: line table.
 *
 * Responsibility: one row per candidate (order of `rpp`) with RPP (count,
 * bp, cM), donor segment count, largest segment, target-locus status per
 * region, and QC flags; sortable by any column; multi-select feeds the
 * genotype view and export. A textarea lets the user (re)type target
 * region specs, applied through `onApplyTargets`. Every displayed number
 * comes from `rpp`, `segmentsByCandidate`, `targets` and `qc`; sorting is
 * done on those already-computed values in the main thread, not a
 * re-derivation of them. Target columns are keyed by the region's position
 * in `targets.regions`, not by name, so a re-typed or duplicate spec text
 * can never collide with another column's key.
 *
 * Props: loaded, rpp, segmentsByCandidate, targets, targetSpecs, qc,
 * selected, onSelectionChange, onApplyTargets.
 */
import { useMemo, useState } from 'react';

import type { LoadedState } from './UploadScreen.tsx';
import type {
  DonorSegment,
  LineRpp,
  QcReport,
  TargetCheck,
  TargetRegion,
} from '../../core/types.ts';

type SortDir = 1 | -1;
interface SortState {
  key: string;
  dir: SortDir;
}

interface Row {
  sampleId: string;
  lineName: string;
  generation: string;
  rppCount: number;
  rppBp: number;
  rppCm: number;
  nSegments: number;
  largestSegmentMb: number;
  /** Status per target region, indexed by position in `targets.regions` (not by name). */
  targetStatus: string[];
  flags: string;
}

const NUMERIC_ACCESSORS: Record<string, (r: Row) => number> = {
  rppCount: (r) => r.rppCount,
  rppBp: (r) => r.rppBp,
  rppCm: (r) => r.rppCm,
  nSegments: (r) => r.nSegments,
  largestSegmentMb: (r) => r.largestSegmentMb,
};
const STRING_ACCESSORS: Record<string, (r: Row) => string> = {
  sampleId: (r) => r.sampleId,
  lineName: (r) => r.lineName,
  generation: (r) => r.generation,
  flags: (r) => r.flags,
};

function fmt4(v: number): string {
  return Number.isNaN(v) ? 'NA' : v.toFixed(4);
}
function fmt2(v: number): string {
  return Number.isNaN(v) ? 'NA' : v.toFixed(2);
}

function cmpNumeric(a: number, b: number, dir: SortDir): number {
  const aNaN = Number.isNaN(a);
  const bNaN = Number.isNaN(b);
  if (aNaN && bNaN) return 0;
  if (aNaN) return 1;
  if (bNaN) return -1;
  return dir * (a - b);
}
function cmpString(a: string, b: string, dir: SortDir): number {
  return dir * a.localeCompare(b);
}

export function LineTableScreen({
  loaded,
  rpp,
  segmentsByCandidate,
  targets,
  targetSpecs,
  qc,
  selected,
  onSelectionChange,
  onApplyTargets,
}: {
  loaded: LoadedState | null;
  rpp: LineRpp[] | null;
  segmentsByCandidate: DonorSegment[][] | null;
  targets: { regions: TargetRegion[]; checks: TargetCheck[] } | null;
  targetSpecs: string[];
  qc: QcReport | null;
  selected: Set<string>;
  onSelectionChange: (next: Set<string>) => void;
  onApplyTargets: (specs: string[]) => void;
}) {
  const [sort, setSort] = useState<SortState | null>(null);
  const [specsText, setSpecsText] = useState(targetSpecs.join('\n'));

  const generationById = useMemo(
    () => new Map((loaded?.samples ?? []).map((s) => [s.sampleId, s.generation])),
    [loaded],
  );
  const lineNameById = useMemo(
    () => new Map((loaded?.samples ?? []).map((s) => [s.sampleId, s.lineName])),
    [loaded],
  );
  const flagsById = useMemo(
    () => new Map((qc?.lines ?? []).map((l) => [l.sampleId, l.flags.join(' ')])),
    [qc],
  );
  // checkTargets emits candidate-major rows with regions in input order, so
  // each sample's checks, collected in arrival order, line up with `regions`
  // by index; names are not unique and are never used as keys.
  const checksBySample = useMemo(() => {
    const m = new Map<string, TargetCheck[]>();
    for (const c of targets?.checks ?? []) {
      let inner = m.get(c.sampleId);
      if (inner === undefined) {
        inner = [];
        m.set(c.sampleId, inner);
      }
      inner.push(c);
    }
    return m;
  }, [targets]);
  // Target regions in worker order; columns are keyed by position in this
  // array (not by name) so a duplicate or renamed spec never collides with
  // another column.
  const regions = useMemo(() => targets?.regions ?? [], [targets]);

  const rows: Row[] = useMemo(() => {
    if (rpp === null) return [];
    return rpp.map((r, i) => {
      const segments = segmentsByCandidate?.[i] ?? [];
      const largestSegmentMb =
        segments.length === 0
          ? NaN
          : Math.max(...segments.map((s) => s.endBp - s.startBp)) / 1_000_000;
      const targetStatus = regions.map(
        (_region, ri) => checksBySample.get(r.sampleId)?.[ri]?.status ?? '',
      );
      return {
        sampleId: r.sampleId,
        lineName: lineNameById.get(r.sampleId) ?? r.sampleId,
        generation: generationById.get(r.sampleId) ?? '',
        rppCount: r.overall.rppCount,
        rppBp: r.overall.rppBp,
        rppCm: r.overall.rppCm,
        nSegments: segments.length,
        largestSegmentMb,
        targetStatus,
        flags: flagsById.get(r.sampleId) ?? '',
      };
    });
  }, [rpp, segmentsByCandidate, regions, checksBySample, lineNameById, generationById, flagsById]);

  const sortedRows = useMemo(() => {
    if (sort === null) return rows;
    const { key, dir } = sort;
    const copy = [...rows];
    const numAcc = NUMERIC_ACCESSORS[key];
    const strAcc = STRING_ACCESSORS[key];
    copy.sort((a, b) => {
      if (numAcc !== undefined) return cmpNumeric(numAcc(a), numAcc(b), dir);
      if (strAcc !== undefined) return cmpString(strAcc(a), strAcc(b), dir);
      if (key.startsWith('target:')) {
        const idx = Number(key.slice('target:'.length));
        return cmpString(a.targetStatus[idx] ?? '', b.targetStatus[idx] ?? '', dir);
      }
      return 0;
    });
    return copy;
  }, [rows, sort]);

  function toggleSort(key: string) {
    setSort((prev) => {
      if (prev === null || prev.key !== key) return { key, dir: 1 };
      return { key, dir: prev.dir === 1 ? -1 : 1 };
    });
  }

  function ariaSort(key: string): 'ascending' | 'descending' | 'none' {
    if (sort === null || sort.key !== key) return 'none';
    return sort.dir === 1 ? 'ascending' : 'descending';
  }

  function toggleRow(sampleId: string) {
    const next = new Set(selected);
    if (next.has(sampleId)) next.delete(sampleId);
    else next.add(sampleId);
    onSelectionChange(next);
  }

  if (loaded === null) {
    return (
      <section>
        <h2>Lines</h2>
        <p>Load a dataset first.</p>
      </section>
    );
  }

  // `key` is also set as the React key, so this is safe to call directly
  // inside a .map() as well as inline.
  function sortableHeader(key: string, label: string) {
    return (
      <th key={key} scope="col" aria-sort={ariaSort(key)}>
        <button type="button" onClick={() => toggleSort(key)}>
          {label}
        </button>
      </th>
    );
  }

  return (
    <section>
      <h2>Lines</h2>
      <div>
        <button
          type="button"
          onClick={() => onSelectionChange(new Set(rows.map((r) => r.sampleId)))}
        >
          Select all
        </button>{' '}
        <button type="button" onClick={() => onSelectionChange(new Set())}>
          Select none
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th scope="col">select</th>
            {sortableHeader('sampleId', 'sample_id')}
            {sortableHeader('lineName', 'line_name')}
            {sortableHeader('generation', 'generation')}
            {sortableHeader('rppCount', 'rpp_count')}
            {sortableHeader('rppBp', 'rpp_bp')}
            {sortableHeader('rppCm', 'rpp_cm')}
            {sortableHeader('nSegments', 'n segments')}
            {sortableHeader('largestSegmentMb', 'largest segment (Mb)')}
            {regions.map((region, i) => sortableHeader(`target:${i}`, region.name))}
            <th scope="col">QC flags</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr key={row.sampleId}>
              <td>
                <input
                  type="checkbox"
                  aria-label={`Select ${row.sampleId}`}
                  checked={selected.has(row.sampleId)}
                  onChange={() => toggleRow(row.sampleId)}
                />
              </td>
              <td>{row.sampleId}</td>
              <td>{row.lineName}</td>
              <td>{row.generation}</td>
              <td>{fmt4(row.rppCount)}</td>
              <td>{fmt4(row.rppBp)}</td>
              <td>{fmt4(row.rppCm)}</td>
              <td>{row.nSegments}</td>
              <td>{fmt2(row.largestSegmentMb)}</td>
              {regions.map((_, i) => (
                <td key={`target:${i}`}>{row.targetStatus[i]}</td>
              ))}
              <td>{row.flags}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Target regions</h3>
      <label>
        One per line, e.g. <code>rhg1=Gm18:1.6Mb-1.7Mb</code> or a marker_id
        <textarea
          rows={4}
          cols={50}
          value={specsText}
          onChange={(e) => setSpecsText(e.target.value)}
        />
      </label>
      <div>
        <button
          type="button"
          onClick={() =>
            onApplyTargets(
              specsText
                .split('\n')
                .map((s) => s.trim())
                .filter((s) => s.length > 0),
            )
          }
        >
          Apply
        </button>
      </div>
    </section>
  );
}
