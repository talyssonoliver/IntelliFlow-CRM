/**
 * Customer feedback surveys: create, send, look up and answer (MVP-012).
 *
 * Plain functions over a Prisma client and an email sender, so the staff router, the two automatic
 * triggers and the public answer router share one implementation. Tenant scope:
 *   - create/queue take the tenant id from the signed-in request (or the record being closed),
 *     never from a body, and every query carries it;
 *   - the public lookup and answer find the row by the token's hash alone, and take the tenant from
 *     that row. Nothing the visitor sends can name a tenant.
 */
import { PrismaProcessingRestrictionRepository } from '@intelliflow/adapters';
import type { PrismaClient } from '@intelliflow/db';
import type { SurveyType } from '@intelliflow/domain';
import { requiredProdEnv } from '@intelliflow/validators/required-url';
import { buildSurveyEmail } from './survey-email';
import {
  isValidSurveyScore,
  sentimentForScore,
  SENDABLE_SURVEY_TYPES,
  type SendableSurveyType,
} from './survey-scoring';
import { generateSurveyToken, hashSurveyToken, surveyTokenExpiry } from './survey-token';

export type SurveyDb = Pick<
  PrismaClient,
  | 'feedbackSurvey'
  | 'feedbackSurveySetting'
  | 'contact'
  | 'tenant'
  | 'opportunity'
  | 'ticket'
  | 'processingRestriction'
>;

export interface SurveyEmailSender {
  sendEmail(options: {
    to: string[];
    subject: string;
    htmlBody?: string;
    textBody?: string;
    replyTo?: string;
  }): Promise<{ isFailure: boolean; error?: unknown }>;
}

export type SurveyTrigger = 'MANUAL' | 'DEAL_WON' | 'TICKET_RESOLVED';

/** At most one automatic survey per contact in this many days. */
export const SURVEY_THROTTLE_DAYS = 30;
const MS_PER_DAY = 86_400_000;
export const COMMENT_MAX_LENGTH = 2000;

export interface CreateSurveyInput {
  tenantId: string;
  contactId: string;
  surveyType: SendableSurveyType;
  trigger: SurveyTrigger;
  sentById?: string;
  replyTo?: string;
  ticketId?: string;
  dealId?: string;
}

export type CreateSurveyResult =
  | { ok: true; surveyId: string; delivered: boolean }
  | { ok: false; reason: 'contact_not_found' | 'no_email' | 'restricted' };

/**
 * A data subject who asked for processing to be restricted (or an erased record) gets no survey.
 * The same register the scoring, drafting and duplicate checks read. A failed check counts as
 * restricted: an email cannot be recalled, so the survey waits rather than risk it.
 */
async function isProcessingRestricted(db: SurveyDb, tenantId: string, email: string) {
  try {
    const restrictions = new PrismaProcessingRestrictionRepository(db as never);
    return (await restrictions.status(tenantId, email)).restricted;
  } catch (err) {
    console.warn('[feedback-survey] Restriction check failed; survey not sent', err);
    return true;
  }
}

function surveyLink(token: string): string {
  const appUrl = requiredProdEnv('APP_URL', process.env.APP_URL, 'http://localhost:3000');
  return `${appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl}/feedback/${token}`;
}

/** Creates the survey row (token hash and expiry only) and emails the link. */
export async function createAndSendSurvey(
  db: SurveyDb,
  sender: SurveyEmailSender,
  input: CreateSurveyInput,
  now: Date = new Date()
): Promise<CreateSurveyResult> {
  const contact = await db.contact.findFirst({
    where: { id: input.contactId, tenantId: input.tenantId },
    select: { id: true, email: true, firstName: true, lastName: true, accountId: true },
  });
  if (!contact) return { ok: false, reason: 'contact_not_found' };
  if (!contact.email) return { ok: false, reason: 'no_email' };
  if (await isProcessingRestricted(db, input.tenantId, contact.email)) {
    return { ok: false, reason: 'restricted' };
  }

  const tenant = await db.tenant.findUnique({
    where: { id: input.tenantId },
    select: { name: true },
  });

  const token = generateSurveyToken();
  const row = await db.feedbackSurvey.create({
    data: {
      tenantId: input.tenantId,
      type: input.surveyType,
      contactId: contact.id,
      contactName: `${contact.firstName} ${contact.lastName}`.trim(),
      contactEmail: contact.email,
      accountId: contact.accountId ?? null,
      ticketId: input.ticketId ?? null,
      dealId: input.dealId ?? null,
      trigger: input.trigger,
      sentById: input.sentById ?? null,
      status: 'PENDING',
      tokenHash: hashSurveyToken(token),
      tokenExpiresAt: surveyTokenExpiry(now),
    },
    select: { id: true },
  });

  const message = buildSurveyEmail({
    companyName: tenant?.name ?? 'us',
    surveyType: input.surveyType,
    link: surveyLink(token),
    replyTo: input.replyTo,
    recipientEmail: contact.email,
  });

  let delivered: boolean;
  try {
    const result = await sender.sendEmail(message);
    delivered = !result.isFailure;
  } catch {
    delivered = false;
  }
  if (!delivered) {
    // The row stays PENDING and unsent: nobody has the link, and it does not count against the throttle.
    console.warn('[feedback-survey] Survey email was not sent', { trigger: input.trigger });
    return { ok: true, surveyId: row.id, delivered: false };
  }

  await db.feedbackSurvey.updateMany({
    where: { id: row.id, tenantId: input.tenantId },
    data: { status: 'SENT', sentAt: now },
  });
  return { ok: true, surveyId: row.id, delivered: true };
}

