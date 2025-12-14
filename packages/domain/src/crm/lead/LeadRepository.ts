import { Lead } from './Lead';
import { LeadId } from './LeadId';
import { Email } from './Email';

/**
 * Lead Repository Interface
 * Defines the contract for lead persistence
 * Implementation lives in adapters layer
 */
export interface LeadRepository {
  /**
   * Save a lead (create or update)
   */
  save(lead: Lead): Promise<void>;

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

export interface LeadSearchResult {
  leads: Lead[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface LeadStatistics {
  total: number;
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
  averageScore: number;
  conversionRate: number;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface FunnelMetrics {
  new: number;
  contacted: number;
  qualified: number;
  converted: number;
  lost: number;
  conversionRate: number;
  averageTimeToConvert: number;
}
