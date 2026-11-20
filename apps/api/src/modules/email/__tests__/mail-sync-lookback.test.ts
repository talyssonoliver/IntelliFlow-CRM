/**
 * MVP-011: the history look-back. Driven by a test reader and a fake store; the engine's own
 * wiring (budgets, release, no enquiry leads or reply drafts) is in outlook-inbox-sync-lookback.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import type { MailSyncReader, SyncFolder, SyncRound, SyncedMessage } from '../mail-sync-reader';
import {
  FOLDER_DONE,
  LOOKBACK_DAYS,
  PASS_ADDRESSES,
  runLookback,
  type LookbackContext,
} from '../mail-sync-lookback';
import { mail, round } from './inbox-sync-harness';

const NOW = new Date('2026-11-20T00:30:00.000Z');
const T1 = new Date('2026-11-17T10:00:00.000Z');
const T2 = new Date('2026-11-18T10:00:00.000Z');
const T3 = new Date('2026-11-19T10:00:00.000Z');

type Row = { email: string | null; createdAt: Date; tenantId?: string };

function fakePrisma(leads: Row[], contacts: Row[] = []) {
  const find = (rows: Row[]) =>
    vi.fn(async (args: any) => {
      const { gt, lte } = args.where.createdAt;
      const out = rows
        .filter((r) => (r.tenantId ?? 'tenant-1') === args.where.tenantId)
        // like SQL "email <> ''": a null address never passes
        .filter((r) => r.email !== null && r.email !== args.where.email.not)
        .filter((r) => r.createdAt > gt && (!lte || r.createdAt <= lte))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      return args.take ? out.slice(0, args.take) : out;
    });
  return { lead: { findMany: find(leads) }, contact: { findMany: find(contacts) } };
}

interface Setup {
  leads?: Row[];
  contacts?: Row[];
  mailbox?: Partial<LookbackContext['mailbox']>;
  sent?: SyncRound[];
  inbox?: SyncRound[];
  storeBy?: number;
  clock?: () => Date;
}

function setup(options: Setup = {}) {
  const queues: Record<SyncFolder, SyncRound[]> = {
    sentitems: [...(options.sent ?? [round({ messages: [], cursor: 'sent-end' })])],
    inbox: [...(options.inbox ?? [round({ messages: [], cursor: 'inbox-end' })])],
  };
  const read = vi.fn(async (args: { folder: SyncFolder }) => {
    return queues[args.folder].shift() ?? round({ messages: [], cursor: 'none' });
  });
  const reader: MailSyncReader = {
    provider: 'ZOHO',
    canRead: () => true,
    read: read as unknown as MailSyncReader['read'],
  };
  const stored: Array<{ id: string; folder: SyncFolder }> = [];
  const store = vi.fn(async (message: SyncedMessage, folder: SyncFolder) => {
    stored.push({ id: message.providerMessageId, folder });
    return 'stored';
  });
  const prisma = fakePrisma(
    options.leads ?? [{ email: 'robert@example.invalid', createdAt: T1 }],
    options.contacts
  );
  const ctx: LookbackContext = {
    prisma,
    reader,
    mailbox: {
      id: 'mbx-1',
      tenantId: 'tenant-1',
      lookbackWatermark: null,
      lookbackUntil: null,
      lookbackCursor: null,
      lookbackSentCursor: null,
      oauthAccountId: 'acct',
      oauthApiDomain: 'mail.example.invalid',
      ...options.mailbox,
    },
    token: 'access-for-tests',
    now: NOW,
    clock: options.clock ?? (() => NOW),
    deadline: NOW.getTime() + 60_000,
    storeBy: options.storeBy ?? NOW.getTime() + 120_000,
    store,
  };
  return { ctx, read, store, stored, prisma };
}

const fromRobert = (id: string) =>
  mail({
    providerMessageId: id,
    fromAddress: 'robert@example.invalid',
    to: ['me@example.invalid'],
  });
const toRobert = (id: string) =>
  mail({
    providerMessageId: id,
    fromAddress: 'me@example.invalid',
    to: ['Robert@Example.invalid'],
  });
const stranger = (id: string) =>
  mail({
    providerMessageId: id,
    fromAddress: 'stranger@example.invalid',
    to: ['me@example.invalid'],
  });

describe('runLookback (MVP-011)', () => {
  it('does nothing, and reads nothing, when no lead or contact was created since the watermark', async () => {
    const { ctx, read } = setup({ mailbox: { lookbackWatermark: T3 } });

    const result = await runLookback(ctx);

    expect(result).toEqual({ data: {}, more: false, stored: 0 });
    expect(read).not.toHaveBeenCalled();
  });

  it('reads 90 days of both folders for a mailbox that never looked, and logs only mail with the new addresses', async () => {
    const { ctx, read, stored } = setup({
      sent: [round({ messages: [toRobert('s1')], cursor: 'sent-end' })],
      inbox: [round({ messages: [fromRobert('i1'), stranger('i2')], cursor: 'inbox-end' })],
    });

    const result = await runLookback(ctx);

    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls[0]![0]).toMatchObject({
      folder: 'sentitems',
      cursor: null,
      initialDays: LOOKBACK_DAYS,
    });
    expect(read.mock.calls[1]![0]).toMatchObject({ folder: 'inbox', cursor: null });
    // Sent first, like the normal sync; the stranger's mail is never offered to the store.
    expect(stored).toEqual([
      { id: 's1', folder: 'sentitems' },
      { id: 'i1', folder: 'inbox' },
    ]);
    expect(result.stored).toBe(2);
    // Both folders finished: the pass is over and its leads and contacts are looked for.
    expect(result.data).toEqual({
      lookbackWatermark: T1,
      lookbackUntil: null,
      lookbackCursor: null,
      lookbackSentCursor: null,
    });
    expect(result.more).toBe(true);
  });

  it('matches on the sender, To or Cc, ignoring case', async () => {
    const cc = mail({
      providerMessageId: 'c1',
      fromAddress: 'me@example.invalid',
      to: ['other@example.invalid'],
      cc: ['ROBERT@example.INVALID'],
    });
    const { ctx, stored } = setup({
      sent: [round({ messages: [cc], cursor: 'x' })],
      inbox: [round({ messages: [], cursor: 'y' })],
    });

    await runLookback(ctx);

    expect(stored).toEqual([{ id: 'c1', folder: 'sentitems' }]);
  });

  it('looks for contacts as well as leads, and skips a row without an address', async () => {
    const { ctx, stored } = setup({
      leads: [{ email: null, createdAt: T1 }],
      contacts: [{ email: 'robert@example.invalid', createdAt: T2 }],
      inbox: [round({ messages: [fromRobert('i1')], cursor: 'x' })],
    });

    const result = await runLookback(ctx);

    expect(stored).toEqual([{ id: 'i1', folder: 'inbox' }]);
    expect(result.data).toMatchObject({ lookbackWatermark: T2 });
  });

  it('a long run of rows without an address never hides the leads after it', async () => {
    const empty: Row[] = Array.from({ length: PASS_ADDRESSES + 20 }, (_, i) => ({
      email: i % 2 ? null : '',
      createdAt: new Date(T1.getTime() + i * 1000),
    }));
    const valid: Row = {
      email: 'robert@example.invalid',
      createdAt: new Date(T1.getTime() + (PASS_ADDRESSES + 20) * 1000),
    };
    const { ctx, stored } = setup({
      leads: [...empty, valid],
      inbox: [round({ messages: [fromRobert('i1')], cursor: 'x' })],
    });

    const result = await runLookback(ctx);

    expect(stored).toEqual([{ id: 'i1', folder: 'inbox' }]);
    expect(result.data).toMatchObject({ lookbackWatermark: valid.createdAt });
  });

  it('only looks for leads and contacts of the mailbox tenant', async () => {
    const { ctx, read } = setup({
      leads: [{ email: 'robert@example.invalid', createdAt: T1, tenantId: 'tenant-2' }],
    });

    const result = await runLookback(ctx);

    expect(result.data).toEqual({});
    expect(read).not.toHaveBeenCalled();
  });

  it('keeps the cursors and stays due while a folder has more to read', async () => {
    const { ctx } = setup({
      sent: [round({ messages: [], cursor: 'sent-page-2', complete: false })],
      inbox: [round({ messages: [], cursor: 'inbox-page-2', complete: false })],
    });

    const result = await runLookback(ctx);

    expect(result.more).toBe(true);
    expect(result.data).toEqual({
      lookbackUntil: T1,
      lookbackCursor: 'inbox-page-2',
      lookbackSentCursor: 'sent-page-2',
    });
    expect(result.data).not.toHaveProperty('lookbackWatermark');
  });

  it('resumes from the stored cursors and skips a folder that is already done', async () => {
    const { ctx, read } = setup({
      mailbox: {
        lookbackUntil: T1,
        lookbackCursor: 'inbox-page-2',
        lookbackSentCursor: FOLDER_DONE,
      },
      inbox: [round({ messages: [fromRobert('i9')], cursor: 'end' })],
    });

    const result = await runLookback(ctx);

    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0]![0]).toMatchObject({ folder: 'inbox', cursor: 'inbox-page-2' });
    expect(result.data).toMatchObject({ lookbackWatermark: T1, lookbackUntil: null });
  });

  it('uses the pass frozen when it started, not leads created since', async () => {
    const { ctx, stored } = setup({
      leads: [
        { email: 'robert@example.invalid', createdAt: T1 },
        { email: 'later@example.invalid', createdAt: T3 },
      ],
      mailbox: { lookbackUntil: T1, lookbackSentCursor: FOLDER_DONE },
      inbox: [
        round({
          messages: [
            fromRobert('i1'),
            mail({ providerMessageId: 'i2', fromAddress: 'later@example.invalid' }),
          ],
          cursor: 'end',
        }),
      ],
    });

    await runLookback(ctx);

    // The later lead waits for the next pass.
    expect(stored).toEqual([{ id: 'i1', folder: 'inbox' }]);
  });

  it('works off a large batch pass by pass: the watermark stops at the last address of the pass', async () => {
    const many: Row[] = Array.from({ length: PASS_ADDRESSES + 5 }, (_, i) => ({
      email: `p${i}@example.invalid`,
      createdAt: new Date(T1.getTime() + i * 1000),
    }));
    const { ctx } = setup({ leads: many });

    const result = await runLookback(ctx);

    const last = new Date(T1.getTime() + (PASS_ADDRESSES - 1) * 1000);
    expect(result.data).toMatchObject({ lookbackWatermark: last, lookbackUntil: null });
    expect(result.more).toBe(true);
  });

  it('starts the folder again when the provider no longer accepts its cursor', async () => {
    const { ctx, read, stored } = setup({
      mailbox: { lookbackUntil: T1, lookbackCursor: 'stale', lookbackSentCursor: FOLDER_DONE },
      inbox: [
        round({ messages: [], cursor: null, expired: true, complete: false }),
        round({ messages: [fromRobert('i1')], cursor: 'end' }),
      ],
    });

    await runLookback(ctx);

    expect(
      read.mock.calls.map(([args]) => (args as unknown as { cursor: string | null }).cursor)
    ).toEqual(['stale', null]);
    expect(stored).toEqual([{ id: 'i1', folder: 'inbox' }]);
  });

  it('stops storing when the time is up and keeps the cursor the round started from', async () => {
    const { ctx, stored } = setup({
      mailbox: { lookbackUntil: T1, lookbackSentCursor: FOLDER_DONE, lookbackCursor: 'page-3' },
      inbox: [round({ messages: [fromRobert('i1'), fromRobert('i2')], cursor: 'page-4' })],
      storeBy: NOW.getTime() - 1,
    });

    const result = await runLookback(ctx);

    expect(stored).toEqual([]);
    expect(result.data).toEqual({ lookbackSentCursor: FOLDER_DONE, lookbackCursor: 'page-3' });
    expect(result.more).toBe(true);
  });

  it('reads nothing when the read time is already used up', async () => {
    const { ctx, read } = setup({
      clock: () => new Date(NOW.getTime() + 3_600_000),
    });

    const result = await runLookback(ctx);

    expect(read).not.toHaveBeenCalled();
    expect(result.data).toEqual({
      lookbackUntil: T1,
      lookbackCursor: null,
      lookbackSentCursor: null,
    });
  });

  it('never throws: a failing read keeps everything and the sync goes on', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { ctx, read } = setup();
    read.mockRejectedValueOnce(new Error('provider down'));

    const result = await runLookback(ctx);

    expect(result).toEqual({ data: {}, more: false, stored: 0 });
    expect(warn).toHaveBeenCalledWith(
      '[mail-sync] look-back failed',
      expect.objectContaining({ mailboxId: 'mbx-1', error: 'provider down' })
    );
    warn.mockRestore();
  });

  it('survives a non-Error failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { ctx, prisma } = setup();
    prisma.lead.findMany.mockRejectedValueOnce('boom');

    const result = await runLookback(ctx);

    expect(result.more).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      '[mail-sync] look-back failed',
      expect.objectContaining({ error: 'unknown' })
    );
    warn.mockRestore();
  });
});
