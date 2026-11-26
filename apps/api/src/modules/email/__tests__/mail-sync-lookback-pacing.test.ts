/**
 * Customer issue register #58 (mail look-back rate limited). After a 163-lead COA sync the look-back
 * asked one Gmail mailbox for 90 days of mail with 163 addresses, was refused (RATE_LIMITED) on every
 * tick, and each refusal became an error span, so the owner was alerted every 6 minutes.
 *
 * Guards: passes are spaced and a long pass goes on in steps (a pass reads the whole window once, so
 * tiny batches would only re-read the mailbox); a refusal waits with a stored, exponential next attempt; a
 * handled refusal is a warning, never an error; only a mailbox with no progress for 6 h or more
 * alerts (an error line carrying the tenant); the progress shown to the customer is the stored count.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MailboxTransportError } from '@intelliflow/adapters';
import type { MailSyncReader, SyncFolder } from '../mail-sync-reader';
import {
  BACKOFF_BASE_MS,
  PASS_ADDRESSES,
  PASS_GAP_MS,
  ROUND_GAP_MS,
  STALL_ALERT_MS,
  backoffDelayMs,
  lookbackProgress,
  runLookback,
  type LookbackContext,
} from '../mail-sync-lookback';
import { round } from './inbox-sync-harness';

const NOW = new Date('2026-11-26T10:00:00.000Z');
const T1 = new Date('2026-11-20T10:00:00.000Z');

type Row = { email: string; createdAt: Date };

function fakePrisma(leads: Row[]) {
  const matching = (args: any) =>
    leads
      .filter(
        (r) => r.createdAt > args.where.createdAt.gt && r.createdAt <= args.where.createdAt.lte
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return {
    lead: {
      findMany: vi.fn(async (args: any) => {
        const rows = matching(args);
        return args.take ? rows.slice(0, args.take) : rows;
      }),
      count: vi.fn(async (args: any) => matching(args).length),
    },
    contact: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
  };
}

const manyLeads = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    email: `lead${i}@example.invalid`,
    createdAt: new Date(T1.getTime() + i * 1000),
  }));

function context(leads: Row[], mailbox: Partial<LookbackContext['mailbox']>, now = NOW) {
  const read = vi.fn(async (_args: { folder: SyncFolder }) =>
    round({ messages: [], cursor: null, complete: true })
  );
  const reader: MailSyncReader = {
    provider: 'GMAIL',
    canRead: () => true,
    read: read as unknown as MailSyncReader['read'],
  };
  const ctx: LookbackContext = {
    prisma: fakePrisma(leads),
    reader,
    mailbox: {
      id: 'mbx-1',
      tenantId: 'tenant-1',
      lookbackWatermark: null,
      lookbackUntil: null,
      lookbackCursor: null,
      lookbackSentCursor: null,
      ...mailbox,
    },
    token: 'access-for-tests',
    now,
    clock: () => now,
    deadline: now.getTime() + 60_000,
    storeBy: now.getTime() + 120_000,
    store: vi.fn(async () => 'stored'),
  };
  return { ctx, read };
}

const refused = () => new MailboxTransportError('RATE_LIMITED');

afterEach(() => vi.restoreAllMocks());

describe('pacing', () => {
  it('splits a 163-address import into spaced batches, none above PASS_ADDRESSES', async () => {
    const leads = manyLeads(163);
    let mailbox: Partial<LookbackContext['mailbox']> = {};
    let now = NOW;
    const batches: number[] = [];
    for (let pass = 0; pass < 40; pass++) {
      const { ctx } = context(leads, mailbox, now);
      const before = mailbox.lookbackWatermark ?? new Date(0);
      const result = await runLookback(ctx);
      const watermark = result.data.lookbackWatermark as Date | undefined;
      if (!watermark) break;
      batches.push(leads.filter((l) => l.createdAt > before && l.createdAt <= watermark).length);
      const nextAt = result.data.lookbackNextAt as Date;
      // The next batch waits PASS_GAP_MS: it does not follow straight away.
      expect(nextAt.getTime()).toBe(now.getTime() + PASS_GAP_MS);
      expect(result.more).toBe(false);
      mailbox = {
        lookbackWatermark: watermark,
        lookbackNextAt: nextAt,
        lookbackImportTotal: result.data.lookbackImportTotal as number,
        lookbackImportDone: result.data.lookbackImportDone as number,
      };
      now = new Date(nextAt.getTime() + 1);
    }
    expect(Math.max(...batches)).toBeLessThanOrEqual(PASS_ADDRESSES);
    expect(batches.length).toBe(Math.ceil(163 / PASS_ADDRESSES));
    expect(batches.reduce((a, b) => a + b, 0)).toBe(163);
    expect(mailbox.lookbackImportDone).toBe(163);
  });

  it('does nothing while the next attempt is in the future', async () => {
    const { ctx, read } = context(manyLeads(5), {
      lookbackNextAt: new Date(NOW.getTime() + 60_000),
    });
    expect(await runLookback(ctx)).toEqual({ data: {}, more: false, stored: 0 });
    expect(read).not.toHaveBeenCalled();
  });

  it('stores real counts when an import starts', async () => {
    const { ctx } = context(manyLeads(PASS_ADDRESSES + 30), {});
    const result = await runLookback(ctx);
    expect(result.data.lookbackImportTotal).toBe(PASS_ADDRESSES + 30);
    // The first batch is done; the rest is counted as still to do.
    expect(result.data.lookbackImportDone).toBe(PASS_ADDRESSES);
  });

  it('clears the shown import once everything is looked for', async () => {
    const { ctx } = context([], {
      lookbackWatermark: T1,
      lookbackImportTotal: 163,
      lookbackImportDone: 163,
    });
    expect((await runLookback(ctx)).data).toEqual({
      lookbackImportTotal: null,
      lookbackImportDone: 0,
      lookbackBackoffCount: 0,
      lookbackProgressAt: null,
    });
  });
});

describe('a rate-limited round', () => {
  it('waits: stores an exponential next attempt and keeps the pass it started', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { ctx, read } = context(manyLeads(5), { lookbackBackoffCount: 1 });
    read.mockRejectedValue(refused());

    const result = await runLookback(ctx);

    expect(result.more).toBe(false);
    expect(result.data.lookbackBackoffCount).toBe(2);
    expect(result.data.lookbackNextAt).toEqual(new Date(NOW.getTime() + BACKOFF_BASE_MS * 2));
    expect(result.data.lookbackUntil).toBeInstanceOf(Date);
    expect(result.data.lookbackWatermark).toBeUndefined();
  });

  it('does not ask again before the stored time (it waits instead of retrying every tick)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const first = context(manyLeads(5), {});
    first.read.mockRejectedValue(refused());
    const { data } = await runLookback(first.ctx);

    const later = context(manyLeads(5), data as Partial<LookbackContext['mailbox']>);
    later.read.mockRejectedValue(refused());
    const tick = await runLookback(later.ctx);

    expect(tick.data).toEqual({});
    expect(later.read).not.toHaveBeenCalled();
  });

  it('backs off 15 min, 30 min, 1 h and never above 6 h', () => {
    expect(backoffDelayMs(1)).toBe(15 * 60_000);
    expect(backoffDelayMs(2)).toBe(30 * 60_000);
    expect(backoffDelayMs(3)).toBe(60 * 60_000);
    expect(backoffDelayMs(50)).toBe(6 * 3_600_000);
  });

  it('is a warning and not an error (no error span)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { ctx, read } = context(manyLeads(5), {});
    read.mockRejectedValue(refused());

    await expect(runLookback(ctx)).resolves.toBeDefined();

    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('paused by the provider limits'),
      expect.objectContaining({ tenantId: 'tenant-1', mailboxId: 'mbx-1' })
    );
  });

  it('alerts, with the tenant, only after 6 h without progress', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const recentProgress = new Date(NOW.getTime() - 3_600_000);
    const recent = context(manyLeads(5), { lookbackUntil: T1, lookbackProgressAt: recentProgress });
    recent.read.mockRejectedValue(refused());
    await runLookback(recent.ctx);
    expect(error).not.toHaveBeenCalled();

    const staleProgress = new Date(NOW.getTime() - STALL_ALERT_MS - 1000);
    const stale = context(manyLeads(5), { lookbackUntil: T1, lookbackProgressAt: staleProgress });
    stale.read.mockRejectedValue(refused());
    const result = await runLookback(stale.ctx);

    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('no progress for 6 h'),
      expect.objectContaining({ tenantId: 'tenant-1' })
    );
    // A refusal is not progress: the clock the alert counts from does not move.
    expect(result.data.lookbackProgressAt).toEqual(staleProgress);
  });

  it('an answered round is progress: the counter and the wait are cleared', async () => {
    const { ctx } = context(manyLeads(5), {
      lookbackBackoffCount: 3,
      lookbackNextAt: new Date(NOW.getTime() - 1),
    });
    const result = await runLookback(ctx);
    expect(result.data.lookbackProgressAt).toEqual(NOW);
    expect(result.data.lookbackBackoffCount).toBe(0);
    expect(result.data.lookbackNextAt).toEqual(new Date(NOW.getTime() + PASS_GAP_MS));
  });

  it('a mailbox idle for days is not reported as stalled when its next pass is refused', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const idleSince = new Date(NOW.getTime() - 10 * 24 * 3_600_000);
    const { ctx, read } = context(manyLeads(5), {
      lookbackWatermark: new Date(T1.getTime() - 1),
      lookbackProgressAt: idleSince,
    });
    read.mockRejectedValue(refused());

    const result = await runLookback(ctx);

    // The new pass started the clock again at this tick.
    expect(error).not.toHaveBeenCalled();
    expect(result.data.lookbackProgressAt).toEqual(NOW);
  });

  it('a round that read neither folder (no read time left) is not progress', async () => {
    const { ctx, read } = context(manyLeads(5), {
      lookbackUntil: T1,
      lookbackBackoffCount: 2,
      lookbackProgressAt: new Date(NOW.getTime() - 3_600_000),
    });
    ctx.deadline = NOW.getTime() - 1;

    const result = await runLookback(ctx);

    expect(read).not.toHaveBeenCalled();
    expect(result.data).toEqual({});
    expect(result.more).toBe(true);
  });

  it('a folder already DONE and no read time left for the other is not progress', async () => {
    const { ctx, read } = context(manyLeads(5), {
      lookbackUntil: T1,
      lookbackSentCursor: 'DONE',
      lookbackBackoffCount: 2,
      lookbackProgressAt: new Date(NOW.getTime() - 3_600_000),
    });
    ctx.deadline = NOW.getTime() - 1;

    const result = await runLookback(ctx);

    expect(read).not.toHaveBeenCalled();
    expect(result.data).toEqual({ lookbackSentCursor: 'DONE' });
    expect(result.data).not.toHaveProperty('lookbackProgressAt');
    expect(result.data).not.toHaveProperty('lookbackBackoffCount');
  });

  it('Sent moving on counts as progress even when the Inbox read is then refused', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const stale = new Date(NOW.getTime() - STALL_ALERT_MS - 1000);
    const { ctx, read } = context(manyLeads(5), { lookbackUntil: T1, lookbackProgressAt: stale });
    read.mockImplementation(async (args: { folder: SyncFolder }) => {
      if (args.folder === 'inbox') throw refused();
      return round({ messages: [], cursor: 'sent-page-2', complete: false });
    });

    const result = await runLookback(ctx);

    expect(error).not.toHaveBeenCalled();
    expect(result.data.lookbackSentCursor).toBe('sent-page-2');
    expect(result.data.lookbackProgressAt).toEqual(NOW);
  });

  it('a pass goes on in steps: a gap between two rounds of one pass', async () => {
    const { ctx } = context(manyLeads(5), {});
    const first = ctx.reader.read as unknown as ReturnType<typeof vi.fn>;
    first.mockResolvedValue(round({ messages: [], cursor: 'page-2', complete: false }));

    const result = await runLookback(ctx);

    expect(result.more).toBe(true);
    expect(result.data.lookbackNextAt).toEqual(new Date(NOW.getTime() + ROUND_GAP_MS));
    expect(result.data.lookbackCursor).toBe('page-2');
  });

  it('any provider error backs off too (not a retry on every tick), as a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { ctx, read } = context(manyLeads(5), {});
    read.mockRejectedValue(new MailboxTransportError('CONNECT_FAILED'));

    const result = await runLookback(ctx);

    expect(result.data.lookbackBackoffCount).toBe(1);
    expect(result.data.lookbackNextAt).toEqual(new Date(NOW.getTime() + BACKOFF_BASE_MS));
    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('provider error'),
      expect.objectContaining({ code: 'CONNECT_FAILED' })
    );
  });

  it('any other failure is still only a warning and never throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { ctx, read } = context(manyLeads(5), {});
    read.mockRejectedValue(new Error('boom'));
    await expect(runLookback(ctx)).resolves.toEqual({ data: {}, more: false, stored: 0 });
    expect(error).not.toHaveBeenCalled();
  });
});

describe('what the customer sees (stored progress)', () => {
  const importing = { lookbackImportTotal: 163, lookbackImportDone: 40 };

  it('is null when nothing is importing', () => {
    expect(lookbackProgress({ lookbackImportTotal: null, lookbackImportDone: 0 }, NOW)).toBeNull();
  });

  it('is paused only while a provider refusal is waiting', () => {
    const waiting = { ...importing, lookbackNextAt: new Date(NOW.getTime() + 60_000) };
    expect(lookbackProgress({ ...waiting, lookbackBackoffCount: 2 }, NOW)).toEqual({
      done: 40,
      total: 163,
      paused: true,
    });
    // Waiting between paced batches is not a pause.
    expect(lookbackProgress({ ...waiting, lookbackBackoffCount: 0 }, NOW)?.paused).toBe(false);
    // The wait is over: running again.
    expect(
      lookbackProgress(
        { ...importing, lookbackNextAt: new Date(NOW.getTime() - 1), lookbackBackoffCount: 2 },
        NOW
      )?.paused
    ).toBe(false);
  });

  it('never shows more done than total', () => {
    expect(
      lookbackProgress({ lookbackImportTotal: 10, lookbackImportDone: 99 }, NOW)
    ).toMatchObject({ done: 10, total: 10 });
  });
});
