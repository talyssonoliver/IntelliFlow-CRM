import { describe, it, expect } from 'vitest';
import {
  LeadCreatedEvent,
  LeadScoredEvent,
  LeadStatusChangedEvent,
  LeadQualifiedEvent,
  LeadConvertedEvent,
} from '../LeadEvents';
import { LeadId } from '../LeadId';
import { Email } from '../Email';
import { LeadScore } from '../LeadScore';

describe('LeadCreatedEvent', () => {
  it('should create event with correct payload', () => {
    const leadId = LeadId.generate();
    const email = Email.create('test@example.com').value;
    const event = new LeadCreatedEvent(leadId, email, 'Website', 'owner-123');

    expect(event.eventType).toBe('lead.created');
    expect(event.leadId).toBe(leadId);
    expect(event.email).toBe(email);
    expect(event.source).toBe('Website');
    expect(event.ownerId).toBe('owner-123');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const leadId = LeadId.generate();
    const email = Email.create('test@example.com').value;
    const event = new LeadCreatedEvent(leadId, email, 'Website', 'owner-123');
    const payload = event.toPayload();

    expect(payload.leadId).toBe(leadId.value);
    expect(payload.email).toBe('test@example.com');
    expect(payload.source).toBe('Website');
    expect(payload.ownerId).toBe('owner-123');
  });
});

describe('LeadScoredEvent', () => {
  it('should create event with score and no previous score', () => {
    const leadId = LeadId.generate();
    const score = LeadScore.create(85, 0.92).value;
    const event = new LeadScoredEvent(leadId, score, null, 'model-v1.0');

    expect(event.eventType).toBe('lead.scored');
    expect(event.leadId).toBe(leadId);
    expect(event.score).toBe(score);
    expect(event.previousScore).toBeNull();
    expect(event.modelVersion).toBe('model-v1.0');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should create event with score and previous score', () => {
    const leadId = LeadId.generate();
    const previousScore = LeadScore.create(60, 0.8).value;
    const newScore = LeadScore.create(85, 0.92).value;
    const event = new LeadScoredEvent(leadId, newScore, previousScore, 'model-v1.0');

    expect(event.score).toBe(newScore);
    expect(event.previousScore).toBe(previousScore);
  });

  it('should expose newScore getter', () => {
    const leadId = LeadId.generate();
    const score = LeadScore.create(85, 0.92).value;
    const event = new LeadScoredEvent(leadId, score, null, 'model-v1.0');

    expect(event.newScore).toBe(score);
    expect(event.newScore.value).toBe(85);
  });

  it('should serialize to payload correctly without previous score', () => {
    const leadId = LeadId.generate();
    const score = LeadScore.create(85, 0.92).value;
    const event = new LeadScoredEvent(leadId, score, null, 'model-v1.0');
    const payload = event.toPayload();

    expect(payload.leadId).toBe(leadId.value);
    expect(payload.score).toBe(85);
    expect(payload.confidence).toBe(0.92);
    expect(payload.tier).toBe('HOT');
    expect(payload.previousScore).toBeNull();
    expect(payload.modelVersion).toBe('model-v1.0');
  });

  it('should serialize to payload correctly with previous score', () => {
    const leadId = LeadId.generate();
    const previousScore = LeadScore.create(60, 0.8).value;
    const newScore = LeadScore.create(85, 0.92).value;
    const event = new LeadScoredEvent(leadId, newScore, previousScore, 'model-v1.0');
    const payload = event.toPayload();

    expect(payload.previousScore).toBe(60);
  });
});

describe('LeadStatusChangedEvent', () => {
  it('should create event with correct status change', () => {
    const leadId = LeadId.generate();
    const event = new LeadStatusChangedEvent(
      leadId,
      'NEW',
      'QUALIFIED',
      'user-123'
    );

    expect(event.eventType).toBe('lead.status_changed');
    expect(event.leadId).toBe(leadId);
    expect(event.previousStatus).toBe('NEW');
    expect(event.newStatus).toBe('QUALIFIED');
    expect(event.changedBy).toBe('user-123');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const leadId = LeadId.generate();
    const event = new LeadStatusChangedEvent(
      leadId,
      'NEW',
      'QUALIFIED',
      'user-123'
    );
    const payload = event.toPayload();

    expect(payload.leadId).toBe(leadId.value);
    expect(payload.previousStatus).toBe('NEW');
    expect(payload.newStatus).toBe('QUALIFIED');
    expect(payload.changedBy).toBe('user-123');
  });
});

describe('LeadQualifiedEvent', () => {
  it('should create event with qualification details', () => {
    const leadId = LeadId.generate();
    const event = new LeadQualifiedEvent(
      leadId,
      'user-123',
      'High budget, clear need'
    );

    expect(event.eventType).toBe('lead.qualified');
    expect(event.leadId).toBe(leadId);
    expect(event.qualifiedBy).toBe('user-123');
    expect(event.reason).toBe('High budget, clear need');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const leadId = LeadId.generate();
    const event = new LeadQualifiedEvent(
      leadId,
      'user-123',
      'High budget, clear need'
    );
    const payload = event.toPayload();

    expect(payload.leadId).toBe(leadId.value);
    expect(payload.qualifiedBy).toBe('user-123');
    expect(payload.reason).toBe('High budget, clear need');
  });
});

describe('LeadConvertedEvent', () => {
  it('should create event with conversion details and account', () => {
    const leadId = LeadId.generate();
    const event = new LeadConvertedEvent(
      leadId,
      'contact-123',
      'account-456',
      'user-789'
    );

    expect(event.eventType).toBe('lead.converted');
    expect(event.leadId).toBe(leadId);
    expect(event.contactId).toBe('contact-123');
    expect(event.accountId).toBe('account-456');
    expect(event.convertedBy).toBe('user-789');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should create event with conversion details without account', () => {
    const leadId = LeadId.generate();
    const event = new LeadConvertedEvent(
      leadId,
      'contact-123',
      null,
      'user-789'
    );

    expect(event.accountId).toBeNull();
  });

  it('should serialize to payload correctly with account', () => {
    const leadId = LeadId.generate();
    const event = new LeadConvertedEvent(
      leadId,
      'contact-123',
      'account-456',
      'user-789'
    );
    const payload = event.toPayload();

    expect(payload.leadId).toBe(leadId.value);
    expect(payload.contactId).toBe('contact-123');
    expect(payload.accountId).toBe('account-456');
    expect(payload.convertedBy).toBe('user-789');
  });

  it('should serialize to payload correctly without account', () => {
    const leadId = LeadId.generate();
    const event = new LeadConvertedEvent(
      leadId,
      'contact-123',
      null,
      'user-789'
    );
    const payload = event.toPayload();

    expect(payload.accountId).toBeNull();
  });
});
