import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MailboxTransportError } from '@intelliflow/adapters';
import { makeDsn } from './dsn-fixture';
import { runBounceScan, type BounceReaderDeps } from '../bounce-reader';
import { __resetAccessTokenCache } from '../mailbox-transport';

const NOW = new Date(Date.UTC(2026, 9, 20, 12));
const DAY = 86_400_000;
const LEASE_UNTIL = new Date(NOW.getTime() + 5 * 60_000);
const T = 'tenant-1';
const secret = 'x'.repeat(20);

const smtpMailbox = (over: Record<string, unknown> = {}) => ({
  id: 'mb1',
  tenantId: T,
  scope: 'USER',
  userId: 'u1',
  kind: 'SMTP',
  status: 'ACTIVE',
  imapHost: 'imap.mail.example.com',
  imapPort: 993,
  imapUsername: 'u',
  imapPassword: secret,
  smtpPassword: secret,
  refreshToken: null,
  tokenVersion: 0,
  imapUidValidity: 7n,
  imapLastUid: 10,
  scanCursorAt: null,
  createdAt: new Date(NOW.getTime() - 5 * DAY),
  failureCount: 0,
  ...over,
});

const record = (over: Record<string, unknown> = {}) => ({
  id: 'crec123',
  tenantId: T,
  mailboxId: 'mb1',
  userId: 'u1',
  toEmail: 'gone@example.invalid, ok@example.invalid',
  ccEmails: null,
  bccEmails: null,
  messageIdHeader: '<crec123.1@mail.example.invalid>',
  status: 'SENT',
  sentAt: new Date(NOW.getTime() - DAY),
  metadata: { isHtml: true },
  ...over,
});

interface Fake {
  db: any;
  receipts: any[];
  suppressions: any[];
  recordUpdates: any[];
  mailboxUpdates: any[];
  /** Simulates another writer changing the record. */
  setStored(next: any): void;
}