// --- Automatic triggers ------------------------------------------------------

export type QueueReason =
  | 'queued'
  | 'disabled'
  | 'throttled'
  | 'not_sent'
  | 'no_contact'
  | 'no_sender'
  | 'restricted'
  | 'error';

const AUTO_TYPE: Record<'DEAL_WON' | 'TICKET_RESOLVED', SendableSurveyType> = {
  DEAL_WON: 'NPS',
  TICKET_RESOLVED: 'CSAT',
};

/** Owner rule "defaults on": a tenant with no settings row gets both automatic surveys. */
export async function loadSurveySettings(db: SurveyDb, tenantId: string) {
  const row = await db.feedbackSurveySetting.findUnique({ where: { tenantId } });
  return {
    autoSendOnDealWon: row?.autoSendOnDealWon ?? true,
    autoSendOnTicketResolved: row?.autoSendOnTicketResolved ?? true,
  };
}

export async function hasRecentSurvey(
  db: SurveyDb,
  tenantId: string,
  contactId: string,
  now: Date = new Date()
): Promise<boolean> {
  const since = new Date(now.getTime() - SURVEY_THROTTLE_DAYS * MS_PER_DAY);
  const count = await db.feedbackSurvey.count({
    where: { tenantId, contactId, sentAt: { gte: since } },
  });
  return count > 0;
}

export interface QueueAutoSurveyInput {
  tenantId: string;
  trigger: 'DEAL_WON' | 'TICKET_RESOLVED';
  contactId: string | null | undefined;
  ticketId?: string;
  dealId?: string;
}

/**
 * Queues the automatic survey for a closed-won deal or a resolved/closed ticket: respects the tenant
 * switch (default ON) and sends at most one survey per contact per 30 days. Never throws: a survey
 * must not undo the deal or ticket change that triggered it.
 */
export async function queueAutoSurvey(
  db: SurveyDb,
  sender: SurveyEmailSender | undefined,
  input: QueueAutoSurveyInput,
  now: Date = new Date()
): Promise<QueueReason> {
  try {
    if (!input.contactId) return 'no_contact';
    if (!sender) return 'no_sender';
    const settings = await loadSurveySettings(db, input.tenantId);
    const enabled =
      input.trigger === 'DEAL_WON' ? settings.autoSendOnDealWon : settings.autoSendOnTicketResolved;
    if (!enabled) return 'disabled';
    if (await hasRecentSurvey(db, input.tenantId, input.contactId, now)) return 'throttled';

    const result = await createAndSendSurvey(
      db,
      sender,
      {
        tenantId: input.tenantId,
        contactId: input.contactId,
        surveyType: AUTO_TYPE[input.trigger],
        trigger: input.trigger,
        ticketId: input.ticketId,
        dealId: input.dealId,
      },
      now
    );
    if (!result.ok) return result.reason === 'restricted' ? 'restricted' : 'no_contact';
    return result.delivered ? 'queued' : 'not_sent';
  } catch (error) {
    console.error('[feedback-survey] Automatic survey failed', {
      trigger: input.trigger,
      error: error instanceof Error ? error.name : 'unknown',
    });
    return 'error';
  }
}

/** Deal moved to CLOSED_WON: survey the deal's contact. */
export async function queueSurveyForWonDeal(
  db: SurveyDb,
  sender: SurveyEmailSender | undefined,
  tenantId: string,
  opportunityId: string
): Promise<QueueReason> {
  try {
    const deal = await db.opportunity.findFirst({
      where: { id: opportunityId, tenantId },
      select: { id: true, contactId: true },
    });
    if (!deal) return 'no_contact';
    return await queueAutoSurvey(db, sender, {
      tenantId,
      trigger: 'DEAL_WON',
      contactId: deal.contactId,
      dealId: deal.id,
    });
  } catch {
    return 'error';
  }
}

