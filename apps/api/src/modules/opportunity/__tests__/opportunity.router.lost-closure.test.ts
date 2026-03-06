/**
 * Opportunity Router - Lost Closure Tests
 *
 * IFC-066: FLOW-009 Deal Lost Closure Workflow
 * Tests the moveStage CLOSED_LOST path which routes through CloseDealLostUseCase
 */

import { TEST_UUIDS } from '../../../test/setup';
import { describe, it, expect, vi } from 'vitest';
import { opportunityRouter } from '../opportunity.router';
import { createTestContext } from '../../../test/setup';
import { Result } from '@intelliflow/domain';
import { ValidationError, NotFoundError } from '@intelliflow/application';

/**
 * Create a mock domain opportunity for service responses
 */
const createMockDomainOpportunity = (overrides: Record<string, unknown> = {}) => ({
  id: { value: TEST_UUIDS.opportunity1 },
  name: 'Lost Deal',
  value: { amount: 50000, currency: 'USD' },
  probability: { value: 0 },
  stage: 'CLOSED_LOST',
  expectedCloseDate: new Date('2026-06-30'),
  accountId: TEST_UUIDS.account1,
  contactId: TEST_UUIDS.contact1,
  ownerId: TEST_UUIDS.user1,
  tenantId: TEST_UUIDS.tenant,
  weightedValue: { amount: 0, currency: 'USD' },
  isClosed: true,
  isWon: false,
  isLost: true,
  closedAt: new Date(),
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date(),
  getDomainEvents: () => [],
  clearDomainEvents: () => {},
  ...overrides,
});

describe('Opportunity Router - Lost Closure (IFC-066)', () => {
  describe('moveStage CLOSED_LOST', () => {
    it('should route CLOSED_LOST through closeDealLost.execute and return mapped response', async () => {
      const ctx = createTestContext();
      const mockOpp = createMockDomainOpportunity();

      ctx.services!.closeDealLost!.execute = vi.fn().mockResolvedValue(Result.ok(mockOpp));

      const caller = opportunityRouter.createCaller(ctx);
      const result = await caller.moveStage({
        id: TEST_UUIDS.opportunity1,
        targetStage: 'CLOSED_LOST',
        reason: 'Lost to competitor pricing',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe(TEST_UUIDS.opportunity1);
      expect(result.stage).toBe('CLOSED_LOST');
      expect(ctx.services!.closeDealLost!.execute).toHaveBeenCalledWith({
        opportunityId: TEST_UUIDS.opportunity1,
        reason: 'Lost to competitor pricing',
        closedBy: TEST_UUIDS.user1,
        tenantId: 'test-tenant-id',
      });
    });

    it('should return error when opportunity is already CLOSED_WON', async () => {
      const ctx = createTestContext();

      ctx.services!.closeDealLost!.execute = vi
        .fn()
        .mockResolvedValue(
          Result.fail(new ValidationError('Cannot mark opportunity as lost: already closed as won'))
        );

      const caller = opportunityRouter.createCaller(ctx);
      await expect(
        caller.moveStage({
          id: TEST_UUIDS.opportunity1,
          targetStage: 'CLOSED_LOST',
          reason: 'Lost to competitor pricing',
        })
      ).rejects.toThrow('Cannot mark opportunity as lost');
    });

    it('should return NOT_FOUND for non-existent opportunity', async () => {
      const ctx = createTestContext();

      ctx.services!.closeDealLost!.execute = vi
        .fn()
        .mockResolvedValue(
          Result.fail(new NotFoundError(`Opportunity not found: ${TEST_UUIDS.nonExistent}`))
        );

      const caller = opportunityRouter.createCaller(ctx);
      await expect(
        caller.moveStage({
          id: TEST_UUIDS.nonExistent,
          targetStage: 'CLOSED_LOST',
          reason: 'Budget constraints forced cancellation',
        })
      ).rejects.toThrow('Opportunity not found');
    });

    it('should pass userId from tenant context as closedBy', async () => {
      const ctx = createTestContext();
      const mockOpp = createMockDomainOpportunity();

      ctx.services!.closeDealLost!.execute = vi.fn().mockResolvedValue(Result.ok(mockOpp));

      const caller = opportunityRouter.createCaller(ctx);
      await caller.moveStage({
        id: TEST_UUIDS.opportunity1,
        targetStage: 'CLOSED_LOST',
        reason: 'Lost to competitor pricing',
      });

      const executeCall = (ctx.services!.closeDealLost!.execute as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(executeCall.closedBy).toBe(TEST_UUIDS.user1);
    });

    it('should throw INTERNAL_SERVER_ERROR when closeDealLost service not available', async () => {
      const ctx = createTestContext({
        services: {
          ...createTestContext().services!,
          closeDealLost: undefined as any,
        },
      } as any);

      const caller = opportunityRouter.createCaller(ctx);
      await expect(
        caller.moveStage({
          id: TEST_UUIDS.opportunity1,
          targetStage: 'CLOSED_LOST',
          reason: 'Lost to competitor pricing',
        })
      ).rejects.toThrow('CloseDealLost service not available');
    });

    it('should pass reason from input to execute', async () => {
      const ctx = createTestContext();
      const mockOpp = createMockDomainOpportunity();

      ctx.services!.closeDealLost!.execute = vi.fn().mockResolvedValue(Result.ok(mockOpp));

      const caller = opportunityRouter.createCaller(ctx);
      await caller.moveStage({
        id: TEST_UUIDS.opportunity1,
        targetStage: 'CLOSED_LOST',
        reason: 'Budget constraints forced cancellation',
      });

      const executeCall = (ctx.services!.closeDealLost!.execute as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(executeCall.reason).toBe('Budget constraints forced cancellation');
    });

    it('should reject short reason at input validation level', async () => {
      const ctx = createTestContext();

      const caller = opportunityRouter.createCaller(ctx);
      await expect(
        caller.moveStage({
          id: TEST_UUIDS.opportunity1,
          targetStage: 'CLOSED_LOST',
          reason: 'short',
        })
      ).rejects.toThrow(); // Zod validation rejects reason < 10 chars
    });

    it('closeDealLost service should be available in context', () => {
      const ctx = createTestContext();
      expect(ctx.services!.closeDealLost).toBeDefined();
    });
  });
});
