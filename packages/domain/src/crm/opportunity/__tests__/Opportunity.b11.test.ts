/**
 * Opportunity - B11 coverage tests
 *
 * Targets uncovered branches:
 * - create with Money object (line 174: props.value.amount <= 0)
 * - create with Money object success path
 * - updateValue with Money object (line 268: newValue.amount <= 0)
 * - updateValue with Money object success path
 * - updateProbability with Percentage object (line 298-299)
 * - reconstitute factory method
 * - reopen emits OpportunityReopenedEvent
 * - weightedValue calculation with Money creation failure fallback
 */
import { describe, it, expect } from 'vitest';
import { Opportunity } from '../Opportunity';
import { Money } from '../../../shared/Money';
import { Percentage } from '../../../shared/Percentage';
import { OpportunityId } from '../OpportunityId';

function createOpp(overrides: Record<string, unknown> = {}) {
  return Opportunity.create({
    name: 'Deal',
    value: 10000,
    accountId: 'acc_1',
    ownerId: 'user_1',
    tenantId: 'tenant_1',
    ...overrides,
  });
}

describe('Opportunity - b11 branch coverage', () => {
  describe('create with Money object', () => {
    it('should create when Money object has valid amount', () => {
      const money = Money.create(5000, 'USD').value;
      const result = Opportunity.create({
        name: 'Deal with Money',
        value: money,
        accountId: 'acc_1',
        ownerId: 'user_1',
        tenantId: 'tenant_1',
      });
      expect(result.isSuccess).toBe(true);
      expect(result.value.value.amount).toBe(5000);
      expect(result.value.value.currency).toBe('USD');
    });

    it('should fail when Money object has zero amount', () => {
      // Money.create(0) may succeed since Money itself allows 0
      // But Opportunity checks amount <= 0
      const money = Money.create(0, 'USD');
      if (money.isSuccess) {
        const result = Opportunity.create({
          name: 'Zero Money',
          value: money.value,
          accountId: 'acc_1',
          ownerId: 'user_1',
          tenantId: 'tenant_1',
        });
        expect(result.isFailure).toBe(true);
      }
    });

    it('should fail when Money object has negative amount', () => {
      const money = Money.create(-100, 'USD');
      if (money.isSuccess) {
        const result = Opportunity.create({
          name: 'Negative Money',
          value: money.value,
          accountId: 'acc_1',
          ownerId: 'user_1',
          tenantId: 'tenant_1',
        });
        expect(result.isFailure).toBe(true);
      } else {
        // Money itself rejected the negative value - that's fine
        expect(money.isFailure).toBe(true);
      }
    });

    it('should create with EUR currency Money object', () => {
      const money = Money.create(9999, 'EUR').value;
      const result = Opportunity.create({
        name: 'EUR Deal',
        value: money,
        accountId: 'acc_1',
        ownerId: 'user_1',
        tenantId: 'tenant_1',
      });
      expect(result.isSuccess).toBe(true);
      expect(result.value.value.currency).toBe('EUR');
    });
  });

  describe('updateValue with Money object', () => {
    it('should update when Money object has valid amount', () => {
      const opp = createOpp().value;
      const newMoney = Money.create(25000, 'USD').value;
      const result = opp.updateValue(newMoney, 'user_1');
      expect(result.isSuccess).toBe(true);
      expect(opp.value.amount).toBe(25000);
    });

    it('should fail when Money object has zero amount', () => {
      const opp = createOpp().value;
      const zeroMoney = Money.create(0, 'USD');
      if (zeroMoney.isSuccess) {
        const result = opp.updateValue(zeroMoney.value, 'user_1');
        expect(result.isFailure).toBe(true);
      }
    });

    it('should fail when Money object has negative amount', () => {
      const opp = createOpp().value;
      const negMoney = Money.create(-1, 'USD');
      if (negMoney.isSuccess) {
        const result = opp.updateValue(negMoney.value, 'user_1');
        expect(result.isFailure).toBe(true);
      } else {
        expect(negMoney.isFailure).toBe(true);
      }
    });

    it('should not update value when closed', () => {
      const opp = createOpp().value;
      opp.markAsWon('user_1');
      const money = Money.create(30000, 'USD').value;
      expect(opp.updateValue(money, 'user_1').isFailure).toBe(true);
    });
  });

  describe('updateProbability with Percentage object', () => {
    it('should update with Percentage object directly', () => {
      const opp = createOpp().value;
      const pct = Percentage.create(75).value;
      const result = opp.updateProbability(pct, 'user_1');
      expect(result.isSuccess).toBe(true);
      expect(opp.probability.value).toBe(75);
    });

    it('should emit probability updated event', () => {
      const opp = createOpp().value;
      opp.clearDomainEvents();
      const pct = Percentage.create(60).value;
      opp.updateProbability(pct, 'user_1');
      const events = opp.getDomainEvents();
      expect(events.some((e) => e.eventType === 'opportunity.probability_updated')).toBe(true);
    });

    it('should not update probability when closed', () => {
      const opp = createOpp().value;
      opp.markAsWon('user_1');
      const pct = Percentage.create(50).value;
      expect(opp.updateProbability(pct, 'user_1').isFailure).toBe(true);
    });
  });

  describe('reconstitute', () => {
    it('should reconstitute from persistence data', () => {
      const id = OpportunityId.generate();
      const money = Money.create(5000, 'USD').value;
      const pct = Percentage.create(50).value;
      const now = new Date();

      const opp = Opportunity.reconstitute(id, {
        name: 'Reconstituted Deal',
        value: money,
        stage: 'QUALIFICATION',
        probability: pct,
        accountId: 'acc_1',
        ownerId: 'user_1',
        tenantId: 'tenant_1',
        createdAt: now,
        updatedAt: now,
      });

      expect(opp.id).toBe(id);
      expect(opp.name).toBe('Reconstituted Deal');
      expect(opp.stage).toBe('QUALIFICATION');
      expect(opp.probability.value).toBe(50);
      expect(opp.getDomainEvents().length).toBe(0);
    });
  });

  describe('reopen event', () => {
    it('should emit OpportunityReopenedEvent', () => {
      const opp = createOpp().value;
      opp.markAsLost('No budget', 'user_1');
      opp.clearDomainEvents();
      const result = opp.reopen('user_1');
      expect(result.isSuccess).toBe(true);
      const events = opp.getDomainEvents();
      expect(events.some((e) => e.eventType === 'opportunity.reopened')).toBe(true);
    });
  });

  describe('weightedValue edge cases', () => {
    it('should calculate weighted value with non-default probability', () => {
      const opp = createOpp({ value: 20000 }).value;
      opp.changeStage('NEEDS_ANALYSIS', 'user_1'); // probability -> 40
      const wv = opp.weightedValue;
      expect(wv.amount).toBeCloseTo(8000, 0);
    });
  });
});
