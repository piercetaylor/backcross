/**
 * Reordering the worker's class data on the main thread.
 *
 * Two things are pinned here. First, that a reorder is a permutation of an
 * array of references and nothing else: the typed arrays come through
 * identically (`toBe`), so no genotype data is copied and none is
 * re-requested. Second, that the fetch key is a key on the *set* of ids,
 * so changing only the sort order cannot issue a worker request -- the
 * assertion `classesRequestKey(['b','a']) === classesRequestKey(['a','b'])`
 * is what makes a sort-triggered refetch impossible in App.tsx, where that
 * string is the effect's dependency and its memo key.
 *
 * The acceptance criterion "sorting the Lines table reorders the canvas,
 * and the reverse" is proved here at the model level: both screens consume
 * the same visible-row order, so the drawn rows equal the table's rows
 * under any sort.
 */
import { describe, expect, it } from 'vitest';

import { classesRequestKey, permuteClassesData } from '../src/ui/lines/classes-order.ts';
import { EMPTY_LINE_FILTER, orderLineRows } from '../src/ui/lines/line-order.ts';
import type { LineSort } from '../src/ui/lines/line-order.ts';
import type { LineRow } from '../src/ui/lines/line-rows.ts';
import type { GenotypeClassesData } from '../src/workers/protocol.ts';

const NO_SELECTION = new Set<string>();

function fabricate(sampleIds: string[]): GenotypeClassesData {
  return {
    chromosomeOrder: ['Gm01'],
    chromLengthsBp: Float64Array.from([3000]),
    markerChromIndex: Int32Array.from([0, 0, 0]),
    markerPosBp: Float64Array.from([1000, 2000, 3000]),
    sortedMarkerOrder: Int32Array.from([0, 1, 2]),
    informative: Uint8Array.from([1, 1, 1]),
    lines: sampleIds.map((sampleId, i) => ({
      sampleId,
      classes: Uint8Array.from([1, 1, i + 1]),
    })),
  };
}

function row(sampleId: string, over: Partial<LineRow> = {}): LineRow {
  return {
    sampleId,
    lineName: sampleId,
    generation: 'BC5F3',
    familyId: 'FAM1',
    rppCount: 0.9,
    rppBp: 0.9,
    rppCm: 0.9,
    nSegments: 1,
    largestSegmentMb: 6,
    targetStatus: [],
    flags: [],
    ...over,
  };
}

describe('permuteClassesData', () => {
  const data = fabricate(['NIL_1', 'NIL_2', 'NIL_3']);

  it('puts the lines in the given order', () => {
    const out = permuteClassesData(data, ['NIL_3', 'NIL_1', 'NIL_2']);
    expect(out.lines.map((l) => l.sampleId)).toEqual(['NIL_3', 'NIL_1', 'NIL_2']);
  });

  it('shares the class buffers and the marker arrays rather than copying them', () => {
    const out = permuteClassesData(data, ['NIL_3', 'NIL_1', 'NIL_2']);
    expect(out.lines[0]?.classes).toBe(data.lines[2]?.classes);
    expect(out.markerPosBp).toBe(data.markerPosBp);
    expect(out.sortedMarkerOrder).toBe(data.sortedMarkerOrder);
    expect(out.informative).toBe(data.informative);
    expect(out.chromLengthsBp).toBe(data.chromLengthsBp);
  });

  it('skips an id the data does not carry and drops a line the order omits', () => {
    const out = permuteClassesData(data, ['NIL_3', 'GHOST']);
    expect(out.lines.map((l) => l.sampleId)).toEqual(['NIL_3']);
  });

  it('leaves the original untouched', () => {
    permuteClassesData(data, ['NIL_3', 'NIL_1', 'NIL_2']);
    expect(data.lines.map((l) => l.sampleId)).toEqual(['NIL_1', 'NIL_2', 'NIL_3']);
  });
});

describe('classesRequestKey', () => {
  it('is a key on the set, not the order, so a sort cannot refetch', () => {
    expect(classesRequestKey(['b', 'a'])).toBe(classesRequestKey(['a', 'b']));
  });

  it('still distinguishes a different set', () => {
    expect(classesRequestKey(['a', 'b'])).not.toBe(classesRequestKey(['a', 'b', 'c']));
    expect(classesRequestKey(['a', 'b'])).not.toBe(classesRequestKey(['a', 'c']));
  });

  it('splits back into the ids the request is sent with', () => {
    expect(classesRequestKey(['NIL_3', 'NIL_1']).split('\n')).toEqual(['NIL_1', 'NIL_3']);
  });
});

describe('the drawn rows are the table rows', () => {
  const rows = [
    row('NIL_2', { rppCount: 0.8 }),
    row('NIL_10', { rppCount: 0.99 }),
    row('NIL_1', { rppCount: 0.5 }),
  ];
  const data = fabricate(['NIL_1', 'NIL_10', 'NIL_2']);
  const sorts: (LineSort | null)[] = [
    null,
    { column: 'sampleId', direction: 'ascending' },
    { column: 'sampleId', direction: 'descending' },
    { column: 'rppCount', direction: 'ascending' },
    { column: 'rppCount', direction: 'descending' },
  ];

  it('matches the visible row order under every sort, without a new request', () => {
    const keys = new Set<string>();
    for (const sort of sorts) {
      const visible = orderLineRows(rows, sort, EMPTY_LINE_FILTER, NO_SELECTION);
      const visibleIds = visible.map((r) => r.sampleId);
      keys.add(classesRequestKey(visibleIds));
      expect(permuteClassesData(data, visibleIds).lines.map((l) => l.sampleId)).toEqual(visibleIds);
    }
    // One key across every sort: the fetch App.tsx memoises on it runs once.
    expect(keys.size).toBe(1);
  });
});
