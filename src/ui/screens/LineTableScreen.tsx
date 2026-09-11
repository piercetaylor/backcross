/**
 * Screen 3: line table.
 *
 * Responsibility: render the shared line model -- one row per candidate
 * with RPP (count, bp, cM), donor segment count, largest segment,
 * target-locus status per region, and QC flags -- as a sortable,
 * multi-selectable table, and let the user (re)type target region specs,
 * applied through `onApplyTargets`. It builds nothing: the rows, their
 * display order, the sort and the filter all live in App (ui/lines/), so
 * the graphical genotype view shows the same lines in the same order.
 * Column header buttons report to `onSortChange`; the toggle rule is a new
 * column ascending, the same column flips.
 *
 * The table only ever speaks for visible rows: "Select all" adds the
 * visible rows to the selection and leaves hidden selected rows alone,
 * "Select none" removes the visible rows and leaves the hidden ones. That
 * rule lives in App and is shared with the genotype screen; phase 4 keeps
 * it.
 *
 * Target columns are keyed by the region's position in `regions`, not by
 * name, so a re-typed or duplicate spec text can never collide with
 * another column's key.
 *
 * Props: loaded, rows, visibleRows, regions, counts, sort, onSortChange,
 * filter, onFilterChange, selected, onSelectionChange, targetSpecs,
 * onApplyTargets, onSelectAllVisible, onSelectNone.
 */
import { useState } from 'react';

import type { LoadedState } from './UploadScreen.tsx';
import type { TargetRegion } from '../../core/types.ts';
import { LineActionBar } from '../lines/LineActionBar.tsx';
import type { LineFilter, LineSort, LineSortColumn } from '../lines/line-order.ts';
import type { LineRow } from '../lines/line-rows.ts';

function fmt4(v: number): string {
  return Number.isNaN(v) ? 'NA' : v.toFixed(4);
}
function fmt2(v: number): string {
  return Number.isNaN(v) ? 'NA' : v.toFixed(2);
}

export function LineTableScreen({
  loaded,
  rows,
  visibleRows,
  regions,
  counts,
  sort,
  onSortChange,
  filter,
  onFilterChange,
  selected,
  onSelectionChange,
  targetSpecs,
  onApplyTargets,
  onSelectAllVisible,
  onSelectNone,
}: {
  loaded: LoadedState | null;
  rows: LineRow[];
  visibleRows: LineRow[];
  regions: TargetRegion[];
  counts: { total: number; visible: number; selected: number };
  sort: LineSort | null;
  onSortChange: (s: LineSort | null) => void;
  filter: LineFilter;
  onFilterChange: (f: LineFilter) => void;
  selected: Set<string>;
  onSelectionChange: (next: Set<string>) => void;
  targetSpecs: string[];
  onApplyTargets: (specs: string[]) => void;
  onSelectAllVisible: () => void;
  onSelectNone: () => void;
}) {
  const [specsText, setSpecsText] = useState(targetSpecs.join('\n'));

  function toggleSort(column: LineSortColumn) {
    if (sort === null || sort.column !== column) {
      onSortChange({ column, direction: 'ascending' });
      return;
    }
    onSortChange({
      column,
      direction: sort.direction === 'ascending' ? 'descending' : 'ascending',
    });
  }

  function ariaSort(column: LineSortColumn): 'ascending' | 'descending' | 'none' {
    return sort === null || sort.column !== column ? 'none' : sort.direction;
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

  // `column` is also set as the React key, so this is safe to call directly
  // inside a .map() as well as inline.
  function sortableHeader(column: LineSortColumn, label: string) {
    return (
      <th key={column} scope="col" aria-sort={ariaSort(column)}>
        <button type="button" onClick={() => toggleSort(column)}>
          {label}
        </button>
      </th>
    );
  }

  return (
    <section>
      <h2>Lines</h2>
      <LineActionBar
        counts={counts}
        sort={sort}
        onSortChange={onSortChange}
        filter={filter}
        onFilterChange={onFilterChange}
        regions={regions}
        showSortControl={false}
        onSelectAllVisible={onSelectAllVisible}
        onSelectNone={onSelectNone}
      />
      <table>
        <thead>
          <tr>
            <th scope="col">select</th>
            {sortableHeader('sampleId', 'sample_id')}
            {sortableHeader('lineName', 'line_name')}
            {sortableHeader('generation', 'generation')}
            {sortableHeader('familyId', 'family_id')}
            {sortableHeader('rppCount', 'rpp_count')}
            {sortableHeader('rppBp', 'rpp_bp')}
            {sortableHeader('rppCm', 'rpp_cm')}
            {sortableHeader('nSegments', 'n segments')}
            {sortableHeader('largestSegmentMb', 'largest segment (Mb)')}
            {regions.map((region, i) => sortableHeader(`target:${i}`, region.name))}
            {sortableHeader('flags', 'QC flags')}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => (
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
              <td>{row.familyId}</td>
              <td>{fmt4(row.rppCount)}</td>
              <td>{fmt4(row.rppBp)}</td>
              <td>{fmt4(row.rppCm)}</td>
              <td>{row.nSegments}</td>
              <td>{fmt2(row.largestSegmentMb)}</td>
              {regions.map((_, i) => (
                <td key={`target:${i}`}>{row.targetStatus[i]}</td>
              ))}
              <td>{row.flags.join(' ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 0 && visibleRows.length === 0 && <p>No line matches the filter.</p>}

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
