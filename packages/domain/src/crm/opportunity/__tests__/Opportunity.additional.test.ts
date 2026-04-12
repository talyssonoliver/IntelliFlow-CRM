import { describe, it, expect } from 'vitest';
import { Opportunity } from '../Opportunity';

function createOpp(overrides = {}) {
  return Opportunity.create({
    name: 'Deal',
    value: 10000,
    accountId: 'acc_1',
    ownerId: 'user_1',
    tenantId: 'tenant_1',
    ...overrides,
  });
}

describe('Opportunity aggregate - additional', () => {
  describe('create', () => {
    it('should create with PROSPECTING stage', () => {
      const r = createOpp();
      expect(r.isSuccess).toBe(true);
      expect(r.value.stage).toBe('PROSPECTING');
      expect(r.value.probability.value).toBe(10);
    });

    it('should fail for zero value', () => {
      expect(createOpp({ value: 0 }).isFailure).toBe(true);
    });

    it('should fail for negative value', () => {
      expect(createOpp({ value: -100 }).isFailure).toBe(true);
    });

    it('should emit OpportunityCreatedEvent', () => {
      const events = createOpp().value.getDomainEvents();
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].eventType).toBe('opportunity.created');
    });

    it('should accept custom currency', () => {
      const r = createOpp({ value: 5000, currency: 'EUR' });
      expect(r.value.value.currency).toBe('EUR');
    });

    it('should accept optional description and contactId', () => {
      const r = createOpp({
        description: 'Big deal',
        contactId: 'c_1',
        expectedCloseDate: new Date('2026-06-01'),
      });
      expect(r.value.description).toBe('Big deal');
      expect(r.value.contactId).toBe('c_1');
    });
  });

  describe('changeStage', () => {
    it('should change stage and probability', () => {
      const opp = createOpp().value;
      opp.changeStage('QUALIFICATION', 'user_1');
      expect(opp.stage).toBe('QUALIFICATION');
      expect(opp.probability.value).toBe(20);
    });

    it('should fail when closed', () => {
      const opp = createOpp().value;
      opp.markAsWon('user_1');
      expect(opp.changeStage('NEGOTIATION', 'user_1').isFailure).toBe(true);
    });

    it('should emit stage changed event', () => {
      const opp = createOpp().value;
      opp.clearDomainEvents();
      opp.changeStage('NEEDS_ANALYSIS', 'user_1');
      expect(opp.getDomainEvents().some((e) => e.eventType === 'opportunity.stage_changed')).toBe(
        true
      );
    });
  });

  describe('updateValue', () => {
    it('should update value', () => {
      const opp = createOpp().value;
      expect(opp.updateValue(20000, 'user_1').isSuccess).toBe(true);
      expect(opp.value.amount).toBe(20000);
    });

    it('should fail for zero', () => {
      expect(createOpp().value.updateValue(0, 'user_1').isFailure).toBe(true);
    });

    it('should fail when closed', () => {
      const opp = createOpp().value;
      opp.markAsWon('user_1');
      expect(opp.updateValue(5000, 'user_1').isFailure).toBe(true);
    });
  });

  describe('updateProbability', () => {
    it('should update probability', () => {
      const opp = createOpp().value;
      expect(opp.updateProbability(50, 'user_1').isSuccess).toBe(true);
      expect(opp.probability.value).toBe(50);
    });

    it('should fail when closed', () => {
      const opp = createOpp().value;
      opp.markAsWon('user_1');
      expect(opp.updateProbability(50, 'user_1').isFailure).toBe(true);
    });
  });

  describe('updateExpectedCloseDate', () => {
    it('should update close date', () => {
      const opp = createOpp().value;
      const d = new Date('2026-12-31');
      expect(opp.updateExpectedCloseDate(d, 'user_1').isSuccess).toBe(true);
      expect(opp.expectedCloseDate).toEqual(d);
    });

    it('should fail when closed', () => {
      const opp = createOpp().value;
      opp.markAsWon('user_1');
      expect(opp.updateExpectedCloseDate(new Date(), 'user_1').isFailure).toBe(true);
    });
  });

  describe('markAsWon', () => {
    it('should set 100% probability and closedAt', () => {
      const opp = createOpp().value;
      expect(opp.markAsWon('user_1').isSuccess).toBe(true);
      expect(opp.isWon).toBe(true);
      expect(opp.probability.value).toBe(100);
      expect(opp.closedAt).toBeDefined();
    });

    it('should fail when already closed', () => {
      const opp = createOpp().value;
      opp.markAsWon('user_1');
      expect(opp.markAsWon('user_1').isFailure).toBe(true);
    });
  });

  describe('markAsLost', () => {
    it('should set 0% probability', () => {
      const opp = createOpp().value;
      expect(opp.markAsLost('Budget', 'user_1').isSuccess).toBe(true);
      expect(opp.isLost).toBe(true);
      expect(opp.probability.value).toBe(0);
    });

    it('should fail when already closed', () => {
      const opp = createOpp().value;
      opp.markAsLost('r', 'user_1');
      expect(opp.markAsLost('r2', 'user_1').isFailure).toBe(true);
    });
  });

  describe('reopen', () => {
    it('should reopen a lost opportunity', () => {
      const opp = createOpp().value;
      opp.markAsLost('No budget', 'user_1');
      expect(opp.reopen('user_1').isSuccess).toBe(true);
      expect(opp.stage).toBe('PROSPECTING');
      expect(opp.isClosed).toBe(false);
    });

    it('should fail when not lost', () => {
      expect(createOpp().value.reopen('user_1').isFailure).toBe(true);
    });

    it('should fail when won', () => {
      const opp = createOpp().value;
      opp.markAsWon('user_1');
      expect(opp.reopen('user_1').isFailure).toBe(true);
    });
  });

  describe('weightedValue', () => {
    it('should calculate correctly', () => {
      const opp = createOpp({ value: 10000 }).value;
      expect(opp.weightedValue.amount).toBeCloseTo(1000, 0);
    });
  });

  describe('updateDescription', () => {
    it('should update', () => {
      const opp = createOpp().value;
      opp.updateDescription('New desc');
      expect(opp.description).toBe('New desc');
    });
  });

  describe('toJSON', () => {
    it('should serialize', () => {
      const json = createOpp().value.toJSON();
      expect(json.name).toBe('Deal');
      expect(json.stage).toBe('PROSPECTING');
    });
  });
});
