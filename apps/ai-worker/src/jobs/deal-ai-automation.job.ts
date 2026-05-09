/**
 * PG-184 Cat-2 follow-through: Deal AI automation job.
 *
 * Consolidates the four previously-dead AI toggles on
 * DealAutomationSetting into a single BullMQ job router:
 *   - aiDuplicateDetection    → duplicate-candidate similarity check
 *   - aiDealScoring           → win-probability scoring
 *   - aiNextStepRecommendation → next-best-action recommendation
 *   - aiWinLossPrediction     → win/loss outcome prediction
 *
 * Each branch reads `DealAutomationSetting.<flag>` for the tenant. If the
 * flag is false, the job returns `{ skipped: true, reason }` without
 * invoking any LLM. Every branch is gated — no flag = no AI call.
 *
 * Queue: intelliflow-deal-ai-automation
 */

import { Job } from 'bullmq';
import { PrismaClient } from '@intelliflow/db';
import { z } from 'zod';

export const DEAL_AI_AUTOMATION_QUEUE = 'intelliflow-deal-ai-automation';

export const DealAiAutomationJobDataSchema = z.object({
  tenantId: z.string().min(1),
  dealId: z.string().min(1),
  operation: z.enum([
    'duplicate-detection',
    'scoring',
    'next-step-recommendation',
    'win-loss-prediction',
  ]),
  triggeredBy: z.string().optional(),
});

export type DealAiAutomationJobData = z.infer<typeof DealAiAutomationJobDataSchema>;

export interface DealAiAutomationJobResult {
  dealId: string;
  operation: string;
  skipped: boolean;
  reason?: string;
  result?: unknown;
  elapsedMs: number;
  completedAt: string;
}

export interface DealAiChainBundle {
  detectDuplicates?: (deal: unknown) => Promise<unknown>;
  scoreDeal?: (deal: unknown) => Promise<unknown>;
  recommendNextStep?: (deal: unknown) => Promise<unknown>;
  predictWinLoss?: (deal: unknown) => Promise<unknown>;
}

export async function processDealAiAutomationJob(
  job: Job<DealAiAutomationJobData>,
  prisma: PrismaClient,
  chains: DealAiChainBundle
): Promise<DealAiAutomationJobResult> {
  const start = Date.now();
  const data = DealAiAutomationJobDataSchema.parse(job.data);

  const row = await (
    prisma as unknown as {
      dealAutomationSetting: {
        findUnique(args: { where: { tenantId: string } }): Promise<{
          aiDuplicateDetection: boolean;
          aiDealScoring: boolean;
          aiNextStepRecommendation: boolean;
          aiWinLossPrediction: boolean;
        } | null>;
      };
    }
  ).dealAutomationSetting.findUnique({ where: { tenantId: data.tenantId } });

  const flags = {
    aiDuplicateDetection: row?.aiDuplicateDetection ?? false,
    aiDealScoring: row?.aiDealScoring ?? false,
    aiNextStepRecommendation: row?.aiNextStepRecommendation ?? false,
    aiWinLossPrediction: row?.aiWinLossPrediction ?? false,
  };

  const makeSkip = (reason: string): DealAiAutomationJobResult => ({
    dealId: data.dealId,
    operation: data.operation,
    skipped: true,
    reason,
    elapsedMs: Date.now() - start,
    completedAt: new Date().toISOString(),
  });

  const makeOk = (result: unknown): DealAiAutomationJobResult => ({
    dealId: data.dealId,
    operation: data.operation,
    skipped: false,
    result,
    elapsedMs: Date.now() - start,
    completedAt: new Date().toISOString(),
  });

  const deal = await (
    prisma as unknown as {
      opportunity: {
        findFirst(args: { where: { id: string; tenantId: string } }): Promise<unknown | null>;
      };
    }
  ).opportunity.findFirst({ where: { id: data.dealId, tenantId: data.tenantId } });

  if (!deal) return makeSkip('deal-not-found');

  return dispatchDealOperation(data.operation, deal, flags, chains, makeSkip, makeOk);
}

type DealOperationSpec = {
  flagKey: keyof typeof _dealFlagPlaceholder;
  flagLabel: string;
  chainKey: keyof DealAiChainBundle;
};

// Phantom type helper — never instantiated, used only for keyof inference.
declare const _dealFlagPlaceholder: {
  aiDuplicateDetection: boolean;
  aiDealScoring: boolean;
  aiNextStepRecommendation: boolean;
  aiWinLossPrediction: boolean;
};

const DEAL_OPERATION_MAP: Record<DealAiAutomationJobData['operation'], DealOperationSpec> = {
  'duplicate-detection': {
    flagKey: 'aiDuplicateDetection',
    flagLabel: 'aiDuplicateDetection=false',
    chainKey: 'detectDuplicates',
  },
  scoring: {
    flagKey: 'aiDealScoring',
    flagLabel: 'aiDealScoring=false',
    chainKey: 'scoreDeal',
  },
  'next-step-recommendation': {
    flagKey: 'aiNextStepRecommendation',
    flagLabel: 'aiNextStepRecommendation=false',
    chainKey: 'recommendNextStep',
  },
  'win-loss-prediction': {
    flagKey: 'aiWinLossPrediction',
    flagLabel: 'aiWinLossPrediction=false',
    chainKey: 'predictWinLoss',
  },
};

/** Route a single deal operation through its flag-check → chain-call pipeline. */
async function dispatchDealOperation(
  operation: DealAiAutomationJobData['operation'],
  deal: unknown,
  flags: Record<string, boolean>,
  chains: DealAiChainBundle,
  makeSkip: (reason: string) => DealAiAutomationJobResult,
  makeOk: (result: unknown) => DealAiAutomationJobResult
): Promise<DealAiAutomationJobResult> {
  const spec = DEAL_OPERATION_MAP[operation];
  if (!spec) return makeSkip('unknown-operation');
  if (!flags[spec.flagKey]) return makeSkip(spec.flagLabel);
  const handler = chains[spec.chainKey];
  if (!handler) return makeSkip('chain-not-wired');
  return makeOk(await handler(deal));
}
