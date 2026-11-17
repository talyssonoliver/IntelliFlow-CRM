/**
 * MVP-001 mailbox sync, what it tells the logs: a process without the OAuth client for a mailbox
 * says what to set and counts no failure; a round says what it read and did with each mail; a
 * failure that is not a transport error says what it was.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MailboxTransportError } from '@intelliflow/adapters';

const tokens = vi.hoisted(() => ({
  getOAuthAccess: vi.fn(),
  hasOAuthClient: vi.fn((..._args: unknown[]) => true),
}));
vi.mock('../mailbox-transport', () => ({
  getOAuthAccess: tokens.getOAuthAccess,
  hasOAuthClient: tokens.hasOAuthClient,
  oauthClientEnvNames: (kind: string) => [
    `EMAIL_OAUTH_${kind}_CLIENT_ID`,
    `EMAIL_OAUTH_${kind}_CLIENT_SECRET`,
    'EMAIL_OAUTH_REDIRECT_URI',
  ],
}));

import { INBOX_SYNC_INTERVAL_MS, runInboxSync } from '../outlook-inbox-sync';
import { NOW, mail, released, round, setup } from './inbox-sync-harness';

describe('mailbox sync logs (MVP-001)', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let info: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    tokens.getOAuthAccess.mockResolvedValue({ accessToken: 'access-for-tests', tokenVersion: 0 });
    tokens.hasOAuthClient.mockReturnValue(true);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
    info.mockRestore();
    error.mockRestore();
  });

  it('skips a mailbox this process has no OAuth client for: says what to set, no failure, no backoff', async () => {
    tokens.hasOAuthClient.mockReturnValue(false);
    const { prisma, readDelta, deps } = setup({ mailbox: { syncFailureCount: 2 } });

    const report = await runInboxSync(deps);

    expect(tokens.hasOAuthClient).toHaveBeenCalledWith(deps.transports, 'MICROSOFT');
    // No token is asked for and nothing is read: before, this was a CONNECT_FAILED with backoff.
    expect(tokens.getOAuthAccess).not.toHaveBeenCalled();
    expect(readDelta).not.toHaveBeenCalled();
    const data = released(prisma).data;
    expect(data.nextSyncAt).toEqual(new Date(NOW.getTime() + INBOX_SYNC_INTERVAL_MS));
    expect(data).not.toHaveProperty('syncFailureCount');
    expect(report.failures).toBe(0);
    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      '[email] inbox sync skipped: no OAuth client for this mailbox kind here',
      {
        mailboxId: 'mbx-1',
        kind: 'MICROSOFT',
        set: [
          'EMAIL_OAUTH_MICROSOFT_CLIENT_ID',
          'EMAIL_OAUTH_MICROSOFT_CLIENT_SECRET',
          'EMAIL_OAUTH_REDIRECT_URI',
        ],
      }
    );
  });

  it('says per folder how many mails it read and what became of each', async () => {
    const { prisma, deps } = setup({
      rounds: [
        round({
          messages: [
            mail(),
            mail({ providerMessageId: 'graph-2', fromAddress: 'stranger@example.invalid' }),
            mail({ providerMessageId: 'graph-3', fromAddress: null }),
          ],
        }),
      ],
    });
    prisma.contact.findFirst.mockImplementation((async (args: {
      where: { email: { equals: string } };
    }) =>
      args.where.email.equals === 'ada@example.invalid' ? { id: 'contact-1' } : null) as never);

    await runInboxSync(deps);

    expect(info).toHaveBeenCalledWith('[email] inbox sync done', {
      mailboxId: 'mbx-1',
      kind: 'MICROSOFT',
      sentitems: { read: 0 },
      inbox: { read: 3, stored: 1, unmatched: 1, own: 1 },
      complete: true,
    });
  });

  it('names the cause and database code of a failure that is not a transport error', async () => {
    const { deps } = setup();
    tokens.getOAuthAccess.mockRejectedValue(
      Object.assign(new Error('details that stay out of the logs'), {
        name: 'PrismaClientKnownRequestError',
        code: 'P2010',
      })
    );

    await runInboxSync(deps);

    expect(error).toHaveBeenCalledWith('[email] inbox sync failed', {
      mailboxId: 'mbx-1',
      code: 'CONNECT_FAILED',
      cause: 'PrismaClientKnownRequestError',
      dbCode: 'P2010',
    });
    expect(JSON.stringify(error.mock.calls)).not.toContain('details that stay out of the logs');
  });

  it('names a plain bug the same way', async () => {
    const { deps } = setup();
    tokens.getOAuthAccess.mockRejectedValue(new TypeError('x is undefined'));

    await runInboxSync(deps);

    expect(error).toHaveBeenCalledWith('[email] inbox sync failed', {
      mailboxId: 'mbx-1',
      code: 'CONNECT_FAILED',
      cause: 'TypeError',
    });
  });

  it('logs only the code of a transport error', async () => {
    const { deps } = setup();
    tokens.getOAuthAccess.mockRejectedValue(new MailboxTransportError('AUTH_FAILED'));

    await runInboxSync(deps);

    expect(error).toHaveBeenCalledWith('[email] inbox sync failed', {
      mailboxId: 'mbx-1',
      code: 'AUTH_FAILED',
    });
  });
});
