/**
 * MVP-012: approve an AI-drafted reply. A draft Aurora wrote (IFC-312, always status DRAFT) waits
 * for the user, who sends it, takes it into Compose to edit, or dismisses it. Nothing here runs
 * without the user's click (ADR-037), and each action first takes the draft out of DRAFT with one
 * conditional update, so a draft is acted on once: a double click, two tabs or a send racing a
 * dismiss never send it twice.
 *
 * - send: through the user's connected mailbox, by the same path as Compose (`dispatchUserMail`),
 *   recorded as a sent email; a failed send puts the draft back to DRAFT.
 * - openInCompose: the draft becomes an ordinary email draft of the user's (EDITED), which the
 *   existing Compose opens, edits and sends; the AI draft itself can then no longer be sent.
 * - dismiss: DISMISSED, never sent.
 * A draft answers a contact or (MVP-012 PR B) a lead: the lead's Emails tab lists its drafts with
 * `listForLead`, and every action applies to either. Kept apart from contact.router.ts, which may only
 * shrink.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import type { SendUserEmailResultDto } from '@intelliflow/validators';
import { createTRPCRouter, tenantProcedure, verifiedTenantProcedure } from '../../trpc';
import { escapeHtml } from '../../security/html-escape';
import { createTenantWhereClause, getTenantContext } from '../../security/tenant-context';
import { emailRuntimeDeps, type EmailRouterCtx } from '../email/email-access';
import { emailSendErrorFromCause } from '../email/email-send-error';
import { dispatchUserMail } from '../email/mailbox-sender';

const draftInput = z.object({ draftId: z.string().min(1).max(64) });

/** What a reply draft can be: written by Aurora, then acted on once by the user. */
export type ReplyDraftStatus = 'DRAFT' | 'SENDING' | 'SENT' | 'EDITED' | 'DISMISSED';

interface DraftRow {
  id: string;
  status: string;
  /** Exactly one is set (CHECK contact_reply_drafts_one_subject_check). */
  contactId: string | null;
  leadId: string | null;
  draftSubject: string;
  draftBody: string;
  contact: { email: string } | null;
  lead: { email: string | null } | null;
}

