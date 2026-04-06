/**
 * Opportunity Router - Won Closure Tests
 *
 * IFC-065: FLOW-009 Deal Won Closure Workflow
 * Tests the moveStage CLOSED_WON path which routes through CloseDealWonUseCase
 */

import { TEST_UUIDS } from '../../../test/setup';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: vi.fn(() => ({
    logAction: vi.fn().mockResolvedValue('audit-id'),
    logBulkOperation: vi.fn().mockResolvedValue('audit-id'),
    logPermissionDenied: vi.fn().mockResolvedValue('audit-id'),
  })),
}));

import { opportunityRouter } from '../opportunity.router';
import { createTestContext, prismaMock } from '../../../test/setup';
import { Result } from '@intelliflow/domain';
import { ValidationError, NotFoundError } from '@intelliflow/application';

/**
 * Create a mock domain opportunity for service responses
 */
const createMockDomainOpportunity = (overrides: Record<string, unknown> = {}) => ({
  id: { value: TEST_UUIDS.opportunity1 },
  name: 'Won Deal',
  value: { amount: 75000, currency: 'USD' },
  probability: { value: 100 },
  stage: 'CLOSED_WON',
  expectedCloseDate: new Date('2026-06-30'),
  accountId: TEST_UUIDS.account1,
  contactId: TEST_UUIDS.contact1,
  ownerId: TEST_UUIDS.user1,
  tenantId: TEST_UUIDS.tenant,
  weightedValue: { amount: 75000, currency: 'USD' },
  isClosed: true,
  isWon: true,
  isLost: false,
  closedAt: new Date(),
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date(),
  getDomainEvents: () => [],
  clearDomainEvents: () => {},
  ...overrides,
});

describe('Opportunity Router - Won Closure (IFC-065)', () => {
  beforeEach(() => {
    // IFC-281: prisma.$extends must return mock so tenantMiddleware produces prismaWithTenant
    (prismaMock.$extends as ReturnType<typeof vi.fn>).mockReturnValue(prismaMock);
  });

  describe('moveStage CLOSED_WON', () => {
    it('should succeed and return mapped opportunity response', async () => {
      const ctx = createTestContext();
      const mockOpp = createMockDomainOpportunity();

      ctx.services!.closeDealWon!.execute = vi.fn().mockResolvedValue(Result.ok(mockOpp));

      const caller = opportunityRouter.createCaller(ctx);
      const result = await caller.moveStage({
        id: TEST_UUIDS.opportunity1,
        targetStage: 'CLOSED_WON',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe(TEST_UUIDS.opportunity1);
      expect(result.stage).toBe('CLOSED_WON');
      expect(ctx.services!.closeDealWon!.execute).toHaveBeenCalledWith({
        opportunityId: TEST_UUIDS.opportunity1,
        closedBy: TEST_UUIDS.user1,
        tenantId: TEST_UUIDS.tenant,
      });
    });

    it('from non-NEGOTIATION stage should return BAD_REQUEST', async () => {
      const ctx = createTestContext();

      ctx.services!.closeDealWon!.execute = vi
        .fn()
        .mockResolvedValue(
          Result.fail(
            new ValidationError(
              'Cannot mark opportunity as won from stage PROSPECTING. Must be in NEGOTIATION stage.'
            )
          )
        );

      const caller = opportunityRouter.createCaller(ctx);
      await expect(
        caller.moveStage({
          id: TEST_UUIDS.opportunity1,
          targetStage: 'CLOSED_WON',
        })
      ).rejects.toThrow('Cannot mark opportunity as won from stage PROSPECTING');
    });

    it('for non-existent opportunity should return NOT_FOUND', async () => {
      const ctx = createTestContext();

      ctx.services!.closeDealWon!.execute = vi
        .fn()
        .mockResolvedValue(
          Result.fail(new NotFoundError(`Opportunity not found: ${TEST_UUIDS.nonExistent}`))
        );

      const caller = opportunityRouter.createCaller(ctx);
      await expect(
        caller.moveStage({
          id: TEST_UUIDS.nonExistent,
          targetStage: 'CLOSED_WON',
        })
      ).rejects.toThrow('Opportunity not found');
    });

    it('should use closedBy from tenant context', async () => {
      const ctx = createTestContext();
      const mockOpp = createMockDomainOpportunity();

      ctx.services!.closeDealWon!.execute = vi.fn().mockResolvedValue(Result.ok(mockOpp));

      const caller = opportunityRouter.createCaller(ctx);
      await caller.moveStage({
        id: TEST_UUIDS.opportunity1,
        targetStage: 'CLOSED_WON',
      });

      const executeCall = (ctx.services!.closeDealWon!.execute as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(executeCall.closedBy).toBe(TEST_UUIDS.user1);
    });

    it('closeDealWon service should be available in context', () => {
      const ctx = createTestContext();
      expect(ctx.services!.closeDealWon).toBeDefined();
    });
  });
});