/** Ticket resolved or closed: survey the ticket's contact (found by id, else by the ticket's email). */
export async function queueSurveyForResolvedTicket(
  db: SurveyDb,
  sender: SurveyEmailSender | undefined,
  tenantId: string,
  ticketId: string
): Promise<QueueReason> {
  try {
    const ticket = await db.ticket.findFirst({
      where: { id: ticketId, tenantId },
      select: { id: true, contactId: true, contactEmail: true },
    });
    if (!ticket) return 'no_contact';
    let contactId = ticket.contactId;
    if (!contactId && ticket.contactEmail) {
      const byEmail = await db.contact.findFirst({
        where: { tenantId, email: ticket.contactEmail },
        select: { id: true },
      });
      contactId = byEmail?.id ?? null;
    }
    return await queueAutoSurvey(db, sender, {
      tenantId,
      trigger: 'TICKET_RESOLVED',
      contactId,
      ticketId: ticket.id,
    });
  } catch {
    return 'error';
  }
}

// --- Public answer -----------------------------------------------------------

export type PublicSurveyLookup =
  | { status: 'ok'; surveyType: SendableSurveyType; companyName: string }
  | { status: 'invalid' | 'expired' | 'used' };

function isSendable(type: string): type is SendableSurveyType {
  return (SENDABLE_SURVEY_TYPES as readonly string[]).includes(type);
}

/** Looks a token up for the answer page. Unknown tokens and unsent rows both read as invalid. */
export async function lookupPublicSurvey(
  db: SurveyDb,
  token: string,
  now: Date = new Date()
): Promise<PublicSurveyLookup> {
  const row = await db.feedbackSurvey.findUnique({
    where: { tokenHash: hashSurveyToken(token) },
    select: {
      type: true,
      status: true,
      tokenExpiresAt: true,
      tokenUsedAt: true,
      tenantId: true,
    },
  });
  if (!row || !isSendable(row.type)) return { status: 'invalid' };
  if (row.tokenUsedAt || row.status === 'RESPONDED') return { status: 'used' };
  if (row.status !== 'SENT') return { status: 'invalid' };
  if (!row.tokenExpiresAt || row.tokenExpiresAt.getTime() <= now.getTime()) {
    return { status: 'expired' };
  }
  const tenant = await db.tenant.findUnique({
    where: { id: row.tenantId },
    select: { name: true },
  });
  return { status: 'ok', surveyType: row.type, companyName: tenant?.name ?? 'this company' };
}

export type SubmitSurveyResult =
  | { status: 'ok' }
  | { status: 'invalid' | 'expired' | 'used' | 'bad_score' };

/** Control characters other than newline and tab never reach the database or the staff screen. */
export function cleanComment(raw: string | undefined): string | null {
  if (!raw) return null;
  const cleaned = Array.from(raw)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
    })
    .join('')
    .trim();
  return cleaned ? cleaned.slice(0, COMMENT_MAX_LENGTH) : null;
}

/**
 * Stores the answer and uses the token up in one conditional update, so two simultaneous submits of
 * one link cannot both win. Tenant, contact and account come from the stored row.
 */
export async function submitPublicSurvey(
  db: SurveyDb,
  input: { token: string; score: number; comment?: string },
  now: Date = new Date()
): Promise<SubmitSurveyResult> {
  const tokenHash = hashSurveyToken(input.token);
  const row = await db.feedbackSurvey.findUnique({
    where: { tokenHash },
    select: { id: true, tenantId: true, type: true, status: true, tokenExpiresAt: true },
  });
  if (!row || !isSendable(row.type)) return { status: 'invalid' };
  if (row.status === 'RESPONDED') return { status: 'used' };
  if (row.status !== 'SENT') return { status: 'invalid' };
  if (!row.tokenExpiresAt || row.tokenExpiresAt.getTime() <= now.getTime()) {
    return { status: 'expired' };
  }
  if (!isValidSurveyScore(row.type, input.score)) return { status: 'bad_score' };

  const updated = await db.feedbackSurvey.updateMany({
    where: {
      id: row.id,
      tenantId: row.tenantId,
      tokenHash,
      tokenUsedAt: null,
      status: 'SENT',
      tokenExpiresAt: { gt: now },
    },
    data: {
      score: input.score,
      comment: cleanComment(input.comment),
      sentiment: sentimentForScore(row.type as SurveyType, input.score),
      status: 'RESPONDED',
      respondedAt: now,
      tokenUsedAt: now,
    },
  });
  return updated.count === 1 ? { status: 'ok' } : { status: 'used' };
}
