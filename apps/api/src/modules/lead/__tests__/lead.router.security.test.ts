/**
 * IFC-237 — Lead Router Security: Tenant Isolation & Domain Bypass
 *
 * Tests verifying:
 * - S2: scoreWithAI fire-and-forget uses prismaWithTenant (not ctx.prisma)
 * - S3: logActivity transaction uses prismaWithTenant.$transaction
 * - S4: bulkUpdateStatus validates via Lead.changeStatus() domain model
 * - S9: getHotLeads/getReadyForQualification include tenantId in WHERE
 * - Auxiliary: addNote, bulkArchive, createNotification all use prismaWithTenant
 * - T-011: Static analysis — zero ctx.prisma outside allowed user lookup
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { leadRouter } from '../lead.router';
import {
  prismaMock,
  createTestContext,
  createAdminContext,
  mockLead,
  TEST_UUIDS,
} from '../../../test/setup';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Mock notifications module — must return a real Promise for .catch() chaining
vi.mock('../../notifications/notifications.router', () => ({
  createNotification: vi.fn(() => Promise.resolve({})),
}));

// Mock lead-insight-deriver
vi.mock('../../../shared/lead-insight-deriver', () => ({
  deriveLeadInsights: vi.fn(() => ({
    summary: 'test',
    strengths: ['a'],
    weaknesses: ['b'],
    recommendations: ['c'],
    nextBestAction: 'follow up',
    engagementLevel: 'medium',
    conversionProbability: 0.5,
    estimatedDealSize: null,
    idealContactFrequency: 'weekly',
    riskFactors: [],
  })),
}));

// Mock score bias detection
vi.mock('@intelliflow/adapters', () => ({
  detectScoreBias: vi.fn().mockResolvedValue(null),
}));

describe('Lead Router Security — Tenant Isolation (IFC-237)', () => {
  beforeEach(() => {
    // setup.ts handles mock resets
  });

  describe('T-001: scoreWithAI uses prismaWithTenant for fire-and-forget', () => {
    it('should use prismaWithTenant for lead lookup and insight upsert in IIFE', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      // Mock LeadService.scoreLead
      ctx.services!.lead!.scoreLead = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: {
          leadId: TEST_UUIDS.lead1,
          previousScore: 50,
          newScore: 85,
          confidence: 0.9,
          tier: 'hot',
          autoQualified: false,
          autoDisqualified: false,
        },
      });

      // Mock prismaWithTenant operations used in the fire-and-forget IIFE
      prismaMock.lead.findUnique.mockResolvedValue(mockLead as any);
      prismaMock.leadAIInsight.upsert.mockResolvedValue({} as any);
      prismaMock.leadActivity.create.mockResolvedValue({} as any);

      await caller.scoreWithAI({ leadId: TEST_UUIDS.lead1 });

      // Wait for fire-and-forget IIFE to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // The fire-and-forget uses prismaWithTenant (which in tests is the same prismaMock)
      // Verify that lead.findUnique was called (via prismaWithTenant, not ctx.prisma separately)
      expect(prismaMock.lead.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TEST_UUIDS.lead1 },
        })
      );
    });
  });

  describe('T-002: logActivity uses prismaWithTenant.$transaction', () => {
    it('should use prismaWithTenant for the transaction', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      // Mock lead lookup
      prismaMock.lead.findUnique.mockResolvedValue(mockLead as any);

      // Mock transaction
      prismaMock.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          leadActivity: {
            create: vi.fn().mockResolvedValue({
              id: 'activity-1',
              type: 'EMAIL',
              title: 'Sent email',
              description: '',
              timestamp: new Date(),
              userName: 'test@example.com',
              leadId: TEST_UUIDS.lead1,
              tenantId: TEST_UUIDS.tenant,
            }),
          },
          lead: {
            update: vi.fn().mockResolvedValue(mockLead),
          },
        };
        return fn(tx);
      });

      const result = await caller.logActivity({
        leadId: TEST_UUIDS.lead1,
        type: 'EMAIL',
        title: 'Sent email',
      });

      // prismaWithTenant.$transaction was called (same mock in tests)
      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('T-003: logActivity — cross-tenant lead update rejected by WHERE', () => {
    it('should include tenant WHERE clause in lead.update within transaction', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      prismaMock.lead.findUnique.mockResolvedValue(mockLead as any);

      let capturedUpdateArgs: any;
      prismaMock.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          leadActivity: {
            create: vi.fn().mockResolvedValue({
              id: 'activity-1',
              type: 'EMAIL',
              title: 'Test',
              description: '',
              timestamp: new Date(),
              userName: 'test@example.com',
              leadId: TEST_UUIDS.lead1,
              tenantId: TEST_UUIDS.tenant,
            }),
          },
          lead: {
            update: vi.fn().mockImplementation((args: any) => {
              capturedUpdateArgs = args;
              return Promise.resolve(mockLead);
            }),
          },
        };
        return fn(tx);
      });

      await caller.logActivity({
        leadId: TEST_UUIDS.lead1,
        type: 'EMAIL',
        title: 'Test activity',
      });

      // Verify the WHERE clause includes tenant scoping via createTenantWhereClause
      expect(capturedUpdateArgs).toBeDefined();
      expect(capturedUpdateArgs.where).toHaveProperty('id', TEST_UUIDS.lead1);
      // For USER role, createTenantWhereClause adds ownerId filter
      expect(capturedUpdateArgs.where).toHaveProperty('ownerId');
    });
  });

  describe('T-004: bulkUpdateStatus — converted lead rejected', () => {
    it('should reject converted leads with LeadAlreadyConvertedError', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      const convertedLead = {
        ...mockLead,
        id: TEST_UUIDS.lead1,
        status: 'CONVERTED',
        score: 90,
      };

      prismaMock.lead.findMany.mockResolvedValue([convertedLead] as any);

      const result = await caller.bulkUpdateStatus({
        ids: [TEST_UUIDS.lead1],
        status: 'QUALIFIED',
      });

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toContain('already been converted');
      expect(result.successful).toHaveLength(0);
    });
  });

  describe('T-005: bulkUpdateStatus — non-converted leads update successfully', () => {
    it('should update non-converted leads and return them in successful[]', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      const activeLead = {
        ...mockLead,
        id: TEST_UUIDS.lead1,
        status: 'NEW',
        score: 50,
      };

      prismaMock.lead.findMany.mockResolvedValue([activeLead] as any);
      prismaMock.lead.updateMany.mockResolvedValue({ count: 1 } as any);
      prismaMock.leadActivity.createMany.mockResolvedValue({ count: 1 } as any);

      const result = await caller.bulkUpdateStatus({
        ids: [TEST_UUIDS.lead1],
        status: 'CONTACTED',
      });

      expect(result.successful).toContain(TEST_UUIDS.lead1);
      expect(result.failed).toHaveLength(0);
    });
  });

  describe('T-006: bulkUpdateStatus — mixed valid/converted partition', () => {
    it('should correctly partition successful and failed leads', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      const leads = [
        { ...mockLead, id: TEST_UUIDS.lead1, status: 'NEW', score: 50 },
        { ...mockLead, id: TEST_UUIDS.lead2, status: 'CONVERTED', score: 90 },
      ];

      prismaMock.lead.findMany.mockResolvedValue(leads as any);
      prismaMock.lead.updateMany.mockResolvedValue({ count: 1 } as any);
      prismaMock.leadActivity.createMany.mockResolvedValue({ count: 1 } as any);

      const result = await caller.bulkUpdateStatus({
        ids: [TEST_UUIDS.lead1, TEST_UUIDS.lead2],
        status: 'QUALIFIED',
      });

      expect(result.successful).toContain(TEST_UUIDS.lead1);
      expect(result.successful).not.toContain(TEST_UUIDS.lead2);
      expect(result.failed).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: TEST_UUIDS.lead2,
            error: expect.stringContaining('already been converted'),
          }),
        ])
      );
    });
  });

  describe('T-007: getHotLeads includes tenantId in WHERE', () => {
    it('should pass tenantId in the query where clause', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      prismaMock.lead.findMany.mockResolvedValue([]);

      await caller.getHotLeads();

      expect(prismaMock.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TEST_UUIDS.tenant,
          }),
        })
      );
    });
  });

  describe('T-008: getReadyForQualification includes tenantId in WHERE', () => {
    it('should pass tenantId in the query where clause', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      prismaMock.lead.findMany.mockResolvedValue([]);

      await caller.getReadyForQualification();

      expect(prismaMock.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TEST_UUIDS.tenant,
          }),
        })
      );
    });
  });

  describe('T-009: getHotLeads as ADMIN — still scoped to tenant', () => {
    it('should include tenantId even for ADMIN role', async () => {
      const ctx = createAdminContext();
      const caller = leadRouter.createCaller(ctx);

      prismaMock.lead.findMany.mockResolvedValue([]);

      await caller.getHotLeads();

      expect(prismaMock.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TEST_UUIDS.tenant,
          }),
        })
      );
    });
  });

  describe('T-010: addNote uses prismaWithTenant for leadNote.create', () => {
    it('should create note via prismaWithTenant', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      prismaMock.lead.findUnique.mockResolvedValue(mockLead as any);
      prismaMock.leadNote.create.mockResolvedValue({
        id: 'note-1',
        content: 'Test note',
        author: 'test@example.com',
        leadId: TEST_UUIDS.lead1,
        tenantId: TEST_UUIDS.tenant,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await caller.addNote({
        leadId: TEST_UUIDS.lead1,
        content: 'Test note',
      });

      // prismaWithTenant.leadNote.create was called (same mock in tests)
      expect(prismaMock.leadNote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            leadId: TEST_UUIDS.lead1,
            tenantId: TEST_UUIDS.tenant,
          }),
        })
      );
      expect(result).toBeDefined();
    });
  });

  describe('T-011: Static analysis — no ctx.prisma in lead.router.ts except user lookup', () => {
    it('should have zero ctx.prisma usages apart from the allowed user lookup', () => {
      const routerSource = readFileSync(
        resolve(__dirname, '../lead.router.ts'),
        'utf-8'
      );

      // Find all ctx.prisma occurrences
      const matches = routerSource.match(/ctx\.prisma\b/g) ?? [];

      // Only allowed occurrence: ctx.prisma.user.findMany for cross-tenant user lookup in stats
      const allowedPatternCount = (
        routerSource.match(/ctx\.prisma\.user\.findMany/g) ?? []
      ).length;

      expect(matches.length).toBe(allowedPatternCount);
      expect(allowedPatternCount).toBe(1);
    });
  });
});
