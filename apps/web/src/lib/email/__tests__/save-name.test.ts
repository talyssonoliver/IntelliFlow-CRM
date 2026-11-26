import { describe, it, expect } from 'vitest';
import { saveName } from '../save-name';

describe('saveName', () => {
  it('keeps an ordinary name', () => {
    expect(saveName('Quote 2026-11.pdf')).toBe('Quote 2026-11.pdf');
  });

  it('removes path and control characters', () => {
    expect(saveName('..\\..\\evil/name?.pdf')).toBe('.._.._evil_name_.pdf');
    expect(saveName('a\u0000b\nc.txt')).toBe('a_b_c.txt');
  });

  it('removes the bidi and zero-width marks that hide an extension', () => {
    expect(saveName('invoice‮fdp.exe')).toBe('invoicefdp.exe');
    expect(saveName('re​port.pdf‏')).toBe('report.pdf');
  });

  it('drops trailing dots and spaces, and guards reserved Windows names', () => {
    expect(saveName('report.pdf. . ')).toBe('report.pdf');
    expect(saveName('CON.txt')).toBe('_CON.txt');
    expect(saveName('nul')).toBe('_nul');
  });

  it('shortens the stem, never the final extension, so an inner .exe cannot become the one saved', () => {
    const name = `${'a'.repeat(196)}.exe.pdf`;
    const saved = saveName(name);
    expect(saved.endsWith('.pdf')).toBe(true);
    expect(saved).toHaveLength(200);
    expect(saved.endsWith('.exe')).toBe(false);
    // A long name with a long "extension" is simply cut.
    expect(saveName(`${'b'.repeat(300)}.${'c'.repeat(40)}`)).toHaveLength(200);
  });

  it('falls back when nothing is left, and caps the length', () => {
    expect(saveName('...')).toBe('attachment');
    expect(saveName('x'.repeat(500))).toHaveLength(200);
  });
});
