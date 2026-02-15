import { PrismaClient } from '@intelliflow/db';
import {
  Case,
  CaseId,
  CaseRepository,
  CaseQueryService,
  CaseSearchParams,
  CaseSearchResult,
  CaseStatistics,
  WorkloadMetrics,
  CaseStatus,
  CasePriority,
  DateRange,
} from '@intelliflow/domain';

/**
 * Prisma Case Repository (PG-138)
 *
 * Implements CaseRepository and CaseQueryService from domain layer.
 * Maps between domain Case aggregate and Prisma database schema.
 */
export class PrismaCaseRepository implements CaseRepository, CaseQueryService {
  constructor(private readonly prisma: PrismaClient) {}

  async save(legalCase: Case): Promise<void> {
    const data = legalCase.toJSON() as Record<string, any>;

    await this.prisma.case.upsert({
      where: { id: data.id },
      create: {
        id: data.id,
        title: data.title,
        description: data.description || null,
        status: data.status as any,
        priority: data.priority as any,
        deadline: data.deadline || null,
        clientId: data.clientId,
        assignedTo: data.assignedTo,
        tenantId: (data as any).tenantId || 'default',
        resolution: data.resolution || null,
        closedAt: data.closedAt || null,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      },
      update: {
        title: data.title,
        description: data.description || null,
        status: data.status as any,
        priority: data.priority as any,
        deadline: data.deadline || null,
        assignedTo: data.assignedTo,
        resolution: data.resolution || null,
        closedAt: data.closedAt || null,
        updatedAt: data.updatedAt,
      },
    });
  }

  async findById(id: CaseId): Promise<Case | null> {
    const record = await this.prisma.case.findUnique({
      where: { id: id.value },
      include: { tasks: { orderBy: { dueDate: 'asc' } } },
    });

    if (!record) return null;

    return this.toDomain(record);
  }

