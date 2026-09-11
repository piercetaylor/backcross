/**
 * Screen 3: line table.
 *
 * Responsibility: render the shared line model -- one row per candidate
 * with RPP (count, bp, cM), donor segment count, largest segment,
 * target-locus status per region, and QC flags -- as a sortable,
 * multi-selectable grid, and let the user (re)type target region specs,
 * applied through `onApplyTargets`. It builds nothing: the rows, their
 * display order, the sort and the filter all live in App (ui/lines/), so
 * the graphical genotype view shows the same lines in the same order.
 *
 * Built on react-aria-components' Table (M2.5 phase 4), which is a
 * role="grid" widget with the W3C APG keyboard pattern -- one tab stop,
 * arrow keys, Home/End -- rather than a static <table>. `LineSort` was
 * defined in phase 2 with React Aria's SortDescriptor vocabulary, so the
 * sort maps one-to-one and no translation layer exists. Every colour and
 * dimension is a token in ui/lines/lines.css; this file is inside the
 * literal-value lint gate.
 *
 * The table only ever speaks for visible rows. `selectedKeys` is narrowed
 * to the visible selection before it reaches React Aria, and
 * `onSelectionChange` ('all' means every visible row) is merged back by
 * dropping the visible ids from the current selection and adding the ones
 * the table reports, so a selected line hidden by the filter is never
 * disturbed. The action bar's Select all / Select none stay App's
 * `onSelectAllVisible` / `onSelectNone`, which is the same rule stated the
 * same way for the genotype screen.
 *
 * Target columns are keyed by the region's position in `regions`, not by
 * name, so a re-typed or duplicate spec text can never collide with
 * another column's key.
 *
 * `rows` is gone from the props: the phase 2 screen used it only to tell
 * "no lines at all" from "the filter hides them all", and React Aria's
 * renderEmptyState now carries that message inside the grid.
 *
 * Props: loaded, visibleRows, regions, counts, sort, onSortChange,
 * filter, onFilterChange, selected, onSelectionChange, targetSpecs,
 * onApplyTargets, onSelectAllVisible, onSelectNone, density,
 * onDensityChange.
 */
import { useState } from 'react';
import type { Selection, SortDescriptor } from 'react-aria-components';
import {
  Button,
  Cell,
  Collection,
  Column,
  Label,
  Row,
  Table,
  TableBody,
  TableHeader,
  TextArea,
  TextField,
} from 'react-aria-components';

import type { LoadedState } from './UploadScreen.tsx';
import type { TargetRegion } from '../../core/types.ts';
import type { Density } from '../lines/LineActionBar.tsx';
import { LineActionBar, LineCheckbox } from '../lines/LineActionBar.tsx';
import type { LineFilter, LineSort, LineSortColumn } from '../lines/line-order.ts';
import type { LineRow } from '../lines/line-rows.ts';
import '../lines/lines.css';

function fmt4(v: number): string {
  return Number.isNaN(v) ? 'NA' : v.toFixed(4);
}
function fmt2(v: number): string {
  return Number.isNaN(v) ? 'NA' : v.toFixed(2);
}

/** How a cell is typeset: `num` right-aligns, `mono` is an identifier. */
type CellKind = 'text' | 'num' | 'mono' | 'flags';

interface LineColumn {
  id: LineSortColumn;
  label: string;
  kind: CellKind;
}

/** Header labels keep the docs/data-formats.md names where the column mirrors an exported column. */
const FIXED_COLUMNS: LineColumn[] = [
  { id: 'sampleId', label: 'sample_id', kind: 'mono' },
  { id: 'lineName', label: 'line_name', kind: 'text' },
  { id: 'generation', label: 'generation', kind: 'text' },
  { id: 'familyId', label: 'family_id', kind: 'text' },
  { id: 'rppCount', label: 'rpp_count', kind: 'num' },
  { id: 'rppBp', label: 'rpp_bp', kind: 'num' },
  { id: 'rppCm', label: 'rpp_cm', kind: 'num' },
  { id: 'nSegments', label: 'n segments', kind: 'num' },
  { id: 'largestSegmentMb', label: 'largest segment (Mb)', kind: 'num' },
];

