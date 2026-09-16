/**
 * Delimited-text parsing.
 *
 * Responsibility: turn CSV/TSV text into rows of strings following RFC 4180
 * quoting (double quotes, doubled quotes inside quoted fields, CRLF or LF line
 * ends), with delimiter sniffing between comma and tab. No type coercion; the
 * caller validates columns. Used by samples.csv, markers.csv and the wide
 * genotype CSV. Large wide matrices are parsed line by line through
 * `forEachRow` to avoid materializing an array of arrays. Blank lines and
 * rows whose every field is blank are skipped; `#` is data; a quoted field
 * may span lines (contract 1.3.0).
 *
 * Interface: sniffDelimiter(text), parseDelimited(text, delimiter?) -> string[][],
 * forEachRow(text, delimiter, callback), splitHeader(row) helpers.
 */

export type Delimiter = ',' | '\t';

/** A line that is empty or holds only spaces and tabs (contract 1.3.0). */
const BLANK_LINE = /^[ \t]*$/;

/** Sniffs from the first line that is not blank; all-blank text sniffs ','. */
export function sniffDelimiter(text: string): Delimiter {
  let start = 0;
  let firstLine = '';
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end === -1) end = text.length;
    let line = text.slice(start, end);
    if (line.endsWith('\r')) line = line.slice(0, -1);
    start = end + 1;
    if (!BLANK_LINE.test(line)) {
      firstLine = line;
      break;
    }
  }
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return tabs > commas ? '\t' : ',';
}

/**
 * Quote state carried across physical lines by `scanLine`. A `"` opens a
 * quoted field only at the start of a field; anywhere else it is a literal
 * character, and text after a closing quote is appended to the field (as
 * Python's csv module reads it).
 */
interface ScanState {
  fields: string[];
  field: string;
  fieldStarted: boolean;
  inQuotes: boolean;
  quoteOpenLine: number;
}

/** Scans one physical line (its `\r\n` or `\n` removed) into `s`, continuing any open quoted field. */
function scanLine(line: string, lineNo: number, delimiter: Delimiter, s: ScanState): void {
  const n = line.length;
  for (let i = 0; i < n; i++) {
    const ch = line[i] as string;
    if (s.inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          s.field += '"';
          i++;
        } else {
          s.inQuotes = false;
        }
      } else {
        s.field += ch;
      }
    } else if (ch === delimiter) {
      s.fields.push(s.field);
      s.field = '';
      s.fieldStarted = false;
    } else if (ch === '"' && !s.fieldStarted) {
      s.inQuotes = true;
      s.fieldStarted = true;
      s.quoteOpenLine = lineNo;
    } else {
      s.field += ch;
      s.fieldStarted = true;
    }
  }
}

/** Parse one physical line; a quoted field left open at its end keeps the rest of the line. */
export function parseLine(line: string, delimiter: Delimiter): string[] {
  if (!line.includes('"')) return line.split(delimiter);
  const s: ScanState = {
    fields: [],
    field: '',
    fieldStarted: false,
    inQuotes: false,
    quoteOpenLine: 0,
  };
  scanLine(line, 1, delimiter, s);
  s.fields.push(s.field);
  return s.fields;
}

function isBlankRow(fields: string[]): boolean {
  for (const f of fields) if (!BLANK_LINE.test(f)) return false;
  return true;
}

/**
 * Iterate rows without building the full table. Blank lines and rows whose
 * every field is empty or only spaces and tabs are skipped; `#` is data; a
 * quoted field may span lines, and a line break inside it is read as `\n`
 * (contract 1.3.0). One linear pass: a physical line with no `"` outside an
 * open quoted field is split directly, any other line is scanned once with
 * the quote state carried to the next line. `lineNumber` is the row's first
 * physical line. A quoted field still open at the end of the text throws,
 * naming the physical line where it opened.
 */
export function forEachRow(
  text: string,
  delimiter: Delimiter,
  cb: (fields: string[], lineNumber: number) => void,
  fileLabel = 'delimited text',
): void {
  const n = text.length;
  const s: ScanState = {
    fields: [],
    field: '',
    fieldStarted: false,
    inQuotes: false,
    quoteOpenLine: 0,
  };
  let start = 0;
  let lineNo = 0;
  let rowLine = 0;
  while (start < n) {
    let end = text.indexOf('\n', start);
    if (end === -1) end = n;
    let line = text.slice(start, end);
    if (line.endsWith('\r')) line = line.slice(0, -1);
    start = end + 1;
    lineNo++;
    if (s.inQuotes) {
      s.field += '\n';
    } else {
      rowLine = lineNo;
      if (!line.includes('"')) {
        const fields = line.split(delimiter);
        if (!isBlankRow(fields)) cb(fields, rowLine);
        continue;
      }
      s.fields = [];
      s.field = '';
      s.fieldStarted = false;
    }
    scanLine(line, lineNo, delimiter, s);
    if (!s.inQuotes) {
      s.fields.push(s.field);
      if (!isBlankRow(s.fields)) cb(s.fields, rowLine);
    }
  }
  if (s.inQuotes) {
    throw new Error(
      `${fileLabel} line ${s.quoteOpenLine}: unterminated quoted field (a quote opened here is never closed)`,
    );
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
