import {
  Prisma,
  PrismaClient,
  AutoResponseDraft as PrismaAutoResponseDraft,
  AutoResponseTrigger as PrismaAutoResponseTrigger,
  AutoResponseStatus as PrismaAutoResponseStatus,
} from '@intelliflow/db';
import {
  AutoResponseDraft,
  AutoResponseDraftId,
  AutoResponseDraftRepository,
  AutoResponseDraftQuery,
  ResponseContent,
  type AutoResponseStatus,
  type TriggerType,
} from '@intelliflow/domain';

type StatusHistoryEntry = AutoResponseDraft['statusHistory'][number];
type ApprovalDecision = NonNullable<AutoResponseDraft['approvalDecision']>;
type Escalation = NonNullable<AutoResponseDraft['escalation']>;
type PersistedDraft = Prisma.AutoResponseDraftUncheckedCreateInput & {
  id: string;
  version: number;
};

const DEFAULT_MODEL_VERSION = 'unknown';

/**
 * Optimistic locking error for concurrent modification detection
 */
export class OptimisticLockError extends Error {
  constructor(entityType: string, id: string) {
    super(
      `Optimistic lock failed for ${entityType} with id ${id}. Entity was modified by another transaction.`
    );
    this.name = 'OptimisticLockError';
  }
}

/**
 * Prisma implementation of AutoResponseDraftRepository.
 * Maintains optimistic locking via the version field on the aggregate root.
 */
export class PrismaAutoResponseDraftRepository implements AutoResponseDraftRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(draft: AutoResponseDraft): Promise<void> {
    const data = this.toPersistence(draft);
    const id = data.id;

    const existing = await this.prisma.autoResponseDraft.findUnique({
      where: { id },
      select: { version: true },
    });

    if (!existing) {
      await this.prisma.autoResponseDraft.create({
        data: { ...data, version: 0 },
      });
      return;
    }

    const previousVersion = Math.max(data.version - 1, 0);
    const result = await this.prisma.autoResponseDraft.updateMany({
      where: { id, version: previousVersion },
      data,
    });

