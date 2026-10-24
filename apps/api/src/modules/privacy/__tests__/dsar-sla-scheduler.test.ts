/**
 * PG-203 D8 — DSAR deadline alerts (spec "SLA job", security should-fixes 6 and 7).
 *
 * The sweep runs against a fake store and a fake clock; the Prisma store is checked against
 * a recording client here and against a real database in tests/integration/dsar.test.ts.
 * The sender is a stub: Resend is never called.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DSAR_SLA_INTERVAL_MS,
  DSAR_SLA_BATCH,
  DSAR_SLA_LOCK_KEY,
  DSAR_SLA_RETRY_MS,
  createPrismaDsarSlaStore,
  dsarSlaIntervalFromEnv,
  runDsarSlaSweep,
  startDsarSlaScheduler,
  stopDsarSlaScheduler,
  type DsarSlaDeps,
  type DsarSlaPrisma,
  type DsarSlaTx,
  type DueDsarRequest,
} from '../dsar-sla-scheduler';

const NOW = new Date('2026-11-01T09:00:00Z');
const DAY = 86_400_000;
const APP_URL = 'https://app.example.invalid';
const PAGE = `${APP_URL}/settings/privacy-requests`;

afterEach(() => {
  stopDsarSlaScheduler();
  vi.useRealTimers();
});

describe('dsarSlaIntervalFromEnv', () => {
  it('is off under test and on serverless runtimes', () => {
    expect(dsarSlaIntervalFromEnv({ NODE_ENV: 'test' })).toBe(0);
    expect(dsarSlaIntervalFromEnv({ VITEST: 'true' })).toBe(0);
    expect(dsarSlaIntervalFromEnv({ VERCEL: '1' })).toBe(0);
    expect(dsarSlaIntervalFromEnv({ AWS_LAMBDA_FUNCTION_NAME: 'f' })).toBe(0);
  });

  it('defaults to one hour and honours a valid override (0 disables)', () => {
    expect(DEFAULT_DSAR_SLA_INTERVAL_MS).toBe(3_600_000);
    expect(dsarSlaIntervalFromEnv({})).toBe(3_600_000);
    expect(dsarSlaIntervalFromEnv({ DSAR_SLA_INTERVAL_MS: ' ' })).toBe(3_600_000);
    expect(dsarSlaIntervalFromEnv({ DSAR_SLA_INTERVAL_MS: '600000' })).toBe(600_000);
    expect(dsarSlaIntervalFromEnv({ DSAR_SLA_INTERVAL_MS: '0' })).toBe(0);
    expect(dsarSlaIntervalFromEnv({ DSAR_SLA_INTERVAL_MS: 'soon' })).toBe(3_600_000);
    expect(dsarSlaIntervalFromEnv({ DSAR_SLA_INTERVAL_MS: '-1' })).toBe(3_600_000);
  });
});

describe('startDsarSlaScheduler', () => {
  const log = { info: vi.fn(), warn: vi.fn() };

  it('does not start when disabled or twice', () => {
    expect(startDsarSlaScheduler({ intervalMs: 0, run: vi.fn(), log })).toBe(false);
    expect(startDsarSlaScheduler({ intervalMs: 1000, run: vi.fn(async () => null), log })).toBe(
      true
    );
    expect(startDsarSlaScheduler({ intervalMs: 1000, run: vi.fn(), log })).toBe(false);
    expect(log.info).toHaveBeenCalledWith('[dsar-sla] started (every 1000 ms)');
  });

  it('runs on the interval, skips an overlapping tick and logs a failure by message only', async () => {
    vi.useFakeTimers();
    let finishFirst: () => void = () => undefined;
    const run = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (finishFirst = resolve)))
      .mockRejectedValueOnce(new Error('boom'));
    startDsarSlaScheduler({ intervalMs: 1000, run, log });
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000); // the first tick is still running: skipped
    expect(run).toHaveBeenCalledTimes(1);
    finishFirst();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(log.warn).toHaveBeenCalledWith('[dsar-sla] tick failed: boom');
  });

  it('stops for good: no tick runs after stopDsarSlaScheduler', async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => null);
    startDsarSlaScheduler({ intervalMs: 1000, run, log });
    stopDsarSlaScheduler();
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).not.toHaveBeenCalled();
  });
});

// ── The sweep ────────────────────────────────────────────────────────────────

function due(overrides: Partial<DueDsarRequest> = {}): DueDsarRequest {
  return {
    id: 'clhdsar000000000001',
    tenantId: 'tenant-a',
    type: 'ERASURE',
    deadline: new Date(NOW.getTime() + 5 * DAY),
    ...overrides,
  };
}

/** Behaves like the database: a marked request is no longer due, an excluded one is skipped. */
function fakeStore(rows: DueDsarRequest[], recipients: Record<string, string[]> = {}) {
  const marked = new Set<string>();
  const tx = {
    claimDue: vi.fn<DsarSlaTx['claimDue']>(async (_now, limit, excludeIds) =>
      rows.filter((row) => !excludeIds.includes(row.id) && !marked.has(row.id)).slice(0, limit)
    ),
    recipients: vi.fn<DsarSlaTx['recipients']>(async (tenantId) => recipients[tenantId] ?? []),
    markAlerted: vi.fn<DsarSlaTx['markAlerted']>(async (id) => {
      marked.add(id);
    }),
  };
  let freeTransactions = Number.POSITIVE_INFINITY;
  let lockCalls = 0;
  const store = {
    withSweepLock<T>(fn: (t: DsarSlaTx) => Promise<T>): Promise<T | null> {
      lockCalls += 1;
      if (freeTransactions <= 0) return Promise.resolve(null);
      freeTransactions -= 1;
      return fn(tx);
    },
    /** Another replica takes the lock after `afterTransactions` of ours. */
    holdLockElsewhere(afterTransactions = 0) {
      freeTransactions = afterTransactions;
    },
    lockCalls: () => lockCalls,
  };
  return { store, tx };
}

