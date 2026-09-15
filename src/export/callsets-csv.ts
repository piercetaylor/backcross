/**
 * Call-set table CSV (docs/data-formats.md, "Call-set table CSV").
 *
 * Responsibility: serialize a BrAPI variant set's call sets, in /callsets
 * order, as `sample_id,call_set_name,call_set_db_id,sample_db_id`, so a
 * samples.csv can be written from the ids the server actually uses. Built on
 * the main thread from the 'brapiCallSets' worker result; it names no marker
 * and no genotype. Every cell goes through csvField; LF line ends and a
 * trailing newline.
 *
 * Interface: CALLSETS_CSV_HEADER; callSetsCsv(callSets) -> string.
 */
import type { BrapiCallSet } from '../io/brapi.ts';
import { csvField } from './csv-field.ts';

export const CALLSETS_CSV_HEADER = [
  'sample_id',
  'call_set_name',
  'call_set_db_id',
  'sample_db_id',
] as const;

export function callSetsCsv(callSets: BrapiCallSet[]): string {
  const rows = callSets.map((c) =>
    [c.sampleId, c.callSetName, c.callSetDbId, c.sampleDbId].map(csvField).join(','),
  );
  return [CALLSETS_CSV_HEADER.join(','), ...rows].join('\n') + '\n';
}
