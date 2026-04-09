import { PrismaClient, Decimal } from '@intelliflow/db';
import {
  Opportunity,
  OpportunityId,
  Money,
  Percentage,
  type OpportunityStage,
} from '@intelliflow/domain';
import { OpportunityRepository } from '@intelliflow/application';

/**
 * Helper to create OpportunityId from string, throwing if invalid
 */
function createOpportunityId(id: string): OpportunityId {
  const result = OpportunityId.create(id);
  if (result.isFailure) {
    throw new Error(`Invalid OpportunityId: ${id}`);
  }
  return result.value;
}

/**
 * Helper to convert Decimal to Money Value Object
 */
function toMoney(value: Decimal | null): Money {
  if (!value) return Money.zero();
  const result = Money.create(Number(value));
  if (result.isFailure) {
    console.warn(`Invalid money value in database: ${value}`);
    return Money.zero();
  }
  return result.value;
}

/**
 * Helper to convert number to Percentage Value Object
 */
function toPercentage(value: number | null): Percentage {
  if (value === null) return Percentage.create(0).value; // Default to 0%
  const result = Percentage.create(value);
  if (result.isFailure) {
    console.warn(`Invalid percentage in database: ${value}`);
    return Percentage.create(0).value;
  }
  return result.value;
}

/**
 * Helper to reconstitute an Opportunity from a Prisma record
 */
function reconstituteOpportunity(record: {
  id: string;
  name: string;
  value: Decimal | null;
  stage: string;
  probability: number;
  expectedCloseDate: Date | null;
  description: string | null;
  accountId: string;
  contactId: string | null;
  ownerId: string;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date | null;
  sourceLeadId?: string | null;
  deletedAt?: Date | null;
}): Opportunity {
  return Opportunity.reconstitute(createOpportunityId(record.id), {
    name: record.name,
    value: toMoney(record.value),
    stage: record.stage as OpportunityStage,
    probability: toPercentage(record.probability),
    expectedCloseDate: record.expectedCloseDate ?? undefined,
    description: record.description ?? undefined,
    accountId: record.accountId,
    contactId: record.contactId ?? undefined,
    ownerId: record.ownerId,
    tenantId: record.tenantId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    closedAt: record.closedAt ?? undefined,
    sourceLeadId: record.sourceLeadId ?? undefined,
    deletedAt: record.deletedAt ?? null,
  });
}

/**
 * Prisma Opportunity Repository
 * Implements OpportunityRepository port using Prisma ORM
 *
 * IFC-281: All query methods require tenantId for tenant isolation.
 */
export class PrismaOpportunityRepository implements OpportunityRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(opportunity: Opportunity): Promise<void> {
    const data = {
      id: opportunity.id.value,
      name: opportunity.name,
      value: new Decimal(opportunity.value.amount), // Convert Money to Decimal
      stage: opportunity.stage,
      probability: opportunity.probability.value, // Convert Percentage to number
      expectedCloseDate: opportunity.expectedCloseDate ?? null,
      description: opportunity.description ?? null,
      accountId: opportunity.accountId,
      contactId: opportunity.contactId ?? null,
      ownerId: opportunity.ownerId,
      tenantId: opportunity.tenantId,
      createdAt: opportunity.createdAt,
      updatedAt: opportunity.updatedAt,
      closedAt: opportunity.closedAt ?? null,
      sourceLeadId: opportunity.sourceLeadId ?? null,
    };

