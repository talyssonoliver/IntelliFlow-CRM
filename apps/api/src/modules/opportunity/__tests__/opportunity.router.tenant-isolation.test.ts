/**
 * Opportunity Router Tenant Isolation Tests
 *
 * IFC-281 AC-003, AC-004, AC-005:
 * Cross-tenant access denial at the API layer.
 *
 * When OpportunityService.updateOpportunity / deleteOpportunity / changeStage
 * receives a wrong tenantId, the service calls repository.findById(id, tenantId)
 * which returns null (the opportunity belongs to a different tenant), so the
 * service returns a NOT_FOUND_ERROR — and the router must translate that to a
 * TRPCError with code NOT_FOUND.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TEST_UUIDS, createTestContext, prismaMock } from '../../../test/setup';

vi.mock('../../security/audit-logger', () => ({
  getAuditLogger: vi.fn(() => ({
    logAction: vi.fn().mockResolvedValue('audit-id'),
    logBulkOperation: vi.fn().mockResolvedValue('audit-id'),
    logPermissionDenied: vi.fn().mockResolvedValue('audit-id'),
  })),
}));

import { opportunityRouter } from '../opportunity.router';

// ─── Helpers ───────────────────────────────────────────────────────────────

const createMockDomainOpportunity = (overrides: Record<string, unknown> = {}) => ({
  id: { value: TEST_UUIDS.opportunity1 },
  name: 'Big Deal',
  value: { amount: 50000, currency: 'GBP' },
  probability: { value: 60 },
  stage: 'PROPOSAL',
  expectedCloseDate: new Date('2025-06-30'),
  accountId: TEST_UUIDS.account1,
  contactId: TEST_UUIDS.contact1,
  ownerId: TEST_UUIDS.user1,
  tenantId: TEST_UUIDS.tenant,
  weightedValue: { amount: 30000, currency: 'GBP' },
  isClosed: false,
  isWon: false,
  isLost: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  getDomainEvents: () => [],
  clearDomainEvents: () => {},
  ...overrides,
});

const NOT_FOUND_FAILURE = {
  isSuccess: false,
  isFailure: true,
  error: { code: 'NOT_FOUND_ERROR', message: 'Opportunity not found or tenant mismatch' },
};

const successResult = (opp = createMockDomainOpportunity()) => ({
  isSuccess: true,
  isFailure: false,
  value: opp,
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Opportunity Router — Tenant Isolation (IFC-281 AC-003/AC-004/AC-005)', () => {
  const ctx = createTestContext();
  const caller = opportunityRouter.createCaller(ctx);

  beforeEach(() => {
    // Make prisma.$extends return the same mock so tenantMiddleware works in tests
    (prismaMock.$extends as ReturnType<typeof vi.fn>).mockReturnValue(prismaMock);
  });

  // ── AC-003: update ───────────────────────────────────────────────────────

  describe('update — cross-tenant access denial', () => {
    it('should return NOT_FOUND when service receives wrong tenantId', async () => {
      // Service returns NOT_FOUND because repository.findById returned null for wrong tenant
      ctx.services!.opportunity!.updateOpportunity = vi.fn().mockResolvedValue(NOT_FOUND_FAILURE);

      await expect(
        caller.update({ id: TEST_UUIDS.opportunity1, name: 'Tampered Name' })
      ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));

      expect(ctx.services!.opportunity!.updateOpportunity).toHaveBeenCalled();
    });

    it('should succeed when service receives correct tenantId', async () => {
      const mockDomainOpp = createMockDomainOpportunity({ name: 'Updated Name' });
      ctx.services!.opportunity!.updateOpportunity = vi
        .fn()
        .mockResolvedValue(successResult(mockDomainOpp));

      const result = await caller.update({ id: TEST_UUIDS.opportunity1, name: 'Updated Name' });

      expect(result.name).toBe('Updated Name');
      expect(ctx.services!.opportunity!.updateOpportunity).toHaveBeenCalled();
    });
  });

  // ── AC-004: delete ───────────────────────────────────────────────────────

  describe('delete — cross-tenant access denial', () => {
    it('should return NOT_FOUND when service receives wrong tenantId', async () => {
      // Service returns NOT_FOUND because the opportunity was not found in the requesting tenant
      ctx.services!.opportunity!.deleteOpportunity = vi.fn().mockResolvedValue(NOT_FOUND_FAILURE);

      await expect(caller.delete({ id: TEST_UUIDS.opportunity1 })).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' })
      );

      expect(ctx.services!.opportunity!.deleteOpportunity).toHaveBeenCalledWith(
        TEST_UUIDS.opportunity1,
        TEST_UUIDS.tenant
      );
    });

    it('should succeed when service receives correct tenantId', async () => {
      ctx.services!.opportunity!.deleteOpportunity = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: undefined,
      });

      const result = await caller.delete({ id: TEST_UUIDS.opportunity1 });

      expect(result.success).toBe(true);
      expect(result.id).toBe(TEST_UUIDS.opportunity1);
    });
  });

  // ── AC-005: moveStage ────────────────────────────────────────────────────

  describe('moveStage — cross-tenant access denial', () => {
    it('should return NOT_FOUND when service receives wrong tenantId', async () => {
      // Pre-mutation stage lookup — return null to simulate unknown opportunity in this tenant
      prismaMock.opportunity.findUnique.mockResolvedValue(null);
      // changeStage service returns NOT_FOUND for wrong tenant
      ctx.services!.opportunity!.changeStage = vi.fn().mockResolvedValue(NOT_FOUND_FAILURE);

      await expect(
        caller.moveStage({ id: TEST_UUIDS.opportunity1, targetStage: 'NEGOTIATION' })
      ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));

      expect(ctx.services!.opportunity!.changeStage).toHaveBeenCalled();
    });

    it('should succeed when service receives correct tenantId', async () => {
      const mockDomainOpp = createMockDomainOpportunity({
        stage: 'NEGOTIATION',
        probability: { value: 80 },
      });
      // Pre-mutation stage lookup
      prismaMock.opportunity.findUnique.mockResolvedValue({ stage: 'PROPOSAL' } as any);
      ctx.services!.opportunity!.changeStage = vi
        .fn()
        .mockResolvedValue(successResult(mockDomainOpp));

      const result = await caller.moveStage({
        id: TEST_UUIDS.opportunity1,
        targetStage: 'NEGOTIATION',
      });

      expect(result.stage).toBe('NEGOTIATION');
      expect(ctx.services!.opportunity!.changeStage).toHaveBeenCalledWith(
        TEST_UUIDS.opportunity1,
        'NEGOTIATION',
        expect.any(String),
        expect.any(String)
      );
    });
  });
});
