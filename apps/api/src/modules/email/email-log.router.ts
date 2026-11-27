/**
 * One-click "Log to contact" (#1177, owner decision 14/11).
 *
 * Mail sent from the CRM (through the user's Gmail, Outlook or SMTP mailbox) is stored as the
 * user composed it, but not linked to anyone: it does not show on a contact's timeline. This
 * router links one email to the lead or contact it is with, on the user's click. Nothing is
 * read from any mailbox here; only the CRM's own record is linked.
 *
 * - The counterparty is the first address on the email (sender, then recipients) that belongs to
 *   a lead or contact of the tenant, the user's own addresses excluded (the mailbox's, the sender
 *   of the user's own mail, and their login).
 * - A contact is linked through the email's contactId (their timeline reads it); a lead gets an
 *   EMAIL activity on its timeline (subject only), and the email keeps both in its metadata.
 * - A person with an active processing restriction is never linked (refused, nothing written).
 * - Only the email's own user (or an email admin) can link it; another tenant's email is not found.
 * - Linking an email that is already linked changes nothing.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { recordIdSchema } from '@intelliflow/validators/record-id';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import { assertTenantContext, createTenantWhereClause } from '../../security/tenant-context';
import { restrictionReader } from '../privacy/restriction-reader';
import { isEmailAdmin, type EmailRouterCtx } from './email-access';
import { leadEmailEngagement } from './lead-email-engagement';
import { mapEmailRecord, type ParsedEmailResponse } from './inbound.router';

const emailIdInput = z.object({ emailId: recordIdSchema });
const LEAD_EMAILS_LIMIT = 200;
const LEAD_EMAILS_MAX_PAGES = 5;

export interface EmailLinkDto {
  logged: boolean;
  contactId: string | null;
  leadId: string | null;
}

interface StoredEmail {
  id: string;
  userId: string | null;
  subject: string;
  status: string;
  sentAt: Date | null;
  createdAt: Date;
  fromEmail: string;
  toEmail: string;
  ccEmails: string | null;
  contactId: string | null;
  metadata: unknown;
  mailbox: { fromAddress: string; accountAddress: string | null } | null;
}

function leadIdOf(metadata: unknown): string | null {
  const id = (metadata as { leadId?: unknown } | null)?.leadId;
  return typeof id === 'string' ? id : null;
}

function linkOf(email: Pick<StoredEmail, 'contactId' | 'metadata'>): EmailLinkDto {
  const leadId = leadIdOf(email.metadata);
  return { logged: Boolean(email.contactId || leadId), contactId: email.contactId, leadId };
}

/** The addresses on the email, lower-cased, in order: sender first, then To and Cc. */
export function emailAddresses(email: Pick<StoredEmail, 'fromEmail' | 'toEmail' | 'ccEmails'>) {
  return [email.fromEmail, ...email.toEmail.split(','), ...(email.ccEmails ?? '').split(',')]
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a.includes('@'));
}

async function loadEmail(ctx: EmailRouterCtx, emailId: string): Promise<StoredEmail> {
  const email: StoredEmail | null = await ctx.prismaWithTenant.emailRecord.findFirst({
    where: { id: emailId, tenantId: ctx.tenant.tenantId },
    select: {
      id: true,
      userId: true,
      subject: true,
      status: true,
      sentAt: true,
      createdAt: true,
      fromEmail: true,
      toEmail: true,
      ccEmails: true,
      contactId: true,
      metadata: true,
      mailbox: { select: { fromAddress: true, accountAddress: true } },
    },
  });
  if (!email) throw new TRPCError({ code: 'NOT_FOUND', message: 'Email not found.' });
  // Someone else's mail is theirs to log; an email admin may log any of the tenant's.
  if (email.userId && email.userId !== ctx.tenant.userId && !isEmailAdmin(ctx)) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Email not found.' });
  }
  return email;
}

/** Statuses only mail the CRM user sent can have. */
const OUTBOUND_STATUSES = new Set(['PENDING', 'SENT', 'FAILED', 'BOUNCED', 'OPENED', 'CLICKED']);

