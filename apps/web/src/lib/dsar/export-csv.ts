/**
 * The personal-data export as CSV (IFC-317, UK GDPR Art 20(1)): one file per exported category,
 * plus the processing information and what was withheld, in one zip. Built in the browser from
 * the same export the JSON file holds, so it covers exactly the same data and costs no download.
 *
 * The zip is written with the STORE method (no compression): every reader opens it, and no
 * library is needed for a handful of small text files.
 */
import type { DsarExportDto } from '@intelliflow/validators/dsar';

export const CSV_ZIP_NAME = 'my-personal-data-csv.zip';

/** One CSV field: RFC 4180 quoting, objects as JSON, empty for null and undefined. */
function field(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Rows as CSV with a header of every column any row has, in first-seen order. */
export function toCsv(rows: ReadonlyArray<Record<string, unknown>>): string {
  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) if (!columns.includes(key)) columns.push(key);
  }
  const lines = [columns.map(field).join(',')];
  for (const row of rows) lines.push(columns.map((c) => field(row[c])).join(','));
  return lines.join('\r\n') + '\r\n';
}

/** Every file of the CSV export, by name. */
export function exportCsvFiles(data: DsarExportDto): Record<string, string> {
  const info = data.processingInformation;
  const files: Record<string, string> = {
    'processing-information.csv': toCsv(
      Object.entries({ generatedAt: data.generatedAt, ...info }).map(([item, value]) => ({
        item,
        value,
      }))
    ),
    'withheld.csv': toCsv(data.withheld),
  };
  for (const [category, rows] of Object.entries(data.data)) {
    files[`${category.replaceAll(/[^A-Za-z0-9_-]/g, '_')}.csv`] = toCsv(rows);
  }
  return files;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** A zip of the files, stored uncompressed, names in UTF-8. */
export function zipStore(files: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const body = encoder.encode(text);
    const crc = crc32(body);
    const header = (size: number, extra: (v: DataView) => void) => {
      const buf = new Uint8Array(size + nameBytes.length);
      extra(new DataView(buf.buffer));
      buf.set(nameBytes, size);
      return buf;
    };
    const common = (v: DataView, at: number) => {
      v.setUint16(at, 20, true); // version needed
      v.setUint16(at + 2, 0x0800, true); // UTF-8 names
      v.setUint16(at + 4, 0, true); // STORE
      v.setUint32(at + 10, crc, true);
      v.setUint32(at + 14, body.length, true);
      v.setUint32(at + 18, body.length, true);
      v.setUint16(at + 22, nameBytes.length, true);
    };
    const localHeader = header(30, (v) => {
      v.setUint32(0, 0x04034b50, true);
      common(v, 4);
    });
    central.push(
      header(46, (v) => {
        v.setUint32(0, 0x02014b50, true);
        v.setUint16(4, 20, true); // version made by
        common(v, 6);
        v.setUint32(42, offset, true);
      })
    );
    local.push(localHeader, body);
    offset += localHeader.length + body.length;
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const end = new Uint8Array(22);
  const v = new DataView(end.buffer);
  v.setUint32(0, 0x06054b50, true);
  v.setUint16(8, central.length, true);
  v.setUint16(10, central.length, true);
  v.setUint32(12, centralSize, true);
  v.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + end.length);
  let at = 0;
  for (const part of [...local, ...central, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** Save the CSV zip from memory (no storage, nothing sent anywhere). */
export function saveExportCsv(data: DsarExportDto, doc: Document = document): void {
  const bytes = zipStore(exportCsvFiles(data));
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }));
  const anchor = doc.createElement('a');
  anchor.href = url;
  anchor.download = CSV_ZIP_NAME;
  anchor.click();
  URL.revokeObjectURL(url);
}
