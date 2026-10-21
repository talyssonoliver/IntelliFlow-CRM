/**
 * The single send path for user mail (PG-207, ADR-085; owner rulings Q4, Q6,
 * Q7, Q9, Q11).
 *
 * `email.sendEmail` and the `forward` action of `email.processEmail` both call
 * `dispatchUserMail`. It replaces the module-level outbound service that fell
 * back to the mock provider and recorded SENT for mail that never left.
 *
 * Order: resolve the sending mailbox (own, else the admin-enabled company
 * mailbox; a broken own mailbox refuses) → drop suppressed recipients (all
 * suppressed sends nothing) → per-mailbox hourly cap → reserve quota for the
 * recipients actually sent to → record PENDING → read attachments from the
 * tenant's storage → build the MIME (From = mailbox address, Reply-To = tenant
 * override) → send through that mailbox only → record SENT or FAILED. Quota is
 * released on every failure after it was reserved. No fallback to another
 * mailbox or provider, ever.
 */
import { MailboxTransportError, buildMime, type MimeAttachment } from '@intelliflow/adapters';
import type { EmailAttachmentStoragePort } from '@intelliflow/application';
import {
  isEmailSettingsAdminRole,
  normalizeEmail,
  partitionRecipients,
  resolveSendingMailbox,
  type MailboxErrorCode,
  type MailboxStatus,
} from '@intelliflow/domain';
import type { SendUserEmailInput, SendUserEmailResultDto } from '@intelliflow/validators';
import { reserveQuota } from '../../shared/quota-guard';
import { settingsValues } from './email-dto';
import { emailSendError } from './email-send-error';

export { emailSendErrorFromCause } from './email-send-error';
import { claimSendSlot, sendThroughMailbox, type MailboxTransports } from './mailbox-transport';

export interface DispatchDeps {
  transports: MailboxTransports;
  storage: Pick<EmailAttachmentStoragePort, 'downloadEmailAttachment'>;
  now?: () => Date;
}

export interface DispatchOptions {
  /** Extra metadata merged into the EmailRecord (e.g. forward provenance). */
  metadata?: Record<string, unknown>;
}

const sendError = emailSendError;

interface MailboxRow {
  id: string;
  tenantId: string;
  scope: string;
  userId: string | null;
  kind: string;
  status: string;
  fromAddress: string;
  fromName: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecurity: string | null;
  smtpUsername: string | null;
  smtpPassword: string | null;
  refreshToken: string | null;
  tokenVersion: number;
}

/** The context slice dispatchUserMail needs (tenant router context). */
export interface DispatchCtx {
  prismaWithTenant: any;
  tenant: { tenantId: string; userId: string };
  user?: { role?: string | null } | null;
  [key: string]: unknown;
}

function transportCode(error: unknown): MailboxErrorCode {
  return error instanceof MailboxTransportError ? error.code : 'REJECTED';
}

type AttachmentRef = NonNullable<SendUserEmailInput['attachments']>[number];

/** Reads every attachment from the tenant's storage; any miss fails the whole send. */
async function loadAttachmentParts(
  storage: DispatchDeps['storage'],
  tenantId: string,
  attachments: AttachmentRef[]
): Promise<MimeAttachment[]> {
  try {
    return await Promise.all(
      attachments.map(async (a) => ({
        filename: a.fileName,
        contentType: a.contentType,
        content: await storage.downloadEmailAttachment(tenantId, a.storagePath),
      }))
    );
  } catch {
    throw new MailboxTransportError('ATTACHMENT_UNAVAILABLE');
  }
}

function recordMetadata(
  input: SendUserEmailInput,
  skipped: string[],
  options: DispatchOptions
): Record<string, unknown> {
  return {
    isHtml: true,
    textBody: input.textBody,
    threadId: input.threadId,
    skippedRecipients: skipped,
    ...options.metadata,
  };
}

/** FAILED with its code; an authentication failure also marks the mailbox ERROR. */
async function recordFailure(
  db: any,
  ids: { recordId: string; tenantId: string; mailboxId: string; code: MailboxErrorCode },
  metadata: Record<string, unknown>
): Promise<void> {
  await db.emailRecord.update({
    where: { id: ids.recordId, tenantId: ids.tenantId },
    data: { status: 'FAILED', metadata },
  });
  if (ids.code === 'AUTH_FAILED') {
    await db.emailMailbox.updateMany({
      where: { id: ids.mailboxId, tenantId: ids.tenantId },
      data: { status: 'ERROR', lastErrorCode: ids.code },
    });
  }
}

