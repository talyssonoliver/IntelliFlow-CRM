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
 * suppressed sends nothing) → for MARKETING mail, drop recipients who objected to
 * direct marketing (IFC-315; audited) → per-mailbox hourly cap → reserve quota for the
 * recipients actually sent to → record PENDING → read attachments from the
 * tenant's storage → build the MIME (From = mailbox address, Reply-To = tenant
 * override) → send through that mailbox only → record SENT or FAILED. Quota is
 * released on every failure after it was reserved. No fallback to another
 * mailbox or provider, ever.
 */
import { MailboxTransportError, buildMime, type MimeAttachment } from '@intelliflow/adapters';
import type { EmailAttachmentStoragePort } from '@intelliflow/application';
import {
  evaluateBounce,
  isEmailSettingsAdminRole,
  normalizeEmail,
  partitionRecipients,
  resolveSendingMailbox,
  type BounceRules,
  type MailboxErrorCode,
  type MailboxStatus,
} from '@intelliflow/domain';
import {
  MAX_EMAIL_TOTAL_ATTACHMENT_BYTES,
  type SendUserEmailInput,
  type SendUserEmailResultDto,
  type SmtpAccountRow,
  type SmtpEndpointRow,
} from '@intelliflow/validators';
import { reserveQuota } from '../../shared/quota-guard';
import { getAuditLogger } from '../../security/audit-logger';
import {
  marketingObjectionReader,
  type MarketingObjectionReader,
} from '../privacy/restriction-reader';
import { settingsValues } from './email-dto';
import { emailSendError } from './email-send-error';

export { emailSendErrorFromCause } from './email-send-error';
import { claimSendSlot, sendThroughMailbox, type MailboxTransports } from './mailbox-transport';

export interface DispatchDeps {
  transports: MailboxTransports;
  storage: Pick<EmailAttachmentStoragePort, 'downloadEmailAttachment'>;
  /** IFC-315: defaults to the request's restriction repository. */
  objections?: MarketingObjectionReader;
  now?: () => Date;
}

export interface DispatchOptions {
  /** Extra metadata merged into the EmailRecord (e.g. forward provenance). */
  metadata?: Record<string, unknown>;
}

const sendError = emailSendError;

/** The SMTP columns come from SmtpEndpointRow and SmtpAccountRow (#1103). */
interface MailboxRow extends SmtpEndpointRow, SmtpAccountRow {
  id: string;
  tenantId: string;
  scope: string;
  userId: string | null;
  kind: string;
  status: string;
  fromAddress: string;
  fromName: string | null;
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
  let parts: MimeAttachment[];
  try {
    parts = await Promise.all(
      attachments.map(async (a) => ({
        filename: a.fileName,
        contentType: a.contentType,
        content: await storage.downloadEmailAttachment(tenantId, a.storagePath),
      }))
    );
  } catch {
    throw new MailboxTransportError('ATTACHMENT_UNAVAILABLE');
  }
  // The declared sizes are client input: the stored bytes are what is sent.
  const bytes = parts.reduce((sum, part) => sum + part.content.length, 0);
  if (bytes > MAX_EMAIL_TOTAL_ATTACHMENT_BYTES)
    throw new MailboxTransportError('ATTACHMENT_UNAVAILABLE');
  return parts;
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
    ...(input.purpose === 'MARKETING' ? { purpose: 'MARKETING' } : {}),
    ...options.metadata,
  };
}

/**
 * IFC-315: a MARKETING email is never sent to a person who objected to direct marketing
 * (UK GDPR Art 21(3)) or whose record was erased. Those recipients are dropped, like
 * suppressed ones, and each refusal is audited with counts only (no addresses). SERVICE mail
 * (the default) is not affected: the person may still need replies and notices.
 */
async function dropMarketingObjections(
  ctx: DispatchCtx,
  input: SendUserEmailInput,
  deps: DispatchDeps,
  recipients: ReturnType<typeof partitionRecipients>
): Promise<{ recipients: ReturnType<typeof partitionRecipients>; objected: string[] }> {
  if (input.purpose !== 'MARKETING') return { recipients, objected: [] };
  const { tenantId, userId } = ctx.tenant;
  const kept = [...recipients.to, ...recipients.cc, ...recipients.bcc];
  if (kept.length === 0) return { recipients, objected: [] };
  const reader = deps.objections ?? marketingObjectionReader(ctx as never);
  const blocked = await reader.marketingBlocked(tenantId, kept.map(normalizeEmail));
  if (blocked.size === 0) return { recipients, objected: [] };

  const remaining = partitionRecipients(recipients, blocked);
  getAuditLogger(ctx.prisma as never)
    .logAction('CREATE', 'email_message', '-', tenantId, {
      actorId: userId,
      eventType: 'EmailMarketingObjectionApplied',
      actionReason: 'MARKETING_OBJECTION',
      afterState: {
        purpose: 'MARKETING',
        objectedRecipients: remaining.skipped.length,
        sentRecipients: remaining.to.length + remaining.cc.length + remaining.bcc.length,
      },
    })
    .catch((err: unknown) => console.error('[email] Audit log failed:', err));
  return {
    recipients: { ...remaining, skipped: recipients.skipped },
    objected: remaining.skipped,
  };
}

