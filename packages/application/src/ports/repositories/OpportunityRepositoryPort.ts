import { Result, DomainError } from '@intelliflow/domain';

/**
 * Opportunity Repository Port
 * Defines the contract for opportunity persistence
 * Implementation lives in adapters layer
 *
 * NOTE: Opportunity entity not yet implemented in domain layer (IFC-104)
 * This is a placeholder interface to demonstrate hexagonal architecture
 */

// Placeholder types until Opportunity aggregate is implemented
export interface OpportunityId {
  value: string;
}

export interface Opportunity {
  id: OpportunityId;
  name: string;
  accountId: string;
  amount: number;
  stage: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OpportunityRepository {
  /**
   * Save an opportunity (create or update)
   */
  save(opportunity: Opportunity): Promise<void>;

  /**
   * Find an opportunity by ID
   */
  findById(id: OpportunityId): Promise<Opportunity | null>;

  /**
   * Find opportunities by account
   */
  findByAccountId(accountId: string): Promise<Opportunity[]>;

  /**
   * Delete an opportunity
   */
  delete(id: OpportunityId): Promise<void>;
}
