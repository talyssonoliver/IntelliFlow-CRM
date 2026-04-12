/**
 * Lead Repository Port
 * Re-exports the repository interface from domain layer
 * This file exists to make the architecture explicit:
 * - Domain defines the contract
 * - Application uses the port
 * - Adapters implement the port
 */
export type { LeadRepository, LeadQueryService } from '@intelliflow/domain';
