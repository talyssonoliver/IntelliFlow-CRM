import {
  Result,
  DomainError,
  Task,
  TaskId,
  TaskStatus,
  TaskPriority,
  TaskRepository,
  LeadRepository,
  ContactRepository,
  OpportunityRepository,
  LeadId,
  ContactId,
  OpportunityId,
  CreateTaskProps,
} from '@intelliflow/domain';
import { EventBusPort } from '../ports/external';
import { PersistenceError, ValidationError } from '../errors';

/**
 * Task assignment validation rules
 */
export interface TaskAssignmentValidation {
  entityType: 'lead' | 'contact' | 'opportunity';
  entityId: string;
  isValid: boolean;
  reason?: string;
}

/**
 * Task due date metrics
 */
export interface TaskDueDateMetrics {
  overdue: number;
  dueSoon: number;
  dueThisWeek: number;
  dueThisMonth: number;
  noDueDate: number;
}

/**
 * Task completion statistics
 */
export interface TaskCompletionStats {
  total: number;
  completed: number;
  pending: number;
  inProgress: number;
  cancelled: number;
  completionRate: number;
  averageCompletionTime?: number;
}

/**
 * Bulk task result
 */
export interface BulkTaskResult {
  successful: string[];
  failed: Array<{ id: string; error: string }>;
  totalProcessed: number;
}

/**
 * Task Service
 *
 * Orchestrates task-related business logic including:
 * - Task creation and assignment validation
 * - Due date tracking and notifications
 * - Task completion and cancellation
 * - Priority management
 * - Bulk operations
 */
