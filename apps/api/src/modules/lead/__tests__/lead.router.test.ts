import { TEST_UUIDS } from '../../../test/setup';
/**
 * Lead Router Tests
 *
 * Comprehensive tests for all lead router procedures:
 * - create, getById, list, update, delete
 * - qualify, convert, scoreWithAI, stats
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { leadRouter } from '../lead.router';
import {
  prismaMock,
  createTestContext,
  mockLead,
  mockUser,
  mockContact,
  mockAccount,
  mockTask,
  mockAIScore,
} from '../../../test/setup';

describe('Lead Router', () => {
  const caller = leadRouter.createCaller(createTestContext());

  beforeEach(() => {
    // Reset is handled by setup.ts
  });

  describe('create', () => {
    it('should create a new lead with valid input', async () => {
      const input = {
        email: 'newlead@example.com',
        firstName: 'Alice',
        lastName: 'Johnson',
        company: 'StartupCo',
        phone: '+1987654321',
        source: 'WEBSITE' as const,
      };

      // Mock Lead domain entity response
      const mockDomainLead = {
        id: { value: TEST_UUIDS.lead1 },
        email: { value: input.email },
        firstName: input.firstName,
        lastName: input.lastName,
        company: input.company,
        title: null,
        phone: input.phone,
        source: input.source,
        status: 'NEW' as const,
        score: { value: 0, confidence: 0, tier: 'cold' as const },
        ownerId: TEST_UUIDS.user1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      // Mock LeadService.createLead
      ctx.services!.lead!.createLead = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainLead,
      });

      const result = await callerWithService.create(input);

      expect(result.email).toBe(input.email);
      expect(result.firstName).toBe(input.firstName);
      expect(ctx.services!.lead!.createLead).toHaveBeenCalled();
    });

    it('should throw for invalid email', async () => {
      const input = {
        email: 'invalid-email',
        phone: '+1234567890',
        source: 'WEBSITE' as const,
      };

      await expect(caller.create(input as any)).rejects.toThrow();
    });
  });

  describe('getById', () => {
    it('should return lead via LeadService', async () => {
      // Mock the Prisma findUnique call with related data
      const mockLeadWithRelations = {
        ...mockLead,
        owner: {
          id: TEST_UUIDS.user1,
          email: 'user@example.com',
          name: 'Test User',
          avatarUrl: null,
        },
        activities: [],
        notes: [],
        files: [],
        aiInsight: null,
        aiInsights: [],
        tasks: [],
      };

      prismaMock.lead.findUnique.mockResolvedValue(mockLeadWithRelations as any);

      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      const result = await callerWithService.getById({ id: TEST_UUIDS.lead1 });

      expect(result.id).toBe(TEST_UUIDS.lead1);
      expect(result.email).toBe(mockLead.email);
      expect(prismaMock.lead.findUnique).toHaveBeenCalled();
    });

    it('should throw NOT_FOUND for non-existent lead', async () => {
      // Mock Prisma to return null (lead not found)
      prismaMock.lead.findUnique.mockResolvedValue(null);

      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      await expect(callerWithService.getById({ id: TEST_UUIDS.nonExistent })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
          message: expect.stringContaining('not found'),
        })
      );
    });

    it('AC-008 (IFC-227): getById include clause requests account select { id, name }', async () => {
      const mockLeadWithAccount = {
        ...mockLead,
        accountId: TEST_UUIDS.account1 ?? 'acc-uuid-1',
        account: { id: TEST_UUIDS.account1 ?? 'acc-uuid-1', name: 'Acme Corp' },
        owner: {
          id: TEST_UUIDS.user1,
          email: 'user@example.com',
          name: 'Test User',
          avatarUrl: null,
          role: 'MEMBER',
        },
        activities: [],
        notes: [],
        files: [],
        aiInsight: null,
        aiInsights: [],
        tasks: [],
      };

      prismaMock.lead.findUnique.mockResolvedValue(mockLeadWithAccount as any);

      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      await callerWithService.getById({ id: TEST_UUIDS.lead1 });

      // Verify the include clause contains account with id+name select
      const callArgs = prismaMock.lead.findUnique.mock.calls[0]?.[0] as any;
      expect(callArgs?.include).toHaveProperty('account');
      expect(callArgs.include.account).toMatchObject({ select: { id: true, name: true } });
    });
  });

  describe('list', () => {
    it('should list leads with pagination', async () => {
      const leads = [mockLead, { ...mockLead, id: TEST_UUIDS.lead2, email: 'lead2@example.com' }];
      const leadsWithRelations = leads.map((lead) => ({
        ...lead,
        owner: mockUser,
        contact: mockContact,
      }));

      prismaMock.lead.findMany.mockResolvedValue(leadsWithRelations);
      prismaMock.lead.count.mockResolvedValue(10);

      const result = await caller.list({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(10);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.hasMore).toBe(true); // skip(0) + leads.length(2) < total(10)
    });

    it('should filter leads by status', async () => {
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.lead.count.mockResolvedValue(0);

      await caller.list({ status: ['QUALIFIED', 'CONVERTED'] });

      expect(prismaMock.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['QUALIFIED', 'CONVERTED'] },
          }),
        })
      );
    });

    it('should filter leads by score range', async () => {
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.lead.count.mockResolvedValue(0);

      await caller.list({ minScore: 70, maxScore: 90 });

      expect(prismaMock.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            score: { gte: 70, lte: 90 },
          }),
        })
      );
    });

    it('should search leads by text', async () => {
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.lead.count.mockResolvedValue(0);

      await caller.list({ search: 'ACME' });

      expect(prismaMock.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { email: { contains: 'ACME', mode: 'insensitive' } },
              { firstName: { contains: 'ACME', mode: 'insensitive' } },
              { lastName: { contains: 'ACME', mode: 'insensitive' } },
              { company: { contains: 'ACME', mode: 'insensitive' } },
            ]),
          }),
        })
      );
    });
  });

  describe('update', () => {
    it('should update lead with valid data via updateLead service', async () => {
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

      ctx.services!.lead!.updateLead = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainLead,
      });

      const result = await callerWithService.update({
        id: TEST_UUIDS.lead1,
        firstName: 'Updated',
      });

      expect(result.firstName).toBe('Updated');
      expect(ctx.services!.lead!.updateLead).toHaveBeenCalledWith(
        TEST_UUIDS.lead1,
        expect.objectContaining({ firstName: 'Updated' })
      );
    });

    it('should forward mixed contact + Lead 360 fields to service', async () => {
      const mockDomainLead = {
        id: { value: TEST_UUIDS.lead1 },
        email: { value: 'lead@example.com' },
        firstName: 'Jane',
        lastName: 'Doe',
        company: 'ACME Corp',
        title: null,
        phone: null,
        source: 'WEBSITE' as const,
        status: 'NEW' as const,
        score: { value: 75, confidence: 0.8, tier: 'warm' as const },
        ownerId: TEST_UUIDS.user1,
        location: 'New York',
        website: 'https://acme.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.updateLead = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainLead,
      });

      await callerWithService.update({
        id: TEST_UUIDS.lead1,
        firstName: 'Jane',
        location: 'New York',
        website: 'https://acme.com',
      });

      expect(ctx.services!.lead!.updateLead).toHaveBeenCalledWith(
        TEST_UUIDS.lead1,
        expect.objectContaining({
          firstName: 'Jane',
          location: 'New York',
          website: 'https://acme.com',
        })
      );
    });

    it('should throw NOT_FOUND when updating non-existent lead', async () => {
      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.updateLead = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Lead not found: ' + TEST_UUIDS.nonExistent },
      });

      await expect(
        callerWithService.update({ id: TEST_UUIDS.nonExistent, firstName: 'Test' })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });

    it('should throw PRECONDITION_FAILED when updating converted lead', async () => {
      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.updateLead = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Cannot update a converted lead' },
      });

      await expect(
        callerWithService.update({ id: TEST_UUIDS.lead1, firstName: 'Test' })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'PRECONDITION_FAILED',
        })
      );
    });

    it('should reject status in input via Zod schema', async () => {
      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      await expect(
        callerWithService.update({ id: TEST_UUIDS.lead1, status: 'QUALIFIED' } as any)
      ).rejects.toThrow();
    });

    it('should reject email in input via Zod schema', async () => {
      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      await expect(
        callerWithService.update({ id: TEST_UUIDS.lead1, email: 'new@example.com' } as any)
      ).rejects.toThrow();
    });

    it('should return consistent mapLeadToResponse shape', async () => {
      const mockDomainLead = {
        id: { value: TEST_UUIDS.lead1 },
        email: { value: 'lead@example.com' },
        firstName: 'John',
        lastName: 'Doe',
        company: 'ACME Corp',
        title: 'CTO',
        phone: null,
        source: 'WEBSITE' as const,
        status: 'NEW' as const,
        score: { value: 50, confidence: 0.5, tier: 'warm' as const },
        ownerId: TEST_UUIDS.user1,
        tenantId: TEST_UUIDS.tenant,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.updateLead = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainLead,
      });

      const result = await callerWithService.update({
        id: TEST_UUIDS.lead1,
        location: 'Boston',
      });

      // Should include mapped response fields, not raw Prisma
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('email');
      expect(result).toHaveProperty('source');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('score');
    });
  });

  describe('delete', () => {
    it('should delete an existing lead via LeadService', async () => {
      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.deleteLead = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: undefined,
      });

      const result = await callerWithService.delete({ id: TEST_UUIDS.lead1 });

      expect(result.success).toBe(true);
      expect(result.id).toBe(TEST_UUIDS.lead1);
      expect(ctx.services!.lead!.deleteLead).toHaveBeenCalledWith(TEST_UUIDS.lead1);
    });

    it('should throw NOT_FOUND when deleting non-existent lead', async () => {
      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.deleteLead = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'NOT_FOUND_ERROR', message: `Lead not found: ${TEST_UUIDS.nonExistent}` },
      });

      await expect(callerWithService.delete({ id: TEST_UUIDS.nonExistent })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });

    it('should throw PRECONDITION_FAILED when deleting converted lead', async () => {
      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.deleteLead = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'VALIDATION_ERROR', message: 'Cannot delete a converted lead' },
      });

      await expect(callerWithService.delete({ id: TEST_UUIDS.lead1 })).rejects.toThrow(
        expect.objectContaining({
          code: 'PRECONDITION_FAILED',
          message: expect.stringContaining('converted'),
        })
      );
    });
  });

  describe('qualify', () => {
    it('should qualify a lead and create follow-up task', async () => {
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
        reason: 'Strong fit for enterprise package, budget confirmed',
      });

      expect(result.status).toBe('QUALIFIED');
      expect(ctx.services!.lead!.qualifyLead).toHaveBeenCalled();
    });

    it('should throw NOT_FOUND for non-existent lead', async () => {
      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.qualifyLead = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Lead not found' },
      });

      await expect(
        callerWithService.qualify({
          leadId: TEST_UUIDS.nonExistent,
          reason: 'Good fit for our product',
        })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });

    it('should throw BAD_REQUEST if lead already qualified', async () => {
      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.qualifyLead = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Lead already qualified' },
      });

      await expect(
        callerWithService.qualify({ leadId: TEST_UUIDS.lead1, reason: 'Already qualified' })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'BAD_REQUEST',
          message: expect.stringContaining('already qualified'),
        })
      );
    });
  });

  describe('convert', () => {
    it('should convert lead to contact and create account', async () => {
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
        accountName: 'ACME Corp',
      });

      expect(result.leadId).toBe(TEST_UUIDS.lead1);
      expect(result.contactId).toBe(TEST_UUIDS.contact1);
      expect(result.accountId).toBe(TEST_UUIDS.account1);
    });

    it('should convert lead without creating account', async () => {
      const mockConversionResult = {
        leadId: TEST_UUIDS.lead1,
        contactId: TEST_UUIDS.contact1,
        accountId: null,
        convertedBy: TEST_UUIDS.user1,
        convertedAt: new Date(),
      };

      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.convertLead = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockConversionResult,
      });

      const result = await callerWithService.convert({
        leadId: TEST_UUIDS.lead1,
        createAccount: false,
      });

      expect(result.leadId).toBe(TEST_UUIDS.lead1);
      expect(result.contactId).toBeDefined();
      expect(result.accountId).toBeNull();
    });

    it('should throw BAD_REQUEST if lead already converted', async () => {
      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.convertLead = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Lead already converted' },
      });

      await expect(
        callerWithService.convert({ leadId: TEST_UUIDS.lead1, createAccount: true })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'BAD_REQUEST',
          message: expect.stringContaining('already converted'),
        })
      );
    });
  });

  describe('scoreWithAI', () => {
    it('should generate AI score for lead', async () => {
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

      expect(result.leadId).toBe(TEST_UUIDS.lead1);
      expect(result.score).toBe(80);
      expect(result.confidence).toBe(0.85);
      expect(ctx.services!.lead!.scoreLead).toHaveBeenCalledWith(TEST_UUIDS.lead1);
    });

    it('should throw NOT_FOUND for non-existent lead', async () => {
      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.scoreLead = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Lead not found' },
      });

      await expect(
        callerWithService.scoreWithAI({ leadId: TEST_UUIDS.nonExistent })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });
  });

  describe('stats', () => {
    it('should return lead statistics', async () => {
      // Mock Prisma calls used by the stats method
      prismaMock.lead.count.mockResolvedValue(100);
      (prismaMock.lead.groupBy as any).mockResolvedValue([
        { status: 'NEW', _count: 30 },
        { status: 'QUALIFIED', _count: 25 },
        { status: 'CONVERTED', _count: 20 },
      ] as any);
      // Thresholds from LEAD_SCORE_THRESHOLDS: HOT >= 80, WARM >= 50, COLD < 50
      prismaMock.lead.findMany.mockResolvedValue([
        { score: 95 },
        { score: 85 },
        { score: 80 }, // 3 hot leads (>=80)
        { score: 70 },
        { score: 60 },
        { score: 50 }, // 3 warm leads (50-79)
        { score: 30 },
        { score: 20 }, // 2 cold leads (<50)
      ] as any);

      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      const result = await callerWithService.stats();

      expect(result.total).toBe(100);
      expect(result.byStatus).toEqual({
        NEW: 30,
        QUALIFIED: 25,
        CONVERTED: 20,
      });
      expect(result.hotLeads).toBe(3);
      expect(result.warmLeads).toBe(3);
      expect(result.coldLeads).toBe(2);
    });

    it('should handle zero average score', async () => {
      // Mock Prisma calls for empty stats
      prismaMock.lead.count.mockResolvedValue(0);
      (prismaMock.lead.groupBy as any).mockResolvedValue([] as any);
      prismaMock.lead.findMany.mockResolvedValue([] as any);

      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      const result = await callerWithService.stats();

      expect(result.total).toBe(0);
      expect(result.averageScore).toBe(0);
    });

    it('should throw UNAUTHORIZED when tenantId is missing', async () => {
      const ctxWithoutTenant = {
        ...createTestContext(),
        user: {
          userId: TEST_UUIDS.user1,
          email: 'test@example.com',
          role: 'USER' as const,
          tenantId: undefined as any,
        },
      };
      const callerWithoutTenant = leadRouter.createCaller(ctxWithoutTenant);

      await expect(callerWithoutTenant.stats()).rejects.toThrow(
        expect.objectContaining({
          code: 'UNAUTHORIZED',
          message: expect.stringContaining('Tenant ID'),
        })
      );
    });
  });

  describe('getHotLeads', () => {
    it('should return hot leads via tenant-scoped direct query', async () => {
      const mockHotLeadRecord = {
        ...mockLead,
        id: TEST_UUIDS.lead1,
        email: 'hot@example.com',
        firstName: 'Hot',
        lastName: 'Lead',
        company: 'Hot Corp',
        score: 85,
        status: 'NEW',
      };

      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      prismaMock.lead.findMany.mockResolvedValue([mockHotLeadRecord] as any);

      const result = await callerWithService.getHotLeads();

      expect(result).toHaveLength(1);
      expect(result[0].score).toBe(85);
      expect(prismaMock.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TEST_UUIDS.tenant }),
          orderBy: { score: 'desc' },
        })
      );
    });
  });

  describe('getReadyForQualification', () => {
    it('should return leads ready for qualification via tenant-scoped direct query', async () => {
      const mockReadyLeadRecord = {
        ...mockLead,
        id: TEST_UUIDS.lead1,
        email: 'ready@example.com',
        firstName: 'Ready',
        lastName: 'Lead',
        company: 'Ready Corp',
        source: 'REFERRAL',
        status: 'CONTACTED',
        score: 65,
      };

      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      prismaMock.lead.findMany.mockResolvedValue([mockReadyLeadRecord] as any);

      const result = await callerWithService.getReadyForQualification();

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('CONTACTED');
      expect(prismaMock.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TEST_UUIDS.tenant }),
          orderBy: { score: 'desc' },
        })
      );
    });
  });

  describe('bulkScore', () => {
    it('should bulk score leads via LeadService', async () => {
      const mockBulkResult = {
        successful: [TEST_UUIDS.lead1, TEST_UUIDS.lead2],
        failed: [] as Array<{ id: string; error: string }>,
        totalProcessed: 2,
      };

      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.bulkScoreLeads = vi.fn().mockResolvedValue(mockBulkResult);

      const result = await callerWithService.bulkScore({
        leadIds: [TEST_UUIDS.lead1, TEST_UUIDS.lead2],
      });

      expect(result.successful).toEqual([TEST_UUIDS.lead1, TEST_UUIDS.lead2]);
      expect(result.failed).toEqual([]);
      expect(ctx.services!.lead!.bulkScoreLeads).toHaveBeenCalledWith([
        TEST_UUIDS.lead1,
        TEST_UUIDS.lead2,
      ]);
    });
  });

  describe('filterOptions', () => {
    it('should return filter options with counts', async () => {
      // filterOptions calls 3 groupBy concurrently via Promise.all; use mockImplementation
      (prismaMock.lead.groupBy as any).mockImplementation((args: { by: string[] }) => {
        if (args.by?.includes('status'))
          return Promise.resolve([
            { status: 'NEW', _count: 10 },
            { status: 'QUALIFIED', _count: 5 },
          ]);
        if (args.by?.includes('source'))
          return Promise.resolve([
            { source: 'WEBSITE', _count: 8 },
            { source: 'REFERRAL', _count: 7 },
          ]);
        if (args.by?.includes('ownerId'))
          return Promise.resolve([{ ownerId: TEST_UUIDS.user1, _count: 15 }]);
        return Promise.resolve([]);
      });

      prismaMock.user.findMany.mockResolvedValue([
        { id: TEST_UUIDS.user1, name: 'John Doe', email: 'john@example.com' },
      ] as any);

      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      const result = await callerWithService.filterOptions({});

      expect(result.statuses).toHaveLength(2);
      expect(result.sources).toHaveLength(2);
      expect(result.owners).toHaveLength(1);
      expect(result.owners[0].label).toBe('John Doe');
    });

    it('should return filter options with search filter applied', async () => {
      (prismaMock.lead.groupBy as any).mockImplementation((args: { by: string[] }) => {
        if (args.by?.includes('status')) return Promise.resolve([{ status: 'NEW', _count: 5 }]);
        if (args.by?.includes('source')) return Promise.resolve([{ source: 'WEBSITE', _count: 5 }]);
        if (args.by?.includes('ownerId')) return Promise.resolve([]);
        return Promise.resolve([]);
      });

      prismaMock.user.findMany.mockResolvedValue([]);

      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      const result = await callerWithService.filterOptions({ search: 'ACME' });

      expect(result.statuses).toHaveLength(1);
      expect(result.sources).toHaveLength(1);
      expect(result.owners).toHaveLength(0);
    });

    it('should return filter options with status and source filters', async () => {
      (prismaMock.lead.groupBy as any).mockImplementation((args: { by: string[] }) => {
        if (args.by?.includes('status'))
          return Promise.resolve([{ status: 'QUALIFIED', _count: 3 }]);
        if (args.by?.includes('source')) return Promise.resolve([{ source: 'WEBSITE', _count: 3 }]);
        if (args.by?.includes('ownerId'))
          return Promise.resolve([{ ownerId: TEST_UUIDS.user1, _count: 3 }]);
        return Promise.resolve([]);
      });

      prismaMock.user.findMany.mockResolvedValue([
        { id: TEST_UUIDS.user1, name: null, email: 'user@example.com' },
      ] as any);

      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      const result = await callerWithService.filterOptions({
        status: ['QUALIFIED'],
        source: ['WEBSITE'],
      });

      expect(result.statuses[0].value).toBe('QUALIFIED');
      expect(result.sources[0].value).toBe('WEBSITE');
      // Falls back to email when name is null
      expect(result.owners[0].label).toBe('user@example.com');
    });

    it('should filter by ownerId', async () => {
      (prismaMock.lead.groupBy as any).mockImplementation((args: { by: string[] }) => {
        if (args.by?.includes('status')) return Promise.resolve([{ status: 'NEW', _count: 2 }]);
        if (args.by?.includes('source'))
          return Promise.resolve([{ source: 'REFERRAL', _count: 2 }]);
        if (args.by?.includes('ownerId'))
          return Promise.resolve([{ ownerId: TEST_UUIDS.user1, _count: 2 }]);
        return Promise.resolve([]);
      });

      prismaMock.user.findMany.mockResolvedValue([
        { id: TEST_UUIDS.user1, name: 'Test User', email: 'test@example.com' },
      ] as any);

      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      const result = await callerWithService.filterOptions({
        ownerId: TEST_UUIDS.user1,
      });

      expect(result.owners).toHaveLength(1);
      expect(result.owners[0].value).toBe(TEST_UUIDS.user1);
    });

    it('should handle empty owner list', async () => {
      (prismaMock.lead.groupBy as any).mockImplementation((args: { by: string[] }) => {
        if (args.by?.includes('status')) return Promise.resolve([]);
        if (args.by?.includes('source')) return Promise.resolve([]);
        if (args.by?.includes('ownerId')) return Promise.resolve([]);
        return Promise.resolve([]);
      });

      prismaMock.user.findMany.mockResolvedValue([]);

      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      const result = await callerWithService.filterOptions({});

      expect(result.statuses).toHaveLength(0);
      expect(result.sources).toHaveLength(0);
      expect(result.owners).toHaveLength(0);
    });

    it('should filter null ownerIds', async () => {
      (prismaMock.lead.groupBy as any).mockImplementation((args: { by: string[] }) => {
        if (args.by?.includes('status')) return Promise.resolve([]);
        if (args.by?.includes('source')) return Promise.resolve([]);
        if (args.by?.includes('ownerId'))
          return Promise.resolve([
            { ownerId: TEST_UUIDS.user1, _count: 5 },
            { ownerId: null, _count: 2 }, // null ownerId should be filtered out
          ]);
        return Promise.resolve([]);
      });

      prismaMock.user.findMany.mockResolvedValue([
        { id: TEST_UUIDS.user1, name: 'User', email: 'user@example.com' },
      ] as any);

      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      const result = await callerWithService.filterOptions({});

      expect(result.owners).toHaveLength(1);
      expect(result.owners[0].value).toBe(TEST_UUIDS.user1);
    });
  });

  describe('additional error handling', () => {
    it('create should throw BAD_REQUEST when LeadService fails', async () => {
      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.createLead = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Invalid lead data' },
      });

      await expect(
        callerWithService.create({
          email: 'test@example.com',
          source: 'WEBSITE',
        })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'BAD_REQUEST',
          message: 'Invalid lead data',
        })
      );
    });

    it('update should handle BAD_REQUEST for validation error', async () => {
      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.updateLead = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Invalid phone number format' },
      });

      await expect(
        callerWithService.update({ id: TEST_UUIDS.lead1, firstName: 'Test' })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'BAD_REQUEST',
          message: 'Invalid phone number format',
        })
      );
    });

    it('update should route Lead 360-only fields through service', async () => {
      const mockDomainLead = {
        id: { value: TEST_UUIDS.lead1 },
        email: { value: 'lead@example.com' },
        firstName: 'John',
        lastName: 'Doe',
        company: 'ACME Corp',
        title: null,
        phone: null,
        source: 'WEBSITE' as const,
        status: 'NEW' as const,
        score: { value: 50, confidence: 0.5, tier: 'warm' as const },
        ownerId: TEST_UUIDS.user1,
        tenantId: TEST_UUIDS.tenant,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.updateLead = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainLead,
      });

      const result = await callerWithService.update({
        id: TEST_UUIDS.lead1,
        location: 'San Francisco',
        estimatedValue: 10000,
      });

      expect(ctx.services!.lead!.updateLead).toHaveBeenCalledWith(
        TEST_UUIDS.lead1,
        expect.objectContaining({
          location: 'San Francisco',
          estimatedValue: 10000,
        })
      );
      expect(result).toHaveProperty('id');
    });

    it('update should handle NOT_FOUND from service for any field', async () => {
      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.updateLead = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Lead not found: ' + TEST_UUIDS.nonExistent },
      });

      await expect(
        callerWithService.update({ id: TEST_UUIDS.nonExistent, location: 'Boston' })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });

    it('delete should throw INTERNAL_SERVER_ERROR for unknown errors', async () => {
      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.deleteLead = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'UNKNOWN_ERROR', message: 'Database connection failed' },
      });

      await expect(callerWithService.delete({ id: TEST_UUIDS.lead1 })).rejects.toThrow(
        expect.objectContaining({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Database connection failed',
        })
      );
    });

    it('qualify should throw INTERNAL_SERVER_ERROR for unknown errors', async () => {
      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.qualifyLead = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Unknown qualification error' },
      });

      await expect(
        callerWithService.qualify({ leadId: TEST_UUIDS.lead1, reason: 'Test reason' })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'INTERNAL_SERVER_ERROR',
        })
      );
    });

    it('qualify should throw BAD_REQUEST when score is below minimum', async () => {
      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.qualifyLead = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Score below minimum threshold' },
      });

      await expect(
        callerWithService.qualify({ leadId: TEST_UUIDS.lead1, reason: 'Test reason' })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'BAD_REQUEST',
          message: expect.stringContaining('below minimum'),
        })
      );
    });

    it('convert should throw NOT_FOUND for non-existent lead', async () => {
      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.convertLead = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Lead not found' },
      });

      await expect(
        callerWithService.convert({ leadId: TEST_UUIDS.nonExistent, createAccount: false })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });

    it('convert should throw BAD_REQUEST when lead is not qualified', async () => {
      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.convertLead = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Only qualified leads can be converted' },
      });

      await expect(
        callerWithService.convert({ leadId: TEST_UUIDS.lead1, createAccount: false })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'BAD_REQUEST',
          message: expect.stringContaining('Only qualified'),
        })
      );
    });

    it('convert should throw INTERNAL_SERVER_ERROR for unknown errors', async () => {
      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.convertLead = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Database error during conversion' },
      });

      await expect(
        callerWithService.convert({ leadId: TEST_UUIDS.lead1, createAccount: true })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'INTERNAL_SERVER_ERROR',
        })
      );
    });

    it('scoreWithAI should throw INTERNAL_SERVER_ERROR for scoring failures', async () => {
      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.scoreLead = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'AI service unavailable' },
      });

      await expect(callerWithService.scoreWithAI({ leadId: TEST_UUIDS.lead1 })).rejects.toThrow(
        expect.objectContaining({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'AI service unavailable',
        })
      );
    });
  });

  describe('list with date filters', () => {
    it('should filter leads by date range', async () => {
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.lead.count.mockResolvedValue(0);

      const dateFrom = new Date('2025-01-01');
      const dateTo = new Date('2025-01-31');

      await caller.list({ dateFrom, dateTo });

      expect(prismaMock.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: dateFrom, lte: dateTo },
          }),
        })
      );
    });

    it('should filter leads by ownerId', async () => {
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.lead.count.mockResolvedValue(0);

      await caller.list({ ownerId: TEST_UUIDS.user1 });

      expect(prismaMock.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ownerId: TEST_UUIDS.user1,
          }),
        })
      );
    });

    it('should filter by source', async () => {
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.lead.count.mockResolvedValue(0);

      await caller.list({ source: ['WEBSITE', 'REFERRAL'] });

      expect(prismaMock.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            source: { in: ['WEBSITE', 'REFERRAL'] },
          }),
        })
      );
    });

    it('should filter by minScore only', async () => {
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.lead.count.mockResolvedValue(0);

      await caller.list({ minScore: 50 });

      expect(prismaMock.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            score: { gte: 50 },
          }),
        })
      );
    });

    it('should filter by maxScore only', async () => {
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.lead.count.mockResolvedValue(0);

      await caller.list({ maxScore: 80 });

      expect(prismaMock.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            score: { lte: 80 },
          }),
        })
      );
    });

    it('should filter by dateFrom only', async () => {
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.lead.count.mockResolvedValue(0);

      const dateFrom = new Date('2025-01-01');
      await caller.list({ dateFrom });

      expect(prismaMock.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: dateFrom },
          }),
        })
      );
    });
  });
});
