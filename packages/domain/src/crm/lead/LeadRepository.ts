import { Lead } from './Lead';
import { LeadId } from './LeadId';
import { Email } from './Email';
import { DateRange } from '../../shared/QueryTypes';
import { RepositoryTransaction } from '../../shared/RepositoryTransaction';

/**
 * Thrown by `save` when `opts.expectedStatus` no longer matches the persisted
 * status, i.e. another writer moved the lead after it was read. The caller
 * must re-read and replan; the stale write was NOT applied.
 */
export class LeadStatusConflictError extends Error {
  constructor(
    readonly leadId: string,
    readonly expectedStatus: string
  ) {
    super(`Lead ${leadId} is no longer in status ${expectedStatus}`);
    this.name = 'LeadStatusConflictError';
  }
}

/**
 * Lead Repository Interface
 * Defines the contract for lead persistence
 * Implementation lives in adapters layer
 */
/**
 * @knipignore Intentional public repository contract for adapter implementations.
 */
export interface LeadRepository {
  /**
   * Save a lead (create or update).
   *
   * When `opts.note` is supplied on a create, the note MUST be persisted
   * atomically with the lead (single transaction) so a required initial note —
   * e.g. the New Lead form's "Other" source detail — is never left dangling
   * without its lead, or the lead without its required detail.
   *
   * When `opts.expectedStatus` is supplied the write is a compare-and-set: it
   * only lands if the persisted status still equals it, otherwise
   * `LeadStatusConflictError` is thrown and nothing is written. Status
   * transitions MUST pass it so a stale read cannot overwrite a newer status.
   */
  save(
    lead: Lead,
    opts?: { note?: { content: string; author: string }; expectedStatus?: string },
    tx?: RepositoryTransaction
  ): Promise<void>;

  /**
   * Find a lead by ID
   */
  findById(id: LeadId): Promise<Lead | null>;

  /**
   * Find a lead by email
   */
  findByEmail(email: Email): Promise<Lead | null>;

  /**
   * Find all leads for an owner
   */
  findByOwnerId(ownerId: string): Promise<Lead[]>;

  /**
   * Find leads by status
   */
  findByStatus(status: string, ownerId?: string): Promise<Lead[]>;

  /**
   * Find leads with score above threshold
   */
  findByMinScore(minScore: number, ownerId?: string): Promise<Lead[]>;

  /**
   * Delete a lead
   */
  delete(id: LeadId): Promise<void>;

  /**
   * Check if email exists
   */
  existsByEmail(email: Email): Promise<boolean>;

  /**
   * Count leads by status
   */
  countByStatus(ownerId?: string): Promise<Record<string, number>>;

  /**
   * Get leads for AI scoring (unscored or stale scores)
   */
  findForScoring(limit: number): Promise<Lead[]>;
}

/**
 * Lead Query Service Interface
 * For complex read-only queries that don't need domain logic
 */
/**
 * @knipignore Intentional public query contract shared across application boundaries.
 */
export interface LeadQueryService {
  /**
   * Search leads with filters
   */
  search(params: LeadSearchParams): Promise<LeadSearchResult>;

  /**
   * Get lead statistics
   */
  getStatistics(ownerId?: string): Promise<LeadStatistics>;

  /**
   * Get lead funnel metrics
   */
  getFunnelMetrics(dateRange: DateRange): Promise<FunnelMetrics>;
}

// Query Types
/**
 * @knipignore Intentional public query DTO shared across application boundaries.
 */
export interface LeadSearchParams {
  query?: string;
  status?: string[];
  source?: string[];
  minScore?: number;
  maxScore?: number;
  ownerId?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * @knipignore Intentional public query DTO shared across application boundaries.
 */
export interface LeadSearchResult {
  leads: Lead[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/**
 * @knipignore Intentional public query DTO shared across application boundaries.
 */
export interface LeadStatistics {
  total: number;
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
  averageScore: number;
  conversionRate: number;
}

/**
 * @knipignore Intentional public query DTO shared across application boundaries.
 */
export interface FunnelMetrics {
  new: number;
  contacted: number;
  qualified: number;
  converted: number;
  lost: number;
  conversionRate: number;
  averageTimeToConvert: number;
}
