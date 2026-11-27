/**
 * IFC-317: the CSV export round-trips every exported category. The zip is read back by walking
 * its central directory, each entry's CRC is checked with Node's own zlib.crc32, and each file is
 * parsed with papaparse, an independent CSV reader.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { crc32 } from 'node:zlib';
import Papa from 'papaparse';
import type { DsarExportDto } from '@intelliflow/validators/dsar';
import {
  CSV_ZIP_NAME,
  UTF8_BOM,
  exportCsvFiles,
  saveExportCsv,
  toCsv,
  zipStore,
} from '../export-csv';

const EXPORT = {
  generatedAt: '2026-11-15T09:00:00.000Z',
  processingInformation: {
    controller: { name: 'Smith Law', privacyUrl: null },
    purposes: ['Client care'],
    categories: ['Contact details'],
    recipients: ['Email provider'],
    retention: '6 years',
    source: 'You',
    rights: ['Access', 'Erasure'],
    complaint: 'ICO',
    automatedDecisions: 'None',
  },
  data: {
    leads: [{ email: 'ada@example.invalid', firstName: 'Ada', score: 75, tags: ['vip'] }],
    contacts: [
      { firstName: 'Ada, "the first"', city: null },
      { firstName: 'Line\nbreak', title: 'Engineer' },
    ],
    bookings: [],
  },
  withheld: [{ category: 'NOTES', count: 2, note: 'The firm is reviewing it' }],
} as unknown as DsarExportDto;

function asText(v: unknown): string {
  if (v === null || v === undefined) return '';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

/** Reads a STORE zip from its end-of-central-directory record, checking every CRC. */
function readZip(bytes: Uint8Array): Record<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const entries = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  // ignoreBOM keeps the byte-order mark in the text, so the tests see exactly what was written.
  const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
  const files: Record<string, string> = {};
  for (let i = 0; i < entries; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const offset = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    expect(view.getUint32(offset, true)).toBe(0x04034b50);
    const start =
      offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
    const body = bytes.subarray(start, start + size);
    expect(crc32(body) >>> 0).toBe(crc);
    files[name] = decoder.decode(body);
    at += 46 + nameLength;
  }
  return files;
}

/** A CSV file's text after its byte-order mark, which every file must start with. */
function body(text: string | undefined): string {
  expect(text?.startsWith(UTF8_BOM)).toBe(true);
  return text!.slice(UTF8_BOM.length);
}

describe('CSV export (IFC-317)', () => {
  it('has one file per exported category, plus processing information and withheld', () => {
    const names = Object.keys(readZip(zipStore(exportCsvFiles(EXPORT)))).sort();
    expect(names).toEqual(
      [
        ...Object.keys(EXPORT.data).map((c) => `${c}.csv`),
        'processing-information.csv',
        'withheld.csv',
      ].sort()
    );
  });

  it('round-trips every row of every category', () => {
    const files = readZip(zipStore(exportCsvFiles(EXPORT)));
    for (const [category, rows] of Object.entries(EXPORT.data)) {
      // An empty category is still a file, so the person sees it had no rows.
      if (rows.length === 0) {
        expect(files[`${category}.csv`]).toBe(`${UTF8_BOM}\r\n`);
        continue;
      }
      const parsed = Papa.parse<Record<string, string>>(body(files[`${category}.csv`]), {
        header: true,
        skipEmptyLines: true,
      });
      expect(parsed.errors).toEqual([]);
      const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      expect(parsed.data).toEqual(
        rows.map((row) => Object.fromEntries(columns.map((c) => [c, asText(row[c])])))
      );
    }
  });

  it('keeps the processing information and what was withheld', () => {
    const files = readZip(zipStore(exportCsvFiles(EXPORT)));
    const info = Papa.parse<{ item: string; value: string }>(
      body(files['processing-information.csv']),
      {
        header: true,
        skipEmptyLines: true,
      }
    ).data;
    expect(info.find((r) => r.item === 'retention')?.value).toBe('6 years');
    expect(JSON.parse(info.find((r) => r.item === 'controller')!.value)).toEqual({
      name: 'Smith Law',
      privacyUrl: null,
    });
    const withheld = Papa.parse(body(files['withheld.csv']), {
      header: true,
      skipEmptyLines: true,
    });
    expect(withheld.data).toEqual([
      { category: 'NOTES', count: '2', note: 'The firm is reviewing it' },
    ]);
  });

  it('quotes commas, quotes and line breaks, and writes an empty category as an empty file', () => {
    expect(toCsv([{ a: 'x,y', b: 'say "hi"', c: 'l1\nl2' }])).toBe(
      `${UTF8_BOM}a,b,c\r\n"x,y","say ""hi""","l1\nl2"\r\n`
    );
    expect(toCsv([])).toBe(`${UTF8_BOM}\r\n`);
  });

  it.each(['=', '+', '-', '@', '\t', '\r'])(
    'puts a quote before text starting with %j, so a spreadsheet never runs it',
    (lead) => {
      const csv = toCsv([{ v: `${lead}SUM(A1)` }]);
      const cell = Papa.parse<string[]>(body(csv)).data[1]![0];
      expect(cell).toBe(`'${lead}SUM(A1)`);
    }
  );

  it('writes numbers as they are, negative ones included, and quotes text that looks like one', () => {
    expect(body(toCsv([{ score: -5, phone: '+440000000000', note: '-5' }]))).toBe(
      "score,phone,note\r\n-5,'+440000000000,'-5\r\n"
    );
  });

  it('keeps leading zeros and long digit strings as typed, and leaves ordinary text and numbers alone', () => {
    const csv = body(
      toCsv([
        {
          phone: '07700900000',
          postcode: '00123',
          ref: '12345678901234567',
          decimal: '0.5',
          year: '2026',
          count: 7,
          code: 'AB007',
        },
      ])
    );
    expect(csv).toBe(
      'phone,postcode,ref,decimal,year,count,code\r\n' +
        "'07700900000,'00123,'12345678901234567,0.5,2026,7,AB007\r\n"
    );
  });

  it('starts every file with a UTF-8 byte-order mark, so accents survive in Excel', () => {
    const bytes = zipStore({ 'a.csv': toCsv([{ name: 'Zoë Müller' }]) });
    const view = new DataView(bytes.buffer);
    const start = 30 + view.getUint16(26, true) + view.getUint16(28, true);
    expect([...bytes.subarray(start, start + 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(body(readZip(bytes)['a.csv'])).toContain('Zoë Müller');
  });

  it('never lets two categories, or a category and a fixed file, share a file name', () => {
    const names = Object.keys(
      exportCsvFiles({
        ...EXPORT,
        data: { 'a b': [], a_b: [], withheld: [], 'processing-information': [] },
      } as unknown as DsarExportDto)
    ).sort();
    expect(names).toEqual(
      [
        'a_b.csv',
        'a_b-2.csv',
        'processing-information.csv',
        'processing-information-2.csv',
        'withheld.csv',
        'withheld-2.csv',
      ].sort()
    );
  });

  it('saves the zip from memory', () => {
    const click = vi.fn();
    const anchor = { click, href: '', download: '' };
    const doc = { createElement: vi.fn(() => anchor) } as unknown as Document;
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    saveExportCsv(EXPORT, doc);
    expect(anchor.download).toBe(CSV_ZIP_NAME);
    expect(click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
  });
});