  async findByClientId(clientId: string): Promise<Case[]> {
    const records = await this.prisma.case.findMany({
      where: { clientId },
      include: { tasks: true },
      orderBy: { updatedAt: 'desc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  async findByAssignedTo(assignedTo: string): Promise<Case[]> {
    const records = await this.prisma.case.findMany({
      where: { assignedTo },
      include: { tasks: true },
      orderBy: { updatedAt: 'desc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  async findByStatus(status: CaseStatus, assignedTo?: string): Promise<Case[]> {
    const where: Record<string, unknown> = { status };
    if (assignedTo) where.assignedTo = assignedTo;

    const records = await this.prisma.case.findMany({
      where,
      include: { tasks: true },
      orderBy: { updatedAt: 'desc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  async findByPriority(priority: CasePriority, assignedTo?: string): Promise<Case[]> {
    const where: Record<string, unknown> = { priority };
    if (assignedTo) where.assignedTo = assignedTo;

    const records = await this.prisma.case.findMany({
      where,
      include: { tasks: true },
      orderBy: { updatedAt: 'desc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  async findOverdue(assignedTo?: string): Promise<Case[]> {
    const now = new Date();
    const where: Record<string, unknown> = {
      deadline: { lt: now },
      status: { notIn: ['CLOSED', 'CANCELLED'] },
    };
    if (assignedTo) where.assignedTo = assignedTo;

    const records = await this.prisma.case.findMany({
      where,
      include: { tasks: true },
      orderBy: { deadline: 'asc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  async delete(id: CaseId): Promise<void> {
    await this.prisma.case.delete({ where: { id: id.value } });
  }

  async exists(id: CaseId): Promise<boolean> {
    const count = await this.prisma.case.count({ where: { id: id.value } });
    return count > 0;
  }

  async countByStatus(assignedTo?: string): Promise<Record<CaseStatus, number>> {
    const where: Record<string, unknown> = {};
    if (assignedTo) where.assignedTo = assignedTo;

    const groups = await this.prisma.case.groupBy({
      by: ['status'],
      where,
      _count: true,
    });

    const result = {} as Record<CaseStatus, number>;
    for (const g of groups) {
      result[g.status as CaseStatus] = g._count;
    }

    return result;
  }

  async findWithUpcomingDeadlines(daysAhead: number, assignedTo?: string): Promise<Case[]> {
    const now = new Date();
    const future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    const where: Record<string, unknown> = {
      deadline: { gte: now, lte: future },
      status: { notIn: ['CLOSED', 'CANCELLED'] },
    };
    if (assignedTo) where.assignedTo = assignedTo;

    const records = await this.prisma.case.findMany({
      where,
      include: { tasks: true },
      orderBy: { deadline: 'asc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  // ─── CaseQueryService ─────────────────────────────────────────────────

  async search(params: CaseSearchParams): Promise<CaseSearchResult> {
    const { page = 1, limit = 20, query, status, priority, clientId, assignedTo, deadlineFrom, deadlineTo, overdue } = params;
    const offset = (page - 1) * limit;
    const where: Record<string, unknown> = {};

    if (status?.length) where.status = { in: status };
    if (priority?.length) where.priority = { in: priority };
    if (clientId) where.clientId = clientId;
    if (assignedTo) where.assignedTo = assignedTo;

    if (query) {
      where.OR = [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ];
    }

    if (deadlineFrom || deadlineTo) {
      where.deadline = {
        ...(deadlineFrom ? { gte: deadlineFrom } : {}),
        ...(deadlineTo ? { lte: deadlineTo } : {}),
      };
    }

    if (overdue) {
      where.deadline = { lt: new Date() };
      where.status = { notIn: ['CLOSED', 'CANCELLED'] };
    }

    const [records, total] = await Promise.all([
      this.prisma.case.findMany({
        where,
        include: { tasks: true },
        orderBy: { updatedAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.case.count({ where }),
    ]);

    return {
      cases: records.map((r) => this.toDomain(r)),
      total,
      page,
      limit,
      hasMore: offset + limit < total,
    };
  }

  async getStatistics(assignedTo?: string): Promise<CaseStatistics> {
    const where: Record<string, unknown> = {};
    if (assignedTo) where.assignedTo = assignedTo;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [statusGroups, priorityGroups, overdueCount, closedThisMonth, total] = await Promise.all([
      this.prisma.case.groupBy({ by: ['status'], where, _count: true }),
      this.prisma.case.groupBy({ by: ['priority'], where, _count: true }),
      this.prisma.case.count({ where: { ...where, deadline: { lt: now }, status: { notIn: ['CLOSED', 'CANCELLED'] } } }),
      this.prisma.case.count({ where: { ...where, status: 'CLOSED', closedAt: { gte: startOfMonth } } }),
      this.prisma.case.count({ where }),
    ]);

    const byStatus = {} as Record<CaseStatus, number>;
    for (const g of statusGroups) {
      byStatus[g.status as CaseStatus] = g._count;
    }

    const byPriority = {} as Record<CasePriority, number>;
    for (const g of priorityGroups) {
      byPriority[g.priority as CasePriority] = g._count;
    }

    return { total, byStatus, byPriority, overdue: overdueCount, closedThisMonth, averageTaskCompletion: 0 };
  }

  async getWorkloadMetrics(dateRange: DateRange): Promise<WorkloadMetrics> {
    const { start: from, end: to } = dateRange;

    const [activeCases, completedCases, newCases] = await Promise.all([
      this.prisma.case.count({ where: { status: { notIn: ['CLOSED', 'CANCELLED'] } } }),
      this.prisma.case.count({ where: { status: 'CLOSED', closedAt: { gte: from, lte: to } } }),
      this.prisma.case.count({ where: { createdAt: { gte: from, lte: to } } }),
    ]);

    return {
      activeCases,
      completedCases,
      newCases,
      tasksCompleted: 0,
      averageResolutionTime: 0,
      overduePercentage: 0,
    };
  }

  // ─── Mapping ──────────────────────────────────────────────────────────

  private toDomain(record: Record<string, any>): Case {
    const caseIdResult = CaseId.create(record.id);
    const caseId = caseIdResult.isSuccess ? caseIdResult.value : CaseId.generate();
    return Case.reconstitute(caseId, {
      title: record.title,
      description: record.description || undefined,
      status: record.status,
      priority: record.priority,
      deadline: record.deadline || undefined,
      clientId: record.clientId,
      assignedTo: record.assignedTo,
      tasks: (record.tasks || []).map((t: Record<string, any>) => ({
        id: t.id,
        title: t.title,
        description: t.description || undefined,
        dueDate: t.dueDate || undefined,
        status: t.status,
        assignee: t.assignee || undefined,
        completedAt: t.completedAt || undefined,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
      documentIds: [],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      closedAt: record.closedAt || undefined,
      resolution: record.resolution || undefined,
    });
  }
}
