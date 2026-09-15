/**
 * The bar both line screens act through.
 *
 * Responsibility: show how many lines exist, how many the filter leaves
 * visible and how many are selected, and offer the controls that change
 * those numbers -- the text filter, the two filter toggles, select
 * all-visible / none, the density control, and (on the genotype screen,
 * which has no column headers) a sort column and direction. It holds no
 * state of its own: every control reports to the caller, and App owns the
 * one copy of the sort, the filter and the density that both screens read,
 * so sorting from either screen reorders the other.
 *
 * Built on react-aria-components (M2.5 phase 4): Button, TextField, Input,
 * Checkbox, Select, ToggleButton, RadioGroup. Every colour and dimension
 * lives in ui/lines/lines.css as a token, which is what the literal-value
 * lint gate over src/ui/ requires. React Aria visually hides the native
 * checkbox and radio inputs, so `LineCheckbox` draws the visible box; the
 * Lines table imports it for its row and header selection checkboxes, and
 * `LineRadio` does the same for a radio (the density control here, the Source
 * switch on the Upload screen).
 *
 * Density is optional here. App passes it on the Lines screen; the
 * graphical genotype screen does not yet, and the control is simply absent
 * there until phase 5 migrates that screen.
 *
 * Props: counts, sort, onSortChange, filter, onFilterChange, regions,
 * showSortControl, onSelectAllVisible, onSelectNone, density?,
 * onDensityChange?.
 */
import type { ReactNode } from 'react';
import {
  Button,
  Checkbox,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Radio,
  RadioGroup,
  Select,
  SelectValue,
  TextField,
  ToggleButton,
} from 'react-aria-components';

import type { TargetRegion } from '../../core/types.ts';
import type { LineFilter, LineSort, LineSortColumn, SortDirection } from './line-order.ts';
import './lines.css';

/** Row height, switched by the `data-density` attribute App puts on the root. */
export type Density = 'compact' | 'default' | 'comfortable';

const DENSITIES: { value: Density; label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'default', label: 'Default' },
  { value: 'comfortable', label: 'Comfortable' },
];

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

/**
 * The select's key for "no sort". A non-empty sentinel, because React Aria
 * treats an empty key as no selection at all; no LineSortColumn can collide
 * with it.
 */
const NO_SORT = '__table_order__';

/**
 * The box React Aria does not draw. The tick and the dash are both in the
 * markup and lines.css shows whichever the control's state calls for, so no
 * state is read in JavaScript here.
 */
function CheckIndicator() {
  return (
    <span className="checkbox-indicator" aria-hidden="true">
      <svg viewBox="0 0 18 18">
        <polyline className="check-tick" points="3 9 7 13 15 5" />
        <line className="check-dash" x1="4" y1="9" x2="14" y2="9" />
      </svg>
    </span>
  );
}

/** A React Aria Checkbox with a visible box; `children` is the label, if any. */
export function LineCheckbox({
  children,
  ...props
}: {
  children?: ReactNode;
  slot?: string;
  'aria-label'?: string;
  isSelected?: boolean;
  onChange?: (isSelected: boolean) => void;
}) {
  return (
    <Checkbox className="line-checkbox" {...props}>
      <CheckIndicator />
      {children}
    </Checkbox>
  );
}

/** A React Aria Radio with a visible indicator; `children` is the label. */
export function LineRadio({ value, children }: { value: string; children?: ReactNode }) {
  return (
    <Radio className="line-radio" value={value}>
      <CheckIndicator />
      {children}
    </Radio>
  );
}

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
  density,
  onDensityChange,
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
  /** Both or neither; the density control is absent when they are omitted. */
  density?: Density;
  onDensityChange?: (d: Density) => void;
}) {
  const direction: SortDirection = sort?.direction ?? 'ascending';
  const sortOptions = [
    { id: NO_SORT, label: 'Table order' },
    ...SORT_COLUMN_LABELS.map((c) => ({ id: String(c.column), label: c.label })),
    ...regions.map((region, i) => ({ id: `target:${i}`, label: region.name })),
  ];

  return (
    <div className="line-action-bar">
      <p className="line-action-bar-readout" aria-live="polite">
        {`Lines: ${counts.total}, visible: ${counts.visible}, selected: ${counts.selected}`}
      </p>

      <div className="line-action-bar-group">
        <Button onPress={onSelectAllVisible}>Select all visible</Button>
        <Button onPress={onSelectNone}>Select none</Button>
      </div>

      <div className="line-action-bar-group">
        <LineCheckbox
          isSelected={filter.selectedOnly}
          onChange={(isSelected) => onFilterChange({ ...filter, selectedOnly: isSelected })}
        >
          Show selected only
        </LineCheckbox>
        <LineCheckbox
          isSelected={filter.flaggedOnly}
          onChange={(isSelected) => onFilterChange({ ...filter, flaggedOnly: isSelected })}
        >
          Flagged only
        </LineCheckbox>
      </div>

      <TextField
        className="line-filter-field"
        value={filter.text}
        onChange={(text) => onFilterChange({ ...filter, text })}
        type="search"
      >
        <Label>Filter</Label>
        <Input placeholder="sample, line, generation, family or flag" />
      </TextField>

      {showSortControl && (
        <div className="line-action-bar-group">
          <Select
            className="line-action-bar-group"
            selectedKey={sort?.column ?? NO_SORT}
            onSelectionChange={(key) => {
              const value = String(key);
              if (value === NO_SORT) onSortChange(null);
              else onSortChange({ column: value as LineSortColumn, direction });
            }}
          >
            <Label>Sort by</Label>
            <Button className="line-select-button">
              <SelectValue />
            </Button>
            <Popover>
              <ListBox items={sortOptions}>{(o) => <ListBoxItem>{o.label}</ListBoxItem>}</ListBox>
            </Popover>
          </Select>
          <ToggleButton
            isDisabled={sort === null}
            isSelected={direction === 'descending'}
            onChange={() => {
              if (sort === null) return;
              onSortChange({
                column: sort.column,
                direction: sort.direction === 'ascending' ? 'descending' : 'ascending',
              });
            }}
          >
            {direction === 'ascending' ? 'Ascending' : 'Descending'}
          </ToggleButton>
        </div>
      )}

      {density !== undefined && onDensityChange !== undefined && (
        <RadioGroup
          className="line-density-group line-action-bar-density"
          orientation="horizontal"
          value={density}
          onChange={(value) => onDensityChange(value as Density)}
        >
          <Label>Density</Label>
          <div className="line-density-radios">
            {DENSITIES.map((d) => (
              <LineRadio key={d.value} value={d.value}>
                {d.label}
              </LineRadio>
            ))}
          </div>
        </RadioGroup>
      )}
    </div>
  );
}