    await this.prisma.opportunity.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }

  async findById(id: OpportunityId, tenantId?: string): Promise<Opportunity | null> {
    const record = await this.prisma.opportunity.findFirst({
      where: { id: id.value, deletedAt: null, ...(tenantId ? { tenantId } : {}) } as any,
    });

    if (!record) return null;

    return reconstituteOpportunity(record);
  }

  async findByAccountId(accountId: string, tenantId?: string): Promise<Opportunity[]> {
    const records = await this.prisma.opportunity.findMany({
      where: { accountId, deletedAt: null, ...(tenantId ? { tenantId } : {}) } as any,
      orderBy: { expectedCloseDate: 'asc' },
    });

    return records.map(reconstituteOpportunity);
  }

  async findByOwnerId(ownerId: string, tenantId?: string): Promise<Opportunity[]> {
    const records = await this.prisma.opportunity.findMany({
      where: { ownerId, deletedAt: null, ...(tenantId ? { tenantId } : {}) } as any,
      orderBy: { expectedCloseDate: 'asc' },
    });

    return records.map(reconstituteOpportunity);
  }

  async findByStage(stage: OpportunityStage, tenantId?: string, ownerId?: string): Promise<Opportunity[]> {
    const records = await this.prisma.opportunity.findMany({
      where: {
        stage,
        deletedAt: null,
        ...(tenantId ? { tenantId } : {}),
        ...(ownerId ? { ownerId } : {}),
      } as any,
      orderBy: { expectedCloseDate: 'asc' },
    });

    return records.map(reconstituteOpportunity);
  }

  async findClosingSoon(days: number, tenantId?: string, ownerId?: string): Promise<Opportunity[]> {
    const futureDate = new Date();
    futureDate.setUTCDate(futureDate.getUTCDate() + days);

    const records = await this.prisma.opportunity.findMany({
      where: {
        expectedCloseDate: { lte: futureDate },
        closedAt: null,
        deletedAt: null,
        ...(tenantId ? { tenantId } : {}),
        ...(ownerId ? { ownerId } : {}),
      } as any,
      orderBy: { expectedCloseDate: 'asc' },
    });

    return records.map(reconstituteOpportunity);
  }

  async delete(id: OpportunityId, tenantId: string): Promise<void> {
    const { count } = await this.prisma.opportunity.deleteMany({
      where: { id: id.value, tenantId },
    });

    if (count === 0) {
      throw new Error(`Opportunity not found or tenant mismatch: ${id.value}`);
    }
  }

  async sumValueByStage(tenantId?: string, ownerId?: string): Promise<Record<string, number>> {
    const results = await this.prisma.opportunity.groupBy({
      by: ['stage'],
      where: { deletedAt: null, ...(tenantId ? { tenantId } : {}), ...(ownerId ? { ownerId } : {}) } as any,
      _sum: { value: true },
    });

    return results.reduce(
      (acc, result) => {
        acc[result.stage] = Number(result._sum?.value ?? 0);
        return acc;
      },
      {} as Record<string, number>
    );
  }

  async countByStage(tenantId?: string, ownerId?: string): Promise<Record<string, number>> {
    const results = await this.prisma.opportunity.groupBy({
      by: ['stage'],
      where: { deletedAt: null, ...(tenantId ? { tenantId } : {}), ...(ownerId ? { ownerId } : {}) } as any,
      _count: true,
    });

    return results.reduce(
      (acc, result) => {
        acc[result.stage] = typeof result._count === 'number' ? result._count : 0;
        return acc;
      },
      {} as Record<string, number>
    );
  }

  async findByContactId(contactId: string, tenantId?: string): Promise<Opportunity[]> {
    const records = await this.prisma.opportunity.findMany({
      where: { contactId, deletedAt: null, ...(tenantId ? { tenantId } : {}) } as any,
      orderBy: { expectedCloseDate: 'asc' },
    });

    return records.map(reconstituteOpportunity);
  }

  async findHighValue(minValue: number, tenantId?: string, ownerId?: string): Promise<Opportunity[]> {
    const records = await this.prisma.opportunity.findMany({
      where: {
        value: { gte: new Decimal(minValue) },
        deletedAt: null,
        ...(tenantId ? { tenantId } : {}),
        ...(ownerId ? { ownerId } : {}),
      } as any,
      orderBy: { value: 'desc' },
    });

    return records.map(reconstituteOpportunity);
  }

  async softDelete(id: OpportunityId, tenantId: string): Promise<void> {
    const { count } = await this.prisma.opportunity.updateMany({
      where: { id: id.value, tenantId } as any,
      data: { deletedAt: new Date() } as any,
    });
    if (count === 0) {
      throw new Error(`Opportunity not found or tenant mismatch: ${id.value}`);
    }
  }

  async restore(id: OpportunityId, tenantId: string): Promise<void> {
    const { count } = await this.prisma.opportunity.updateMany({
      where: { id: id.value, tenantId } as any,
      data: { deletedAt: null } as any,
    });
    if (count === 0) {
      throw new Error(`Opportunity not found or tenant mismatch: ${id.value}`);
    }
  }

  async findByIdIncludingDeleted(id: OpportunityId): Promise<Opportunity | null> {
    const record = await this.prisma.opportunity.findUnique({
      where: { id: id.value },
    });
    if (!record) return null;
    return reconstituteOpportunity(record);
  }

  async findTrashed(params: {
    tenantId: string;
    search?: string;
    skip?: number;
    take?: number;
    orderBy?: Record<string, string>;
  }): Promise<{ items: Opportunity[]; total: number }> {
    const where: any = { tenantId: params.tenantId, deletedAt: { not: null } };
    if (params.search) {
      where.name = { contains: params.search, mode: 'insensitive' };
    }
    const [records, total] = await Promise.all([
      this.prisma.opportunity.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: params.orderBy as any,
      }),
      this.prisma.opportunity.count({ where }),
    ]);
    return { items: records.map(reconstituteOpportunity), total };
  }
}
