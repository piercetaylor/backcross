/**
 * The two external-id cells every export writes (docs/data-formats.md, "Outputs").
 *
 * Responsibility: look up the BrAPI `callSetDbId` and `sampleDbId` of a sample
 * (docs/adr/0015) and render them as CSV cells, written immediately after the
 * sample id column(s). A file-loaded dataset, or a sample id that is not in
 * `samples`, gets two empty cells, written bare (never `""`).
 *
 * Interface: externalIdCells(samples) -> (sampleId) => [callSetDbIdCell, sampleDbIdCell].
 */
import type { SampleRecord } from '../core/types.ts';
import { csvField } from './csv-field.ts';

/** The two cells every export writes after its sample id column(s): csvField(callSetDbId ?? ''), csvField(sampleDbId ?? ''). Unknown sample id -> two empty cells. */
export function externalIdCells(samples: SampleRecord[]): (sampleId: string) => [string, string] {
  const byId = new Map(samples.map((s) => [s.sampleId, s] as const));
  return (sampleId) => {
    const s = byId.get(sampleId);
    return [csvField(s?.callSetDbId ?? ''), csvField(s?.sampleDbId ?? '')];
  };
}
