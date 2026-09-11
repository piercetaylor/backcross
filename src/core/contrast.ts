/**
 * WCAG 2.x relative luminance and contrast ratio.
 *
 * Responsibility: the arithmetic behind every contrast claim in the design
 * tokens and, from phase 3, behind the choice of overlay ink on a class
 * colour. Pure: no DOM, no colour parsing beyond six-digit hex.
 *
 * Definitions are WCAG 2.x verbatim. Each channel is scaled to [0, 1], then
 * linearised with c / 12.92 below the 0.03928 knee and ((c + 0.055) / 1.055)
 * ** 2.4 above it; luminance is 0.2126 R + 0.7152 G + 0.0722 B. The ratio is
 * (Lighter + 0.05) / (Darker + 0.05), so it lies in [1, 21].
 *
 * Input is six-digit `#RRGGBB` only, upper or lower case. Three-digit
 * shorthand, eight-digit alpha, `rgb()` and named colours throw rather than
 * being guessed at, because a silently mis-parsed colour would make a
 * contrast assertion pass for the wrong reason.
 *
 * Interface: relativeLuminance(hex), contrastRatio(a, b).
 */

const HEX6 = /^#[0-9a-fA-F]{6}$/;

/** Linearise one 0-255 sRGB channel to its light-linear value (WCAG 2.x). */
function linearise(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * WCAG 2.x relative luminance of a six-digit hex colour, in [0, 1].
 *
 * @throws {TypeError} if `hex` is not `#RRGGBB`.
 */
export function relativeLuminance(hex: string): number {
  if (!HEX6.test(hex)) {
    throw new TypeError(`relativeLuminance expects a six-digit #RRGGBB colour, got ${hex}`);
  }
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

/**
 * WCAG 2.x contrast ratio between two six-digit hex colours, in [1, 21].
 * Symmetric: the lighter colour is determined from the luminances.
 *
 * @throws {TypeError} if either argument is not `#RRGGBB`.
 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
