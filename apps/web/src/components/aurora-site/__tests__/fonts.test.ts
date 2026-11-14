// @vitest-environment node
/**
 * Guards #1113: Manrope is self-hosted, so `next build` never fetches it from
 * Google Fonts. A bad Google answer used to fail the build (loader.js read the
 * font extension from the returned URL and got null).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect, vi } from 'vitest';

const calls = vi.hoisted((): unknown[] => []);
vi.mock('next/font/local', () => ({
  default: (options: unknown) => {
    calls.push(options);
    return { variable: 'font-manrope', className: 'manrope' };
  },
}));

import { manrope } from '../fonts';

const SITE_DIR = path.resolve(__dirname, '..');
const WEB_SRC = path.resolve(SITE_DIR, '..', '..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(full);
    return /\.(tsx?|jsx?|mjs)$/.test(entry.name) ? [full] : [];
  });
}

describe('Manrope font', () => {
  it('loads the committed latin woff2 with the same variable, weights and display', () => {
    expect(manrope.variable).toBe('font-manrope');
    expect(calls).toEqual([
      {
        src: './manrope/manrope-latin-wght.woff2',
        weight: '400 800',
        style: 'normal',
        display: 'swap',
        variable: '--font-manrope',
      },
    ]);
  });

  it('ships the font file and its SIL Open Font License text', () => {
    const woff2 = fs.readFileSync(path.join(SITE_DIR, 'manrope', 'manrope-latin-wght.woff2'));
    expect(woff2.subarray(0, 4).toString('latin1')).toBe('wOF2');
    const licence = fs.readFileSync(path.join(SITE_DIR, 'manrope', 'OFL.txt'), 'utf8');
    expect(licence).toContain('SIL Open Font License, Version 1.1');
    expect(licence).toContain('Manrope Project Authors');
  });

  it('is not loaded from Google Fonts anywhere in the web app', () => {
    const offenders = sourceFiles(WEB_SRC).filter((file) =>
      /from\s+['"]next\/font\/google['"]/.test(fs.readFileSync(file, 'utf8'))
    );
    expect(offenders.map((f) => path.relative(WEB_SRC, f))).toEqual([]);
  });
});
