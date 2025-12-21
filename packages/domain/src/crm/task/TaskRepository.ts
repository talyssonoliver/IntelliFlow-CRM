import { Task } from './Task';
import { TaskId } from './TaskId';
import { TaskStatus, TaskPriority } from './TaskEvents';
import { DateRange } from '../../shared/QueryTypes';

/**
 * Task Repository Interface
 * Defines the contract for task persistence
 * Implementation lives in adapters layer
 */
export interface TaskRepository {
  /**
   * Save a task (create or update)
   */
  save(task: Task): Promise<void>;

  /**
   * Find a task by ID
   */
  findById(id: TaskId): Promise<Task | null>;

  /**
   * Find all tasks for an owner
   */
  findByOwnerId(ownerId: string): Promise<Task[]>;

  /**
   * Find tasks by status
   */
  findByStatus(status: TaskStatus, ownerId?: string): Promise<Task[]>;

  /**
   * Find tasks by priority
   */
  findByPriority(priority: TaskPriority, ownerId?: string): Promise<Task[]>;

  /**
   * Find tasks by lead
   */
  findByLeadId(leadId: string): Promise<Task[]>;

  /**
   * Find tasks by contact
   */
  findByContactId(contactId: string): Promise<Task[]>;

  /**
   * Find tasks by opportunity
   */
  findByOpportunityId(opportunityId: string): Promise<Task[]>;

  /**
   * Find overdue tasks
   */
  findOverdue(ownerId?: string): Promise<Task[]>;

  /**
   * Find tasks due soon (within next 24 hours)
   */
  findDueSoon(ownerId?: string): Promise<Task[]>;

  /**
   * Delete a task
   */
  delete(id: TaskId): Promise<void>;

  /**
   * Count tasks by status
   */
  countByStatus(ownerId?: string): Promise<Record<string, number>>;
}

/**
 * Task Query Service Interface
 * For complex read-only queries that don't need domain logic
 */
export interface TaskQueryService {
  /**
   * Search tasks with filters
   */
  search(params: TaskSearchParams): Promise<TaskSearchResult>;

  /**
   * Get task statistics
   */
  getStatistics(ownerId?: string): Promise<TaskStatistics>;

  /**
   * Get upcoming tasks for a date range
   */
  getUpcomingTasks(dateRange: DateRange, ownerId?: string): Promise<Task[]>;
}

// Query Types
export interface TaskSearchParams {
  query?: string;
  status?: TaskStatus[];
  priority?: TaskPriority[];
  leadId?: string;
  contactId?: string;
  opportunityId?: string;
  ownerId?: string;
  dueBefore?: Date;
  dueAfter?: Date;
  includeOverdue?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface TaskSearchResult {
  tasks: Task[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface TaskStatistics {
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  completedCount: number;
  overdueCount: number;
  dueSoonCount: number;
  completionRate: number;
}
