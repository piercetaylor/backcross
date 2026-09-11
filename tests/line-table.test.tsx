/**
 * The Lines table's accessibility contract, asserted from server-rendered
 * markup.
 *
 * `react-dom/server`'s renderToString in the existing environment: 'node'
 * -- no DOM, no jsdom. React Aria server-renders its Table, so the grid
 * role, the sort state, the selection state and the row count are all
 * readable from the string. What is NOT testable this way is behaviour:
 * the APG grid keyboard pattern, the sticky header's interaction with
 * 2.4.11, and the density control's visible effect need a real browser and
 * are M3 browser-mode items (docs/m2.5-phases.md, phase 4 "Not verifiable
 * here").
 *
 * The rows are hand-built rather than derived from the fixture: the point
 * is the table's rendering of a known model, and tests/line-rows.test.ts
 * already pins how that model is built.
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { TargetRegion } from '../src/core/types.ts';
import { LineActionBar } from '../src/ui/lines/LineActionBar.tsx';
import { EMPTY_LINE_FILTER } from '../src/ui/lines/line-order.ts';
import type { LineSort } from '../src/ui/lines/line-order.ts';
import type { LineRow } from '../src/ui/lines/line-rows.ts';
import type { LoadedState } from '../src/ui/screens/UploadScreen.tsx';
import { LineTableScreen } from '../src/ui/screens/LineTableScreen.tsx';

function row(sampleId: string, rppBp: number, flags: string[] = []): LineRow {
  return {
    sampleId,
    lineName: `${sampleId}-name`,
    generation: 'BC3F4',
    familyId: 'F1',
    rppCount: 0.95,
    rppBp,
    rppCm: 0.94,
    nSegments: 2,
    largestSegmentMb: 3.5,
    targetStatus: ['donor'],
    flags,
  };
}

const ALL_ROWS: LineRow[] = [
  row('NIL_1', 0.91),
  row('NIL_2', 0.99, ['low_call_rate']),
  row('NIL_3', 0.95),
  row('NIL_4', 0.8),
  row('NIL_5', 0.7),
  row('NIL_6', 0.6),
];

/** Three visible, in the order a descending rpp_bp sort leaves them. */
const VISIBLE: LineRow[] = [ALL_ROWS[1], ALL_ROWS[2], ALL_ROWS[0]] as LineRow[];
const SELECTED = new Set(['NIL_2', 'NIL_3']);
const SORT: LineSort = { column: 'rppBp', direction: 'descending' };
const REGIONS: TargetRegion[] = [
  { name: 'rhg1', chrom: 'Gm18', startBp: 1_600_000, endBp: 1_700_000 },
];
const COUNTS = { total: 6, visible: 3, selected: 2 };

// LineTableScreen reads nothing off `loaded` but its nullness, so an empty
// shell is enough and no fixture has to be parsed to render the table.
const LOADED = {
  samples: [],
  chromosomeOrder: [],
} as unknown as LoadedState;

function renderScreen(visibleRows: LineRow[], counts = COUNTS): string {
  return renderToString(
    <LineTableScreen
      loaded={LOADED}
      visibleRows={visibleRows}
      regions={REGIONS}
      counts={counts}
      sort={SORT}
      onSortChange={() => undefined}
      filter={EMPTY_LINE_FILTER}
      onFilterChange={() => undefined}
      selected={SELECTED}
      onSelectionChange={() => undefined}
      targetSpecs={['rhg1=Gm18:1.6Mb-1.7Mb']}
      onApplyTargets={() => undefined}
      onSelectAllVisible={() => undefined}
      onSelectNone={() => undefined}
      density="default"
      onDensityChange={() => undefined}
    />,
  );
}

/** The <tbody> of the rendered table, so header rows are not counted. */
function tbody(html: string): string {
  const start = html.indexOf('<tbody');
  const end = html.indexOf('</tbody>');
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return html.slice(start, end);
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

const html = renderScreen(VISIBLE);

describe('the Lines table server-renders as a grid', () => {
  it('is a role="grid" widget, not a static table', () => {
    expect(html).toContain('role="grid"');
    expect(html).toContain('aria-label="Lines"');
  });

  it('marks exactly one column descending, and it is rpp_bp', () => {
    expect(count(html, 'aria-sort="descending"')).toBe(1);
    expect(html).toMatch(/<th[^>]*aria-sort="descending"[^>]*>rpp_bp<\/th>/);
  });

  it('reports both selected visible rows as selected', () => {
    expect(count(html, 'aria-selected="true"')).toBe(2);
    expect(count(tbody(html), 'role="row"')).toBe(3);
  });

  it('renders one column per region, keyed by position', () => {
    expect(html).toMatch(/<th[^>]*data-key="target:0"[^>]*>rhg1<\/th>/);
    expect(html).toContain('>donor<');
  });

  it('shows the empty-state message when the filter hides every row', () => {
    const empty = renderScreen([], { total: 6, visible: 0, selected: 2 });
    expect(empty).toContain('No lines match the filter.');
  });
});

describe('the action bar', () => {
  it('reads the counts back as one string', () => {
    expect(html).toContain('Lines: 6, visible: 3, selected: 2');
  });

  it('offers the three density choices as a radio group', () => {
    expect(html).toContain('role="radiogroup"');
    for (const label of ['Compact', 'Default', 'Comfortable']) {
      expect(html).toContain(label);
    }
  });

  // The Lines screen passes showSortControl={false} because its column
  // headers sort; the genotype screen is the only caller that renders the
  // Select, and nothing else server-renders that screen.
  it('server-renders the sort Select the genotype screen uses', () => {
    const bar = renderToString(
      <LineActionBar
        counts={COUNTS}
        sort={SORT}
        onSortChange={() => undefined}
        filter={EMPTY_LINE_FILTER}
        onFilterChange={() => undefined}
        regions={REGIONS}
        showSortControl={true}
        onSelectAllVisible={() => undefined}
        onSelectNone={() => undefined}
      />,
    );
    expect(bar).toContain('Sort by');
    expect(bar).toContain('Descending');
    // No density props, so the genotype screen shows no density control.
    expect(bar).not.toContain('role="radiogroup"');
  });
});
