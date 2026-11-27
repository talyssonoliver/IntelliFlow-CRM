/**
 * Register #64 guard: every production read of an email row goes through the one visibility
 * policy (packages/db/src/email-visibility.ts), or is a named system path below.
 *
 * A new `emailRecord.findMany(...)` or `FROM email_records` that skips the policy turns a
 * colleague's personal mail into tenant-wide mail again, so this fails until the file either
 * uses the policy or is added here with the reason it is safe.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emailVisibilityWhere } from '@intelliflow/db';

const repoRoot = resolve(__dirname, '../../../../../..');
const roots = [
  'apps/api/src',
  'apps/ai-worker/src',
  'packages/adapters/src',
  'packages/application/src',
];

const READ =
  /emailRecord\s*\.\s*(findMany|findFirst|findUnique|findFirstOrThrow|findUniqueOrThrow|count|aggregate|groupBy)\b|FROM\s+email_records/i;
const USES_POLICY =
  /visibleMail\(|visibleEmailWhere\(|emailVisibilityWhere\(|emailVisibleSql\(|emailVisibility\(/;

/** Reads that are not a person reading mail: why each is safe. */
const SYSTEM_PATHS: Record<string, string> = {
  'apps/api/src/agent/approved-action-compensator.ts':
    'rolls back the email draft the approving user just had Aurora create (their own draft)',
  'apps/api/src/modules/contact/reply-draft-compose.ts':
    "reads the caller's own Compose draft (userId is the caller)",
  'apps/api/src/modules/contact/reply-draft.router.ts':
    "looks up the record of the caller's own send attempt",
  'apps/api/src/modules/email/bounce-reader.ts':
    'system job matching bounce reports (DSN) to the mail it bounced for; shows nobody a mail',
  'apps/api/src/modules/email/mail-sync-automated.ts': 'the sync engine, reading its own mailbox',
  'apps/api/src/modules/email/mail-sync-links.ts': 'the sync engine, reading its own mailbox',
  'apps/api/src/modules/email/mail-sync-match.ts': 'the sync engine, reading its own mailbox',
  'apps/api/src/modules/email/mail-sync-reply-draft.ts': 'the sync engine, reading its own mailbox',
  'apps/ai-worker/src/jobs/reply-draft-thread.ts':
    "reads one mailbox's own conversation to draft that mailbox's reply (never another mailbox)",
  'packages/adapters/src/repositories/PrismaConversionUndoAdapter.ts':
    'counts the rows an undone conversion touched (an integrity check), shows no mail',
  'packages/adapters/src/repositories/PrismaSubjectDataRepository.ts':
    'DSAR export of one data subject: an administrator action (owner decision 26/11: may export all)',
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === '__tests__' || name === 'node_modules' ? [] : files(path);
    }
    return /\.ts$/.test(name) && !/\.(test|spec)\.ts$/.test(name) ? [path] : [];
  });
}

describe('register #64: every read of email rows follows the visibility policy', () => {
  const reads = roots
    .flatMap((root) => files(join(repoRoot, root)))
    .filter((file) => READ.test(readFileSync(file, 'utf8')))
    .map((file) => relative(repoRoot, file).replaceAll('\\', '/'));

  it('finds the readers (the scan itself works)', () => {
    expect(reads).toContain('apps/api/src/modules/email/inbound.router.ts');
    expect(reads).toContain('packages/adapters/src/repositories/PrismaActivityFeedRepository.ts');
  });

  it('each reader uses the policy or is a named system path', () => {
    const bad = reads.filter(
      (file) => !SYSTEM_PATHS[file] && !USES_POLICY.test(readFileSync(join(repoRoot, file), 'utf8'))
    );
    expect(bad).toEqual([]);
  });

  it('the system paths still read email rows (an entry that no longer does is stale)', () => {
    const stale = Object.keys(SYSTEM_PATHS).filter((file) => !reads.includes(file));
    expect(stale).toEqual([]);
  });

  it('the policy the readers share keeps drafts and mailboxes as two separate conditions', () => {
    expect(emailVisibilityWhere('u1').AND).toHaveLength(2);
  });

  it('no administrator override: the policy never branches on the role to show personal mail', () => {
    const policy = readFileSync(join(repoRoot, 'packages/db/src/email-visibility.ts'), 'utf8');
    const start = policy.indexOf('export function emailVisibilityWhere');
    const where = policy.slice(start, policy.indexOf('\n/**', start));
    expect(where).not.toMatch(/role|ADMIN/);
  });
});
