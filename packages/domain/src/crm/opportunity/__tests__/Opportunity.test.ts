/**
 * Opportunity Aggregate Root Tests
 *
 * These tests verify the domain logic of the Opportunity entity.
 * They ensure business rules are enforced and domain events are correctly emitted.
 *
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  Opportunity,
  OpportunityAlreadyClosedError,
  InvalidOpportunityValueError,
  InvalidProbabilityError,
} from '../Opportunity';
import { OpportunityId } from '../OpportunityId';
import {
  OpportunityStage,
  OpportunityCreatedEvent,
  OpportunityStageChangedEvent,
  OpportunityValueUpdatedEvent,
  OpportunityWonEvent,
  OpportunityLostEvent,
  OpportunityProbabilityUpdatedEvent,
  OpportunityCloseDateChangedEvent,
} from '../OpportunityEvents';
import { Money } from '../../../shared/Money';
import { Percentage } from '../../../shared/Percentage';

describe('Opportunity Aggregate', () => {
  describe('Factory Method - create()', () => {
    it('should create a new opportunity with valid data', () => {
      const expectedCloseDate = new Date('2024-12-31');
      const result = Opportunity.create({
        name: 'Big Deal',
        value: 100000,
        accountId: 'account-123',
        contactId: 'contact-456',
        expectedCloseDate,
        description: 'Major opportunity',
        ownerId: 'owner-789',
        tenantId: 'tenant-123',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeInstanceOf(Opportunity);

      const opportunity = result.value;
      expect(opportunity.name).toBe('Big Deal');
      expect(opportunity.value.amount).toBe(100000);
      expect(opportunity.accountId).toBe('account-123');
      expect(opportunity.contactId).toBe('contact-456');
      expect(opportunity.expectedCloseDate).toBe(expectedCloseDate);
      expect(opportunity.description).toBe('Major opportunity');
      expect(opportunity.ownerId).toBe('owner-789');
      expect(opportunity.stage).toBe('PROSPECTING');
      expect(opportunity.probability.value).toBe(10);
      expect(opportunity.isClosed).toBe(false);
      expect(opportunity.isWon).toBe(false);
      expect(opportunity.isLost).toBe(false);
    });

    it('should create an opportunity with minimal data', () => {
      const result = Opportunity.create({
        name: 'Minimal Deal',
        value: 50000,
        accountId: 'account-999',
        ownerId: 'owner-111',
        tenantId: 'tenant-123',
      });

      expect(result.isSuccess).toBe(true);

      const opportunity = result.value;
      expect(opportunity.name).toBe('Minimal Deal');
      expect(opportunity.value.amount).toBe(50000);
      expect(opportunity.accountId).toBe('account-999');
      expect(opportunity.contactId).toBeUndefined();
      expect(opportunity.expectedCloseDate).toBeUndefined();
      expect(opportunity.description).toBeUndefined();
      expect(opportunity.stage).toBe('PROSPECTING');
    });

    it('should fail with zero value', () => {
      const result = Opportunity.create({
        name: 'Zero Deal',
        value: 0,
        accountId: 'account-123',
        ownerId: 'owner-456',
        tenantId: 'tenant-123',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidOpportunityValueError);
      expect(result.error.code).toBe('INVALID_OPPORTUNITY_VALUE');
    });

    it('should fail with negative value', () => {
      const result = Opportunity.create({
        name: 'Negative Deal',
        value: -1000,
        accountId: 'account-123',
        ownerId: 'owner-456',
        tenantId: 'tenant-123',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidOpportunityValueError);
    });

    it('should emit OpportunityCreatedEvent on creation', () => {
      const result = Opportunity.create({
        name: 'Event Deal',
        value: 75000,
        accountId: 'account-789',
        ownerId: 'owner-999',
        tenantId: 'tenant-123',
      });

      const opportunity = result.value;
      const events = opportunity.getDomainEvents();

      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(OpportunityCreatedEvent);

      const createdEvent = events[0] as OpportunityCreatedEvent;
      expect(createdEvent.opportunityId).toBe(opportunity.id);
      expect(createdEvent.name).toBe('Event Deal');
      expect(createdEvent.value).toBe(75000);
      expect(createdEvent.accountId).toBe('account-789');
      expect(createdEvent.ownerId).toBe('owner-999');
    });

    it('should calculate weighted value correctly', () => {
      const result = Opportunity.create({
        name: 'Weighted Deal',
        value: 100000,
        accountId: 'account-123',
        ownerId: 'owner-456',
        tenantId: 'tenant-123',
      });

      const opportunity = result.value;
      // Stage is PROSPECTING with 10% probability
      expect(opportunity.weightedValue.amount).toBe(10000); // 100000 * 0.10
    });
  });

  describe('Getters', () => {
    let opportunity: Opportunity;

    beforeEach(() => {
      const result = Opportunity.create({
        name: 'Test Deal',
        value: 100000,
        accountId: 'account-123',
        contactId: 'contact-456',
        expectedCloseDate: new Date('2024-12-31'),
        description: 'Test opportunity',
        ownerId: 'owner-789',
        tenantId: 'tenant-123',
      });
      opportunity = result.value;
    });

    it('should return all properties correctly', () => {
      expect(opportunity.name).toBe('Test Deal');
      expect(opportunity.value.amount).toBe(100000);
      expect(opportunity.accountId).toBe('account-123');
      expect(opportunity.contactId).toBe('contact-456');
      expect(opportunity.ownerId).toBe('owner-789');
      expect(opportunity.description).toBe('Test opportunity');
      expect(opportunity.stage).toBe('PROSPECTING');
      expect(opportunity.probability.value).toBe(10);
    });

    it('should check if opportunity is closed', () => {
      expect(opportunity.isClosed).toBe(false);

      opportunity.markAsWon('user-123');
      expect(opportunity.isClosed).toBe(true);
    });

    it('should check if opportunity is won', () => {
      expect(opportunity.isWon).toBe(false);

      opportunity.markAsWon('user-123');
      expect(opportunity.isWon).toBe(true);
      expect(opportunity.isLost).toBe(false);
    });

    it('should check if opportunity is lost', () => {
      expect(opportunity.isLost).toBe(false);

      opportunity.markAsLost('Budget cut', 'user-123');
      expect(opportunity.isLost).toBe(true);
      expect(opportunity.isWon).toBe(false);
    });

    it('should calculate weighted value based on probability', () => {
      expect(opportunity.weightedValue.amount).toBe(10000); // 100000 * 0.10

      opportunity.changeStage('PROPOSAL', 'user-123');
      expect(opportunity.weightedValue.amount).toBe(60000); // 100000 * 0.60
    });
  });

  describe('changeStage()', () => {
    let opportunity: Opportunity;

    beforeEach(() => {
      const result = Opportunity.create({
        name: 'Stage Test',
        value: 100000,
        accountId: 'account-123',
        ownerId: 'owner-456',
        tenantId: 'tenant-123',
      });
      opportunity = result.value;
      opportunity.clearDomainEvents();
    });

    it('should change stage successfully', () => {
      const result = opportunity.changeStage('QUALIFICATION', 'user-123');

      expect(result.isSuccess).toBe(true);
      expect(opportunity.stage).toBe('QUALIFICATION');
      expect(opportunity.probability.value).toBe(20); // Auto-adjusted for stage
    });

    it('should auto-adjust probability for each stage', () => {
      const stages: Array<{ stage: OpportunityStage; expectedProbability: number }> = [
        { stage: 'PROSPECTING', expectedProbability: 10 },
        { stage: 'QUALIFICATION', expectedProbability: 20 },
        { stage: 'NEEDS_ANALYSIS', expectedProbability: 40 },
        { stage: 'PROPOSAL', expectedProbability: 60 },
        { stage: 'NEGOTIATION', expectedProbability: 80 },
      ];

      stages.forEach(({ stage, expectedProbability }) => {
        opportunity.changeStage(stage, 'user-123');
        expect(opportunity.probability.value).toBe(expectedProbability);
      });
    });

    it('should emit OpportunityStageChangedEvent', () => {
      opportunity.changeStage('NEEDS_ANALYSIS', 'user-789');

      const events = opportunity.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(OpportunityStageChangedEvent);

      const stageEvent = events[0] as OpportunityStageChangedEvent;
      expect(stageEvent.opportunityId).toBe(opportunity.id);
      expect(stageEvent.previousStage).toBe('PROSPECTING');
      expect(stageEvent.newStage).toBe('NEEDS_ANALYSIS');
      expect(stageEvent.changedBy).toBe('user-789');
    });

    it('should fail to change stage when already closed', () => {
      opportunity.markAsWon('user-123');
      opportunity.clearDomainEvents();

      const result = opportunity.changeStage('PROSPECTING', 'user-456');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(OpportunityAlreadyClosedError);
      expect(result.error.code).toBe('OPPORTUNITY_ALREADY_CLOSED');
    });
  });

  describe('updateValue()', () => {
    let opportunity: Opportunity;

    beforeEach(() => {
      const result = Opportunity.create({
        name: 'Value Test',
        value: 100000,
        accountId: 'account-123',
        ownerId: 'owner-456',
        tenantId: 'tenant-123',
      });
      opportunity = result.value;
      opportunity.clearDomainEvents();
    });

    it('should update value successfully', () => {
      const result = opportunity.updateValue(150000, 'user-123');

      expect(result.isSuccess).toBe(true);
      expect(opportunity.value.amount).toBe(150000);
    });

    it('should emit OpportunityValueUpdatedEvent', () => {
      opportunity.updateValue(200000, 'user-789');

      const events = opportunity.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(OpportunityValueUpdatedEvent);

      const valueEvent = events[0] as OpportunityValueUpdatedEvent;
      expect(valueEvent.opportunityId).toBe(opportunity.id);
      expect(valueEvent.previousValue).toBe(100000);
      expect(valueEvent.newValue).toBe(200000);
      expect(valueEvent.updatedBy).toBe('user-789');
    });

    it('should fail with zero value', () => {
      const result = opportunity.updateValue(0, 'user-123');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidOpportunityValueError);
      expect(opportunity.value.amount).toBe(100000); // Unchanged
    });

    it('should fail with negative value', () => {
      const result = opportunity.updateValue(-5000, 'user-123');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidOpportunityValueError);
      expect(opportunity.value.amount).toBe(100000); // Unchanged
    });

    it('should fail to update value when already closed', () => {
      opportunity.markAsWon('user-123');
      opportunity.clearDomainEvents();

      const result = opportunity.updateValue(200000, 'user-456');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(OpportunityAlreadyClosedError);
    });
  });

  describe('updateProbability()', () => {
    let opportunity: Opportunity;

    beforeEach(() => {
      const result = Opportunity.create({
        name: 'Probability Test',
        value: 100000,
        accountId: 'account-123',
        ownerId: 'owner-456',
        tenantId: 'tenant-123',
      });
      opportunity = result.value;
      opportunity.clearDomainEvents();
    });

    it('should update probability successfully', () => {
      const result = opportunity.updateProbability(50, 'user-123');

      expect(result.isSuccess).toBe(true);
      expect(opportunity.probability.value).toBe(50);
    });

    it('should emit OpportunityProbabilityUpdatedEvent', () => {
      opportunity.updateProbability(75, 'user-789');

      const events = opportunity.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(OpportunityProbabilityUpdatedEvent);

      const probEvent = events[0] as OpportunityProbabilityUpdatedEvent;
      expect(probEvent.opportunityId).toBe(opportunity.id);
      expect(probEvent.previousProbability).toBe(10);
      expect(probEvent.newProbability).toBe(75);
      expect(probEvent.updatedBy).toBe('user-789');
    });

    it('should accept 0% probability', () => {
      const result = opportunity.updateProbability(0, 'user-123');

      expect(result.isSuccess).toBe(true);
      expect(opportunity.probability.value).toBe(0);
    });

    it('should accept 100% probability', () => {
      const result = opportunity.updateProbability(100, 'user-123');

      expect(result.isSuccess).toBe(true);
      expect(opportunity.probability.value).toBe(100);
    });

    it('should fail with probability below 0', () => {
      const result = opportunity.updateProbability(-10, 'user-123');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidProbabilityError);
      expect(result.error.code).toBe('INVALID_PROBABILITY');
      expect(opportunity.probability.value).toBe(10); // Unchanged
    });

    it('should fail with probability above 100', () => {
      const result = opportunity.updateProbability(150, 'user-123');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidProbabilityError);
      expect(opportunity.probability.value).toBe(10); // Unchanged
    });

    it('should fail to update probability when already closed', () => {
      opportunity.markAsLost('Lost to competitor', 'user-123');
      opportunity.clearDomainEvents();

      const result = opportunity.updateProbability(50, 'user-456');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(OpportunityAlreadyClosedError);
    });
  });

  describe('updateExpectedCloseDate()', () => {
    let opportunity: Opportunity;

    beforeEach(() => {
      const result = Opportunity.create({
        name: 'Date Test',
        value: 100000,
        accountId: 'account-123',
        expectedCloseDate: new Date('2024-06-30'),
        ownerId: 'owner-456',
        tenantId: 'tenant-123',
      });
      opportunity = result.value;
      opportunity.clearDomainEvents();
    });

    it('should update expected close date successfully', () => {
      const newDate = new Date('2024-12-31');
      const result = opportunity.updateExpectedCloseDate(newDate, 'user-123');

      expect(result.isSuccess).toBe(true);
      expect(opportunity.expectedCloseDate).toBe(newDate);
    });

    it('should emit OpportunityCloseDateChangedEvent', () => {
      const newDate = new Date('2024-09-30');
      opportunity.updateExpectedCloseDate(newDate, 'user-789');

      const events = opportunity.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(OpportunityCloseDateChangedEvent);

      const dateEvent = events[0] as OpportunityCloseDateChangedEvent;
      expect(dateEvent.opportunityId).toBe(opportunity.id);
      expect(dateEvent.previousDate).toEqual(new Date('2024-06-30'));
      expect(dateEvent.newDate).toBe(newDate);
      expect(dateEvent.changedBy).toBe('user-789');
    });

    it('should handle null previous date when not set', () => {
      const noDateResult = Opportunity.create({
        name: 'No Date',
        value: 50000,
        accountId: 'account-999',
        ownerId: 'owner-111',
        tenantId: 'tenant-123',
      });

      const opp = noDateResult.value;
      opp.clearDomainEvents();

      const newDate = new Date('2024-12-31');
      opp.updateExpectedCloseDate(newDate, 'user-123');

      const events = opp.getDomainEvents();
      const dateEvent = events[0] as OpportunityCloseDateChangedEvent;
      expect(dateEvent.previousDate).toBeNull();
    });

    it('should fail to update close date when already closed', () => {
      opportunity.markAsWon('user-123');
      opportunity.clearDomainEvents();

      const result = opportunity.updateExpectedCloseDate(new Date('2025-01-01'), 'user-456');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(OpportunityAlreadyClosedError);
    });
  });

  describe('markAsWon()', () => {
    let opportunity: Opportunity;

    beforeEach(() => {
      const result = Opportunity.create({
        name: 'Win Test',
        value: 100000,
        accountId: 'account-123',
        ownerId: 'owner-456',
        tenantId: 'tenant-123',
      });
      opportunity = result.value;
      opportunity.clearDomainEvents();
    });

    it('should mark opportunity as won successfully', () => {
      const result = opportunity.markAsWon('user-123');

      expect(result.isSuccess).toBe(true);
      expect(opportunity.stage).toBe('CLOSED_WON');
      expect(opportunity.probability.value).toBe(100);
      expect(opportunity.isClosed).toBe(true);
      expect(opportunity.isWon).toBe(true);
      expect(opportunity.closedAt).toBeInstanceOf(Date);
    });

    it('should emit OpportunityWonEvent', () => {
      opportunity.markAsWon('user-789');

      const events = opportunity.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(OpportunityWonEvent);

      const wonEvent = events[0] as OpportunityWonEvent;
      expect(wonEvent.opportunityId).toBe(opportunity.id);
      expect(wonEvent.value).toBe(100000);
      expect(wonEvent.closedBy).toBe('user-789');
    });

    it('should fail to mark as won when already closed', () => {
      opportunity.markAsLost('Lost to competitor', 'user-123');
      opportunity.clearDomainEvents();

      const result = opportunity.markAsWon('user-456');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(OpportunityAlreadyClosedError);
      expect(opportunity.isLost).toBe(true); // Still lost
    });

    it('should set weighted value to full value when won', () => {
      opportunity.markAsWon('user-123');
      expect(opportunity.weightedValue.amount).toBe(100000); // 100% probability
    });
  });

  describe('markAsLost()', () => {
    let opportunity: Opportunity;

    beforeEach(() => {
      const result = Opportunity.create({
        name: 'Loss Test',
        value: 100000,
        accountId: 'account-123',
        ownerId: 'owner-456',
        tenantId: 'tenant-123',
      });
      opportunity = result.value;
      opportunity.clearDomainEvents();
    });

    it('should mark opportunity as lost successfully', () => {
      const result = opportunity.markAsLost('Budget constraints', 'user-123');

      expect(result.isSuccess).toBe(true);
      expect(opportunity.stage).toBe('CLOSED_LOST');
      expect(opportunity.probability.value).toBe(0);
      expect(opportunity.isClosed).toBe(true);
      expect(opportunity.isLost).toBe(true);
      expect(opportunity.closedAt).toBeInstanceOf(Date);
    });

    it('should emit OpportunityLostEvent', () => {
      opportunity.markAsLost('Lost to competitor', 'user-789');

      const events = opportunity.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(OpportunityLostEvent);

      const lostEvent = events[0] as OpportunityLostEvent;
      expect(lostEvent.opportunityId).toBe(opportunity.id);
      expect(lostEvent.reason).toBe('Lost to competitor');
      expect(lostEvent.closedBy).toBe('user-789');
    });

    it('should fail to mark as lost when already closed', () => {
      opportunity.markAsWon('user-123');
      opportunity.clearDomainEvents();

      const result = opportunity.markAsLost('Too late', 'user-456');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(OpportunityAlreadyClosedError);
      expect(opportunity.isWon).toBe(true); // Still won
    });

    it('should set weighted value to zero when lost', () => {
      opportunity.markAsLost('No budget', 'user-123');
      expect(opportunity.weightedValue.amount).toBe(0); // 0% probability
    });
  });

  describe('updateDescription()', () => {
    let opportunity: Opportunity;

    beforeEach(() => {
      const result = Opportunity.create({
        name: 'Description Test',
        value: 100000,
        accountId: 'account-123',
        description: 'Original description',
        ownerId: 'owner-456',
        tenantId: 'tenant-123',
      });
      opportunity = result.value;
    });

    it('should update description successfully', () => {
      opportunity.updateDescription('Updated description');

      expect(opportunity.description).toBe('Updated description');
    });

    it('should not emit domain event for description update', () => {
      opportunity.clearDomainEvents();
      opportunity.updateDescription('New description');

      const events = opportunity.getDomainEvents();
      expect(events).toHaveLength(0);
    });
  });

  describe('State Transitions', () => {
    it('should transition through all stages successfully', () => {
      const result = Opportunity.create({
        name: 'Transition Test',
        value: 100000,
        accountId: 'account-123',
        ownerId: 'owner-456',
        tenantId: 'tenant-123',
      });

      const opportunity = result.value;
      const stages: OpportunityStage[] = [
        'PROSPECTING',
        'QUALIFICATION',
        'NEEDS_ANALYSIS',
        'PROPOSAL',
        'NEGOTIATION',
      ];

      stages.forEach((stage) => {
        opportunity.changeStage(stage, 'user-123');
        expect(opportunity.stage).toBe(stage);
      });
    });

    it('should reject transitions from won state', () => {
      const result = Opportunity.create({
        name: 'Won Transition Test',
        value: 100000,
        accountId: 'account-123',
        ownerId: 'owner-456',
        tenantId: 'tenant-123',
      });

      const opportunity = result.value;
      opportunity.markAsWon('user-123');

      const stageResult = opportunity.changeStage('PROSPECTING', 'user-456');
      expect(stageResult.isFailure).toBe(true);

      const valueResult = opportunity.updateValue(200000, 'user-789');
      expect(valueResult.isFailure).toBe(true);

      const probResult = opportunity.updateProbability(50, 'user-999');
      expect(probResult.isFailure).toBe(true);
    });

    it('should reject transitions from lost state', () => {
      const result = Opportunity.create({
        name: 'Lost Transition Test',
        value: 100000,
        accountId: 'account-123',
        ownerId: 'owner-456',
        tenantId: 'tenant-123',
      });

      const opportunity = result.value;
      opportunity.markAsLost('No budget', 'user-123');

      const stageResult = opportunity.changeStage('PROSPECTING', 'user-456');
      expect(stageResult.isFailure).toBe(true);

      const valueResult = opportunity.updateValue(200000, 'user-789');
      expect(valueResult.isFailure).toBe(true);

      const probResult = opportunity.updateProbability(50, 'user-999');
      expect(probResult.isFailure).toBe(true);
    });
  });

  describe('Serialization', () => {
    it('should serialize opportunity to JSON', () => {
      const expectedCloseDate = new Date('2024-12-31');
      const result = Opportunity.create({
        name: 'JSON Test',
        value: 100000,
        accountId: 'account-123',
        contactId: 'contact-456',
        expectedCloseDate,
        description: 'JSON test opportunity',
        ownerId: 'owner-789',
        tenantId: 'tenant-123',
      });

      const opportunity = result.value;
      opportunity.changeStage('PROPOSAL', 'user-123');

      const json = opportunity.toJSON();

      expect(json).toHaveProperty('id');
      expect(json.name).toBe('JSON Test');
      // Money.toValue() returns { cents, currency, amount }
      expect((json.value as { amount: number }).amount).toBe(100000);
      expect(json.stage).toBe('PROPOSAL');
      expect(json.probability).toBe(60);
      expect((json.weightedValue as { amount: number }).amount).toBe(60000);
      expect(json.expectedCloseDate).toBe(expectedCloseDate.toISOString());
      expect(json.description).toBe('JSON test opportunity');
      expect(json.accountId).toBe('account-123');
      expect(json.contactId).toBe('contact-456');
      expect(json.ownerId).toBe('owner-789');
      expect(json).toHaveProperty('createdAt');
      expect(json).toHaveProperty('updatedAt');
      expect(json.closedAt).toBeUndefined();
    });

    it('should include closedAt when opportunity is closed', () => {
      const result = Opportunity.create({
        name: 'Closed JSON',
        value: 50000,
        accountId: 'account-999',
        ownerId: 'owner-111',
        tenantId: 'tenant-123',
      });

      const opportunity = result.value;
      opportunity.markAsWon('user-123');

      const json = opportunity.toJSON();
      expect(json.closedAt).toBeDefined();
    });
  });

  describe('reconstitute()', () => {
    it('should reconstitute opportunity from persistence', () => {
      const id = OpportunityId.generate();
      const now = new Date();
      const expectedCloseDate = new Date('2024-12-31');

      // Create proper value objects for reconstitute
      const moneyResult = Money.create(100000, 'USD');
      const probabilityResult = Percentage.create(60);
      expect(moneyResult.isSuccess).toBe(true);
      expect(probabilityResult.isSuccess).toBe(true);

      const opportunity = Opportunity.reconstitute(id, {
        name: 'Reconstituted Deal',
        value: moneyResult.value,
        stage: 'PROPOSAL',
        probability: probabilityResult.value,
        expectedCloseDate,
        description: 'Reconstituted opportunity',
        accountId: 'account-999',
        contactId: 'contact-888',
        ownerId: 'owner-777',
        tenantId: 'tenant-123',
        createdAt: now,
        updatedAt: now,
      });

      expect(opportunity.id).toBe(id);
      expect(opportunity.name).toBe('Reconstituted Deal');
      expect(opportunity.value.amount).toBe(100000);
      expect(opportunity.stage).toBe('PROPOSAL');
      expect(opportunity.probability.value).toBe(60);
      expect(opportunity.expectedCloseDate).toBe(expectedCloseDate);
      expect(opportunity.description).toBe('Reconstituted opportunity');
      expect(opportunity.accountId).toBe('account-999');
      expect(opportunity.contactId).toBe('contact-888');
      expect(opportunity.ownerId).toBe('owner-777');
    });

    it('should reconstitute closed won opportunity', () => {
      const id = OpportunityId.generate();
      const closedAt = new Date();

      // Create proper value objects for reconstitute
      const moneyResult = Money.create(200000, 'USD');
      const probabilityResult = Percentage.create(100);
      expect(moneyResult.isSuccess).toBe(true);
      expect(probabilityResult.isSuccess).toBe(true);

      const opportunity = Opportunity.reconstitute(id, {
        name: 'Won Deal',
        value: moneyResult.value,
        stage: 'CLOSED_WON',
        probability: probabilityResult.value,
        accountId: 'account-123',
        ownerId: 'owner-456',
        tenantId: 'tenant-123',
        createdAt: new Date(),
        updatedAt: new Date(),
        closedAt,
      });

      expect(opportunity.stage).toBe('CLOSED_WON');
      expect(opportunity.isClosed).toBe(true);
      expect(opportunity.isWon).toBe(true);
      expect(opportunity.closedAt).toBe(closedAt);
    });
  });

  describe('Domain Events', () => {
    it('should accumulate multiple domain events', () => {
      const result = Opportunity.create({
        name: 'Events Test',
        value: 100000,
        accountId: 'account-123',
        ownerId: 'owner-456',
        tenantId: 'tenant-123',
      });

      const opportunity = result.value;

      // Creation event is already added
      expect(opportunity.getDomainEvents()).toHaveLength(1);

      opportunity.changeStage('QUALIFICATION', 'user-123');
      expect(opportunity.getDomainEvents()).toHaveLength(2);

      opportunity.updateValue(150000, 'user-456');
      expect(opportunity.getDomainEvents()).toHaveLength(3);

      opportunity.updateProbability(30, 'user-789');
      expect(opportunity.getDomainEvents()).toHaveLength(4);
    });

    it('should clear domain events', () => {
      const result = Opportunity.create({
        name: 'Clear Test',
        value: 100000,
        accountId: 'account-123',
        ownerId: 'owner-456',
        tenantId: 'tenant-123',
      });

      const opportunity = result.value;
      expect(opportunity.getDomainEvents()).toHaveLength(1);

      opportunity.clearDomainEvents();
      expect(opportunity.getDomainEvents()).toHaveLength(0);
    });
  });
});
