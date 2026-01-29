/**
 * Lead Router Contract Tests (IFC-129)
 *
 * Verifies the tRPC API contract for lead operations:
 * - Input/output type validation
 * - Error response contracts
 * - Pagination contract
 *
 * @see Sprint 6 - IFC-129: UI and Contract Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { leadRouter } from '../../modules/lead/lead.router';
import {
  prismaMock,
  createTestContext,
  mockLead,
  mockUser,
  mockContact,
  mockAccount,
  mockTask,
  mockAIScore,
  TEST_UUIDS,
} from '../../test/setup';

/**
 * Lead entity contract schema
 * Defines the expected shape of a lead response
 */
const leadResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  source: z.enum(['WEBSITE', 'REFERRAL', 'SOCIAL', 'EMAIL', 'COLD_CALL', 'EVENT', 'OTHER']),
  status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED', 'LOST']),
  score: z.number().min(0).max(100),
  ownerId: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Lead list response contract schema
 */
const leadListResponseSchema = z.object({
  leads: z.array(z.any()), // Lead objects with relations
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  hasMore: z.boolean(),
});

/**
 * Lead stats response contract schema
 */
const leadStatsResponseSchema = z.object({
  total: z.number().int().min(0),
  byStatus: z.record(z.number().int().min(0)),
  averageScore: z.number().min(0).max(100),
});

