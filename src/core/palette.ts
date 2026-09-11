/**
 * Colorblind-safe palette for graphical genotypes, and the second, texture
 * channel that carries class identity independently of hue (docs/adr/0007,
 * docs/adr/0009, M2.5 phase 3).
 *
 * Responsibility: the single source of colors and textures for every call
 * class, used by the canvas renderer, the legend, and the HTML report.
 * Colors are from the Okabe-Ito palette (Okabe and Ito 2008, Color Universal
 * Design), chosen so RP and donor remain distinguishable under deuteranopia
 * and protanopia: blue vs vermilion rather than green vs red. Four of the
 * six classes additionally carry a texture, so a reader relying on
 * greyscale or a printed page still separates every class; RP_HOM and
 * UNINFORMATIVE stay plain fills (ADR 0009, amended 2026-09-11): RP_HOM
 * covers most of a near-isogenic line, so texturing it would texture the
 * whole canvas, and UNINFORMATIVE is the track background rather than a
 * call. Texture *definitions* and the `classSwatchCss` CSS-string builder
 * are data, not DOM access, so they live here per invariant 1; the
 * `CanvasPattern` objects they describe are built in
 * src/ui/canvas/textures.ts.
 *
 * Interface: CLASS_COLORS, classColor(cls), TextureKind, ClassTexture,
 * TEXTURE_INK, CLASS_TEXTURES, classSwatchCss(cls).
 */
import { CallClass } from './types.ts';
import type { CallClassValue } from './types.ts';

export const OKABE_ITO = {
  orange: '#E69F00',
  skyBlue: '#56B4E9',
  bluishGreen: '#009E73',
  yellow: '#F0E442',
  blue: '#0072B2',
  vermilion: '#D55E00',
  reddishPurple: '#CC79A7',
  black: '#000000',
} as const;

export const CLASS_COLORS: Record<CallClassValue, string> = {
  [CallClass.RP_HOM]: OKABE_ITO.blue,
  [CallClass.DONOR_HOM]: OKABE_ITO.vermilion,
  [CallClass.HET]: OKABE_ITO.yellow,
  [CallClass.MISSING]: '#FFFFFF',
  [CallClass.UNINFORMATIVE]: '#D9D9D9',
  [CallClass.NONPARENTAL]: OKABE_ITO.reddishPurple,
};

export function classColor(cls: CallClassValue): string {
  return CLASS_COLORS[cls];
}

export type TextureKind = 'plain' | 'rising' | 'falling' | 'crosshatch' | 'dots';

export interface ClassTexture {
  kind: TextureKind;
  /** Stroke or dot colour. */
  ink: string;
  /** Stroke width, CSS px. */
  strokeWidth: number;
  /** Perpendicular distance between strokes, or dot grid pitch, CSS px. */
  pitch: number;
}

/** One ink for every texture: black clears 3:1 (WCAG 1.4.11) against every textured class fill and against every majority fill a minority overlay can be drawn over (tests/contrast.test.ts). */
export const TEXTURE_INK = OKABE_ITO.black;

const PLAIN: ClassTexture = { kind: 'plain', ink: TEXTURE_INK, strokeWidth: 0, pitch: 0 };
const STROKE_WIDTH = 1;
const PITCH = 4;

export const CLASS_TEXTURES: Record<CallClassValue, ClassTexture> = {
  [CallClass.RP_HOM]: PLAIN,
  [CallClass.DONOR_HOM]: {
    kind: 'rising',
    ink: TEXTURE_INK,
    strokeWidth: STROKE_WIDTH,
    pitch: PITCH,
  },
  [CallClass.HET]: { kind: 'falling', ink: TEXTURE_INK, strokeWidth: STROKE_WIDTH, pitch: PITCH },
  [CallClass.NONPARENTAL]: {
    kind: 'crosshatch',
    ink: TEXTURE_INK,
    strokeWidth: STROKE_WIDTH,
    pitch: PITCH,
  },
  [CallClass.MISSING]: { kind: 'dots', ink: TEXTURE_INK, strokeWidth: STROKE_WIDTH, pitch: PITCH },
  [CallClass.UNINFORMATIVE]: PLAIN,
};

/** `repeating-linear-gradient` stripes rendering as "/" (rising) at 135deg or "\" (falling) at 45deg: stripes run perpendicular to the gradient line. */
function stripeGradient(angleDeg: number, texture: ClassTexture): string {
  const { ink, strokeWidth, pitch } = texture;
  return `repeating-linear-gradient(${angleDeg}deg, ${ink} 0 ${strokeWidth}px, transparent ${strokeWidth}px ${pitch}px)`;
}

/**
 * CSS `background` shorthand value drawing a class's texture over its fill,
 * for legend swatches on screen (src/ui/screens/GenotypeViewScreen.tsx) and
 * in the report (src/export/report.ts). Plain classes resolve to exactly
 * their fill colour; textured classes layer one or two repeating gradients
 * (or a repeating radial dot grid) over the fill, comma-separated per the
 * CSS `background` shorthand, fill last.
 */
export function classSwatchCss(cls: CallClassValue): string {
  const texture = CLASS_TEXTURES[cls];
  const fill = CLASS_COLORS[cls];
  switch (texture.kind) {
    case 'plain':
      return fill;
    case 'rising':
      return `${stripeGradient(135, texture)}, ${fill}`;
    case 'falling':
      return `${stripeGradient(45, texture)}, ${fill}`;
    case 'crosshatch':
      return `${stripeGradient(135, texture)}, ${stripeGradient(45, texture)}, ${fill}`;
    case 'dots': {
      const { ink, strokeWidth, pitch } = texture;
      const radius = strokeWidth / 2;
      const transparentRadius = radius + 0.1;
      return `radial-gradient(circle at ${radius}px ${radius}px, ${ink} ${radius}px, transparent ${transparentRadius}px) 0 0 / ${pitch}px ${pitch}px repeat, ${fill}`;
    }
  }
}
