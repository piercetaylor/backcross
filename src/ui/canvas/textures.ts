/**
 * CanvasPattern builder for class textures (docs/adr/0007, M2.5 phase 3).
 *
 * Responsibility: turn the texture *definitions* in src/core/palette.ts
 * (CLASS_TEXTURES) into CanvasPattern objects the renderer can use as a
 * fillStyle. Everything that touches `document` or `createPattern` lives
 * here rather than in src/core/, per invariant 1.
 *
 * Each tile is drawn at device-pixel resolution (side `s`, computed from the
 * texture's declared `pitch` so the perpendicular stripe spacing on screen
 * equals `pitch` CSS px regardless of dpr) and the resulting pattern is
 * counter-scaled with `setTransform(new DOMMatrix().scale(1 / dpr))` so it
 * stays crisp under the renderer's own `ctx.setTransform(dpr, ...)`. A
 * pattern is anchored at the canvas origin by construction -- nothing here
 * or in the renderer translates the context before filling with it -- so
 * adjacent runs tile continuously instead of each restarting its own tile at
 * the run's left edge.
 *
 * Interface: ClassPatterns, buildClassPatterns(ctx, dpr).
 */
import { CLASS_TEXTURES } from '../../core/palette.ts';
import type { ClassTexture, TextureKind } from '../../core/palette.ts';
import type { CallClassValue } from '../../core/types.ts';

export type ClassPatterns = Record<CallClassValue, CanvasPattern | null>;

/** Device-pixel side of a texture's tile: rising/falling/crosshatch need the diagonal to span one `pitch` of perpendicular spacing; dots tile on `pitch` directly. */
function tileSizePx(kind: TextureKind, pitch: number, dpr: number): number {
  if (kind === 'dots') return Math.max(1, Math.round(pitch * dpr));
  return Math.max(1, Math.round(pitch * Math.sqrt(2) * dpr));
}

function drawTile(kind: TextureKind, texture: ClassTexture, dpr: number): HTMLCanvasElement {
  const side = tileSizePx(kind, texture.pitch, dpr);
  const tile = document.createElement('canvas');
  tile.width = side;
  tile.height = side;
  const tctx = tile.getContext('2d');
  if (tctx === null) return tile;

  tctx.strokeStyle = texture.ink;
  tctx.fillStyle = texture.ink;
  tctx.lineWidth = texture.strokeWidth * dpr;
  tctx.lineCap = 'butt';

  if (kind === 'rising' || kind === 'crosshatch') {
    tctx.beginPath();
    tctx.moveTo(0, side);
    tctx.lineTo(side, 0);
    tctx.stroke();
  }
  if (kind === 'falling' || kind === 'crosshatch') {
    tctx.beginPath();
    tctx.moveTo(0, 0);
    tctx.lineTo(side, side);
    tctx.stroke();
  }
  if (kind === 'dots') {
    tctx.fillRect(0, 0, dpr, dpr);
  }
  return tile;
}

/**
 * Builds one CanvasPattern per textured class (null for RP_HOM and
 * UNINFORMATIVE, which stay plain fills), for the given context and device
 * pixel ratio. The renderer calls this once per dpr and caches the result
 * rather than rebuilding it on every draw().
 */
export function buildClassPatterns(ctx: CanvasRenderingContext2D, dpr: number): ClassPatterns {
  const result = {} as ClassPatterns;
  for (const key of Object.keys(CLASS_TEXTURES)) {
    const cls = Number(key) as CallClassValue;
    const texture = CLASS_TEXTURES[cls];
    if (texture.kind === 'plain') {
      result[cls] = null;
      continue;
    }
    const tile = drawTile(texture.kind, texture, dpr);
    const pattern = ctx.createPattern(tile, 'repeat');
    pattern?.setTransform(new DOMMatrix().scale(1 / dpr));
    result[cls] = pattern;
  }
  return result;
}
