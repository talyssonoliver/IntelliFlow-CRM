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

      expect(result.id).toBe(TEST_UUIDS.lead1);
      expect(result.email).toBe(mockLead.email);
      expect(ctx.services!.lead!.getLeadById).toHaveBeenCalledWith(TEST_UUIDS.lead1);
    });

    it('should throw NOT_FOUND for non-existent lead', async () => {
      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.getLeadById = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'NOT_FOUND_ERROR', message: `Lead not found: ${TEST_UUIDS.nonExistent}` },
      });

      await expect(callerWithService.getById({ id: TEST_UUIDS.nonExistent })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
          message: expect.stringContaining('not found'),
        })
      );
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

      expect(result.leads).toHaveLength(2);
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
    it('should update lead with valid data', async () => {
      // Mock Lead domain entity for update response
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

      // Mock LeadService.updateLeadContactInfo for contact info updates
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

    it('should throw NOT_FOUND when updating non-existent lead', async () => {
      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      // Mock LeadService.updateLeadContactInfo returning not found error
      ctx.services!.lead!.updateLeadContactInfo = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Lead not found' },
      });

      await expect(
        callerWithService.update({ id: TEST_UUIDS.nonExistent, firstName: 'Test' })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
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
        callerWithService.qualify({ leadId: TEST_UUIDS.nonExistent, reason: 'Good fit for our product' })
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

      await expect(callerWithService.scoreWithAI({ leadId: TEST_UUIDS.nonExistent })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });
  });

  describe('stats', () => {
    it('should return lead statistics', async () => {
      const mockStats = {
        total: 100,
        byStatus: {
          NEW: 30,
          QUALIFIED: 25,
          CONVERTED: 20,
        },
        averageScore: 72.5,
        hotLeads: 15,
        warmLeads: 35,
        coldLeads: 50,
      };

      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.getLeadStatistics = vi.fn().mockResolvedValue(mockStats);

      const result = await callerWithService.stats();

      expect(result.total).toBe(100);
      expect(result.byStatus).toEqual({
        NEW: 30,
        QUALIFIED: 25,
        CONVERTED: 20,
      });
      expect(result.averageScore).toBe(72.5);
    });

    it('should handle zero average score', async () => {
      const mockStats = {
        total: 0,
        byStatus: {},
        averageScore: 0,
        hotLeads: 0,
        warmLeads: 0,
        coldLeads: 0,
      };

      const ctx = createTestContext();
      const callerWithService = leadRouter.createCaller(ctx);

      ctx.services!.lead!.getLeadStatistics = vi.fn().mockResolvedValue(mockStats);

      const result = await callerWithService.stats();

      expect(result.total).toBe(0);
      expect(result.averageScore).toBe(0);
    });
  });
});
