import { describe, it, expect } from 'vitest';
import {
  OpportunityCreatedEvent,
  OpportunityStageChangedEvent,
  OpportunityValueUpdatedEvent,
  OpportunityWonEvent,
  OpportunityLostEvent,
  OpportunityProbabilityUpdatedEvent,
  OpportunityCloseDateChangedEvent,
  DealWonEnrichedEvent,
  DealLostEnrichedEvent,
} from '../OpportunityEvents';
import { OpportunityId } from '../OpportunityId';

describe('OpportunityCreatedEvent', () => {
  it('should create event with correct payload', () => {
    const opportunityId = OpportunityId.generate();
    const event = new OpportunityCreatedEvent(
      opportunityId,
      'Enterprise Deal',
      500000,
      'account-123',
      'owner-456'
    );

    expect(event.eventType).toBe('opportunity.created');
    expect(event.opportunityId).toBe(opportunityId);
    expect(event.name).toBe('Enterprise Deal');
    expect(event.value).toBe(500000);
    expect(event.accountId).toBe('account-123');
    expect(event.ownerId).toBe('owner-456');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const opportunityId = OpportunityId.generate();
    const event = new OpportunityCreatedEvent(
      opportunityId,
      'Enterprise Deal',
      500000,
      'account-123',
      'owner-456'
    );
    const payload = event.toPayload();

    expect(payload.opportunityId).toBe(opportunityId.value);
    expect(payload.name).toBe('Enterprise Deal');
    expect(payload.value).toBe(500000);
    expect(payload.accountId).toBe('account-123');
    expect(payload.ownerId).toBe('owner-456');
  });
});

describe('OpportunityStageChangedEvent', () => {
  it('should create event with stage change', () => {
    const opportunityId = OpportunityId.generate();
    const event = new OpportunityStageChangedEvent(
      opportunityId,
      'QUALIFICATION',
      'NEEDS_ANALYSIS',
      'user-123'
    );

    expect(event.eventType).toBe('opportunity.stage_changed');
    expect(event.opportunityId).toBe(opportunityId);
    expect(event.previousStage).toBe('QUALIFICATION');
    expect(event.newStage).toBe('NEEDS_ANALYSIS');
    expect(event.changedBy).toBe('user-123');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const opportunityId = OpportunityId.generate();
    const event = new OpportunityStageChangedEvent(
      opportunityId,
      'QUALIFICATION',
      'NEEDS_ANALYSIS',
      'user-123'
    );
    const payload = event.toPayload();

    expect(payload.opportunityId).toBe(opportunityId.value);
    expect(payload.previousStage).toBe('QUALIFICATION');
    expect(payload.newStage).toBe('NEEDS_ANALYSIS');
    expect(payload.changedBy).toBe('user-123');
  });
});

describe('OpportunityValueUpdatedEvent', () => {
  it('should create event with value change', () => {
    const opportunityId = OpportunityId.generate();
    const event = new OpportunityValueUpdatedEvent(opportunityId, 500000, 750000, 'user-123');

    expect(event.eventType).toBe('opportunity.value_updated');
    expect(event.opportunityId).toBe(opportunityId);
    expect(event.previousValue).toBe(500000);
    expect(event.newValue).toBe(750000);
    expect(event.updatedBy).toBe('user-123');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const opportunityId = OpportunityId.generate();
    const event = new OpportunityValueUpdatedEvent(opportunityId, 500000, 750000, 'user-123');
    const payload = event.toPayload();

    expect(payload.opportunityId).toBe(opportunityId.value);
    expect(payload.previousValue).toBe(500000);
    expect(payload.newValue).toBe(750000);
    expect(payload.updatedBy).toBe('user-123');
  });
});

describe('OpportunityWonEvent', () => {
  it('should create event when opportunity is won', () => {
    const opportunityId = OpportunityId.generate();
    const event = new OpportunityWonEvent(opportunityId, 750000, 'user-123');

    expect(event.eventType).toBe('opportunity.won');
    expect(event.opportunityId).toBe(opportunityId);
    expect(event.value).toBe(750000);
    expect(event.closedBy).toBe('user-123');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const opportunityId = OpportunityId.generate();
    const event = new OpportunityWonEvent(opportunityId, 750000, 'user-123');
    const payload = event.toPayload();

    expect(payload.opportunityId).toBe(opportunityId.value);
    expect(payload.value).toBe(750000);
    expect(payload.closedBy).toBe('user-123');
  });
});

