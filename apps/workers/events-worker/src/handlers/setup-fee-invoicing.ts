/**
 * Setup-fee invoicing (IFC-314, step 8 — the deferred billing wire).
 *
 * Closes the loop the portal-delivery-sync handler left open: once a deal is won
 * and its 3×£167 setup-fee instalments are persisted (DUE, day 0/7/14), this
 * creates and finalises a Stripe invoice per instalment so the client is actually
 * billed. The portal still only *reflects* status — billing stays CRM-owned.
 *
 * Customer resolution chain (`resolveStripeCustomerId`):
 *   Opportunity.stripeCustomerId → deal-owner User.stripeCustomerId → create a
 *   Stripe customer and stamp it back onto the Opportunity.
 *
 * Scheduling: no cron / delayed jobs. All instalments are invoiced at deal-won;
 * each invoice carries `collection_method=send_invoice` + `days_until_due` equal
 * to the instalment's day offset, so Stripe sends/collects on the right date.
 *
 * Idempotent: only instalments that are DUE and have no `stripeInvoiceId` are
 * invoiced, so a retried deal-won closure never double-bills. Best-effort: a
 * billing failure is logged, never thrown — it must not block tenant
 * provisioning or the delivery push.
 *
 * Structurally typed (no concrete Prisma/Stripe imports) so it is unit-testable.
 */

const MS_PER_DAY = 86_400_000;

interface BillingResult<T> {
  isFailure: boolean;
  value?: T;
  error?: { message?: string } | null;
}

interface InstalmentRow {
  n: number;
  amountCents: number;
  currency: string;
  status: 'due' | 'paid' | 'overdue';
  dueAt: Date | null;
  stripeInvoiceId: string | null;
}

