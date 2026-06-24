/**
 * Prisma implementation of SetupInstalmentRepository.
 *
 * Persists the setup-fee instalments for a won opportunity. Maps the domain's
 * lowercase status (`due`/`paid`/`overdue`) to the Prisma `SetupInstalmentStatus`
 * enum (`DUE`/`PAID`/`OVERDUE`) and back.
 *
 * @task IFC-314 - CRM->portal delivery/billing sync
 */

import type { PrismaClient } from '@intelliflow/db';
import type {
  SetupInstalmentRepository,
  SetupInstalmentSpec,
  SetupInstalmentRecord,
  SetupInstalmentStatus,
} from '@intelliflow/application';

type DbStatus = 'DUE' | 'PAID' | 'OVERDUE';

const TO_DB: Record<SetupInstalmentStatus, DbStatus> = {
  due: 'DUE',
  paid: 'PAID',
  overdue: 'OVERDUE',
};

const FROM_DB: Record<DbStatus, SetupInstalmentStatus> = {
  DUE: 'due',
  PAID: 'paid',
  OVERDUE: 'overdue',
};

export class PrismaSetupInstalmentRepository implements SetupInstalmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createForOpportunity(args: {
    opportunityId: string;
    tenantId: string;
    instalments: SetupInstalmentSpec[];
  }): Promise<void> {
    if (args.instalments.length === 0) return;

    await this.prisma.setupInstalment.createMany({
      data: args.instalments.map((inst) => ({
        opportunityId: args.opportunityId,
        tenantId: args.tenantId,
        n: inst.n,
        amountCents: inst.amountCents,
        currency: inst.currency,
        status: TO_DB[inst.status],
        dueAt: inst.dueAt,
      })),
      // Idempotent: a retried deal-won closure skips already-created instalments
      // (the @@unique([opportunityId, n]) constraint backs this).
      skipDuplicates: true,
    });
  }

  async findByOpportunity(
    opportunityId: string,
    tenantId: string
  ): Promise<SetupInstalmentRecord[]> {
    const rows = await this.prisma.setupInstalment.findMany({
      where: { opportunityId, tenantId },
      orderBy: { n: 'asc' },
    });

    return rows.map((row) => ({
      n: row.n,
      amountCents: row.amountCents,
      currency: row.currency,
      status: FROM_DB[row.status as DbStatus],
      dueAt: row.dueAt,
      paidAt: row.paidAt,
      stripeInvoiceId: row.stripeInvoiceId,
      hostedInvoiceUrl: row.hostedInvoiceUrl,
    }));
  }

  async setStripeInvoiceId(args: {
    opportunityId: string;
    tenantId: string;
    n: number;
    stripeInvoiceId: string;
    hostedInvoiceUrl?: string | null;
  }): Promise<void> {
    // Scope the write by tenant too: updateMany lets us add the tenantId guard
    // that the (opportunityId, n) unique key alone would not enforce. Only stamp
    // the hosted URL when the caller supplies it (undefined = leave untouched).
    await this.prisma.setupInstalment.updateMany({
      where: { opportunityId: args.opportunityId, tenantId: args.tenantId, n: args.n },
      data: {
        stripeInvoiceId: args.stripeInvoiceId,
        ...(args.hostedInvoiceUrl !== undefined ? { hostedInvoiceUrl: args.hostedInvoiceUrl } : {}),
      },
    });
  }

  async markPaidByStripeInvoiceId(args: { stripeInvoiceId: string; paidAt: Date }): Promise<void> {
    // The invoice id is globally unique (@unique); updateMany keeps this a no-op
    // when the invoice is not a setup-fee instalment, instead of throwing.
    await this.prisma.setupInstalment.updateMany({
      where: { stripeInvoiceId: args.stripeInvoiceId },
      data: { status: TO_DB.paid, paidAt: args.paidAt },
    });
  }
}