describe('OpportunityLostEvent', () => {
  it('should create event when opportunity is lost', () => {
    const opportunityId = OpportunityId.generate();
    const event = new OpportunityLostEvent(
      opportunityId,
      'Competitor pricing was lower',
      'user-123'
    );

    expect(event.eventType).toBe('opportunity.lost');
    expect(event.opportunityId).toBe(opportunityId);
    expect(event.reason).toBe('Competitor pricing was lower');
    expect(event.closedBy).toBe('user-123');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const opportunityId = OpportunityId.generate();
    const event = new OpportunityLostEvent(
      opportunityId,
      'Competitor pricing was lower',
      'user-123'
    );
    const payload = event.toPayload();

    expect(payload.opportunityId).toBe(opportunityId.value);
    expect(payload.reason).toBe('Competitor pricing was lower');
    expect(payload.closedBy).toBe('user-123');
  });
});

describe('OpportunityProbabilityUpdatedEvent', () => {
  it('should create event with probability change', () => {
    const opportunityId = OpportunityId.generate();
    const event = new OpportunityProbabilityUpdatedEvent(opportunityId, 50, 75, 'user-123');

    expect(event.eventType).toBe('opportunity.probability_updated');
    expect(event.opportunityId).toBe(opportunityId);
    expect(event.previousProbability).toBe(50);
    expect(event.newProbability).toBe(75);
    expect(event.updatedBy).toBe('user-123');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const opportunityId = OpportunityId.generate();
    const event = new OpportunityProbabilityUpdatedEvent(opportunityId, 50, 75, 'user-123');
    const payload = event.toPayload();

    expect(payload.opportunityId).toBe(opportunityId.value);
    expect(payload.previousProbability).toBe(50);
    expect(payload.newProbability).toBe(75);
    expect(payload.updatedBy).toBe('user-123');
  });
});

describe('OpportunityCloseDateChangedEvent', () => {
  it('should create event with initial close date (no previous)', () => {
    const opportunityId = OpportunityId.generate();
    const newDate = new Date('2025-03-31');
    const event = new OpportunityCloseDateChangedEvent(opportunityId, null, newDate, 'user-123');

    expect(event.eventType).toBe('opportunity.close_date_changed');
    expect(event.opportunityId).toBe(opportunityId);
    expect(event.previousDate).toBeNull();
    expect(event.newDate).toBe(newDate);
    expect(event.changedBy).toBe('user-123');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should create event with close date change', () => {
    const opportunityId = OpportunityId.generate();
    const previousDate = new Date('2025-03-31');
    const newDate = new Date('2025-04-30');
    const event = new OpportunityCloseDateChangedEvent(
      opportunityId,
      previousDate,
      newDate,
      'user-123'
    );

    expect(event.previousDate).toBe(previousDate);
    expect(event.newDate).toBe(newDate);
  });

  it('should serialize to payload correctly without previous date', () => {
    const opportunityId = OpportunityId.generate();
    const newDate = new Date('2025-03-31');
    const event = new OpportunityCloseDateChangedEvent(opportunityId, null, newDate, 'user-123');
    const payload = event.toPayload();

    expect(payload.opportunityId).toBe(opportunityId.value);
    expect(payload.previousDate).toBeNull();
    expect(payload.newDate).toBe(newDate.toISOString());
    expect(payload.changedBy).toBe('user-123');
  });

  it('should serialize to payload correctly with previous date', () => {
    const opportunityId = OpportunityId.generate();
    const previousDate = new Date('2025-03-31');
    const newDate = new Date('2025-04-30');
    const event = new OpportunityCloseDateChangedEvent(
      opportunityId,
      previousDate,
      newDate,
      'user-123'
    );
    const payload = event.toPayload();

    expect(payload.previousDate).toBe(previousDate.toISOString());
    expect(payload.newDate).toBe(newDate.toISOString());
  });
});

