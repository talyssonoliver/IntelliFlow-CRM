/**
 * In-memory implementation of SetupInstalmentRepository.
 *
 * For tests and local wiring. Mirrors the Prisma adapter's semantics: idempotent
 * on (opportunityId, n) and tenant-scoped reads.
 *
 * @task IFC-314 - CRM->portal delivery/billing sync
 */

import type {
  SetupInstalmentRepository,
  SetupInstalmentSpec,
  SetupInstalmentRecord,
} from '@intelliflow/application';

interface StoredInstalment extends SetupInstalmentRecord {
  opportunityId: string;
  tenantId: string;
}

export class InMemorySetupInstalmentRepository implements SetupInstalmentRepository {
  private readonly store: StoredInstalment[] = [];

  async createForOpportunity(args: {
    opportunityId: string;
    tenantId: string;
    instalments: SetupInstalmentSpec[];
  }): Promise<void> {
    for (const inst of args.instalments) {
      const exists = this.store.some(
        (row) => row.opportunityId === args.opportunityId && row.n === inst.n
      );
      if (exists) continue; // idempotent on (opportunityId, n)

      this.store.push({
        opportunityId: args.opportunityId,
        tenantId: args.tenantId,
        n: inst.n,
        amountCents: inst.amountCents,
        currency: inst.currency,
        status: inst.status,
        dueAt: inst.dueAt,
        paidAt: null,
        stripeInvoiceId: null,
        hostedInvoiceUrl: null,
      });
    }
  }

  async findByOpportunity(
    opportunityId: string,
    tenantId: string
  ): Promise<SetupInstalmentRecord[]> {
    return this.store
      .filter((row) => row.opportunityId === opportunityId && row.tenantId === tenantId)
      .sort((a, b) => a.n - b.n)
      .map(({ opportunityId: _o, tenantId: _t, ...record }) => ({ ...record }));
  }

  async setStripeInvoiceId(args: {
    opportunityId: string;
    tenantId: string;
    n: number;
    stripeInvoiceId: string;
    hostedInvoiceUrl?: string | null;
  }): Promise<void> {
    const row = this.store.find(
      (r) =>
        r.opportunityId === args.opportunityId && r.tenantId === args.tenantId && r.n === args.n
    );
    if (row) {
      row.stripeInvoiceId = args.stripeInvoiceId;
      if (args.hostedInvoiceUrl !== undefined) row.hostedInvoiceUrl = args.hostedInvoiceUrl;
    }
  }

  async markPaidByStripeInvoiceId(args: { stripeInvoiceId: string; paidAt: Date }): Promise<void> {
    const row = this.store.find((r) => r.stripeInvoiceId === args.stripeInvoiceId);
    if (row) {
      row.status = 'paid';
      row.paidAt = args.paidAt;
    }
  }
}
