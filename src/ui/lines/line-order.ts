/**
 * The display order of the line rows: filter, then sort.
 *
 * Responsibility: the single answer to "which lines are showing, and in
 * what order". The Lines table and the graphical genotype view both read
 * it, so sorting or filtering from either screen moves both; the canvas
 * draws the visible rows in display order and the HTML report inherits
 * that (docs/adr/0009, amended 2026-09-11). The M2 rule "the selection, or
 * every candidate when the selection is empty" is now expressed as the
 * `selectedOnly` filter.
 *
 * Sorting is done on the already-computed values in `LineRow`, on the main
 * thread: a reorder issues no worker request (docs/adr/0001, and see
 * ui/lines/classes-order.ts). Numeric columns place NaN last in both
 * directions, because "no value" is not a small value. String columns
 * compare with localeCompare({ numeric: true }) so NIL_2 sorts before
 * NIL_10 rather than after it. The sort is stable, so ties keep the input
 * order, which is the worker's candidate order.
 *
 * Interface: EMPTY_LINE_FILTER, orderLineRows(rows, sort, filter,
 * selected), lineCounts(rows, visible, selected). Pure; the sort
 * vocabulary ('ascending'/'descending') is React Aria's SortDescriptor
 * vocabulary so the phase 4 table maps one-to-one.
 */
import type { LineRow } from './line-rows.ts';

export type LineSortColumn =
  | 'sampleId'
  | 'lineName'
  | 'generation'
  | 'familyId'
  | 'rppCount'
  | 'rppBp'
  | 'rppCm'
  | 'nSegments'
  | 'largestSegmentMb'
  | 'flags'
  | `target:${number}`;

/** React Aria's SortDescriptor vocabulary, so phase 4 maps one-to-one. */
export type SortDirection = 'ascending' | 'descending';

export interface LineSort {
  column: LineSortColumn;
  direction: SortDirection;
}

export interface LineFilter {
  /** Case-insensitive substring over sampleId, lineName, generation, familyId and each flag. Empty matches everything. */
  text: string;
  flaggedOnly: boolean;
  /** Restrict to the selection; preserves the M2 behaviour of the genotype view drawing only selected lines. */
  selectedOnly: boolean;
}

export const EMPTY_LINE_FILTER: LineFilter = {
  text: '',
  flaggedOnly: false,
  selectedOnly: false,
};

const NUMERIC_ACCESSORS: Record<string, (r: LineRow) => number> = {
  rppCount: (r) => r.rppCount,
  rppBp: (r) => r.rppBp,
  rppCm: (r) => r.rppCm,
  nSegments: (r) => r.nSegments,
  largestSegmentMb: (r) => r.largestSegmentMb,
};

const STRING_ACCESSORS: Record<string, (r: LineRow) => string> = {
  sampleId: (r) => r.sampleId,
  lineName: (r) => r.lineName,
  generation: (r) => r.generation,
  familyId: (r) => r.familyId,
  flags: (r) => r.flags.join(' '),
};

const TARGET_PREFIX = 'target:';

/** NaN sorts last whichever way the column is pointing; otherwise the direction applies. */
function cmpNumeric(a: number, b: number, sign: number): number {
  const aNaN = Number.isNaN(a);
  const bNaN = Number.isNaN(b);
  if (aNaN && bNaN) return 0;
  if (aNaN) return 1;
  if (bNaN) return -1;
  return sign * (a - b);
}

function cmpString(a: string, b: string, sign: number): number {
  return sign * a.localeCompare(b, undefined, { numeric: true });
}

function matchesText(row: LineRow, needle: string): boolean {
  const fields = [row.sampleId, row.lineName, row.generation, row.familyId, ...row.flags];
  return fields.some((f) => f.toLowerCase().includes(needle));
}

/**
 * Filter, then sort. `sort === null` returns the filtered rows in `rows`
 * order.
 */
export function orderLineRows(
  rows: readonly LineRow[],
  sort: LineSort | null,
  filter: LineFilter,
  selected: ReadonlySet<string>,
): LineRow[] {
  const needle = filter.text.trim().toLowerCase();
  const visible = rows.filter((row) => {
    if (filter.selectedOnly && !selected.has(row.sampleId)) return false;
    if (filter.flaggedOnly && row.flags.length === 0) return false;
    if (needle !== '' && !matchesText(row, needle)) return false;
    return true;
  });
  if (sort === null) return visible;

  const sign = sort.direction === 'ascending' ? 1 : -1;
  const column: string = sort.column;
  const numAcc = NUMERIC_ACCESSORS[column];
  const strAcc = STRING_ACCESSORS[column];
  const targetIndex = column.startsWith(TARGET_PREFIX)
    ? Number(column.slice(TARGET_PREFIX.length))
    : null;
  // Array.prototype.sort is stable in every engine this runs on, so ties
  // keep `rows` order without an explicit index tiebreak.
  return visible.sort((a, b) => {
    if (numAcc !== undefined) return cmpNumeric(numAcc(a), numAcc(b), sign);
    if (strAcc !== undefined) return cmpString(strAcc(a), strAcc(b), sign);
    if (targetIndex !== null) {
      return cmpString(a.targetStatus[targetIndex] ?? '', b.targetStatus[targetIndex] ?? '', sign);
    }
    return 0;
  });
}

/** Hidden selected rows still count as selected; a selected id that is not a row at all does not. */
export function lineCounts(
  rows: readonly LineRow[],
  visible: readonly LineRow[],
  selected: ReadonlySet<string>,
): { total: number; visible: number; selected: number } {
  return {
    total: rows.length,
    visible: visible.length,
    selected: rows.reduce((n, row) => (selected.has(row.sampleId) ? n + 1 : n), 0),
  };
}
