/**
 * Delimited-text parsing.
 *
 * Responsibility: turn CSV/TSV text into rows of strings following RFC 4180
 * quoting (double quotes, doubled quotes inside quoted fields, CRLF or LF line
 * ends), with delimiter sniffing between comma and tab. No type coercion; the
 * caller validates columns. Used by samples.csv, markers.csv and the wide
 * genotype CSV. Large wide matrices are parsed line by line through
 * `forEachRow` to avoid materializing an array of arrays.
 *
 * Interface: sniffDelimiter(text), parseDelimited(text, delimiter?) -> string[][],
 * forEachRow(text, delimiter, callback), splitHeader(row) helpers.
 */

export type Delimiter = ',' | '\t';

export function sniffDelimiter(text: string): Delimiter {
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return tabs > commas ? '\t' : ',';
}

/** Parse one physical line that is known not to contain quoted newlines. */
export function parseLine(line: string, delimiter: Delimiter): string[] {
  if (!line.includes('"')) {
    return line.split(delimiter);
  }
  const out: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

/**
 * Iterate rows without building the full table. Blank lines and lines starting
 * with '#' are skipped. Quoted fields must not contain line breaks.
 */
export function forEachRow(
  text: string,
  delimiter: Delimiter,
  cb: (fields: string[], lineNumber: number) => void,
): void {
  let start = 0;
  let lineNumber = 0;
  const n = text.length;
  while (start < n) {
    let end = text.indexOf('\n', start);
    if (end === -1) end = n;
    let line = text.slice(start, end);
    if (line.endsWith('\r')) line = line.slice(0, -1);
    start = end + 1;
    lineNumber++;
    if (line.length === 0 || line.startsWith('#')) continue;
    cb(parseLine(line, delimiter), lineNumber);
  }
}

export function parseDelimited(text: string, delimiter?: Delimiter): string[][] {
  const d = delimiter ?? sniffDelimiter(text);
  const rows: string[][] = [];
  forEachRow(text, d, (fields) => rows.push(fields));
  return rows;
}

/** Lower-cased, trimmed header names for case-insensitive column lookup. */
export function normalizeHeader(fields: string[]): string[] {
  return fields.map((f) =>
    f
      .trim()
      .replace(/^\uFEFF/, '')
      .toLowerCase(),
  );
}

export function requireColumns(header: string[], required: string[], fileLabel: string): void {
  const missing = required.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    throw new Error(`${fileLabel}: missing required column(s): ${missing.join(', ')}`);
  }
}
