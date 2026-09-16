/** The overview's line stage (M4 phase 1): hand-built cases, expectations from the specification. */
import { describe, expect, it } from 'vitest';

import { binLinesIntoRows } from '../src/ui/canvas/line-binning.ts';
import { CallClass } from '../src/core/types.ts';
import type { CallClassValue } from '../src/core/types.ts';
import type { GenotypeClassesLine } from '../src/workers/protocol.ts';

function line(sampleId: string, classes: CallClassValue[]): GenotypeClassesLine {
  return { sampleId, classes: Uint8Array.from(classes) };
}

/** `n` lines of one marker each, all of class `cls`. */
function uniform(n: number, cls: CallClassValue): GenotypeClassesLine[] {
  return Array.from({ length: n }, (_, i) => line(`L${i}`, [cls]));
}

/** The single row two or three lines with these classes at one marker bin into. */
function binOne(classes: CallClassValue[]): number {
  const lines = classes.map((c, i) => line(`L${i}`, [c]));
  const rows = binLinesIntoRows(lines, 1);
  expect(rows).toHaveLength(1);
  return (rows[0] as GenotypeClassesLine).classes[0] as number;
}

describe('binLinesIntoRows', () => {
  it('returns the same array when there are no more lines than rows', () => {
    const lines = uniform(3, CallClass.RP_HOM);
    expect(binLinesIntoRows(lines, 3)).toBe(lines);
    expect(binLinesIntoRows(lines, 10)).toBe(lines);
  });

  it('bins 4 lines into 2 rows covering [0,2) and [2,4)', () => {
    const lines = [
      line('a', [CallClass.RP_HOM, CallClass.HET]),
      line('b', [CallClass.RP_HOM, CallClass.HET]),
      line('c', [CallClass.DONOR_HOM, CallClass.MISSING]),
      line('d', [CallClass.DONOR_HOM, CallClass.MISSING]),
    ];
    const rows = binLinesIntoRows(lines, 2);
    expect(rows.map((r) => r.sampleId)).toEqual(['rows:0-1', 'rows:2-3']);
    expect(rows[0]?.classes).toEqual(Uint8Array.from([CallClass.RP_HOM, CallClass.HET]));
    expect(rows[1]?.classes).toEqual(Uint8Array.from([CallClass.DONOR_HOM, CallClass.MISSING]));
    for (const r of rows) expect(r.classes).toHaveLength(2);
  });

  it('takes the majority of the covered lines at each marker, with binning.ts tie order', () => {
    expect(binOne([CallClass.RP_HOM, CallClass.DONOR_HOM, CallClass.DONOR_HOM])).toBe(
      CallClass.DONOR_HOM,
    );
    expect(binOne([CallClass.RP_HOM, CallClass.DONOR_HOM])).toBe(CallClass.RP_HOM);
    expect(binOne([CallClass.MISSING, CallClass.MISSING])).toBe(CallClass.MISSING);
    expect(binOne([CallClass.UNINFORMATIVE, CallClass.UNINFORMATIVE])).toBe(
      CallClass.UNINFORMATIVE,
    );
    // Missing never competes with a call.
    expect(binOne([CallClass.MISSING, CallClass.HET])).toBe(CallClass.HET);
    expect(binOne([CallClass.NONPARENTAL, CallClass.HET])).toBe(CallClass.HET);
    expect(binOne([CallClass.MISSING, CallClass.UNINFORMATIVE])).toBe(CallClass.MISSING);
    expect(binOne([CallClass.UNINFORMATIVE, CallClass.RP_HOM])).toBe(CallClass.RP_HOM);
  });

  it('bins 7 lines into 3 rows covering [0,2), [2,4), [4,7)', () => {
    const rows = binLinesIntoRows(uniform(7, CallClass.HET), 3);
    expect(rows.map((r) => r.sampleId)).toEqual(['rows:0-1', 'rows:2-3', 'rows:4-6']);
  });

  it('returns [] for 0 rows', () => {
    expect(binLinesIntoRows(uniform(4, CallClass.HET), 0)).toEqual([]);
  });
});
