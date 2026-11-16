/**
 * MVP-001: the mailbox sync is provider-neutral. Each mailbox kind that can be read plugs in a
 * reader: what it needs granted, and one round of a folder from a cursor. The sync engine
 * (outlook-inbox-sync.ts) owns everything else: claiming, budgets, what is stored, threading,
 * backoff. Microsoft reads through Graph's delta query today; Zoho joins in the next PR.
 */
import {
  readGraphMailDelta,
  type GraphSyncFolder,
  type GraphSyncedMessage,
} from '@intelliflow/adapters';

/** The folders a sync reads: received mail and mail the user sent from the provider itself. */
export type SyncFolder = GraphSyncFolder;

/** One message as any reader returns it (Graph's shape is already provider-neutral). */
export type SyncedMessage = GraphSyncedMessage;

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
}

export interface MailSyncReader {
  /** Stored on each synced email record (EmailRecord.provider). */
  provider: 'MICROSOFT' | 'ZOHO';
  /** Whether the granted scopes allow reading mail (else the mailbox is checked again daily). */
  canRead(scopes: readonly string[]): boolean;
  read(args: SyncReadArgs): Promise<SyncRound>;
}

/** Microsoft reports scopes bare ("Mail.Read") or as resource URIs (".../Mail.Read"). */
export function hasMailRead(scopes: readonly string[]): boolean {
  return scopes.some((s) => s === 'Mail.Read' || s.toLowerCase().endsWith('/mail.read'));
}

const GRAPH_DELTA = { maxPages: 10, pageSize: 50, initialDays: 30, maxBodyChars: 100_000 } as const;

/** Microsoft 365 / Outlook through Graph's delta query. */
export function graphReader(
  readDelta: typeof readGraphMailDelta = readGraphMailDelta
): MailSyncReader {
  return {
    provider: 'MICROSOFT',
    canRead: hasMailRead,
    read: ({ accessToken, folder, cursor, now, budgetMs }) =>
      readDelta(accessToken, cursor, { folder, ...GRAPH_DELTA, now, budgetMs }),
  };
}
