import { Task, TaskId, TaskStatus, TaskPriority, TaskRepository } from '@intelliflow/domain';

/**
 * In-Memory Task Repository
 * Used for testing and development
 */
export class InMemoryTaskRepository implements TaskRepository {
  private tasks: Map<string, Task> = new Map();

  async save(task: Task): Promise<void> {
    this.tasks.set(task.id.value, task);
  }

  async findById(id: TaskId): Promise<Task | null> {
    return this.tasks.get(id.value) ?? null;
  }

  async findByOwnerId(ownerId: string): Promise<Task[]> {
    return Array.from(this.tasks.values())
      .filter((task) => task.ownerId === ownerId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findByStatus(status: TaskStatus, ownerId?: string): Promise<Task[]> {
    return Array.from(this.tasks.values())
      .filter((task) => {
        const matchesStatus = task.status === status;
        const matchesOwner = !ownerId || task.ownerId === ownerId;
        return matchesStatus && matchesOwner;
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findByPriority(priority: TaskPriority, ownerId?: string): Promise<Task[]> {
    return Array.from(this.tasks.values())
      .filter((task) => {
        const matchesPriority = task.priority === priority;
        const matchesOwner = !ownerId || task.ownerId === ownerId;
        const isActive = !task.isCompleted && !task.isCancelled;
        return matchesPriority && matchesOwner && isActive;
      })
      .sort((a, b) => {
        const aDate = a.dueDate?.getTime() ?? Infinity;
        const bDate = b.dueDate?.getTime() ?? Infinity;
        return aDate - bDate;
      });
  }

  async findByLeadId(leadId: string): Promise<Task[]> {
    return Array.from(this.tasks.values())
      .filter((task) => task.leadId === leadId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findByContactId(contactId: string): Promise<Task[]> {
    return Array.from(this.tasks.values())
      .filter((task) => task.contactId === contactId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findByOpportunityId(opportunityId: string): Promise<Task[]> {
    return Array.from(this.tasks.values())
      .filter((task) => task.opportunityId === opportunityId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findOverdue(ownerId?: string): Promise<Task[]> {
    const now = new Date();
    return Array.from(this.tasks.values())
      .filter((task) => {
        const isActive = !task.isCompleted && !task.isCancelled;
        const isOverdue = task.dueDate !== undefined && task.dueDate < now;
        const matchesOwner = !ownerId || task.ownerId === ownerId;
        return isActive && isOverdue && matchesOwner;
      })
      .sort((a, b) => {
        const aDate = a.dueDate?.getTime() ?? 0;
        const bDate = b.dueDate?.getTime() ?? 0;
        return aDate - bDate;
      });
  }

  async findDueSoon(ownerId?: string): Promise<Task[]> {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    return Array.from(this.tasks.values())
      .filter((task) => {
        const isActive = !task.isCompleted && !task.isCancelled;
        const isDueSoon =
          task.dueDate !== undefined && task.dueDate >= now && task.dueDate <= tomorrow;
        const matchesOwner = !ownerId || task.ownerId === ownerId;
        return isActive && isDueSoon && matchesOwner;
      })
      .sort((a, b) => {
        const aDate = a.dueDate?.getTime() ?? 0;
        const bDate = b.dueDate?.getTime() ?? 0;
        return aDate - bDate;
      });
  }

  async delete(id: TaskId): Promise<void> {
    this.tasks.delete(id.value);
  }

  async countByStatus(ownerId?: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};

    for (const task of this.tasks.values()) {
      if (!ownerId || task.ownerId === ownerId) {
        counts[task.status] = (counts[task.status] ?? 0) + 1;
      }
    }

    return counts;
  }

  // Test helper methods
  clear(): void {
    this.tasks.clear();
  }

  getAll(): Task[] {
    return Array.from(this.tasks.values());
  }
}
