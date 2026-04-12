/**
 * PrismaOpportunityRepository Tenant Isolation Tests
 *
 * IFC-281 AC-001, AC-002:
 * Repository-level tenant filtering — verifies that findById and delete
 * correctly scope queries to the requesting tenant.
 *
 * AC-001: findById(id, tenantId) returns the opportunity only when the tenantId matches.
 * AC-002: delete(id, tenantId) succeeds only when the tenantId matches (deleteMany returns count > 0).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaOpportunityRepository } from '../PrismaOpportunityRepository';

// ─── Mock Prisma client ─────────────────────────────────────────────────────

const createMockPrismaClient = () => ({
  opportunity: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
    aggregate: vi.fn(),
  },
});

type MockPrismaClient = ReturnType<typeof createMockPrismaClient>;

// ─── Shared test data ───────────────────────────────────────────────────────

const TENANT_A = 'tenant-aaaa-0000-0000-000000000001';
const TENANT_B = 'tenant-bbbb-0000-0000-000000000002';
const OPP_ID = '00000000-0000-4000-8000-000000000099';

/** Minimal Prisma opportunity record sufficient for reconstituteOpportunity */
const createMockRecord = (tenantId: string) => ({
  id: OPP_ID,
  name: 'Test Opportunity',
  value: { toNumber: () => 50000 } as any, // Decimal-like
  stage: 'PROPOSAL',
  probability: 60,
  expectedCloseDate: new Date('2025-12-31'),
  description: null,
  accountId: '00000000-0000-4000-8000-000000000010',
  contactId: null,
  ownerId: '00000000-0000-4000-8000-000000000011',
  tenantId,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  closedAt: null,
  sourceLeadId: null,
  deletedAt: null,
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('PrismaOpportunityRepository — Tenant Isolation (IFC-281 AC-001/AC-002)', () => {
  let repo: PrismaOpportunityRepository;
  let mockPrisma: MockPrismaClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrismaClient();
    repo = new PrismaOpportunityRepository(mockPrisma as any);
  });

  // ── AC-001: findById ──────────────────────────────────────────────────────

  describe('findById()', () => {
    it('should return the opportunity when tenantId matches (tenant-A)', async () => {
      const record = createMockRecord(TENANT_A);
      // Repository calls prisma.opportunity.findFirst with { id, tenantId, deletedAt: null }
      mockPrisma.opportunity.findFirst.mockResolvedValue(record);

      const idResult = await import('@intelliflow/domain').then(({ OpportunityId }) =>
        OpportunityId.create(OPP_ID)
      );
      if (idResult.isFailure) throw new Error('Invalid test UUID');

      const result = await repo.findById(idResult.value, TENANT_A);

      expect(result).not.toBeNull();
      expect(result!.tenantId).toBe(TENANT_A);
      expect(mockPrisma.opportunity.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: OPP_ID,
            tenantId: TENANT_A,
          }),
        })
      );
    });

    it('should return null when tenantId does not match (tenant-B request for tenant-A record)', async () => {
      // Prisma returns null because the WHERE clause includes tenantId: TENANT_B
      // but the record belongs to TENANT_A — the DB row is simply not found.
      mockPrisma.opportunity.findFirst.mockResolvedValue(null);

      const idResult = await import('@intelliflow/domain').then(({ OpportunityId }) =>
        OpportunityId.create(OPP_ID)
      );
      if (idResult.isFailure) throw new Error('Invalid test UUID');

      const result = await repo.findById(idResult.value, TENANT_B);

      expect(result).toBeNull();
      expect(mockPrisma.opportunity.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: OPP_ID,
            tenantId: TENANT_B,
          }),
        })
      );
    });

    it('should return the opportunity when no tenantId is provided (backward compat)', async () => {
      const record = createMockRecord(TENANT_A);
      mockPrisma.opportunity.findFirst.mockResolvedValue(record);

      const idResult = await import('@intelliflow/domain').then(({ OpportunityId }) =>
        OpportunityId.create(OPP_ID)
      );
      if (idResult.isFailure) throw new Error('Invalid test UUID');

      // No tenantId — repository should NOT add tenantId to WHERE clause
      const result = await repo.findById(idResult.value);

      expect(result).not.toBeNull();
      // The call should not include tenantId in the where clause
      expect(mockPrisma.opportunity.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ tenantId: expect.anything() }),
        })
      );
    });
  });

  // ── AC-002: delete ────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('should succeed when tenantId matches (count: 1)', async () => {
      mockPrisma.opportunity.deleteMany.mockResolvedValue({ count: 1 });

      const idResult = await import('@intelliflow/domain').then(({ OpportunityId }) =>
        OpportunityId.create(OPP_ID)
      );
      if (idResult.isFailure) throw new Error('Invalid test UUID');

      // Should not throw
      await expect(repo.delete(idResult.value, TENANT_A)).resolves.toBeUndefined();

      expect(mockPrisma.opportunity.deleteMany).toHaveBeenCalledWith({
        where: { id: OPP_ID, tenantId: TENANT_A },
      });
    });

    it('should throw when tenantId does not match (count: 0)', async () => {
      // Prisma deletes 0 rows because the WHERE { id, tenantId: TENANT_B } matched nothing
      mockPrisma.opportunity.deleteMany.mockResolvedValue({ count: 0 });

      const idResult = await import('@intelliflow/domain').then(({ OpportunityId }) =>
        OpportunityId.create(OPP_ID)
      );
      if (idResult.isFailure) throw new Error('Invalid test UUID');

      await expect(repo.delete(idResult.value, TENANT_B)).rejects.toThrow(
        /Opportunity not found or tenant mismatch/
      );

      expect(mockPrisma.opportunity.deleteMany).toHaveBeenCalledWith({
        where: { id: OPP_ID, tenantId: TENANT_B },
      });
    });
  });
});
