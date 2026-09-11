/**
 * The display order both line screens read: filter, then sort.
 *
 * Hand-built rows rather than the fixture, because what is under test is
 * the ordering rule -- NaN placement, natural-number string order,
 * stability, the three filter predicates -- and each of those needs a row
 * shaped to provoke it, not a realistic one.
 */
import { describe, expect, it } from 'vitest';

import { EMPTY_LINE_FILTER, lineCounts, orderLineRows } from '../src/ui/lines/line-order.ts';
import type { LineFilter, LineSort } from '../src/ui/lines/line-order.ts';
import type { LineRow } from '../src/ui/lines/line-rows.ts';

function row(sampleId: string, over: Partial<LineRow> = {}): LineRow {
  return {
    sampleId,
    lineName: sampleId.replace('_', '-'),
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

const ids = (rows: LineRow[]) => rows.map((r) => r.sampleId);
const filterWith = (over: Partial<LineFilter>): LineFilter => ({ ...EMPTY_LINE_FILTER, ...over });
const asc = (column: LineSort['column']): LineSort => ({ column, direction: 'ascending' });
const desc = (column: LineSort['column']): LineSort => ({ column, direction: 'descending' });
const NONE = new Set<string>();

describe('orderLineRows', () => {
  it('places NaN last under both directions', () => {
    const rows = [
      row('A', { rppBp: 0.5 }),
      row('B', { rppBp: NaN }),
      row('C', { rppBp: 0.9 }),
      row('D', { rppBp: NaN }),
    ];
    expect(ids(orderLineRows(rows, asc('rppBp'), EMPTY_LINE_FILTER, NONE))).toEqual([
      'A',
      'C',
      'B',
      'D',
    ]);
    expect(ids(orderLineRows(rows, desc('rppBp'), EMPTY_LINE_FILTER, NONE))).toEqual([
      'C',
      'A',
      'B',
      'D',
    ]);
  });

  it('sorts sample ids as numbers where they end in one: NIL_2 before NIL_10', () => {
    const rows = [row('NIL_10'), row('NIL_2'), row('NIL_1')];
    expect(ids(orderLineRows(rows, asc('sampleId'), EMPTY_LINE_FILTER, NONE))).toEqual([
      'NIL_1',
      'NIL_2',
      'NIL_10',
    ]);
  });

  it('matches a flag name case-insensitively in the text filter', () => {
    const rows = [row('NIL_1', { flags: ['closer_to_donor'] }), row('NIL_2')];
    expect(ids(orderLineRows(rows, null, filterWith({ text: 'CLOSER_TO' }), NONE))).toEqual([
      'NIL_1',
    ]);
    expect(ids(orderLineRows(rows, null, filterWith({ text: 'nil_2' }), NONE))).toEqual(['NIL_2']);
    expect(ids(orderLineRows(rows, null, filterWith({ text: 'no such thing' }), NONE))).toEqual([]);
  });

  it('keeps only flagged rows under flaggedOnly', () => {
    const rows = [row('NIL_1', { flags: ['high_missing'] }), row('NIL_2'), row('NIL_3')];
    expect(ids(orderLineRows(rows, null, filterWith({ flaggedOnly: true }), NONE))).toEqual([
      'NIL_1',
    ]);
  });

  it('keeps only selected rows under selectedOnly, ignoring a selected id that is not a row', () => {
    const rows = [row('NIL_1'), row('NIL_2')];
    const selected = new Set(['NIL_2', 'GHOST']);
    expect(ids(orderLineRows(rows, null, filterWith({ selectedOnly: true }), selected))).toEqual([
      'NIL_2',
    ]);
  });

  it('filters before it sorts', () => {
    const rows = [
      row('NIL_1', { rppCount: 0.1, flags: ['closer_to_donor'] }),
      row('NIL_2', { rppCount: 0.99 }),
      row('NIL_3', { rppCount: 0.2, flags: ['high_missing'] }),
    ];
    const out = orderLineRows(rows, desc('rppCount'), filterWith({ flaggedOnly: true }), NONE);
    expect(ids(out)).toEqual(['NIL_3', 'NIL_1']);
  });

  it('is stable: rows tied on the sort column keep their input order', () => {
    const rows = [
      row('NIL_9', { nSegments: 2 }),
      row('NIL_1', { nSegments: 2 }),
      row('NIL_5', { nSegments: 1 }),
    ];
    expect(ids(orderLineRows(rows, asc('nSegments'), EMPTY_LINE_FILTER, NONE))).toEqual([
      'NIL_5',
      'NIL_9',
      'NIL_1',
    ]);
  });

  it('sorts target:1 on the second region status, treating a missing status as empty', () => {
    const rows = [
      row('NIL_1', { targetStatus: ['donor', 'rp'] }),
      row('NIL_2', { targetStatus: ['rp', 'donor'] }),
      row('NIL_3', { targetStatus: ['rp'] }),
    ];
    expect(ids(orderLineRows(rows, asc('target:1'), EMPTY_LINE_FILTER, NONE))).toEqual([
      'NIL_3',
      'NIL_2',
      'NIL_1',
    ]);
  });

  it('returns the rows untouched with no sort and the empty filter', () => {
    const rows = [row('NIL_9'), row('NIL_1'), row('NIL_5')];
    expect(orderLineRows(rows, null, EMPTY_LINE_FILTER, NONE)).toEqual(rows);
  });
});

describe('lineCounts', () => {
  it('counts a selected row the filter has hidden, and ignores a selected id that is not a row', () => {
    const rows = [row('NIL_1'), row('NIL_2'), row('NIL_3')];
    const selected = new Set(['NIL_1', 'NIL_3', 'GHOST']);
    const visible = orderLineRows(rows, null, filterWith({ text: 'NIL_1' }), selected);
    expect(ids(visible)).toEqual(['NIL_1']);
    expect(lineCounts(rows, visible, selected)).toEqual({ total: 3, visible: 1, selected: 2 });
  });
});