export async function dispatchUserMail(
  ctx: DispatchCtx,
  input: SendUserEmailInput,
  deps: DispatchDeps,
  options: DispatchOptions = {}
): Promise<SendUserEmailResultDto> {
  const now = deps.now ?? (() => new Date());
  const db = ctx.prismaWithTenant;
  const { tenantId, userId } = ctx.tenant;

  // 1. Settings + the two candidate mailboxes in one query (NF-001).
  const [settingsRow, mailboxes]: [unknown, MailboxRow[]] = await Promise.all([
    db.tenantEmailSettings.findUnique({ where: { tenantId } }),
    db.emailMailbox.findMany({
      where: { tenantId, OR: [{ scope: 'USER', userId }, { scope: 'TENANT' }] },
    }),
  ]);
  const settings = settingsValues(settingsRow as never);
  const resolved = resolveSendingMailbox({
    userMailbox: (mailboxes.find((m) => m.scope === 'USER' && m.userId === userId) ?? null) as
      | (MailboxRow & { status: MailboxStatus })
      | null,
    tenantMailbox: (mailboxes.find((m) => m.scope === 'TENANT') ?? null) as
      | (MailboxRow & { status: MailboxStatus })
      | null,
    allowFallback: settings.allowTenantMailboxFallback,
    isAdmin: isEmailSettingsAdminRole(ctx.user?.role),
  });
  if ('refusal' in resolved) throw sendError(resolved.refusal);
  const mailbox = resolved.mailbox;

  // 2. Suppression (Q9): drop suppressed recipients, keep the rest.
  const allRecipients = [...input.to, ...(input.cc ?? []), ...(input.bcc ?? [])].map(
    normalizeEmail
  );
  const suppressedRows: Array<{ email: string }> = await db.emailSuppression.findMany({
    where: { tenantId, email: { in: [...new Set(allRecipients)] } },
    select: { email: true },
  });
  const recipients = partitionRecipients(
    { to: input.to, cc: input.cc, bcc: input.bcc },
    new Set(suppressedRows.map((r) => r.email))
  );
  const sendTo = [...recipients.to, ...recipients.cc, ...recipients.bcc];
  if (sendTo.length === 0) throw sendError('ALL_SUPPRESSED', { skipped: recipients.skipped });

  // 3. Per-mailbox hourly cap, then quota for the recipients actually sent to.
  try {
    await claimSendSlot(db, mailbox, now());
  } catch (error) {
    throw sendError('SEND_FAILED', {
      mailboxErrorCode: transportCode(error),
      skipped: recipients.skipped,
    });
  }
  const releaseQuota = await reserveQuota(ctx as never, tenantId, 'emailsPerMonth', sendTo.length);

  let recordId: string | null = null;
  // Set once the mailbox accepted the message: from then on the quota is consumed
  // and the email must never be recorded as FAILED.
  let delivered = false;
  try {
    const record = await db.emailRecord.create({
      data: {
        tenantId,
        userId,
        mailboxId: mailbox.id,
        subject: input.subject,
        body: input.htmlBody,
        fromEmail: mailbox.fromAddress,
        toEmail: recipients.to.join(', '),
        ccEmails: recipients.cc.length > 0 ? recipients.cc.join(', ') : null,
        bccEmails: recipients.bcc.length > 0 ? recipients.bcc.join(', ') : null,
        status: 'PENDING',
        templateId: input.templateId ?? null,
        metadata: recordMetadata(input, recipients.skipped, options),
      },
    });
    recordId = record.id as string;

    const attachments = input.attachments ?? [];
    if (attachments.length > 0) {
      await db.emailAttachment.createMany({
        data: attachments.map((a) => ({
          emailId: recordId,
          tenantId,
          fileName: a.fileName,
          fileSize: a.size,
          fileType: a.contentType,
          fileUrl: a.storagePath,
        })),
      });
    }

    const parts = await loadAttachmentParts(deps.storage, tenantId, attachments);

    const mime = await buildMime({
      recordId,
      from: { address: mailbox.fromAddress, name: mailbox.fromName },
      to: recipients.to,
      cc: recipients.cc,
      bcc: recipients.bcc,
      replyTo: settings.replyToAddress,
      subject: input.subject,
      html: input.htmlBody,
      text: input.textBody,
      attachments: parts,
      keepBcc: mailbox.kind !== 'SMTP',
    });
    const sent = await sendThroughMailbox(
      db,
      mailbox,
      deps.transports,
      { from: mailbox.fromAddress, to: sendTo },
      mime.raw,
      now()
    );
    delivered = true;

    await db.emailRecord.update({
      where: { id: recordId, tenantId },
      data: {
        status: 'SENT',
        sentAt: now(),
        messageIdHeader: mime.messageId,
        provider: sent.provider,
        providerMessageId: sent.providerMessageId,
      },
    });
    return { id: recordId, status: 'SENT', skipped: recipients.skipped };
  } catch (error) {
    // The recipients got it: keep the charge and the SENT outcome; surface the error.
    if (delivered) throw error;
    await releaseQuota();
    if (recordId === null) throw error;

    const code = transportCode(error);
    console.error('[email] user mail send failed', { recordId, code });
    await recordFailure(
      db,
      { recordId, tenantId, mailboxId: mailbox.id, code },
      {
        ...recordMetadata(input, recipients.skipped, options),
        sendErrorCode: code,
      }
    );
    throw sendError('SEND_FAILED', { mailboxErrorCode: code, skipped: recipients.skipped });
  }
}
