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
  chains: TicketAiChainBundle,
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

  switch (data.operation) {
    case 'duplicate-detection':
      if (!flags.aiDuplicateDetection) return makeSkip('aiDuplicateDetection=false');
      if (!chains.detectDuplicates) return makeSkip('chain-not-wired');
      return makeOk(await chains.detectDuplicates(ticket));
    case 'auto-categorization':
      if (!flags.aiAutoCategorization) return makeSkip('aiAutoCategorization=false');
      if (!chains.categorize) return makeSkip('chain-not-wired');
      return makeOk(await chains.categorize(ticket));
    case 'sentiment-analysis':
      if (!flags.aiSentimentAnalysis) return makeSkip('aiSentimentAnalysis=false');
      if (!chains.analyzeSentiment) return makeSkip('chain-not-wired');
      return makeOk(await chains.analyzeSentiment(ticket));
    case 'next-step-recommendation':
      if (!flags.aiNextStepRecommendation) return makeSkip('aiNextStepRecommendation=false');
      if (!chains.recommendNextStep) return makeSkip('chain-not-wired');
      return makeOk(await chains.recommendNextStep(ticket));
    default:
      return makeSkip('unknown-operation');
  }
}
