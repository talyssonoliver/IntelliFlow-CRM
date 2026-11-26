/**
 * Row serialisation for the workspace export: JSON-safe values, CSV cells, line-wise writers.
 *
 * Values keep their meaning, not their Prisma type: dates are ISO-8601 UTC strings, BigInt and
 * Decimal are decimal strings (no precision loss), Json columns are scrubbed of secret-looking
 * keys and written as JSON text in CSV, and string arrays are written as JSON arrays in CSV.
 */
import { scrubJson, stripUrlSecrets } from './deny-list';

export type ExportRow = Record<string, unknown>;

function isDecimalLike(value: object): value is { toFixed(): string } {
  return (
    typeof (value as { toFixed?: unknown }).toFixed === 'function' &&
    typeof (value as { toNumber?: unknown }).toNumber === 'function'
  );
}

/** One column value as a JSON-safe value. */
export function toJsonValue(
  value: unknown,
  column: string,
  urlColumns: readonly string[]
): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') {
    return urlColumns.includes(column) ? stripUrlSecrets(value) : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'object') {
    if (isDecimalLike(value)) return value.toFixed();
    return scrubJson(
      JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))
    );
  }
  return String(value);
}

/** A whole row as a JSON-safe object with the columns in the given order. */
export function toJsonRow(
  row: ExportRow,
  columns: readonly string[],
  urlColumns: readonly string[] = []
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of columns) out[c] = toJsonValue(row[c], c, urlColumns);
  return out;
}

/** Decimal and BigInt columns are written as text; a refund such as -12.50 is a number. */
const PLAIN_NEGATIVE_NUMBER = /^-\d+(?:\.\d+)?$/;

/**
 * Excel turns "00123" into 123 and rounds past 15 significant digits. A text value that would
 * lose something that way gets the same leading apostrophe; the JSON keeps the exact text.
 */
function losesPrecisionInSpreadsheet(text: string): boolean {
  if (/^0\d+$/.test(text)) return true;
  const m = /^-?(\d+)(?:\.(\d+))?$/.exec(text);
  return m !== null && (m[1]! + (m[2] ?? '')).replace(/^0+/, '').length > 15;
}

/** RFC 4180 cell: quoted when it holds a comma, quote, CR or LF; quotes doubled. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  // Spreadsheet formula injection: text that other people typed (leads, bookings, tickets, chat)
  // must not run when an administrator opens the CSV. Numbers and booleans are not text.
  if (
    (typeof value === 'string' || typeof value === 'bigint') &&
    ((/^[=+\-@\t\r\n]/.test(text) && !PLAIN_NEGATIVE_NUMBER.test(text)) ||
      losesPrecisionInSpreadsheet(text))
  ) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function csvHeader(columns: readonly string[]): string {
  return columns.map(csvCell).join(',') + '\r\n';
}

export function csvLine(jsonRow: Record<string, unknown>, columns: readonly string[]): string {
  return columns.map((c) => csvCell(jsonRow[c])).join(',') + '\r\n';
}
