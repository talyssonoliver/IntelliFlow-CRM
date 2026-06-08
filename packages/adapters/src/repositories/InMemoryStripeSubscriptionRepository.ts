/**
 * In-memory StripeSubscriptionRepository for tests/local wiring.
 *
 * @task IFC-314 - CRM->portal delivery/billing sync (step 4)
 */

import type {
  StripeSubscriptionRepository,
  StripeSubscriptionRecordInput,
} from '@intelliflow/application';

export class InMemoryStripeSubscriptionRepository implements StripeSubscriptionRepository {
  private readonly store = new Map<string, StripeSubscriptionRecordInput>();

  async upsertFromWebhook(input: StripeSubscriptionRecordInput): Promise<void> {
    this.store.set(input.stripeSubscriptionId, { ...input });
  }

  /** Test helper: read a stored subscription by its Stripe id. */
  get(stripeSubscriptionId: string): StripeSubscriptionRecordInput | undefined {
    return this.store.get(stripeSubscriptionId);
  }
}
