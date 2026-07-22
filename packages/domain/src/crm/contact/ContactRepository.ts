import { Contact } from './Contact';
import { ContactId } from './ContactId';
import { Email } from '../lead/Email';
import { RepositoryTransaction } from '../../shared/RepositoryTransaction';

/**
 * Contact Repository Interface
 * Defines the contract for contact persistence
 * Implementation lives in adapters layer
 */
/**
 * @knipignore Intentional public repository contract for adapter implementations.
 */
export interface ContactRepository {
  /**
   * Save a contact (create or update)
   */
  save(contact: Contact, tx?: RepositoryTransaction): Promise<void>;

  /**
   * Find a contact by ID
   */
  findById(id: ContactId): Promise<Contact | null>;

  /**
   * Find a contact by email WITHIN a tenant.
   *
   * The Contact table is uniquely keyed on `@@unique([tenantId, email])`, so an
   * email-only lookup spans tenants and (a) raises false "already in use"
   * conflicts and (b) leaks that another tenant holds the email. Always scope
   * uniqueness/lookup checks by tenant. (#427)
   */
  findByEmailInTenant(email: Email, tenantId: string): Promise<Contact | null>;

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
   * Check if a contact with this email exists WITHIN a tenant.
   * Tenant-scoped to match `@@unique([tenantId, email])` — an email-only check
   * leaks/false-conflicts across tenants. (#427)
   */
  existsByEmailInTenant(email: Email, tenantId: string): Promise<boolean>;

  /**
   * Count contacts by account
   */
  countByAccountId(accountId: string): Promise<number>;

  /**
   * IFC-310: Transactional merge.
   * Atomically re-parents all child rows (activities, notes, opportunities,
   * tasks, AI insights, tag assignments) from secondary → primary, merges
   * scalar fields onto primary, then deletes secondary. Rolls back the whole
   * transaction on any failure.
   *
   * Tenant guard: both primary and secondary MUST belong to `tenantId`;
   * mismatch throws `CrossTenantOrNotFoundError`.
   */
  mergeInTransaction(input: MergeInTransactionInput): Promise<MergeInTransactionResult>;

  /**
   * IFC-310 AC-010: Link orphan contacts to an account by email domain,
   * atomically inside a single transaction. Returns the list of linked
   * contact ids. If the match set exceeds `maxBatch`, returns `{ overflow:
   * true, overflowSampleIds }` without performing any update so the caller
   * can flag for human review (R9).
   */
  linkContactsToAccountByEmailDomain(
    input: LinkContactsByDomainInput
  ): Promise<LinkContactsByDomainResult>;
}

/**
 * @knipignore Intentional public DTO for the domain-link contract.
 */
export interface LinkContactsByDomainInput {
  accountId: string;
  domain: string;
  tenantId: string;
  maxBatch: number;
}

/**
 * @knipignore Intentional public DTO for the domain-link contract.
 */
export type LinkContactsByDomainResult =
  | { overflow: false; linkedIds: string[] }
  | { overflow: true; overflowSampleIds: string[] };

/**
 * @knipignore Intentional public DTO for the transactional merge contract.
 */
export interface MergeInTransactionInput {
  primaryId: string;
  secondaryId: string;
  tenantId: string;
  mergedBy: string;
  /** Scalar fields to adopt from secondary when primary has them null/empty. */
  mergeFields: Partial<{
    title: string;
    phone: string;
    department: string;
    accountId: string;
  }>;
}

/**
 * @knipignore Intentional public DTO for the transactional merge contract.
 */
export interface MergeInTransactionResult {
  survivingContactId: string;
  mergedContactId: string;
  fieldsUpdated: string[];
  rowsReparented: {
    activities: number;
    notes: number;
    opportunities: number;
    tasks: number;
    aiInsights: number;
    tagAssignments: number;
  };
  mergedAt: Date;
}

/**
 * Contact Query Service Interface
 * For complex read-only queries that don't need domain logic
 */
/**
 * @knipignore Intentional public query contract shared across application boundaries.
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
/**
 * @knipignore Intentional public query DTO shared across application boundaries.
 */
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

/**
 * @knipignore Intentional public query DTO shared across application boundaries.
 */
export interface ContactSearchResult {
  contacts: Contact[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/**
 * @knipignore Intentional public query DTO shared across application boundaries.
 */
export interface ContactStatistics {
  total: number;
  byDepartment: Record<string, number>;
  withAccount: number;
  withoutAccount: number;
  convertedFromLeads: number;
}