/** Plain text as simple HTML: escaped, paragraphs on blank lines, line breaks kept. */
export function draftBodyHtml(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

const notFound = () => new TRPCError({ code: 'NOT_FOUND', message: 'Draft not found' });

/**
 * Whether the caller may work on this contact or lead: the same access predicate their pages use
 * (own records for users, the team's for managers, all for admins).
 */
async function inScope(
  c: EmailRouterCtx,
  subject: { contactId: string | null; leadId: string | null }
): Promise<boolean> {
  const typed = getTenantContext(c as never);
  const select = { id: true };
  const found = subject.contactId
    ? await c.prismaWithTenant.contact.findFirst({
        where: createTenantWhereClause(typed.tenant, { id: subject.contactId }),
        select,
      })
    : await c.prismaWithTenant.lead.findFirst({
        where: createTenantWhereClause(typed.tenant, { id: subject.leadId }),
        select,
      });
  return Boolean(found);
}

/**
 * The draft, only when its contact or lead is one the caller may work on. Outside that scope it
 * does not exist for the caller (NOT_FOUND, no existence leak).
 */
async function loadDraft(c: EmailRouterCtx, draftId: string): Promise<DraftRow> {
  const draft: DraftRow | null = await c.prismaWithTenant.contactReplyDraft.findFirst({
    where: { id: draftId, tenantId: c.tenant.tenantId },
    include: { contact: { select: { email: true } }, lead: { select: { email: true } } },
  });
  if (!draft || !(await inScope(c, draft))) throw notFound();
  return draft;
}

const ALREADY: Record<string, string> = {
  SENDING: 'This draft is being sent.',
  SENT: 'This draft was already sent.',
  EDITED: 'This draft was already opened in Compose. Find it in your email drafts.',
  DISMISSED: 'This draft was dismissed.',
};

function alreadyActed(status: string): TRPCError {
  return new TRPCError({
    code: 'CONFLICT',
    message: ALREADY[status] ?? 'This draft can no longer be changed.',
  });
}

/** Moves the draft from one status to the next only if it is still in the first; false if not. */
async function move(
  db: EmailRouterCtx['prismaWithTenant'],
  c: EmailRouterCtx,
  draftId: string,
  from: ReplyDraftStatus,
  to: ReplyDraftStatus
): Promise<boolean> {
  const moved: { count: number } = await db.contactReplyDraft.updateMany({
    where: { id: draftId, tenantId: c.tenant.tenantId, status: from },
    data: { status: to },
  });
  return moved.count === 1;
}

/** Takes the draft out of DRAFT for an action, or explains why it cannot be. */
async function claim(c: EmailRouterCtx, draft: DraftRow, to: ReplyDraftStatus): Promise<void> {
  if (draft.status !== 'DRAFT') throw alreadyActed(draft.status);
  if (await move(c.prismaWithTenant, c, draft.id, 'DRAFT', to)) return;
  // Someone acted on it between the read and the claim: say what happened.
  throw alreadyActed((await loadDraft(c, draft.id)).status);
}

/**
 * True only when a failed send certainly did not go out. A refusal or failed send from the
 * mailbox path carries `emailSendError` (it is thrown before delivery, or for a delivery that
 * failed). Any other error with this attempt's email record already written may come after the
 * mailbox accepted the mail, so it is not known to be undelivered. With no record of this attempt
 * (an earlier failed attempt's does not count), nothing was handed to the mailbox.
 */
async function notDelivered(c: EmailRouterCtx, attempt: string, error: unknown): Promise<boolean> {
  // The mailbox path throws its refusals as a TRPCError whose cause names the refusal.
  if (emailSendErrorFromCause(error instanceof TRPCError ? error.cause : error)) return true;
  const record = await c.prismaWithTenant.emailRecord.findFirst({
    where: {
      tenantId: c.tenant.tenantId,
      metadata: { path: ['replyDraftAttempt'], equals: attempt },
    },
    select: { id: true },
  });
  return record === null;
}

/** The record the sent email is linked to: the draft's contact, or its lead. */
function subjectOf(draft: DraftRow): { contactId: string } | { leadId: string } {
  return draft.contactId ? { contactId: draft.contactId } : { leadId: draft.leadId as string };
}

function recipientOf(draft: DraftRow): string {
  const email = (draft.contact?.email ?? draft.lead?.email)?.trim();
  if (!email) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'There is no email address to reply to.',
    });
  }
  return email;
}

const leadListInput = z.object({
  leadId: z.string().min(1).max(64),
  limit: z.number().int().min(1).max(50).default(5),
});

/** A lead's draft as its Emails tab lists it. */
export interface LeadReplyDraftDto {
  id: string;
  leadId: string;
  draftSubject: string;
  draftBody: string;
  tone: string | null;
  status: ReplyDraftStatus;
  confidence: number;
  modelVersion: string;
  createdAt: Date;
}