/**
 * Whether the user sent this email (then its sender is the user, never the counterparty).
 * DELIVERED is shared: received mail (inbound, or synced from an Outlook inbox) has it too, and
 * there its sender IS the counterparty. A delivered email is the user's own only when it has a
 * user and was not synced from an inbox; received inbound mail has no user.
 */
/** Outbound statuses of mail that reached nobody: not gone out, failed, or every address bounced. */
const NOT_SENT_STATUSES: ReadonlySet<string> = new Set(['PENDING', 'FAILED', 'BOUNCED']);

function neverSent(email: Pick<StoredEmail, 'status' | 'userId' | 'metadata'>): boolean {
  if ((email.metadata as { isDraft?: unknown } | null)?.isDraft === true) return true;
  return isOutbound(email) && NOT_SENT_STATUSES.has(email.status);
}

export function isOutbound(email: Pick<StoredEmail, 'status' | 'userId' | 'metadata'>): boolean {
  if (OUTBOUND_STATUSES.has(email.status)) return true;
  if (email.status !== 'DELIVERED' || !email.userId) return false;
  return (email.metadata as { folder?: unknown } | null)?.folder !== 'inbox';
}

/** The user's own addresses: the email's mailbox, the sender of their own mail, their login. */
function ownAddresses(ctx: EmailRouterCtx, email: StoredEmail): Set<string> {
  const login = (ctx.user as { email?: string | null } | null | undefined)?.email;
  return new Set(
    [
      email.mailbox?.fromAddress,
      email.mailbox?.accountAddress,
      isOutbound(email) ? email.fromEmail : null,
      login,
    ]
      .filter((a): a is string => Boolean(a))
      .map((a) => a.trim().toLowerCase())
  );
}

/**
 * Addresses the mail never reached: refused when it was sent (`rejectedRecipients`, a 4xx too) or
 * bounced afterwards (`bouncedRecipients`, `hardBouncedRecipients`).
 */
const UNREACHED_KEYS = [
  'rejectedRecipients',
  'bouncedRecipients',
  'hardBouncedRecipients',
] as const;

function unreachedAddresses(email: Pick<StoredEmail, 'metadata'>): Set<string> {
  const metadata = (email.metadata as Record<string, unknown> | null) ?? {};
  const out = new Set<string>();
  for (const key of UNREACHED_KEYS) {
    const list = metadata[key];
    if (!Array.isArray(list)) continue;
    for (const a of list) if (typeof a === 'string') out.add(a.toLowerCase());
  }
  return out;
}

/**
 * The first address that is a lead or contact of the tenant: never the user's own, and never one
 * the mail did not reach (refused or bounced).
 */
async function findCounterparty(ctx: EmailRouterCtx, email: StoredEmail) {
  const own = ownAddresses(ctx, email);
  const unreached = unreachedAddresses(email);
  for (const address of emailAddresses(email)) {
    if (own.has(address) || unreached.has(address)) continue;
    const where = {
      tenantId: ctx.tenant.tenantId,
      email: { equals: address, mode: 'insensitive' },
    };
    const contact = await ctx.prismaWithTenant.contact.findFirst({ where, select: { id: true } });
    if (contact) return { address, contactId: contact.id as string, leadId: null };
    const lead = await ctx.prismaWithTenant.lead.findFirst({ where, select: { id: true } });
    if (lead) return { address, contactId: null, leadId: lead.id as string };
  }
  return null;
}

/** One ordered stream of a lead's non-draft mail, read in pages until the limit of mails is reached. */
async function readThreadStream(
  db: any,
  where: Record<string, unknown>,
  orderBy: unknown[]
): Promise<any[]> {
  const kept: any[] = [];
  for (let page = 0; page < LEAD_EMAILS_MAX_PAGES && kept.length < LEAD_EMAILS_LIMIT; page++) {
    const rows: any[] = await db.emailRecord.findMany({
      where,
      include: { attachments: true },
      orderBy,
      take: LEAD_EMAILS_LIMIT,
      skip: page * LEAD_EMAILS_LIMIT,
    });
    for (const row of rows) {
      if ((row.metadata as { isDraft?: unknown } | null)?.isDraft !== true) kept.push(row);
    }
    if (rows.length < LEAD_EMAILS_LIMIT) break;
  }
  return kept;
}