interface LoggerLike {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

/** The Opportunity→Stripe-customer link + the data needed to create a customer. */
export interface OpportunityCustomerLink {
  stripeCustomerId: string | null;
  ownerStripeCustomerId: string | null;
  email: string | null;
  name: string;
}

export interface SetupFeeInvoicingDeps {
  instalments: {
    findByOpportunity(opportunityId: string, tenantId: string): Promise<InstalmentRow[]>;
    setStripeInvoiceId(args: {
      opportunityId: string;
      tenantId: string;
      n: number;
      stripeInvoiceId: string;
    }): Promise<void>;
  };
  customers: {
    getLink(opportunityId: string, tenantId: string): Promise<OpportunityCustomerLink | null>;
    setStripeCustomerId(opportunityId: string, customerId: string): Promise<void>;
  };
  billing: {
    createCustomer(params: {
      email?: string;
      name?: string;
      metadata?: Record<string, string>;
    }): Promise<BillingResult<{ id: string }>>;
    createInvoiceItem(params: {
      customerId: string;
      amount: number;
      currency: string;
      description?: string;
    }): Promise<BillingResult<{ id: string }>>;
    createInvoice(params: {
      customerId: string;
      collectionMethod?: 'send_invoice' | 'charge_automatically';
      daysUntilDue?: number;
      autoAdvance?: boolean;
      description?: string;
    }): Promise<BillingResult<{ id: string }>>;
    finalizeInvoice(invoiceId: string): Promise<BillingResult<{ id: string }>>;
  };
  logger: LoggerLike;
  /** Injectable clock for deterministic `days_until_due` in tests. */
  now?: () => Date;
}

/**
 * Resolve the Stripe customer for an opportunity, creating + stamping one when
 * neither the opportunity nor its owner has one. Returns null only when a
 * customer must be created but creation fails.
 */
async function resolveStripeCustomerId(
  deps: SetupFeeInvoicingDeps,
  opportunityId: string,
  link: OpportunityCustomerLink
): Promise<string | null> {
  if (link.stripeCustomerId) return link.stripeCustomerId;
  if (link.ownerStripeCustomerId) {
    // Reuse the owner's customer but stamp it onto the opportunity so future
    // runs resolve in one hop (and the link is explicit/auditable).
    await deps.customers.setStripeCustomerId(opportunityId, link.ownerStripeCustomerId);
    return link.ownerStripeCustomerId;
  }
  const created = await deps.billing.createCustomer({
    email: link.email ?? undefined,
    name: link.name,
    metadata: { opportunityId },
  });
  if (created.isFailure || !created.value) {
    deps.logger.error(
      { opportunityId, error: created.error?.message },
      '[setup-fee] could not create Stripe customer'
    );
    return null;
  }
  await deps.customers.setStripeCustomerId(opportunityId, created.value.id);
  return created.value.id;
}

/**
 * Invoice every DUE, not-yet-invoiced setup-fee instalment for an opportunity.
 * Returns the count actually invoiced. Never throws.
 */
export async function invoiceSetupInstalments(
  deps: SetupFeeInvoicingDeps,
  args: { opportunityId: string; tenantId: string }
): Promise<{ invoiced: number }> {
  const { opportunityId, tenantId } = args;
  try {
    const rows = await deps.instalments.findByOpportunity(opportunityId, tenantId);
    const pending = rows
      .filter((r) => r.status === 'due' && !r.stripeInvoiceId)
      .sort((a, b) => a.n - b.n);
    if (pending.length === 0) return { invoiced: 0 };

    const link = await deps.customers.getLink(opportunityId, tenantId);
    if (!link) {
      deps.logger.warn({ opportunityId }, '[setup-fee] opportunity not found; skipping invoicing');
      return { invoiced: 0 };
    }

    const customerId = await resolveStripeCustomerId(deps, opportunityId, link);
    if (!customerId) return { invoiced: 0 };

    const now = (deps.now ?? (() => new Date()))();
    let invoiced = 0;
    for (const inst of pending) {
      const daysUntilDue = inst.dueAt
        ? Math.max(0, Math.round((inst.dueAt.getTime() - now.getTime()) / MS_PER_DAY))
        : 0;
      const label = `Leangency setup fee — instalment ${inst.n}/${rows.length}`;

      // One pending invoice item → one invoice (createInvoice pulls the customer's
      // pending items, so item-then-invoice keeps each invoice to a single line).
      const item = await deps.billing.createInvoiceItem({
        customerId,
        amount: inst.amountCents,
        currency: inst.currency,
        description: label,
      });
      if (item.isFailure) {
        deps.logger.error(
          { opportunityId, n: inst.n, error: item.error?.message },
          '[setup-fee] createInvoiceItem failed'
        );
        continue;
      }
      const invoice = await deps.billing.createInvoice({
        customerId,
        collectionMethod: 'send_invoice',
        daysUntilDue,
        autoAdvance: true,
        description: label,
      });
      if (invoice.isFailure || !invoice.value) {
        deps.logger.error(
          { opportunityId, n: inst.n, error: invoice.error?.message },
          '[setup-fee] createInvoice failed'
        );
        continue;
      }
      const finalized = await deps.billing.finalizeInvoice(invoice.value.id);
      if (finalized.isFailure) {
        deps.logger.error(
          {
            opportunityId,
            n: inst.n,
            invoiceId: invoice.value.id,
            error: finalized.error?.message,
          },
          '[setup-fee] finalizeInvoice failed'
        );
        continue;
      }
      await deps.instalments.setStripeInvoiceId({
        opportunityId,
        tenantId,
        n: inst.n,
        stripeInvoiceId: invoice.value.id,
      });
      invoiced++;
    }

    deps.logger.info(
      { opportunityId, invoiced, pending: pending.length },
      '[setup-fee] invoiced setup-fee instalments'
    );
    return { invoiced };
  } catch (err) {
    // Best-effort: billing must never block provisioning/delivery push.
    deps.logger.error(
      { opportunityId, error: err instanceof Error ? err.message : String(err) },
      '[setup-fee] invoicing failed (non-fatal)'
    );
    return { invoiced: 0 };
  }
}
