/**
 * Prisma-backed Opportunity→Stripe-customer link reader/writer for setup-fee
 * invoicing (IFC-314 step 8). Extracted from the worker bootstrap so the
 * select→link mapping is unit-testable (the container just wires it).
 *
 * Tenant-scoped: `getLink` reads via `findFirst({ id, tenantId })` — the id is
 * globally unique, but the tenant guard keeps the discipline the repo rule wants.
 */

/** Structural slice of PrismaClient this needs (so tests pass a plain mock). */
export interface OpportunityCustomersPrisma {
  opportunity: {
    findFirst(args: {
      where: { id: string; tenantId: string };
      select: {
        stripeCustomerId: true;
        name: true;
        owner: { select: { stripeCustomerId: true } };
        contact: { select: { email: true } };
        account: { select: { name: true } };
      };
    }): Promise<{
      stripeCustomerId: string | null;
      name: string;
      owner: { stripeCustomerId: string | null } | null;
      contact: { email: string | null } | null;
      account: { name: string } | null;
    } | null>;
    update(args: { where: { id: string }; data: { stripeCustomerId: string } }): Promise<unknown>;
  };
}

export interface OpportunityCustomerLinkRow {
  stripeCustomerId: string | null;
  ownerStripeCustomerId: string | null;
  email: string | null;
  name: string;
}

export function createPrismaOpportunityCustomers(prisma: OpportunityCustomersPrisma) {
  return {
    async getLink(
      opportunityId: string,
      tenantId: string
    ): Promise<OpportunityCustomerLinkRow | null> {
      const o = await prisma.opportunity.findFirst({
        where: { id: opportunityId, tenantId },
        select: {
          stripeCustomerId: true,
          name: true,
          owner: { select: { stripeCustomerId: true } },
          contact: { select: { email: true } },
          account: { select: { name: true } },
        },
      });
      if (!o) return null;
      return {
        stripeCustomerId: o.stripeCustomerId,
        ownerStripeCustomerId: o.owner?.stripeCustomerId ?? null,
        email: o.contact?.email ?? null,
        name: o.account?.name ?? o.name,
      };
    },
    async setStripeCustomerId(opportunityId: string, customerId: string): Promise<void> {
      await prisma.opportunity.update({
        where: { id: opportunityId },
        data: { stripeCustomerId: customerId },
      });
    },
  };
}
