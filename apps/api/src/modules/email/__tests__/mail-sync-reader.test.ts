/**
 * MVP-001: the Microsoft reader the sync engine uses, through Graph's delta query.
 */
import { describe, it, expect, vi } from 'vitest';
import { ZOHO_MAILBOX_SCOPES } from '@intelliflow/adapters';
import {
  PRODUCTION_READERS,
  graphReader,
  hasMailRead,
  hasZohoRead,
  zohoReader,
} from '../mail-sync-reader';

const NOW = new Date('2026-11-16T10:00:00.000Z');

describe('hasMailRead', () => {
  it('accepts the bare and the resource-URI scope, nothing else', () => {
    expect(hasMailRead(['Mail.Read'])).toBe(true);
    expect(hasMailRead(['https://graph.microsoft.com/Mail.Read'])).toBe(true);
    expect(hasMailRead(['Mail.ReadWrite', 'Mail.Send'])).toBe(false);
  });
});

describe('graphReader', () => {
  it('reads a folder from the cursor with the 30-day start and the budget left', async () => {
    const round = { messages: [], removedIds: [], cursor: 'c2', complete: true, expired: false };
    const readDelta = vi.fn(async () => round);
    const reader = graphReader(readDelta as never);

    const result = await reader.read({
      accessToken: 'access-for-tests',
      folder: 'sentitems',
      cursor: 'c1',
      now: NOW,
      budgetMs: 12_345,
      mailbox: {},
    });

    expect(readDelta).toHaveBeenCalledWith('access-for-tests', 'c1', {
      folder: 'sentitems',
      maxPages: 10,
      pageSize: 50,
      initialDays: 30,
      maxBodyChars: 100_000,
      now: NOW,
      budgetMs: 12_345,
    });
    expect(result).toBe(round);
    expect(reader.provider).toBe('MICROSOFT');
    expect(reader.canRead(['Mail.Read'])).toBe(true);
  });

  it('is the reader production registers for Microsoft mailboxes', () => {
    expect(PRODUCTION_READERS.MICROSOFT?.provider).toBe('MICROSOFT');
    expect(Object.keys(PRODUCTION_READERS)).toEqual(['MICROSOFT', 'ZOHO', 'GMAIL']);
  });
});

describe('Zoho reader (MVP-001)', () => {
  it('needs both read scopes, messages and folders', () => {
    // A connection made before the read scopes were asked for cannot read; one made now can.
    expect(hasZohoRead(['ZohoMail.messages.CREATE', 'ZohoMail.accounts.READ'])).toBe(false);
    expect(hasZohoRead([...ZOHO_MAILBOX_SCOPES])).toBe(true);
    expect(hasZohoRead(['ZohoMail.messages.READ', 'ZohoMail.folders.READ'])).toBe(true);
    expect(hasZohoRead(['ZohoMail.messages.ALL', 'ZohoMail.folders.ALL'])).toBe(true);
    expect(hasZohoRead(['ZohoMail.messages.READ'])).toBe(false);
  });

  it('reads the right folder at the account the mailbox stores', async () => {
    const round = { messages: [], cursor: 'c2', complete: true, expired: false };
    const read = vi.fn(async () => round);
    const folderIds = vi.fn(async () => ({ inbox: 'f-in', sent: 'f-sent' }));
    const reader = zohoReader(read as never, folderIds as never);
    const mailbox = { oauthAccountId: '42', oauthApiDomain: 'mail.zoho.eu' };

    await expect(
      reader.read({
        accessToken: 'a',
        folder: 'sentitems',
        cursor: 'c1',
        now: NOW,
        budgetMs: 5,
        mailbox,
      })
    ).resolves.toBe(round);

    const ref = { accountId: '42', mailHost: 'mail.zoho.eu' };
    expect(folderIds).toHaveBeenCalledWith('a', ref);
    expect(read).toHaveBeenCalledWith(
      'a',
      ref,
      'c1',
      expect.objectContaining({ folderId: 'f-sent', budgetMs: 5 })
    );
    expect(reader.provider).toBe('ZOHO');
  });

  it('fails as coded errors without the account location or the folder', async () => {
    const reader = zohoReader(
      vi.fn() as never,
      vi.fn(async () => ({ inbox: null, sent: null })) as never
    );
    const args = {
      accessToken: 'a',
      folder: 'inbox' as const,
      cursor: null,
      now: NOW,
      budgetMs: 5,
    };
    await expect(reader.read({ ...args, mailbox: {} })).rejects.toMatchObject({
      code: 'AUTH_FAILED',
    });
    await expect(
      reader.read({ ...args, mailbox: { oauthAccountId: '42', oauthApiDomain: 'mail.zoho.com' } })
    ).rejects.toMatchObject({ code: 'REJECTED' });
  });
});
