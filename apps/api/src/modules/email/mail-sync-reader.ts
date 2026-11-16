/**
 * MVP-001: the mailbox sync is provider-neutral. Each mailbox kind that can be read plugs in a
 * reader: what it needs granted, and one round of a folder from a cursor. The sync engine
 * (outlook-inbox-sync.ts) owns everything else: claiming, budgets, what is stored, backoff.
 * Readers are registered per kind in PRODUCTION_READERS (Microsoft through Graph, then Zoho).
 */

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
}

export interface MailSyncReader {
  /** Stored on each synced email record (EmailRecord.provider). */
  provider: 'MICROSOFT' | 'ZOHO';
  /** Whether the granted scopes allow reading mail (else the mailbox is checked again daily). */
  canRead(scopes: readonly string[]): boolean;
  read(args: SyncReadArgs): Promise<SyncRound>;
}

/** The readers production uses, per mailbox kind. None yet: providers plug in here. */
export const PRODUCTION_READERS: Readonly<Partial<Record<string, MailSyncReader>>> = {};
