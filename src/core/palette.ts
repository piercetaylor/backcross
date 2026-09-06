/**
 * Colorblind-safe palette for graphical genotypes.
 *
 * Responsibility: the single source of colors for every call class, used by
 * the canvas renderer, the legend, and the HTML report. Colors are from the
 * Okabe-Ito palette (Okabe and Ito 2008, Color Universal Design), chosen so
 * RP and donor remain distinguishable under deuteranopia and protanopia:
 * blue vs vermilion rather than green vs red.
 *
 * Interface: CLASS_COLORS, classColor(cls).
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