export const emailLogRouter = createTRPCRouter({
  /** Whether the email is already linked to a lead or contact. */
  status: tenantProcedure.input(emailIdInput).query(async ({ ctx, input }) => {
    assertTenantContext(ctx);
    return linkOf(await loadEmail(ctx as unknown as EmailRouterCtx, input.emailId));
  }),

  /**
   * Tracked sends to the lead's address and how many were opened, counted in the database over the
   * CRM's email records (the profile card's open rate). Only a lead the caller can see; another
   * tenant's records never count.
   */
  engagementForLead: tenantProcedure
    .input(z.object({ leadId: recordIdSchema }))
    .query(async ({ ctx, input }) => {
      assertTenantContext(ctx);
      const c = ctx as unknown as EmailRouterCtx;
      const { tenantId } = c.tenant;
      const lead = await c.prismaWithTenant.lead.findFirst({
        where: createTenantWhereClause(c.tenant as never, { id: input.leadId }),
        select: { email: true },
      });
      if (!lead?.email) return { sent: 0, opened: 0 };
      return leadEmailEngagement(c.prismaWithTenant as never, tenantId, lead.email);
    }),

  /**
   * The mail logged on a lead, oldest first by the provider's own date (sentAt, else createdAt),
   * with each mail's sanitised HTML and attachment metadata (the files are fetched on demand).
   * Only a lead of the caller's tenant; drafts are never part of it.
   */
  leadEmails: tenantProcedure
    .input(z.object({ leadId: recordIdSchema }))
    .query(async ({ ctx, input }): Promise<{ emails: ParsedEmailResponse[] }> => {
      assertTenantContext(ctx);
      const c = ctx as unknown as EmailRouterCtx;
      const { tenantId } = c.tenant;
      const lead = await c.prismaWithTenant.lead.findFirst({
        where: createTenantWhereClause(c.tenant as never, { id: input.leadId }),
        select: { id: true },
      });
      if (!lead) throw new TRPCError({ code: 'NOT_FOUND', message: 'Lead not found.' });
      const where = {
        tenantId,
        metadata: { path: ['leadId'], equals: input.leadId },
        // The lead lookup above proves the caller can see this lead, and mail logged to a lead
        // is visible to whoever can see it (register #64, email-read-access.ts): the whole
        // conversation, both directions, whatever mailbox it went through. Drafts are left out below.
      };
      // The thread is ordered by sentAt ?? createdAt, so the newest 200 are cut by that same date:
      // mail with a sentAt and mail without one (not yet backfilled: createdAt is its date) are read
      // as two streams, each newest first, then merged. Drafts are not part of the thread.
      const read = (extra: Record<string, unknown>, orderBy: unknown[]) =>
        readThreadStream(c.prismaWithTenant, { ...where, ...extra }, orderBy);
      const [dated, undated] = await Promise.all([
        read({ sentAt: { not: null } }, [
          { sentAt: 'desc' },
          { createdAt: 'desc' },
          { id: 'desc' },
        ]),
        read({ sentAt: null }, [{ createdAt: 'desc' }, { id: 'desc' }]),
      ]);
      const at = (row: any): number => (row.sentAt ?? row.createdAt).getTime();
      const byId = new Map<string, any>();
      for (const row of [...dated, ...undated]) byId.set(row.id, row);
      const visible = [...byId.values()]
        .sort((x, y) => at(y) - at(x) || String(y.id).localeCompare(String(x.id)))
        .slice(0, LEAD_EMAILS_LIMIT)
        .sort((x, y) => at(x) - at(y) || String(x.id).localeCompare(String(y.id)));
      return { emails: visible.map(mapEmailRecord) };
    }),

  /**
   * One mail of a lead's thread by id (the Emails tab opens a row in place; the thread list is
   * bounded, so an older row is read on its own). Same visibility as leadEmails.
   */
  leadEmail: tenantProcedure
    .input(z.object({ leadId: recordIdSchema, emailRecordId: recordIdSchema }))
    .query(async ({ ctx, input }): Promise<ParsedEmailResponse> => {
      assertTenantContext(ctx);
      const c = ctx as unknown as EmailRouterCtx;
      const { tenantId } = c.tenant;
      const lead = await c.prismaWithTenant.lead.findFirst({
        where: createTenantWhereClause(c.tenant as never, { id: input.leadId }),
        select: { id: true },
      });
      const row: any = lead
        ? await c.prismaWithTenant.emailRecord.findFirst({
            where: {
              id: input.emailRecordId,
              tenantId,
              metadata: { path: ['leadId'], equals: input.leadId },
              // Visible to whoever can see the lead (checked above); drafts are refused below.
            },
            include: { attachments: true },
          })
        : null;
      const isDraft = (row?.metadata as { isDraft?: unknown } | null)?.isDraft === true;
      if (!row || isDraft) throw new TRPCError({ code: 'NOT_FOUND', message: 'Email not found.' });
      return mapEmailRecord(row);
    }),

  /** Links the email to the lead or contact it is with. */
  logToContact: tenantProcedure
    .input(emailIdInput)
    .mutation(async ({ ctx, input }): Promise<EmailLinkDto> => {
      assertTenantContext(ctx);
      const c = ctx as unknown as EmailRouterCtx;
      const email = await loadEmail(c, input.emailId);
      if (linkOf(email).logged) return linkOf(email);
      // A draft, a failed send or one not sent yet never reached anyone: it must not appear on a
      // timeline as an email.
      if (neverSent(email)) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Send the email before logging it.',
        });
      }
      const party = await findCounterparty(c, email);
      if (!party) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No lead or contact has an address on this email.',
        });
      }
      const status = await restrictionReader(ctx as never).status(c.tenant.tenantId, party.address);
      if (status.restricted) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'This person has asked for their data not to be processed.',
        });
      }
      return linkParty(c, email, party);
    }),
});