    if (result.count === 0) {
      throw new OptimisticLockError('AutoResponseDraft', data.id);
    }
  }

  async findById(id: AutoResponseDraftId, tenantId: string): Promise<AutoResponseDraft | null> {
    const record = await this.prisma.autoResponseDraft.findUnique({
      where: { id: id.toString(), tenantId },
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  async find(query: AutoResponseDraftQuery): Promise<AutoResponseDraft[]> {
    const where: Record<string, unknown> = { tenantId: query.tenantId };

    if (query.leadId) where.leadId = query.leadId;
    if (query.status)
      where.status = Array.isArray(query.status) ? { in: query.status } : query.status;
    if (query.triggerType) where.triggerType = query.triggerType;
    if (query.expiredOnly) where.expiresAt = { lt: new Date() };

    const records = await this.prisma.autoResponseDraft.findMany({
      where,
      take: query.limit,
      skip: query.offset,
      orderBy: { createdAt: 'desc' },
    });

    return records.map((record) => this.toDomain(record));
  }

  async findActiveByLeadAndTrigger(
    leadId: string,
    triggerType: TriggerType,
    tenantId: string
  ): Promise<AutoResponseDraft | null> {
    const record = await this.prisma.autoResponseDraft.findFirst({
      where: {
        leadId,
        triggerType,
        tenantId,
        status: { in: ['DRAFT', 'PENDING_APPROVAL', 'ESCALATED'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    return record ? this.toDomain(record) : null;
  }

  async findPendingForApprover(_: string, tenantId: string): Promise<AutoResponseDraft[]> {
    const records = await this.prisma.autoResponseDraft.findMany({
      where: { tenantId, status: 'PENDING_APPROVAL' },
      orderBy: { createdAt: 'asc' },
    });
    return records.map((record) => this.toDomain(record));
  }

  async findPendingByLeadId(leadId: string, tenantId: string): Promise<AutoResponseDraft[]> {
    const records = await this.prisma.autoResponseDraft.findMany({
      where: {
        leadId,
        tenantId,
        status: { in: ['DRAFT', 'PENDING_APPROVAL', 'ESCALATED'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((record) => this.toDomain(record));
  }

  async findExpired(tenantId: string): Promise<AutoResponseDraft[]> {
    const records = await this.prisma.autoResponseDraft.findMany({
      where: {
        tenantId,
        expiresAt: { lt: new Date() },
        status: { notIn: ['SENT', 'FAILED', 'INVALIDATED'] },
      },
      orderBy: { expiresAt: 'asc' },
    });
    return records.map((record) => this.toDomain(record));
  }

  async delete(id: AutoResponseDraftId, tenantId: string): Promise<void> {
    await this.prisma.autoResponseDraft.delete({
      where: { id: id.toString(), tenantId },
    });
  }

  async countByStatus(tenantId: string, status: AutoResponseStatus): Promise<number> {
    return this.prisma.autoResponseDraft.count({
      where: { tenantId, status },
    });
  }

  async expireDraftsBeforeDate(
    tenantId: string,
    before: Date,
    terminalStatuses: AutoResponseStatus[]
  ): Promise<number> {
    const result = await this.prisma.autoResponseDraft.updateMany({
      where: {
        tenantId,
        expiresAt: { lt: before },
        status: { notIn: terminalStatuses as PrismaAutoResponseStatus[] },
      },
      data: { status: 'INVALIDATED' as PrismaAutoResponseStatus },
    });
    return result.count;
  }

  async countByStatusAll(tenantId: string): Promise<Record<AutoResponseStatus, number>> {
    const rows = await this.prisma.autoResponseDraft.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: true,
    });

    const defaultCounts: Record<AutoResponseStatus, number> = {
      DRAFT: 0,
      PENDING_APPROVAL: 0,
      APPROVED: 0,
      REJECTED: 0,
      INVALIDATED: 0,
      SENT: 0,
      FAILED: 0,
      ESCALATED: 0,
    };

    for (const row of rows) {
      defaultCounts[row.status as AutoResponseStatus] = row._count;
    }

    return defaultCounts;
  }

  private toPersistence(draft: AutoResponseDraft): PersistedDraft {
    const content = draft.content.toValue();

    return {
      id: draft.id.toString(),
      tenantId: draft.tenantId,
      leadId: draft.leadId,
      recipientEmail: draft.recipientEmail,
      subject: content.subject,
      body: content.body,
      aiConfidence: draft.aiConfidence,
      modelVersion: draft.modelVersion ?? DEFAULT_MODEL_VERSION,
      triggerType: draft.triggerType as PrismaAutoResponseTrigger,
      status: draft.status as PrismaAutoResponseStatus,
      version: draft.version ?? 0,
      expiresAt: draft.expiresAt,
      statusHistory: this.serializeStatusHistory(draft.statusHistory),
      approvalDecision: draft.approvalDecision
        ? this.serializeApprovalDecision(draft.approvalDecision)
        : Prisma.JsonNull,
      escalation: draft.escalation ? this.serializeEscalation(draft.escalation) : Prisma.JsonNull,
      escalationCount: draft.escalationCount,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
    };
  }

  private toDomain(record: PrismaAutoResponseDraft): AutoResponseDraft {
    const responseContent = ResponseContent.create({
      subject: record.subject,
      body: record.body,
    });

    const statusHistory = this.parseStatusHistory(record.statusHistory);
    const approvalDecision = this.parseApprovalDecision(record.approvalDecision);
    const escalation = this.parseEscalation(record.escalation);

    const draft = AutoResponseDraft.rehydrate({
      id: record.id,
      tenantId: record.tenantId,
      leadId: record.leadId,
      recipientEmail: record.recipientEmail,
      content: responseContent,
      aiConfidence: record.aiConfidence,
      modelVersion: record.modelVersion,
      triggerType: record.triggerType as TriggerType,
      status: record.status as AutoResponseStatus,
      expiresAt: record.expiresAt,
      statusHistory,
      approvalDecision,
      escalation,
      escalationCount: record.escalationCount,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });

    for (let i = 0; i < (record.version ?? 0); i++) {
      draft.incrementVersion();
    }

    return draft;
  }

  private serializeStatusHistory(
    history: ReadonlyArray<StatusHistoryEntry>
  ): Prisma.InputJsonValue {
    return history.map((entry) => ({
      status: entry.status,
      changedAt: entry.changedAt.toISOString(),
      changedBy: entry.changedBy,
      reason: entry.reason,
    }));
  }

  private serializeApprovalDecision(decision: ApprovalDecision): Prisma.InputJsonValue {
    return {
      ...decision,
      decidedAt: decision.decidedAt.toISOString(),
    };
  }

  private serializeEscalation(escalation: Escalation): Prisma.InputJsonValue {
    return {
      ...escalation,
      escalatedAt: escalation.escalatedAt.toISOString(),
      expiresAt: escalation.expiresAt.toISOString(),
      resolvedAt: escalation.resolvedAt ? escalation.resolvedAt.toISOString() : undefined,
    };
  }

  private parseStatusHistory(value: unknown): StatusHistoryEntry[] {
    if (!value) return [];
    const parsed = typeof value === 'string' ? safeParseJSON(value) : value;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const status = (item as any).status as AutoResponseStatus | undefined;
        const changedAt = new Date((item as any).changedAt);
        if (!status || Number.isNaN(changedAt.getTime())) return null;

        const entry: StatusHistoryEntry = {
          status,
          changedAt,
        };

        const changedBy = (item as any).changedBy;
        if (changedBy !== undefined) {
          entry.changedBy = changedBy;
        }

        const reason = (item as any).reason;
        if (reason !== undefined) {
          entry.reason = reason;
        }

        return entry;
      })
      .filter((entry): entry is StatusHistoryEntry => entry !== null);
  }

  private parseApprovalDecision(value: unknown): ApprovalDecision | undefined {
    if (!value || value === Prisma.JsonNull) return undefined;
    const parsed = typeof value === 'string' ? safeParseJSON(value) : value;
    if (!parsed || typeof parsed !== 'object') return undefined;

    const decidedAt = new Date((parsed as any).decidedAt);
    if (Number.isNaN(decidedAt.getTime())) return undefined;

    return {
      decision: (parsed as any).decision,
      decidedBy: (parsed as any).decidedBy,
      decidedAt,
      reason: (parsed as any).reason,
      modifications: (parsed as any).modifications,
    } as ApprovalDecision;
  }

  private parseEscalation(value: unknown): Escalation | undefined {
    if (!value || value === Prisma.JsonNull) return undefined;
    const parsed = typeof value === 'string' ? safeParseJSON(value) : value;
    if (!parsed || typeof parsed !== 'object') return undefined;

    const escalatedAt = new Date((parsed as any).escalatedAt);
    const expiresAt = new Date((parsed as any).expiresAt);
    if (Number.isNaN(escalatedAt.getTime()) || Number.isNaN(expiresAt.getTime())) return undefined;

    const resolvedRaw = (parsed as any).resolvedAt;
    const resolvedAt =
      resolvedRaw !== undefined && resolvedRaw !== null ? new Date(resolvedRaw) : undefined;

    return {
      reason: (parsed as any).reason,
      escalatedTo: (parsed as any).escalatedTo,
      escalatedBy: (parsed as any).escalatedBy,
      escalatedAt,
      expiresAt,
      resolvedAt,
      resolvedBy: (parsed as any).resolvedBy,
      resolutionFeedback: (parsed as any).resolutionFeedback,
    } as Escalation;
  }
}

function safeParseJSON(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
