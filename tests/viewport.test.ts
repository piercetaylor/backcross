/**
 * Genotype-view zoom and hover: the pieces reachable without a canvas or a
 * DOM -- the locus grammar reused from core/targets.ts for the zoom region
 * field, the nearest-marker binary search used by
 * GraphicalGenotypeRenderer.hitTest, and (M2.5 phase 5) the pixel/bp
 * arithmetic the overview canvas is positioned by.
 *
 * The renderer's constructor only stores the element it is handed, and
 * setData, setSize, setViewport, bpOnChrom, xForBp and trackLayouts never
 * touch it, so a bare object standing in for an HTMLCanvasElement is enough
 * to exercise that arithmetic here. Anything that actually draws (draw,
 * hitTest against a live canvas, drag selection) is browser-mode work
 * planned for M3, not covered here.
 */
import { describe, expect, it } from 'vitest';

import { parseLocus } from '../src/core/targets.ts';
import { GraphicalGenotypeRenderer } from '../src/ui/canvas/GraphicalGenotypeRenderer.ts';
import { nearestMarkerIndex } from '../src/ui/canvas/GraphicalGenotypeRenderer.ts';
import type { GenotypeClassesData } from '../src/workers/protocol.ts';

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

/**
 * Two chromosomes of unequal length, with one marker apiece so setData has
 * something consistent to group; the pixel arithmetic under test reads only
 * the chromosome order and the lengths.
 */
const CHROM_A_LENGTH_BP = 1_000_000;
const CHROM_B_LENGTH_BP = 3_000_000;

function fabricatedData(): GenotypeClassesData {
  return {
    chromosomeOrder: ['Gm01', 'Gm02'],
    chromLengthsBp: Float64Array.from([CHROM_A_LENGTH_BP, CHROM_B_LENGTH_BP]),
    markerChromIndex: Int32Array.from([0, 1]),
    markerPosBp: Float64Array.from([CHROM_A_LENGTH_BP, CHROM_B_LENGTH_BP]),
    sortedMarkerOrder: Int32Array.from([0, 1]),
    informative: Uint8Array.from([1, 1]),
    lines: [{ sampleId: 'NIL_1', classes: Uint8Array.from([0, 0]) }],
  };
}

/** The canvas is never touched by the methods under test (see the header). */
function fabricatedRenderer(cssWidth: number): GraphicalGenotypeRenderer {
  const renderer = new GraphicalGenotypeRenderer({} as unknown as HTMLCanvasElement);
  renderer.setData(fabricatedData());
  renderer.setSize(cssWidth);
  return renderer;
}

describe('xForBp', () => {
  it('round-trips bpOnChrom across a whole-genome layout', () => {
    const renderer = fabricatedRenderer(920);
    for (const x of [200, 500, 860]) {
      const chrom = renderer.chromosomeAt(x);
      expect(chrom).not.toBeNull();
      const bp = renderer.bpOnChrom(chrom as string, x);
      expect(bp).not.toBeNull();
      expect(renderer.xForBp(chrom as string, bp as number)).toBeCloseTo(x, 6);
    }
  });

  it('round-trips bpOnChrom inside a zoomed window on one chromosome', () => {
    const renderer = fabricatedRenderer(920);
    renderer.setViewport({ chrom: 'Gm02', startBp: 1_000_000, endBp: 2_000_000 });
    for (const x of [150, 400, 900]) {
      const bp = renderer.bpOnChrom('Gm02', x);
      expect(bp).not.toBeNull();
      expect(bp as number).toBeGreaterThanOrEqual(1_000_000);
      expect(bp as number).toBeLessThanOrEqual(2_000_000);
      expect(renderer.xForBp('Gm02', bp as number)).toBeCloseTo(x, 6);
    }
  });

  it('clamps a bp outside the drawn window to the track, as bpOnChrom clamps a pixel', () => {
    const renderer = fabricatedRenderer(920);
    renderer.setViewport({ chrom: 'Gm02', startBp: 1_000_000, endBp: 2_000_000 });
    const left = renderer.xForBp('Gm02', 0);
    const right = renderer.xForBp('Gm02', CHROM_B_LENGTH_BP);
    expect(left).toBe(renderer.xForBp('Gm02', 1_000_000));
    expect(right).toBe(renderer.xForBp('Gm02', 2_000_000));
  });

  it('returns null for a chromosome with no track in the current viewport', () => {
    const renderer = fabricatedRenderer(920);
    renderer.setViewport({ chrom: 'Gm02' });
    expect(renderer.xForBp('Gm01', 500_000)).toBeNull();
    expect(renderer.xForBp('Gm99', 500_000)).toBeNull();
  });
});

describe('trackLayouts', () => {
  it('reports one track per chromosome, offset past the label column and scaled by length', () => {
    const renderer = fabricatedRenderer(920);
    const tracks = renderer.trackLayouts();
    expect(tracks.map((t) => t.chrom)).toEqual(['Gm01', 'Gm02']);
    // labelWidth (120) is included, so a track's x can position an element
    // over the canvas without the caller re-deriving the label column.
    expect(tracks[0]?.x).toBe(120);
    expect(tracks[1]?.widthPx).toBeGreaterThan(tracks[0]?.widthPx as number);
  });

  it('reports the single track spanning the plot in a one-chromosome viewport', () => {
    const renderer = fabricatedRenderer(920);
    renderer.setViewport({ chrom: 'Gm01' });
    expect(renderer.trackLayouts()).toEqual([{ chrom: 'Gm01', x: 120, widthPx: 800 }]);
  });
});
