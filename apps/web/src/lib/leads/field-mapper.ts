/**
 * Lead CSV import — pure parse / map / sanitise / validate (PG-063).
 *
 * No React, no I/O. The component (`csv-importer.tsx`) reads the file and renders;
 * every decision about *what* a CSV row becomes — and whether it is safe and valid
 * to import — lives here so it is unit-tested in one place.
 *
 * Security model (spec §4):
 *  - Formula injection: a FREE-TEXT cell starting with `= + - @ \t \r` is
 *    REJECTED as a row-level error (never stored, never `'`-prefixed, never
 *    silently altered) — so a malicious cell can't be written and later replayed
 *    through the (separately tracked) unguarded export path.
 *  - email / phone are NOT free-text: a `=`/`@` email fails `emailSchema` and a
 *    `=HYPERLINK` phone fails `phoneSchema` (surfaced as a row error), while a
 *    valid `+44…` phone is preserved.
 *  - Every row is validated against `createLeadSchema` — the SAME schema the
 *    server re-applies. The importer sends the RAW string record (this module's
 *    output), never the parsed Zod output, so `phoneSchema`'s string→PhoneNumber
 *    Value Object transform runs server-side and no VO is serialised over tRPC.
 */

import { createLeadSchema } from '@intelliflow/validators';

/** Hard cap on data rows; a larger file is rejected whole (never truncated). */
export const MAX_IMPORT_ROWS = 1000;
/** Hard cap on raw file size, checked before reading (2 MiB). */
export const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;

/** OWASP CSV-injection lead characters (incl. TAB 0x09 and CR 0x0D). */
export const FORMULA_INJECTION_RE = /^[=+\-@\t\r]/;

/** True when a free-text value would be interpreted as a formula by a spreadsheet. */
export function hasFormulaInjectionRisk(value: string): boolean {
  return value.length > 0 && FORMULA_INJECTION_RE.test(value);
}

export type LeadImportField =
  | 'email'
  | 'firstName'
  | 'lastName'
  | 'company'
  | 'title'
  | 'phone'
  | 'source'
  | 'website';

export interface LeadImportFieldDef {
  key: LeadImportField;
  label: string;
  required: boolean;
  /** Stored as free text → subject to the formula-injection guard. */
  freeText: boolean;
  /** Normalised against CSV headers for auto-detection. */
  aliases: string[];
}

/**
 * The importable subset of `createLeadSchema`, kept consistent with the create
 * form (`NewLeadForm`): email + the six contact/company fields + source.
 * estimatedValue / tags / location are intentionally out of scope (spec §3).
 */
export const LEAD_IMPORT_FIELDS: readonly LeadImportFieldDef[] = [
  {
    key: 'email',
    label: 'Email',
    required: true,
    freeText: false,
    aliases: ['email', 'e-mail', 'email address', 'mail'],
  },
  {
    key: 'firstName',
    label: 'First Name',
    required: false,
    freeText: true,
    aliases: ['first name', 'firstname', 'first', 'given name', 'fname'],
  },
  {
    key: 'lastName',
    label: 'Last Name',
    required: false,
    freeText: true,
    aliases: ['last name', 'lastname', 'last', 'surname', 'family name', 'lname'],
  },
  {
    key: 'company',
    label: 'Company',
    required: false,
    freeText: true,
    aliases: ['company', 'organisation', 'organization', 'org', 'business', 'account'],
  },
  {
    key: 'title',
    label: 'Job Title',
    required: false,
    freeText: true,
    aliases: ['title', 'job title', 'jobtitle', 'position', 'role'],
  },
  {
    key: 'phone',
    label: 'Phone',
    required: false,
    freeText: false,
    aliases: ['phone', 'phone number', 'telephone', 'tel', 'mobile', 'cell'],
  },
  {
    key: 'source',
    label: 'Source',
    required: false,
    freeText: false,
    aliases: ['source', 'lead source', 'channel'],
  },
  {
    key: 'website',
    label: 'Website',
    required: false,
    freeText: true,
    aliases: ['website', 'web site', 'url', 'web', 'site', 'homepage'],
  },
] as const;

