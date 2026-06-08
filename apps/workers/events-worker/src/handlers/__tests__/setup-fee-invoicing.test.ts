import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  invoiceSetupInstalments,
  type SetupFeeInvoicingDeps,
  type OpportunityCustomerLink,
} from '../setup-fee-invoicing';

const NOW = new Date('2026-06-08T00:00:00.000Z');

function ok<T>(value: T) {
  return { isFailure: false, value };
}
function fail(message: string) {
  return { isFailure: true, error: { message } };
}

function makeInstalment(
  over: Partial<{
    n: number;
    amountCents: number;
    currency: string;
    status: 'due' | 'paid' | 'overdue';
    dueAt: Date | null;
    stripeInvoiceId: string | null;
  }> = {}
) {
  return {
    n: 1,
    amountCents: 16700,
    currency: 'GBP',
    status: 'due' as const,
    dueAt: NOW,
    stripeInvoiceId: null,
    ...over,
  };
}

function makeDeps(
  over: {
    instalmentRows?: ReturnType<typeof makeInstalment>[];
    link?: OpportunityCustomerLink | null;
    billing?: Partial<SetupFeeInvoicingDeps['billing']>;
  } = {}
): SetupFeeInvoicingDeps & {
  _setInvoice: ReturnType<typeof vi.fn>;
  _setCustomer: ReturnType<typeof vi.fn>;
} {
  const setInvoice = vi.fn(async () => {});
  const setCustomer = vi.fn(async () => {});
  let invoiceSeq = 0;
  const billing: SetupFeeInvoicingDeps['billing'] = {
    createCustomer: vi.fn(async () => ok({ id: 'cus_new' })),
    createInvoiceItem: vi.fn(async () => ok({ id: 'ii_x' })),
    createInvoice: vi.fn(async () => ok({ id: `in_${++invoiceSeq}` })),
    finalizeInvoice: vi.fn(async (id: string) => ok({ id })),
    ...over.billing,
  };
  return {
    instalments: {
      findByOpportunity: vi.fn(async () => over.instalmentRows ?? [makeInstalment()]),
      setStripeInvoiceId: setInvoice,
    },
    customers: {
      getLink: vi.fn(async () =>
        over.link === undefined
          ? {
              stripeCustomerId: 'cus_opp',
              ownerStripeCustomerId: null,
              email: 'a@b.co',
              name: 'Acme',
            }
          : over.link
      ),
      setStripeCustomerId: setCustomer,
    },
    billing,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    now: () => NOW,
    _setInvoice: setInvoice,
    _setCustomer: setCustomer,
  };
}

const ARGS = { opportunityId: 'opp_1', tenantId: 'ten_1' };

