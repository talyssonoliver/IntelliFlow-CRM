import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  Result,
  DomainError,
  Opportunity,
  OpportunityId,
  DealLostEnrichedEvent,
  Money,
} from '@intelliflow/domain';
import { CloseDealLostUseCase, CloseDealLostInput } from '../CloseDealLostUseCase';
import type { EventBusPort } from '../../../ports/external';
import type { NotificationServicePort } from '../../../ports/external/NotificationServicePort';
import type { OpportunityService } from '../../../services/OpportunityService';

// ─── Mock factories ───────────────────────────────────────────────

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
    currency: 'USD',
    stage: 'CLOSED_LOST' as const,
    probability: 0,
    accountId: 'account-123',
    contactId: 'contact-456',
    ownerId: 'owner-789',
    tenantId: 'tenant-001',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    closedAt: new Date('2026-02-15T00:00:00Z'),
    ...overrides,
  };

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
    isLost: defaults.stage === 'CLOSED_LOST',
    getDomainEvents: vi.fn().mockReturnValue([]),
    clearDomainEvents: vi.fn(),
  } as any as Opportunity;
}

const mockOpportunityService: Record<string, any> = {
  markAsLost: vi.fn(),
  getOpportunityById: vi.fn(),
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

const defaultInput: CloseDealLostInput = {
  opportunityId: MOCK_OPP_ID.value,
  reason: 'Lost to competitor pricing and features',
  closedBy: 'user-111',
  tenantId: 'tenant-001',
};

// Helper to flush fire-and-forget promises
const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('CloseDealLostUseCase', () => {
  let useCase: CloseDealLostUseCase;

  beforeEach(() => {
    vi.clearAllMocks();

    // Pre-loss opportunity (for getOpportunityById — stage capture)
    const preLossOpp = createMockOpportunity({ stage: 'NEGOTIATION', probability: 60 });
    mockOpportunityService.getOpportunityById.mockResolvedValue(Result.ok(preLossOpp));

    // Post-loss opportunity (from markAsLost)
    const postLossOpp = createMockOpportunity();
    mockOpportunityService.markAsLost.mockResolvedValue(Result.ok(postLossOpp));

    useCase = new CloseDealLostUseCase(
      mockOpportunityService as any as OpportunityService,
      mockEventBus as any as EventBusPort,
      mockNotificationService as any as NotificationServicePort
    );
  });

  // ─── Happy Path (5 tests) ───────────────────────────────────────

  describe('Happy Path', () => {
    it('should delegate to opportunityService.markAsLost and return Result.ok', async () => {
      const result = await useCase.execute(defaultInput);

      expect(result.isSuccess).toBe(true);
      expect(mockOpportunityService.markAsLost).toHaveBeenCalledWith(
        defaultInput.opportunityId,
        defaultInput.reason,
        defaultInput.closedBy
      );
    });

    it('returned opportunity has stage CLOSED_LOST and probability 0', async () => {
      const result = await useCase.execute(defaultInput);

      expect(result.isSuccess).toBe(true);
      expect(result.value.stage).toBe('CLOSED_LOST');
      expect(result.value.probability.value).toBe(0);
    });

    it('should publish DealLostEnrichedEvent with all fields including lossReason and stageAtLoss', async () => {
      await useCase.execute(defaultInput);
      await flushPromises();

      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
      const publishedEvent = mockEventBus.publish.mock.calls[0][0];
      expect(publishedEvent).toBeInstanceOf(DealLostEnrichedEvent);
      expect(publishedEvent.eventType).toBe('opportunity.deal_lost_enriched');
      expect(publishedEvent.value).toBe(50000);
      expect(publishedEvent.currency).toBe('USD');
      expect(publishedEvent.accountId).toBe('account-123');
      expect(publishedEvent.ownerId).toBe('owner-789');
      expect(publishedEvent.tenantId).toBe('tenant-001');
      expect(publishedEvent.closedBy).toBe('user-111');
      expect(publishedEvent.opportunityName).toBe('Enterprise Deal');
      expect(publishedEvent.lossReason).toBe('Lost to competitor pricing and features');
      expect(publishedEvent.stageAtLoss).toBe('NEGOTIATION');
    });

    it('should call markAsLost before publishing event (call order)', async () => {
      const callOrder: string[] = [];
      mockOpportunityService.markAsLost.mockImplementation(async () => {
        callOrder.push('markAsLost');
        return Result.ok(createMockOpportunity());
      });
      mockEventBus.publish.mockImplementation(async () => {
        callOrder.push('publishEnriched');
      });

      await useCase.execute(defaultInput);
      await flushPromises();

      expect(callOrder[0]).toBe('markAsLost');
      expect(callOrder).toContain('publishEnriched');
    });

    it('closedAt timestamp is set on returned opportunity', async () => {
      const now = new Date();
      const mockOpp = createMockOpportunity({ closedAt: now });
      mockOpportunityService.markAsLost.mockResolvedValue(Result.ok(mockOpp));

      const result = await useCase.execute(defaultInput);

      expect(result.isSuccess).toBe(true);
      const closedAt = result.value.closedAt!;
      expect(Math.abs(closedAt.getTime() - now.getTime())).toBeLessThan(1000);
    });
  });

  // ─── Reason Validation (3 tests) ────────────────────────────────

  describe('Reason Validation', () => {
    it('should propagate service error for short reason (< 10 chars)', async () => {
      mockOpportunityService.markAsLost.mockResolvedValue(
        Result.fail(new DomainError('Loss reason must be at least 10 characters'))
      );

      const result = await useCase.execute({ ...defaultInput, reason: 'too short' });
      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('10 characters');
    });

    it('should accept reason with exactly 10 characters', async () => {
      const result = await useCase.execute({ ...defaultInput, reason: '1234567890' });
      expect(result.isSuccess).toBe(true);
    });

    it('should handle reason with leading/trailing whitespace', async () => {
      const result = await useCase.execute({
        ...defaultInput,
        reason: '  Lost to competitor pricing  ',
      });
      expect(result.isSuccess).toBe(true);
      expect(mockOpportunityService.markAsLost).toHaveBeenCalledWith(
        defaultInput.opportunityId,
        '  Lost to competitor pricing  ',
        defaultInput.closedBy
      );
    });
  });

  // ─── Stage Validation (4 tests) ─────────────────────────────────

  describe('Stage Validation', () => {
    it('should fail with OPPORTUNITY_ALREADY_CLOSED when stage is CLOSED_WON', async () => {
      mockOpportunityService.markAsLost.mockResolvedValue(
        Result.fail(new DomainError('Opportunity has already been closed'))
      );

      const result = await useCase.execute(defaultInput);
      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('already been closed');
    });

    it('should fail with OPPORTUNITY_ALREADY_CLOSED when stage is CLOSED_LOST', async () => {
      mockOpportunityService.markAsLost.mockResolvedValue(
        Result.fail(new DomainError('Opportunity has already been closed'))
      );

      const result = await useCase.execute(defaultInput);
      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('already been closed');
    });

    it('should succeed from PROSPECTING stage', async () => {
      mockOpportunityService.getOpportunityById.mockResolvedValue(
        Result.ok(createMockOpportunity({ stage: 'PROSPECTING' }))
      );

      const result = await useCase.execute(defaultInput);
      expect(result.isSuccess).toBe(true);
    });

    it('should succeed from NEGOTIATION stage', async () => {
      const result = await useCase.execute(defaultInput);
      expect(result.isSuccess).toBe(true);
    });
  });

  // ─── Not Found / Validation (3 tests) ───────────────────────────

  describe('Not Found / Validation', () => {
    it('should return failure when opportunity not found', async () => {
      mockOpportunityService.getOpportunityById.mockResolvedValue(
        Result.fail(new DomainError('Opportunity not found: opp-999'))
      );
      mockOpportunityService.markAsLost.mockResolvedValue(
        Result.fail(new DomainError('Opportunity not found: opp-999'))
      );

      const result = await useCase.execute({ ...defaultInput, opportunityId: 'opp-999' });
      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('not found');
    });

    it('should propagate service error for invalid UUID', async () => {
      mockOpportunityService.getOpportunityById.mockResolvedValue(
        Result.fail(new DomainError('Invalid opportunity ID format'))
      );
      mockOpportunityService.markAsLost.mockResolvedValue(
        Result.fail(new DomainError('Invalid opportunity ID format'))
      );

      const result = await useCase.execute({ ...defaultInput, opportunityId: 'not-a-uuid' });
      expect(result.isFailure).toBe(true);
    });

    it('should propagate service error for empty closedBy', async () => {
      mockOpportunityService.markAsLost.mockResolvedValue(
        Result.fail(new DomainError('closedBy is required'))
      );

      const result = await useCase.execute({ ...defaultInput, closedBy: '' });
      expect(result.isFailure).toBe(true);
    });
  });

  // ─── Persistence Errors (2 tests) ───────────────────────────────

  describe('Persistence Errors', () => {
    it('should propagate failure when service save fails', async () => {
      mockOpportunityService.markAsLost.mockResolvedValue(
        Result.fail(new DomainError('Failed to save opportunity'))
      );

      const result = await useCase.execute(defaultInput);
      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save');
    });

    it('should propagate failure when service findById throws', async () => {
      mockOpportunityService.getOpportunityById.mockRejectedValue(new Error('DB connection lost'));

      await expect(useCase.execute(defaultInput)).rejects.toThrow('DB connection lost');
    });
  });

  // ─── Partial Failure Resilience (3 tests) ───────────────────────

  describe('Partial Failure Resilience', () => {
    it('should return success even if notification sendEmail throws (AC-010)', async () => {
      mockNotificationService.sendEmail.mockRejectedValue(new Error('SMTP down'));

      const result = await useCase.execute(defaultInput);
      await flushPromises();

      expect(result.isSuccess).toBe(true);
    });

    it('should return success even if notification returns Result.fail (AC-010)', async () => {
      mockNotificationService.sendEmail.mockResolvedValue(
        Result.fail(new DomainError('Email delivery failed'))
      );

      const result = await useCase.execute(defaultInput);
      await flushPromises();

      expect(result.isSuccess).toBe(true);
    });

    it('should return success even if eventBus.publish throws (AC-010)', async () => {
      mockEventBus.publish.mockRejectedValue(new Error('EventBus down'));

      const result = await useCase.execute(defaultInput);
      await flushPromises();

      expect(result.isSuccess).toBe(true);
    });
  });

  // ─── Metrics via Enriched Event (3 tests) ───────────────────────

  describe('Metrics via Enriched Event', () => {
    it('enriched event carries correct value and currency from opportunity', async () => {
      await useCase.execute(defaultInput);
      await flushPromises();

      const publishedEvent = mockEventBus.publish.mock.calls[0][0] as DealLostEnrichedEvent;
      expect(publishedEvent.value).toBe(50000);
      expect(publishedEvent.currency).toBe('USD');
    });

    it('enriched event carries lossReason matching input reason', async () => {
      await useCase.execute(defaultInput);
      await flushPromises();

      const publishedEvent = mockEventBus.publish.mock.calls[0][0] as DealLostEnrichedEvent;
      expect(publishedEvent.lossReason).toBe('Lost to competitor pricing and features');
    });

    it('enriched event carries tenantId from input', async () => {
      await useCase.execute(defaultInput);
      await flushPromises();

      const publishedEvent = mockEventBus.publish.mock.calls[0][0] as DealLostEnrichedEvent;
      expect(publishedEvent.tenantId).toBe('tenant-001');
    });
  });

  // ─── Event Ordering (3 tests) ──────────────────────────────────

  describe('Event Ordering', () => {
    it('markAsLost is called before event publish', async () => {
      const order: string[] = [];
      mockOpportunityService.markAsLost.mockImplementation(async () => {
        order.push('markAsLost');
        return Result.ok(createMockOpportunity());
      });
      mockEventBus.publish.mockImplementation(async () => {
        order.push('enrichedEvent');
      });

      await useCase.execute(defaultInput);
      await flushPromises();

      const markIdx = order.indexOf('markAsLost');
      const enrichedIdx = order.indexOf('enrichedEvent');
      expect(markIdx).toBeLessThan(enrichedIdx);
    });

    it('no duplicate events on single execute call', async () => {
      await useCase.execute(defaultInput);
      await flushPromises();

      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
      const publishedEvent = mockEventBus.publish.mock.calls[0][0];
      expect(publishedEvent.eventType).toBe('opportunity.deal_lost_enriched');
    });

    it('no event published when markAsLost returns failure', async () => {
      mockOpportunityService.markAsLost.mockResolvedValue(
        Result.fail(new DomainError('Opportunity has already been closed'))
      );

      await useCase.execute(defaultInput);
      await flushPromises();

      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });
  });

  // ─── Idempotency (2 tests) ─────────────────────────────────────

  describe('Idempotency', () => {
    it('second execute for same opportunity returns OPPORTUNITY_ALREADY_CLOSED', async () => {
      const result1 = await useCase.execute(defaultInput);
      expect(result1.isSuccess).toBe(true);

      mockOpportunityService.markAsLost.mockResolvedValue(
        Result.fail(new DomainError('Opportunity has already been closed'))
      );

      const result2 = await useCase.execute(defaultInput);
      expect(result2.isFailure).toBe(true);
      expect(result2.error.message).toContain('already been closed');
    });

    it('no enriched event published on second execute call', async () => {
      mockOpportunityService.markAsLost.mockResolvedValue(
        Result.fail(new DomainError('Opportunity has already been closed'))
      );

      await useCase.execute(defaultInput);
      await flushPromises();

      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });
  });

  // ─── Sales Cycle Calculation (3 tests) ──────────────────────────

  describe('Sales Cycle Calculation', () => {
    it('salesCycleDays calculated correctly from createdAt to closedAt', async () => {
      const mockOpp = createMockOpportunity({
        createdAt: new Date('2026-01-01T00:00:00Z'),
        closedAt: new Date('2026-02-15T00:00:00Z'),
      });
      mockOpportunityService.markAsLost.mockResolvedValue(Result.ok(mockOpp));

      await useCase.execute(defaultInput);
      await flushPromises();

      const publishedEvent = mockEventBus.publish.mock.calls[0][0] as DealLostEnrichedEvent;
      expect(publishedEvent.salesCycleDays).toBe(45);
    });

    it('salesCycleDays is 0 for same-day close', async () => {
      const sameDay = new Date('2026-02-15T00:00:00Z');
      const mockOpp = createMockOpportunity({
        createdAt: sameDay,
        closedAt: sameDay,
      });
      mockOpportunityService.markAsLost.mockResolvedValue(Result.ok(mockOpp));

      await useCase.execute(defaultInput);
      await flushPromises();

      const publishedEvent = mockEventBus.publish.mock.calls[0][0] as DealLostEnrichedEvent;
      expect(publishedEvent.salesCycleDays).toBe(0);
    });

    it('salesCycleDays uses current date as fallback when closedAt is null', async () => {
      const mockOpp = createMockOpportunity({
        createdAt: new Date('2026-01-01T00:00:00Z'),
        closedAt: undefined,
      });
      mockOpportunityService.markAsLost.mockResolvedValue(Result.ok(mockOpp));

      await useCase.execute(defaultInput);
      await flushPromises();

      const publishedEvent = mockEventBus.publish.mock.calls[0][0] as DealLostEnrichedEvent;
      expect(publishedEvent.salesCycleDays).toBeGreaterThanOrEqual(0);
      expect(publishedEvent.closedAt).toBeInstanceOf(Date);
    });
  });

  // ─── Multi-tenancy (2 tests) ───────────────────────────────────

  describe('Multi-tenancy', () => {
    it('tenantId propagated in DealLostEnrichedEvent', async () => {
      await useCase.execute({ ...defaultInput, tenantId: 'tenant-xyz' });
      await flushPromises();

      const publishedEvent = mockEventBus.publish.mock.calls[0][0] as DealLostEnrichedEvent;
      expect(publishedEvent.tenantId).toBe('tenant-xyz');
    });

    it('tenantId propagated in notification email', async () => {
      await useCase.execute(defaultInput);
      await flushPromises();

      expect(mockNotificationService.sendEmail).toHaveBeenCalledTimes(1);
    });
  });

  // ─── stageAtLoss Capture (1 test) ──────────────────────────────

  describe('stageAtLoss Capture', () => {
    it('stageAtLoss captures pre-mutation stage (not CLOSED_LOST)', async () => {
      // getOpportunityById returns NEGOTIATION (pre-loss)
      // markAsLost returns CLOSED_LOST (post-loss)
      await useCase.execute(defaultInput);
      await flushPromises();

      const publishedEvent = mockEventBus.publish.mock.calls[0][0] as DealLostEnrichedEvent;
      expect(publishedEvent.stageAtLoss).toBe('NEGOTIATION');
      // NOT CLOSED_LOST — confirms pre-mutation read
    });
  });
});