const FREE_TEXT_FIELDS = LEAD_IMPORT_FIELDS.filter((f) => f.freeText);

/** field → column index in the parsed CSV. */
export type ColumnMapping = Partial<Record<LeadImportField, number>>;

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  /** 1-based physical CSV line each data row starts on (parallel to `rows`). */
  rowLines: number[];
}

/** Raw-string payload sent to `api.lead.create` (never the parsed Zod output). */
export interface LeadImportRecord {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
  phone?: string;
  source?: string;
  website?: string;
}

export type RowValidation = { ok: true } | { ok: false; errors: string[] };

export interface RowResult {
  /** 0-based index into `ParsedCsv.rows`. */
  index: number;
  /** 1-based physical CSV line (header = line 1), for accurate row-error reporting. */
  line: number;
  record: LeadImportRecord;
  validation: RowValidation;
}

// ---------------------------------------------------------------------------
// RFC-4180 parser
// ---------------------------------------------------------------------------

/**
 * Read a quoted field starting at `start` (the char after the opening quote).
 * Doubled quotes (`""`) become a literal `"`; the first lone `"` ends the field.
 * Returns the field text and the index just past the closing quote (or EOF for
 * an unterminated quote).
 */
function readQuotedField(input: string, start: number): { value: string; next: number } {
  let value = '';
  let i = start;
  while (i < input.length) {
    const ch = input[i];
    if (ch !== '"') {
      value += ch;
      i++;
    } else if (input[i + 1] === '"') {
      value += '"';
      i += 2;
    } else {
      return { value, next: i + 1 };
    }
  }
  return { value, next: i };
}

/** Count line terminators in a string (for keeping physical line numbers accurate). */
function countNewlines(value: string): number {
  return value.split('\n').length - 1;
}

/**
 * Parse CSV text into headers + data rows. Handles quoted fields with embedded
 * commas/newlines, doubled-quote escapes (`""`), CRLF/LF line endings, and a
 * leading UTF-8 BOM. Fully-empty lines are skipped. The first non-empty record
 * is the header row.
 */
export function parseCsv(text: string): ParsedCsv {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: Array<{ cells: string[]; line: number }> = [];
  let field = '';
  let row: string[] = [];
  let started = false; // a field or row is in progress (distinguishes "" from EOF)
  let atFieldStart = true; // true only at the first char of a field (RFC-4180 quoting)
  let lineNo = 1; // 1-based physical line currently being read
  let recordStartLine = 1; // physical line the in-progress record started on

  const endField = () => {
    row.push(field);
    field = '';
    atFieldStart = true;
  };
  const endRow = () => {
    endField();
    records.push({ cells: row, line: recordStartLine });
    row = [];
    started = false;
  };

  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    // A `"` only opens a quoted field at the START of a field. A `"` mid-field is
    // a literal char (handled by the else branch), so `Acme "R&D"` is preserved
    // verbatim instead of being silently truncated/realigned.
    if (ch === '"' && atFieldStart) {
      const quoted = readQuotedField(input, i + 1);
      field += quoted.value;
      lineNo += countNewlines(quoted.value); // embedded newlines inside the quoted field
      i = quoted.next;
      started = true;
      atFieldStart = false;
    } else if (ch === ',') {
      endField();
      started = true;
      i++;
    } else if (ch === '\n') {
      endRow();
      i++;
      lineNo++;
      recordStartLine = lineNo;
    } else if (ch === '\r') {
      endRow();
      i += input[i + 1] === '\n' ? 2 : 1;
      lineNo++;
      recordStartLine = lineNo;
    } else {
      field += ch;
      started = true;
      atFieldStart = false;
      i++;
    }
  }
  if (started || field.length > 0 || row.length > 0) {
    endRow();
  }

  const nonEmpty = records.filter((r) => !(r.cells.length === 1 && r.cells[0].trim() === ''));
  if (nonEmpty.length === 0) return { headers: [], rows: [], rowLines: [] };
  const [header, ...data] = nonEmpty;
  return {
    headers: header.cells.map((h) => h.trim()),
    rows: data.map((d) => d.cells),
    rowLines: data.map((d) => d.line),
  };
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function normaliseHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Best-effort header→field auto-detection. Headers are normalised
 * (lowercased, non-alphanumerics stripped) and matched against each field's
 * normalised aliases. Earlier fields (email first) win a contested column, and
 * a column is never assigned to two fields.
 */
