/**
 * The mailbox claims on a real database (#1586). The inbox sync (Outlook, Zoho, Gmail reply sync) and
 * the bounce scan (here on Microsoft mailboxes) each take one due mailbox at a time with a lease:
 * `UPDATE email_mailboxes SET <lock> ... WHERE id IN (SELECT ... LIMIT 1 FOR UPDATE SKIP LOCKED)`.
 * Postgres runs that form as a join on some plans and then updates (locks) every due mailbox while
 * the caller uses the first row only, so the others sit locked and unsynced until the lease runs out.
 * The unit suites run the claim against an in-memory stand-in, which cannot show it: only a real
 * Postgres can. Here one tick runs over three due mailboxes and none may be left locked that was not
 * synced and released. Which plan Postgres picks depends on its statistics, so the test guards the
 * behaviour on whatever plan it gets: the form that picks the row once is right on every plan.
 *
 * Other integration files run against the same database, so each claim is narrowed to this file's
 * mailboxes (an extra `AND id = ANY(...)` in the claim's own SELECT); nothing else is changed.
 *
 * Skips cleanly when DATABASE_URL is not set.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../packages/db/generated/prisma/client';

// The sync's token helper needs the encryption keys and the provider: the fakes below need neither.
const mocks = vi.hoisted(() => ({
  getOAuthAccess: vi.fn(),
  getOAuthAccessToken: vi.fn(),
  hasOAuthClient: vi.fn(),
  forgetAccessToken: vi.fn(),
}));
vi.mock('../../apps/api/src/modules/email/mailbox-transport', () => ({
  getOAuthAccess: mocks.getOAuthAccess,
  getOAuthAccessToken: mocks.getOAuthAccessToken,
  hasOAuthClient: mocks.hasOAuthClient,
  forgetAccessToken: mocks.forgetAccessToken,
  oauthClientEnvNames: () => ['EMAIL_OAUTH_MICROSOFT_CLIENT_ID'],
}));

import {
  runInboxSync,
  type InboxSyncDeps,
} from '../../apps/api/src/modules/email/outlook-inbox-sync';
import {
  runBounceScan,
  type BounceReaderDeps,
} from '../../apps/api/src/modules/email/bounce-reader';
import type { MailSyncReader } from '../../apps/api/src/modules/email/mail-sync-reader';

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;
// Never used to sign in anywhere: the mailboxes only need to exist.
const PLACEHOLDER = 'x'.repeat(12);
const MINUTE = 60_000;
const COUNT = 3;

describeDb('mailbox claims on a real database', () => {
  const run = randomUUID().slice(0, 8);
  const tenantId = `mbx-claims-${run}`;
  let prisma: PrismaClient;
  const inboxIds: string[] = [];
  const bounceIds: string[] = [];

  /**
   * The claim narrowed to `ids`: the text of the raw claim gets one more condition inside its own
   * SELECT, just before its ORDER BY. A claim that changes shape fails loudly here.
   */
  function onlyThese(ids: () => string[], orderBy: string): PrismaClient {
    const claim = async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.reduce(
        (acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ''),
        ''
      );
      if (!text.includes('email_mailboxes')) return prisma.$queryRaw(strings, ...values);
      const narrowed = text.replace(
        `ORDER BY ${orderBy}`,
        `AND id = ANY($${values.length + 1}::text[]) ORDER BY ${orderBy}`
      );
      if (narrowed === text) throw new Error('the claim query changed: narrow it again here');
      return prisma.$queryRawUnsafe(narrowed, ...values, ids());
    };
    return new Proxy(prisma, {
      get(target, prop) {
        if (prop === '$queryRaw') return claim;
        const value = Reflect.get(target, prop, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }

  const addUser = async (n: number) => {
    const id = `${tenantId}-user-${n}`;
    await prisma.user.create({
      data: { id, tenantId, email: `u${n}-${run}@example.invalid` },
    });
    return id;
  };

  const addMicrosoft = async (n: number) => {
    const userId = await addUser(n);
    return (
      await prisma.emailMailbox.create({
        data: {
          tenantId,
          scope: 'USER',
          userId,
          kind: 'MICROSOFT',
          status: 'ACTIVE',
          fromAddress: `${userId}@example.invalid`,
          accountAddress: `${userId}@example.invalid`,
          refreshToken: PLACEHOLDER,
          grantedScopes: ['offline_access', 'Mail.Read'],
        },
      })
    ).id;
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL }) });
    await prisma.tenant.create({ data: { id: tenantId, name: tenantId, slug: tenantId } });
    for (let n = 0; n < COUNT; n++) inboxIds.push(await addMicrosoft(n));
    for (let n = 0; n < COUNT; n++) bounceIds.push(await addMicrosoft(100 + n));
  });

  afterAll(async () => {
    await prisma.emailMailbox.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    mocks.hasOAuthClient.mockReturnValue(true);
    mocks.getOAuthAccessToken.mockResolvedValue('access');
    mocks.getOAuthAccess.mockImplementation(
      async (_p: unknown, mailbox: { tokenVersion: number }) => ({
        accessToken: 'access',
        tokenVersion: mailbox.tokenVersion,
      })
    );
  });

  describe('inbox sync', () => {
    const reads: string[] = [];
    // A mailbox with nothing new: every folder is caught up at once.
    const reader: MailSyncReader = {
      provider: 'MICROSOFT',
      canRead: (scopes) => scopes.includes('Mail.Read'),
      read: async ({ mailbox, folder }) => {
        reads.push(`${mailbox.id}:${folder}`);
        return { messages: [], cursor: `delta-${folder}`, complete: true, expired: false };
      },
    };
    const sync = (): InboxSyncDeps => ({
      prisma: onlyThese(() => inboxIds, '"nextSyncAt"'),
      transports: {} as never,
      isRestricted: async () => false,
      now: () => new Date(),
      readers: { MICROSOFT: reader },
    });

    beforeEach(async () => {
      reads.length = 0;
      await prisma.emailMailbox.updateMany({
        where: { id: { in: inboxIds } },
        data: { nextSyncAt: null, syncLockedUntil: null, syncedAt: null, syncFailureCount: 0 },
      });
    });

    it('claims one mailbox at a time: after a tick over three due, none is left locked', async () => {
      const report = await runInboxSync(sync());

      // A claim that locked every due mailbox but synced only the first would leave the others locked
      // for the lease (five minutes) with nothing synced: all three must be synced and released.
      expect(report).toMatchObject({ mailboxesSynced: COUNT, failures: 0 });
      const rows = await prisma.emailMailbox.findMany({ where: { id: { in: inboxIds } } });
      expect(rows.map((r) => r.syncLockedUntil)).toEqual([null, null, null]);
      expect(rows.every((r) => r.syncedAt !== null)).toBe(true);
      expect(new Set(reads.map((r) => r.split(':')[0]))).toEqual(new Set(inboxIds));
    });

    it('leaves a mailbox another worker holds alone, and syncs the others', async () => {
      const heldUntil = new Date(Date.now() + 4 * MINUTE);
      await prisma.emailMailbox.update({
        where: { id: inboxIds[0] },
        data: { syncLockedUntil: heldUntil },
      });

      const report = await runInboxSync(sync());

      expect(report.mailboxesSynced).toBe(COUNT - 1);
      const held = await prisma.emailMailbox.findUniqueOrThrow({ where: { id: inboxIds[0] } });
      expect(held.syncLockedUntil).toEqual(heldUntil);
      expect(held.syncedAt).toBeNull();
      const others = await prisma.emailMailbox.findMany({
        where: { id: { in: inboxIds.slice(1) } },
      });
      expect(others.map((r) => r.syncLockedUntil)).toEqual([null, null]);
      expect(others.every((r) => r.syncedAt !== null)).toBe(true);
    });

    it('hands a due mailbox to one worker when two ticks run at once', async () => {
      await prisma.emailMailbox.updateMany({
        where: { id: { in: inboxIds.slice(1) } },
        data: { nextSyncAt: new Date(Date.now() + 60 * MINUTE) },
      });

      const [one, two] = await Promise.all([runInboxSync(sync()), runInboxSync(sync())]);

      expect(one.mailboxesSynced + two.mailboxesSynced).toBe(1);
    });
  });

  describe('bounce scan', () => {
    const scans: string[] = [];
    const sweep = (): BounceReaderDeps => ({
      prisma: onlyThese(() => bounceIds, '"nextScanAt"'),
      transports: {
        oauth: () => ({
          listDsnSince: async () => {
            scans.push('scan');
            return { messages: [], resumeFrom: null };
          },
        }),
      } as never,
      notify: async () => {},
      now: () => new Date(),
    });

    beforeEach(async () => {
      scans.length = 0;
      await prisma.emailMailbox.updateMany({
        where: { id: { in: bounceIds } },
        data: {
          nextScanAt: new Date(Date.now() - 5 * MINUTE),
          lockedUntil: null,
          failureCount: 0,
          scanCursorAt: null,
        },
      });
    });

    it('claims one mailbox at a time: after a tick over three due, none is left locked', async () => {
      const report = await runBounceScan(sweep());

      expect(report).toMatchObject({ mailboxesScanned: COUNT, failures: 0 });
      const rows = await prisma.emailMailbox.findMany({ where: { id: { in: bounceIds } } });
      expect(rows.map((r) => r.lockedUntil)).toEqual([null, null, null]);
      expect(rows.every((r) => r.scanCursorAt !== null)).toBe(true);
      expect(scans).toHaveLength(COUNT);
    });

    it('leaves a mailbox another worker holds alone, and scans the others', async () => {
      const heldUntil = new Date(Date.now() + 4 * MINUTE);
      await prisma.emailMailbox.update({
        where: { id: bounceIds[0] },
        data: { lockedUntil: heldUntil },
      });

      const report = await runBounceScan(sweep());

      expect(report.mailboxesScanned).toBe(COUNT - 1);
      const held = await prisma.emailMailbox.findUniqueOrThrow({ where: { id: bounceIds[0] } });
      expect(held.lockedUntil).toEqual(heldUntil);
      expect(held.scanCursorAt).toBeNull();
      const others = await prisma.emailMailbox.findMany({
        where: { id: { in: bounceIds.slice(1) } },
      });
      expect(others.map((r) => r.lockedUntil)).toEqual([null, null]);
    });

    it('hands a due mailbox to one worker when two ticks run at once', async () => {
      await prisma.emailMailbox.updateMany({
        where: { id: { in: bounceIds.slice(1) } },
        data: { nextScanAt: new Date(Date.now() + 60 * MINUTE) },
      });

      const [one, two] = await Promise.all([runBounceScan(sweep()), runBounceScan(sweep())]);

      expect(one.mailboxesScanned + two.mailboxesScanned).toBe(1);
    });
  });
});
