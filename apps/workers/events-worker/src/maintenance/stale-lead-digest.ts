/**
 * Stale-lead follow-ups as ONE daily line per owner (owner, MVP-005).
 *
 * The job used to write a "Stale lead: <name>" notification per lead, so the same names piled up
 * ("Stale lead: Jane Sample" five times). Now each owner gets a single "N leads need a
 * follow-up" notification per day, linking to the leads list's Needs Follow-up view. When the
 * job runs again that day it updates the same notification instead of adding another.
 */

export const STALE_DIGEST_SOURCE = 'stale_leads_digest';
const FOLLOW_UP_URL = '/leads?segment=followup';

export interface StaleLeadRow {
  id: string;
  ownerId: string | null;
  tenantId: string;
}

interface DigestDb {
  notification: {
    findFirst(args: {
      where: {
        tenantId: string;
        recipientId: string;
        sourceType: string;
        createdAt: { gte: Date };
      };
      select: { id: true };
    }): Promise<{ id: string } | null>;
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
}

export interface OwnerDigest {
  tenantId: string;
  ownerId: string;
  leadIds: string[];
}

/** Stale leads grouped per owner (leads with no owner have nobody to remind). */
export function groupStaleLeadsByOwner(leads: readonly StaleLeadRow[]): OwnerDigest[] {
  const byOwner = new Map<string, OwnerDigest>();
  for (const lead of leads) {
    if (!lead.ownerId) continue;
    const key = `${lead.tenantId}:${lead.ownerId}`;
    const digest = byOwner.get(key) ?? {
      tenantId: lead.tenantId,
      ownerId: lead.ownerId,
      leadIds: [],
    };
    digest.leadIds.push(lead.id);
    byOwner.set(key, digest);
  }
  return [...byOwner.values()];
}

/** "1 lead needs a follow-up" / "4 leads need a follow-up". */
export function digestSubject(count: number): string {
  return count === 1 ? '1 lead needs a follow-up' : `${count} leads need a follow-up`;
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Write each owner's daily line: update today's if it exists, otherwise create it.
 * Returns how many digests were written.
 */
export async function writeStaleLeadDigests(
  db: DigestDb,
  leads: readonly StaleLeadRow[],
  staleDays: number,
  now: Date
): Promise<number> {
  const digests = groupStaleLeadsByOwner(leads);
  for (const { tenantId, ownerId, leadIds } of digests) {
    const content = {
      subject: digestSubject(leadIds.length),
      body: `No activity for ${staleDays}+ days. Open the list to follow up.`,
      metadata: {
        notificationType: 'follow_up_reminder',
        leadCount: leadIds.length,
        leadIds,
        actionUrl: FOLLOW_UP_URL,
      },
    };
    const today = await db.notification.findFirst({
      where: {
        tenantId,
        recipientId: ownerId,
        sourceType: STALE_DIGEST_SOURCE,
        createdAt: { gte: startOfUtcDay(now) },
      },
      select: { id: true },
    });
    if (today) {
      await db.notification.update({ where: { id: today.id }, data: content });
    } else {
      await db.notification.create({
        data: {
          ...content,
          tenantId,
          recipientId: ownerId,
          channel: 'IN_APP',
          priority: 'NORMAL',
          status: 'PENDING',
          category: 'REMINDERS',
          sourceType: STALE_DIGEST_SOURCE,
          sourceId: ownerId,
        },
      });
    }
  }
  return digests.length;
}
