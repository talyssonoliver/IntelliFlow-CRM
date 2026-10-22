import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MailboxTransportError } from '@intelliflow/adapters';
import { makeDsn } from './dsn-fixture';
import { runBounceScan, trustedReceiversFromEnv, type BounceReaderDeps } from '../bounce-reader';
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
  // BigInt, as Prisma returns the column.
  imapLastUid: 10n,
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
    $executeRaw: vi.fn(async () => 1),
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
    // The test receiver is configured as trusted for custom (SMTP/IMAP) mailboxes.
    trustedReceivers: [{ imapHost: 'imap.mail.example.com', authservId: 'mx.example.invalid' }],
    ...extra,
  };
  return { d, read, notify };
}

beforeEach(() => {
  __resetAccessTokenCache();
});

describe('runBounceScan: only an authenticated report acts (#961, owner ruling 2026-10-21)', () => {
  const expectNoEffect = (fake: Fake) => {
    // Stored as an audit trail only: UNMATCHED, LOW, no record or suppression change.
    expect(fake.receipts).toHaveLength(1);
    expect(fake.receipts[0]).toMatchObject({
      kind: 'UNMATCHED',
      matchConfidence: 'LOW',
      emailRecordId: null,
    });
    expect(fake.recordUpdates).toHaveLength(0);
    expect(fake.suppressions).toHaveLength(0);
  };

  it('a forged report from a recipient (right ids, no authentication) is stored and has no effect', async () => {
    const fake = fakeDb({ settings: { notifySenderOnBounce: true } });
    const forged = makeDsn({
      from: 'Colleague <ok@example.invalid>',
      authenticationResults: [
        'mx.example.invalid; dkim=none; spf=none smtp.mailfrom=example.invalid',
      ],
    });
    const { d, notify } = deps(fake, [{ key: '7:11', raw: forged }]);
    await runBounceScan(d);
    expectNoEffect(fake);
    expect(notify).not.toHaveBeenCalled();
    // The record is never even looked up for an unauthenticated report.
    expect(fake.db.emailRecord.findFirst).not.toHaveBeenCalled();
  });

  it('a properly signed report from a domain the recipient controls cannot act on a co-recipient elsewhere', async () => {
    // The insider owns attacker.example.net and signs a real postmaster@ report
    // naming gone@example.invalid: authenticated, but not entitled to report on
    // that recipient (not its domain, not the sender's provider).
    const fake = fakeDb();
    const signed = makeDsn({
      from: 'postmaster@attacker.example.net',
      authenticationResults: ['mx.example.invalid; dkim=pass header.d=attacker.example.net'],
    });
    const { d } = deps(fake, [{ key: '7:11', raw: signed }]);
    await runBounceScan(d);
    expectNoEffect(fake);
  });

  it('a public-suffix From (mailer-daemon@co.uk) signed by a domain under it cannot act on others there', async () => {
    const fake = fakeDb({ mailbox: smtpMailbox({ fromAddress: 'sales@acme.co.uk' }) });
    const raw = makeDsn({
      from: 'mailer-daemon@co.uk',
      authenticationResults: ['mx.example.invalid; dkim=pass header.d=evil.co.uk'],
      recipients: [{ address: 'gone@example.invalid', action: 'failed', status: '5.1.1' }],
    });
    const { d } = deps(fake, [{ key: '7:11', raw }]);
    await runBounceScan(d);
    expectNoEffect(fake);
  });

  it('a host on a shared platform domain does not entitle the whole platform', async () => {
    const fake = fakeDb({
      mailbox: smtpMailbox({
        fromAddress: 'me@mail.example.org',
        smtpHost: 'acme.shared-host.example.net',
      }),
    });
    const raw = makeDsn({
      from: 'mailer-daemon@other.shared-host.example.net',
      authenticationResults: [
        'mx.example.invalid; dkim=pass header.d=other.shared-host.example.net',
      ],
    });
    const { d } = deps(fake, [{ key: '7:11', raw }]);
    await runBounceScan(d);
    expectNoEffect(fake);
  });

  it('a report signed for a bare top-level domain is never entitled to report', async () => {
    const fake = fakeDb();
    const tld = makeDsn({
      from: 'mailer-daemon@invalid',
      authenticationResults: ['mx.example.invalid; dkim=pass header.d=invalid'],
    });
    const { d } = deps(fake, [{ key: '7:11', raw: tld }]);
    await runBounceScan(d);
    expectNoEffect(fake);
  });

  it('the sending mailbox’s own domain (exactly) may report on any recipient', async () => {
    const fake = fakeDb({ mailbox: smtpMailbox({ fromAddress: 'me@mail.example.org' }) });
    const fromSendersMta = makeDsn({
      from: 'mailer-daemon@mail.example.org',
      authenticationResults: ['mx.example.invalid; spf=pass smtp.helo=mail.example.org'],
    });
    const { d } = deps(fake, [{ key: '7:11', raw: fromSendersMta }]);
    await runBounceScan(d);
    expect(fake.receipts[0]).toMatchObject({ kind: 'HARD', emailRecordId: 'crec123' });
  });

  it('a custom IMAP mailbox trusts no receiver by default: a header the sender wrote cannot act (codex r17)', async () => {
    // The custom server stamps nothing, so the forger's own header is topmost.
    const fake = fakeDb();
    const forged = makeDsn({
      from: 'mailer-daemon@example.invalid',
      authenticationResults: ['attacker.example.net; dkim=pass header.d=example.invalid'],
    });
    const { d } = deps(fake, [{ key: '7:11', raw: forged }], { trustedReceivers: [] });
    await runBounceScan(d);
    expectNoEffect(fake);
  });

  it('a Gmail mailbox trusts only mx.google.com; a Microsoft mailbox only Microsoft’s own form', async () => {
    const gmail = (authenticationResults: string[]) => async () => {
      const fake = fakeDb({ mailbox: smtpMailbox({ kind: 'GMAIL', refreshToken: secret }) });
      const listDsnSince = vi.fn(async () => ({
        messages: [{ key: 'g1', raw: makeDsn({ authenticationResults }), receivedAt: NOW }],
        resumeFrom: null,
      }));
      const { d } = deps(fake, [], {
        transports: {
          smtp: { send: vi.fn(), verify: vi.fn() },
          imap: { read: vi.fn(), verify: vi.fn() },
          oauth: () =>
            ({
              refresh: vi.fn(async () => ({
                accessToken: 'at',
                refreshToken: secret,
                expiresAt: new Date(NOW.getTime() + 3_600_000),
              })),
              listDsnSince,
            }) as never,
          oauthConfigured: { GMAIL: true, MICROSOFT: false },
        } as never,
      });
      await runBounceScan(d);
      return fake;
    };
    const trusted = await gmail(['mx.google.com; dkim=pass header.d=example.invalid'])();
    expect(trusted.receipts[0]).toMatchObject({ kind: 'HARD', emailRecordId: 'crec123' });
    const other = await gmail(['mx.example.invalid; dkim=pass header.d=example.invalid'])();
    expectNoEffect(other);
  });

  it('on a Microsoft mailbox an Exchange-sender report signed by a provider domain cannot act on others (N-4)', async () => {
    const microsoft = (from: string) => async () => {
      const fake = fakeDb({ mailbox: smtpMailbox({ kind: 'MICROSOFT', refreshToken: secret }) });
      const raw = makeDsn({
        from,
        authenticationResults: [
          'spf=pass (sender IP is 192.0.2.1) smtp.mailfrom=outlook.com; dkim=pass header.d=outlook.com',
        ],
      });
      const listDsnSince = vi.fn(async () => ({
        messages: [{ key: 'm1', raw, receivedAt: NOW }],
        resumeFrom: null,
      }));
      const { d } = deps(fake, [], {
        transports: {
          smtp: { send: vi.fn(), verify: vi.fn() },
          imap: { read: vi.fn(), verify: vi.fn() },
          oauth: () =>
            ({
              refresh: vi.fn(async () => ({
                accessToken: 'at',
                refreshToken: secret,
                expiresAt: new Date(NOW.getTime() + 3_600_000),
              })),
              listDsnSince,
            }) as never,
          oauthConfigured: { GMAIL: false, MICROSOFT: true },
        } as never,
      });
      await runBounceScan(d);
      return fake;
    };
    // A consumer address shaped like the Exchange sender: provider entitlement does not apply.
    expectNoEffect(
      await microsoft('MicrosoftExchange329e71ec88ae4615bbc36ab6ce41109e@outlook.com')()
    );
    // The provider's reserved system sender still speaks for any recipient.
    const genuine = await microsoft('postmaster@outlook.com')();
    expect(genuine.receipts[0]).toMatchObject({ kind: 'HARD', emailRecordId: 'crec123' });
  });

  it('an Exchange-shaped sender on a consumer provider domain is never entitled, by any path (R-1)', async () => {
    const exchangeAt = (domain: string) =>
      makeDsn({
        from: `MicrosoftExchange329e71ec88ae4615bbc36ab6ce41109e@${domain}`,
        authenticationResults: [`mx.example.invalid; dkim=pass header.d=${domain}`],
        recipients: [{ address: 'gone@hotmail.com', action: 'failed', status: '5.1.1' }],
      });
    // Sending side: the mailbox sends from hotmail.com.
    let fake = fakeDb({
      mailbox: smtpMailbox({ fromAddress: 'me@hotmail.com' }),
      record: record({ toEmail: 'gone@hotmail.com' }),
    });
    await runBounceScan(deps(fake, [{ key: '7:11', raw: exchangeAt('hotmail.com') }]).d);
    expectNoEffect(fake);
    // Recipient side: the victim is at hotmail.com.
    fake = fakeDb({ record: record({ toEmail: 'gone@hotmail.com' }) });
    await runBounceScan(deps(fake, [{ key: '7:11', raw: exchangeAt('hotmail.com') }]).d);
    expectNoEffect(fake);
  });

  it('reads trusted receivers per IMAP host from EMAIL_BOUNCE_TRUSTED_AUTHSERV_IDS (empty by default)', () => {
    expect(trustedReceiversFromEnv({})).toEqual([]);
    expect(
      trustedReceiversFromEnv({
        EMAIL_BOUNCE_TRUSTED_AUTHSERV_IDS:
          ' IMAP.A.example.invalid=MX.A.example.invalid, mx.bare.example.invalid, =x, imap.b.example.invalid= ',
      })
    ).toEqual([{ imapHost: 'imap.a.example.invalid', authservId: 'mx.a.example.invalid' }]);
  });

  it('a receiver trusted for one customer’s IMAP host is not trusted for another mailbox (N-3)', async () => {
    const fake = fakeDb();
    const { d } = deps(fake, [{ key: '7:11', raw: makeDsn() }], {
      trustedReceivers: [
        { imapHost: 'imap.other.example.invalid', authservId: 'mx.example.invalid' },
      ],
    });
    await runBounceScan(d);
    expectNoEffect(fake);
  });

  it('the parent domain of an SMTP/IMAP host is not entitled (hosts count as themselves, N-2)', async () => {
    const fake = fakeDb({
      mailbox: smtpMailbox({
        fromAddress: 'me@mail.example.org',
        smtpHost: 'smtp.platform.example.net',
      }),
    });
    const raw = makeDsn({
      from: 'mailer-daemon@platform.example.net',
      authenticationResults: ['mx.example.invalid; spf=pass smtp.helo=platform.example.net'],
    });
    const { d } = deps(fake, [{ key: '7:11', raw }]);
    await runBounceScan(d);
    expectNoEffect(fake);
  });

  describe('entitlement is directional: a parent may speak for its subdomains, never a child for its parent (codex pre-ship HIGH)', () => {
    const onSub = () => fakeDb({ record: record({ toEmail: 'gone@sub.example.invalid' }) });
    const bounce = (reporter: string, recipient: string) =>
      makeDsn({
        from: `mailer-daemon@${reporter}`,
        authenticationResults: [`mx.example.invalid; dkim=pass header.d=${reporter}`],
        recipients: [{ address: recipient, action: 'failed', status: '5.1.1' }],
      });

    it('a child domain cannot report on its parent (evil.example.invalid -> example.invalid)', async () => {
      const fake = fakeDb();
      const { d } = deps(fake, [
        { key: '7:11', raw: bounce('evil.example.invalid', 'gone@example.invalid') },
      ]);
      await runBounceScan(d);
      expectNoEffect(fake);
    });

    it('a parent domain may report on its subdomain (example.invalid -> sub.example.invalid)', async () => {
      const fake = onSub();
      const { d } = deps(fake, [
        { key: '7:11', raw: bounce('example.invalid', 'gone@sub.example.invalid') },
      ]);
      await runBounceScan(d);
      expect(fake.receipts[0]).toMatchObject({ kind: 'HARD', emailRecordId: 'crec123' });
    });

    it('the recipient’s exact domain may report', async () => {
      const fake = onSub();
      const { d } = deps(fake, [
        { key: '7:11', raw: bounce('sub.example.invalid', 'gone@sub.example.invalid') },
      ]);
      await runBounceScan(d);
      expect(fake.receipts[0]).toMatchObject({ kind: 'HARD', emailRecordId: 'crec123' });
    });

    it('a sibling subdomain cannot report (other.example.invalid -> sub.example.invalid)', async () => {
      const fake = onSub();
      const { d } = deps(fake, [
        { key: '7:11', raw: bounce('other.example.invalid', 'gone@sub.example.invalid') },
      ]);
      await runBounceScan(d);
      expectNoEffect(fake);
    });

    it('the sending side is matched exactly: a subdomain of the mailbox domain or host is not entitled', async () => {
      const fake = fakeDb({
        mailbox: smtpMailbox({ fromAddress: 'me@mail.example.org', smtpHost: 'smtp.example.net' }),
      });
      const { d } = deps(fake, [
        { key: '7:11', raw: bounce('x.mail.example.org', 'gone@example.invalid') },
        { key: '7:12', raw: bounce('x.smtp.example.net', 'gone@example.invalid') },
      ]);
      await runBounceScan(d);
      expect(fake.receipts.every((r: any) => r.kind === 'UNMATCHED')).toBe(true);
      expect(fake.suppressions).toHaveLength(0);
    });
  });

  it('an authenticated Microsoft Exchange NDR (MicrosoftExchange<hex>@) acts (#970)', async () => {
    const fake = fakeDb();
    const ndr = makeDsn({
      from: 'MicrosoftExchange329e71ec88ae4615bbc36ab6ce41109e@example.invalid',
    });
    const { d } = deps(fake, [{ key: '7:11', raw: ndr }]);
    await runBounceScan(d);
    expect(fake.receipts[0]).toMatchObject({ kind: 'HARD', emailRecordId: 'crec123' });
    expect(fake.suppressions).toHaveLength(1);
  });

  it('a spoofed Exchange NDR sender without authentication has no effect (#970)', async () => {
    const fake = fakeDb();
    const spoof = makeDsn({
      from: 'MicrosoftExchange329e71ec88ae4615bbc36ab6ce41109e@example.invalid',
      authenticationResults: [
        'mx.example.invalid; dkim=none; spf=none smtp.mailfrom=example.invalid',
      ],
    });
    const { d } = deps(fake, [{ key: '7:11', raw: spoof }]);
    await runBounceScan(d);
    expectNoEffect(fake);
  });

  it('a report with no Authentication-Results header is stored and has no effect', async () => {
    const fake = fakeDb();
    const { d } = deps(fake, [{ key: '7:11', raw: makeDsn({ authenticationResults: null }) }]);
    await runBounceScan(d);
    expectNoEffect(fake);
  });

  it('a genuine report (mailer-daemon, DKIM/SPF pass for its domain) acts: bounce recorded and suppressed', async () => {
    const fake = fakeDb();
    const { d } = deps(fake, [{ key: '7:11', raw: makeDsn() }]);
    await runBounceScan(d);
    expect(fake.receipts[0]).toMatchObject({
      kind: 'HARD',
      matchConfidence: 'HIGH',
      emailRecordId: 'crec123',
    });
    expect(fake.recordUpdates.at(-1).data.metadata.hardBouncedRecipients).toEqual([
      'gone@example.invalid',
    ]);
    expect(fake.suppressions).toHaveLength(1);
  });
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

  describe('one bad message never fails a scan (codex pre-ship HIGH: untrusted Status disabled the mailbox)', () => {
    it('a delayed notice with a 100-character Status is stored without it; the mailbox stays ACTIVE', async () => {
      const fake = fakeDb();
      const raw = makeDsn({
        recipients: [
          { address: 'gone@example.invalid', action: 'delayed', status: 'x'.repeat(100) },
        ],
      });
      const report = await runBounceScan(deps(fake, [{ key: '7:11', raw }]).d);
      expect(report.failures).toBe(0);
      expect(fake.receipts[0]).toMatchObject({ kind: 'DELAYED', statusCode: null });
      expect(fake.mailboxUpdates[0].data).toMatchObject({ failureCount: 0, imapLastUid: 42 });
    });

    it('a message the database rejects as data is skipped and the scan goes on past it', async () => {
      const fake = fakeDb();
      const create = fake.db.emailBounceReceipt.create.getMockImplementation();
      fake.db.emailBounceReceipt.create.mockImplementationOnce(async () => {
        throw Object.assign(new Error('value too long'), { code: 'P2000' });
      });
      fake.db.emailBounceReceipt.create.mockImplementation(create);
      const report = await runBounceScan(
        deps(fake, [
          { key: '7:11', raw: makeDsn() },
          {
            key: '7:12',
            raw: makeDsn({
              recipients: [{ address: 'ok@example.invalid', action: 'failed', status: '5.1.1' }],
            }),
          },
        ]).d
      );
      expect(report.failures).toBe(0);
      expect(fake.receipts.map((r: any) => r.recipient)).toEqual(['ok@example.invalid']);
      expect(fake.mailboxUpdates[0].data).toMatchObject({ failureCount: 0, imapLastUid: 42 });
    });

    it('a connection-type failure still fails the scan (so nothing is skipped during an outage)', async () => {
      const fake = fakeDb();
      fake.db.emailBounceReceipt.create.mockImplementationOnce(async () => {
        throw Object.assign(new Error('db unreachable'), { code: 'P1001' });
      });
      const report = await runBounceScan(deps(fake, [{ key: '7:11', raw: makeDsn() }]).d);
      expect(report.failures).toBe(1);
    });

    it('an over-long message key is stored hashed, within its column', async () => {
      const fake = fakeDb();
      await runBounceScan(deps(fake, [{ key: 'k'.repeat(300), raw: makeDsn() }]).d);
      expect(fake.receipts[0].dsnKey.length).toBeLessThanOrEqual(255);
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

  it('serialises soft-bounce counting per tenant and recipient, before the receipt is stored', async () => {
    const soft = makeDsn({
      recipients: [{ address: 'gone@example.invalid', action: 'failed', status: '4.2.2' }],
    });
    const fake = fakeDb({ softCount: 1 });
    const order: string[] = [];
    fake.db.$executeRaw.mockImplementation(async () => {
      order.push('lock');
      return 1;
    });
    const create = fake.db.emailBounceReceipt.create.getMockImplementation();
    fake.db.emailBounceReceipt.create.mockImplementation(async (args: any) => {
      order.push('receipt');
      return create(args);
    });
    await runBounceScan(deps(fake, [{ key: '7:11', raw: soft }]).d);
    // Without it, two scans of different mailboxes could each count before the
    // other committed and both miss the threshold.
    expect(order).toEqual(['lock', 'receipt']);
    const sql = String((fake.db.$executeRaw.mock.calls[0] as any)[0].join('?'));
    expect(sql).toContain('pg_advisory_xact_lock');
    expect((fake.db.$executeRaw.mock.calls[0] as any).slice(1)).toEqual([
      'email-soft-bounce:tenant-1:gone@example.invalid',
    ]);
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
      // Gmail stamps its own Authentication-Results as mx.google.com.
      messages: [
        {
          key: 'gm1',
          raw: makeDsn({
            authenticationResults: ['mx.google.com; dkim=pass header.d=example.invalid'],
          }),
          receivedAt: NOW,
        },
      ],
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
