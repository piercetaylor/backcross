/**
 * Provenance columns shared by every per-line and pairwise CSV export and the report.
 *
 * Responsibility: name and serialise the facts every export records
 * (docs/data-formats.md, 'Outputs'): the token profile (1.4.0), the crop
 * (1.5.0), and from M5 the tool stamp (docs/adr/0030): `tool`,
 * `tool_version`, `tool_commit`, constant on every row so a table names the
 * software that wrote it. The columns are appended last on every row, so a
 * reader that picks the earlier columns by position is unaffected.
 *
 * Interface: ExportProvenance, provenanceHeader(p) -> string[]
 * (['token_profile'], plus 'crop' when defined, then 'tool', 'tool_version',
 * 'tool_commit'), provenanceCells(p) -> string[] (csvField on each, same order).
 */
import { csvField } from './csv-field.ts';

export interface ExportProvenance {
  /** 'default', a built-in profile id, or `custom:<id>`. */
  tokenProfile: string;
  crop?: string;
  /** Always TOOL_NAME, 'backcross' (src/build-info.ts). */
  tool: string;
  /** package.json version stamped at build time; 'NA' when unknown. */
  toolVersion: string;
  /** 'g' + 7 hex of HEAD at build time, '-dirty' when tracked files differed; 'NA' when unknown. */
  toolCommit: string;
}

export function provenanceHeader(p: ExportProvenance): string[] {
  return [
    'token_profile',
    ...(p.crop === undefined ? [] : ['crop']),
    'tool',
    'tool_version',
    'tool_commit',
  ];
}

export function provenanceCells(p: ExportProvenance): string[] {
  return [
    p.tokenProfile,
    ...(p.crop === undefined ? [] : [p.crop]),
    p.tool,
    p.toolVersion,
    p.toolCommit,
  ].map(csvField);
}
