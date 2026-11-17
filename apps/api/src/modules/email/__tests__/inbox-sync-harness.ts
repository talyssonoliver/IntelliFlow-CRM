/**
 * Fixtures for the mailbox sync engine's tests (outlook-inbox-sync.ts): mail, rounds, a mailbox row,
 * a test reader and the mocked database. Each test file mocks `../mailbox-transport` itself.
 */
import { vi } from 'vitest';
import type { MailSyncReader, SyncRound, SyncedMessage } from '../mail-sync-reader';
import type { InboxSyncDeps } from '../outlook-inbox-sync';

export const NOW = new Date('2026-11-15T10:00:00.000Z');
export const LEASE = new Date(NOW.getTime() + 5 * 60_000);
export const TENANT = '00000000-0000-4000-a000-000000000001';
export const CURSOR = 'https://graph.microsoft.com/v1.0/me/delta-1';

export function mail(overrides: Partial<SyncedMessage> = {}): SyncedMessage {
  return {
    providerMessageId: 'graph-1',
    internetMessageId: '<m1@mail.example.invalid>',
    conversationId: 'conv-1',
    subject: 'Pricing',
    fromAddress: 'ada@example.invalid',
    fromName: 'Ada',
    to: ['me@example.invalid'],
    cc: [],
    receivedAt: new Date('2026-11-14T09:00:00.000Z'),
    isRead: false,
    bodyText: 'Hello',
    ...overrides,
  };
}

export function round(overrides: Partial<SyncRound> = {}): SyncRound {
  return {
    messages: [mail()],
    cursor: 'https://graph.microsoft.com/v1.0/me/delta-2',
    complete: true,
    expired: false,
    ...overrides,
  };
}

export function mailbox(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mbx-1',
    tenantId: TENANT,
    userId: 'user-1',
    kind: 'MICROSOFT',
    status: 'ACTIVE',
    accountAddress: 'me@example.invalid',
    fromAddress: 'me@example.invalid',
    refreshToken: 'stored-refresh',
    tokenVersion: 0,
    grantedScopes: ['offline_access', 'User.Read', 'Mail.Send', 'Mail.Read'],
    syncCursor: CURSOR,
    syncFailureCount: 0,
    ...overrides,
  };
}

/**
 * A Microsoft-kind reader for the engine's tests: forwards each read to a mock with the shape
 * (token, cursor, options) the assertions below check.
 */
/** What the test reader passes on: the folder, the 30-day start, the clock and the budget. */
type ReadOptions = { folder: string } & Record<string, unknown>;

export function testReader(
  read: (token: string, cursor: string | null, options: ReadOptions) => Promise<SyncRound>
): MailSyncReader {
  return {
    provider: 'MICROSOFT',
    canRead: (scopes) => scopes.includes('Mail.Read'),
    read: ({ accessToken, folder, cursor, now, budgetMs }) =>
      read(accessToken, cursor, { folder, initialDays: 30, now, budgetMs }),
  };
}

/** `rounds` are the inbox's rounds in order, `sent` the Sent folder's (each empty once used up). */
export function setup(
  options: { mailbox?: Record<string, unknown>; rounds?: SyncRound[]; sent?: SyncRound[] } = {}
) {
  const claims = [{ id: 'mbx-1', syncLockedUntil: LEASE }];
  const prisma = {
    $queryRaw: vi.fn(async () => claims.splice(0, 1)),
    $executeRaw: vi.fn(async (..._statement: unknown[]) => 1),
    $transaction: vi.fn(
      async (work: (tx: unknown) => Promise<unknown>): Promise<unknown> => work(prisma)
    ),
    emailMailbox: {
      findFirst: vi.fn(async () => mailbox(options.mailbox)),
      update: vi.fn(async () => ({})),
    },
    contact: { findFirst: vi.fn(async () => ({ id: 'contact-1' })) },
    lead: { findFirst: vi.fn(async () => null) },
    emailRecord: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: 'rec-1' })),
      update: vi.fn(async () => ({})),
    },
    leadActivity: { create: vi.fn(async () => ({ id: 'act-1' })) },
  };
  const queues: Record<string, SyncRound[]> = {
    inbox: [...(options.rounds ?? [round()])],
    sentitems: [...(options.sent ?? [])],
  };
  const readDelta = vi.fn(
    async (_token: string, _cursor: string | null, read: ReadOptions) =>
      queues[read.folder]?.shift() ?? round({ messages: [] })
  );
  const isRestricted = vi.fn(async (_tenantId: string, _email: string) => false);
  const deps: InboxSyncDeps = {
    prisma,
    transports: {} as never,
    isRestricted,
    now: () => NOW,
    readers: { MICROSOFT: testReader(readDelta) },
  };
  return { prisma, readDelta, isRestricted, deps };
}

export const released = (prisma: ReturnType<typeof setup>['prisma']) =>
  (prisma.emailMailbox.update.mock.calls.at(-1) as unknown as [{ where: unknown; data: any }])[0];
