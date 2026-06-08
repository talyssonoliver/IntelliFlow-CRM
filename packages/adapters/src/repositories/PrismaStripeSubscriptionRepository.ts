/**
 * Prisma implementation of StripeSubscriptionRepository.
 *
 * Upserts subscription state from `customer.subscription.*` webhooks, keyed on
 * the unique `stripeSubscriptionId`.
 *
 * @task IFC-314 - CRM->portal delivery/billing sync (step 4)
 */

import type { PrismaClient } from '@intelliflow/db';
import type {
  StripeSubscriptionRepository,
  StripeSubscriptionRecordInput,
} from '@intelliflow/application';

export class PrismaStripeSubscriptionRepository implements StripeSubscriptionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertFromWebhook(input: StripeSubscriptionRecordInput): Promise<void> {
    const data = {
      stripeCustomerId: input.stripeCustomerId,
      status: input.status,
      currentPeriodEnd: input.currentPeriodEnd,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      tenantId: input.tenantId,
      tenantSlug: input.tenantSlug,
    };

    await this.prisma.stripeSubscription.upsert({
      where: { stripeSubscriptionId: input.stripeSubscriptionId },
      create: { stripeSubscriptionId: input.stripeSubscriptionId, ...data },
      update: data,
    });
  }
}
