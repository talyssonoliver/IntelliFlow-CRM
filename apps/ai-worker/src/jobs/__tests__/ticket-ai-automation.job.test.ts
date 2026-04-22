import { describe, it, expect, vi } from 'vitest';
import {
  TicketAiAutomationJobDataSchema,
  processTicketAiAutomationJob,
  type TicketAiAutomationJobData,
} from '../ticket-ai-automation.job';
import type { Job } from 'bullmq';

const TENANT = 'tenant-A';
const TICKET_ID = 'tkt-1';

function buildPrisma(flags: Record<string, boolean>): any {
  return {
    ticketAutomationSetting: {
      findUnique: async () => flags,
    },
    ticket: {
      findFirst: async () => ({ id: TICKET_ID, tenantId: TENANT }),
    },
  };
}

function job(data: TicketAiAutomationJobData): Job<TicketAiAutomationJobData> {
  return { id: '1', data } as unknown as Job<TicketAiAutomationJobData>;
}

describe('TicketAiAutomationJobDataSchema', () => {
  it('accepts 4 enum operations', () => {
    for (const op of [
      'duplicate-detection',
      'auto-categorization',
      'sentiment-analysis',
      'next-step-recommendation',
    ] as const) {
      const parsed = TicketAiAutomationJobDataSchema.parse({
        tenantId: TENANT,
        ticketId: TICKET_ID,
        operation: op,
      });
      expect(parsed.operation).toBe(op);
    }
  });
});

describe('processTicketAiAutomationJob — flag gating', () => {
  it('skips sentiment-analysis when aiSentimentAnalysis=false', async () => {
    const result = await processTicketAiAutomationJob(
      job({ tenantId: TENANT, ticketId: TICKET_ID, operation: 'sentiment-analysis' }),
      buildPrisma({
        aiDuplicateDetection: false,
        aiAutoCategorization: false,
        aiSentimentAnalysis: false,
        aiNextStepRecommendation: false,
      }),
      {},
    );
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('aiSentimentAnalysis=false');
  });

  it('invokes categorize chain when aiAutoCategorization=true', async () => {
    const categorize = vi.fn(async () => ({ category: 'BILLING' }));
    const result = await processTicketAiAutomationJob(
      job({ tenantId: TENANT, ticketId: TICKET_ID, operation: 'auto-categorization' }),
      buildPrisma({
        aiDuplicateDetection: false,
        aiAutoCategorization: true,
        aiSentimentAnalysis: false,
        aiNextStepRecommendation: false,
      }),
      { categorize },
    );
    expect(result.skipped).toBe(false);
    expect(categorize).toHaveBeenCalled();
    expect(result.result).toEqual({ category: 'BILLING' });
  });

  it('skips when ticket missing', async () => {
    const prisma: any = buildPrisma({
      aiDuplicateDetection: true,
      aiAutoCategorization: false,
      aiSentimentAnalysis: false,
      aiNextStepRecommendation: false,
    });
    prisma.ticket.findFirst = async () => null;
    const result = await processTicketAiAutomationJob(
      job({ tenantId: TENANT, ticketId: 'missing', operation: 'duplicate-detection' }),
      prisma,
      { detectDuplicates: vi.fn() },
    );
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('ticket-not-found');
  });

  it('skips next-step when chain not wired', async () => {
    const result = await processTicketAiAutomationJob(
      job({ tenantId: TENANT, ticketId: TICKET_ID, operation: 'next-step-recommendation' }),
      buildPrisma({
        aiDuplicateDetection: false,
        aiAutoCategorization: false,
        aiSentimentAnalysis: false,
        aiNextStepRecommendation: true,
      }),
      {},
    );
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('chain-not-wired');
  });
});