function deps(store: DsarSlaDeps['store'], sendResult: boolean | Error = true) {
  const sendEmail = vi.fn<(email: SentEmail) => Promise<{ isFailure: boolean }>>(async () => {
    if (sendResult instanceof Error) throw sendResult;
    return { isFailure: !sendResult };
  });
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const deferred = new Map<string, number>();
  const value: DsarSlaDeps = {
    store,
    sender: { sendEmail },
    appUrl: () => APP_URL,
    now: () => NOW,
    log,
    deferred,
  };
  return { value, sendEmail, log, deferred };
}

type SentEmail = { to: string[]; subject: string; htmlBody: string; textBody: string };

describe('runDsarSlaSweep', () => {
  it('does nothing while another replica holds the sweep lock', async () => {
    const { store, tx } = fakeStore([due()], { 'tenant-a': ['admin@example.invalid'] });
    store.holdLockElsewhere();
    const { value, sendEmail } = deps(store);
    await expect(runDsarSlaSweep(value)).resolves.toEqual({ skipped: 'LOCKED' });
    expect(tx.claimDue).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('claims nothing when no email sender is configured', async () => {
    const { store } = fakeStore([due()]);
    const { value, log } = deps(store);
    await expect(runDsarSlaSweep({ ...value, sender: undefined })).resolves.toEqual({
      skipped: 'NO_SENDER',
    });
    expect(store.lockCalls()).toBe(0);
    expect(log.warn).toHaveBeenCalledWith('[dsar-sla] No email sender configured');
  });

  it('alerts the admins with the type, deadline, reference and page only, then marks it sent', async () => {
    const { store, tx } = fakeStore([due()], {
      'tenant-a': ['admin1@example.invalid', 'admin2@example.invalid'],
    });
    const { value, sendEmail } = deps(store);

    await expect(runDsarSlaSweep(value)).resolves.toEqual({
      claimed: 1,
      alerted: 1,
      failed: 0,
      noRecipient: 0,
    });

    // One request per transaction: its marker commits before the next send (codex).
    expect(tx.claimDue).toHaveBeenCalledWith(NOW, 1, []);
    const email = (sendEmail.mock.calls[0] as unknown as [SentEmail])[0];
    expect(email.to).toEqual(['admin1@example.invalid', 'admin2@example.invalid']);
    expect(email.subject).toBe('Data subject request due soon');
    expect(email.textBody).toContain('(erasure)');
    expect(email.textBody).toContain('6 November 2026');
    expect(email.textBody).toContain('clhdsar000000000001');
    expect(email.textBody).toContain(PAGE);
    expect(email.htmlBody).toContain(`href="${PAGE}"`);
    // Set only after the provider accepted the message (should-fix 6).
    expect(tx.markAlerted).toHaveBeenCalledWith('clhdsar000000000001', NOW);
    expect(sendEmail.mock.invocationCallOrder[0]).toBeLessThan(
      tx.markAlerted.mock.invocationCallOrder[0]!
    );
  });

  it('links the page once even when APP_URL ends in slashes', async () => {
    const { store } = fakeStore([due()], { 'tenant-a': ['admin@example.invalid'] });
    const { value, sendEmail } = deps(store);
    await runDsarSlaSweep({ ...value, appUrl: () => `${APP_URL}//` });
    const email = (sendEmail.mock.calls[0] as unknown as [SentEmail])[0];
    expect(email.textBody).toContain(`: ${PAGE}`);
  });

  it('says overdue once the effective deadline has passed', async () => {
    const { store } = fakeStore([due({ deadline: new Date(NOW.getTime() - 2 * DAY) })], {
      'tenant-a': ['admin@example.invalid'],
    });
    const { value, sendEmail } = deps(store);
    await runDsarSlaSweep(value);
    const email = (sendEmail.mock.calls[0] as unknown as [SentEmail])[0];
    expect(email.subject).toBe('Data subject request overdue');
    expect(email.textBody).toContain('30 October 2026');
    expect(email.textBody).toContain('Article 12(3)');
  });

  it('leaves the request unmarked when the provider refuses, so the next tick retries', async () => {
    const { store, tx } = fakeStore([due()], { 'tenant-a': ['admin@example.invalid'] });
    const { value, log } = deps(store, false);
    await expect(runDsarSlaSweep(value)).resolves.toMatchObject({ alerted: 0, failed: 1 });
    expect(tx.markAlerted).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith('[dsar] Email was not sent', { kind: 'ADMIN_SLA' });
  });

  it('leaves it unmarked when the provider throws, logging the error class only', async () => {
    const { store, tx } = fakeStore([due()], { 'tenant-a': ['admin@example.invalid'] });
    const { value, log } = deps(store, new TypeError('admin@example.invalid rejected'));
    await expect(runDsarSlaSweep(value)).resolves.toMatchObject({ failed: 1 });
    expect(tx.markAlerted).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith('[dsar] Email failed', {
      kind: 'ADMIN_SLA',
      error: 'TypeError',
    });
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain('admin@example.invalid');
  });

  it('logs once per firm with no admin or owner, by tenant id only, and marks nothing', async () => {
    const rows = [
      due({ id: 'r1', tenantId: 'tenant-empty' }),
      due({ id: 'r2', tenantId: 'tenant-empty' }),
    ];
    const { store, tx } = fakeStore(rows);
    const { value, sendEmail, log } = deps(store);
    await expect(runDsarSlaSweep(value)).resolves.toEqual({
      claimed: 2,
      alerted: 0,
      failed: 0,
      noRecipient: 2,
    });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(tx.markAlerted).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith('[dsar-sla] No admin or owner to alert', {
      tenantId: 'tenant-empty',
    });
  });

  it('looks each firm up once per tick and alerts every request on its own', async () => {
    const rows = [
      due({ id: 'r1' }),
      due({ id: 'r2', tenantId: 'tenant-b', type: 'ACCESS' }),
      due({ id: 'r3' }),
    ];
    const { store, tx } = fakeStore(rows, {
      'tenant-a': ['a@example.invalid'],
      'tenant-b': ['b@example.invalid'],
    });
    const { value, sendEmail } = deps(store);
    await expect(runDsarSlaSweep(value)).resolves.toMatchObject({ claimed: 3, alerted: 3 });
    expect(tx.recipients).toHaveBeenCalledTimes(2);
    expect(sendEmail).toHaveBeenCalledTimes(3);
    expect(tx.markAlerted.mock.calls.map((c) => c[0])).toEqual(['r1', 'r2', 'r3']);
  });

  it('stops at the batch size, and stops when another replica takes the lock mid-tick', async () => {
    const rows = Array.from({ length: DSAR_SLA_BATCH + 5 }, (_, i) => due({ id: `r${i}` }));
    const full = fakeStore(rows, { 'tenant-a': ['a@example.invalid'] });
    await expect(runDsarSlaSweep(deps(full.store).value)).resolves.toMatchObject({
      claimed: DSAR_SLA_BATCH,
      alerted: DSAR_SLA_BATCH,
    });

    const shared = fakeStore(rows, { 'tenant-a': ['a@example.invalid'] });
    shared.store.holdLockElsewhere(2);
    await expect(runDsarSlaSweep(deps(shared.store).value)).resolves.toEqual({
      claimed: 2,
      alerted: 2,
      failed: 0,
      noRecipient: 0,
    });
  });

  it('puts a request it could not alert aside for 6 hours, so later requests are not starved (codex)', async () => {
    const rows = [
      due({ id: 'refused' }),
      due({ id: 'nobody', tenantId: 'tenant-empty' }),
      due({ id: 'sent', tenantId: 'tenant-b' }),
    ];
    const { store, tx } = fakeStore(rows, {
      'tenant-a': ['a@example.invalid'],
      'tenant-b': ['b@example.invalid'],
    });
    const { value, sendEmail, deferred } = deps(store);
    sendEmail.mockImplementation(async (email: { textBody: string }) => ({
      isFailure: email.textBody.includes('refused'),
    }));

    await runDsarSlaSweep(value);
    const retryAt = NOW.getTime() + DSAR_SLA_RETRY_MS;
    expect([...deferred]).toEqual([
      ['refused', retryAt],
      ['nobody', retryAt],
    ]);

    // The next tick claims past them …
    await runDsarSlaSweep({ ...value, now: () => new Date(NOW.getTime() + 3_600_000) });
    expect(tx.claimDue).toHaveBeenLastCalledWith(expect.any(Date), 1, ['refused', 'nobody']);

    // … and once the 6 hours are up they are tried again.
    const before = tx.claimDue.mock.calls.length;
    await runDsarSlaSweep({ ...value, now: () => new Date(retryAt) });
    expect(tx.claimDue.mock.calls[before]).toEqual([new Date(retryAt), 1, []]);
  });
});

// ── The Prisma store (recording client) ──────────────────────────────────────

function recordingPrisma(options: { locked: boolean; admins?: string[]; owner?: string | null }) {
  const sql: string[] = [];
  const values: unknown[][] = [];
  const record = (strings: TemplateStringsArray, ...args: unknown[]) => {
    sql.push(strings.join('?'));
    values.push(args);
  };
  const tx = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...args: unknown[]) => {
      record(strings, ...args);
      if (strings.join('').includes('pg_try_advisory_xact_lock')) {
        return [{ locked: options.locked }];
      }
      return [
        {
          id: 'r1',
          tenantId: 'tenant-a',
          type: 'ACCESS',
          deadline: new Date(NOW.getTime() + DAY),
        },
      ];
    }),
    $executeRaw: vi.fn(async (strings: TemplateStringsArray, ...args: unknown[]) => {
      record(strings, ...args);
      return 1;
    }),
    user: {
      findMany: vi.fn(async () => (options.admins ?? []).map((email) => ({ email }))),
      findFirst: vi.fn(async () => (options.owner ? { email: options.owner } : null)),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { prisma: prisma as unknown as DsarSlaPrisma, raw: prisma, tx, sql, values };
}

describe('createPrismaDsarSlaStore', () => {
  it('returns null without running the body when the advisory lock is taken', async () => {
    const { prisma, sql, values } = recordingPrisma({ locked: false });
    const body = vi.fn();
    await expect(createPrismaDsarSlaStore(prisma).withSweepLock(body)).resolves.toBeNull();
    expect(body).not.toHaveBeenCalled();
    expect(sql[0]).toContain('pg_try_advisory_xact_lock');
    expect(values[0]).toEqual([DSAR_SLA_LOCK_KEY]);
  });

  it('claims VERIFIED rows on the effective deadline with SKIP LOCKED and a 3-day repeat', async () => {
    const { prisma, raw, sql, values } = recordingPrisma({ locked: true });
    const rows = await createPrismaDsarSlaStore(prisma).withSweepLock((tx) =>
      tx.claimDue(NOW, 25, ['put-aside'])
    );
    expect(rows).toEqual([
      { id: 'r1', tenantId: 'tenant-a', type: 'ACCESS', deadline: new Date(NOW.getTime() + DAY) },
    ]);
    const claim = sql[1]!;
    expect(claim).toContain(`status = 'VERIFIED'`);
    expect(claim).toContain(`COALESCE("extendedUntil", "slaDeadline")`);
    expect(claim).toContain('FOR UPDATE SKIP LOCKED');
    expect(claim).toContain('NOT (id = ANY(?))');
    expect(values[1]).toEqual([
      new Date(NOW.getTime() + 7 * DAY), // inside 7 days of the deadline
      7, // an alert sent before this window (the deadline moved) does not count
      NOW, // overdue …
      new Date(NOW.getTime() - 3 * DAY), // … repeats every 3 days
      ['put-aside'], // requests this process could not alert, for now
      25,
    ]);
    // The body runs inside one interactive transaction, long enough for a batch of sends.
    expect(raw.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 10_000,
      timeout: 60_000,
    });
  });

  it('marks a request alerted without touching anything else', async () => {
    const { prisma, sql, values } = recordingPrisma({ locked: true });
    await createPrismaDsarSlaStore(prisma).withSweepLock((tx) => tx.markAlerted('r1', NOW));
    expect(sql[1]).toContain('UPDATE dsar_requests SET "slaAlertedAt"');
    expect(values[1]).toEqual([NOW, 'r1']);
  });

  it("sends to the firm's own active admins", async () => {
    const { prisma, tx } = recordingPrisma({
      locked: true,
      admins: ['a1@example.invalid', 'a2@example.invalid'],
      owner: 'owner@example.invalid',
    });
    await expect(
      createPrismaDsarSlaStore(prisma).withSweepLock((t) => t.recipients('tenant-a'))
    ).resolves.toEqual(['a1@example.invalid', 'a2@example.invalid']);
    expect(tx.user.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        role: 'ADMIN',
        NOT: { memberships: { some: { tenantId: 'tenant-a', revokedAt: { not: null } } } },
      },
      select: { email: true },
    });
    expect(tx.user.findFirst).not.toHaveBeenCalled();
  });

  it('falls back to the earliest active user of the firm (its owner), else nobody', async () => {
    const withOwner = recordingPrisma({ locked: true, owner: 'owner@example.invalid' });
    await expect(
      createPrismaDsarSlaStore(withOwner.prisma).withSweepLock((t) => t.recipients('tenant-a'))
    ).resolves.toEqual(['owner@example.invalid']);
    expect(withOwner.tx.user.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        NOT: { memberships: { some: { tenantId: 'tenant-a', revokedAt: { not: null } } } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { email: true },
    });

    const empty = recordingPrisma({ locked: true, owner: null });
    await expect(
      createPrismaDsarSlaStore(empty.prisma).withSweepLock((t) => t.recipients('tenant-a'))
    ).resolves.toEqual([]);
  });
});
