/**
 * The bar both line screens act through.
 *
 * Responsibility: show how many lines exist, how many the filter leaves
 * visible and how many are selected, and offer the controls that change
 * those numbers -- the text filter, the two filter toggles, select
 * all-visible / none, and (on the genotype screen, which has no column
 * headers) a sort column and direction. It holds no state of its own: every
 * control reports to the caller, and App owns the one copy of the sort and
 * filter that both screens read, so sorting from either screen reorders the
 * other.
 *
 * Native, unstyled controls on purpose. Phase 4 rebuilds this on React
 * Aria; until then it carries no colour and no dimension, which is what the
 * literal-value lint gate over src/ui/ requires.
 *
 * Props: counts, sort, onSortChange, filter, onFilterChange, regions,
 * showSortControl, onSelectAllVisible, onSelectNone.
 */
import type { TargetRegion } from '../../core/types.ts';
import type { LineFilter, LineSort, LineSortColumn, SortDirection } from './line-order.ts';

/** Column id to the label the user sees; target columns are appended per region at render time. */
const SORT_COLUMN_LABELS: { column: LineSortColumn; label: string }[] = [
  { column: 'sampleId', label: 'sample_id' },
  { column: 'lineName', label: 'line_name' },
  { column: 'generation', label: 'generation' },
  { column: 'familyId', label: 'family_id' },
  { column: 'rppCount', label: 'rpp_count' },
  { column: 'rppBp', label: 'rpp_bp' },
  { column: 'rppCm', label: 'rpp_cm' },
  { column: 'nSegments', label: 'n segments' },
  { column: 'largestSegmentMb', label: 'largest segment (Mb)' },
  { column: 'flags', label: 'QC flags' },
];

/** The select's value for "no sort", distinct from every column id. */
const NO_SORT = '';

export function LineActionBar({
  counts,
  sort,
  onSortChange,
  filter,
  onFilterChange,
  regions,
  showSortControl,
  onSelectAllVisible,
  onSelectNone,
}: {
  counts: { total: number; visible: number; selected: number };
  sort: LineSort | null;
  onSortChange: (s: LineSort | null) => void;
  filter: LineFilter;
  onFilterChange: (f: LineFilter) => void;
  regions: TargetRegion[];
  /** True on the genotype screen, where there are no column headers to sort from. */
  showSortControl: boolean;
  onSelectAllVisible: () => void;
  onSelectNone: () => void;
}) {
  const direction: SortDirection = sort?.direction ?? 'ascending';

  return (
    <div>
      <p aria-live="polite">
        Lines: {counts.total}, visible: {counts.visible}, selected: {counts.selected}
      </p>

      <div>
        <label>
          Filter{' '}
          <input
            type="search"
            value={filter.text}
            placeholder="sample, line, generation, family or flag"
            onChange={(e) => onFilterChange({ ...filter, text: e.target.value })}
          />
        </label>{' '}
        <label>
          <input
            type="checkbox"
            checked={filter.flaggedOnly}
            onChange={(e) => onFilterChange({ ...filter, flaggedOnly: e.target.checked })}
          />{' '}
          Flagged only
        </label>{' '}
        <label>
          <input
            type="checkbox"
            checked={filter.selectedOnly}
            onChange={(e) => onFilterChange({ ...filter, selectedOnly: e.target.checked })}
          />{' '}
          Selected only
        </label>
      </div>

      {showSortControl && (
        <div>
          <label>
            Sort by{' '}
            <select
              value={sort?.column ?? NO_SORT}
              onChange={(e) => {
                const value = e.target.value;
                if (value === NO_SORT) onSortChange(null);
                else onSortChange({ column: value as LineSortColumn, direction });
              }}
            >
              <option value={NO_SORT}>Table order</option>
              {SORT_COLUMN_LABELS.map((c) => (
                <option key={c.column} value={c.column}>
                  {c.label}
                </option>
              ))}
              {regions.map((region, i) => (
                <option key={`target:${i}`} value={`target:${i}`}>
                  {region.name}
                </option>
              ))}
            </select>
          </label>{' '}
          <button
            type="button"
            disabled={sort === null}
            onClick={() => {
              if (sort === null) return;
              onSortChange({
                column: sort.column,
                direction: sort.direction === 'ascending' ? 'descending' : 'ascending',
              });
            }}
          >
            {direction === 'ascending' ? 'Ascending' : 'Descending'}
          </button>
        </div>
      )}

      <div>
        <button type="button" onClick={onSelectAllVisible}>
          Select all
        </button>{' '}
        <button type="button" onClick={onSelectNone}>
          Select none
        </button>
      </div>
    </div>
  );
}
