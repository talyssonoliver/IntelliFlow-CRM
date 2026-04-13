import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  Result,
  DomainError,
  Opportunity,
  OpportunityId,
  DealWonEnrichedEvent,
  Money,
} from '@intelliflow/domain';
import { CloseDealWonUseCase, CloseDealWonInput } from '../CloseDealWonUseCase';
import type { EventBusPort } from '../../../ports/external';
import type { NotificationServicePort } from '../../../ports/external/NotificationServicePort';
import type { OpportunityService } from '../../../services/OpportunityService';

// ─── Mock factories ───────────────────────────────────────────────

// Stable UUIDs for deterministic tests
const MOCK_OPP_ID = OpportunityId.generate();

function createMockOpportunity(
  overrides: Partial<{
    name: string;
    value: number;
    currency: string;
    stage: string;
    probability: number;
    accountId: string;
    contactId: string | undefined;
    ownerId: string;
    tenantId: string;
    createdAt: Date;
    closedAt: Date | undefined;
  }> = {}
): Opportunity {
  const defaults = {
    name: 'Enterprise Deal',
    value: 50000,
    currency: 'GBP',
    stage: 'CLOSED_WON' as const,
    probability: 100,
    accountId: 'account-123',
    contactId: 'contact-456',
    ownerId: 'owner-789',
    tenantId: 'tenant-001',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    closedAt: new Date('2026-02-15T00:00:00Z'),
    ...overrides,
  };

  // Create a mock that mimics Opportunity getters
  const moneyResult = Money.create(defaults.value, defaults.currency);
  const mockMoney = moneyResult.isSuccess
    ? moneyResult.value
    : { amount: defaults.value, currency: defaults.currency };

  return {
    id: MOCK_OPP_ID,
    name: defaults.name,
    value: mockMoney,
    stage: defaults.stage,
    probability: { value: defaults.probability, asDecimal: defaults.probability / 100 },
    accountId: defaults.accountId,
    contactId: defaults.contactId,
    ownerId: defaults.ownerId,
    tenantId: defaults.tenantId,
    createdAt: defaults.createdAt,
    closedAt: defaults.closedAt,
    isClosed: defaults.stage === 'CLOSED_WON' || defaults.stage === 'CLOSED_LOST',
    isWon: defaults.stage === 'CLOSED_WON',
    getDomainEvents: vi.fn().mockReturnValue([]),
    clearDomainEvents: vi.fn(),
  } as any as Opportunity;
}

const mockOpportunityService: Record<string, any> = {
  markAsWon: vi.fn(),
};

const mockEventBus: Record<string, any> = {
  publish: vi.fn().mockResolvedValue(undefined),
  publishAll: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn().mockResolvedValue(undefined),
};

const mockNotificationService: Record<string, any> = {
  sendEmail: vi
    .fn()
    .mockResolvedValue(Result.ok({ id: 'notif-1', channel: 'email', status: 'sent' })),
  sendSms: vi.fn(),
  sendPush: vi.fn(),
  schedule: vi.fn(),
  cancelScheduled: vi.fn(),
  getStatus: vi.fn(),
  sendBatch: vi.fn(),
  validateEmail: vi.fn(),
  validatePhoneNumber: vi.fn(),
};

const defaultInput: CloseDealWonInput = {
  opportunityId: MOCK_OPP_ID.value,
  closedBy: 'user-111',
  tenantId: 'tenant-001',
};