export function autoDetectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const normHeaders = headers.map(normaliseHeader);
  const used = new Set<number>();
  for (const def of LEAD_IMPORT_FIELDS) {
    const normAliases = new Set(def.aliases.map(normaliseHeader));
    const idx = normHeaders.findIndex((h, i) => !used.has(i) && h.length > 0 && normAliases.has(h));
    if (idx >= 0) {
      mapping[def.key] = idx;
      used.add(idx);
    }
  }
  return mapping;
}

function cellAt(row: string[], idx: number | undefined): string {
  if (idx === undefined || idx < 0 || idx >= row.length) return '';
  return (row[idx] ?? '').trim();
}

/**
 * Normalise a CSV source label to the `LEAD_SOURCES` enum shape: upper-case and
 * collapse every run of non-alphanumerics to a single `_` so "Cold Call",
 * "cold-call" and "COLD_CALL" all map to `COLD_CALL` (rather than the invalid
 * `COLD CALL` a bare upper-case would produce). Truly unknown values stay
 * non-matching and are surfaced as a row error by {@link validateLeadRow}.
 */
function normaliseSource(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .split(/[^A-Z0-9]/)
    .filter(Boolean)
    .join('_');
}

/**
 * Build the raw create payload from a CSV row + mapping. Values are trimmed;
 * `source` is normalised to the enum shape; empty optionals are omitted (so the
 * server default applies). No value is mutated/prefixed — the formula-injection
 * guard lives in {@link validateLeadRow}.
 */
export function mapRowToLeadInput(row: string[], mapping: ColumnMapping): LeadImportRecord {
  const get = (field: LeadImportField) => cellAt(row, mapping[field]);
  const record: LeadImportRecord = { email: get('email') };

  const firstName = get('firstName');
  if (firstName) record.firstName = firstName;
  const lastName = get('lastName');
  if (lastName) record.lastName = lastName;
  const company = get('company');
  if (company) record.company = company;
  const title = get('title');
  if (title) record.title = title;
  const phone = get('phone');
  if (phone) record.phone = phone;
  const website = get('website');
  if (website) record.website = website;
  const source = get('source');
  if (source) {
    const normalised = normaliseSource(source);
    if (normalised) record.source = normalised;
  }

  return record;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a mapped record. Returns ok/errors ONLY — never the parsed output
 * (the importer sends the raw `record`, not the schema's VO-bearing output).
 * Formula-injection on a free-text field is rejected as an error before the
 * schema runs so the user sees the security reason explicitly.
 */
export function validateLeadRow(record: LeadImportRecord): RowValidation {
  const errors: string[] = [];

  for (const def of FREE_TEXT_FIELDS) {
    const value = record[def.key];
    if (typeof value === 'string' && hasFormulaInjectionRisk(value)) {
      errors.push(
        `${def.label} starts with a disallowed character (= + - @) — possible formula injection`
      );
    }
  }

  const parsed = createLeadSchema.safeParse(record);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.') || 'row';
      errors.push(`${path}: ${issue.message}`);
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/** Map + validate every data row (the component renders these directly). */
export function buildRowResults(parsed: ParsedCsv, mapping: ColumnMapping): RowResult[] {
  return parsed.rows.map((row, index) => {
    const record = mapRowToLeadInput(row, mapping);
    return {
      index,
      line: parsed.rowLines[index] ?? index + 2,
      record,
      validation: validateLeadRow(record),
    };
  });
}