describe('DealWonEnrichedEvent', () => {
  it('should have eventType opportunity.deal_won_enriched', () => {
    const opportunityId = OpportunityId.generate();
    const closedAt = new Date('2026-02-21T15:00:00Z');
    const event = new DealWonEnrichedEvent(
      opportunityId,
      50000,
      'GBP',
      'account-123',
      'contact-456',
      'owner-789',
      'tenant-001',
      'closer-111',
      closedAt,
      45,
      'Enterprise Deal'
    );

    expect(event.eventType).toBe('opportunity.deal_won_enriched');
  });

  it('should include all enriched fields in toPayload()', () => {
    const opportunityId = OpportunityId.generate();
    const closedAt = new Date('2026-02-21T15:00:00Z');
    const event = new DealWonEnrichedEvent(
      opportunityId,
      50000,
      'GBP',
      'account-123',
      'contact-456',
      'owner-789',
      'tenant-001',
      'closer-111',
      closedAt,
      45,
      'Enterprise Deal'
    );
    const payload = event.toPayload();

    expect(payload.opportunityId).toBe(opportunityId.value);
    expect(payload.value).toBe(50000);
    expect(payload.currency).toBe('GBP');
    expect(payload.accountId).toBe('account-123');
    expect(payload.contactId).toBe('contact-456');
    expect(payload.ownerId).toBe('owner-789');
    expect(payload.tenantId).toBe('tenant-001');
    expect(payload.closedBy).toBe('closer-111');
    expect(payload.closedAt).toBe(closedAt.toISOString());
    expect(payload.salesCycleDays).toBe(45);
    expect(payload.opportunityName).toBe('Enterprise Deal');
  });

  it('should extend DomainEvent with eventId and occurredAt', () => {
    const opportunityId = OpportunityId.generate();
    const event = new DealWonEnrichedEvent(
      opportunityId,
      50000,
      'GBP',
      'account-123',
      undefined,
      'owner-789',
      'tenant-001',
      'closer-111',
      new Date(),
      0,
      'Quick Deal'
    );

    expect(event.eventId).toBeDefined();
    expect(typeof event.eventId).toBe('string');
    expect(event.occurredAt).toBeInstanceOf(Date);
    // contactId undefined should serialize to null
    expect(event.toPayload().contactId).toBeNull();
  });
});

describe('DealLostEnrichedEvent', () => {
  it('should have eventType opportunity.deal_lost_enriched', () => {
    const opportunityId = OpportunityId.generate();
    const closedAt = new Date('2026-02-22T15:00:00Z');
    const event = new DealLostEnrichedEvent(
      opportunityId,
      50000,
      'GBP',
      'account-123',
      'contact-456',
      'owner-789',
      'tenant-001',
      'closer-111',
      closedAt,
      45,
      'Enterprise Deal',
      'Lost to competitor pricing',
      'NEGOTIATION'
    );

    expect(event.eventType).toBe('opportunity.deal_lost_enriched');
  });

  it('should include all enriched fields in toPayload() including lossReason and stageAtLoss', () => {
    const opportunityId = OpportunityId.generate();
    const closedAt = new Date('2026-02-22T15:00:00Z');
    const event = new DealLostEnrichedEvent(
      opportunityId,
      50000,
      'GBP',
      'account-123',
      'contact-456',
      'owner-789',
      'tenant-001',
      'closer-111',
      closedAt,
      45,
      'Enterprise Deal',
      'Lost to competitor pricing',
      'NEGOTIATION'
    );
    const payload = event.toPayload();

    expect(payload.opportunityId).toBe(opportunityId.value);
    expect(payload.value).toBe(50000);
    expect(payload.currency).toBe('GBP');
    expect(payload.accountId).toBe('account-123');
    expect(payload.contactId).toBe('contact-456');
    expect(payload.ownerId).toBe('owner-789');
    expect(payload.tenantId).toBe('tenant-001');
    expect(payload.closedBy).toBe('closer-111');
    expect(payload.closedAt).toBe(closedAt.toISOString());
    expect(payload.salesCycleDays).toBe(45);
    expect(payload.opportunityName).toBe('Enterprise Deal');
    expect(payload.lossReason).toBe('Lost to competitor pricing');
    expect(payload.stageAtLoss).toBe('NEGOTIATION');
  });

  it('should extend DomainEvent with eventId and occurredAt', () => {
    const opportunityId = OpportunityId.generate();
    const event = new DealLostEnrichedEvent(
      opportunityId,
      50000,
      'GBP',
      'account-123',
      undefined,
      'owner-789',
      'tenant-001',
      'closer-111',
      new Date(),
      0,
      'Quick Deal',
      'Budget constraints forced cancellation',
      'PROSPECTING'
    );

    expect(event.eventId).toBeDefined();
    expect(typeof event.eventId).toBe('string');
    expect(event.occurredAt).toBeInstanceOf(Date);
    // contactId undefined should serialize to null
    expect(event.toPayload().contactId).toBeNull();
  });
});
