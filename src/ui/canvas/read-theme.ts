/**
 * The one place the canvas learns what the stylesheet says.
 *
 * Responsibility: read the design tokens the canvas renderer needs off a
 * mounted element and return them as a RendererTheme and a RendererLayout.
 * The renderer itself holds no token and no literal that reaches the screen
 * (src/ui/canvas/GraphicalGenotypeRenderer.ts); its DEFAULT_THEME and
 * DEFAULT_LAYOUT exist for the self-contained HTML report and for Node
 * callers, and they are also the fallbacks here.
 *
 * Every read degrades rather than fails. A token that is absent (an element
 * outside the app root, a stylesheet that has not loaded yet) or whose value
 * does not parse as a number falls back to the corresponding DEFAULT_*
 * field, so a missing token costs the canvas its tokenised value and
 * nothing else: never NaN geometry, never an empty fillStyle. A negative
 * length is treated as unparseable, and the two heights additionally reject
 * zero, since a zero row height would draw nothing; the gaps may legitimately
 * be zero.
 *
 * getComputedStyle resolves a custom property through its var() chain, so
 * --color-canvas-label comes back as the ramp step's hex, not as
 * "var(--neutral-12)". This cannot be exercised in Node (the tests run with
 * environment: 'node' and there is no getComputedStyle), which is why it is
 * this short: it is reviewed, not tested. Browser-mode coverage is M3.
 *
 * Interface:
 *   readRendererTheme(el) -> RendererTheme
 *   readRendererLayout(el) -> RendererLayout
 *   readOverviewHeight(el) -> number
 */
import { DEFAULT_LAYOUT, DEFAULT_THEME } from './GraphicalGenotypeRenderer.ts';
import type { RendererLayout, RendererTheme } from './GraphicalGenotypeRenderer.ts';

function readString(style: CSSStyleDeclaration, name: string, fallback: string): string {
  const raw = style.getPropertyValue(name).trim();
  return raw === '' ? fallback : raw;
}

function readPx(
  style: CSSStyleDeclaration,
  name: string,
  fallback: number,
  positive = false,
): number {
  const raw = style.getPropertyValue(name).trim();
  if (raw === '') return fallback;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value < 0) return fallback;
  if (positive && value === 0) return fallback;
  return value;
}

/** The canvas font and colours, from --text-xs, --font-sans and the three --color-* tokens. */
export function readRendererTheme(el: Element): RendererTheme {
  const style = getComputedStyle(el);
  const size = style.getPropertyValue('--text-xs').trim();
  const family = style.getPropertyValue('--font-sans').trim();
  return {
    font: size === '' || family === '' ? DEFAULT_THEME.font : `${size} ${family}`,
    labelColor: readString(style, '--color-canvas-label', DEFAULT_THEME.labelColor),
    overlayFill: readString(style, '--color-overlay-fill', DEFAULT_THEME.overlayFill),
    overlayStroke: readString(style, '--color-overlay-stroke', DEFAULT_THEME.overlayStroke),
  };
}

/**
 * The canvas geometry, from the three --canvas-* tokens and --gutter-width.
 * labelWidth is the gutter's width because the two are the same column: the
 * report draws the line names inside the canvas at that width, while the
 * screen draws them as HTML beside it and overrides labelWidth to 0.
 */
export function readRendererLayout(el: Element): RendererLayout {
  const style = getComputedStyle(el);
  return {
    rowHeight: readPx(style, '--canvas-row-height', DEFAULT_LAYOUT.rowHeight, true),
    rowGap: readPx(style, '--canvas-row-gap', DEFAULT_LAYOUT.rowGap),
    chromGap: readPx(style, '--canvas-chrom-gap', DEFAULT_LAYOUT.chromGap),
    labelWidth: readPx(style, '--gutter-width', DEFAULT_LAYOUT.labelWidth),
  };
}

/**
 * The overview canvas's height in CSS pixels, from --overview-height. It
 * lives here rather than in the screen so that the screen holds no
 * dimension of its own to fall back to: this file and the renderer's
 * DEFAULT_LAYOUT are the only places outside tokens.css that name one.
 */
const DEFAULT_OVERVIEW_HEIGHT = 48;

export function readOverviewHeight(el: Element): number {
  return readPx(getComputedStyle(el), '--overview-height', DEFAULT_OVERVIEW_HEIGHT, true);
}
