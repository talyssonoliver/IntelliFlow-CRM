/**
 * What a stage move leaves behind (#31, #32): an entry on the deal's activity feed (who moved it,
 * from where to where, when) and the audit log row. Before this the move was only audited, so a
 * deal that had just moved still read "No recent activity".
 *
 * The activity entry is written after the move succeeded and must not undo it: a failure to write
 * it is logged, never thrown, the same as the audit log.
 */
import type { Context } from '../../context';
import { getAuditLogger } from '../../security/audit-logger';

/** 'NEEDS_ANALYSIS' to 'Needs Analysis'. */
export function stageLabel(stage: string | undefined): string {
  if (!stage) return 'No stage';
  return stage
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** The deal as the service returns it after the move: only what the entry needs. */
export interface MovedDeal {
  id: { value: string };
  name: string;
  stage: string;
}

/** Writes the activity entry and the audit row for one stage move; never throws. */
export async function recordStageMove(
  ctx: Context,
  deal: MovedDeal,
  previousStage: string | undefined,
  targetStage: string,
  tenant: { tenantId: string; userId: string }
): Promise<void> {
  const from = stageLabel(previousStage);
  const to = stageLabel(targetStage);
  try {
    await (ctx.prismaWithTenant ?? ctx.prisma).activityEvent.create({
      data: {
        type: 'STAGE_CHANGE',
        title: `Stage changed: ${from} to ${to}`,
        description: `"${deal.name}" moved from ${from} to ${to}.`,
        stageFrom: previousStage ?? null,
        stageTo: targetStage,
        opportunityId: deal.id.value,
        userId: tenant.userId,
        tenantId: tenant.tenantId,
      },
    });
  } catch (err) {
    console.error('[opportunity.router] Stage activity failed:', err);
  }
  getAuditLogger(ctx.prisma)
    .logAction('UPDATE', 'opportunity', deal.id.value, tenant.tenantId, {
      actorId: tenant.userId,
      metadata: { targetStage, previousStage },
      afterState: { name: deal.name, stage: deal.stage },
    })
    .catch((err: unknown) => console.error('[opportunity.router] Audit log failed:', err));
}
