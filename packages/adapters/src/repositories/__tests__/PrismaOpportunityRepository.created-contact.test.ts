/**
 * MVP-003: the repository stores and reads back the contact a lead conversion created.
 */
import { describe, it, expect, vi } from 'vitest';
import { Opportunity, type OpportunityId } from '@intelliflow/domain';
import { PrismaOpportunityRepository } from '../PrismaOpportunityRepository';

const TENANT = 'tenant-aaaa-0000-0000-000000000001';
const OPP_ID = '00000000-0000-4000-8000-000000000099';

function record(createdContactId: string | null) {
  return {
    id: OPP_ID,
    name: 'Pilates rollout',
    value: { toNumber: () => 0 } as never,
    stage: 'PROSPECTING',
    probability: 10,
    expectedCloseDate: null,
    description: null,
    accountId: '00000000-0000-4000-8000-000000000010',
    contactId: '00000000-0000-4000-8000-000000000020',
    ownerId: '00000000-0000-4000-8000-000000000011',
    tenantId: TENANT,
    createdAt: new Date('2026-11-17T10:00:00.000Z'),
    updatedAt: new Date('2026-11-17T10:00:00.000Z'),
    closedAt: null,
    sourceLeadId: '00000000-0000-4000-8000-000000000030',
    createdContactId,
    deletedAt: null,
  };
}

describe('PrismaOpportunityRepository createdContactId (MVP-003)', () => {
  it('writes the created contact in both the create and the update of the upsert', async () => {
    const upsert = vi.fn();
    const repo = new PrismaOpportunityRepository({ opportunity: { upsert } } as never);
    const deal = Opportunity.create({
      name: 'Pilates rollout',
      value: 0,
      valueNotYetKnown: true,
      accountId: 'account-1',
      contactId: 'contact-1',
      sourceLeadId: 'lead-1',
      createdContactId: 'contact-1',
      ownerId: 'owner-1',
      tenantId: TENANT,
    }).value;

    await repo.save(deal);

    const { create, update } = upsert.mock.calls[0][0];
    expect(create.createdContactId).toBe('contact-1');
    expect(update.createdContactId).toBe('contact-1');
  });

  it('writes null when the conversion did not create the contact', async () => {
    const upsert = vi.fn();
    const repo = new PrismaOpportunityRepository({ opportunity: { upsert } } as never);
    const deal = Opportunity.create({
      name: 'Direct deal',
      value: 500,
      accountId: 'account-1',
      ownerId: 'owner-1',
      tenantId: TENANT,
    }).value;
    await repo.save(deal);
    expect(upsert.mock.calls[0][0].create.createdContactId).toBeNull();
  });

  it.each([
    ['the created contact', '00000000-0000-4000-8000-000000000020'],
    ['an unknown one (null)', null],
  ])('reads back %s', async (_label, stored) => {
    const findFirst = vi.fn(async () => record(stored));
    const repo = new PrismaOpportunityRepository({ opportunity: { findFirst } } as never);
    const deal = await repo.findById({ value: OPP_ID } as OpportunityId, TENANT);
    expect(deal?.createdContactId).toBe(stored ?? undefined);
  });
});
