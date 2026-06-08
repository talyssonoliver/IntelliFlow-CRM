/**
 * SetupInstalment Repository Port
 * Re-exports the domain contract for hexagonal architecture.
 *
 * The domain layer defines the entity + repository contract; the application
 * layer re-exports for use-case dependencies; the adapters layer implements it.
 *
 * @task IFC-314 - CRM->portal delivery/billing sync
 */

export type {
  SetupInstalmentRepository,
  SetupInstalmentSpec,
  SetupInstalmentRecord,
  SetupInstalmentStatus,
  DeliveryTier,
} from '@intelliflow/domain';
