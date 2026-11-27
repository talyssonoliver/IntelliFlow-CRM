/**
 * Guard: no double-encoded text in the web app's source.
 *
 * UTF-8 text once read as Windows code page 850 and saved back as UTF-8 turns a bullet, a dash or
 * an emoji into three or four junk characters (a capital O with circumflex followed by C-cedilla,
 * for example). That shipped on the lead page (activity filter chips and the "user - time"
 * separator) and on the contact pages. This test fails if any source file under src/ holds such
 * a sequence again. The patterns are built from code points so this file stays pure ASCII.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ch = (...codes: number[]) => String.fromCodePoint(...codes);

// Lead characters of cp850 mojibake for the punctuation, arrows, box lines, ticks and emoji the
// app uses, plus the cp1252 flavour of the same mistake.
const O_CIRCUMFLEX = ch(0xd4);
const MOJIBAKE = new RegExp(
  [
    `${O_CIRCUMFLEX}[${ch(0xc7, 0xf6, 0xe5, 0xdc, 0xa3)}]`, // bullets, dashes, arrows, box lines, ticks
    ch(0xad, 0x192), // soft hyphen + f-hook: the start of a 4-byte emoji
    ch(0xe2, 0x20ac), // a-circumflex + euro sign: cp1252 mojibake
  ].join('|')
);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(full);
    return /\.(tsx?|css)$/.test(entry.name) ? [full] : [];
  });
}

/** Text as it looks after UTF-8 bytes were decoded as cp850 (enough of cp850 for the tests). */
const CP850: Record<number, number> = {
  0xe2: 0xd4,
  0x80: 0xc7,
  0xa2: 0xf3,
  0xf0: 0xad,
  0x9f: 0x192,
  0x93: 0xf4,
  0x8b: 0xef,
};
function asCp850Mojibake(text: string): string {
  return [...Buffer.from(text, 'utf8')].map((b) => ch(CP850[b] ?? b)).join('');
}

describe('source encoding', () => {
  it('has no double-encoded (cp850 mojibake) text in apps/web/src', () => {
    const offenders = sourceFiles(join(__dirname, '..'))
      .filter((file) => MOJIBAKE.test(readFileSync(file, 'utf8')))
      .map((file) => relative(join(__dirname, '..'), file));
    expect(offenders).toEqual([]);
  });

  it('recognises the sequences it guards against, and passes genuine text', () => {
    expect(MOJIBAKE.test(asCp850Mojibake(ch(0x2022)))).toBe(true); // a bullet
    expect(MOJIBAKE.test(asCp850Mojibake(ch(0x1f4cb)))).toBe(true); // the clipboard emoji
    expect(MOJIBAKE.test(`${ch(0xa3)}4,500 ${ch(0x2014)} done ${ch(0x2022)} ok`)).toBe(false);
  });
});