describe('Lead Router Contract Tests', () => {
  const caller = leadRouter.createCaller(createTestContext());

  describe('create - Input Contract', () => {
    it('should accept valid lead creation input', async () => {
      const validInput = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        company: 'Acme Corp',
        phone: '+1234567890',
        source: 'WEBSITE' as const,
      };

      const mockDomainLead = {
        id: { value: TEST_UUIDS.lead1 },
        email: { value: validInput.email },
        firstName: validInput.firstName,
        lastName: validInput.lastName,
        company: validInput.company,
        title: null,
        phone: validInput.phone,
        source: validInput.source,
        status: 'NEW' as const,
        score: { value: 0, confidence: 0, tier: 'cold' as const },
        ownerId: TEST_UUIDS.user1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.createLead = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainLead,
      });

      const result = await callerWithService.create(validInput);

      // Verify response matches contract
      expect(result.email).toBe(validInput.email);
      expect(result.firstName).toBe(validInput.firstName);
      expect(result.source).toBe(validInput.source);
    });

    it('should enforce email format in input contract', async () => {
      const invalidInput = {
        email: 'not-an-email',
        source: 'WEBSITE' as const,
      };

      // Should throw validation error
      await expect(caller.create(invalidInput as any)).rejects.toThrow();
    });

    it('should accept all valid source enum values', async () => {
      const sources = ['WEBSITE', 'REFERRAL', 'SOCIAL', 'EMAIL', 'COLD_CALL', 'EVENT', 'OTHER'] as const;

      for (const source of sources) {
        const input = { email: `test-${source.toLowerCase()}@example.com`, source };

        const mockDomainLead = {
          id: { value: TEST_UUIDS.lead1 },
          email: { value: input.email },
          firstName: null,
          lastName: null,
          company: null,
          title: null,
          phone: null,
          source,
          status: 'NEW' as const,
          score: { value: 0, confidence: 0, tier: 'cold' as const },
          ownerId: TEST_UUIDS.user1,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const ctx = createTestContext();
        const callerWithService = leadRouter.createCaller(ctx);

        ctx.services!.lead!.createLead = vi.fn().mockResolvedValue({
          isSuccess: true,
          isFailure: false,
          value: mockDomainLead,
        });

        const result = await callerWithService.create(input);
        expect(result.source).toBe(source);
      }
    });
  });

  describe('create - Output Contract', () => {
    it('should return lead with all required fields', async () => {
      const mockDomainLead = {
        id: { value: TEST_UUIDS.lead1 },
        email: { value: 'test@example.com' },
        firstName: null,
        lastName: null,
        company: null,
        title: null,
        phone: null,
        source: 'WEBSITE' as const,
        status: 'NEW' as const,
        score: { value: 0, confidence: 0, tier: 'cold' as const },
        ownerId: TEST_UUIDS.user1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.createLead = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainLead,
      });

      const result = await callerWithService.create({
        email: 'test@example.com',
        source: 'WEBSITE',
      });

      // Verify all required fields are present
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('email');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('ownerId');
      expect(result).toHaveProperty('createdAt');
    });

    it('should return status as NEW for new leads', async () => {
      const mockDomainLead = {
        id: { value: TEST_UUIDS.lead1 },
        email: { value: 'new@example.com' },
        firstName: null,
        lastName: null,
        company: null,
        title: null,
        phone: null,
        source: 'WEBSITE' as const,
        status: 'NEW' as const,
        score: { value: 0, confidence: 0, tier: 'cold' as const },
        ownerId: TEST_UUIDS.user1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.createLead = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainLead,
      });

      const result = await callerWithService.create({
        email: 'new@example.com',
        source: 'WEBSITE',
      });

      expect(result.status).toBe('NEW');
    });

    it('should return initial score as 0', async () => {
      const mockDomainLead = {
        id: { value: TEST_UUIDS.lead1 },
        email: { value: 'new@example.com' },
        firstName: null,
        lastName: null,
        company: null,
        title: null,
        phone: null,
        source: 'WEBSITE' as const,
        status: 'NEW' as const,
        score: { value: 0, confidence: 0, tier: 'cold' as const },
        ownerId: TEST_UUIDS.user1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.createLead = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainLead,
      });

      const result = await callerWithService.create({
        email: 'new@example.com',
        source: 'WEBSITE',
      });

      expect(result.score).toBe(0);
    });
  });

  describe('getById - Contract', () => {
    it('should require valid UUID for id parameter', async () => {
      await expect(caller.getById({ id: 'not-a-uuid' })).rejects.toThrow();
    });

    it('should return lead via LeadService', async () => {
      const mockDomainLead = {
        id: { value: TEST_UUIDS.lead1 },
        email: { value: mockLead.email },
        firstName: mockLead.firstName,
        lastName: mockLead.lastName,
        company: mockLead.company,
        title: null,
        phone: mockLead.phone,
        source: mockLead.source,
        status: mockLead.status,
        score: { value: 75, confidence: 0.8, tier: 'warm' as const },
        ownerId: mockLead.ownerId,
        createdAt: mockLead.createdAt,
        updatedAt: mockLead.updatedAt,
        getDomainEvents: () => [],
        clearDomainEvents: () => {},
      };

      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.getLeadById = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainLead,
      });

      const result = await callerWithService.getById({ id: TEST_UUIDS.lead1 });

      // Verify response includes expected fields
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('email');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('score');
    });

    it('should throw NOT_FOUND error with correct code', async () => {
      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.getLeadById = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'NOT_FOUND_ERROR', message: `Lead not found: ${TEST_UUIDS.nonExistent}` },
      });

      try {
        await callerWithService.getById({ id: TEST_UUIDS.nonExistent });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('NOT_FOUND');
        expect(error.message).toContain('not found');
      }
    });
  });

  describe('list - Contract', () => {
    beforeEach(() => {
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.lead.count.mockResolvedValue(0);
    });

    it('should return paginated response structure', async () => {
      const result = await caller.list({});

      const parseResult = leadListResponseSchema.safeParse(result);
      expect(parseResult.success).toBe(true);

      expect(result).toHaveProperty('leads');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('limit');
      expect(result).toHaveProperty('hasMore');
    });

    it('should accept valid filter parameters', async () => {
      // Should not throw with valid filters
      await caller.list({
        page: 1,
        limit: 20,
        status: ['NEW', 'QUALIFIED'],
        minScore: 50,
        maxScore: 100,
        search: 'test',
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      expect(prismaMock.lead.findMany).toHaveBeenCalled();
    });

    it('should enforce valid status enum values in filter', async () => {
      // This should still work because the router validates input
      await expect(
        caller.list({ status: ['INVALID_STATUS' as any] })
      ).rejects.toThrow();
    });

    it('should enforce pagination limits', async () => {
      // Page must be positive
      await expect(caller.list({ page: 0 })).rejects.toThrow();

      // Limit must be positive
      await expect(caller.list({ limit: 0 })).rejects.toThrow();
    });

    it('should return hasMore correctly based on pagination', async () => {
      prismaMock.lead.findMany.mockResolvedValue([mockLead]);
      prismaMock.lead.count.mockResolvedValue(10);

      const result = await caller.list({ page: 1, limit: 5 });

      // With 10 total and limit 5, there should be more
      expect(result.hasMore).toBe(true);
    });
  });

  describe('update - Contract', () => {
    it('should require id in update input', async () => {
      // @ts-expect-error - Testing contract
      await expect(caller.update({ firstName: 'Updated' })).rejects.toThrow();
    });

    it('should accept partial updates', async () => {
      const mockDomainLead = {
        id: { value: TEST_UUIDS.lead1 },
        email: { value: 'lead@example.com' },
        firstName: 'Updated',
        lastName: 'Doe',
        company: 'ACME Corp',
        title: null,
        phone: null,
        source: 'WEBSITE' as const,
        status: 'NEW' as const,
        score: { value: 75, confidence: 0.8, tier: 'warm' as const },
        ownerId: TEST_UUIDS.user1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.updateLeadContactInfo = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainLead,
      });

      const result = await callerWithService.update({
        id: TEST_UUIDS.lead1,
        firstName: 'Updated',
      });

      expect(result.firstName).toBe('Updated');
    });

    it('should validate status transitions', async () => {
      // Status transitions don't use LeadService, still use Prisma directly
      prismaMock.lead.findUnique.mockResolvedValue(mockLead);
      prismaMock.lead.update.mockResolvedValue({
        ...mockLead,
        status: 'QUALIFIED' as const,
      });

      const result = await caller.update({
        id: TEST_UUIDS.lead1,
        status: 'QUALIFIED',
      });

      expect(result.status).toBe('QUALIFIED');
    });
  });

  describe('delete - Contract', () => {
    it('should return success structure on delete', async () => {
      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.deleteLead = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: undefined,
      });

      const result = await callerWithService.delete({ id: TEST_UUIDS.lead1 });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('id');
      expect(result.success).toBe(true);
      expect(result.id).toBe(TEST_UUIDS.lead1);
    });

    it('should throw NOT_FOUND for non-existent lead', async () => {
      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.deleteLead = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'NOT_FOUND_ERROR', message: `Lead not found: ${TEST_UUIDS.nonExistent}` },
      });

      try {
        await callerWithService.delete({ id: TEST_UUIDS.nonExistent });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('NOT_FOUND');
      }
    });

    it('should throw PRECONDITION_FAILED for converted lead', async () => {
      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.deleteLead = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'VALIDATION_ERROR', message: 'Cannot delete a converted lead' },
      });

      try {
        await callerWithService.delete({ id: TEST_UUIDS.lead1 });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('PRECONDITION_FAILED');
      }
    });
  });

  describe('qualify - Contract', () => {
    it('should require leadId and reason', async () => {
      // @ts-expect-error - Testing contract
      await expect(caller.qualify({ leadId: TEST_UUIDS.lead1 })).rejects.toThrow();
    });

    it('should return qualified lead', async () => {
      const mockDomainLead = {
        id: { value: TEST_UUIDS.lead1 },
        email: { value: 'lead@example.com' },
        firstName: 'John',
        lastName: 'Doe',
        company: 'ACME Corp',
        title: null,
        phone: null,
        source: 'WEBSITE' as const,
        status: 'QUALIFIED' as const,
        score: { value: 75, confidence: 0.8, tier: 'warm' as const },
        ownerId: TEST_UUIDS.user1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.qualifyLead = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainLead,
      });

      const result = await callerWithService.qualify({
        leadId: TEST_UUIDS.lead1,
        reason: 'Good fit for our product',
      });

      expect(result.status).toBe('QUALIFIED');
    });

    it('should throw BAD_REQUEST if already qualified', async () => {
      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.qualifyLead = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Lead already qualified' },
      });

      try {
        await callerWithService.qualify({ leadId: TEST_UUIDS.lead1, reason: 'Test' });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('BAD_REQUEST');
      }
    });
  });

  describe('convert - Contract', () => {
    it('should return leadId, contactId, and optional accountId', async () => {
      const mockConversionResult = {
        leadId: TEST_UUIDS.lead1,
        contactId: TEST_UUIDS.contact1,
        accountId: TEST_UUIDS.account1,
        convertedBy: TEST_UUIDS.user1,
        convertedAt: new Date(),
      };

      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      // Mock the LeadService.convertLead method
      ctx.services!.lead!.convertLead = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockConversionResult,
      });

      const result = await callerWithService.convert({
        leadId: TEST_UUIDS.lead1,
        createAccount: true,
        accountName: 'Test Corp',
      });

      expect(result).toHaveProperty('leadId');
      expect(result).toHaveProperty('contactId');
      expect(result).toHaveProperty('accountId');
      expect(result.leadId).toBe(TEST_UUIDS.lead1);
    });
  });

  describe('scoreWithAI - Contract', () => {
    it('should return score response with required fields', async () => {
      const mockScoreResult = {
        leadId: TEST_UUIDS.lead1,
        previousScore: 50,
        newScore: 80,
        confidence: 0.85,
        tier: 'hot' as const,
        autoQualified: false,
        autoDisqualified: false,
      };

      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.scoreLead = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockScoreResult,
      });

      const result = await callerWithService.scoreWithAI({ leadId: TEST_UUIDS.lead1 });

      expect(result).toHaveProperty('leadId');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('confidence');
      expect(typeof result.score).toBe('number');
      expect(typeof result.confidence).toBe('number');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('stats - Contract', () => {
    it('should return stats response matching contract', async () => {
      const mockStats = {
        total: 100,
        byStatus: {
          NEW: 50,
          QUALIFIED: 30,
        },
        averageScore: 75,
        hotLeads: 20,
        warmLeads: 40,
        coldLeads: 40,
      };

      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      // Stats procedure uses Prisma directly, not service
      prismaMock.lead.count.mockResolvedValue(100);
      (prismaMock.lead.groupBy as any).mockResolvedValue([
        { status: 'NEW', _count: 30 },
        { status: 'CONTACTED', _count: 40 },
        { status: 'QUALIFIED', _count: 30 },
      ] as any);
      prismaMock.lead.findMany.mockResolvedValue([
        { score: 80 }, { score: 85 }, { score: 75 }, // Hot leads (score >= 70)
        { score: 50 }, { score: 60 }, { score: 45 }, // Warm leads
        { score: 30 }, { score: 20 }, { score: 10 }, // Cold leads
      ] as any);

      const result = await callerWithService.stats();

      const parseResult = leadStatsResponseSchema.safeParse(result);
      expect(parseResult.success).toBe(true);

      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('byStatus');
      expect(result).toHaveProperty('averageScore');
      expect(typeof result.total).toBe('number');
      expect(typeof result.averageScore).toBe('number');
    });
  });
});
