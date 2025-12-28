import { PrismaClient, Decimal } from '@intelliflow/db';
import { Opportunity, OpportunityId, type OpportunityStage } from '@intelliflow/domain';
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
 * Prisma Opportunity Repository
 * Implements OpportunityRepository port using Prisma ORM
 */
export class PrismaOpportunityRepository implements OpportunityRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(opportunity: Opportunity): Promise<void> {
    const data = {
      id: opportunity.id.value,
      name: opportunity.name,
      value: new Decimal(opportunity.value.toString()),
      stage: opportunity.stage,
      probability: opportunity.probability,
      expectedCloseDate: opportunity.expectedCloseDate ?? null,
      description: opportunity.description ?? null,
      accountId: opportunity.accountId,
      contactId: opportunity.contactId ?? null,
      ownerId: opportunity.ownerId,
      createdAt: opportunity.createdAt,
      updatedAt: opportunity.updatedAt,
      closedAt: opportunity.closedAt ?? null,
    };

    await this.prisma.opportunity.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }

  async findById(id: OpportunityId): Promise<Opportunity | null> {
    const record = await this.prisma.opportunity.findUnique({
      where: { id: id.value },
    });

    if (!record) return null;

    return Opportunity.reconstitute(createOpportunityId(record.id), {
      name: record.name,
      value: Number(record.value),
      stage: record.stage as OpportunityStage,
      probability: record.probability,
      expectedCloseDate: record.expectedCloseDate ?? undefined,
      description: record.description ?? undefined,
      accountId: record.accountId,
      contactId: record.contactId ?? undefined,
      ownerId: record.ownerId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      closedAt: record.closedAt ?? undefined,
    });
  }

  async findByAccountId(accountId: string): Promise<Opportunity[]> {
    const records = await this.prisma.opportunity.findMany({
      where: { accountId },
      orderBy: { expectedCloseDate: 'asc' },
    });

    return records.map((record) =>
      Opportunity.reconstitute(createOpportunityId(record.id), {
        name: record.name,
        value: Number(record.value),
        stage: record.stage as OpportunityStage,
        probability: record.probability,
        expectedCloseDate: record.expectedCloseDate ?? undefined,
        description: record.description ?? undefined,
        accountId: record.accountId,
        contactId: record.contactId ?? undefined,
        ownerId: record.ownerId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        closedAt: record.closedAt ?? undefined,
      })
    );
  }

  async findByOwnerId(ownerId: string): Promise<Opportunity[]> {
    const records = await this.prisma.opportunity.findMany({
      where: { ownerId },
      orderBy: { expectedCloseDate: 'asc' },
    });

    return records.map((record) =>
      Opportunity.reconstitute(createOpportunityId(record.id), {
        name: record.name,
        value: Number(record.value),
        stage: record.stage as OpportunityStage,
        probability: record.probability,
        expectedCloseDate: record.expectedCloseDate ?? undefined,
        description: record.description ?? undefined,
        accountId: record.accountId,
        contactId: record.contactId ?? undefined,
        ownerId: record.ownerId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        closedAt: record.closedAt ?? undefined,
      })
    );
  }

  async findByStage(stage: OpportunityStage, ownerId?: string): Promise<Opportunity[]> {
    const records = await this.prisma.opportunity.findMany({
      where: {
        stage,
        ...(ownerId ? { ownerId } : {}),
      },
      orderBy: { expectedCloseDate: 'asc' },
    });

    return records.map((record) =>
      Opportunity.reconstitute(createOpportunityId(record.id), {
        name: record.name,
        value: Number(record.value),
        stage: record.stage as OpportunityStage,
        probability: record.probability,
        expectedCloseDate: record.expectedCloseDate ?? undefined,
        description: record.description ?? undefined,
        accountId: record.accountId,
        contactId: record.contactId ?? undefined,
        ownerId: record.ownerId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        closedAt: record.closedAt ?? undefined,
      })
    );
  }

  async findClosingSoon(days: number, ownerId?: string): Promise<Opportunity[]> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const records = await this.prisma.opportunity.findMany({
      where: {
        expectedCloseDate: { lte: futureDate },
        closedAt: null,
        ...(ownerId ? { ownerId } : {}),
      },
      orderBy: { expectedCloseDate: 'asc' },
    });

    return records.map((record) =>
      Opportunity.reconstitute(createOpportunityId(record.id), {
        name: record.name,
        value: Number(record.value),
        stage: record.stage as OpportunityStage,
        probability: record.probability,
        expectedCloseDate: record.expectedCloseDate ?? undefined,
        description: record.description ?? undefined,
        accountId: record.accountId,
        contactId: record.contactId ?? undefined,
        ownerId: record.ownerId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        closedAt: record.closedAt ?? undefined,
      })
    );
  }

  async delete(id: OpportunityId): Promise<void> {
    await this.prisma.opportunity.delete({
      where: { id: id.value },
    });
  }

  async sumValueByStage(ownerId?: string): Promise<Record<string, number>> {
    const results = await this.prisma.opportunity.groupBy({
      by: ['stage'],
      where: ownerId ? { ownerId } : undefined,
      _sum: { value: true },
    });

    return results.reduce(
      (acc, result) => {
        acc[result.stage] = Number(result._sum.value ?? 0);
        return acc;
      },
      {} as Record<string, number>
    );
  }

  async countByStage(ownerId?: string): Promise<Record<string, number>> {
    const results = await this.prisma.opportunity.groupBy({
      by: ['stage'],
      where: ownerId ? { ownerId } : undefined,
      _count: true,
    });

    return results.reduce(
      (acc, result) => {
        acc[result.stage] = result._count;
        return acc;
      },
      {} as Record<string, number>
    );
  }

  async findByContactId(contactId: string): Promise<Opportunity[]> {
    const records = await this.prisma.opportunity.findMany({
      where: { contactId },
      orderBy: { expectedCloseDate: 'asc' },
    });

    return records.map((record) =>
      Opportunity.reconstitute(createOpportunityId(record.id), {
        name: record.name,
        value: Number(record.value),
        stage: record.stage as OpportunityStage,
        probability: record.probability,
        expectedCloseDate: record.expectedCloseDate ?? undefined,
        description: record.description ?? undefined,
        accountId: record.accountId,
        contactId: record.contactId ?? undefined,
        ownerId: record.ownerId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        closedAt: record.closedAt ?? undefined,
      })
    );
  }

  async findHighValue(minValue: number, ownerId?: string): Promise<Opportunity[]> {
    const records = await this.prisma.opportunity.findMany({
      where: {
        value: { gte: new Decimal(minValue) },
        ...(ownerId ? { ownerId } : {}),
      },
      orderBy: { value: 'desc' },
    });

    return records.map((record) =>
      Opportunity.reconstitute(createOpportunityId(record.id), {
        name: record.name,
        value: Number(record.value),
        stage: record.stage as OpportunityStage,
        probability: record.probability,
        expectedCloseDate: record.expectedCloseDate ?? undefined,
        description: record.description ?? undefined,
        accountId: record.accountId,
        contactId: record.contactId ?? undefined,
        ownerId: record.ownerId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        closedAt: record.closedAt ?? undefined,
      })
    );
  }
}
