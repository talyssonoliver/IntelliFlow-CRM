import { describe, it, expect, beforeEach } from 'vitest';
import { InMemorySetupInstalmentRepository } from '../InMemorySetupInstalmentRepository';
import type { SetupInstalmentSpec } from '@intelliflow/application';

const OPP = 'opp_1';
const TENANT = 'tenant_1';

function plan(): SetupInstalmentSpec[] {
  return [
    { n: 1, amountCents: 16700, currency: 'GBP', status: 'due', dueAt: new Date('2026-06-01Z') },
    { n: 2, amountCents: 16700, currency: 'GBP', status: 'due', dueAt: new Date('2026-06-08Z') },
    { n: 3, amountCents: 16700, currency: 'GBP', status: 'due', dueAt: new Date('2026-06-15Z') },
  ];
}

describe('InMemorySetupInstalmentRepository', () => {
  let repo: InMemorySetupInstalmentRepository;

  beforeEach(() => {
    repo = new InMemorySetupInstalmentRepository();
  });

  it('persists a plan and reads it back ordered by n', async () => {
    await repo.createForOpportunity({ opportunityId: OPP, tenantId: TENANT, instalments: plan() });
    const rows = await repo.findByOpportunity(OPP, TENANT);
    expect(rows.map((r) => r.n)).toEqual([1, 2, 3]);
    expect(rows[0]).toMatchObject({ amountCents: 16700, currency: 'GBP', status: 'due' });
    expect(rows[0].paidAt).toBeNull();
    expect(rows[0].stripeInvoiceId).toBeNull();
  });

  it('is idempotent on (opportunityId, n): a re-run does not duplicate rows', async () => {
    await repo.createForOpportunity({ opportunityId: OPP, tenantId: TENANT, instalments: plan() });
    await repo.createForOpportunity({ opportunityId: OPP, tenantId: TENANT, instalments: plan() });
    const rows = await repo.findByOpportunity(OPP, TENANT);
    expect(rows).toHaveLength(3);
  });

  it('scopes reads by tenant', async () => {
    await repo.createForOpportunity({ opportunityId: OPP, tenantId: TENANT, instalments: plan() });
    expect(await repo.findByOpportunity(OPP, 'other_tenant')).toEqual([]);
  });

  it('attaches a Stripe invoice id to the targeted instalment only', async () => {
    await repo.createForOpportunity({ opportunityId: OPP, tenantId: TENANT, instalments: plan() });
    await repo.setStripeInvoiceId({
      opportunityId: OPP,
      tenantId: TENANT,
      n: 1,
      stripeInvoiceId: 'in_abc',
    });
    const rows = await repo.findByOpportunity(OPP, TENANT);
    expect(rows.find((r) => r.n === 1)?.stripeInvoiceId).toBe('in_abc');
    expect(rows.find((r) => r.n === 2)?.stripeInvoiceId).toBeNull();
  });

  it('setStripeInvoiceId is a no-op when the instalment does not exist', async () => {
    await expect(
      repo.setStripeInvoiceId({ opportunityId: OPP, tenantId: TENANT, n: 9, stripeInvoiceId: 'x' })
    ).resolves.toBeUndefined();
  });

  it('handles an empty plan without creating rows', async () => {
    await repo.createForOpportunity({ opportunityId: OPP, tenantId: TENANT, instalments: [] });
    expect(await repo.findByOpportunity(OPP, TENANT)).toEqual([]);
  });
});
