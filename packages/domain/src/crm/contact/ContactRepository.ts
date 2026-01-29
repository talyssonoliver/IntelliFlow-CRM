import { Contact } from './Contact';
import { ContactId } from './ContactId';
import { Email } from '../lead/Email';

/**
 * Contact Repository Interface
 * Defines the contract for contact persistence
 * Implementation lives in adapters layer
 */
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
   * Find a contact by email
   */
  findByEmail(email: Email): Promise<Contact | null>;

  /**
   * Find all contacts for an owner
   */
  findByOwnerId(ownerId: string): Promise<Contact[]>;

  /**
   * Find contacts by account
   */
  findByAccountId(accountId: string): Promise<Contact[]>;

  /**
   * Find contact converted from a specific lead
   */
  findByLeadId(leadId: string): Promise<Contact | null>;

  /**
   * Delete a contact
   */
  delete(id: ContactId): Promise<void>;

  /**
   * Check if email exists
   */
  existsByEmail(email: Email): Promise<boolean>;

  /**
   * Count contacts by account
   */
  countByAccountId(accountId: string): Promise<number>;
}

/**
 * Contact Query Service Interface
 * For complex read-only queries that don't need domain logic
 */
export interface ContactQueryService {
  /**
   * Search contacts with filters
   */
  search(params: ContactSearchParams): Promise<ContactSearchResult>;

  /**
   * Get contact statistics
   */
  getStatistics(ownerId?: string): Promise<ContactStatistics>;
}

// Query Types
export interface ContactSearchParams {
  query?: string;
  accountId?: string;
  department?: string;
  ownerId?: string;
  hasAccount?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ContactSearchResult {
  contacts: Contact[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface ContactStatistics {
  total: number;
  byDepartment: Record<string, number>;
  withAccount: number;
  withoutAccount: number;
  convertedFromLeads: number;
}
