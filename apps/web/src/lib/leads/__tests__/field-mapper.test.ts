import { describe, it, expect } from 'vitest';
import {
  MAX_IMPORT_ROWS,
  MAX_IMPORT_FILE_BYTES,
  hasFormulaInjectionRisk,
  LEAD_IMPORT_FIELDS,
  parseCsv,
  autoDetectMapping,
  mapRowToLeadInput,
  validateLeadRow,
  buildRowResults,
  type ColumnMapping,
} from '../field-mapper';

describe('field-mapper: constants', () => {
  it('exposes the documented caps', () => {
    expect(MAX_IMPORT_ROWS).toBe(1000);
    expect(MAX_IMPORT_FILE_BYTES).toBe(2 * 1024 * 1024);
  });

  it('marks email required and the contact fields as free-text/typed correctly', () => {
    const byKey = Object.fromEntries(LEAD_IMPORT_FIELDS.map((f) => [f.key, f]));
    expect(byKey.email.required).toBe(true);
    expect(byKey.email.freeText).toBe(false);
    expect(byKey.phone.freeText).toBe(false);
    expect(byKey.source.freeText).toBe(false);
    for (const k of ['firstName', 'lastName', 'company', 'title', 'website'] as const) {
      expect(byKey[k].freeText).toBe(true);
    }
  });
});

describe('field-mapper: hasFormulaInjectionRisk', () => {
  it.each(['=cmd', '+1+1', '-2', '@SUM', '\tx', '\rx'])('flags %j', (v) => {
    expect(hasFormulaInjectionRisk(v)).toBe(true);
  });

  it.each(['', 'Acme', 'john@x.com', 'a=b', ' =safe-leading-space'])('allows %j', (v) => {
    expect(hasFormulaInjectionRisk(v)).toBe(false);
  });
});

describe('field-mapper: parseCsv (RFC-4180)', () => {
  it('parses headers + simple rows', () => {
    const { headers, rows } = parseCsv('email,first\na@x.com,Ann\nb@x.com,Bob');
    expect(headers).toEqual(['email', 'first']);
    expect(rows).toEqual([
      ['a@x.com', 'Ann'],
      ['b@x.com', 'Bob'],
    ]);
  });

  it('handles quoted fields with embedded commas', () => {
    const { rows } = parseCsv('email,company\na@x.com,"Acme, Inc."');
    expect(rows[0]).toEqual(['a@x.com', 'Acme, Inc.']);
  });

  it('handles quoted fields with embedded newlines', () => {
    const { rows } = parseCsv('email,note\na@x.com,"line1\nline2"');
    expect(rows[0]).toEqual(['a@x.com', 'line1\nline2']);
  });

  it('handles doubled-quote escapes', () => {
    const { rows } = parseCsv('email,note\na@x.com,"She said ""hi"""');
    expect(rows[0]).toEqual(['a@x.com', 'She said "hi"']);
  });

  it('handles CRLF line endings', () => {
    const { headers, rows } = parseCsv('email,first\r\na@x.com,Ann\r\n');
    expect(headers).toEqual(['email', 'first']);
    expect(rows).toEqual([['a@x.com', 'Ann']]);
  });

  it('strips a leading UTF-8 BOM', () => {
    const { headers } = parseCsv('﻿email,first\na@x.com,Ann');
    expect(headers).toEqual(['email', 'first']);
  });

  it('skips fully-empty lines (blank rows)', () => {
    const { rows } = parseCsv('email\n\na@x.com\n\n');
    expect(rows).toEqual([['a@x.com']]);
  });

  it('keeps ragged rows (shorter than the header)', () => {
    const { rows } = parseCsv('email,first,last\na@x.com,Ann');
    expect(rows).toEqual([['a@x.com', 'Ann']]);
  });

  it('keeps a trailing empty field after a comma', () => {
    const { rows } = parseCsv('a,b,c\n1,2,');
    expect(rows[0]).toEqual(['1', '2', '']);
  });

  it('returns empty headers/rows for empty input', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [], rowLines: [] });
    expect(parseCsv('﻿')).toEqual({ headers: [], rows: [], rowLines: [] });
  });

  it('tracks physical line numbers, skipping blank lines (accurate row errors)', () => {
    // header(1), a@x.com(2), blank(3 dropped), missing-email(4)
    const { rows, rowLines } = parseCsv('email\na@x.com\n\nmissing-email-row');
    expect(rows).toEqual([['a@x.com'], ['missing-email-row']]);
    expect(rowLines).toEqual([2, 4]);
  });

  it('keeps line numbers correct across a quoted embedded newline', () => {
    // header(1), row spanning lines 2-3, next row on line 4
    const { rows, rowLines } = parseCsv('email,note\na@x.com,"l1\nl2"\nb@x.com,n');
    expect(rows).toEqual([
      ['a@x.com', 'l1\nl2'],
      ['b@x.com', 'n'],
    ]);
    expect(rowLines).toEqual([2, 4]);
  });
});

