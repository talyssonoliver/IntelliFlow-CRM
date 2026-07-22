import { Account } from './Account';
import { AccountId } from './AccountId';
import { RepositoryTransaction } from '../../shared/RepositoryTransaction';

/**
 * Raw account record with hierarchy data from persistence layer.
 * Used by findWithChildren to return nested account trees.
 */
/**
 * @knipignore Intentional public repository result contract for hierarchy queries.
 */
export interface AccountHierarchyRecord {
  id: string;
  name: string;
  industry: string | null;
  revenue: number | string | null;
  tenantId: string;
  _count?: { contacts: number; opportunities: number };
  childAccounts?: AccountHierarchyRecord[];
  [key: string]: unknown;
}

/**
 * Account Repository Interface
 * Defines the contract for account persistence
 * Implementation lives in adapters layer
 */
/**
 * @knipignore Intentional public repository contract for adapter implementations.
 */
export interface AccountRepository {
  /**
   * Save an account (create or update)
   * tenantId is embedded in the Account entity — no separate param needed.
   */
  save(account: Account, tx?: RepositoryTransaction): Promise<void>;

  /**
   * Find an account by ID within a tenant (IFC-269 B-02: defense-in-depth)
   */
  findById(id: AccountId, tenantId: string): Promise<Account | null>;

  /**
   * Find accounts by name within a tenant (partial match)
   */
  findByName(name: string, tenantId: string): Promise<Account[]>;

  /**
   * Find all accounts for an owner within a tenant
   */
  findByOwnerId(ownerId: string, tenantId: string): Promise<Account[]>;

  /**
   * Find accounts by industry within a tenant
   */
  findByIndustry(industry: string, tenantId: string): Promise<Account[]>;

  /**
   * Delete an account within a tenant (IFC-269 B-02)
   */
  delete(id: AccountId, tenantId: string): Promise<void>;

  /**
   * Check if account name exists within a tenant (IFC-269 B-03: per-tenant uniqueness)
   */
  existsByName(name: string, tenantId: string): Promise<boolean>;

  /**
   * Count accounts by industry within a tenant
   */
  countByIndustry(tenantId: string): Promise<Record<string, number>>;

  /**
   * Find account with nested children up to maxDepth within a tenant
   */
  findWithChildren(
    id: AccountId,
    maxDepth: number,
    tenantId: string
  ): Promise<AccountHierarchyRecord | null>;

  /**
   * Find ancestor chain from account to root within a tenant
   * Breaks traversal on cross-tenant boundary.
   */
  findAncestors(id: AccountId, tenantId: string): Promise<Account[]>;

  /**
   * Get hierarchy depth within a tenant (number of ancestors)
   */
  getHierarchyDepth(id: AccountId, tenantId: string): Promise<number>;
}

/**
 * Account Query Service Interface
 * For complex read-only queries that don't need domain logic
 */
/**
 * @knipignore Intentional public query contract shared across application boundaries.
 */
export interface AccountQueryService {
  /**
   * Search accounts with filters
   */
  search(params: AccountSearchParams): Promise<AccountSearchResult>;

  /**
   * Get account statistics
   */
  getStatistics(ownerId?: string): Promise<AccountStatistics>;

  /**
   * Get high-value accounts
   */
  getHighValueAccounts(minRevenue: number, ownerId?: string): Promise<Account[]>;
}

// Query Types
/**
 * @knipignore Intentional public query DTO shared across application boundaries.
 */
export interface AccountSearchParams {
  query?: string;
  industry?: string[];
  minRevenue?: number;
  maxRevenue?: number;
  minEmployees?: number;
  maxEmployees?: number;
  ownerId?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * @knipignore Intentional public query DTO shared across application boundaries.
 */
export interface AccountSearchResult {
  accounts: Account[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/**
 * @knipignore Intentional public query DTO shared across application boundaries.
 */
export interface AccountStatistics {
  total: number;
  byIndustry: Record<string, number>;
  averageRevenue: number;
  totalRevenue: number;
  averageEmployees: number;
}
