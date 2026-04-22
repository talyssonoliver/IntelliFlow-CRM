import { describe, it, expect, vi } from 'vitest';
import {
  DealAiAutomationJobDataSchema,
  processDealAiAutomationJob,
  type DealAiAutomationJobData,
} from '../deal-ai-automation.job';
import type { Job } from 'bullmq';

const TENANT = 'tenant-A';
const DEAL_ID = 'deal-1';

function buildPrisma(flags: Record<string, boolean>): any {
  return {
    dealAutomationSetting: {
      findUnique: async () => flags,
    },
    opportunity: {
      findFirst: async () => ({ id: DEAL_ID, tenantId: TENANT, name: 'Deal' }),
    },
  };
}

function job(data: DealAiAutomationJobData): Job<DealAiAutomationJobData> {
  return { id: '1', data } as unknown as Job<DealAiAutomationJobData>;
}

describe('DealAiAutomationJobDataSchema', () => {
  it('accepts valid operations', () => {
    const ok = DealAiAutomationJobDataSchema.parse({
      tenantId: TENANT,
      dealId: DEAL_ID,
      operation: 'scoring',
    });
    expect(ok.operation).toBe('scoring');
  });

  it('rejects unknown operation', () => {
    expect(() =>
      DealAiAutomationJobDataSchema.parse({
        tenantId: TENANT,
        dealId: DEAL_ID,
        operation: 'nope',
      }),
    ).toThrow();
  });
});

describe('processDealAiAutomationJob — flag gating', () => {
  it('skips duplicate-detection when aiDuplicateDetection=false', async () => {
    const result = await processDealAiAutomationJob(
      job({ tenantId: TENANT, dealId: DEAL_ID, operation: 'duplicate-detection' }),
      buildPrisma({
        aiDuplicateDetection: false,
        aiDealScoring: false,
        aiNextStepRecommendation: false,
        aiWinLossPrediction: false,
      }),
      {},
    );
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('aiDuplicateDetection=false');
  });

  it('invokes chain when aiDealScoring=true and chain wired', async () => {
    const scoreDeal = vi.fn(async () => ({ score: 0.85 }));
    const result = await processDealAiAutomationJob(
      job({ tenantId: TENANT, dealId: DEAL_ID, operation: 'scoring' }),
      buildPrisma({
        aiDuplicateDetection: false,
        aiDealScoring: true,
        aiNextStepRecommendation: false,
        aiWinLossPrediction: false,
      }),
      { scoreDeal },
    );
    expect(result.skipped).toBe(false);
    expect(scoreDeal).toHaveBeenCalled();
    expect(result.result).toEqual({ score: 0.85 });
  });

  it('skips when flag true but chain not wired', async () => {
    const result = await processDealAiAutomationJob(
      job({ tenantId: TENANT, dealId: DEAL_ID, operation: 'win-loss-prediction' }),
      buildPrisma({
        aiDuplicateDetection: false,
        aiDealScoring: false,
        aiNextStepRecommendation: false,
        aiWinLossPrediction: true,
      }),
      {},
    );
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('chain-not-wired');
  });

  it('skips when deal does not exist', async () => {
    const prisma: any = buildPrisma({
      aiDuplicateDetection: true,
      aiDealScoring: false,
      aiNextStepRecommendation: false,
      aiWinLossPrediction: false,
    });
    prisma.opportunity.findFirst = async () => null;
    const result = await processDealAiAutomationJob(
      job({ tenantId: TENANT, dealId: 'missing', operation: 'duplicate-detection' }),
      prisma,
      { detectDuplicates: vi.fn() },
    );
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('deal-not-found');
  });

  it('defaults all flags to false when setting row absent', async () => {
    const prisma: any = {
      dealAutomationSetting: { findUnique: async () => null },
      opportunity: { findFirst: async () => ({ id: DEAL_ID, tenantId: TENANT }) },
    };
    const result = await processDealAiAutomationJob(
      job({ tenantId: TENANT, dealId: DEAL_ID, operation: 'next-step-recommendation' }),
      prisma,
      { recommendNextStep: vi.fn() },
    );
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('aiNextStepRecommendation=false');
  });
});
