import { describe, it, expect } from 'vitest';
import { Opportunity } from '../Opportunity';
import { OpportunityId } from '../OpportunityId';

/** MVP-003: a deal remembers the contact its lead conversion created. */
const base = {
  name: 'Pilates rollout',
  value: 500,
  accountId: 'account-1',
  ownerId: 'owner-1',
  tenantId: 'tenant-1',
};

describe('Opportunity.createdContactId (MVP-003)', () => {
  it('keeps the contact a conversion created', () => {
    const deal = Opportunity.create({
      ...base,
      contactId: 'contact-1',
      createdContactId: 'contact-1',
    }).value;
    expect(deal.createdContactId).toBe('contact-1');
  });

  it('is unset for a deal whose contact was not created by a conversion', () => {
    expect(
      Opportunity.create({ ...base, contactId: 'contact-1' }).value.createdContactId
    ).toBeUndefined();
  });

  it('survives reconstitution from storage', () => {
    const deal = Opportunity.create({ ...base, createdContactId: 'contact-1' }).value;
    const again = Opportunity.reconstitute(OpportunityId.generate(), {
      name: deal.name,
      value: deal.value,
      stage: deal.stage,
      probability: deal.probability,
      accountId: deal.accountId,
      createdContactId: 'contact-1',
      ownerId: deal.ownerId,
      tenantId: deal.tenantId,
      createdAt: deal.createdAt,
      updatedAt: deal.updatedAt,
    });
    expect(again.createdContactId).toBe('contact-1');
  });

  it('still refuses changes to a closed deal (one-line guard)', () => {
    const deal = Opportunity.create(base).value;
    deal.markAsLost('Went with another agency', 'owner-1');
    expect(deal.updateValue(900, 'owner-1').isFailure).toBe(true);
    expect(deal.changeStage('PROPOSAL', 'owner-1').isFailure).toBe(true);
  });
});
