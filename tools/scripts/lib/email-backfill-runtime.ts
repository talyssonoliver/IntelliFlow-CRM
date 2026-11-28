/**
 * The real database and provider access behind tools/scripts/backfill-email-rich.ts, kept apart so
 * the script's logic is tested with fakes and this is loaded only when the script really runs.
 *
 * - Database: the encrypted Prisma client of packages/db (mailbox credentials are decrypted by it).
 * - Providers: the API's own mailbox token helper and the adapters' read functions. Everything is
 *   a read; attachments are never downloaded.
 */
import type { MailContent } from '../../../packages/adapters/src/messaging/email/mail-content';
import type {
  AttachmentMetaLike,
  BackfillChange,
  BackfillDb,
  BackfillDeps,
  BackfillRecord,
  BackfillSource,
  FetchResult,
} from '../backfill-email-rich';

const PROVIDERS = ['GMAIL', 'MICROSOFT', 'ZOHO', 'RESEND'];
const MAX_BODY_CHARS = 100_000;

export async function createBackfillDb(): Promise<BackfillDb & { close(): Promise<void> }> {
  const { prisma } = await import('../../../packages/db/src/client');
  const db = prisma as any;
  return {
    async loadRecords({ tenantId, leadId, limit }): Promise<BackfillRecord[]> {
      const rows: any[] = await db.emailRecord.findMany({
        where: {
          tenantId,
          provider: { in: PROVIDERS },
          providerMessageId: { not: null },
          ...(leadId ? { metadata: { path: ['leadId'], equals: leadId } } : {}),
          OR: [{ sentAt: null }, { bodyHtml: null }, { attachments: { none: {} } }],
        },
        select: {
          id: true,
          tenantId: true,
          provider: true,
          providerMessageId: true,
          mailboxId: true,
          sentAt: true,
          createdAt: true,
          bodyHtml: true,
          metadata: true,
          _count: { select: { attachments: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
      });
      return rows.map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        provider: row.provider,
        providerMessageId: row.providerMessageId,
        mailboxId: row.mailboxId,
        sentAt: row.sentAt,
        createdAt: row.createdAt,
        hasHtml: row.bodyHtml !== null,
        attachmentCount: row._count.attachments,
        metadata: row.metadata,
      }));
    },
    async apply(change: BackfillChange): Promise<void> {
      await db.$transaction(async (tx: any) => {
        const data: Record<string, unknown> = {};
        if (change.sentAt) data['sentAt'] = change.sentAt;
        if (change.bodyHtml) data['bodyHtml'] = change.bodyHtml;
        if (Object.keys(data).length > 0) {
          await tx.emailRecord.update({
            where: { id: change.id, tenantId: change.tenantId },
            data,
          });
        }
        if (change.attachments.length > 0) {
          await tx.emailAttachment.createMany({ data: change.attachments });
        }
      });
    },
    close: () => db.$disconnect() as Promise<void>,
  };
}

export async function loadBackfillHelpers(): Promise<BackfillDeps> {
  const { sanitizeEmailHtml } =
    await import('../../../apps/api/src/modules/email/email-html-sanitizer');
  const { attachmentRows } = await import('../../../apps/api/src/modules/email/mail-sync-rich');
  return {
    sanitize: sanitizeEmailHtml,
    attachmentRows: (emailId, tenantId, attachments: readonly AttachmentMetaLike[]) =>
      attachmentRows(emailId, tenantId, attachments),
  };
}

async function readResend(key: string, id: string): Promise<FetchResult> {
  const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404) return 'gone';
  if (!response.ok) throw Object.assign(new Error('resend'), { code: `HTTP_${response.status}` });
  const body = (await response.json()) as { html?: string | null };
  return { receivedAt: null, html: body.html ?? null, attachments: [] };
}

export async function createBackfillSource(
  env: Readonly<Record<string, string | undefined>>
): Promise<BackfillSource> {
  const { prisma } = await import('../../../packages/db/src/client');
  const db = prisma as any;
  const { createMailboxTransports, getOAuthAccessToken } =
    await import('../../../apps/api/src/modules/email/mailbox-transport');
  const { readGmailMessage } =
    await import('../../../packages/adapters/src/messaging/email/gmail-mail-reader');
  const { readGraphMessage } =
    await import('../../../packages/adapters/src/messaging/email/graph-mail-content');
  const { readZohoFolderIds } =
    await import('../../../packages/adapters/src/messaging/email/zoho-mail-reader');
  const { readZohoMessageContent } =
    await import('../../../packages/adapters/src/messaging/email/zoho-mail-content');
  const transports = createMailboxTransports(env as NodeJS.ProcessEnv);
  const tokens = new Map<string, { mailbox: any; token: string }>();

  async function access(record: BackfillRecord) {
    if (!record.mailboxId) return null;
    const cached = tokens.get(record.mailboxId);
    if (cached) return cached;
    const mailbox = await db.emailMailbox.findFirst({
      where: { id: record.mailboxId, tenantId: record.tenantId },
    });
    if (!mailbox || mailbox.status !== 'ACTIVE') return null;
    const token = await getOAuthAccessToken(db, mailbox, transports, new Date());
    const entry = { mailbox, token };
    tokens.set(record.mailboxId, entry);
    return entry;
  }

  /** A Gmail or Graph read as a fetch result: its date, HTML and attachment metadata. */
  const asFetched = (
    read: { receivedAt: Date | null; content: MailContent } | null
  ): FetchResult =>
    read
      ? {
          receivedAt: read.receivedAt,
          html: read.content.html,
          attachments: read.content.attachments,
        }
      : 'gone';

  async function readZoho(record: BackfillRecord, mailbox: any, token: string, id: string) {
    const ref = { accountId: mailbox.oauthAccountId, mailHost: mailbox.oauthApiDomain };
    const folder = (record.metadata as { folder?: string } | null)?.folder;
    const ids = await readZohoFolderIds(token, ref);
    const folderId = folder === 'sentitems' ? ids.sent : ids.inbox;
    if (!folderId) return 'skipped' as const;
    const read = await readZohoMessageContent(token, ref, folderId, id);
    return { receivedAt: null, html: read.html, attachments: read.attachments };
  }

  return {
    async fetch(record): Promise<FetchResult> {
      const id = record.providerMessageId as string;
      if (record.provider === 'RESEND') {
        const key = env['RESEND_API_KEY'];
        return key ? readResend(key, id) : 'skipped';
      }
      const entry = await access(record);
      if (!entry) return 'skipped';
      const { mailbox, token } = entry;
      if (mailbox.kind === 'GMAIL') {
        return asFetched(await readGmailMessage(token, id, MAX_BODY_CHARS));
      }
      if (mailbox.kind === 'MICROSOFT') return asFetched(await readGraphMessage(token, id));
      if (mailbox.kind === 'ZOHO' && mailbox.oauthAccountId && mailbox.oauthApiDomain) {
        return readZoho(record, mailbox, token, id);
      }
      return 'skipped';
    },
  };
}