export class TaskService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly leadRepository: LeadRepository,
    private readonly contactRepository: ContactRepository,
    private readonly opportunityRepository: OpportunityRepository,
    private readonly eventBus: EventBusPort
  ) {}

  /**
   * Create a new task with validation
   */
  async createTask(props: CreateTaskProps): Promise<Result<Task, DomainError>> {
    // Validate entity assignment if provided
    if (props.leadId) {
      const validation = await this.validateAssignment('lead', props.leadId);
      if (!validation.isValid) {
        return Result.fail(new ValidationError(validation.reason ?? 'Invalid lead assignment'));
      }
    }

    if (props.contactId) {
      const validation = await this.validateAssignment('contact', props.contactId);
      if (!validation.isValid) {
        return Result.fail(new ValidationError(validation.reason ?? 'Invalid contact assignment'));
      }
    }

    if (props.opportunityId) {
      const validation = await this.validateAssignment('opportunity', props.opportunityId);
      if (!validation.isValid) {
        return Result.fail(
          new ValidationError(validation.reason ?? 'Invalid opportunity assignment')
        );
      }
    }

    // Business rule: Task can only be assigned to one entity type at a time
    const assignmentCount = [props.leadId, props.contactId, props.opportunityId].filter(
      Boolean
    ).length;
    if (assignmentCount > 1) {
      return Result.fail(
        new ValidationError(
          'Task can only be assigned to one entity (lead, contact, or opportunity) at a time'
        )
      );
    }

    // Business rule: Due date cannot be in the past
    if (props.dueDate && props.dueDate < new Date()) {
      return Result.fail(new ValidationError('Due date cannot be in the past'));
    }

    // Create task
    const taskResult = Task.create(props);
    if (taskResult.isFailure) {
      return Result.fail(taskResult.error);
    }

    const task = taskResult.value;

    // Persist
    try {
      await this.taskRepository.save(task);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to save task'));
    }

    // Publish events
    await this.publishEvents(task);

    return Result.ok(task);
  }

  /**
   * Update task information
   */
  async updateTaskInfo(
    taskId: string,
    updates: { title?: string; description?: string }
  ): Promise<Result<Task, DomainError>> {
    const taskIdResult = TaskId.create(taskId);
    if (taskIdResult.isFailure) {
      return Result.fail(taskIdResult.error);
    }

    const task = await this.taskRepository.findById(taskIdResult.value);
    if (!task) {
      return Result.fail(new ValidationError(`Task not found: ${taskId}`));
    }

    // Business rule: Cannot update completed or cancelled tasks
    if (task.isCompleted || task.isCancelled) {
      return Result.fail(new ValidationError('Cannot update completed or cancelled tasks'));
    }

    task.updateTaskInfo(updates);

    try {
      await this.taskRepository.save(task);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to save task'));
    }

    return Result.ok(task);
  }

  /**
   * Start a task
   */
  async startTask(taskId: string, startedBy: string): Promise<Result<Task, DomainError>> {
    const taskIdResult = TaskId.create(taskId);
    if (taskIdResult.isFailure) {
      return Result.fail(taskIdResult.error);
    }

    const task = await this.taskRepository.findById(taskIdResult.value);
    if (!task) {
      return Result.fail(new ValidationError(`Task not found: ${taskId}`));
    }

    // Business rule: Can only start PENDING tasks
    if (task.status !== 'PENDING') {
      return Result.fail(
        new ValidationError(`Cannot start task with status ${task.status}. Task must be PENDING.`)
      );
    }

    const startResult = task.start(startedBy);
    if (startResult.isFailure) {
      return Result.fail(startResult.error);
    }

    try {
      await this.taskRepository.save(task);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to save task'));
    }

    await this.publishEvents(task);

    return Result.ok(task);
  }

  /**
   * Complete a task
   */
  async completeTask(taskId: string, completedBy: string): Promise<Result<Task, DomainError>> {
    const taskIdResult = TaskId.create(taskId);
    if (taskIdResult.isFailure) {
      return Result.fail(taskIdResult.error);
    }

    const task = await this.taskRepository.findById(taskIdResult.value);
    if (!task) {
      return Result.fail(new ValidationError(`Task not found: ${taskId}`));
    }

    const completeResult = task.complete(completedBy);
    if (completeResult.isFailure) {
      return Result.fail(completeResult.error);
    }

    try {
      await this.taskRepository.save(task);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to save task'));
    }

    await this.publishEvents(task);

    return Result.ok(task);
  }

  /**
   * Cancel a task
   */
  async cancelTask(
    taskId: string,
    reason: string,
    cancelledBy: string
  ): Promise<Result<Task, DomainError>> {
    const taskIdResult = TaskId.create(taskId);
    if (taskIdResult.isFailure) {
      return Result.fail(taskIdResult.error);
    }

    const task = await this.taskRepository.findById(taskIdResult.value);
    if (!task) {
      return Result.fail(new ValidationError(`Task not found: ${taskId}`));
    }

    // Business rule: Must provide a reason for cancellation
    if (!reason || reason.trim().length < 5) {
      return Result.fail(new ValidationError('Cancellation reason must be at least 5 characters'));
    }

    const cancelResult = task.cancel(reason, cancelledBy);
    if (cancelResult.isFailure) {
      return Result.fail(cancelResult.error);
    }

    try {
      await this.taskRepository.save(task);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to save task'));
    }

    await this.publishEvents(task);

    return Result.ok(task);
  }

  /**
   * Change task priority
   */
  async changePriority(
    taskId: string,
    newPriority: TaskPriority,
    changedBy: string
  ): Promise<Result<Task, DomainError>> {
    const taskIdResult = TaskId.create(taskId);
    if (taskIdResult.isFailure) {
      return Result.fail(taskIdResult.error);
    }

    const task = await this.taskRepository.findById(taskIdResult.value);
    if (!task) {
      return Result.fail(new ValidationError(`Task not found: ${taskId}`));
    }

    const priorityResult = task.changePriority(newPriority, changedBy);
    if (priorityResult.isFailure) {
      return Result.fail(priorityResult.error);
    }

    try {
      await this.taskRepository.save(task);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to save task'));
    }

    await this.publishEvents(task);

    return Result.ok(task);
  }

  /**
   * Update task due date
   */
  async updateDueDate(
    taskId: string,
    newDueDate: Date,
    changedBy: string
  ): Promise<Result<Task, DomainError>> {
    const taskIdResult = TaskId.create(taskId);
    if (taskIdResult.isFailure) {
      return Result.fail(taskIdResult.error);
    }

    const task = await this.taskRepository.findById(taskIdResult.value);
    if (!task) {
      return Result.fail(new ValidationError(`Task not found: ${taskId}`));
    }

    // Business rule: New due date cannot be in the past for open tasks
    if (newDueDate < new Date() && !task.isCompleted && !task.isCancelled) {
      return Result.fail(new ValidationError('Due date cannot be in the past'));
    }

    const dueDateResult = task.updateDueDate(newDueDate, changedBy);
    if (dueDateResult.isFailure) {
      return Result.fail(dueDateResult.error);
    }

    try {
      await this.taskRepository.save(task);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to save task'));
    }

    await this.publishEvents(task);

    return Result.ok(task);
  }

  /**
   * Assign task to a lead
   */
  async assignToLead(
    taskId: string,
    leadId: string,
    assignedBy: string
  ): Promise<Result<Task, DomainError>> {
    const validation = await this.validateAssignment('lead', leadId);
    if (!validation.isValid) {
      return Result.fail(new ValidationError(validation.reason ?? 'Invalid lead assignment'));
    }

    const taskIdResult = TaskId.create(taskId);
    if (taskIdResult.isFailure) {
      return Result.fail(taskIdResult.error);
    }

    const task = await this.taskRepository.findById(taskIdResult.value);
    if (!task) {
      return Result.fail(new ValidationError(`Task not found: ${taskId}`));
    }

    // Business rule: Cannot reassign completed/cancelled tasks
    if (task.isCompleted || task.isCancelled) {
      return Result.fail(new ValidationError('Cannot reassign completed or cancelled tasks'));
    }

    task.assignToLead(leadId, assignedBy);

    try {
      await this.taskRepository.save(task);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to save task'));
    }

    await this.publishEvents(task);

    return Result.ok(task);
  }

  /**
   * Assign task to a contact
   */
  async assignToContact(
    taskId: string,
    contactId: string,
    assignedBy: string
  ): Promise<Result<Task, DomainError>> {
    const validation = await this.validateAssignment('contact', contactId);
    if (!validation.isValid) {
      return Result.fail(new ValidationError(validation.reason ?? 'Invalid contact assignment'));
    }

    const taskIdResult = TaskId.create(taskId);
    if (taskIdResult.isFailure) {
      return Result.fail(taskIdResult.error);
    }

    const task = await this.taskRepository.findById(taskIdResult.value);
    if (!task) {
      return Result.fail(new ValidationError(`Task not found: ${taskId}`));
    }

    if (task.isCompleted || task.isCancelled) {
      return Result.fail(new ValidationError('Cannot reassign completed or cancelled tasks'));
    }

    task.assignToContact(contactId, assignedBy);

    try {
      await this.taskRepository.save(task);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to save task'));
    }

    await this.publishEvents(task);

    return Result.ok(task);
  }

  /**
   * Assign task to an opportunity
   */
  async assignToOpportunity(
    taskId: string,
    opportunityId: string,
    assignedBy: string
  ): Promise<Result<Task, DomainError>> {
    const validation = await this.validateAssignment('opportunity', opportunityId);
    if (!validation.isValid) {
      return Result.fail(
        new ValidationError(validation.reason ?? 'Invalid opportunity assignment')
      );
    }

    const taskIdResult = TaskId.create(taskId);
    if (taskIdResult.isFailure) {
      return Result.fail(taskIdResult.error);
    }

    const task = await this.taskRepository.findById(taskIdResult.value);
    if (!task) {
      return Result.fail(new ValidationError(`Task not found: ${taskId}`));
    }

    if (task.isCompleted || task.isCancelled) {
      return Result.fail(new ValidationError('Cannot reassign completed or cancelled tasks'));
    }

    task.assignToOpportunity(opportunityId, assignedBy);

    try {
      await this.taskRepository.save(task);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to save task'));
    }

    await this.publishEvents(task);

    return Result.ok(task);
  }

  /**
   * Get overdue tasks
   */
  async getOverdueTasks(ownerId?: string): Promise<Task[]> {
    return this.taskRepository.findOverdue(ownerId);
  }

  /**
   * Get tasks due soon
   */
  async getTasksDueSoon(ownerId?: string): Promise<Task[]> {
    return this.taskRepository.findDueSoon(ownerId);
  }

  /**
   * Get tasks by priority
   */
  async getTasksByPriority(priority: TaskPriority, ownerId?: string): Promise<Task[]> {
    return this.taskRepository.findByPriority(priority, ownerId);
  }

  /**
   * Get high priority tasks (HIGH or URGENT)
   */
  async getHighPriorityTasks(ownerId?: string): Promise<Task[]> {
    const [highPriority, urgentPriority] = await Promise.all([
      this.taskRepository.findByPriority('HIGH', ownerId),
      this.taskRepository.findByPriority('URGENT', ownerId),
    ]);

    return [...urgentPriority, ...highPriority];
  }

  /**
   * Get tasks by entity (lead, contact, or opportunity)
   */
  async getTasksByEntity(
    entityType: 'lead' | 'contact' | 'opportunity',
    entityId: string
  ): Promise<Task[]> {
    switch (entityType) {
      case 'lead':
        return this.taskRepository.findByLeadId(entityId);
      case 'contact':
        return this.taskRepository.findByContactId(entityId);
      case 'opportunity':
        return this.taskRepository.findByOpportunityId(entityId);
      default:
        return [];
    }
  }

  /**
   * Bulk complete tasks
   */
  async bulkComplete(taskIds: string[], completedBy: string): Promise<BulkTaskResult> {
    const successful: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const taskId of taskIds) {
      const result = await this.completeTask(taskId, completedBy);
      if (result.isSuccess) {
        successful.push(taskId);
      } else {
        failed.push({ id: taskId, error: result.error.message });
      }
    }

    return {
      successful,
      failed,
      totalProcessed: taskIds.length,
    };
  }

  /**
   * Get task due date metrics
   */
  async getDueDateMetrics(ownerId?: string): Promise<TaskDueDateMetrics> {
    const tasks = ownerId ? await this.taskRepository.findByOwnerId(ownerId) : [];

    const activeTasks = tasks.filter((t) => !t.isCompleted && !t.isCancelled);

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    let overdue = 0;
    let dueSoon = 0;
    let dueThisWeek = 0;
    let dueThisMonth = 0;
    let noDueDate = 0;

    activeTasks.forEach((task) => {
      if (!task.dueDate) {
        noDueDate++;
      } else if (task.dueDate < now) {
        overdue++;
      } else if (task.dueDate <= tomorrow) {
        dueSoon++;
      } else if (task.dueDate <= nextWeek) {
        dueThisWeek++;
      } else if (task.dueDate <= nextMonth) {
        dueThisMonth++;
      }
    });

    return {
      overdue,
      dueSoon,
      dueThisWeek,
      dueThisMonth,
      noDueDate,
    };
  }

  /**
   * Get task completion statistics
   */
  async getCompletionStatistics(ownerId?: string): Promise<TaskCompletionStats> {
    const statusCounts = await this.taskRepository.countByStatus(ownerId);

    const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
    const completed = statusCounts['COMPLETED'] ?? 0;
    const pending = statusCounts['PENDING'] ?? 0;
    const inProgress = statusCounts['IN_PROGRESS'] ?? 0;
    const cancelled = statusCounts['CANCELLED'] ?? 0;

    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      completed,
      pending,
      inProgress,
      cancelled,
      completionRate,
    };
  }

  /**
   * Delete task with business rules
   */
  async deleteTask(taskId: string): Promise<Result<void, DomainError>> {
    const taskIdResult = TaskId.create(taskId);
    if (taskIdResult.isFailure) {
      return Result.fail(taskIdResult.error);
    }

    const task = await this.taskRepository.findById(taskIdResult.value);
    if (!task) {
      return Result.fail(new ValidationError(`Task not found: ${taskId}`));
    }

    // Business rule: Cannot delete completed tasks (audit trail)
    if (task.isCompleted) {
      return Result.fail(
        new ValidationError('Cannot delete completed tasks. They are kept for audit purposes.')
      );
    }

    try {
      await this.taskRepository.delete(taskIdResult.value);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to delete task'));
    }

    return Result.ok(undefined);
  }

  /**
   * Validate entity assignment
   */
  private async validateAssignment(
    entityType: 'lead' | 'contact' | 'opportunity',
    entityId: string
  ): Promise<TaskAssignmentValidation> {
    try {
      switch (entityType) {
        case 'lead': {
          const leadIdResult = LeadId.create(entityId);
          if (leadIdResult.isFailure) {
            return { entityType, entityId, isValid: false, reason: 'Invalid lead ID format' };
          }
          const lead = await this.leadRepository.findById(leadIdResult.value);
          if (!lead) {
            return { entityType, entityId, isValid: false, reason: `Lead not found: ${entityId}` };
          }
          // Business rule: Cannot assign tasks to converted leads
          if (lead.isConverted) {
            return {
              entityType,
              entityId,
              isValid: false,
              reason:
                'Cannot assign tasks to converted leads. Assign to the resulting contact instead.',
            };
          }
          return { entityType, entityId, isValid: true };
        }

        case 'contact': {
          const contactIdResult = ContactId.create(entityId);
          if (contactIdResult.isFailure) {
            return { entityType, entityId, isValid: false, reason: 'Invalid contact ID format' };
          }
          const contact = await this.contactRepository.findById(contactIdResult.value);
          if (!contact) {
            return {
              entityType,
              entityId,
              isValid: false,
              reason: `Contact not found: ${entityId}`,
            };
          }
          return { entityType, entityId, isValid: true };
        }

        case 'opportunity': {
          const oppIdResult = OpportunityId.create(entityId);
          if (oppIdResult.isFailure) {
            return {
              entityType,
              entityId,
              isValid: false,
              reason: 'Invalid opportunity ID format',
            };
          }
          const opportunity = await this.opportunityRepository.findById(oppIdResult.value);
          if (!opportunity) {
            return {
              entityType,
              entityId,
              isValid: false,
              reason: `Opportunity not found: ${entityId}`,
            };
          }
          // Business rule: Cannot assign tasks to closed opportunities
          if (opportunity.isClosed) {
            return {
              entityType,
              entityId,
              isValid: false,
              reason: 'Cannot assign tasks to closed opportunities',
            };
          }
          return { entityType, entityId, isValid: true };
        }

        default:
          return { entityType, entityId, isValid: false, reason: 'Unknown entity type' };
      }
    } catch (error) {
      return {
        entityType,
        entityId,
        isValid: false,
        reason: 'Error validating entity assignment',
      };
    }
  }

  private async publishEvents(task: Task): Promise<void> {
    const events = task.getDomainEvents();
    if (events.length > 0) {
      try {
        await this.eventBus.publishAll(events);
      } catch (error) {
        console.error('Failed to publish task domain events:', error);
      }
    }
    task.clearDomainEvents();
  }
}
