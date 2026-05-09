/**
 * PG-185 Cat-2 follow-through: Ticket AI automation job.
 *
 * Consolidates the five previously-dead AI toggles on TicketAutomationSetting
 * into a single BullMQ job router:
 *   - aiDuplicateDetection     → duplicate-ticket similarity check
 *   - aiAutoCategorization     → LLM-assisted category inference
 *   - aiSentimentAnalysis      → delegate to existing sentiment.chain.ts
 *   - aiNextStepRecommendation → next-best-action on a ticket
 *
 * Each branch reads `TicketAutomationSetting.<flag>`. If the flag is false,
 * returns `{ skipped: true, reason }` without invoking the LLM.
 *
 * Queue: intelliflow-ticket-ai-automation
 */

import { Job } from 'bullmq';
import { PrismaClient } from '@intelliflow/db';
import { z } from 'zod';

export const TICKET_AI_AUTOMATION_QUEUE = 'intelliflow-ticket-ai-automation';

export const TicketAiAutomationJobDataSchema = z.object({
  tenantId: z.string().min(1),
  ticketId: z.string().min(1),
  operation: z.enum([
    'duplicate-detection',
    'auto-categorization',
    'sentiment-analysis',
    'next-step-recommendation',
  ]),
  triggeredBy: z.string().optional(),
});

export type TicketAiAutomationJobData = z.infer<typeof TicketAiAutomationJobDataSchema>;

export interface TicketAiAutomationJobResult {
  ticketId: string;
  operation: string;
  skipped: boolean;
  reason?: string;
  result?: unknown;
  elapsedMs: number;
  completedAt: string;
}

export interface TicketAiChainBundle {
  detectDuplicates?: (ticket: unknown) => Promise<unknown>;
  categorize?: (ticket: unknown) => Promise<unknown>;
  analyzeSentiment?: (ticket: unknown) => Promise<unknown>;
  recommendNextStep?: (ticket: unknown) => Promise<unknown>;
}

export async function processTicketAiAutomationJob(
  job: Job<TicketAiAutomationJobData>,
  prisma: PrismaClient,
  chains: TicketAiChainBundle
): Promise<TicketAiAutomationJobResult> {
  const start = Date.now();
  const data = TicketAiAutomationJobDataSchema.parse(job.data);

  const row = await (
    prisma as unknown as {
      ticketAutomationSetting: {
        findUnique(args: { where: { tenantId: string } }): Promise<{
          aiDuplicateDetection: boolean;
          aiAutoCategorization: boolean;
          aiSentimentAnalysis: boolean;
          aiNextStepRecommendation: boolean;
        } | null>;
      };
    }
  ).ticketAutomationSetting.findUnique({ where: { tenantId: data.tenantId } });

  const flags = {
    aiDuplicateDetection: row?.aiDuplicateDetection ?? false,
    aiAutoCategorization: row?.aiAutoCategorization ?? false,
    aiSentimentAnalysis: row?.aiSentimentAnalysis ?? false,
    aiNextStepRecommendation: row?.aiNextStepRecommendation ?? false,
  };

  const makeSkip = (reason: string): TicketAiAutomationJobResult => ({
    ticketId: data.ticketId,
    operation: data.operation,
    skipped: true,
    reason,
    elapsedMs: Date.now() - start,
    completedAt: new Date().toISOString(),
  });

  const makeOk = (result: unknown): TicketAiAutomationJobResult => ({
    ticketId: data.ticketId,
    operation: data.operation,
    skipped: false,
    result,
    elapsedMs: Date.now() - start,
    completedAt: new Date().toISOString(),
  });

  const ticket = await (
    prisma as unknown as {
      ticket: {
        findFirst(args: { where: { id: string; tenantId: string } }): Promise<unknown | null>;
      };
    }
  ).ticket.findFirst({ where: { id: data.ticketId, tenantId: data.tenantId } });

  if (!ticket) return makeSkip('ticket-not-found');

  return dispatchTicketOperation(data.operation, ticket, flags, chains, makeSkip, makeOk);
}

type TicketOperationSpec = {
  flagKey: keyof typeof _ticketFlagPlaceholder;
  flagLabel: string;
  chainKey: keyof TicketAiChainBundle;
};

// Phantom type helper — never instantiated, used only for keyof inference.
declare const _ticketFlagPlaceholder: {
  aiDuplicateDetection: boolean;
  aiAutoCategorization: boolean;
  aiSentimentAnalysis: boolean;
  aiNextStepRecommendation: boolean;
};

const TICKET_OPERATION_MAP: Record<TicketAiAutomationJobData['operation'], TicketOperationSpec> = {
  'duplicate-detection': {
    flagKey: 'aiDuplicateDetection',
    flagLabel: 'aiDuplicateDetection=false',
    chainKey: 'detectDuplicates',
  },
  'auto-categorization': {
    flagKey: 'aiAutoCategorization',
    flagLabel: 'aiAutoCategorization=false',
    chainKey: 'categorize',
  },
  'sentiment-analysis': {
    flagKey: 'aiSentimentAnalysis',
    flagLabel: 'aiSentimentAnalysis=false',
    chainKey: 'analyzeSentiment',
  },
  'next-step-recommendation': {
    flagKey: 'aiNextStepRecommendation',
    flagLabel: 'aiNextStepRecommendation=false',
    chainKey: 'recommendNextStep',
  },
};

/** Route a single ticket operation through its flag-check → chain-call pipeline. */
async function dispatchTicketOperation(
  operation: TicketAiAutomationJobData['operation'],
  ticket: unknown,
  flags: Record<string, boolean>,
  chains: TicketAiChainBundle,
  makeSkip: (reason: string) => TicketAiAutomationJobResult,
  makeOk: (result: unknown) => TicketAiAutomationJobResult
): Promise<TicketAiAutomationJobResult> {
  const spec = TICKET_OPERATION_MAP[operation];
  if (!spec) return makeSkip('unknown-operation');
  if (!flags[spec.flagKey]) return makeSkip(spec.flagLabel);
  const handler = chains[spec.chainKey];
  if (!handler) return makeSkip('chain-not-wired');
  return makeOk(await handler(ticket));
}
