import { Result, DomainError } from '@intelliflow/domain';

/**
 * Contact Repository Port
 * Defines the contract for contact persistence
 * Implementation lives in adapters layer
 *
 * NOTE: Contact entity not yet implemented in domain layer (IFC-102)
 * This is a placeholder interface to demonstrate hexagonal architecture
 */

// Placeholder types until Contact aggregate is implemented
export interface ContactId {
  value: string;
}

export interface Contact {
  id: ContactId;
  email: string;
  firstName?: string;
  lastName?: string;
  accountId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactRepository {
  /**
   * Save a contact (create or update)
   */
  save(contact: Contact): Promise<void>;

  /**
   * Find a contact by ID
   */
  findById(id: ContactId): Promise<Contact | null>;

  /**
   * Find contacts by account
   */
  findByAccountId(accountId: string): Promise<Contact[]>;

  /**
   * Delete a contact
   */
  delete(id: ContactId): Promise<void>;
}
