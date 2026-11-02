/**
 * Guard (#1074, #1075): no id field on the job and queue path, or in an api router input, is
 * validated as a UUID.
 *
 * Record ids are cuids (schema.prisma has no uuid column), so an id field must use
 * `recordIdSchema` from @intelliflow/validators. A field that really holds a UUID
 * (an id issued outside our database) goes in ALLOWED with the reason.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

/** The job and queue path (producers and consumers), api inputs, and the shared schemas. */
const SCOPE = [
  'apps/ai-worker/src',
  'apps/workers',
  'packages/platform/src/queues',
  'packages/platform/src/workflow',
  'apps/api/src/shared',
  'apps/api/src/modules',
  'apps/api/src/workflow',
  'packages/search/src',
  'packages/validators/src',
];

/** `file:field` entries that really are UUIDs, with the reason. */
const ALLOWED: Record<string, string> = {
  'apps/api/src/workflow/types.ts:workflowId':
    'state-machine workflows are keyed by randomUUID() (apps/api/src/workflow/state-machine.ts), not a record id',
  'packages/validators/src/auth.ts:mfaChallengeId':
    'MFA challenge ids are issued by mfa.service, not a record id; they become randomUUID() in #1096',
  'packages/validators/src/auth.ts:challengeId':
    'MFA challenge ids are issued by mfa.service, not a record id; they become randomUUID() in #1096',
};

// `fooId: z.uuid(`, `fooId: z.string().uuid(`, `fooIds: z.array(z.uuid(`, pairs such as
// `versionIdA: z.uuid(`, and actor fields such as `requestedBy: z.uuid(` (they hold a user id).
const ID_AS_UUID =
  /\b(\w*(?:Id|Ids|id|ids|By)[A-Z]?)\s*:\s*z(?:\.string\(\))?\.(?:uuid\(|array\(\s*z(?:\.string\(\))?\.uuid\()/g;

const SKIP_DIR = new Set(['node_modules', 'dist', '__tests__', 'coverage']);

function sourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIR.has(entry.name)) out.push(...sourceFiles(full));
    } else if (/\.ts$/.test(entry.name) && !/\.(test|spec)\.ts$|\.d\.ts$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function findUuidIdFields(files: string[], root = ROOT): string[] {
  const hits: string[] = [];
  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(ID_AS_UUID)) {
      const key = `${rel}:${m[1]}`;
      if (!(key in ALLOWED)) {
        const line = text.slice(0, m.index).split('\n').length;
        hits.push(`${rel}:${line} ${m[1]}`);
      }
    }
  }
  return hits;
}

describe('no uuid-validated id fields on the job path or in api inputs (#1074, #1075)', () => {
  it('scans a non-empty set of source files', () => {
    const files = SCOPE.flatMap((d) => sourceFiles(path.join(ROOT, d)));
    expect(files.length).toBeGreaterThan(50);
  });

  it('finds no id field validated as a UUID outside the allowlist', () => {
    const files = SCOPE.flatMap((d) => sourceFiles(path.join(ROOT, d)));
    expect(findUuidIdFields(files)).toEqual([]);
  });

  it('flags every form of uuid id field, and ignores a non-id uuid field', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uuid-guard-'));
    try {
      const file = path.join(dir, 'sample.ts');
      fs.writeFileSync(
        file,
        [
          'const a = z.object({',
          '  tenantId: z.uuid(),',
          "  leadId: z.string().uuid('must be a uuid'),",
          '  documentIds: z.array(z.uuid()).optional(),',
          '  requestedBy: z.uuid().optional(),',
          '  versionIdA: z.uuid(),',
          '  traceparent: z.uuid(),',
          '});',
        ].join('\n')
      );
      expect(findUuidIdFields([file], dir)).toEqual([
        'sample.ts:2 tenantId',
        'sample.ts:3 leadId',
        'sample.ts:4 documentIds',
        'sample.ts:5 requestedBy',
        'sample.ts:6 versionIdA',
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
