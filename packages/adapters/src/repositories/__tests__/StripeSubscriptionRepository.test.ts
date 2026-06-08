import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient } from '@intelliflow/db';
import { PrismaStripeSubscriptionRepository } from '../PrismaStripeSubscriptionRepository';
import { InMemoryStripeSubscriptionRepository } from '../InMemoryStripeSubscriptionRepository';
import type { StripeSubscriptionRecordInput } from '@intelliflow/application';

function input(
  overrides: Partial<StripeSubscriptionRecordInput> = {}
): StripeSubscriptionRecordInput {
  return {
    stripeSubscriptionId: 'sub_1',
    stripeCustomerId: 'cus_1',
    status: 'ACTIVE',
    currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
    cancelAtPeriodEnd: false,
    tenantId: 'tenant_1',
    tenantSlug: 'acme',
    ...overrides,
  };
}

describe('PrismaStripeSubscriptionRepository', () => {
  const upsert = vi.fn();
  const prisma = { stripeSubscription: { upsert } } as unknown as PrismaClient;
  let repo: PrismaStripeSubscriptionRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new PrismaStripeSubscriptionRepository(prisma);
  });

  it('upserts keyed on stripeSubscriptionId with create + update payloads', async () => {
    upsert.mockResolvedValue({});
    await repo.upsertFromWebhook(input());

    const arg = upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ stripeSubscriptionId: 'sub_1' });
    expect(arg.create).toMatchObject({
      stripeSubscriptionId: 'sub_1',
      stripeCustomerId: 'cus_1',
      status: 'ACTIVE',
      tenantId: 'tenant_1',
      tenantSlug: 'acme',
    });
    expect(arg.update).toMatchObject({ status: 'ACTIVE', tenantSlug: 'acme' });
    expect(arg.update.stripeSubscriptionId).toBeUndefined(); // immutable key not in update
  });
});

describe('InMemoryStripeSubscriptionRepository', () => {
  let repo: InMemoryStripeSubscriptionRepository;

  beforeEach(() => {
    repo = new InMemoryStripeSubscriptionRepository();
  });

  it('stores and reads back by subscription id', async () => {
    await repo.upsertFromWebhook(input());
    expect(repo.get('sub_1')?.status).toBe('ACTIVE');
  });

  it('upsert overwrites the prior record (idempotent on id)', async () => {
    await repo.upsertFromWebhook(input({ status: 'ACTIVE' }));
    await repo.upsertFromWebhook(input({ status: 'CANCELED' }));
    expect(repo.get('sub_1')?.status).toBe('CANCELED');
  });

  it('returns undefined for an unknown id', () => {
    expect(repo.get('nope')).toBeUndefined();
  });
});