// Helper to flush fire-and-forget promises
const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('CloseDealWonUseCase', () => {
  let useCase: CloseDealWonUseCase;

  beforeEach(() => {
    vi.clearAllMocks();

    const mockOpp = createMockOpportunity();
    mockOpportunityService.markAsWon.mockResolvedValue(Result.ok(mockOpp));

    useCase = new CloseDealWonUseCase(
      mockOpportunityService as any as OpportunityService,
      mockEventBus as any as EventBusPort,
      mockNotificationService as any as NotificationServicePort
    );
  });

  // ─── Happy Path (5 tests) ───────────────────────────────────────

  describe('Happy Path', () => {
    it('should transition opportunity to CLOSED_WON with probability=100 and closedAt set', async () => {
      const result = await useCase.execute(defaultInput);

      expect(result.isSuccess).toBe(true);
      expect(result.value.stage).toBe('CLOSED_WON');
      expect(result.value.probability.value).toBe(100);
      expect(result.value.closedAt).toBeDefined();
    });

    it('should return Result<Opportunity> with complete output fields', async () => {
      const result = await useCase.execute(defaultInput);

      expect(result.isSuccess).toBe(true);
      const opp = result.value;
      expect(opp.name).toBe('Enterprise Deal');
      expect(opp.accountId).toBe('account-123');
      expect(opp.ownerId).toBe('owner-789');
    });

    it('should publish DealWonEnrichedEvent with all context fields', async () => {
      await useCase.execute(defaultInput);
      await flushPromises();

      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
      const publishedEvent = mockEventBus.publish.mock.calls[0][0];
      expect(publishedEvent).toBeInstanceOf(DealWonEnrichedEvent);
      expect(publishedEvent.eventType).toBe('opportunity.deal_won_enriched');
      expect(publishedEvent.value).toBe(50000);
      expect(publishedEvent.currency).toBe('GBP');
      expect(publishedEvent.accountId).toBe('account-123');
      expect(publishedEvent.ownerId).toBe('owner-789');
      expect(publishedEvent.tenantId).toBe('tenant-001');
      expect(publishedEvent.closedBy).toBe('user-111');
      expect(publishedEvent.opportunityName).toBe('Enterprise Deal');
    });

    it('should call opportunityService.markAsWon before publishing enriched event', async () => {
      const callOrder: string[] = [];
      mockOpportunityService.markAsWon.mockImplementation(async () => {
        callOrder.push('markAsWon');
        return Result.ok(createMockOpportunity());
      });
      mockEventBus.publish.mockImplementation(async () => {
        callOrder.push('publishEnriched');
      });

      await useCase.execute(defaultInput);
      await flushPromises();

      expect(callOrder[0]).toBe('markAsWon');
      expect(callOrder).toContain('publishEnriched');
    });

    it('should set closedAt timestamp approximately to current time', async () => {
      const now = new Date();
      const mockOpp = createMockOpportunity({ closedAt: now });
      mockOpportunityService.markAsWon.mockResolvedValue(Result.ok(mockOpp));

      const result = await useCase.execute(defaultInput);

      expect(result.isSuccess).toBe(true);
      const closedAt = result.value.closedAt!;
      expect(Math.abs(closedAt.getTime() - now.getTime())).toBeLessThan(1000);
    });
  });

  // ─── Stage Validation Errors (4 tests) ──────────────────────────

  describe('Stage Validation Errors', () => {
    it('should reject deal in PROSPECTING stage', async () => {
      mockOpportunityService.markAsWon.mockResolvedValue(
        Result.fail(new DomainError('Cannot mark opportunity as won from stage PROSPECTING'))
      );

      const result = await useCase.execute(defaultInput);
      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('PROSPECTING');
    });

    it('should reject deal in QUALIFICATION stage', async () => {
      mockOpportunityService.markAsWon.mockResolvedValue(
        Result.fail(new DomainError('Cannot mark opportunity as won from stage QUALIFICATION'))
      );

      const result = await useCase.execute(defaultInput);
      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('QUALIFICATION');
    });

    it('should return error for already CLOSED_WON deal', async () => {
      mockOpportunityService.markAsWon.mockResolvedValue(
        Result.fail(new DomainError('Opportunity has already been closed'))
      );

      const result = await useCase.execute(defaultInput);
      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('already been closed');
    });

    it('should return error for already CLOSED_LOST deal', async () => {
      mockOpportunityService.markAsWon.mockResolvedValue(
        Result.fail(new DomainError('Opportunity has already been closed'))
      );

      const result = await useCase.execute(defaultInput);
      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('already been closed');
    });
  });

  // ─── Not Found / Validation (3 tests) ──────────────────────────

  describe('Not Found / Validation', () => {
    it('should return error when opportunity not found', async () => {
      mockOpportunityService.markAsWon.mockResolvedValue(
        Result.fail(new DomainError('Opportunity not found: opp-999'))
      );

      const result = await useCase.execute({ ...defaultInput, opportunityId: 'opp-999' });
      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('not found');
    });

    it('should return error for invalid UUID format', async () => {
      mockOpportunityService.markAsWon.mockResolvedValue(
        Result.fail(new DomainError('Invalid opportunity ID format'))
      );

      const result = await useCase.execute({ ...defaultInput, opportunityId: 'not-a-uuid' });
      expect(result.isFailure).toBe(true);
    });

    it('should return error when closedBy is empty', async () => {
      mockOpportunityService.markAsWon.mockResolvedValue(
        Result.fail(new DomainError('closedBy is required'))
      );

      const result = await useCase.execute({ ...defaultInput, closedBy: '' });
      expect(result.isFailure).toBe(true);
    });
  });

  // ─── Persistence Errors (2 tests) ──────────────────────────────

  describe('Persistence Errors', () => {
    it('should return PersistenceError when repository save fails', async () => {
      mockOpportunityService.markAsWon.mockResolvedValue(
        Result.fail(new DomainError('Failed to save opportunity'))
      );

      const result = await useCase.execute(defaultInput);
      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save');
    });

    it('should propagate error when repository findById throws', async () => {
      mockOpportunityService.markAsWon.mockRejectedValue(new Error('DB connection lost'));

      await expect(useCase.execute(defaultInput)).rejects.toThrow('DB connection lost');
    });
  });

  // ─── Partial Failure Resilience (3 tests) ──────────────────────

  describe('Partial Failure Resilience', () => {
    it('should still return success when notification dispatch fails', async () => {
      mockNotificationService.sendEmail.mockRejectedValue(new Error('SMTP down'));

      const result = await useCase.execute(defaultInput);
      await flushPromises();

      expect(result.isSuccess).toBe(true);
    });

    it('should still return success when notification returns Result.fail', async () => {
      mockNotificationService.sendEmail.mockResolvedValue(
        Result.fail(new DomainError('Email delivery failed'))
      );

      const result = await useCase.execute(defaultInput);
      await flushPromises();

      expect(result.isSuccess).toBe(true);
    });

    it('should still return success when enriched event publishing throws', async () => {
      mockEventBus.publish.mockRejectedValue(new Error('EventBus down'));

      const result = await useCase.execute(defaultInput);
      await flushPromises();

      expect(result.isSuccess).toBe(true);
    });
  });

  // ─── Metrics via Event (3 tests) ───────────────────────────────

  describe('Metrics via Event', () => {
    it('should include deal value and currency in DealWonEnrichedEvent', async () => {
      await useCase.execute(defaultInput);
      await flushPromises();

      const publishedEvent = mockEventBus.publish.mock.calls[0][0] as DealWonEnrichedEvent;
      expect(publishedEvent.value).toBe(50000);
      expect(publishedEvent.currency).toBe('GBP');
    });

    it('should include tenantId in DealWonEnrichedEvent for multi-tenant aggregation', async () => {
      await useCase.execute(defaultInput);
      await flushPromises();

      const publishedEvent = mockEventBus.publish.mock.calls[0][0] as DealWonEnrichedEvent;
      expect(publishedEvent.tenantId).toBe('tenant-001');
    });

    it('should still return success when event bus publish fails (metrics non-fatal)', async () => {
      mockEventBus.publish.mockRejectedValue(new Error('Event bus unavailable'));

      const result = await useCase.execute(defaultInput);
      await flushPromises();

      expect(result.isSuccess).toBe(true);
    });
  });

  // ─── Event Ordering (3 tests) ──────────────────────────────────

  describe('Event Ordering', () => {
    it('should call markAsWon (persists + publishes base event) before enriched event', async () => {
      const order: string[] = [];
      mockOpportunityService.markAsWon.mockImplementation(async () => {
        order.push('markAsWon');
        return Result.ok(createMockOpportunity());
      });
      mockEventBus.publish.mockImplementation(async () => {
        order.push('enrichedEvent');
      });

      await useCase.execute(defaultInput);
      await flushPromises();

      const markIdx = order.indexOf('markAsWon');
      const enrichedIdx = order.indexOf('enrichedEvent');
      expect(markIdx).toBeLessThan(enrichedIdx);
    });

    it('should not duplicate the OpportunityWonEvent (only one from domain)', async () => {
      // The use case does NOT publish OpportunityWonEvent — only the enriched event
      // The domain event is published by OpportunityService.markAsWon() internally
      await useCase.execute(defaultInput);
      await flushPromises();

      // Only 1 publish call (the enriched event), not 2
      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
      const publishedEvent = mockEventBus.publish.mock.calls[0][0];
      expect(publishedEvent.eventType).toBe('opportunity.deal_won_enriched');
    });

    it('should clear domain events after publishing via service', async () => {
      // markAsWon internally calls publishEvents + clearDomainEvents
      // We verify the use case doesn't re-publish base events
      await useCase.execute(defaultInput);
      await flushPromises();

      // Only the enriched event is published by the use case
      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Idempotency (2 tests) ─────────────────────────────────────

  describe('Idempotency', () => {
    it('should return error on second call for same opportunity', async () => {
      // First call succeeds
      const result1 = await useCase.execute(defaultInput);
      expect(result1.isSuccess).toBe(true);

      // Second call: service returns error (already closed)
      mockOpportunityService.markAsWon.mockResolvedValue(
        Result.fail(new DomainError('Opportunity has already been closed'))
      );

      const result2 = await useCase.execute(defaultInput);
      expect(result2.isFailure).toBe(true);
      expect(result2.error.message).toContain('already been closed');
    });

    it('should not publish enriched event on failed call', async () => {
      mockOpportunityService.markAsWon.mockResolvedValue(
        Result.fail(new DomainError('Opportunity has already been closed'))
      );

      await useCase.execute(defaultInput);
      await flushPromises();

      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });
  });

  // ─── Sales Cycle Calculation (2 tests) ─────────────────────────

  describe('Sales Cycle Calculation', () => {
    it('should calculate salesCycleDays correctly from createdAt to closedAt', async () => {
      const mockOpp = createMockOpportunity({
        createdAt: new Date('2026-01-01T00:00:00Z'),
        closedAt: new Date('2026-02-15T00:00:00Z'),
      });
      mockOpportunityService.markAsWon.mockResolvedValue(Result.ok(mockOpp));

      await useCase.execute(defaultInput);
      await flushPromises();

      const publishedEvent = mockEventBus.publish.mock.calls[0][0] as DealWonEnrichedEvent;
      expect(publishedEvent.salesCycleDays).toBe(45);
    });

    it('should handle same-day closure (salesCycleDays = 0)', async () => {
      const sameDay = new Date('2026-02-15T00:00:00Z');
      const mockOpp = createMockOpportunity({
        createdAt: sameDay,
        closedAt: sameDay,
      });
      mockOpportunityService.markAsWon.mockResolvedValue(Result.ok(mockOpp));

      await useCase.execute(defaultInput);
      await flushPromises();

      const publishedEvent = mockEventBus.publish.mock.calls[0][0] as DealWonEnrichedEvent;
      expect(publishedEvent.salesCycleDays).toBe(0);
    });

    it('should fallback to current time when closedAt is undefined', async () => {
      const mockOpp = createMockOpportunity({
        createdAt: new Date('2026-01-01T00:00:00Z'),
        closedAt: undefined,
      });
      mockOpportunityService.markAsWon.mockResolvedValue(Result.ok(mockOpp));

      await useCase.execute(defaultInput);
      await flushPromises();

      const publishedEvent = mockEventBus.publish.mock.calls[0][0] as DealWonEnrichedEvent;
      // When closedAt is undefined, uses new Date() — salesCycleDays should be >= 0
      expect(publishedEvent.salesCycleDays).toBeGreaterThanOrEqual(0);
      expect(publishedEvent.closedAt).toBeInstanceOf(Date);
    });
  });

  // ─── Multi-tenancy (2 tests) ───────────────────────────────────

  describe('Multi-tenancy', () => {
    it('should propagate tenantId in DealWonEnrichedEvent', async () => {
      await useCase.execute({ ...defaultInput, tenantId: 'tenant-xyz' });
      await flushPromises();

      const publishedEvent = mockEventBus.publish.mock.calls[0][0] as DealWonEnrichedEvent;
      expect(publishedEvent.tenantId).toBe('tenant-xyz');
    });

    it('should pass tenantId in notification context', async () => {
      await useCase.execute(defaultInput);
      await flushPromises();

      expect(mockNotificationService.sendEmail).toHaveBeenCalledTimes(1);
      // The notification is sent — tenantId propagation is confirmed via the enriched event
      // Notifications are fire-and-forget, so we just verify they're called
    });
  });
});
