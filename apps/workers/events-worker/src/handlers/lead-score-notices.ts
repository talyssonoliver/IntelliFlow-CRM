/**
 * AI lead-score notices ("Hot lead detected", "Lead warming up").
 *
 * Off by default (owner, MVP-005): they fired on every rescore and buried the notifications that
 * need action. A user who turns "Lead Scored" on in the notification settings gets them again.
 * The score itself is still recorded on the lead's activity by the caller.
 */
import { isNotificationTypeEnabled } from '@intelliflow/validators';

interface ScoreNoticeDb {
  notificationPreference: {
    findUnique(args: {
      where: { tenantId_userId: { tenantId: string; userId: string } };
      select: { categoryPreferences: true };
    }): Promise<{ categoryPreferences: unknown } | null>;
  };
  notification: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
}

export interface LeadScoreNoticeInput {
  leadId: string;
  score: number;
  previousScore: number | undefined;
  tenantId: string;
  userId: string;
}

/** Creates the score notices the user has turned on; returns how many were created. */
export async function sendLeadScoreNotices(
  db: ScoreNoticeDb,
  { leadId, score, previousScore, tenantId, userId }: LeadScoreNoticeInput
): Promise<number> {
  const hot = score >= 80;
  const warming = score >= 50 && (previousScore === undefined || previousScore < 50);
  if (!hot && !warming) return 0;

  const pref = await db.notificationPreference.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: { categoryPreferences: true },
  });
  if (!isNotificationTypeEnabled(pref?.categoryPreferences, 'lead_scored')) return 0;

  const base = {
    tenantId,
    recipientId: userId,
    channel: 'IN_APP',
    status: 'PENDING',
    category: 'ALERTS',
    sourceId: leadId,
    metadata: {
      notificationType: 'lead_scored',
      score,
      previousScore,
      actionUrl: `/leads/${leadId}`,
    },
  };
  let created = 0;
  if (hot) {
    await db.notification.create({
      data: {
        ...base,
        subject: `Hot lead detected: score ${score}`,
        body: `Lead ${leadId} scored ${score}/100 — prioritize for immediate outreach.`,
        priority: 'HIGH',
        sourceType: 'lead_scored',
      },
    });
    created++;
  }
  if (warming) {
    await db.notification.create({
      data: {
        ...base,
        subject: `Lead warming up: score ${score}`,
        body: `Lead ${leadId} crossed the engagement threshold (${previousScore ?? 0} → ${score}). Consider adding to active pipeline.`,
        priority: 'NORMAL',
        sourceType: 'ai_recommendation',
      },
    });
    created++;
  }
  return created;
}
