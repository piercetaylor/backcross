/**
 * markers.csv parser (contract/data-contract.md, "markers.csv"). Optional input.
 *
 * Responsibility: read marker_id, chrom, pos_bp (position.ts, contract 1.2.0) and optional cm. Values
 * override the positions carried in the genotype file when they differ (the
 * genotype file may be positioned on another assembly); a mismatch count is
 * reported as a warning. Markers absent from the map keep their genotype-file
 * position and get cm = NaN.
 *
 * Interface: parseMarkerMap(text) -> MarkerMap; applyMarkerMap(markers, map) -> warnings[].
 */
import { normalizeChromosome } from '../core/chromosomes.ts';
import type { MarkerTable } from '../core/types.ts';
import { forEachRow, normalizeHeader, requireColumns, sniffDelimiter } from './csv.ts';
import { parsePosition } from './position.ts';

export interface MarkerMapEntry {
  chrom: string;
  posBp: number;
  cm: number;
}

export type MarkerMap = Map<string, MarkerMapEntry>;

export function parseMarkerMap(text: string): MarkerMap {
  const delimiter = sniffDelimiter(text);
  let header: string[] | null = null;
  let hasCm = false;
  const map: MarkerMap = new Map();
  forEachRow(text, delimiter, (f, lineNumber) => {
    if (header === null) {
      header = normalizeHeader(f);
      requireColumns(header, ['marker_id', 'chrom', 'pos_bp'], 'markers.csv');
      hasCm = header.includes('cm');
      return;
    }
    const h = header;
    const id = (f[h.indexOf('marker_id')] ?? '').trim();
    if (id === '') throw new Error(`markers.csv line ${lineNumber}: empty marker_id`);
    if (map.has(id)) throw new Error(`markers.csv line ${lineNumber}: duplicate marker_id ${id}`);
    const posBp = parsePosition(f[h.indexOf('pos_bp')] ?? '', `markers.csv line ${lineNumber}`);
    const cmRaw = hasCm ? (f[h.indexOf('cm')] ?? '').trim() : '';
    const cm = cmRaw === '' || cmRaw.toUpperCase() === 'NA' ? NaN : Number(cmRaw);
    map.set(id, { chrom: normalizeChromosome(f[h.indexOf('chrom')] as string), posBp, cm });
  });
  if (header === null) throw new Error('markers.csv: no header row');
  return map;
}

/** Mutates `markers` in place; returns human-readable warnings. */
export function applyMarkerMap(markers: MarkerTable, map: MarkerMap): string[] {
  const warnings: string[] = [];
  let moved = 0;
  let unmapped = 0;
  let anyCm = false;
  const cm = new Float64Array(markers.ids.length).fill(NaN);
  for (let m = 0; m < markers.ids.length; m++) {
    const e = map.get(markers.ids[m] as string);
    if (e === undefined) {
      unmapped++;
      continue;
    }
    if (e.chrom !== markers.chrom[m] || e.posBp !== markers.posBp[m]) {
      moved++;
      markers.chrom[m] = e.chrom;
      markers.posBp[m] = e.posBp;
    }
    if (!Number.isNaN(e.cm)) {
      anyCm = true;
      cm[m] = e.cm;
    }
  }
  if (anyCm) {
    markers.cm = cm;
    let noCm = 0;
    for (let m = 0; m < cm.length; m++) if (Number.isNaN(cm[m])) noCm++;
    if (noCm > 0)
      warnings.push(
        `markers.csv: ${noCm} marker(s) have no cM; donor-run breaking uses the bp gap for steps touching them (docs/adr/0008)`,
      );
  }
  if (moved > 0)
    warnings.push(
      `markers.csv: ${moved} marker position(s) differ from the genotype file; markers.csv used`,
    );
  if (unmapped > 0)
    warnings.push(
      `markers.csv: ${unmapped} genotype marker(s) not in the map; genotype-file positions kept`,
    );
  return warnings;
}
