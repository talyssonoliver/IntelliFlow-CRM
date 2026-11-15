/**
 * One-click "Log to contact" (#1177, owner decision 14/11).
 *
 * Mail sent from the CRM (through the user's Gmail, Outlook or SMTP mailbox) is stored as the
 * user composed it, but not linked to anyone: it does not show on a contact's timeline. This
 * router links one email to the lead or contact it is with, on the user's click. Nothing is
 * read from any mailbox here; only the CRM's own record is linked.
 *
 * - The counterparty is the first address on the email (sender, then recipients) that belongs to
 *   a lead or contact of the tenant, the user's own addresses excluded.
 * - A person with an active processing restriction is never linked (refused, nothing written).
 * - Only the email's own user (or an email admin) can link it; another tenant's email is not found.
 * - Linking an email that is already linked changes nothing.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { recordIdSchema } from '@intelliflow/validators/record-id';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import { assertTenantContext } from '../../security/tenant-context';
import { restrictionReader } from '../privacy/restriction-reader';
import { isEmailAdmin, type EmailRouterCtx } from './email-access';

const emailIdInput = z.object({ emailId: recordIdSchema });

export interface EmailLinkDto {
  logged: boolean;
  contactId: string | null;
  leadId: string | null;
}

interface StoredEmail {
  id: string;
  userId: string | null;
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

/** The first address that is a lead or contact of the tenant, the user's own excluded. */
async function findCounterparty(ctx: EmailRouterCtx, email: StoredEmail) {
  const own = new Set(
    [email.mailbox?.fromAddress, email.mailbox?.accountAddress]
      .filter((a): a is string => Boolean(a))
      .map((a) => a.toLowerCase())
  );
  for (const address of emailAddresses(email)) {
    if (own.has(address)) continue;
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

export const emailLogRouter = createTRPCRouter({
  /** Whether the email is already linked to a lead or contact. */
  status: tenantProcedure.input(emailIdInput).query(async ({ ctx, input }) => {
    assertTenantContext(ctx);
    return linkOf(await loadEmail(ctx as unknown as EmailRouterCtx, input.emailId));
  }),

  /** Links the email to the lead or contact it is with. */
  logToContact: tenantProcedure
    .input(emailIdInput)
    .mutation(async ({ ctx, input }): Promise<EmailLinkDto> => {
      assertTenantContext(ctx);
      const c = ctx as unknown as EmailRouterCtx;
      const email = await loadEmail(c, input.emailId);
      if (linkOf(email).logged) return linkOf(email);
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
      const metadata = {
        ...((email.metadata as Record<string, unknown> | null) ?? {}),
        ...(party.leadId ? { leadId: party.leadId } : {}),
      };
      await c.prismaWithTenant.emailRecord.update({
        where: { id: email.id, tenantId: c.tenant.tenantId },
        data: { contactId: party.contactId, metadata },
      });
      return { logged: true, contactId: party.contactId, leadId: party.leadId };
    }),
});