describe('invoiceSetupInstalments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('invoices each DUE un-invoiced instalment and stores its invoice id', async () => {
    const deps = makeDeps({
      instalmentRows: [
        makeInstalment({ n: 1 }),
        makeInstalment({ n: 2 }),
        makeInstalment({ n: 3 }),
      ],
    });
    const res = await invoiceSetupInstalments(deps, ARGS);
    expect(res.invoiced).toBe(3);
    expect(deps.billing.createInvoiceItem).toHaveBeenCalledTimes(3);
    expect(deps.billing.createInvoice).toHaveBeenCalledTimes(3);
    expect(deps.billing.finalizeInvoice).toHaveBeenCalledTimes(3);
    expect(deps._setInvoice).toHaveBeenCalledTimes(3);
    expect(deps._setInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ opportunityId: 'opp_1', tenantId: 'ten_1', n: 1 })
    );
  });

  it('uses Opportunity.stripeCustomerId directly (no create, no owner)', async () => {
    const deps = makeDeps();
    await invoiceSetupInstalments(deps, ARGS);
    expect(deps.billing.createCustomer).not.toHaveBeenCalled();
    expect(deps._setCustomer).not.toHaveBeenCalled();
    expect(deps.billing.createInvoiceItem).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cus_opp' })
    );
  });

  it('falls back to the owner customer and stamps it onto the opportunity', async () => {
    const deps = makeDeps({
      link: {
        stripeCustomerId: null,
        ownerStripeCustomerId: 'cus_owner',
        email: 'a@b.co',
        name: 'Acme',
      },
    });
    await invoiceSetupInstalments(deps, ARGS);
    expect(deps.billing.createCustomer).not.toHaveBeenCalled();
    expect(deps._setCustomer).toHaveBeenCalledWith('opp_1', 'cus_owner');
    expect(deps.billing.createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cus_owner', collectionMethod: 'send_invoice' })
    );
  });

  it('creates a customer when neither opportunity nor owner has one, then stamps it', async () => {
    const deps = makeDeps({
      link: { stripeCustomerId: null, ownerStripeCustomerId: null, email: 'a@b.co', name: 'Acme' },
    });
    await invoiceSetupInstalments(deps, ARGS);
    expect(deps.billing.createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'a@b.co',
        name: 'Acme',
        metadata: { opportunityId: 'opp_1' },
      })
    );
    expect(deps._setCustomer).toHaveBeenCalledWith('opp_1', 'cus_new');
  });

  it('is idempotent: skips PAID and already-invoiced instalments', async () => {
    const deps = makeDeps({
      instalmentRows: [
        makeInstalment({ n: 1, status: 'paid' }),
        makeInstalment({ n: 2, stripeInvoiceId: 'in_existing' }),
        makeInstalment({ n: 3 }),
      ],
    });
    const res = await invoiceSetupInstalments(deps, ARGS);
    expect(res.invoiced).toBe(1);
    expect(deps.billing.createInvoice).toHaveBeenCalledTimes(1);
  });

  it('no pending instalments → no-op (no customer resolution)', async () => {
    const deps = makeDeps({ instalmentRows: [makeInstalment({ status: 'paid' })] });
    const res = await invoiceSetupInstalments(deps, ARGS);
    expect(res.invoiced).toBe(0);
    expect(deps.customers.getLink).not.toHaveBeenCalled();
  });

  it('opportunity not found → no-op', async () => {
    const deps = makeDeps({ link: null });
    const res = await invoiceSetupInstalments(deps, ARGS);
    expect(res.invoiced).toBe(0);
    expect(deps.billing.createInvoiceItem).not.toHaveBeenCalled();
  });

  it('customer creation failure → invoices nothing, never throws', async () => {
    const deps = makeDeps({
      link: { stripeCustomerId: null, ownerStripeCustomerId: null, email: null, name: 'Acme' },
      billing: { createCustomer: vi.fn(async () => fail('stripe down')) },
    });
    const res = await invoiceSetupInstalments(deps, ARGS);
    expect(res.invoiced).toBe(0);
    expect(deps.logger.error).toHaveBeenCalled();
  });

  it('best-effort: one invoice failing does not block the others', async () => {
    let call = 0;
    const deps = makeDeps({
      instalmentRows: [makeInstalment({ n: 1 }), makeInstalment({ n: 2 })],
      billing: {
        createInvoice: vi.fn(async () => {
          call += 1;
          return call === 1 ? fail('boom') : ok({ id: 'in_ok' });
        }),
      },
    });
    const res = await invoiceSetupInstalments(deps, ARGS);
    expect(res.invoiced).toBe(1);
    expect(deps._setInvoice).toHaveBeenCalledTimes(1);
  });

  it('computes days_until_due from the instalment due date', async () => {
    const sevenDays = new Date(NOW.getTime() + 7 * 86_400_000);
    const deps = makeDeps({ instalmentRows: [makeInstalment({ n: 2, dueAt: sevenDays })] });
    await invoiceSetupInstalments(deps, ARGS);
    expect(deps.billing.createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ daysUntilDue: 7 })
    );
  });

  it('swallows unexpected errors (best-effort, never throws)', async () => {
    const deps = makeDeps();
    deps.instalments.findByOpportunity = vi.fn(async () => {
      throw new Error('db exploded');
    });
    const res = await invoiceSetupInstalments(deps, ARGS);
    expect(res.invoiced).toBe(0);
    expect(deps.logger.error).toHaveBeenCalled();
  });
});
