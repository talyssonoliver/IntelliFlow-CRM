/**
 * MVP-001 mailbox sync: a mailbox's time. Storing mail (bodies are read while storing) stops well
 * inside the hold the sync takes on the mailbox, and the folder keeps a cursor the provider accepts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const tokens = vi.hoisted(() => ({
  getOAuthAccess: vi.fn(),
  hasOAuthClient: vi.fn((..._args: unknown[]) => true),
}));
vi.mock('../mailbox-transport', () => ({
  getOAuthAccess: tokens.getOAuthAccess,
  hasOAuthClient: tokens.hasOAuthClient,
  oauthClientEnvNames: (kind: string) => [`EMAIL_OAUTH_${kind}_CLIENT_ID`],
}));

import { runInboxSync } from '../outlook-inbox-sync';
import { CURSOR, NOW, mail, released, round, setup } from './inbox-sync-harness';

/** Two mails to store, and a first write slow enough to use up the mailbox's whole time. */
function slowSetup(rounds: ReturnType<typeof round>[]) {
  const made = setup({ rounds });
  let clock = NOW.getTime();
  made.deps.now = () => new Date(clock);
  made.prisma.emailRecord.create.mockImplementation(async () => {
    clock += 4 * 60_000; // one slow write (bodies, database) uses up the mailbox's time
    return { id: 'rec-1' };
  });
  return made;
}

describe('mailbox sync: the time a mailbox may take (MVP-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tokens.getOAuthAccess.mockResolvedValue({ accessToken: 'access-for-tests', tokenVersion: 0 });
  });

  it('stops storing once the mailbox is out of time, keeping the old cursor and staying due', async () => {
    const { prisma, deps } = slowSetup([
      round({ messages: [mail(), mail({ providerMessageId: 'graph-2' })] }),
    ]);

    await runInboxSync(deps);

    expect(prisma.emailRecord.create).toHaveBeenCalledTimes(1);
    expect(released(prisma).data).toMatchObject({ syncCursor: CURSOR, nextSyncAt: NOW });
  });

  it('never saves a cursor the provider rejected when it stops early after a restart', async () => {
    const { prisma, deps } = slowSetup([
      // The provider no longer accepts the saved cursor: the folder starts again from nothing.
      round({ messages: [], cursor: null, expired: true }),
      round({ messages: [mail(), mail({ providerMessageId: 'graph-2' })] }),
    ]);

    const report = await runInboxSync(deps);

    expect(report.restarts).toBe(1);
    expect(prisma.emailRecord.create).toHaveBeenCalledTimes(1);
    // The dead cursor is not saved again: the folder starts from nothing at the next tick.
    expect(released(prisma).data.syncCursor).toBeNull();
    expect(released(prisma).data.nextSyncAt).toEqual(NOW);
  });
});