function fakeDb(
  opts: { mailbox?: any; record?: any | null; settings?: any; softCount?: number } = {}
): Fake {
  const receipts: any[] = [];
  const suppressions: any[] = [];
  const recordUpdates: any[] = [];
  const mailboxUpdates: any[] = [];
  let stored: any = opts.record === undefined ? record() : opts.record;
  // One mailbox, claimable (like the SQL) when not leased and due at `now`.
  let leased = false;
  let nextScanAt: Date | null = null;
  const db: any = {
    $queryRaw: vi.fn(async (_sql: unknown, _leaseUntil: Date, now: Date) => {
      if (leased || (nextScanAt && nextScanAt > now)) return [];
      leased = true;
      return [{ id: 'mb1', lockedUntil: LEASE_UNTIL }];
    }),
    emailOAuthState: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    emailMailbox: {
      findFirst: vi.fn(async () => opts.mailbox ?? smtpMailbox()),
      update: vi.fn(async (args: any) => {
        mailboxUpdates.push(args);
        if (args.data.lockedUntil === null) leased = false;
        if (args.data.nextScanAt) nextScanAt = args.data.nextScanAt;
        return {};
      }),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    tenantEmailSettings: { findUnique: vi.fn(async () => opts.settings ?? null) },
    emailRecord: {
      findFirst: vi.fn(async () => (stored ? { ...stored } : null)),
      update: vi.fn(async (args: any) => {
        recordUpdates.push(args);
        if (stored) stored = { ...stored, ...args.data };
        return {};
      }),
    },
    emailBounceReceipt: {
      create: vi.fn(async ({ data }: any) => {
        if (
          receipts.some(
            (r) =>
              r.mailboxId === data.mailboxId &&
              r.dsnKey === data.dsnKey &&
              r.recipient === data.recipient
          )
        ) {
          throw Object.assign(new Error('dup'), { code: 'P2002' });
        }
        receipts.push(data);
        return data;
      }),
      count: vi.fn(async () => opts.softCount ?? 1),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    emailSuppression: {
      upsert: vi.fn(async ({ create }: any) => {
        suppressions.push(create);
        return create;
      }),
    },
  };
  // Like Postgres: a throwing transaction leaves nothing behind.
  db.$transaction = vi.fn(async (fn: any) => {
    const marks = [receipts.length, suppressions.length, recordUpdates.length];
    const storedBefore = stored;
    try {
      return await fn(db);
    } catch (error) {
      receipts.length = marks[0]!;
      suppressions.length = marks[1]!;
      recordUpdates.length = marks[2]!;
      stored = storedBefore;
      throw error;
    }
  });
  const setStored = (next: any) => {
    stored = next;
  };
  return { db, receipts, suppressions, recordUpdates, mailboxUpdates, setStored };
}

function deps(
  fake: Fake,
  messages: Array<{ key: string; raw: string }>,
  extra: Partial<BounceReaderDeps> = {}
) {
  const read = vi.fn(async () => ({
    messages: messages.map((m) => ({ ...m, receivedAt: NOW })),
    cursor: { uidValidity: 7n, lastUid: 42 },
  }));
  const notify = vi.fn(async () => undefined);
  const d: BounceReaderDeps = {
    prisma: fake.db,
    transports: {
      smtp: { send: vi.fn(), verify: vi.fn() },
      imap: { read, verify: vi.fn() },
      oauth: () => null,
      oauthConfigured: { GMAIL: false, MICROSOFT: false },
    } as never,
    notify,
    now: () => NOW,
    ...extra,
  };
  return { d, read, notify };
}

beforeEach(() => {
  __resetAccessTokenCache();
});

describe('runBounceScan', () => {
  it('a worker that lost its lease writes no receipt, suppression or record change, and leaves the mailbox alone', async () => {
    const fake = fakeDb({ settings: { notifySenderOnBounce: true } });
    // Each receipt transaction first re-asserts the lease (an UPDATE that locks the row).
    fake.db.emailMailbox.updateMany.mockResolvedValue({ count: 0 });
    const { d, notify } = deps(fake, [{ key: '7:11', raw: makeDsn() }]);
    const report = await runBounceScan(d);
    expect(fake.db.emailMailbox.updateMany).toHaveBeenCalledWith({
      where: { id: 'mb1', lockedUntil: LEASE_UNTIL },
      data: { lockedUntil: LEASE_UNTIL },
    });
    expect(fake.receipts).toHaveLength(0);
    expect(fake.suppressions).toHaveLength(0);
    expect(fake.recordUpdates).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
    expect(fake.mailboxUpdates).toHaveLength(0);
    expect(report.failures).toBe(0);
  });

  it('merges a bounce into the record as stored now, not as it was when the scan matched it', async () => {
    const fake = fakeDb();
    const create = fake.db.emailBounceReceipt.create.getMockImplementation();
    fake.db.emailBounceReceipt.create.mockImplementationOnce(async (args: any) => {
      // Another writer marked a different recipient bounced after the match.
      fake.setStored(
        record({ metadata: { isHtml: true, bouncedRecipients: ['ok@example.invalid'] } })
      );
      return create(args);
    });
    const { d } = deps(fake, [{ key: '7:11', raw: makeDsn() }]);
    await runBounceScan(d);
    expect(fake.recordUpdates.at(-1).data.metadata.bouncedRecipients).toEqual([
      'ok@example.invalid',
      'gone@example.invalid',
    ]);
  });

  it('a scan whose lease was taken over by another worker writes nothing back', async () => {
    const fake = fakeDb();
    fake.db.emailMailbox.update.mockImplementationOnce(async () => {
      throw Object.assign(new Error('not found'), { code: 'P2025' });
    });
    const { d } = deps(fake, [{ key: '7:11', raw: makeDsn() }]);
    const report = await runBounceScan(d);
    expect(fake.db.emailMailbox.update.mock.calls[0][0].where).toEqual({
      id: 'mb1',
      lockedUntil: LEASE_UNTIL,
    });
    // Not counted as a failure, and no failure write over the other worker's state.
    expect(report.failures).toBe(0);
    expect(fake.db.emailMailbox.update).toHaveBeenCalledTimes(1);
  });

  it('claims due mailboxes with a lease that returns ids only, and purges expired state and old receipts', async () => {
    const fake = fakeDb();
    const { d } = deps(fake, []);
    await runBounceScan(d);
    const sql = String((fake.db.$queryRaw.mock.calls[0] as any)[0].join('?'));
    expect(sql).toContain('RETURNING id');
    // One at a time, leased just before its scan (a batch lease could expire mid-tick).
    expect(sql).toContain('LIMIT 1');
    expect(sql).not.toMatch(/RETURNING[^;]*(Password|refreshToken)/i);
    expect(fake.db.emailOAuthState.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: NOW } },
    });
    expect(fake.db.emailBounceReceipt.deleteMany).toHaveBeenCalledWith({
      where: { receivedAt: { lt: new Date(NOW.getTime() - 90 * DAY) } },
    });
  });

  it('reads the SMTP mailbox over IMAP from its cursor and advances it', async () => {
    const fake = fakeDb();
    const { d, read } = deps(fake, []);
    const report = await runBounceScan(d);
    expect(read).toHaveBeenCalledWith(
      { host: 'imap.mail.example.com', port: 993, username: 'u', password: secret },
      { uidValidity: 7n, lastUid: 10, since: new Date(NOW.getTime() - 5 * DAY) },
      { limit: 50, maxBytes: 256 * 1024 }
    );
    expect(fake.mailboxUpdates[0]).toEqual({
      where: { id: 'mb1', lockedUntil: LEASE_UNTIL },
      data: {
        lockedUntil: null,
        nextScanAt: new Date(NOW.getTime() + 10 * 60_000),
        failureCount: 0,
        scanCursorAt: NOW,
        imapUidValidity: 7n,
        imapLastUid: 42,
      },
    });
    expect(report.mailboxesScanned).toBe(1);
  });

  it('hard bounce matched by record header AND Message-ID: receipt, recipient bounced, suppression', async () => {
    const fake = fakeDb();
    const { d } = deps(fake, [{ key: '7:11', raw: makeDsn() }]);
    const report = await runBounceScan(d);
    expect(fake.db.emailRecord.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'crec123',
        tenantId: T,
        mailboxId: 'mb1',
        messageIdHeader: '<crec123.1@mail.example.invalid>',
        sentAt: { gte: new Date(NOW.getTime() - 30 * DAY) },
      },
    });
    expect(fake.receipts[0]).toMatchObject({
      tenantId: T,
      mailboxId: 'mb1',
      dsnKey: '7:11',
      recipient: 'gone@example.invalid',
      emailRecordId: 'crec123',
      kind: 'HARD',
      statusCode: '5.1.1',
      matchConfidence: 'HIGH',
    });
    expect(fake.recordUpdates[0].data.metadata.bouncedRecipients).toEqual(['gone@example.invalid']);
    expect(fake.recordUpdates[0].data.status).toBeUndefined(); // one of two recipients: not BOUNCED
    expect(fake.suppressions[0]).toEqual({
      tenantId: T,
      email: 'gone@example.invalid',
      reason: 'HARD_BOUNCE',
      source: 'DSN',
      emailRecordId: 'crec123',
    });
    expect(report).toMatchObject({ receipts: 1, suppressions: 1 });
  });

  it('marks the record BOUNCED (with bouncedAt) when every recipient hard-bounced', async () => {
    const fake = fakeDb({ record: record({ toEmail: 'gone@example.invalid' }) });
    const { d } = deps(fake, [{ key: '7:11', raw: makeDsn() }]);
    await runBounceScan(d);
    expect(fake.recordUpdates[0].data).toMatchObject({ status: 'BOUNCED', bouncedAt: NOW });
  });

  it('hardBounceAction NONE still records the receipt and the bounce, but does not suppress', async () => {
    const fake = fakeDb({
      settings: { hardBounceAction: 'NONE' },
      record: record({ toEmail: 'gone@example.invalid' }),
    });
    const { d } = deps(fake, [{ key: '7:11', raw: makeDsn() }]);
    await runBounceScan(d);
    expect(fake.receipts).toHaveLength(1);
    expect(fake.recordUpdates[0].data.status).toBe('BOUNCED');
    expect(fake.suppressions).toHaveLength(0);
  });

  it('soft bounces suppress only when the 30-day count (incl. this one) reaches the threshold', async () => {
    const soft = makeDsn({
      recipients: [{ address: 'gone@example.invalid', action: 'failed', status: '4.2.2' }],
    });
    let fake = fakeDb({ softCount: 2 });
    await runBounceScan(deps(fake, [{ key: '7:11', raw: soft }]).d);
    expect(fake.suppressions).toHaveLength(0);
    expect(fake.db.emailBounceReceipt.count).toHaveBeenCalledWith({
      where: {
        tenantId: T,
        recipient: 'gone@example.invalid',
        kind: 'SOFT',
        excludedFromCount: false,
        receivedAt: { gte: new Date(NOW.getTime() - 30 * DAY) },
      },
    });
    fake = fakeDb({ softCount: 3 });
    await runBounceScan(deps(fake, [{ key: '7:11', raw: soft }]).d);
    expect(fake.suppressions[0]).toMatchObject({ reason: 'SOFT_BOUNCE_LIMIT' });
  });

  it('a delayed notice is recorded but never bounces or suppresses', async () => {
    const fake = fakeDb();
    const delayed = makeDsn({
      recipients: [{ address: 'gone@example.invalid', action: 'delayed', status: '4.4.7' }],
    });
    await runBounceScan(deps(fake, [{ key: '7:11', raw: delayed }]).d);
    expect(fake.receipts[0]).toMatchObject({ kind: 'DELAYED' });
    expect(fake.recordUpdates).toHaveLength(0);
    expect(fake.suppressions).toHaveLength(0);
  });

  it.each([
    ['no matching record (spoofed or old)', { record: null }, makeDsn()],
    [
      'a recipient that was not on the record',
      {},
      makeDsn({
        recipients: [{ address: 'victim@example.invalid', action: 'failed', status: '5.1.1' }],
      }),
    ],
    ['no record header', {}, makeDsn({ recordId: null })],
    ['no original Message-ID', {}, makeDsn({ messageId: null })],
  ])('never suppresses on %s (UNMATCHED / LOW receipt only)', async (_label, opts, raw) => {
    const fake = fakeDb(opts as never);
    await runBounceScan(deps(fake, [{ key: '7:11', raw }]).d);
    expect(fake.suppressions).toHaveLength(0);
    expect(fake.recordUpdates).toHaveLength(0);
    expect(fake.receipts[0]).toMatchObject({
      kind: 'UNMATCHED',
      matchConfidence: 'LOW',
      emailRecordId: null,
    });
  });

  it('ignores mail that is not a delivery report', async () => {
    const fake = fakeDb();
    await runBounceScan(deps(fake, [{ key: '7:11', raw: 'From: a@b\n\nhello' }]).d);
    expect(fake.receipts).toHaveLength(0);
  });

  it('is idempotent: a replayed report (or one after a manual removal) changes nothing', async () => {
    const fake = fakeDb();
    const raw = makeDsn();
    await runBounceScan(deps(fake, [{ key: '7:11', raw }]).d);
    await runBounceScan(deps(fake, [{ key: '7:11', raw }]).d);
    expect(fake.receipts).toHaveLength(1);
    expect(fake.suppressions).toHaveLength(1);
  });

  it('stores at most 100 unmatched receipts per mailbox per scan (forged reports)', async () => {
    const fake = fakeDb({ record: null });
    const raws = Array.from({ length: 3 }, (_, i) => ({
      key: `7:${200 + i}`,
      raw: makeDsn({
        recipients: Array.from({ length: 50 }, (__, j) => ({
          address: `x${i}-${j}@example.invalid`,
          action: 'failed',
          status: '5.1.1',
        })),
      }),
    }));
    await runBounceScan(deps(fake, raws).d);
    expect(fake.receipts).toHaveLength(100);
    expect(fake.receipts.every((r: { kind: string }) => r.kind === 'UNMATCHED')).toBe(true);
    expect(fake.suppressions).toHaveLength(0);
  });

  it('caps suppressions at 25 per mailbox per scan', async () => {
    const fake = fakeDb({
      record: record({
        toEmail: Array.from({ length: 30 }, (_, i) => `r${i}@example.invalid`).join(', '),
      }),
    });
    const raws = Array.from({ length: 30 }, (_, i) => ({
      key: `7:${100 + i}`,
      raw: makeDsn({
        recipients: [{ address: `r${i}@example.invalid`, action: 'failed', status: '5.1.1' }],
      }),
    }));
    const report = await runBounceScan(deps(fake, raws).d);
    expect(fake.suppressions).toHaveLength(25);
    expect(report.suppressions).toBe(25);
    // The scan stopped at the 26th report (rolled back) and resumes there next time.
    expect(fake.receipts).toHaveLength(25);
    expect(fake.mailboxUpdates[0].data).toMatchObject({ imapUidValidity: 7n, imapLastUid: 124 });

    // The next scan (10 minutes later) applies the rest.
    await runBounceScan(
      deps(fake, raws.slice(25), { now: () => new Date(NOW.getTime() + 10 * 60_000) }).d
    );
    expect(fake.suppressions).toHaveLength(30);
  });

  it('marks a record BOUNCED only when every recipient HARD-bounced (a soft bounce is not enough)', async () => {
    const fake = fakeDb();
    await runBounceScan(
      deps(fake, [
        {
          key: '7:11',
          raw: makeDsn({
            recipients: [
              { address: 'gone@example.invalid', action: 'failed', status: '4.2.2' },
              { address: 'ok@example.invalid', action: 'failed', status: '5.1.1' },
            ],
          }),
        },
      ]).d
    );
    const last = fake.recordUpdates.at(-1).data;
    expect(last.status).toBeUndefined();
    expect(last.metadata.bouncedRecipients).toEqual(['gone@example.invalid', 'ok@example.invalid']);
    expect(last.metadata.hardBouncedRecipients).toEqual(['ok@example.invalid']);
  });

  it('notifies the sender only when notifySenderOnBounce is on', async () => {
    let fake = fakeDb();
    let ctx = deps(fake, [{ key: '7:11', raw: makeDsn() }]);
    await runBounceScan(ctx.d);
    expect(ctx.notify).not.toHaveBeenCalled();
    fake = fakeDb({ settings: { notifySenderOnBounce: true } });
    ctx = deps(fake, [{ key: '7:11', raw: makeDsn() }]);
    await runBounceScan(ctx.d);
    expect(ctx.notify).toHaveBeenCalledWith(
      {
        tenantId: T,
        userId: 'u1',
        emailRecordId: 'crec123',
        recipient: 'gone@example.invalid',
      },
      fake.db
    );
  });

  it('a failed notification rolls its receipt back, so the next scan notifies instead of skipping', async () => {
    const fake = fakeDb({ settings: { notifySenderOnBounce: true } });
    const ctx = deps(fake, [{ key: '7:11', raw: makeDsn() }]);
    (ctx.notify as any).mockRejectedValueOnce(new Error('notifications down'));
    const first = await runBounceScan(ctx.d);
    expect(first.failures).toBe(1);
    expect(fake.receipts).toHaveLength(0);

    // The next scan, once the back-off has passed.
    await runBounceScan({ ...ctx.d, now: () => new Date(NOW.getTime() + DAY) });
    expect(ctx.notify).toHaveBeenCalledTimes(2);
    expect(fake.receipts).toHaveLength(1);
  });

  it('backs off on failure and moves the mailbox to ERROR after 5 consecutive failures', async () => {
    let fake = fakeDb({ mailbox: smtpMailbox({ failureCount: 1 }) });
    let ctx = deps(fake, []);
    (ctx.read as any).mockRejectedValueOnce(new MailboxTransportError('TIMEOUT'));
    const report = await runBounceScan(ctx.d);
    expect(report.failures).toBe(1);
    expect(fake.mailboxUpdates[0].data).toEqual({
      lockedUntil: null,
      failureCount: 2,
      nextScanAt: new Date(NOW.getTime() + 40 * 60_000),
    });

    fake = fakeDb({ mailbox: smtpMailbox({ failureCount: 4 }) });
    ctx = deps(fake, []);
    (ctx.read as any).mockRejectedValueOnce(new MailboxTransportError('AUTH_FAILED'));
    await runBounceScan(ctx.d);
    expect(fake.mailboxUpdates[0].data).toMatchObject({
      failureCount: 5,
      status: 'ERROR',
      lastErrorCode: 'AUTH_FAILED',
    });
  });

  it('skips a mailbox that cannot be scanned (no IMAP) and releases its lease', async () => {
    const fake = fakeDb({ mailbox: smtpMailbox({ imapHost: null, imapPassword: null }) });
    const ctx = deps(fake, []);
    await runBounceScan(ctx.d);
    expect(ctx.read).not.toHaveBeenCalled();
    expect(fake.mailboxUpdates[0].data).toMatchObject({ lockedUntil: null });
  });

  it('scans an OAuth mailbox through the provider list with an overlap window', async () => {
    const listDsnSince = vi.fn(async () => ({
      messages: [{ key: 'gm1', raw: makeDsn(), receivedAt: NOW }],
      resumeFrom: null,
    }));
    const client = {
      refresh: vi.fn(async () => ({
        accessToken: 'at',
        refreshToken: secret,
        expiresAt: new Date(NOW.getTime() + 3600_000),
      })),
      listDsnSince,
    };
    const cursor = new Date(NOW.getTime() - 2 * 3600_000);
    const fake = fakeDb({
      mailbox: smtpMailbox({
        kind: 'GMAIL',
        imapHost: null,
        refreshToken: secret,
        scanCursorAt: cursor,
      }),
    });
    const ctx = deps(fake, [], {
      transports: {
        smtp: {},
        imap: { read: vi.fn() },
        oauth: () => client,
        oauthConfigured: { GMAIL: true, MICROSOFT: false },
      } as never,
    });
    await runBounceScan(ctx.d);
    expect(listDsnSince).toHaveBeenCalledWith('at', new Date(cursor.getTime() - 3600_000), 50);
    expect(fake.receipts[0]).toMatchObject({ dsnKey: 'gm1', kind: 'HARD' });
    expect(fake.mailboxUpdates[0].data.scanCursorAt).toEqual(NOW);
  });

  it('advances the OAuth cursor only through what a truncated listing read', async () => {
    const lastRead = new Date(NOW.getTime() - 3 * 3600_000);
    const client = {
      refresh: vi.fn(async () => ({
        accessToken: 'at',
        refreshToken: secret,
        expiresAt: new Date(NOW.getTime() + 3600_000),
      })),
      listDsnSince: vi.fn(async () => ({ messages: [], resumeFrom: lastRead })),
    };
    const fake = fakeDb({
      mailbox: smtpMailbox({
        kind: 'MICROSOFT',
        imapHost: null,
        refreshToken: secret,
        scanCursorAt: new Date(NOW.getTime() - 6 * 3600_000),
      }),
    });
    const ctx = deps(fake, [], {
      transports: {
        smtp: {},
        imap: { read: vi.fn() },
        oauth: () => client,
        oauthConfigured: { GMAIL: false, MICROSOFT: true },
      } as never,
    });
    await runBounceScan(ctx.d);
    // Stored one overlap ahead, so the next scan's window starts exactly at the last message read.
    expect(fake.mailboxUpdates[0].data.scanCursorAt).toEqual(
      new Date(lastRead.getTime() + 3600_000)
    );
  });
});
