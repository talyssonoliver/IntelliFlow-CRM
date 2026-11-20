/**
 * moveStage helpers (MVP-012 #31): routes a stage move to the right use case and
 * writes the move to the deal's activity feed (ActivityEvent, read by opportunity.getHistory).
 */

import { TRPCError } from '@trpc/server';
import type { MoveStageInput } from '@intelliflow/validators/opportunity';
import type { PrismaClient } from '@intelliflow/db';
import type { Context } from '../../context';

export async function executeMoveStage(
  ctx: Context,
  input: Pick<MoveStageInput, 'id' | 'targetStage' | 'reason'>,
  userId: string,
  tenantId: string
) {
  if (input.targetStage === 'CLOSED_WON') {
    // IFC-065: Route through CloseDealWonUseCase for enriched event + notification
    const closeDealWonService = ctx.services?.closeDealWon;
    if (!closeDealWonService) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'CloseDealWon service not available',
      });
    }
    return closeDealWonService.execute({
      opportunityId: input.id,
      closedBy: userId,
      tenantId,
    });
  }

  if (input.targetStage === 'CLOSED_LOST') {
    // IFC-066: Route through CloseDealLostUseCase for enriched event + notification
    const closeDealLostService = ctx.services?.closeDealLost;
    if (!closeDealLostService) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'CloseDealLost service not available',
      });
    }
    return closeDealLostService.execute({
      opportunityId: input.id,
      reason: input.reason || '',
      closedBy: userId,
      tenantId,
    });
  }

  const opportunityService = ctx.services?.opportunity;
  if (!opportunityService) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Opportunity service not available',
    });
  }
  return opportunityService.changeStage(input.id, input.targetStage, userId, tenantId);
}

type StageChangeEventDb = Pick<PrismaClient, 'activityEvent'>;

export interface StageChangeEventInput {
  opportunityId: string;
  tenantId: string;
  userId: string;
  fromStage: string | undefined;
  toStage: string;
}

/**
 * Write one STAGE_CHANGE row (from, to, who, when) to the deal's activity feed.
 * Never throws: a feed write failure must not undo a stage move that already happened.
 * A move to the same stage is not a change and is not logged.
 */
export async function recordStageChangeActivity(
  db: StageChangeEventDb,
  input: StageChangeEventInput
): Promise<void> {
  if (input.fromStage === input.toStage) return;
  try {
    await db.activityEvent.create({
      data: {
        type: 'STAGE_CHANGE',
        title: input.fromStage
          ? `Stage changed from ${input.fromStage} to ${input.toStage}`
          : `Stage changed to ${input.toStage}`,
        timestamp: new Date(),
        stageFrom: input.fromStage ?? null,
        stageTo: input.toStage,
        opportunityId: input.opportunityId,
        userId: input.userId,
        tenantId: input.tenantId,
      },
    });
  } catch (err) {
    console.error('[opportunity.router] Stage change activity failed:', err);
  }
}