const FLAGS_COLUMN: LineColumn = { id: 'flags', label: 'QC flags', kind: 'flags' };

function cellText(row: LineRow, column: LineColumn): string {
  switch (column.id) {
    case 'sampleId':
      return row.sampleId;
    case 'lineName':
      return row.lineName;
    case 'generation':
      return row.generation;
    case 'familyId':
      return row.familyId;
    case 'rppCount':
      return fmt4(row.rppCount);
    case 'rppBp':
      return fmt4(row.rppBp);
    case 'rppCm':
      return fmt4(row.rppCm);
    case 'nSegments':
      return String(row.nSegments);
    case 'largestSegmentMb':
      return fmt2(row.largestSegmentMb);
    case 'flags':
      return row.flags.join(' ');
    default:
      // `target:${i}`; the index is the region's position in `regions`.
      return row.targetStatus[Number(column.id.slice('target:'.length))] ?? '';
  }
}

export function LineTableScreen({
  loaded,
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
  density,
  onDensityChange,
}: {
  loaded: LoadedState | null;
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
  density: Density;
  onDensityChange: (d: Density) => void;
}) {
  const [specsText, setSpecsText] = useState(targetSpecs.join('\n'));

  const columns: LineColumn[] = [
    ...FIXED_COLUMNS,
    ...regions.map((region, i): LineColumn => ({
      id: `target:${i}`,
      label: region.name,
      kind: 'text',
    })),
    FLAGS_COLUMN,
  ];

  const visibleIds = new Set(visibleRows.map((r) => r.sampleId));
  // Only the visible selection is React Aria's to know about; see the
  // module header.
  const visibleSelected = new Set([...selected].filter((id) => visibleIds.has(id)));

  function handleSelectionChange(keys: Selection) {
    const next = new Set([...selected].filter((id) => !visibleIds.has(id)));
    if (keys === 'all') for (const id of visibleIds) next.add(id);
    else for (const key of keys) next.add(String(key));
    onSelectionChange(next);
  }

  function handleSortChange(descriptor: SortDescriptor) {
    onSortChange({
      column: String(descriptor.column) as LineSortColumn,
      direction: descriptor.direction,
    });
  }

  if (loaded === null) {
    return (
      <section>
        <h2>Lines</h2>
        <p>Load a dataset first.</p>
      </section>
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
        density={density}
        onDensityChange={onDensityChange}
      />
      <div className="lines-table-viewport">
        <Table
          className="lines-table"
          aria-label="Lines"
          selectionMode="multiple"
          selectionBehavior="toggle"
          selectedKeys={visibleSelected}
          onSelectionChange={handleSelectionChange}
          onSortChange={handleSortChange}
          {...(sort === null ? {} : { sortDescriptor: sort })}
        >
          <TableHeader>
            <Column>
              <LineCheckbox slot="selection" />
            </Column>
            <Collection items={columns}>
              {(column) => (
                <Column
                  id={column.id}
                  isRowHeader={column.id === 'sampleId'}
                  allowsSorting
                  className={column.kind === 'num' ? 'num' : 'text'}
                >
                  {column.label}
                </Column>
              )}
            </Collection>
          </TableHeader>
          <TableBody items={visibleRows} renderEmptyState={() => 'No lines match the filter.'}>
            {(row) => (
              <Row id={row.sampleId}>
                <Cell>
                  <LineCheckbox slot="selection" />
                </Cell>
                <Collection items={columns}>
                  {(column) => <Cell className={column.kind}>{cellText(row, column)}</Cell>}
                </Collection>
              </Row>
            )}
          </TableBody>
        </Table>
      </div>

      <h3>Target regions</h3>
      <div className="line-targets">
        <TextField value={specsText} onChange={setSpecsText}>
          <Label>
            One per line, e.g. <code>rhg1=Gm18:1.6Mb-1.7Mb</code> or a marker_id
          </Label>
          <TextArea rows={4} />
        </TextField>
        <Button
          onPress={() =>
            onApplyTargets(
              specsText
                .split('\n')
                .map((s) => s.trim())
                .filter((s) => s.length > 0),
            )
          }
        >
          Apply
        </Button>
      </div>
    </section>
  );
}
