import { PrismaClient } from '@intelliflow/db';
import { Task, TaskId, type TaskPriority, type TaskStatus } from '@intelliflow/domain';
import { TaskRepository } from '@intelliflow/application';

/**
 * Helper to create TaskId from string, throwing if invalid
 */
function createTaskId(id: string): TaskId {
  const result = TaskId.create(id);
  if (result.isFailure) {
    throw new Error(`Invalid TaskId: ${id}`);
  }
  return result.value;
}

/**
 * Prisma Task Repository
 * Implements TaskRepository port using Prisma ORM
 */
export class PrismaTaskRepository implements TaskRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(task: Task): Promise<void> {
    const data = {
      id: task.id.value,
      title: task.title,
      description: task.description ?? null,
      dueDate: task.dueDate ?? null,
      priority: task.priority,
      status: task.status,
      leadId: task.leadId ?? null,
      contactId: task.contactId ?? null,
      opportunityId: task.opportunityId ?? null,
      ownerId: task.ownerId,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      completedAt: task.completedAt ?? null,
    };

    await this.prisma.task.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }

  async findById(id: TaskId): Promise<Task | null> {
    const record = await this.prisma.task.findUnique({
      where: { id: id.value },
    });

    if (!record) return null;

    return Task.reconstitute(createTaskId(record.id), {
      title: record.title,
      description: record.description ?? undefined,
      dueDate: record.dueDate ?? undefined,
      priority: record.priority as TaskPriority,
      status: record.status as TaskStatus,
      leadId: record.leadId ?? undefined,
      contactId: record.contactId ?? undefined,
      opportunityId: record.opportunityId ?? undefined,
      ownerId: record.ownerId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      completedAt: record.completedAt ?? undefined,
    });
  }

  async findByOwnerId(ownerId: string): Promise<Task[]> {
    const records = await this.prisma.task.findMany({
      where: { ownerId },
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
    });

    return records.map((record) =>
      Task.reconstitute(createTaskId(record.id), {
        title: record.title,
        description: record.description ?? undefined,
        dueDate: record.dueDate ?? undefined,
        priority: record.priority as TaskPriority,
        status: record.status as TaskStatus,
        leadId: record.leadId ?? undefined,
        contactId: record.contactId ?? undefined,
        opportunityId: record.opportunityId ?? undefined,
        ownerId: record.ownerId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        completedAt: record.completedAt ?? undefined,
      })
    );
  }

  async findByLeadId(leadId: string): Promise<Task[]> {
    const records = await this.prisma.task.findMany({
      where: { leadId },
      orderBy: { dueDate: 'asc' },
    });

    return records.map((record) =>
      Task.reconstitute(createTaskId(record.id), {
        title: record.title,
        description: record.description ?? undefined,
        dueDate: record.dueDate ?? undefined,
        priority: record.priority as TaskPriority,
        status: record.status as TaskStatus,
        leadId: record.leadId ?? undefined,
        contactId: record.contactId ?? undefined,
        opportunityId: record.opportunityId ?? undefined,
        ownerId: record.ownerId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        completedAt: record.completedAt ?? undefined,
      })
    );
  }

  async findByContactId(contactId: string): Promise<Task[]> {
    const records = await this.prisma.task.findMany({
      where: { contactId },
      orderBy: { dueDate: 'asc' },
    });

    return records.map((record) =>
      Task.reconstitute(createTaskId(record.id), {
        title: record.title,
        description: record.description ?? undefined,
        dueDate: record.dueDate ?? undefined,
        priority: record.priority as TaskPriority,
        status: record.status as TaskStatus,
        leadId: record.leadId ?? undefined,
        contactId: record.contactId ?? undefined,
        opportunityId: record.opportunityId ?? undefined,
        ownerId: record.ownerId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        completedAt: record.completedAt ?? undefined,
      })
    );
  }

  async findByOpportunityId(opportunityId: string): Promise<Task[]> {
    const records = await this.prisma.task.findMany({
      where: { opportunityId },
      orderBy: { dueDate: 'asc' },
    });

    return records.map((record) =>
      Task.reconstitute(createTaskId(record.id), {
        title: record.title,
        description: record.description ?? undefined,
        dueDate: record.dueDate ?? undefined,
        priority: record.priority as TaskPriority,
        status: record.status as TaskStatus,
        leadId: record.leadId ?? undefined,
        contactId: record.contactId ?? undefined,
        opportunityId: record.opportunityId ?? undefined,
        ownerId: record.ownerId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        completedAt: record.completedAt ?? undefined,
      })
    );
  }

  async findByStatus(status: TaskStatus, ownerId?: string): Promise<Task[]> {
    const records = await this.prisma.task.findMany({
      where: {
        status,
        ...(ownerId ? { ownerId } : {}),
      },
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
    });

    return records.map((record) =>
      Task.reconstitute(createTaskId(record.id), {
        title: record.title,
        description: record.description ?? undefined,
        dueDate: record.dueDate ?? undefined,
        priority: record.priority as TaskPriority,
        status: record.status as TaskStatus,
        leadId: record.leadId ?? undefined,
        contactId: record.contactId ?? undefined,
        opportunityId: record.opportunityId ?? undefined,
        ownerId: record.ownerId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        completedAt: record.completedAt ?? undefined,
      })
    );
  }

  async findOverdue(ownerId?: string): Promise<Task[]> {
    const now = new Date();

    const records = await this.prisma.task.findMany({
      where: {
        dueDate: { lt: now },
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
        ...(ownerId ? { ownerId } : {}),
      },
      orderBy: { dueDate: 'asc' },
    });

    return records.map((record) =>
      Task.reconstitute(createTaskId(record.id), {
        title: record.title,
        description: record.description ?? undefined,
        dueDate: record.dueDate ?? undefined,
        priority: record.priority as TaskPriority,
        status: record.status as TaskStatus,
        leadId: record.leadId ?? undefined,
        contactId: record.contactId ?? undefined,
        opportunityId: record.opportunityId ?? undefined,
        ownerId: record.ownerId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        completedAt: record.completedAt ?? undefined,
      })
    );
  }

  async findDueToday(ownerId?: string): Promise<Task[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const records = await this.prisma.task.findMany({
      where: {
        dueDate: { gte: today, lt: tomorrow },
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
        ...(ownerId ? { ownerId } : {}),
      },
      orderBy: { priority: 'desc' },
    });

    return records.map((record) =>
      Task.reconstitute(createTaskId(record.id), {
        title: record.title,
        description: record.description ?? undefined,
        dueDate: record.dueDate ?? undefined,
        priority: record.priority as TaskPriority,
        status: record.status as TaskStatus,
        leadId: record.leadId ?? undefined,
        contactId: record.contactId ?? undefined,
        opportunityId: record.opportunityId ?? undefined,
        ownerId: record.ownerId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        completedAt: record.completedAt ?? undefined,
      })
    );
  }

  async delete(id: TaskId): Promise<void> {
    await this.prisma.task.delete({
      where: { id: id.value },
    });
  }

  async countByStatus(ownerId?: string): Promise<Record<string, number>> {
    const results = await this.prisma.task.groupBy({
      by: ['status'],
      where: ownerId ? { ownerId } : undefined,
      _count: true,
    });

    return results.reduce(
      (acc, result) => {
        acc[result.status] = result._count;
        return acc;
      },
      {} as Record<string, number>
    );
  }
}
