import { Opportunity } from './Opportunity';
import { OpportunityId } from './OpportunityId';
import { OpportunityStage } from './OpportunityEvents';
import { DateRange } from '../../shared/QueryTypes';
import { RepositoryTransaction } from '../../shared/RepositoryTransaction';

/**
 * Opportunity Repository Interface
 * Defines the contract for opportunity persistence
 * Implementation lives in adapters layer
 */
/**
 * @knipignore Intentional public repository contract for adapter implementations.
 */
export interface OpportunityRepository {
  /**
   * Save an opportunity (create or update)
   */
  save(opportunity: Opportunity, tx?: RepositoryTransaction): Promise<void>;

  /**
   * Find an opportunity by ID, optionally scoped to a tenant.
   * IFC-281: callers that gate mutations MUST pass tenantId to prevent cross-tenant leaks.
   */
  findById(id: OpportunityId, tenantId?: string): Promise<Opportunity | null>;

  /**
   * Find all opportunities for an owner within a tenant
   */
  findByOwnerId(ownerId: string, tenantId?: string): Promise<Opportunity[]>;

  /**
   * Find opportunities by account, optionally within a tenant
   */
  findByAccountId(accountId: string, tenantId?: string): Promise<Opportunity[]>;

  /**
   * Find opportunities by stage, optionally within a tenant
   */
  findByStage(stage: OpportunityStage, tenantId?: string, ownerId?: string): Promise<Opportunity[]>;

  /**
   * Find opportunities by contact, optionally within a tenant
   */
  findByContactId(contactId: string, tenantId?: string): Promise<Opportunity[]>;

  /**
   * Delete an opportunity within a tenant
   * IFC-281: tenantId required to prevent cross-tenant deletes
   */
  delete(id: OpportunityId, tenantId: string): Promise<void>;

  /**
   * Soft-delete an opportunity (sets deletedAt)
   * tenantId required to prevent cross-tenant soft-deletes
   */
  softDelete(id: OpportunityId, tenantId: string): Promise<void>;

  /**
   * Restore a soft-deleted opportunity (clears deletedAt)
   * tenantId required to prevent cross-tenant restores
   */
  restore(id: OpportunityId, tenantId: string): Promise<void>;

  /**
   * Find an opportunity by ID including soft-deleted records
   */
  findByIdIncludingDeleted(id: OpportunityId): Promise<Opportunity | null>;

  /**
   * Find soft-deleted (trashed) opportunities for a tenant
   */
  findTrashed(params: {
    tenantId: string;
    search?: string;
    skip?: number;
    take?: number;
    orderBy?: Record<string, string>;
  }): Promise<{ items: Opportunity[]; total: number }>;

  /**
   * Find opportunities closing soon within a tenant
   */
  findClosingSoon(days: number, tenantId?: string, ownerId?: string): Promise<Opportunity[]>;

  /**
   * Find high-value opportunities, optionally within a tenant
   */
  findHighValue(minValue: number, tenantId?: string, ownerId?: string): Promise<Opportunity[]>;
}

/**
 * Opportunity Query Service Interface
 * For complex read-only queries that don't need domain logic
 */
/**
 * @knipignore Intentional public query contract shared across application boundaries.
 */
export interface OpportunityQueryService {
  /**
   * Search opportunities with filters
   */
  search(params: OpportunitySearchParams): Promise<OpportunitySearchResult>;

  /**
   * Get opportunity statistics
   */
  getStatistics(ownerId?: string): Promise<OpportunityStatistics>;

  /**
   * Get sales pipeline metrics
   */
  getPipelineMetrics(ownerId?: string): Promise<PipelineMetrics>;

  /**
   * Get win rate analysis
   */
  getWinRateAnalysis(dateRange: DateRange, ownerId?: string): Promise<WinRateAnalysis>;
}

// Query Types
/**
 * @knipignore Intentional public query DTO shared across application boundaries.
 */
export interface OpportunitySearchParams {
  query?: string;
  stage?: OpportunityStage[];
  accountId?: string;
  contactId?: string;
  minValue?: number;
  maxValue?: number;
  minProbability?: number;
  expectedCloseBefore?: Date;
  expectedCloseAfter?: Date;
  ownerId?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * @knipignore Intentional public query DTO shared across application boundaries.
 */
export interface OpportunitySearchResult {
  opportunities: Opportunity[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/**
 * @knipignore Intentional public query DTO shared across application boundaries.
 */
export interface OpportunityStatistics {
  total: number;
  byStage: Record<string, number>;
  totalValue: number;
  totalWeightedValue: number;
  averageValue: number;
  averageProbability: number;
  wonCount: number;
  lostCount: number;
  activeCount: number;
}

/**
 * @knipignore Intentional public query DTO shared across application boundaries.
 */
export interface PipelineMetrics {
  stages: Record<OpportunityStage, StageMetrics>;
  totalPipelineValue: number;
  weightedPipelineValue: number;
  averageDealSize: number;
  conversionRates: Record<string, number>;
}

/**
 * @knipignore Intentional public query DTO shared across application boundaries.
 */
export interface StageMetrics {
  count: number;
  totalValue: number;
  weightedValue: number;
  averageProbability: number;
}

/**
 * @knipignore Intentional public query DTO shared across application boundaries.
 */
export interface WinRateAnalysis {
  totalOpportunities: number;
  wonOpportunities: number;
  lostOpportunities: number;
  winRate: number;
  averageTimeToClose: number;
  totalRevenue: number;
}
