/** Per-pixel-column binning (docs/adr/0007): hand-built cases, no fixture files. */
import { describe, expect, it } from 'vitest';

import { binMajorityClasses } from '../src/ui/canvas/binning.ts';
import { CallClass } from '../src/core/types.ts';

describe('binMajorityClasses', () => {
  it('picks the majority class in a column', () => {
    // Three markers land in pixel column 0 of a 2px-wide, 0..100bp range:
    // two DONOR_HOM and one RP_HOM, so DONOR_HOM wins.
    const positions = [10, 20, 30];
    const classes = Uint8Array.from([CallClass.DONOR_HOM, CallClass.DONOR_HOM, CallClass.RP_HOM]);
    const markerIndices = [0, 1, 2];
    const out = binMajorityClasses(positions, classes, markerIndices, 0, 100, 2);
    expect(out).toEqual(Uint8Array.from([CallClass.DONOR_HOM, 255]));
  });

  it('resolves a tie to the lower class code (RP_HOM beats DONOR_HOM)', () => {
    const positions = [10, 20];
    const classes = Uint8Array.from([CallClass.DONOR_HOM, CallClass.RP_HOM]);
    const markerIndices = [0, 1];
    const out = binMajorityClasses(positions, classes, markerIndices, 0, 100, 1);
    expect(out[0]).toBe(CallClass.RP_HOM);
  });

  it('marks a column whose only markers are uninformative as 255', () => {
    const positions = [10, 20];
    const classes = Uint8Array.from([CallClass.UNINFORMATIVE, CallClass.UNINFORMATIVE]);
    const markerIndices = [0, 1];
    const out = binMajorityClasses(positions, classes, markerIndices, 0, 100, 1);
    expect(out[0]).toBe(255);
  });

  it('marks an empty column (no markers at all) as 255', () => {
    const positions: number[] = [];
    const classes = new Uint8Array(0);
    const markerIndices: number[] = [];
    const out = binMajorityClasses(positions, classes, markerIndices, 0, 100, 4);
    expect(out).toEqual(Uint8Array.from([255, 255, 255, 255]));
  });

  it('ignores markers outside [startBp, endBp]', () => {
    const positions = [-5, 50, 500];
    const classes = Uint8Array.from([CallClass.DONOR_HOM, CallClass.RP_HOM, CallClass.HET]);
    const markerIndices = [0, 1, 2];
    const out = binMajorityClasses(positions, classes, markerIndices, 0, 100, 1);
    expect(out[0]).toBe(CallClass.RP_HOM);
  });

  it('clamps a marker at the very end of the range into the last column', () => {
    const positions = [100];
    const classes = Uint8Array.from([CallClass.DONOR_HOM]);
    const markerIndices = [0];
    const out = binMajorityClasses(positions, classes, markerIndices, 0, 100, 10);
    expect(out[9]).toBe(CallClass.DONOR_HOM);
    for (let i = 0; i < 9; i++) expect(out[i]).toBe(255);
  });

  it('a called marker wins over a missing one in the same column', () => {
    const positions = [10, 20];
    const classes = Uint8Array.from([CallClass.MISSING, CallClass.RP_HOM]);
    const markerIndices = [0, 1];
    const out = binMajorityClasses(positions, classes, markerIndices, 0, 100, 1);
    expect(out[0]).toBe(CallClass.RP_HOM);
  });

  it('a called marker wins over missing ones even when missing is the majority by count', () => {
    const positions = [10, 20, 30];
    const classes = Uint8Array.from([CallClass.MISSING, CallClass.MISSING, CallClass.DONOR_HOM]);
    const markerIndices = [0, 1, 2];
    const out = binMajorityClasses(positions, classes, markerIndices, 0, 100, 1);
    expect(out[0]).toBe(CallClass.DONOR_HOM);
  });

  it('marks a column with only a missing marker as MISSING, not 255', () => {
    const positions = [10];
    const classes = Uint8Array.from([CallClass.MISSING]);
    const markerIndices = [0];
    const out = binMajorityClasses(positions, classes, markerIndices, 0, 100, 1);
    expect(out[0]).toBe(CallClass.MISSING);
  });

  it('resolves a called-class tie to the lower code (HET beats NONPARENTAL)', () => {
    const positions = [10, 20];
    const classes = Uint8Array.from([CallClass.NONPARENTAL, CallClass.HET]);
    const markerIndices = [0, 1];
    const out = binMajorityClasses(positions, classes, markerIndices, 0, 100, 1);
    expect(out[0]).toBe(CallClass.HET);
  });

  it('a strict majority of NONPARENTAL beats a single HET', () => {
    const positions = [10, 20, 30];
    const classes = Uint8Array.from([CallClass.NONPARENTAL, CallClass.NONPARENTAL, CallClass.HET]);
    const markerIndices = [0, 1, 2];
    const out = binMajorityClasses(positions, classes, markerIndices, 0, 100, 1);
    expect(out[0]).toBe(CallClass.NONPARENTAL);
  });

  it('handles 50,000 random markers without error and returns length widthPx', () => {
    const n = 50_000;
    const widthPx = 800;
    const positions = new Float64Array(n);
    const classes = new Uint8Array(n);
    const markerIndices = new Int32Array(n);
    const classValues: number[] = [
      CallClass.MISSING,
      CallClass.RP_HOM,
      CallClass.DONOR_HOM,
      CallClass.HET,
      CallClass.UNINFORMATIVE,
      CallClass.NONPARENTAL,
    ];
    let seed = 42;
    function rand(): number {
      // Deterministic LCG so the test is reproducible.
      seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff;
      return seed / 0x7fffffff;
    }
    for (let i = 0; i < n; i++) {
      positions[i] = rand() * 1_000_000;
      classes[i] = classValues[Math.floor(rand() * classValues.length)] as number;
      markerIndices[i] = i;
    }
    const out = binMajorityClasses(positions, classes, markerIndices, 0, 1_000_000, widthPx);
    expect(out.length).toBe(widthPx);
    // Every output value is one of the four called classes, MISSING, or the
    // no-marker/uninformative-only sentinel -- never a raw class count or an
    // UNINFORMATIVE marker winning a column.
    const allowed = new Set([
      CallClass.MISSING,
      CallClass.RP_HOM,
      CallClass.DONOR_HOM,
      CallClass.HET,
      CallClass.NONPARENTAL,
      255,
    ]);
    for (const v of out) expect(allowed.has(v)).toBe(true);
  });
});