/** Permanent (5xx) refusals: the rest of `rejected` were refused temporarily (4xx). */
function hardRefusals(refused: { rejected: string[]; temporary: string[] }): string[] {
  const temporary = new Set(refused.temporary.map((address) => address.toLowerCase()));
  return refused.rejected
    .map((address) => address.toLowerCase())
    .filter((address) => !temporary.has(address));
}

const NO_REFUSALS = { rejected: [], temporary: [] };

/** The refused-recipient fields of the record metadata. */
function refusalFields(refused: { rejected: string[]; temporary: string[] }) {
  const lower = refused.rejected.map((address) => address.toLowerCase());
  return {
    rejectedRecipients: lower,
    bouncedRecipients: lower,
    // A temporary (4xx) refusal is bounced for this send, never a hard bounce.
    hardBouncedRecipients: hardRefusals(refused),
  };
}

/** Record metadata naming refused recipients, or nothing when all were accepted. */
function rejectedMetadata(
  input: SendUserEmailInput,
  skipped: string[],
  options: DispatchOptions,
  refused: { rejected: string[]; temporary: string[] }
): { metadata?: Record<string, unknown> } {
  if (refused.rejected.length === 0) return {};
  return { metadata: { ...recordMetadata(input, skipped, options), ...refusalFields(refused) } };
}

/**
 * A permanent SMTP refusal is a hard bounce the DSN reader never sees (the
 * server never accepted the mail), so the tenant's hard-bounce rule is applied
 * here. It runs after the send outcome is stored and never fails the send: if
 * this write fails, the hard bounce stays on the record (`hardBouncedRecipients`).
 */
async function suppressHardRefusals(
  db: any,
  ids: { tenantId: string; recordId: string },
  rules: BounceRules,
  hard: string[]
): Promise<void> {
  const decision = evaluateBounce('HARD', rules, 0);
  if (!decision.suppress || hard.length === 0) return;
  try {
    await writeSuppressions(db, ids, decision.reason, hard);
  } catch (error) {
    console.error('[email] smtp refusal suppression failed', {
      recordId: ids.recordId,
      recipients: hard.length,
      code: (error as { code?: unknown } | null)?.code ?? null,
    });
  }
}

async function writeSuppressions(
  db: any,
  ids: { tenantId: string; recordId: string },
  reason: string | null,
  hard: string[]
): Promise<void> {
  for (const email of new Set(hard.map((address) => normalizeEmail(address)))) {
    await db.emailSuppression.upsert({
      where: { tenantId_email: { tenantId: ids.tenantId, email } },
      create: {
        tenantId: ids.tenantId,
        email,
        reason,
        source: 'SMTP',
        emailRecordId: ids.recordId,
      },
      update: {},
    });
  }
}

/** FAILED with its code; an authentication failure also marks the mailbox ERROR. */
async function recordFailure(
  db: any,
  ids: {
    recordId: string;
    tenantId: string;
    mailboxId: string;
    /** The credential version this send used. */
    tokenVersion: number;
    code: MailboxErrorCode;
  },
  metadata: Record<string, unknown>
): Promise<void> {
  await db.emailRecord.update({
    where: { id: ids.recordId, tenantId: ids.tenantId },
    data: { status: 'FAILED', metadata },
  });
  if (ids.code === 'AUTH_FAILED') {
    // Only these credentials: if new ones were saved meanwhile, they stand.
    await db.emailMailbox.updateMany({
      where: { id: ids.mailboxId, tenantId: ids.tenantId, tokenVersion: ids.tokenVersion },
      data: { status: 'ERROR', lastErrorCode: ids.code },
    });
  }
}

/** The mailbox this user's email would leave from, by the same rules as a send. */
export async function resolveSender(
  ctx: Pick<DispatchCtx, 'prismaWithTenant' | 'tenant' | 'user'>
) {
  const db = ctx.prismaWithTenant;
  const { tenantId, userId } = ctx.tenant;
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
  return { settings, resolved };
}

/**
 * Steps 2 and 2b: drop suppressed recipients (Q9), then, for MARKETING mail, those who objected
 * (IFC-315). Refuses when nobody is left: ALL_OBJECTED if an objection removed anyone, else
 * ALL_SUPPRESSED.
 */
