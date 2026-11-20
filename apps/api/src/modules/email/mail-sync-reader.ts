/**
 * MVP-001: the mailbox sync is provider-neutral. Each mailbox kind that can be read plugs in a
 * reader: what it needs granted, and one round of a folder from a cursor. The sync engine
 * (outlook-inbox-sync.ts) owns everything else: claiming, budgets, what is stored, backoff.
 * Readers are registered per kind in PRODUCTION_READERS (Microsoft through Graph, then Zoho).
 */
import {
  MailboxTransportError,
  readGmailLabel,
  readGraphMailDelta,
  readZohoFolder,
  readZohoFolderIds,
} from '@intelliflow/adapters';
import { hasGmailRead, hasMailRead, hasZohoRead } from './mail-sync-scopes';

export { hasGmailRead, hasMailRead, hasZohoRead } from './mail-sync-scopes';

/** The folders a sync reads: received mail and mail the user sent from the provider itself. */
export type SyncFolder = 'inbox' | 'sentitems';

/** One message as a reader returns it. */
export interface SyncedMessage {
  /** The provider's message id: the dedupe key per mailbox. */
  providerMessageId: string;
  internetMessageId: string | null;
  conversationId: string | null;
  subject: string;
  fromAddress: string | null;
  fromName: string | null;
  to: string[];
  cc: string[];
  receivedAt: Date;
  isRead: boolean;
  bodyText: string;
  /** True for bulk mail (a List-Unsubscribe or Precedence: bulk/list/junk header), where the reader sees headers. */
  bulk?: boolean;
  /** When set, the body is read only for mail the sync keeps (`bodyText` is then empty). */
  loadBody?: () => Promise<string>;
}

export interface SyncRound {
  messages: SyncedMessage[];
  /** Where to resume next time; null only when `expired`. */
  cursor: string | null;
  /** True when the folder is caught up for now. */
  complete: boolean;
  /** True when the provider no longer accepts the cursor: start the folder again. */
  expired: boolean;
}

export interface SyncReadArgs {
  accessToken: string;
  folder: SyncFolder;
  cursor: string | null;
  now: Date;
  /** What is left of this mailbox's read budget. */
  budgetMs: number;
  /** MVP-011: how far back a read with no cursor starts (the look-back reads 90 days). */
  initialDays?: number;
  /** Where the mailbox's account lives (Zoho: account id and Mail API host). */
  mailbox: { oauthAccountId?: string | null; oauthApiDomain?: string | null };
}

export interface MailSyncReader {
  /** Stored on each synced email record (EmailRecord.provider). */
  provider: 'MICROSOFT' | 'ZOHO' | 'GMAIL';
  /** Whether the granted scopes allow reading mail (else the mailbox is checked again daily). */
  canRead(scopes: readonly string[]): boolean;
  read(args: SyncReadArgs): Promise<SyncRound>;
}

const GRAPH_DELTA = { maxPages: 10, pageSize: 50, initialDays: 30, maxBodyChars: 100_000 } as const;

/** Microsoft 365 / Outlook through Graph's delta query (graph-mail-delta.ts). */
export function graphReader(
  readDelta: typeof readGraphMailDelta = readGraphMailDelta
): MailSyncReader {
  return {
    provider: 'MICROSOFT',
    canRead: hasMailRead,
    read: ({ accessToken, folder, cursor, now, budgetMs, initialDays }) =>
      readDelta(accessToken, cursor, {
        folder,
        ...GRAPH_DELTA,
        ...(initialDays ? { initialDays } : {}),
        now,
        budgetMs,
      }),
  };
}

const ZOHO_READ = { maxPages: 10, pageSize: 50, initialDays: 30, maxBodyChars: 100_000 } as const;

/** Zoho Mail through its Mail API: folder ids, then the folder's new mail (zoho-mail-reader.ts). */
export function zohoReader(
  read: typeof readZohoFolder = readZohoFolder,
  folderIds: typeof readZohoFolderIds = readZohoFolderIds
): MailSyncReader {
  return {
    provider: 'ZOHO',
    canRead: hasZohoRead,
    read: async ({ accessToken, folder, cursor, now, budgetMs, mailbox, initialDays }) => {
      if (!mailbox.oauthAccountId || !mailbox.oauthApiDomain) {
        throw new MailboxTransportError('AUTH_FAILED');
      }
      const ref = { accountId: mailbox.oauthAccountId, mailHost: mailbox.oauthApiDomain };
      const ids = await folderIds(accessToken, ref);
      const folderId = folder === 'inbox' ? ids.inbox : ids.sent;
      if (!folderId) throw new MailboxTransportError('REJECTED');
      return read(accessToken, ref, cursor, {
        folderId,
        ...ZOHO_READ,
        ...(initialDays ? { initialDays } : {}),
        now,
        budgetMs,
      });
    },
  };
}

/** Smaller pages than the others: each listed Gmail message costs one more request (its headers). */
const GMAIL_READ = { maxPages: 4, pageSize: 25, initialDays: 30, maxBodyChars: 100_000 } as const;

/**
 * MVP-011: Gmail (a Workspace domain that trusts Aurora) through its history: the Inbox is the
 * INBOX label, Sent Items the SENT label (gmail-mail-reader.ts).
 */
export function gmailReader(read: typeof readGmailLabel = readGmailLabel): MailSyncReader {
  return {
    provider: 'GMAIL',
    canRead: hasGmailRead,
    read: ({ accessToken, folder, cursor, now, budgetMs, initialDays }) =>
      read(accessToken, cursor, {
        label: folder === 'inbox' ? 'INBOX' : 'SENT',
        ...GMAIL_READ,
        ...(initialDays ? { initialDays } : {}),
        now,
        budgetMs,
      }),
  };
}

/** The readers production uses, per mailbox kind. */
export const PRODUCTION_READERS: Readonly<Partial<Record<string, MailSyncReader>>> = {
  MICROSOFT: graphReader(),
  ZOHO: zohoReader(),
  GMAIL: gmailReader(),
};
