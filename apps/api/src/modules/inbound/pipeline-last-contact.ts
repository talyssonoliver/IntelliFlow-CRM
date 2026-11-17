/**
 * When the COA sync says a lead was last contacted (MVP-010).
 *
 * The sync walked a lead's status to CONTACTED but never set `lastContactedAt`, so the dashboard's
 * follow-ups card read every synced lead as "Never contacted". This module decides the contact time
 * a sync carries and writes it forward-only.
 */

import type { PrismaClient } from '@intelliflow/db';

/**
 * COA stages that mean the lead has replied (COA `CrmStage`: RESPONDED is "Replied";
 * MEETING_BOOKED and WON come only after it). Not a reply: COA's own QUALIFIED (a pre-contact
 * audit verdict) and PROPOSAL_READY, which COA can also reach before any contact
 * (AUDITED / QUALIFIED / CONTACT_FOUND -> PROPOSAL_READY when assets are generated).
 */
export const COA_REPLY_STAGES: ReadonlySet<string> = new Set([
  'RESPONDED',
  'MEETING_BOOKED',
  'WON',
]);

export function isCoaReplyStage(coaStage: string): boolean {
  return COA_REPLY_STAGES.has(coaStage.trim().toUpperCase());
}

/** What the sync needs from COA's payload to date a contact. */
export interface PipelineContactInput {
  readonly coaLeadId: string;
  readonly coaStage: string;
  readonly status: string;
  readonly stageChangedAt: string;
  /** COA's own last outbound send or reply, when it sends one. */
  readonly lastContactedAt?: string | undefined;
}

/** A contact time later than this is a clock or data error, never a contact. */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

function usableTime(value: string | undefined, now: Date): Date | null {
  if (!value) return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  return at.getTime() > now.getTime() + FUTURE_TOLERANCE_MS ? null : at;
}

/**
 * The time to record as the lead's last contact, or null when the sync says nothing about one.
 *
 * - COA's own `lastContactedAt` (its latest send or reply) is used when it sends one.
 * - Otherwise `stageChangedAt` is used only when the stage itself is a contact: CONTACTED (the
 *   move into it is the first send) or a reply stage (the reply). For any other stage, such as
 *   PROPOSAL_READY, `stageChangedAt` is when something else happened, so it is not a contact.
 * - A lost lead says nothing: COA loses leads without contacting them.
 * - A time in the future is ignored: the write is forward-only, so a bad one would stick.
 */
export function lastContactTime(input: PipelineContactInput, now: Date = new Date()): Date | null {
  const sent = usableTime(input.lastContactedAt, now);
  if (sent) return sent;
  if (input.status === 'LOST') return null;
  const stage = input.coaStage.trim().toUpperCase();
  if (stage !== 'CONTACTED' && !isCoaReplyStage(stage)) return null;
  return usableTime(input.stageChangedAt, now);
}

/**
 * Record the lead's last contact, tenant-scoped and forward-only: it fills a NULL and replaces an
 * older time, and never moves a later one back (a call or email logged by hand since is kept).
 * Best effort, like the tags: a failure is logged and the sync goes on. Every sync of the lead
 * tries again, because it runs before the repeat check, so a backfill is a re-sync.
 */
export async function applyLastContact(
  prisma: Pick<PrismaClient, 'lead'>,
  input: PipelineContactInput,
  leadId: string,
  tenantId: string,
  now: Date = new Date()
): Promise<void> {
  const at = lastContactTime(input, now);
  if (!at) return;
  try {
    await prisma.lead.updateMany({
      where: {
        id: leadId,
        tenantId,
        OR: [{ lastContactedAt: null }, { lastContactedAt: { lt: at } }],
      },
      data: { lastContactedAt: at },
    });
  } catch (err) {
    console.error('[inbound.syncPipelineLead] last contact write failed:', {
      leadId,
      coaLeadId: input.coaLeadId,
      error: err instanceof Error ? err.message : err,
    });
  }
}
