/**
 * The root layout and the public pages must stay prerenderable. One cookie or
 * header read in a layout renders every page under it in a function, on every
 * visit, crawler hit and link prefetch.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PER_REQUEST = [
  /from ['"]next\/headers['"]/,
  /from ['"]@\/lib\/trpc-server['"]/,
  /export const dynamic = ['"]force-dynamic['"]/,
  /export const revalidate = 0\b/,
  /\bunstable_noStore\b|\bconnection\(\)/,
];

/** Pages that are per request by design: each one answers a personal token link. */
const PER_REQUEST_BY_DESIGN = /^\(public\)\/dsar\/\[handle\]\//;

function sources(dir: string): string[] {
  return readdirSync(path.join(APP_DIR, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sources(relative);
    return /^(page|layout|template)\.tsx?$/.test(entry.name) ? [relative] : [];
  });
}

describe('public pages stay static', () => {
  const files = ['layout.tsx', ...sources('(public)')];

  it('finds the public layout and pages', () => {
    expect(files).toContain('(public)/layout.tsx');
    expect(files.length).toBeGreaterThan(10);
  });

  it('has no per-request read in the root layout or a public page or layout', () => {
    const offenders = files
      .filter((file) => !PER_REQUEST_BY_DESIGN.test(file))
      .filter((file) => {
        const source = readFileSync(path.join(APP_DIR, file), 'utf8');
        return PER_REQUEST.some((pattern) => pattern.test(source));
      });

    expect(offenders).toEqual([]);
  });
});