describe('field-mapper: autoDetectMapping', () => {
  it('maps common header variants case/space/punctuation-insensitively', () => {
    const m = autoDetectMapping([
      'E-Mail',
      'First Name',
      'Surname',
      'Org',
      'Job Title',
      'Mobile',
      'Lead Source',
      'URL',
    ]);
    expect(m).toEqual({
      email: 0,
      firstName: 1,
      lastName: 2,
      company: 3,
      title: 4,
      phone: 5,
      source: 6,
      website: 7,
    });
  });

  it('leaves unmatched fields absent', () => {
    const m = autoDetectMapping(['Email', 'Random Column']);
    expect(m.email).toBe(0);
    expect(m.firstName).toBeUndefined();
  });

  it('never assigns one column to two fields', () => {
    const m = autoDetectMapping(['email', 'email']);
    expect(m.email).toBe(0);
    // second identical header is unused, not double-mapped
    expect(Object.values(m).filter((v) => v === 1)).toHaveLength(0);
  });
});

describe('field-mapper: mapRowToLeadInput', () => {
  const mapping: ColumnMapping = {
    email: 0,
    firstName: 1,
    company: 2,
    phone: 3,
    source: 4,
    website: 5,
  };

  it('builds a trimmed record and omits empty optionals', () => {
    const rec = mapRowToLeadInput(['  a@x.com ', 'Ann', '', '+44 20 7946 0958', '', ''], mapping);
    expect(rec).toEqual({ email: 'a@x.com', firstName: 'Ann', phone: '+44 20 7946 0958' });
  });

  it('uppercases the source cell to match the LEAD_SOURCES enum', () => {
    const rec = mapRowToLeadInput(['a@x.com', '', '', '', 'website', ''], mapping);
    expect(rec.source).toBe('WEBSITE');
  });

  it('normalises a spaced/hyphenated source label to the enum shape (Cold Call → COLD_CALL)', () => {
    expect(mapRowToLeadInput(['a@x.com', '', '', '', 'Cold Call', ''], mapping).source).toBe(
      'COLD_CALL'
    );
    expect(mapRowToLeadInput(['a@x.com', '', '', '', 'cold-call', ''], mapping).source).toBe(
      'COLD_CALL'
    );
    // and the normalised value is accepted by the schema (not rejected as invalid)
    expect(validateLeadRow({ email: 'a@x.com', source: 'COLD_CALL' })).toEqual({ ok: true });
  });

  it('does not mutate or prefix free-text values', () => {
    const rec = mapRowToLeadInput(['a@x.com', '=danger', 'Acme', '', '', ''], mapping);
    expect(rec.firstName).toBe('=danger'); // guarded at validation, not mutated here
  });

  it('returns email as empty string when unmapped (out-of-range safe)', () => {
    const rec = mapRowToLeadInput([], { email: 9 });
    expect(rec.email).toBe('');
  });
});

describe('field-mapper: validateLeadRow', () => {
  it('accepts a valid row', () => {
    expect(validateLeadRow({ email: 'a@x.com', firstName: 'Ann' })).toEqual({ ok: true });
  });

  it('accepts a lowercase source after uppercasing maps it', () => {
    expect(validateLeadRow({ email: 'a@x.com', source: 'WEBSITE' })).toEqual({ ok: true });
  });

  it('rejects a missing email', () => {
    const v = validateLeadRow({ email: '' });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors.join(' ')).toMatch(/email/i);
  });

  it('rejects a malformed email (incl. a formula-looking one)', () => {
    const v = validateLeadRow({ email: '=cmd@x.com' });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors.join(' ')).toMatch(/email/i);
  });

  it('rejects a formula-injection free-text cell with a security message (website)', () => {
    const v = validateLeadRow({ email: 'a@x.com', website: '=SUM(A1)' });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors.some((e) => /formula injection/i.test(e))).toBe(true);
  });

  it.each(['firstName', 'lastName', 'company', 'title'] as const)(
    'rejects a formula-injection cell in free-text field %s',
    (field) => {
      const v = validateLeadRow({ email: 'a@x.com', [field]: '@evil' });
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.errors.some((e) => /formula injection/i.test(e))).toBe(true);
    }
  );

  it('preserves a valid +phone (not rejected as formula injection)', () => {
    expect(validateLeadRow({ email: 'a@x.com', phone: '+442079460958' })).toEqual({ ok: true });
  });

  it('rejects a formula-looking phone via the phone schema', () => {
    const v = validateLeadRow({ email: 'a@x.com', phone: '=HYPERLINK(1)' });
    expect(v.ok).toBe(false);
  });

  it('rejects an invalid source enum value', () => {
    const v = validateLeadRow({ email: 'a@x.com', source: 'TELEPATHY' });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors.join(' ')).toMatch(/source/i);
  });

  it('rejects an over-long name', () => {
    const v = validateLeadRow({ email: 'a@x.com', firstName: 'x'.repeat(101) });
    expect(v.ok).toBe(false);
  });
});

describe('field-mapper: buildRowResults', () => {
  it('maps + validates each data row with its index', () => {
    const parsed = parseCsv('email,first\na@x.com,Ann\n,Bob\n=bad@x.com,Eve');
    const mapping = autoDetectMapping(parsed.headers);
    const results = buildRowResults(parsed, mapping);
    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ index: 0, validation: { ok: true } });
    expect(results[1].validation.ok).toBe(false); // missing email
    expect(results[2].validation.ok).toBe(false); // malformed email
    expect(results[0].record).toEqual({ email: 'a@x.com', firstName: 'Ann' });
  });
});
