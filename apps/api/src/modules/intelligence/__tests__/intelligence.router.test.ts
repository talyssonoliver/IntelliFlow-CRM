/**
 * Intelligence Router Tests - IFC-095
 *
 * Comprehensive tests for the intelligence tRPC router endpoints.
 * Tests all procedures: getLeadInsights, getContactInsights, getInsightsSummary,
 * triggerPrediction, updateLeadInsights, updateContactInsights.
 *
 * Uses the createCaller pattern with the shared test setup.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { intelligenceRouter } from '../intelligence.router';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';

// Mock BullMQ for triggerPrediction tests
const mockQueueAdd = vi.fn().mockResolvedValue({ id: 'job-123' });
const mockQueueClose = vi.fn().mockResolvedValue(undefined);

vi.mock('bullmq', () => ({
  Queue: class MockQueue {
    add = mockQueueAdd;
    close = mockQueueClose;
  },
}));

// Mock AI insight data
function createMockLeadAIInsight(overrides: Record<string, any> = {}) {
  return {
    id: 'insight-lead-1',
    tenantId: TEST_UUIDS.tenant,
    leadId: TEST_UUIDS.lead1,
    churnRisk: 'MEDIUM',
    conversionProbability: 65,
    estimatedValue: 50000,
    engagementScore: 72,
    sentiment: 'POSITIVE',
    sentimentTrend: 'IMPROVING',
    lastEngagementDays: 3,
    nextBestAction: 'Schedule Demo',
    recommendations: ['Send case study', 'Schedule follow-up call'],
    createdAt: new Date('2025-12-01'),
    updatedAt: new Date('2025-12-15'),
    ...overrides,
  };
}

function createMockContactAIInsight(overrides: Record<string, any> = {}) {
  return {
    id: 'insight-contact-1',
    tenantId: TEST_UUIDS.tenant,
    contactId: TEST_UUIDS.contact1,
    churnRisk: 'LOW',
    conversionProbability: 80,
    lifetimeValue: 120000,
    engagementScore: 85,
    sentiment: 'POSITIVE',
    sentimentTrend: 'STABLE',
    lastEngagementDays: 1,
    nextBestAction: 'Upsell',
    recommendations: ['Propose premium plan', 'Send personalized content'],
    createdAt: new Date('2025-12-01'),
    updatedAt: new Date('2025-12-20'),
    ...overrides,
  };
}

describe('intelligenceRouter', () => {
  let caller: ReturnType<typeof intelligenceRouter.createCaller>;
  let ctx: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createTestContext();
    caller = intelligenceRouter.createCaller(ctx);
  });

  describe('getLeadInsights', () => {
    it('should return AI insights for a lead with valid data', async () => {
      const aiInsight = createMockLeadAIInsight();
      prismaMock.lead.findUnique.mockResolvedValue({
        id: TEST_UUIDS.lead1,
        aiInsights: [aiInsight],
      } as any);

      const result = await caller.getLeadInsights({ leadId: TEST_UUIDS.lead1 });

      expect(result).not.toBeNull();
      expect(result!.entityId).toBe(TEST_UUIDS.lead1);
      expect(result!.entityType).toBe('lead');
      expect(result!.churnRisk).toBe('MEDIUM');
      expect(result!.conversionProbability).toBe(65);
      expect(result!.estimatedValue).toBe(50000);
      expect(result!.engagementScore).toBe(72);
      expect(result!.sentiment).toBe('POSITIVE');
      expect(result!.sentimentTrend).toBe('IMPROVING');
      expect(result!.lastEngagementDays).toBe(3);
      expect(result!.nextBestAction).toBe('Schedule Demo');
      expect(result!.recommendations).toEqual(['Send case study', 'Schedule follow-up call']);
    });

    it('should return null when lead has no AI insight', async () => {
      prismaMock.lead.findUnique.mockResolvedValue({
        id: TEST_UUIDS.lead1,
        aiInsights: [],
      } as any);

      const result = await caller.getLeadInsights({ leadId: TEST_UUIDS.lead1 });

      expect(result).toBeNull();
    });

    it('should throw NOT_FOUND when lead does not exist', async () => {
      prismaMock.lead.findUnique.mockResolvedValue(null);

      await expect(caller.getLeadInsights({ leadId: TEST_UUIDS.nonExistent })).rejects.toThrow(
        TRPCError
      );

      try {
        await caller.getLeadInsights({ leadId: TEST_UUIDS.nonExistent });
      } catch (err) {
        expect((err as TRPCError).code).toBe('NOT_FOUND');
        expect((err as TRPCError).message).toContain('not found');
      }
    });

    it('should include aiInsight in the Prisma query', async () => {
      prismaMock.lead.findUnique.mockResolvedValue({
        id: TEST_UUIDS.lead1,
        aiInsights: [],
      } as any);

      await caller.getLeadInsights({ leadId: TEST_UUIDS.lead1 });

      expect(prismaMock.lead.findUnique).toHaveBeenCalledWith({
        where: { id: TEST_UUIDS.lead1 },
        include: { aiInsights: { take: 1 } },
      });
    });

    it('should return churnRiskScore as null (computed from level)', async () => {
      const aiInsight = createMockLeadAIInsight();
      prismaMock.lead.findUnique.mockResolvedValue({
        id: TEST_UUIDS.lead1,
        aiInsights: [aiInsight],
      } as any);

      const result = await caller.getLeadInsights({ leadId: TEST_UUIDS.lead1 });

      expect(result!.churnRiskScore).toBeNull();
    });

    it('should return lifetimeValue as null for leads', async () => {
      const aiInsight = createMockLeadAIInsight();
      prismaMock.lead.findUnique.mockResolvedValue({
        id: TEST_UUIDS.lead1,
        aiInsights: [aiInsight],
      } as any);

      const result = await caller.getLeadInsights({ leadId: TEST_UUIDS.lead1 });

      expect(result!.lifetimeValue).toBeNull();
    });
  });

  describe('getContactInsights', () => {
    it('should return AI insights for a contact with valid data', async () => {
      const aiInsight = createMockContactAIInsight();
      prismaMock.contact.findUnique.mockResolvedValue({
        id: TEST_UUIDS.contact1,
        aiInsight,
      } as any);

      const result = await caller.getContactInsights({ contactId: TEST_UUIDS.contact1 });

      expect(result).not.toBeNull();
      expect(result!.entityId).toBe(TEST_UUIDS.contact1);
      expect(result!.entityType).toBe('contact');
      expect(result!.churnRisk).toBe('LOW');
      expect(result!.conversionProbability).toBe(80);
      expect(result!.lifetimeValue).toBe(120000);
      expect(result!.engagementScore).toBe(85);
      expect(result!.sentiment).toBe('POSITIVE');
      expect(result!.sentimentTrend).toBe('STABLE');
      expect(result!.nextBestAction).toBe('Upsell');
    });

    it('should return null when contact has no AI insight', async () => {
      prismaMock.contact.findUnique.mockResolvedValue({
        id: TEST_UUIDS.contact1,
        aiInsight: null,
      } as any);

      const result = await caller.getContactInsights({ contactId: TEST_UUIDS.contact1 });

      expect(result).toBeNull();
    });

    it('should throw NOT_FOUND when contact does not exist', async () => {
      prismaMock.contact.findUnique.mockResolvedValue(null);

      await expect(
        caller.getContactInsights({ contactId: TEST_UUIDS.nonExistent })
      ).rejects.toThrow(TRPCError);

      try {
        await caller.getContactInsights({ contactId: TEST_UUIDS.nonExistent });
      } catch (err) {
        expect((err as TRPCError).code).toBe('NOT_FOUND');
      }
    });

    it('should include aiInsight in the Prisma query', async () => {
      prismaMock.contact.findUnique.mockResolvedValue({
        id: TEST_UUIDS.contact1,
        aiInsight: null,
      } as any);

      await caller.getContactInsights({ contactId: TEST_UUIDS.contact1 });

      expect(prismaMock.contact.findUnique).toHaveBeenCalledWith({
        where: { id: TEST_UUIDS.contact1 },
        include: { aiInsight: true },
      });
    });

    it('should return estimatedValue as null for contacts', async () => {
      const aiInsight = createMockContactAIInsight();
      prismaMock.contact.findUnique.mockResolvedValue({
        id: TEST_UUIDS.contact1,
        aiInsight,
      } as any);

      const result = await caller.getContactInsights({ contactId: TEST_UUIDS.contact1 });

      expect(result!.estimatedValue).toBeNull();
    });
  });

  describe('getInsightsSummary', () => {
    it('should return summary for a lead entity', async () => {
      const aiInsight = createMockLeadAIInsight();
      prismaMock.lead.findUnique.mockResolvedValue({
        id: TEST_UUIDS.lead1,
        aiInsights: [aiInsight],
      } as any);

      const result = await caller.getInsightsSummary({
        entityType: 'lead',
        entityId: TEST_UUIDS.lead1,
      });

      expect(result).not.toBeNull();
      expect(result!.churnRisk.level).toBe('MEDIUM');
      expect(result!.churnRisk.score).toBe(50); // MEDIUM maps to 50
      expect(result!.conversionProbability).toBe(65);
      expect(result!.sentiment).toBe('POSITIVE');
      expect(result!.engagementScore).toBe(72);
      expect(result!.recommendations).toEqual(['Send case study', 'Schedule follow-up call']);
      expect(result!.confidence).toBe(0.85);
    });

    it('should return summary for a contact entity', async () => {
      const aiInsight = createMockContactAIInsight();
      prismaMock.contact.findUnique.mockResolvedValue({
        id: TEST_UUIDS.contact1,
        aiInsight,
      } as any);

      const result = await caller.getInsightsSummary({
        entityType: 'contact',
        entityId: TEST_UUIDS.contact1,
      });

      expect(result).not.toBeNull();
      expect(result!.churnRisk.level).toBe('LOW');
      expect(result!.churnRisk.score).toBe(20); // LOW maps to 20
      expect(result!.lifetimeValue).toBe(120000);
    });

    it('should return null when entity has no AI insight', async () => {
      prismaMock.lead.findUnique.mockResolvedValue({
        id: TEST_UUIDS.lead1,
        aiInsights: [],
      } as any);

      const result = await caller.getInsightsSummary({
        entityType: 'lead',
        entityId: TEST_UUIDS.lead1,
      });

      expect(result).toBeNull();
    });

    it('should return null for unsupported entity types', async () => {
      const result = await caller.getInsightsSummary({
        entityType: 'opportunity',
        entityId: TEST_UUIDS.opportunity1,
      });

      // Opportunity and account paths do nothing, aiInsight stays null
      expect(result).toBeNull();
    });

    it('should map HIGH churn risk to score 80', async () => {
      const aiInsight = createMockLeadAIInsight({ churnRisk: 'HIGH' });
      prismaMock.lead.findUnique.mockResolvedValue({
        id: TEST_UUIDS.lead1,
        aiInsights: [aiInsight],
      } as any);

      const result = await caller.getInsightsSummary({
        entityType: 'lead',
        entityId: TEST_UUIDS.lead1,
      });

      expect(result!.churnRisk.score).toBe(80);
    });

    it('should default nextBestAction to WAIT when null', async () => {
      const aiInsight = createMockLeadAIInsight({ nextBestAction: null });
      prismaMock.lead.findUnique.mockResolvedValue({
        id: TEST_UUIDS.lead1,
        aiInsights: [aiInsight],
      } as any);

      const result = await caller.getInsightsSummary({
        entityType: 'lead',
        entityId: TEST_UUIDS.lead1,
      });

      expect(result!.nextBestAction.action).toBe('WAIT');
      expect(result!.nextBestAction.title).toBe('No action recommended');
    });

    it('should include lastAssessedAt in churnRisk', async () => {
      const aiInsight = createMockLeadAIInsight();
      prismaMock.lead.findUnique.mockResolvedValue({
        id: TEST_UUIDS.lead1,
        aiInsights: [aiInsight],
      } as any);

      const result = await caller.getInsightsSummary({
        entityType: 'lead',
        entityId: TEST_UUIDS.lead1,
      });

      expect(result!.churnRisk.lastAssessedAt).toBeDefined();
      expect(typeof result!.churnRisk.lastAssessedAt).toBe('string');
    });

    it('should use lifetimeValue or fall back to estimatedValue', async () => {
      const aiInsight = createMockLeadAIInsight({ estimatedValue: 30000 });
      prismaMock.lead.findUnique.mockResolvedValue({
        id: TEST_UUIDS.lead1,
        aiInsights: [aiInsight],
      } as any);

      const result = await caller.getInsightsSummary({
        entityType: 'lead',
        entityId: TEST_UUIDS.lead1,
      });

      // Lead has no lifetimeValue, should fall back to estimatedValue
      expect(result!.lifetimeValue).toBe(30000);
    });
  });

  describe('triggerPrediction', () => {
    beforeEach(() => {
      mockQueueAdd.mockResolvedValue({ id: 'job-123' });
      mockQueueClose.mockResolvedValue(undefined);
    });

    it('should enqueue a lead prediction and return QUEUED status', async () => {
      prismaMock.lead.findUnique.mockResolvedValue({
        id: TEST_UUIDS.lead1,
      } as any);

      const result = await caller.triggerPrediction({
        entityType: 'lead',
        entityId: TEST_UUIDS.lead1,
        predictionType: 'CHURN_RISK',
      });

      expect(result.status).toBe('QUEUED');
      expect(result.jobId).toBe('job-123');
      expect(result.entityType).toBe('lead');
      expect(result.entityId).toBe(TEST_UUIDS.lead1);
      expect(result.predictionType).toBe('CHURN_RISK');
      expect(result.queuedAt).toBeDefined();
      expect(mockQueueAdd).toHaveBeenCalledWith(
        'predict',
        expect.objectContaining({
          entityType: 'lead',
          entityId: TEST_UUIDS.lead1,
          predictionType: 'CHURN_RISK',
        }),
        expect.any(Object)
      );
      expect(mockQueueClose).toHaveBeenCalled();
    });

    it('should enqueue a contact prediction and return QUEUED status', async () => {
      prismaMock.contact.findUnique.mockResolvedValue({
        id: TEST_UUIDS.contact1,
      } as any);

      const result = await caller.triggerPrediction({
        entityType: 'contact',
        entityId: TEST_UUIDS.contact1,
        predictionType: 'NEXT_BEST_ACTION',
      });

      expect(result.status).toBe('QUEUED');
      expect(result.jobId).toBe('job-123');
      expect(result.entityType).toBe('contact');
      expect(result.predictionType).toBe('NEXT_BEST_ACTION');
    });

    it('should fall back to PENDING when Redis is unavailable', async () => {
      mockQueueAdd.mockRejectedValue(new Error('Connection refused'));

      prismaMock.lead.findUnique.mockResolvedValue({
        id: TEST_UUIDS.lead1,
      } as any);

      const result = await caller.triggerPrediction({
        entityType: 'lead',
        entityId: TEST_UUIDS.lead1,
        predictionType: 'CHURN_RISK',
      });

      expect(result.status).toBe('PENDING');
      expect(result.entityType).toBe('lead');
      expect(result.queuedAt).toBeDefined();
    });

    it('should throw NOT_FOUND when lead does not exist', async () => {
      prismaMock.lead.findUnique.mockResolvedValue(null);

      await expect(
        caller.triggerPrediction({
          entityType: 'lead',
          entityId: TEST_UUIDS.nonExistent,
          predictionType: 'CHURN_RISK',
        })
      ).rejects.toThrow(TRPCError);

      try {
        await caller.triggerPrediction({
          entityType: 'lead',
          entityId: TEST_UUIDS.nonExistent,
          predictionType: 'CHURN_RISK',
        });
      } catch (err) {
        expect((err as TRPCError).code).toBe('NOT_FOUND');
      }
    });

    it('should throw NOT_FOUND when contact does not exist', async () => {
      prismaMock.contact.findUnique.mockResolvedValue(null);

      await expect(
        caller.triggerPrediction({
          entityType: 'contact',
          entityId: TEST_UUIDS.nonExistent,
          predictionType: 'QUALIFICATION',
        })
      ).rejects.toThrow(TRPCError);
    });

    it('should accept priority parameter and map to numeric priority', async () => {
      prismaMock.lead.findUnique.mockResolvedValue({
        id: TEST_UUIDS.lead1,
      } as any);

      const result = await caller.triggerPrediction({
        entityType: 'lead',
        entityId: TEST_UUIDS.lead1,
        predictionType: 'CHURN_RISK',
        priority: 'HIGH',
      });

      expect(result.status).toBe('QUEUED');
      expect(mockQueueAdd).toHaveBeenCalledWith(
        'predict',
        expect.objectContaining({ priority: 1 }),
        expect.objectContaining({ priority: 1 })
      );
    });

    it('should default priority to NORMAL', async () => {
      prismaMock.lead.findUnique.mockResolvedValue({
        id: TEST_UUIDS.lead1,
      } as any);

      // No priority specified, should default
      const result = await caller.triggerPrediction({
        entityType: 'lead',
        entityId: TEST_UUIDS.lead1,
        predictionType: 'CHURN_RISK',
      });

      expect(result.status).toBe('QUEUED');
      expect(mockQueueAdd).toHaveBeenCalledWith(
        'predict',
        expect.objectContaining({ priority: 5 }),
        expect.objectContaining({ priority: 5 })
      );
    });

    it('should not trigger database calls for opportunity entity type', async () => {
      const result = await caller.triggerPrediction({
        entityType: 'opportunity',
        entityId: TEST_UUIDS.opportunity1,
        predictionType: 'CHURN_RISK',
      });

      // No entity verification for unsupported types
      expect(prismaMock.lead.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.contact.findUnique).not.toHaveBeenCalled();
      expect(result.status).toBe('QUEUED');
    });
  });

  describe('updateLeadInsights', () => {
    it('should upsert AI insights for a lead', async () => {
      const aiInsight = createMockLeadAIInsight();
      prismaMock.lead.findUnique.mockResolvedValue({
        id: TEST_UUIDS.lead1,
      } as any);
      prismaMock.leadAIInsight.upsert.mockResolvedValue(aiInsight as any);

      const result = await caller.updateLeadInsights({
        leadId: TEST_UUIDS.lead1,
        churnRisk: 'HIGH',
        conversionProbability: 45,
        estimatedValue: 25000,
        engagementScore: 60,
        sentiment: 'NEUTRAL',
        nextBestAction: 'Call',
        recommendations: ['Send proposal'],
      });

      expect(result).toBeDefined();
      expect(prismaMock.leadAIInsight.upsert).toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when lead does not exist', async () => {
      prismaMock.lead.findUnique.mockResolvedValue(null);

      await expect(
        caller.updateLeadInsights({
          leadId: TEST_UUIDS.nonExistent,
          churnRisk: 'LOW',
        })
      ).rejects.toThrow(TRPCError);

      try {
        await caller.updateLeadInsights({
          leadId: TEST_UUIDS.nonExistent,
          churnRisk: 'LOW',
        });
      } catch (err) {
        expect((err as TRPCError).code).toBe('NOT_FOUND');
      }
    });

    it('should create with defaults when insight does not exist', async () => {
      prismaMock.lead.findUnique.mockResolvedValue({
        id: TEST_UUIDS.lead1,
      } as any);
      prismaMock.leadAIInsight.upsert.mockResolvedValue({} as any);

      await caller.updateLeadInsights({
        leadId: TEST_UUIDS.lead1,
        churnRisk: 'MEDIUM',
      });

      expect(prismaMock.leadAIInsight.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            leadId_tenantId: {
              leadId: TEST_UUIDS.lead1,
              tenantId: TEST_UUIDS.tenant,
            },
          },
          create: expect.objectContaining({
            tenantId: TEST_UUIDS.tenant,
            leadId: TEST_UUIDS.lead1,
            churnRisk: 'MEDIUM',
            conversionProbability: 0,
            estimatedValue: 0,
            engagementScore: 0,
          }),
          update: expect.objectContaining({
            churnRisk: 'MEDIUM',
            updatedAt: expect.any(Date),
          }),
        })
      );
    });

    it('should accept partial updates', async () => {
      prismaMock.lead.findUnique.mockResolvedValue({
        id: TEST_UUIDS.lead1,
      } as any);
      prismaMock.leadAIInsight.upsert.mockResolvedValue({} as any);

      // Only update engagementScore
      await caller.updateLeadInsights({
        leadId: TEST_UUIDS.lead1,
        engagementScore: 90,
      });

      const upsertCall = (prismaMock.leadAIInsight.upsert as any).mock.calls[0][0];
      expect(upsertCall.update.engagementScore).toBe(90);
    });
  });

  describe('updateContactInsights', () => {
    it('should upsert AI insights for a contact', async () => {
      const aiInsight = createMockContactAIInsight();
      prismaMock.contact.findUnique.mockResolvedValue({
        id: TEST_UUIDS.contact1,
      } as any);
      prismaMock.contactAIInsight.upsert.mockResolvedValue(aiInsight as any);

      const result = await caller.updateContactInsights({
        contactId: TEST_UUIDS.contact1,
        churnRisk: 'LOW',
        conversionProbability: 85,
        lifetimeValue: 150000,
        engagementScore: 90,
        sentiment: 'POSITIVE',
        nextBestAction: 'Upsell Premium',
        recommendations: ['Propose enterprise plan'],
      });

      expect(result).toBeDefined();
      expect(prismaMock.contactAIInsight.upsert).toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when contact does not exist', async () => {
      prismaMock.contact.findUnique.mockResolvedValue(null);

      await expect(
        caller.updateContactInsights({
          contactId: TEST_UUIDS.nonExistent,
          churnRisk: 'LOW',
        })
      ).rejects.toThrow(TRPCError);
    });

    it('should create with defaults when insight does not exist', async () => {
      prismaMock.contact.findUnique.mockResolvedValue({
        id: TEST_UUIDS.contact1,
      } as any);
      prismaMock.contactAIInsight.upsert.mockResolvedValue({} as any);

      await caller.updateContactInsights({
        contactId: TEST_UUIDS.contact1,
      });

      expect(prismaMock.contactAIInsight.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { contactId: TEST_UUIDS.contact1 },
          create: expect.objectContaining({
            tenantId: TEST_UUIDS.tenant,
            contactId: TEST_UUIDS.contact1,
            churnRisk: 'LOW',
            conversionProbability: 0,
            lifetimeValue: 0,
            engagementScore: 0,
          }),
        })
      );
    });

    it('should include tenantId in the create payload', async () => {
      prismaMock.contact.findUnique.mockResolvedValue({
        id: TEST_UUIDS.contact1,
      } as any);
      prismaMock.contactAIInsight.upsert.mockResolvedValue({} as any);

      await caller.updateContactInsights({
        contactId: TEST_UUIDS.contact1,
        churnRisk: 'MEDIUM',
      });

      const upsertCall = (prismaMock.contactAIInsight.upsert as any).mock.calls[0][0];
      expect(upsertCall.create.tenantId).toBe(TEST_UUIDS.tenant);
    });
  });

  describe('input validation', () => {
    it('should reject invalid UUID for leadId', async () => {
      await expect(caller.getLeadInsights({ leadId: 'not-a-uuid' })).rejects.toThrow();
    });

    it('should reject invalid UUID for contactId', async () => {
      await expect(caller.getContactInsights({ contactId: 'invalid' })).rejects.toThrow();
    });

    it('should reject invalid entity type for getInsightsSummary', async () => {
      await expect(
        caller.getInsightsSummary({
          entityType: 'invalid' as any,
          entityId: TEST_UUIDS.lead1,
        })
      ).rejects.toThrow();
    });

    it('should reject invalid predictionType for triggerPrediction', async () => {
      await expect(
        caller.triggerPrediction({
          entityType: 'lead',
          entityId: TEST_UUIDS.lead1,
          predictionType: 'INVALID' as any,
        })
      ).rejects.toThrow();
    });

    it('should reject conversionProbability outside 0-100 range', async () => {
      prismaMock.lead.findUnique.mockResolvedValue({
        id: TEST_UUIDS.lead1,
      } as any);

      await expect(
        caller.updateLeadInsights({
          leadId: TEST_UUIDS.lead1,
          conversionProbability: 150,
        })
      ).rejects.toThrow();
    });

    it('should reject engagementScore outside 0-100 range', async () => {
      prismaMock.lead.findUnique.mockResolvedValue({
        id: TEST_UUIDS.lead1,
      } as any);

      await expect(
        caller.updateLeadInsights({
          leadId: TEST_UUIDS.lead1,
          engagementScore: -5,
        })
      ).rejects.toThrow();
    });
  });

  // ===========================================================================
  // Dashboard endpoints — resource-bounded fetch (no per-row lead/contact join)
  //
  // Stats + trends are aggregated over the FULL date window, but display names
  // are resolved only for the paginated page via id-IN lookups. These tests pin
  // both the aggregate correctness and the absence of the bulk join.
  // ===========================================================================
  describe('getSentimentDashboard', () => {
    it('aggregates stats over the full window and resolves names per page', async () => {
      prismaMock.leadAIInsight.findMany.mockResolvedValue([
        createMockLeadAIInsight({
          id: 'li-1',
          leadId: TEST_UUIDS.lead1,
          sentiment: 'positive',
          churnRisk: 'HIGH',
          engagementScore: 80,
          updatedAt: new Date('2025-12-20'),
        }),
      ] as any);
      prismaMock.contactAIInsight.findMany.mockResolvedValue([
        createMockContactAIInsight({
          id: 'ci-1',
          contactId: TEST_UUIDS.contact1,
          sentiment: 'negative',
          churnRisk: 'LOW',
          engagementScore: 40,
          updatedAt: new Date('2025-12-19'),
        }),
      ] as any);
      // Per-page name resolution (replaces the old per-row join)
      prismaMock.lead.findMany.mockResolvedValue([
        { id: TEST_UUIDS.lead1, firstName: 'Ada', lastName: 'Lovelace', company: 'Analytical' },
      ] as any);
      prismaMock.contact.findMany.mockResolvedValue([
        { id: TEST_UUIDS.contact1, firstName: 'Grace', lastName: 'Hopper', company: 'Navy' },
      ] as any);

      const result = await caller.getSentimentDashboard({
        entityType: 'all',
        dateRange: '30d',
        page: 1,
        limit: 20,
      });

      expect(result.stats.total).toBe(2);
      expect(result.stats.positive).toBe(1);
      expect(result.stats.negative).toBe(1);
      expect(result.stats.urgentCount).toBe(1); // the HIGH-churn lead row
      const names = result.recentAnalyses.map((r) => r.entityName);
      expect(names).toContain('Ada Lovelace');
      expect(names).toContain('Grace Hopper');
    });

    it('does NOT join lead/contact in the bulk insight fetch', async () => {
      prismaMock.leadAIInsight.findMany.mockResolvedValue([] as any);
      prismaMock.contactAIInsight.findMany.mockResolvedValue([] as any);

      await caller.getSentimentDashboard({
        entityType: 'all',
        dateRange: '30d',
        page: 1,
        limit: 20,
      });

      const leadCall = (prismaMock.leadAIInsight.findMany as any).mock.calls[0][0];
      expect(leadCall.include).toBeUndefined();
      expect(leadCall.select.leadId).toBe(true);
    });

    it('resolves page names via id-IN lookups, not a per-row join', async () => {
      prismaMock.leadAIInsight.findMany.mockResolvedValue([
        createMockLeadAIInsight({ id: 'li-1', leadId: TEST_UUIDS.lead1 }),
      ] as any);
      prismaMock.contactAIInsight.findMany.mockResolvedValue([] as any);
      prismaMock.lead.findMany.mockResolvedValue([
        { id: TEST_UUIDS.lead1, firstName: 'Ada', lastName: 'Lovelace', company: null },
      ] as any);

      await caller.getSentimentDashboard({
        entityType: 'all',
        dateRange: '30d',
        page: 1,
        limit: 20,
      });

      const nameCall = (prismaMock.lead.findMany as any).mock.calls[0][0];
      expect(nameCall.where.id.in).toContain(TEST_UUIDS.lead1);
      // Tenant-scoped (defence-in-depth alongside RLS): a cross-tenant/stale id
      // must never resolve to another tenant's entity name.
      expect(nameCall.where.tenantId).toBe(TEST_UUIDS.tenant);
      expect(nameCall.select).toEqual({
        id: true,
        firstName: true,
        lastName: true,
        company: true,
      });
    });
  });

  describe('getChurnDashboard', () => {
    it('aggregates churn distribution over the full window and resolves page names', async () => {
      prismaMock.leadAIInsight.findMany.mockResolvedValue([
        createMockLeadAIInsight({
          id: 'li-1',
          leadId: TEST_UUIDS.lead1,
          churnRisk: 'CRITICAL',
          engagementScore: 30,
        }),
      ] as any);
      prismaMock.contactAIInsight.findMany.mockResolvedValue([
        createMockContactAIInsight({
          id: 'ci-1',
          contactId: TEST_UUIDS.contact1,
          churnRisk: 'LOW',
          engagementScore: 90,
        }),
      ] as any);
      prismaMock.lead.findMany.mockResolvedValue([
        { id: TEST_UUIDS.lead1, firstName: 'Ada', lastName: 'Lovelace', company: null },
      ] as any);
      prismaMock.contact.findMany.mockResolvedValue([
        { id: TEST_UUIDS.contact1, firstName: 'Grace', lastName: 'Hopper', company: null },
      ] as any);

      const result = await caller.getChurnDashboard({
        entityType: 'all',
        dateRange: '30d',
        page: 1,
        limit: 20,
      });

      expect(result.stats.total).toBe(2);
      expect(result.stats.critical).toBe(1);
      expect(result.stats.low).toBe(1);
      expect(result.stats.avgEngagement).toBe(60); // (30 + 90) / 2
      // CRITICAL sorts first; its name comes from the per-page lookup
      expect(result.atRiskCustomers[0].entityName).toBe('Ada Lovelace');
    });

    it('falls back to "Unknown" when a page entity name is missing', async () => {
      prismaMock.leadAIInsight.findMany.mockResolvedValue([
        createMockLeadAIInsight({ id: 'li-1', leadId: TEST_UUIDS.lead1, churnRisk: 'HIGH' }),
      ] as any);
      prismaMock.contactAIInsight.findMany.mockResolvedValue([] as any);
      // Name lookup returns nothing for the referenced lead
      prismaMock.lead.findMany.mockResolvedValue([] as any);

      const result = await caller.getChurnDashboard({
        entityType: 'all',
        dateRange: '30d',
        page: 1,
        limit: 20,
      });

      expect(result.atRiskCustomers[0].entityName).toBe('Unknown Lead');
    });
  });
});
