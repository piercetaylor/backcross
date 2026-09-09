/**
 * Genotype-view zoom and hover (M2): the two pure pieces reachable without a
 * canvas or DOM -- the locus grammar reused from core/targets.ts for the
 * zoom region field, and the nearest-marker binary search used by
 * GraphicalGenotypeRenderer.hitTest. Canvas-dependent behaviour (drawing,
 * drag selection, actual hitTest against a live renderer) is browser-mode
 * work planned for M3, not covered here.
 */
import { describe, expect, it } from 'vitest';

import { parseLocus } from '../src/core/targets.ts';
import { nearestMarkerIndex } from '../src/ui/canvas/GraphicalGenotypeRenderer.ts';

describe('parseLocus', () => {
  it('parses a range whose end token carries the unit for both ends', () => {
    expect(parseLocus('Gm13:28.5-29.1Mb')).toEqual({
      chrom: 'Gm13',
      startBp: 28_500_000,
      endBp: 29_100_000,
    });
  });

  it('parses a bare position', () => {
    expect(parseLocus('Gm13:1.6Mb')).toEqual({
      chrom: 'Gm13',
      startBp: 1_600_000,
      endBp: 1_600_000,
    });
  });

  it('swaps a reversed range rather than rejecting it', () => {
    expect(parseLocus('Gm13:2000000-1000000')).toEqual({
      chrom: 'Gm13',
      startBp: 1_000_000,
      endBp: 2_000_000,
    });
  });

  it('accepts thousands separators and a non-canonical chromosome spelling', () => {
    expect(parseLocus('chr13:28,500,000-29,100,000')).toEqual({
      chrom: 'Gm13',
      startBp: 28_500_000,
      endBp: 29_100_000,
    });
  });

  it('returns null for text with no colon, since that is not shaped like a locus', () => {
    expect(parseLocus('not_a_locus')).toBeNull();
  });

  it('throws when a decimal value has no explicit unit, rather than guessing one', () => {
    expect(() => parseLocus('Gm13:28.5-29.1')).toThrow(/unit/);
  });
});

describe('nearestMarkerIndex', () => {
  // Sparse: only indices 2, 4 and 6 of `positions` are real markers, so a
  // test that returns the wrong value would reveal whether the function
  // confuses "index into markerIndices" with "index into positions".
  const positions = Float64Array.from([-1, -1, 100, -1, 300, -1, 700]);
  const markerIndices = [2, 4, 6];

  it('returns the exact marker on an exact position match', () => {
    expect(nearestMarkerIndex(positions, markerIndices, 300)).toBe(4);
  });

  it('resolves an exact midpoint between two markers to the one after it', () => {
    expect(nearestMarkerIndex(positions, markerIndices, 200)).toBe(4);
  });

  it('returns the first marker for a target before it', () => {
    expect(nearestMarkerIndex(positions, markerIndices, -50)).toBe(2);
  });

  it('returns the last marker for a target after it', () => {
    expect(nearestMarkerIndex(positions, markerIndices, 1000)).toBe(6);
  });

  it('returns the only marker regardless of the target, with a single-marker list', () => {
    expect(nearestMarkerIndex(positions, [4], -999)).toBe(4);
    expect(nearestMarkerIndex(positions, [4], 99_999)).toBe(4);
  });

  it('returns -1 for an empty marker list', () => {
    expect(nearestMarkerIndex(positions, [], 500)).toBe(-1);
  });
});
