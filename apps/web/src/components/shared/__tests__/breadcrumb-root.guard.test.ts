import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Owner 26/11 (reopened): "the issue of breadcrumbs aren't fixed yet". Every signed-in trail
 * starts at Dashboard (/dashboard) and goes through the shared Breadcrumbs. Only the public site
 * (blog, press, careers) starts at Home (/).
 */
const SRC = join(__dirname, '..', '..', '..');
// Public site pages, where Home (/) is the website's home: blog, press, careers, the 404 suggestions.
const PUBLIC_PARTS = ['(public)', 'press', 'blog', 'careers', 'job-detail-template', 'status'];
const isPublic = (file: string) =>
  file
    .split(/[\\/]/)
    .some((part) => PUBLIC_PARTS.some((p) => part === p || part.startsWith(p + '.')));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sources(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('one breadcrumb root for signed-in pages', () => {
  const files = sources(SRC).filter((f) => !isPublic(f));

  it('no signed-in trail starts at Home or "Main Dashboard"', () => {
    const offenders = files.filter((f) =>
      /label:\s*'(Home|Main Dashboard)',\s*href:\s*'\/'/.test(readFileSync(f, 'utf8'))
    );
    expect(offenders.map((f) => relative(SRC, f))).toEqual([]);
  });
});