async function resolveRecipients(
  ctx: DispatchCtx,
  input: SendUserEmailInput,
  deps: DispatchDeps
): Promise<{
  recipients: ReturnType<typeof partitionRecipients>;
  objected: string[];
  sendTo: string[];
}> {
  const allRecipients = [...input.to, ...(input.cc ?? []), ...(input.bcc ?? [])].map((address) =>
    normalizeEmail(address)
  );
  const suppressedRows: Array<{ email: string }> =
    await ctx.prismaWithTenant.emailSuppression.findMany({
      where: { tenantId: ctx.tenant.tenantId, email: { in: [...new Set(allRecipients)] } },
      select: { email: true },
    });
  const unsuppressed = partitionRecipients(
    { to: input.to, cc: input.cc, bcc: input.bcc },
    new Set(suppressedRows.map((r) => r.email))
  );
  const { recipients, objected } = await dropMarketingObjections(ctx, input, deps, unsuppressed);
  const sendTo = [...recipients.to, ...recipients.cc, ...recipients.bcc];
  if (sendTo.length === 0 && objected.length > 0) {
    throw sendError('ALL_OBJECTED', { skipped: [...recipients.skipped, ...objected] });
  }
  if (sendTo.length === 0) throw sendError('ALL_SUPPRESSED', { skipped: recipients.skipped });
  return { recipients, objected, sendTo };
}

/** The record metadata also lists recipients left out for a marketing objection, when any. */
function withObjectedRecipients(options: DispatchOptions, objected: string[]): DispatchOptions {
  if (objected.length === 0) return options;
  return { ...options, metadata: { ...options.metadata, objectedRecipients: objected } };
}

export async function dispatchUserMail(
  ctx: DispatchCtx,
  input: SendUserEmailInput,
  deps: DispatchDeps,
  dispatchOptions: DispatchOptions = {}
): Promise<SendUserEmailResultDto> {
  const now = deps.now ?? (() => new Date());
  const db = ctx.prismaWithTenant;
  const { tenantId, userId } = ctx.tenant;

  // 1. Settings + the two candidate mailboxes in one query (NF-001).
  const { settings, resolved } = await resolveSender(ctx);
  if ('refusal' in resolved) throw sendError(resolved.refusal);
  const mailbox = resolved.mailbox;

  // 2. Suppression, then marketing objections; refuses when nobody is left.
  const { recipients, objected, sendTo } = await resolveRecipients(ctx, input, deps);
  const options = withObjectedRecipients(dispatchOptions, objected);

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
    const parts = await loadAttachmentParts(deps.storage, tenantId, attachments);
    if (attachments.length > 0) {
      await db.emailAttachment.createMany({
        // The stored bytes, never the size the client declared.
        data: attachments.map((a, i) => ({
          emailId: recordId,
          tenantId,
          fileName: a.fileName,
          fileSize: parts[i]!.content.length,
          fileType: a.contentType,
          fileUrl: a.storagePath,
        })),
      });
    }

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

    // Recipients the server refused were not sent: their quota comes back and
    // they are recorded as bounced (the Sent list shows "Partly bounced").
    const rejected = sendTo.filter((address) => sent.rejected.includes(address.toLowerCase()));
    if (rejected.length > 0) await releaseQuota(rejected.length);
    const refused = { rejected, temporary: sent.rejectedTemporarily ?? [] };
    const sentData = {
      status: 'SENT',
      sentAt: now(),
      messageIdHeader: mime.messageId,
      provider: sent.provider,
      providerMessageId: sent.providerMessageId,
      ...rejectedMetadata(input, recipients.skipped, options, refused),
    };
    // The accepted delivery is stored first and on its own; suppression follows.
    await db.emailRecord.update({ where: { id: recordId, tenantId }, data: sentData });
    await suppressHardRefusals(db, { tenantId, recordId }, settings, hardRefusals(refused));
    return {
      id: recordId,
      status: 'SENT',
      skipped: recipients.skipped,
      rejected,
      ...(objected.length > 0 ? { objected } : {}),
    };
  } catch (error) {
    // The recipients got it: keep the charge and the SENT outcome; surface the error.
    if (delivered) throw error;
    await releaseQuota();
    if (recordId === null) throw error;

    const code = transportCode(error);
    // Every recipient refused (SMTP): the refusals are still bounces, and a
    // permanent one is a hard bounce, as in a partial refusal.
    const refused = (error instanceof MailboxTransportError && error.refused) || NO_REFUSALS;
    console.error('[email] user mail send failed', { recordId, code });
    await recordFailure(
      db,
      { recordId, tenantId, mailboxId: mailbox.id, tokenVersion: mailbox.tokenVersion, code },
      {
        ...recordMetadata(input, recipients.skipped, options),
        ...(refused.rejected.length > 0 ? refusalFields(refused) : {}),
        sendErrorCode: code,
      }
    );
    await suppressHardRefusals(db, { tenantId, recordId }, settings, hardRefusals(refused));
    throw sendError('SEND_FAILED', { mailboxErrorCode: code, skipped: recipients.skipped });
  }
}
