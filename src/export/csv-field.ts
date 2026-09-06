/**
 * CSV cell quoting shared by the exporters.
 *
 * Responsibility: quote a free-text cell (sample ids, chromosome names, target
 * names all come from user files) only when RFC 4180 requires it, so the
 * common case stays byte-identical to the unquoted form that R and
 * spreadsheets read without options.
 *
 * Interface: csvField(text) -> string.
 */
export function csvField(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
