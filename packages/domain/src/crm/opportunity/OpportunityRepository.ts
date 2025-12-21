import { Opportunity } from './Opportunity';
import { OpportunityId } from './OpportunityId';
import { OpportunityStage } from './OpportunityEvents';
import { DateRange } from '../../shared/QueryTypes';

/**
 * Opportunity Repository Interface
 * Defines the contract for opportunity persistence
 * Implementation lives in adapters layer
 */
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
   * Find all opportunities for an owner
   */
  findByOwnerId(ownerId: string): Promise<Opportunity[]>;

  /**
   * Find opportunities by account
   */
  findByAccountId(accountId: string): Promise<Opportunity[]>;

  /**
   * Find opportunities by stage
   */
  findByStage(stage: OpportunityStage, ownerId?: string): Promise<Opportunity[]>;

  /**
   * Find opportunities by contact
   */
  findByContactId(contactId: string): Promise<Opportunity[]>;

  /**
   * Delete an opportunity
   */
  delete(id: OpportunityId): Promise<void>;

  /**
   * Find opportunities closing soon
   */
  findClosingSoon(days: number, ownerId?: string): Promise<Opportunity[]>;

  /**
   * Find high-value opportunities
   */
  findHighValue(minValue: number, ownerId?: string): Promise<Opportunity[]>;
}

/**
 * Opportunity Query Service Interface
 * For complex read-only queries that don't need domain logic
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

export interface OpportunitySearchResult {
  opportunities: Opportunity[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

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

export interface PipelineMetrics {
  stages: Record<OpportunityStage, StageMetrics>;
  totalPipelineValue: number;
  weightedPipelineValue: number;
  averageDealSize: number;
  conversionRates: Record<string, number>;
}

export interface StageMetrics {
  count: number;
  totalValue: number;
  weightedValue: number;
  averageProbability: number;
}

export interface WinRateAnalysis {
  totalOpportunities: number;
  wonOpportunities: number;
  lostOpportunities: number;
  winRate: number;
  averageTimeToClose: number;
  totalRevenue: number;
}
