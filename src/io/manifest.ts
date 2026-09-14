/**
 * samples.csv parser and validator (contract/data-contract.md, "samples.csv").
 *
 * Responsibility: read sample_id, line_name, role, generation, family_id,
 * notes; enforce exactly one recurrent_parent and one donor_parent; reject
 * unknown roles and duplicate sample ids. Column names are case-insensitive;
 * line_name defaults to sample_id; family_id and notes default to "".
 *
 * Interface: parseSampleManifest(text) -> SampleRecord[].
 */
import type { SampleRecord, SampleRole } from '../core/types.ts';
import { forEachRow, normalizeHeader, requireColumns, sniffDelimiter } from './csv.ts';

const ROLES: ReadonlySet<string> = new Set([
  'recurrent_parent',
  'donor_parent',
  'candidate',
  'progeny',
]);

export function parseSampleManifest(text: string): SampleRecord[] {
  const delimiter = sniffDelimiter(text);
  let header: string[] | null = null;
  const out: SampleRecord[] = [];
  const ids = new Set<string>();

  forEachRow(text, delimiter, (f, lineNumber) => {
    if (header === null) {
      header = normalizeHeader(f);
      requireColumns(header, ['sample_id', 'role'], 'samples.csv');
      return;
    }
    const get = (name: string): string => {
      const i = (header as string[]).indexOf(name);
      return i === -1 ? '' : (f[i] ?? '').trim();
    };
    const sampleId = get('sample_id');
    if (sampleId === '') throw new Error(`samples.csv line ${lineNumber}: empty sample_id`);
    if (ids.has(sampleId))
      throw new Error(`samples.csv line ${lineNumber}: duplicate sample_id ${sampleId}`);
    ids.add(sampleId);
    const role = get('role').toLowerCase();
    if (!ROLES.has(role)) {
      throw new Error(
        `samples.csv line ${lineNumber}: role "${role}" is not one of recurrent_parent, donor_parent, candidate, progeny`,
      );
    }
    const lineName = get('line_name');
    out.push({
      sampleId,
      lineName: lineName === '' ? sampleId : lineName,
      role: role as SampleRole,
      generation: get('generation'),
      familyId: get('family_id'),
      notes: get('notes'),
    });
  });

  if (header === null) throw new Error('samples.csv: no header row');
  const nRp = out.filter((s) => s.role === 'recurrent_parent').length;
  const nDonor = out.filter((s) => s.role === 'donor_parent').length;
  if (nRp !== 1)
    throw new Error(`samples.csv: expected exactly one recurrent_parent, found ${nRp}`);
  if (nDonor !== 1)
    throw new Error(`samples.csv: expected exactly one donor_parent, found ${nDonor}`);
  if (out.length === 2) throw new Error('samples.csv: no candidate or progeny samples');
  return out;
}
