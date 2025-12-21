import { Result, DomainError } from '@intelliflow/domain';

/**
 * Account Repository Port
 * Defines the contract for account persistence
 * Implementation lives in adapters layer
 *
 * NOTE: Account entity not yet implemented in domain layer (IFC-103)
 * This is a placeholder interface to demonstrate hexagonal architecture
 */

// Placeholder types until Account aggregate is implemented
export interface AccountId {
  value: string;
}

export interface Account {
  id: AccountId;
  name: string;
  industry?: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountRepository {
  /**
   * Save an account (create or update)
   */
  save(account: Account): Promise<void>;

  /**
   * Find an account by ID
   */
  findById(id: AccountId): Promise<Account | null>;

  /**
   * Find accounts by owner
   */
  findByOwnerId(ownerId: string): Promise<Account[]>;

  /**
   * Delete an account
   */
  delete(id: AccountId): Promise<void>;
}
