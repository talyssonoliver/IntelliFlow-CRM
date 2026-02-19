/**
 * Lead Router Additional Tests
 *
 * Supplementary tests to improve coverage for lead.router.ts.
 * Covers uncovered branches: getLeadService null check,
 * bulkConvert, bulkUpdateStatus, bulkArchive, bulkDelete procedures,
 * and edge cases in existing procedures.
 */

import { TEST_UUIDS } from '../../../test/setup';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { leadRouter } from '../lead.router';
import {
  prismaMock,
  createTestContext,
  mockLead,
  mockUser,
  mockContact,
} from '../../../test/setup';

describe('Lead Router - Additional Coverage', () => {
  beforeEach(() => {
    // Reset is handled by setup.ts
  });

  describe('getLeadService null check', () => {
    it('should throw INTERNAL_SERVER_ERROR when lead service is null', async () => {
      const ctx = createTestContext();
      ctx.services = { ...ctx.services, lead: undefined } as any;
      const caller = leadRouter.createCaller(ctx);

      await expect(caller.create({ email: 'test@example.com', source: 'WEBSITE' })).rejects.toThrow(
        expect.objectContaining({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Lead service not available',
        })
      );
    });

    it('should throw INTERNAL_SERVER_ERROR in delete when service is null', async () => {
      const ctx = createTestContext();
      ctx.services = { ...ctx.services, lead: undefined } as any;
      const caller = leadRouter.createCaller(ctx);

      await expect(caller.delete({ id: TEST_UUIDS.lead1 })).rejects.toThrow(
        expect.objectContaining({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Lead service not available',
        })
      );
    });

    it('should throw INTERNAL_SERVER_ERROR in getHotLeads when service is null', async () => {
      const ctx = createTestContext();
      ctx.services = { ...ctx.services, lead: undefined } as any;
      const caller = leadRouter.createCaller(ctx);

      await expect(caller.getHotLeads()).rejects.toThrow(
        expect.objectContaining({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Lead service not available',
        })
      );
    });

    it('should throw INTERNAL_SERVER_ERROR in scoreWithAI when service is null', async () => {
      const ctx = createTestContext();
      ctx.services = { ...ctx.services, lead: undefined } as any;
      const caller = leadRouter.createCaller(ctx);

      await expect(caller.scoreWithAI({ leadId: TEST_UUIDS.lead1 })).rejects.toThrow(
        expect.objectContaining({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Lead service not available',
        })
      );
    });
  });

  describe('bulkConvert', () => {
    it('should convert multiple leads to contacts successfully', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      const mockLeads = [
        { ...mockLead, id: TEST_UUIDS.lead1, status: 'QUALIFIED', tenantId: 'test-tenant-id' },
        {
          ...mockLead,
          id: TEST_UUIDS.lead2,
          status: 'CONTACTED',
          tenantId: 'test-tenant-id',
          email: 'lead2@example.com',
        },
      ];

      // Mock transaction
      (prismaMock as any).$transaction = vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
        const tx = {
          lead: {
            findMany: vi.fn().mockResolvedValue(mockLeads),
            updateMany: vi.fn().mockResolvedValue({ count: 2 }),
          },
          contact: {
            createMany: vi.fn().mockResolvedValue({ count: 2 }),
          },
          account: {
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        };
        return fn(tx);
      });

      const result = await caller.bulkConvert({
        ids: [TEST_UUIDS.lead1, TEST_UUIDS.lead2],
        createAccounts: false,
      });

      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
      expect(result.totalProcessed).toBe(2);
    });

    it('should handle non-existent leads in bulk convert', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      (prismaMock as any).$transaction = vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
        const tx = {
          lead: {
            findMany: vi.fn().mockResolvedValue([]),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          contact: {
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        };
        return fn(tx);
      });

      const result = await caller.bulkConvert({
        ids: [TEST_UUIDS.nonExistent],
        createAccounts: false,
      });

      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toBe('Lead not found');
    });

    it('should skip already converted leads', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      (prismaMock as any).$transaction = vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
        const tx = {
          lead: {
            findMany: vi
              .fn()
              .mockResolvedValue([
                {
                  ...mockLead,
                  id: TEST_UUIDS.lead1,
                  status: 'CONVERTED',
                  tenantId: 'test-tenant-id',
                },
              ]),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          contact: {
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        };
        return fn(tx);
      });

      const result = await caller.bulkConvert({
        ids: [TEST_UUIDS.lead1],
        createAccounts: false,
      });

      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toBe('Lead already converted');
    });

    it('should create accounts when createAccounts is true', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      const mockAccountCreateMany = vi.fn().mockResolvedValue({ count: 1 });

      (prismaMock as any).$transaction = vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
        const tx = {
          lead: {
            findMany: vi
              .fn()
              .mockResolvedValue([
                {
                  ...mockLead,
                  id: TEST_UUIDS.lead1,
                  status: 'QUALIFIED',
                  company: 'ACME Corp',
                  tenantId: 'test-tenant-id',
                },
              ]),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          contact: {
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          account: {
            createMany: mockAccountCreateMany,
          },
        };
        return fn(tx);
      });

      const result = await caller.bulkConvert({
        ids: [TEST_UUIDS.lead1],
        createAccounts: true,
      });

      expect(result.successful).toHaveLength(1);
      expect(mockAccountCreateMany).toHaveBeenCalled();
    });

    it('should handle leads without company when creating accounts', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      const mockAccountCreateMany = vi.fn().mockResolvedValue({ count: 0 });

      (prismaMock as any).$transaction = vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
        const tx = {
          lead: {
            findMany: vi
              .fn()
              .mockResolvedValue([
                {
                  ...mockLead,
                  id: TEST_UUIDS.lead1,
                  status: 'QUALIFIED',
                  company: null,
                  tenantId: 'test-tenant-id',
                },
              ]),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          contact: {
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          account: {
            createMany: mockAccountCreateMany,
          },
        };
        return fn(tx);
      });

      const result = await caller.bulkConvert({
        ids: [TEST_UUIDS.lead1],
        createAccounts: true,
      });

      expect(result.successful).toHaveLength(1);
      // Should NOT create accounts when company is null
      expect(mockAccountCreateMany).not.toHaveBeenCalled();
    });

    it('should handle leads without firstName/lastName/ownerId', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      (prismaMock as any).$transaction = vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
        const tx = {
          lead: {
            findMany: vi
              .fn()
              .mockResolvedValue([
                {
                  ...mockLead,
                  id: TEST_UUIDS.lead1,
                  status: 'NEW',
                  firstName: null,
                  lastName: null,
                  ownerId: null,
                  tenantId: 'test-tenant-id',
                },
              ]),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          contact: {
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return fn(tx);
      });

      const result = await caller.bulkConvert({
        ids: [TEST_UUIDS.lead1],
        createAccounts: false,
      });

      expect(result.successful).toHaveLength(1);
    });
  });

  describe('bulkUpdateStatus', () => {
    it('should update status for multiple leads', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      prismaMock.lead.findMany.mockResolvedValue([
        { id: TEST_UUIDS.lead1 },
        { id: TEST_UUIDS.lead2 },
      ] as any);

      prismaMock.lead.updateMany.mockResolvedValue({ count: 2 } as any);

      const result = await caller.bulkUpdateStatus({
        ids: [TEST_UUIDS.lead1, TEST_UUIDS.lead2],
        status: 'CONTACTED',
      });

      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
      expect(result.totalProcessed).toBe(2);
    });

    it('should handle non-existent leads in bulk status update', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      prismaMock.lead.findMany.mockResolvedValue([{ id: TEST_UUIDS.lead1 }] as any);

      prismaMock.lead.updateMany.mockResolvedValue({ count: 1 } as any);

      const result = await caller.bulkUpdateStatus({
        ids: [TEST_UUIDS.lead1, TEST_UUIDS.nonExistent],
        status: 'CONTACTED',
      });

      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toBe('Lead not found');
    });

    it('should handle empty ids to update', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      prismaMock.lead.findMany.mockResolvedValue([]);

      const result = await caller.bulkUpdateStatus({
        ids: [TEST_UUIDS.nonExistent],
        status: 'CONTACTED',
      });

      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      // updateMany should NOT be called when no existing IDs
      expect(prismaMock.lead.updateMany).not.toHaveBeenCalled();
    });

    it('should handle database error during bulk status update', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      prismaMock.lead.findMany.mockRejectedValue(new Error('Connection lost'));

      const result = await caller.bulkUpdateStatus({
        ids: [TEST_UUIDS.lead1, TEST_UUIDS.lead2],
        status: 'CONTACTED',
      });

      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(2);
      expect(result.failed[0].error).toBe('Connection lost');
    });

    it('should handle non-Error exception during bulk status update', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      prismaMock.lead.findMany.mockRejectedValue('string error');

      const result = await caller.bulkUpdateStatus({
        ids: [TEST_UUIDS.lead1],
        status: 'CONTACTED',
      });

      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toBe('Unknown error');
    });
  });

  describe('bulkArchive', () => {
    it('should archive multiple leads (set to LOST)', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      prismaMock.lead.findMany.mockResolvedValue([
        { id: TEST_UUIDS.lead1 },
        { id: TEST_UUIDS.lead2 },
      ] as any);

      prismaMock.lead.updateMany.mockResolvedValue({ count: 2 } as any);

      const result = await caller.bulkArchive({
        ids: [TEST_UUIDS.lead1, TEST_UUIDS.lead2],
      });

      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
      expect(prismaMock.lead.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'LOST',
          }),
        })
      );
    });

    it('should handle non-existent leads in bulk archive', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      prismaMock.lead.findMany.mockResolvedValue([]);

      const result = await caller.bulkArchive({
        ids: [TEST_UUIDS.nonExistent],
      });

      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toBe('Lead not found');
    });

    it('should handle database error during bulk archive', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      prismaMock.lead.findMany.mockRejectedValue(new Error('DB timeout'));

      const result = await caller.bulkArchive({
        ids: [TEST_UUIDS.lead1],
      });

      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toBe('DB timeout');
    });

    it('should handle non-Error exception during bulk archive', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      prismaMock.lead.findMany.mockRejectedValue(42);

      const result = await caller.bulkArchive({
        ids: [TEST_UUIDS.lead1],
      });

      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toBe('Unknown error');
    });

    it('should handle mix of existing and non-existing leads', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      prismaMock.lead.findMany.mockResolvedValue([{ id: TEST_UUIDS.lead1 }] as any);

      prismaMock.lead.updateMany.mockResolvedValue({ count: 1 } as any);

      const result = await caller.bulkArchive({
        ids: [TEST_UUIDS.lead1, TEST_UUIDS.nonExistent],
      });

      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
    });
  });

  describe('bulkDelete', () => {
    it('should delete multiple leads successfully', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      prismaMock.lead.findMany.mockResolvedValue([
        { id: TEST_UUIDS.lead1 },
        { id: TEST_UUIDS.lead2 },
      ] as any);

      prismaMock.lead.deleteMany.mockResolvedValue({ count: 2 } as any);

      const result = await caller.bulkDelete({
        ids: [TEST_UUIDS.lead1, TEST_UUIDS.lead2],
      });

      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
      expect(result.totalProcessed).toBe(2);
    });

    it('should handle non-existent leads in bulk delete', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      prismaMock.lead.findMany.mockResolvedValue([]);

      const result = await caller.bulkDelete({
        ids: [TEST_UUIDS.nonExistent],
      });

      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toBe('Lead not found');
      // deleteMany should NOT be called when no existing IDs
      expect(prismaMock.lead.deleteMany).not.toHaveBeenCalled();
    });

    it('should handle database error during bulk delete', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      prismaMock.lead.findMany.mockRejectedValue(new Error('Foreign key constraint'));

      const result = await caller.bulkDelete({
        ids: [TEST_UUIDS.lead1, TEST_UUIDS.lead2],
      });

      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(2);
      expect(result.failed[0].error).toBe('Foreign key constraint');
    });

    it('should handle non-Error exception during bulk delete', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      prismaMock.lead.findMany.mockRejectedValue(undefined);

      const result = await caller.bulkDelete({
        ids: [TEST_UUIDS.lead1],
      });

      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toBe('Unknown error');
    });

    it('should handle partial failure where some IDs exist and some do not', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      prismaMock.lead.findMany.mockResolvedValue([{ id: TEST_UUIDS.lead1 }] as any);

      prismaMock.lead.deleteMany.mockResolvedValue({ count: 1 } as any);

      const result = await caller.bulkDelete({
        ids: [TEST_UUIDS.lead1, TEST_UUIDS.nonExistent],
      });

      expect(result.successful).toHaveLength(1);
      expect(result.successful[0]).toBe(TEST_UUIDS.lead1);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].id).toBe(TEST_UUIDS.nonExistent);
    });
  });

  describe('update - phone value object handling', () => {
    it('should extract phone value from phone value object in non-contact update path', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      prismaMock.lead.findUnique.mockResolvedValue(mockLead);
      prismaMock.lead.update.mockResolvedValue({
        ...mockLead,
        status: 'CONTACTED',
      } as any);

      // When status is set (no firstName/lastName/company/title/phone),
      // it goes through the Prisma direct update path
      const result = await caller.update({
        id: TEST_UUIDS.lead1,
        status: 'CONTACTED',
      });

      expect(result.status).toBe('CONTACTED');
    });
  });

  describe('qualify - reason handling', () => {
    it('should pass provided reason to service', async () => {
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
      const caller = leadRouter.createCaller(ctx);

      ctx.services!.lead!.qualifyLead = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainLead,
      });

      await caller.qualify({
        leadId: TEST_UUIDS.lead1,
        reason: 'Custom reason for qualification',
      });

      expect(ctx.services!.lead!.qualifyLead).toHaveBeenCalledWith(
        TEST_UUIDS.lead1,
        expect.any(String),
        'Custom reason for qualification'
      );
    });
  });

  describe('convert - accountName handling', () => {
    it('should pass null accountName when createAccount is false', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      ctx.services!.lead!.convertLead = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: {
          leadId: TEST_UUIDS.lead1,
          contactId: TEST_UUIDS.contact1,
          accountId: null,
          convertedBy: TEST_UUIDS.user1,
          convertedAt: new Date(),
        },
      });

      await caller.convert({
        leadId: TEST_UUIDS.lead1,
        createAccount: false,
        accountName: 'Should not be used',
      });

      expect(ctx.services!.lead!.convertLead).toHaveBeenCalledWith(
        TEST_UUIDS.lead1,
        null, // createAccount is false, so null
        expect.any(String)
      );
    });

    it('should pass null when createAccount is true but no accountName', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      ctx.services!.lead!.convertLead = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: {
          leadId: TEST_UUIDS.lead1,
          contactId: TEST_UUIDS.contact1,
          accountId: TEST_UUIDS.account1,
          convertedBy: TEST_UUIDS.user1,
          convertedAt: new Date(),
        },
      });

      await caller.convert({
        leadId: TEST_UUIDS.lead1,
        createAccount: true,
        // No accountName - should pass null
      });

      expect(ctx.services!.lead!.convertLead).toHaveBeenCalledWith(
        TEST_UUIDS.lead1,
        null,
        expect.any(String)
      );
    });
  });

  describe('stats - average score calculation', () => {
    it('should calculate average score correctly', async () => {
      const ctx = createTestContext();
      const caller = leadRouter.createCaller(ctx);

      prismaMock.lead.count.mockResolvedValue(3);
      (prismaMock.lead.groupBy as any).mockResolvedValue([{ status: 'NEW', _count: 3 }]);
      prismaMock.lead.findMany.mockResolvedValue([
        { score: 60 },
        { score: 80 },
        { score: 100 },
      ] as any);

      const result = await caller.stats();

      // Average = (60+80+100)/3 = 80
      expect(result.averageScore).toBe(80);
    });
  });
});
