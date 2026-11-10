/**
 * UI-019: UTF-8 text that was opened as code page 850 and saved again turns into
 * mojibake: "─" becomes "ÔöÇ", "•" becomes "ÔÇó", "📞" becomes "­ƒô×". Three lead and
 * contact files shipped that way. This guard fails on the signature of that damage in
 * any web source file.
 *
 * The signature is a UTF-8 lead byte read as cp850 (E2 -> "Ô", F0 9F -> soft hyphen +
 * "ƒ", C2 -> "┬", C3 -> "├") followed by continuation bytes (0x80-0xBF) read as cp850.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_DIR = resolve(__dirname, '..');

/** cp850 characters for the bytes 0x80-0xBF, the UTF-8 continuation range. */
const CONT = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐';

const MOJIBAKE = new RegExp(`Ô[${CONT}]{2}|­ƒ[${CONT}]{2}|[┬├][${CONT}]`);

function mojibakeLines(source: string): number[] {
  const found: number[] = [];
  source.split('\n').forEach((line, index) => {
    if (MOJIBAKE.test(line)) found.push(index + 1);
  });
  return found;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && path !== __filename ? [path] : [];
  });
}

describe('source encoding (UI-019)', () => {
  it('flags the cp850 forms of common UTF-8 characters', () => {
    expect(mojibakeLines('// ÔöÇÔöÇÔöÇ Emails tab')).toEqual([1]);
    expect(mojibakeLines('{a} ÔÇó {b}')).toEqual([1]);
    expect(mojibakeLines("label: '­ƒô× Calls'")).toEqual([1]);
    expect(mojibakeLines("'caf├®'")).toEqual([1]);
    expect(mojibakeLines("'a b' ┬á")).toEqual([1]);
  });

  it('leaves real characters alone', () => {
    expect(mojibakeLines('// ─── Emails tab ───')).toEqual([]);
    expect(mojibakeLines('{a} • {b} — £50k → ✓ 📞 café')).toEqual([]);
    expect(mojibakeLines('├── folder')).toEqual([]);
  });

  it('no web source file contains mojibake', () => {
    const offenders = sourceFiles(SRC_DIR).flatMap((file) =>
      mojibakeLines(readFileSync(file, 'utf8')).map((line) => `${relative(SRC_DIR, file)}:${line}`)
    );
    expect(offenders).toEqual([]);
  });
});
