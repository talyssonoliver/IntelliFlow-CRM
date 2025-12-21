import { Result, DomainError } from '@intelliflow/domain';

/**
 * Task Repository Port
 * Defines the contract for task persistence
 * Implementation lives in adapters layer
 *
 * NOTE: Task entity not yet implemented in domain layer (IFC-105)
 * This is a placeholder interface to demonstrate hexagonal architecture
 */

// Placeholder types until Task aggregate is implemented
export interface TaskId {
  value: string;
}

export interface Task {
  id: TaskId;
  title: string;
  description?: string;
  dueDate?: Date;
  status: string;
  assigneeId: string;
  createdAt: Date;
  updatedAt: Date;
}

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
   * Find tasks by assignee
   */
  findByAssigneeId(assigneeId: string): Promise<Task[]>;

  /**
   * Delete a task
   */
  delete(id: TaskId): Promise<void>;
}
