/**
 * Provenance columns shared by every per-line and pairwise CSV export and the report.
 *
 * Responsibility: name and serialise the facts about how the input was read
 * that every export records (docs/data-formats.md, "Outputs"): the token
 * profile (contract 1.4.0, docs/adr/0019), and from contract 1.5.0 the crop
 * chromosome scheme. The columns are appended last on every row, so a reader
 * that picks the earlier columns by position is unaffected.
 *
 * Interface: ExportProvenance, provenanceHeader(p) -> string[]
 * (['token_profile'], plus 'crop' when defined), provenanceCells(p) -> string[].
 */
import { csvField } from './csv-field.ts';

export interface ExportProvenance {
  /** 'default', a built-in profile id, or `custom:<id>`. */
  tokenProfile: string;
  crop?: string;
}

export function provenanceHeader(p: ExportProvenance): string[] {
  return p.crop === undefined ? ['token_profile'] : ['token_profile', 'crop'];
}

export function provenanceCells(p: ExportProvenance): string[] {
  return p.crop === undefined
    ? [csvField(p.tokenProfile)]
    : [csvField(p.tokenProfile), csvField(p.crop)];
}
