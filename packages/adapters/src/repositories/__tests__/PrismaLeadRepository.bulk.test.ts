/**
 * PrismaLeadRepository Bulk Operations Tests
 *
 * Tests for the IFC-007 bulk operations: bulkUpdateStatus, bulkDelete, bulkConvert.
 * These methods are not covered by the existing PrismaLeadRepository.test.ts
 * which covers: save, findById, findByEmail, findByOwnerId, findByStatus,
 * findByMinScore, delete, existsByEmail, countByStatus, findForScoring.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaLeadRepository } from '../PrismaLeadRepository';

// Mock Prisma client with $transaction support
const createMockPrisma = () => {
  const client = {
    lead: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      updateMany: vi.fn(),
    },
    contact: {
      createMany: vi.fn(),
    },
    account: {
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return client;
};

type MockPrisma = ReturnType<typeof createMockPrisma>;

describe('PrismaLeadRepository - Bulk Operations (IFC-007)', () => {
  let repo: PrismaLeadRepository;
  let mockPrisma: MockPrisma;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    repo = new PrismaLeadRepository(mockPrisma as any);
  });

  // ============================================
  // bulkUpdateStatus
  // ============================================
  describe('bulkUpdateStatus()', () => {
    it('should update status for existing leads', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([{ id: 'lead-1' }, { id: 'lead-2' }]);
      mockPrisma.lead.updateMany.mockResolvedValue({ count: 2 });

      const result = await repo.bulkUpdateStatus(['lead-1', 'lead-2'], 'CONTACTED', 'user-1');

      expect(result.successful).toEqual(['lead-1', 'lead-2']);
      expect(result.failed).toEqual([]);

      expect(mockPrisma.lead.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['lead-1', 'lead-2'] } },
        data: {
          status: 'CONTACTED',
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should report non-existent leads as failed', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([{ id: 'lead-1' }]);
      mockPrisma.lead.updateMany.mockResolvedValue({ count: 1 });

      const result = await repo.bulkUpdateStatus(['lead-1', 'lead-missing'], 'QUALIFIED', 'user-1');

      expect(result.successful).toEqual(['lead-1']);
      expect(result.failed).toEqual([{ id: 'lead-missing', error: 'Lead not found' }]);
    });

    it('should handle all leads not found', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([]);

      const result = await repo.bulkUpdateStatus(
        ['lead-missing-1', 'lead-missing-2'],
        'CONTACTED',
        'user-1'
      );

      expect(result.successful).toEqual([]);
      expect(result.failed).toHaveLength(2);
      expect(result.failed[0].error).toBe('Lead not found');
      expect(result.failed[1].error).toBe('Lead not found');
      // updateMany should not be called since no valid IDs
      expect(mockPrisma.lead.updateMany).not.toHaveBeenCalled();
    });

    it('should handle database error during update', async () => {
      mockPrisma.lead.findMany.mockRejectedValue(new Error('DB connection failed'));

      const result = await repo.bulkUpdateStatus(['lead-1', 'lead-2'], 'CONTACTED', 'user-1');

      expect(result.successful).toEqual([]);
      expect(result.failed).toHaveLength(2);
      expect(result.failed[0].error).toBe('DB connection failed');
      expect(result.failed[1].error).toBe('DB connection failed');
    });

    it('should handle error during updateMany after successful findMany', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([{ id: 'lead-1' }]);
      mockPrisma.lead.updateMany.mockRejectedValue(new Error('Write failed'));

      const result = await repo.bulkUpdateStatus(['lead-1'], 'CONTACTED', 'user-1');

      expect(result.successful).toEqual([]);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toBe('Write failed');
    });

    it('should not duplicate failed entries on error when some were already marked as not found', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([{ id: 'lead-1' }]);
      mockPrisma.lead.updateMany.mockRejectedValue(new Error('Update failed'));

      const result = await repo.bulkUpdateStatus(['lead-1', 'lead-missing'], 'CONTACTED', 'user-1');

      // lead-missing should be "Lead not found", lead-1 should be "Update failed"
      expect(result.failed).toHaveLength(2);
      const failedIds = result.failed.map((f) => f.id);
      expect(failedIds).toContain('lead-1');
      expect(failedIds).toContain('lead-missing');
    });

    it('should handle empty ids array', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([]);

      const result = await repo.bulkUpdateStatus([], 'CONTACTED', 'user-1');

      expect(result.successful).toEqual([]);
      expect(result.failed).toEqual([]);
    });

    it('should handle non-Error exceptions', async () => {
      mockPrisma.lead.findMany.mockRejectedValue('string error');

      const result = await repo.bulkUpdateStatus(['lead-1'], 'CONTACTED', 'user-1');

      expect(result.failed[0].error).toBe('Unknown error');
    });
  });

  // ============================================
  // bulkDelete
  // ============================================
  describe('bulkDelete()', () => {
    it('should delete existing leads', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([{ id: 'lead-1' }, { id: 'lead-2' }]);
      mockPrisma.lead.deleteMany.mockResolvedValue({ count: 2 });

      const result = await repo.bulkDelete(['lead-1', 'lead-2']);

      expect(result.successful).toEqual(['lead-1', 'lead-2']);
      expect(result.failed).toEqual([]);

      expect(mockPrisma.lead.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['lead-1', 'lead-2'] } },
      });
    });

    it('should report non-existent leads as failed', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([{ id: 'lead-1' }]);
      mockPrisma.lead.deleteMany.mockResolvedValue({ count: 1 });

      const result = await repo.bulkDelete(['lead-1', 'lead-gone']);

      expect(result.successful).toEqual(['lead-1']);
      expect(result.failed).toEqual([{ id: 'lead-gone', error: 'Lead not found' }]);
    });

    it('should handle all leads not found', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([]);

      const result = await repo.bulkDelete(['lead-gone-1', 'lead-gone-2']);

      expect(result.successful).toEqual([]);
      expect(result.failed).toHaveLength(2);
      expect(mockPrisma.lead.deleteMany).not.toHaveBeenCalled();
    });

    it('should handle database error during delete', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([{ id: 'lead-1' }]);
      mockPrisma.lead.deleteMany.mockRejectedValue(new Error('Foreign key constraint violation'));

      const result = await repo.bulkDelete(['lead-1']);

      expect(result.successful).toEqual([]);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toBe('Foreign key constraint violation');
    });

    it('should handle findMany throwing an error', async () => {
      mockPrisma.lead.findMany.mockRejectedValue(new Error('Connection lost'));

      const result = await repo.bulkDelete(['lead-1', 'lead-2']);

      expect(result.successful).toEqual([]);
      expect(result.failed).toHaveLength(2);
      expect(result.failed[0].error).toBe('Connection lost');
    });

    it('should handle non-Error exceptions', async () => {
      mockPrisma.lead.findMany.mockRejectedValue(42);

      const result = await repo.bulkDelete(['lead-1']);

      expect(result.failed[0].error).toBe('Unknown error');
    });

    it('should handle empty ids array', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([]);

      const result = await repo.bulkDelete([]);

      expect(result.successful).toEqual([]);
      expect(result.failed).toEqual([]);
    });
  });

  // ============================================
  // bulkConvert
  // ============================================
  describe('bulkConvert()', () => {
    const mockLeads = [
      {
        id: 'lead-1',
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Doe',
        company: 'Acme Corp',
        title: 'CTO',
        phone: '+15550100',
        tenantId: 'tenant-1',
        ownerId: 'owner-1',
        status: 'QUALIFIED',
      },
      {
        id: 'lead-2',
        email: 'jane@example.com',
        firstName: null,
        lastName: null,
        company: null,
        title: null,
        phone: null,
        tenantId: 'tenant-1',
        ownerId: null,
        status: 'NEW',
      },
    ];

    it('should convert leads to contacts in a transaction', async () => {
      const txClient = {
        lead: {
          findMany: vi.fn().mockResolvedValue(mockLeads),
          updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
        contact: {
          createMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
        account: {
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };

      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(txClient));

      const result = await repo.bulkConvert(['lead-1', 'lead-2'], false, 'user-1');

      expect(result.successful).toEqual(['lead-1', 'lead-2']);
      expect(result.failed).toEqual([]);

      // Status updated to CONVERTED
      expect(txClient.lead.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['lead-1', 'lead-2'] } },
        data: {
          status: 'CONVERTED',
          updatedAt: expect.any(Date),
        },
      });

      // Contacts created
      expect(txClient.contact.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            email: 'john@example.com',
            firstName: 'John',
            lastName: 'Doe',
          }),
          expect.objectContaining({
            email: 'jane@example.com',
            firstName: 'Unknown',
            lastName: 'Unknown',
          }),
        ]),
        skipDuplicates: true,
      });
    });

    it('should create accounts when createAccounts is true', async () => {
      const txClient = {
        lead: {
          findMany: vi.fn().mockResolvedValue(mockLeads),
          updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
        contact: {
          createMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
        account: {
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };

      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(txClient));

      await repo.bulkConvert(['lead-1', 'lead-2'], true, 'user-1');

      // Only lead-1 has a company
      expect(txClient.account.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            name: 'Acme Corp',
            tenantId: 'tenant-1',
            ownerId: 'owner-1',
          }),
        ],
        skipDuplicates: true,
      });
    });

    it('should not create accounts when createAccounts is false', async () => {
      const txClient = {
        lead: {
          findMany: vi.fn().mockResolvedValue(mockLeads),
          updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
        contact: {
          createMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
        account: {
          createMany: vi.fn(),
        },
      };

      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(txClient));

      await repo.bulkConvert(['lead-1', 'lead-2'], false, 'user-1');

      expect(txClient.account.createMany).not.toHaveBeenCalled();
    });

    it('should skip already converted leads', async () => {
      const leadsWithConverted = [{ ...mockLeads[0], status: 'CONVERTED' }, mockLeads[1]];

      const txClient = {
        lead: {
          findMany: vi.fn().mockResolvedValue(leadsWithConverted),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        contact: {
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        account: {
          createMany: vi.fn(),
        },
      };

      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(txClient));

      const result = await repo.bulkConvert(['lead-1', 'lead-2'], false, 'user-1');

      expect(result.successful).toEqual(['lead-2']);
      expect(result.failed).toEqual([{ id: 'lead-1', error: 'Lead already converted' }]);
    });

    it('should report non-existent leads as failed', async () => {
      const txClient = {
        lead: {
          findMany: vi.fn().mockResolvedValue([mockLeads[0]]),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        contact: {
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        account: {
          createMany: vi.fn(),
        },
      };

      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(txClient));

      const result = await repo.bulkConvert(['lead-1', 'lead-missing'], false, 'user-1');

      expect(result.successful).toEqual(['lead-1']);
      expect(result.failed).toEqual([{ id: 'lead-missing', error: 'Lead not found' }]);
    });

    it('should return early when all leads are already converted', async () => {
      const allConverted = [
        { ...mockLeads[0], status: 'CONVERTED' },
        { ...mockLeads[1], status: 'CONVERTED' },
      ];

      const txClient = {
        lead: {
          findMany: vi.fn().mockResolvedValue(allConverted),
          updateMany: vi.fn(),
        },
        contact: {
          createMany: vi.fn(),
        },
        account: {
          createMany: vi.fn(),
        },
      };

      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(txClient));

      const result = await repo.bulkConvert(['lead-1', 'lead-2'], false, 'user-1');

      expect(result.successful).toEqual([]);
      expect(result.failed).toHaveLength(2);
      expect(txClient.lead.updateMany).not.toHaveBeenCalled();
      expect(txClient.contact.createMany).not.toHaveBeenCalled();
    });

    it('should use userId as ownerId fallback when lead has no ownerId', async () => {
      const leadNoOwner = [{ ...mockLeads[1], ownerId: null }];

      const txClient = {
        lead: {
          findMany: vi.fn().mockResolvedValue(leadNoOwner),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        contact: {
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        account: {
          createMany: vi.fn(),
        },
      };

      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(txClient));

      await repo.bulkConvert(['lead-2'], false, 'user-converter');

      expect(txClient.contact.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            ownerId: 'user-converter',
            createdBy: 'user-converter',
          }),
        ]),
        skipDuplicates: true,
      });
    });

    it('should use "Unknown" for null firstName and lastName', async () => {
      const leadNoNames = [
        { ...mockLeads[1] }, // firstName and lastName are null
      ];

      const txClient = {
        lead: {
          findMany: vi.fn().mockResolvedValue(leadNoNames),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        contact: {
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        account: {
          createMany: vi.fn(),
        },
      };

      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(txClient));

      await repo.bulkConvert(['lead-2'], false, 'user-1');

      expect(txClient.contact.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            firstName: 'Unknown',
            lastName: 'Unknown',
          }),
        ]),
        skipDuplicates: true,
      });
    });

    it('should not create accounts when no leads have companies', async () => {
      const leadsNoCompany = [{ ...mockLeads[1] }]; // company is null

      const txClient = {
        lead: {
          findMany: vi.fn().mockResolvedValue(leadsNoCompany),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        contact: {
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        account: {
          createMany: vi.fn(),
        },
      };

      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(txClient));

      await repo.bulkConvert(['lead-2'], true, 'user-1');

      // createAccounts is true but no leads have company
      expect(txClient.account.createMany).not.toHaveBeenCalled();
    });

    it('should handle empty ids array', async () => {
      const txClient = {
        lead: {
          findMany: vi.fn().mockResolvedValue([]),
          updateMany: vi.fn(),
        },
        contact: {
          createMany: vi.fn(),
        },
        account: {
          createMany: vi.fn(),
        },
      };

      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(txClient));

      const result = await repo.bulkConvert([], false, 'user-1');

      expect(result.successful).toEqual([]);
      expect(result.failed).toEqual([]);
    });

    it('should propagate transaction errors', async () => {
      mockPrisma.$transaction.mockRejectedValue(new Error('Transaction failed'));

      await expect(repo.bulkConvert(['lead-1'], false, 'user-1')).rejects.toThrow(
        'Transaction failed'
      );
    });
  });
});