/**
 * Writes the link under the email row's lock, after re-reading it: a log that raced this one and
 * linked first wins (its link is returned, nothing more is written), and metadata is merged into
 * the copy read under the lock. A contact is linked through contactId (their timeline reads it);
 * a lead's timeline is its activities, so a lead gets an EMAIL activity (the subject only) and
 * the email keeps the lead and the activity in its metadata.
 */
export async function linkParty(
  c: EmailRouterCtx,
  email: Pick<StoredEmail, 'id' | 'subject' | 'sentAt' | 'createdAt' | 'userId'>,
  party: { contactId: string | null; leadId: string | null },
  /** Who the timeline says logged it (MVP-012: a reply drafted by Aurora and sent by the user). */
  label: { source: string; userName: string } = {
    source: 'log-to-contact',
    userName: 'Logged from email',
  }
): Promise<EmailLinkDto> {
  const tenantId = c.tenant.tenantId;
  return c.prismaWithTenant.$transaction(async (tx: any) => {
    await tx.$queryRaw`SELECT id FROM email_records WHERE id = ${email.id} AND "tenantId" = ${tenantId} FOR UPDATE`;
    const current: Pick<StoredEmail, 'contactId' | 'metadata'> | null =
      await tx.emailRecord.findFirst({
        where: { id: email.id, tenantId },
        select: { contactId: true, metadata: true },
      });
    if (!current) throw new TRPCError({ code: 'NOT_FOUND', message: 'Email not found.' });
    if (linkOf(current).logged) return linkOf(current);
    const metadata = (current.metadata as Record<string, unknown> | null) ?? {};
    if (party.contactId) {
      await tx.emailRecord.update({
        where: { id: email.id, tenantId },
        data: { contactId: party.contactId },
      });
      return { logged: true, contactId: party.contactId, leadId: null };
    }
    const leadId = party.leadId as string;
    const activity = await tx.leadActivity.create({
      data: {
        type: 'EMAIL',
        title: email.subject.slice(0, 200) || '(No subject)',
        timestamp: email.sentAt ?? email.createdAt,
        // The person whose email it is (an admin may log a member's email for them).
        userId: email.userId ?? c.tenant.userId,
        userName: label.userName,
        leadId,
        tenantId,
        metadata: { emailRecordId: email.id, source: label.source, loggedBy: c.tenant.userId },
      },
      select: { id: true },
    });
    await tx.emailRecord.update({
      where: { id: email.id, tenantId },
      data: { metadata: { ...metadata, leadId, leadActivityId: activity.id } },
    });
    return { logged: true, contactId: null, leadId };
  });
}