export const replyDraftRouter = createTRPCRouter({
  /**
   * MVP-012 PR B: the replies Aurora drafted to a lead, for its Emails tab. Dismissed ones are left
   * out before the limit and waiting ones (DRAFT) sort first, so neither hides a waiting draft.
   */
  listForLead: tenantProcedure
    .input(leadListInput)
    .query(async ({ ctx, input }): Promise<{ drafts: LeadReplyDraftDto[] }> => {
      const c = ctx as unknown as EmailRouterCtx;
      if (!(await inScope(c, { contactId: null, leadId: input.leadId }))) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Lead not found' });
      }
      const rows: Array<Omit<LeadReplyDraftDto, 'leadId' | 'status'> & { status: string }> =
        await c.prismaWithTenant.contactReplyDraft.findMany({
          where: {
            tenantId: c.tenant.tenantId,
            leadId: input.leadId,
            status: { not: 'DISMISSED' },
          },
          orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], // DRAFT (waiting) sorts first
          take: input.limit,
          select: {
            id: true,
            draftSubject: true,
            draftBody: true,
            tone: true,
            status: true,
            confidence: true,
            modelVersion: true,
            createdAt: true,
          },
        });
      return {
        drafts: rows.map((d) => ({
          ...d,
          leadId: input.leadId,
          status: d.status as ReplyDraftStatus,
        })),
      };
    }),

  /** Sends the draft as written, from the user's connected mailbox (same path as Compose). */
  send: verifiedTenantProcedure
    .input(draftInput)
    .mutation(async ({ ctx, input }): Promise<SendUserEmailResultDto> => {
      const c = ctx as unknown as EmailRouterCtx;
      const deps = emailRuntimeDeps(c);
      const draft = await loadDraft(c, input.draftId);
      const to = recipientOf(draft);
      await claim(c, draft, 'SENDING');
      const attempt = randomUUID();
      let result: SendUserEmailResultDto;
      try {
        result = await dispatchUserMail(
          c as never,
          {
            to: [to],
            subject: draft.draftSubject,
            htmlBody: draftBodyHtml(draft.draftBody),
            textBody: draft.draftBody,
            // A reply to someone who wrote in: service mail, never marketing.
            purpose: 'SERVICE',
          },
          deps,
          {
            metadata: {
              replyDraftId: draft.id,
              // This attempt's own id: only its record is evidence the mail may have gone (codex).
              replyDraftAttempt: attempt,
              ...subjectOf(draft),
              source: 'ai-reply',
            },
          }
        );
      } catch (error) {
        // Only a send known not to have gone out makes the draft sendable again; anything else
        // may have been delivered, so it stays SENDING and is never offered twice (codex).
        if (await notDelivered(c, attempt, error)) {
          await move(c.prismaWithTenant, c, draft.id, 'SENDING', 'DRAFT');
        }
        throw error;
      }
      const sent = result.status === 'SENT';
      await move(c.prismaWithTenant, c, draft.id, 'SENDING', sent ? 'SENT' : 'DRAFT');
      return result;
    }),

  /**
   * Edit: the draft becomes an ordinary email draft of the user's, opened by Compose
   * (/email/compose?draftId=…), which edits and sends it like any other.
   */
  openInCompose: tenantProcedure
    .input(draftInput)
    .mutation(async ({ ctx, input }): Promise<{ emailDraftId: string }> => {
      const c = ctx as unknown as EmailRouterCtx;
      const draft = await loadDraft(c, input.draftId);
      const to = recipientOf(draft);
      if (draft.status !== 'DRAFT') throw alreadyActed(draft.status);
      const user = (c.user ?? {}) as { email?: string | null };
      const emailDraftId = await c.prismaWithTenant.$transaction(async (tx: any) => {
        if (!(await move(tx, c, draft.id, 'DRAFT', 'EDITED'))) return null;
        const record: { id: string } = await tx.emailRecord.create({
          data: {
            subject: draft.draftSubject,
            body: draftBodyHtml(draft.draftBody),
            fromEmail: user.email ?? '',
            toEmail: to,
            status: 'PENDING',
            tenantId: c.tenant.tenantId,
            userId: c.tenant.userId,
            metadata: {
              isDraft: true,
              isHtml: true,
              textBody: draft.draftBody,
              replyDraftId: draft.id,
              ...subjectOf(draft),
            },
          },
          select: { id: true },
        });
        return record.id;
      });
      if (!emailDraftId) throw alreadyActed((await loadDraft(c, draft.id)).status);
      return { emailDraftId };
    }),

  /** Dismiss: the draft is set aside and never sent. */
  dismiss: tenantProcedure
    .input(draftInput)
    .mutation(async ({ ctx, input }): Promise<{ dismissed: true }> => {
      const c = ctx as unknown as EmailRouterCtx;
      await claim(c, await loadDraft(c, input.draftId), 'DISMISSED');
      return { dismissed: true };
    }),
});
