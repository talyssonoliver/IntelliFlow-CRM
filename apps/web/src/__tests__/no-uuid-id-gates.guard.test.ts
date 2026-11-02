/**
 * Guard (#1097): the web does not gate ids behind a hand-rolled UUID regex.
 *
 * Record ids are cuids (Prisma @default(cuid())), so a UUID-only check silently drops
 * real ids: the account page never loaded, tickets could not be assigned, and the
 * contacts company filter did nothing. Use `isRecordId` from `@/lib/shared/record-id`,
 * which applies the api's own `recordIdSchema`. A regex that is not an id gate goes in
 * ALLOWED with the reason. The api, worker and package side is guarded by
 * apps/ai-worker/src/__tests__/no-uuid-id-fields.guard.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, relative, sep } from 'path';

const SRC = join(__dirname, '..');

/** `file` entries (relative to apps/web/src) whose UUID regex is not an id gate. */
const ALLOWED: Record<string, string> = {
  'lib/tickets/ticket-detail-mapper.ts':
    'isUuidOrCuid decides whether a raw value is an id or a display name; isRecordId would treat every name as an id',
};

// The first two groups of a UUID pattern, as written in a regex literal: [0-9a-f]{8}-[0-9a-f]{4}
const UUID_REGEX_LITERAL = /\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}/i;

const SKIP_DIR = new Set(['node_modules', '__tests__', '.next']);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIR.has(entry.name)) out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$|\.d\.ts$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function findUuidGates(files: string[], root = SRC): string[] {
  const hits: string[] = [];
  for (const file of files) {
    const rel = relative(root, file).split(sep).join('/');
    if (rel in ALLOWED) continue;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (UUID_REGEX_LITERAL.test(line)) hits.push(`${rel}:${i + 1}`);
      });
  }
  return hits;
}

describe('no hand-rolled UUID id gates in apps/web/src (#1097)', () => {
  it('scans a non-empty set of source files', () => {
    expect(sourceFiles(SRC).length).toBeGreaterThan(100);
  });

  it('finds no UUID regex outside the allowlist', () => {
    expect(findUuidGates(sourceFiles(SRC))).toEqual([]);
  });

  it('flags a UUID regex literal and ignores other code', () => {
    const dir = mkdtempSync(join(tmpdir(), 'web-uuid-guard-'));
    try {
      const file = join(dir, 'sample.ts');
      writeFileSync(
        file,
        [
          'const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;',
          "const ok = isRecordId('cmhbx3k2p0000l8086a1b2c3d');",
        ].join('\n')
      );
      expect(findUuidGates([file], dir)).toEqual(['sample.ts:1']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
