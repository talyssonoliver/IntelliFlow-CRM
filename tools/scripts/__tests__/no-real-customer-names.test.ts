/**
 * Guard: this repository is public, so no real lead or customer name, email or domain may be
 * committed in fixtures, tests, docs, plans or CSV rows (owner ruling 2026-11-26, "clean files
 * going forward"). Use invented names (Acme Handyman Ltd, Northfield Fitness, Studio Pilates
 * Demo, Greenleaf Gardens, Example Clinic) and `*.example.invalid` hosts instead.
 *
 * The deny-list is built at runtime from split parts so this file does not publish the names it
 * forbids. A developer can extend it locally, without committing anything, with a JSON array of
 * strings in the file named by INTELLIFLOW_PII_DENYLIST_FILE (for example a list exported
 * read-only from production). Matching is case-insensitive.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const join = (...parts: string[]): string => parts.join('');

const BUILT_IN_TERMS: readonly string[] = [
  join('West', ' London', ' Handy', 'man'),
  join('Pilates', ' Liv', 'ing'),
  join('Pits', 'hanger'),
  join('Ener', 'gym'),
  join('Nutri', '-Gyn'),
  join('Nutri', 'gyn'),
  join('SYS', ' Mainte', 'nance'),
  join('Juli', 'ana Al', 'ves'),
];

/**
 * Files that record evidence of work and keep the name on purpose. Attestations carry sha256
 * hashes of the captured screens, so rewriting them would break the evidence. The migration is
 * already applied and Prisma verifies its checksum.
 */
const ALLOWLIST: readonly string[] = [
  '.specify/sprints/sprint-24/attestations/MVP-003/attestation.json',
  '.specify/sprints/sprint-25/attestations/MVP-008/attestation.json',
  'packages/db/prisma/migrations/20261118100000_contact_reply_draft_lead_id/migration.sql',
  'tools/scripts/__tests__/no-real-customer-names.test.ts',
];

const SCANNED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.mdx',
  '.csv',
  '.yaml',
  '.yml',
  '.sql',
  '.html',
  '.txt',
]);

const MAX_BYTES = 4_000_000;

function loadTerms(): string[] {
  const terms = [...BUILT_IN_TERMS];
  const extra = process.env.INTELLIFLOW_PII_DENYLIST_FILE;
  if (extra && existsSync(extra)) {
    const parsed: unknown = JSON.parse(readFileSync(extra, 'utf8'));
    if (Array.isArray(parsed)) {
      for (const t of parsed)
        if (typeof t === 'string' && t.trim().length >= 5) terms.push(t.trim());
    }
  }
  return terms.map((t) => t.toLowerCase());
}

function trackedFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: REPO_ROOT,
    maxBuffer: 1 << 28,
  }).toString('utf8');
  return out
    .split('\0')
    .filter((f) => f && SCANNED_EXTENSIONS.has(path.extname(f).toLowerCase()))
    .filter((f) => !ALLOWLIST.includes(f.replaceAll('\\', '/')));
}

/** Returns "file: term-index" pairs so a failure never prints the real value. */
function findHits(files: readonly string[], terms: readonly string[]): string[] {
  const hits: string[] = [];
  for (const file of files) {
    const abs = path.join(REPO_ROOT, file);
    let text: string;
    try {
      if (statSync(abs).size > MAX_BYTES) continue;
      text = readFileSync(abs, 'utf8').toLowerCase();
    } catch {
      continue; // deleted in the working tree or unreadable
    }
    terms.forEach((term, i) => {
      if (text.includes(term)) hits.push(`${file} (deny-list term #${i})`);
    });
  }
  return hits;
}

describe('no real customer or lead names in committed files', () => {
  it('builds a non-empty deny-list', () => {
    expect(loadTerms().length).toBeGreaterThanOrEqual(BUILT_IN_TERMS.length);
  });

  it('finds none of them in tracked fixture, test, doc, plan or CSV files', () => {
    const hits = findHits(trackedFiles(), loadTerms());
    expect(
      hits,
      'Replace real lead/customer names with invented ones (see the header of this test).'
    ).toEqual([]);
  });

  it('detects a planted term (the scanner itself works)', () => {
    // This file is allowlisted for the real scan, but findHits can still be pointed at it: the
    // title of this test contains the phrase below, so exactly one file must match.
    const self = path.relative(REPO_ROOT, __filename).replaceAll('\\', '/');
    expect(findHits([self], [join('plant', 'ed term')])).toHaveLength(1);
    expect(findHits([self], [join('absent', ' phrase', ' 12345')])).toHaveLength(0);
  });
});
