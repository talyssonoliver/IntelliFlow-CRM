import { Case } from './Case';
import { CaseId } from './CaseId';
import { CaseStatus, CasePriority } from './CaseEvents';
import { DateRange } from '../../shared/QueryTypes';

/**
 * Case Repository Interface
 * Defines the contract for case persistence
 * Implementation lives in adapters layer
 */
export interface CaseRepository {
  /**
   * Save a case (create or update)
   */
  save(legalCase: Case): Promise<void>;

  /**
   * Find a case by ID
   */
  findById(id: CaseId): Promise<Case | null>;

  /**
   * Find all cases for a client
   */
  findByClientId(clientId: string): Promise<Case[]>;

  /**
   * Find all cases assigned to a user
   */
  findByAssignedTo(assignedTo: string): Promise<Case[]>;

  /**
   * Find cases by status
   */
  findByStatus(status: CaseStatus, assignedTo?: string): Promise<Case[]>;

  /**
   * Find cases by priority
   */
  findByPriority(priority: CasePriority, assignedTo?: string): Promise<Case[]>;

  /**
   * Find overdue cases
   */
  findOverdue(assignedTo?: string): Promise<Case[]>;

  /**
   * Delete a case
   */
  delete(id: CaseId): Promise<void>;

  /**
   * Check if a case exists
   */
  exists(id: CaseId): Promise<boolean>;

  /**
   * Count cases by status
   */
  countByStatus(assignedTo?: string): Promise<Record<CaseStatus, number>>;

  /**
   * Get cases with upcoming deadlines
   */
  findWithUpcomingDeadlines(daysAhead: number, assignedTo?: string): Promise<Case[]>;
}

/**
 * Case Query Service Interface
 * For complex read-only queries that don't need domain logic
 */
export interface CaseQueryService {
  /**
   * Search cases with filters
   */
  search(params: CaseSearchParams): Promise<CaseSearchResult>;

  /**
   * Get case statistics
   */
  getStatistics(assignedTo?: string): Promise<CaseStatistics>;

  /**
   * Get case workload metrics
   */
  getWorkloadMetrics(dateRange: DateRange): Promise<WorkloadMetrics>;
}

// Query Types
export interface CaseSearchParams {
  query?: string;
  status?: CaseStatus[];
  priority?: CasePriority[];
  clientId?: string;
  assignedTo?: string;
  deadlineFrom?: Date;
  deadlineTo?: Date;
  overdue?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CaseSearchResult {
  cases: Case[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface CaseStatistics {
  total: number;
  byStatus: Record<CaseStatus, number>;
  byPriority: Record<CasePriority, number>;
  overdue: number;
  averageTaskCompletion: number;
  closedThisMonth: number;
}

export interface WorkloadMetrics {
  activeCases: number;
  completedCases: number;
  newCases: number;
  tasksCompleted: number;
  averageResolutionTime: number;
  overduePercentage: number;
}
