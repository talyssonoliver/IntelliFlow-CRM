import { describe, it, expect } from 'vitest';
import { Opportunity } from '../Opportunity';
import { Money } from '../../../shared/Money';

/** MVP-003: a deal converted from a lead may start without a value (stored as 0). */
const base = {
  name: 'Pilates rollout',
  accountId: 'account-1',
  ownerId: 'owner-1',
  tenantId: 'tenant-1',
};

describe('Opportunity value rules (MVP-003)', () => {
  it('accepts 0 when the value is not known yet', () => {
    const result = Opportunity.create({ ...base, value: 0, valueNotYetKnown: true });
    expect(result.isSuccess).toBe(true);
    expect(result.value.value.amount).toBe(0);
    expect(result.value.weightedValue.amount).toBe(0);
  });

  it('still refuses 0 when the value is meant to be known', () => {
    const result = Opportunity.create({ ...base, value: 0 });
    expect(result.isFailure).toBe(true);
    expect(result.error.message).toMatch(/greater than zero/);
  });

  it('refuses a negative value even when it is not known yet', () => {
    expect(Opportunity.create({ ...base, value: -1, valueNotYetKnown: true }).isFailure).toBe(true);
  });

  it('applies the same rules to a Money value', () => {
    expect(Opportunity.create({ ...base, value: Money.zero('GBP') }).isFailure).toBe(true);
    const ok = Opportunity.create({ ...base, value: Money.zero('GBP'), valueNotYetKnown: true });
    expect(ok.isSuccess).toBe(true);
  });

  it('lets a value be added later, and still refuses setting it back to 0', () => {
    const deal = Opportunity.create({ ...base, value: 0, valueNotYetKnown: true }).value;
    expect(deal.updateValue(2500, 'owner-1').isSuccess).toBe(true);
    expect(deal.value.amount).toBe(2500);
    expect(deal.updateValue(0, 'owner-1').isFailure).toBe(true);
    expect(deal.updateValue(Money.zero('GBP'), 'owner-1').isFailure).toBe(true);
  });
});
