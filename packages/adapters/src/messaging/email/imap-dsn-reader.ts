/**
 * Reads bounce reports from an SMTP mailbox over IMAP (PG-207, ADR-085, Q8).
 *
 * Only delivery reports: the IMAP search asks the server for
 * `Content-Type: multipart/report` mail, and the DSN parser decides what is a
 * real report. Nothing else is read or kept. The mailbox is opened read-only
 * (EXAMINE) so no flag changes; the connection goes to the DNS-pinned public
 * address on 993 with the certificate checked against the hostname. The
 * cursor is UIDVALIDITY + last UID; a UIDVALIDITY change restarts from a date.
 */
import { ImapFlow } from 'imapflow';
import { IMAP_PORT } from '@intelliflow/domain';
import { MailboxTransportError } from './mailbox-errors';
import { resolvePublicHost, type LookupFn } from './public-host';
import type { RawDsnMessage } from './oauth-mailbox';

export interface ImapConnectionConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface ImapCursor {
  uidValidity: bigint | null;
  lastUid: number | null;
  /** Where a first scan (or a scan after UIDVALIDITY changed) starts. */
  since: Date;
}

export interface ImapReadResult {
  messages: RawDsnMessage[];
  cursor: { uidValidity: bigint; lastUid: number };
}

interface FetchedMessage {
  uid: number;
  size?: number;
  source?: Buffer;
  internalDate?: Date | string;
}

/** The slice of ImapFlow this reader uses (injected in tests). */
export interface ImapClientLike {
  connect(): Promise<void>;
  getMailboxLock(path: string, options: { readOnly: boolean }): Promise<{ release(): void }>;
  mailbox: { uidValidity: bigint; uidNext: number } | false;
  search(
    query: Record<string, unknown>,
    options: { uid: true }
  ): Promise<number[] | false | undefined>;
  fetch(
    range: string,
    query: Record<string, boolean>,
    options: { uid: true }
  ): AsyncIterable<FetchedMessage>;
  logout(): Promise<void>;
}

type CreateImapClient = (options: Record<string, unknown>) => ImapClientLike;

const REPORT_HEADER = { 'content-type': 'multipart/report' };

/** The UIDs (ascending) whose size is within `maxBytes`, read without their bodies. */
async function uidsWithin(
  client: ImapClientLike,
  uids: number[],
  maxBytes: number
): Promise<number[]> {
  if (uids.length === 0) return [];
  const fitting: number[] = [];
  for await (const message of client.fetch(
    uids.join(','),
    { uid: true, size: true },
    { uid: true }
  )) {
    if (message.size !== undefined && message.size <= maxBytes) fitting.push(message.uid);
  }
  return fitting.sort((a, b) => a - b);
}

function mapImapError(error: unknown): MailboxTransportError {
  if (error instanceof MailboxTransportError) return error;
  const e = (error ?? {}) as { authenticationFailed?: boolean; code?: string };
  if (e.authenticationFailed) return new MailboxTransportError('AUTH_FAILED');
  if (e.code === 'ETIMEOUT' || e.code === 'ETIMEDOUT') return new MailboxTransportError('TIMEOUT');
  return new MailboxTransportError('CONNECT_FAILED');
}

export class ImapBounceReader {
  private readonly createClient: CreateImapClient;
  private readonly lookup: LookupFn | undefined;

  constructor(deps: { createClient?: CreateImapClient; lookup?: LookupFn } = {}) {
    this.createClient =
      deps.createClient ??
      ((options) => new ImapFlow(options as never) as unknown as ImapClientLike);
    this.lookup = deps.lookup;
  }

  private async open(config: ImapConnectionConfig): Promise<ImapClientLike> {
    const pinned = await resolvePublicHost(config.host, config.port, {
      allowedPorts: [IMAP_PORT],
      lookup: this.lookup,
    });
    const client = this.createClient({
      host: pinned.address,
      port: pinned.port,
      secure: true,
      auth: { user: config.username, pass: config.password },
      tls: { servername: pinned.servername, minVersion: 'TLSv1.2' },
      logger: false,
      disableAutoIdle: true,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    try {
      await client.connect();
    } catch (error) {
      throw mapImapError(error);
    }
    return client;
  }

  /** Logs in and out (Email Settings "Test connection" for the IMAP side). */
  async verify(config: ImapConnectionConfig): Promise<void> {
    const client = await this.open(config);
    await client.logout().catch(() => undefined);
  }

  async read(
    config: ImapConnectionConfig,
    cursor: ImapCursor,
    options: { limit: number; maxBytes: number }
  ): Promise<ImapReadResult> {
    const client = await this.open(config);
    try {
      const lock = await client.getMailboxLock('INBOX', { readOnly: true });
      try {
        const mailbox = client.mailbox;
        if (!mailbox) throw new MailboxTransportError('CONNECT_FAILED');
        const resume = cursor.uidValidity === mailbox.uidValidity && cursor.lastUid !== null;
        const after = resume ? (cursor.lastUid as number) : 0;
        const query = resume
          ? { uid: `${after + 1}:*`, header: REPORT_HEADER }
          : { since: cursor.since, header: REPORT_HEADER };

        const found = (await client.search(query, { uid: true })) || [];
        // `n:*` always returns the newest message, even below n: keep only new UIDs.
        const uids = found
          .filter((uid) => uid > after)
          .sort((a, b) => a - b)
          .slice(0, options.limit);

        const messages: RawDsnMessage[] = [];
        // Sizes first: an oversize message's body is never downloaded.
        const fitting = await uidsWithin(client, uids, options.maxBytes);
        if (fitting.length > 0) {
          const fetched: FetchedMessage[] = [];
          for await (const message of client.fetch(
            fitting.join(','),
            { uid: true, size: true, source: true, internalDate: true },
            { uid: true }
          )) {
            fetched.push(message);
          }
          fetched.sort((a, b) => a.uid - b.uid);
          for (const message of fetched) {
            if (!message.source || (message.size ?? message.source.length) > options.maxBytes)
              continue;
            messages.push({
              key: `${mailbox.uidValidity}:${message.uid}`,
              raw: message.source.toString('utf8'),
              receivedAt: new Date(message.internalDate ?? 0),
            });
          }
        }

        const lastUid =
          uids.length > 0
            ? (uids[uids.length - 1] as number)
            : Math.max(after, mailbox.uidNext - 1);
        return { messages, cursor: { uidValidity: mailbox.uidValidity, lastUid } };
      } finally {
        lock.release();
      }
    } catch (error) {
      throw mapImapError(error);
    } finally {
      await client.logout().catch(() => undefined);
    }
  }
}
