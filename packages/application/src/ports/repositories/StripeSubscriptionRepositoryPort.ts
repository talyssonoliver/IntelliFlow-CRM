/**
 * StripeSubscription Repository Port
 * Re-exports the domain contract for hexagonal architecture.
 *
 * @task IFC-314 - CRM->portal delivery/billing sync (step 4)
 */

export type {
  StripeSubscriptionRepository,
  StripeSubscriptionRecordInput,
  StripeSubscriptionStatusValue,
  StripeSubscriptionStatusDb,
  PortalSubscriptionStatus,
} from '@intelliflow/domain';
