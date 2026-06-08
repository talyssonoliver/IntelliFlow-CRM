import { describe, it, expect, vi } from 'vitest';
import {
  createPrismaOpportunityCustomers,
  type OpportunityCustomersPrisma,
} from '../opportunity-customers';

function makePrisma(row: unknown) {
  const findFirst = vi.fn().mockResolvedValue(row);
  const update = vi.fn().mockResolvedValue({});
  const prisma = { opportunity: { findFirst, update } } as unknown as OpportunityCustomersPrisma;
  return { prisma, findFirst, update };
}

describe('createPrismaOpportunityCustomers.getLink', () => {
  it('maps a found opportunity to the customer link (account name preferred)', async () => {
    const { prisma, findFirst } = makePrisma({
      stripeCustomerId: 'cus_opp',
      name: 'Opp name',
      owner: { stripeCustomerId: 'cus_owner' },
      contact: { email: 'a@b.co' },
      account: { name: 'Acme Ltd' },
    });
    const link = await createPrismaOpportunityCustomers(prisma).getLink('opp_1', 'ten_1');

    expect(findFirst.mock.calls[0][0].where).toEqual({ id: 'opp_1', tenantId: 'ten_1' });
    expect(link).toEqual({
      stripeCustomerId: 'cus_opp',
      ownerStripeCustomerId: 'cus_owner',
      email: 'a@b.co',
      name: 'Acme Ltd',
    });
  });

  it('falls back to the opportunity name + nulls when relations are absent', async () => {
    const { prisma } = makePrisma({
      stripeCustomerId: null,
      name: 'Solo Opp',
      owner: null,
      contact: null,
      account: null,
    });
    const link = await createPrismaOpportunityCustomers(prisma).getLink('opp_2', 'ten_1');
    expect(link).toEqual({
      stripeCustomerId: null,
      ownerStripeCustomerId: null,
      email: null,
      name: 'Solo Opp',
    });
  });

  it('returns null when the opportunity is not found', async () => {
    const { prisma } = makePrisma(null);
    expect(await createPrismaOpportunityCustomers(prisma).getLink('missing', 'ten_1')).toBeNull();
  });

  it('setStripeCustomerId updates the opportunity', async () => {
    const { prisma, update } = makePrisma(null);
    await createPrismaOpportunityCustomers(prisma).setStripeCustomerId('opp_1', 'cus_new');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'opp_1' },
      data: { stripeCustomerId: 'cus_new' },
    });
  });
});
