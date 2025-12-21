import { PrismaClient } from '@intelliflow/db';
import {
  Lead,
  LeadId,
  Email,
  type LeadSource,
  type LeadStatus,
} from '@intelliflow/domain';
import { LeadRepository } from '@intelliflow/application';

/**
 * Helper to create LeadId from string, throwing if invalid
 */
function createLeadId(id: string): LeadId {
  const result = LeadId.create(id);
  if (result.isFailure) {
    throw new Error(`Invalid LeadId: ${id}`);
  }
  return result.value;
}

/**
 * Prisma Lead Repository
 * Implements LeadRepository port using Prisma ORM
 *
 * Note: Prisma schema only has 'score' (Int), not separate value/confidence.
 * We store score value and use default confidence (1.0) when reconstituting.
 */
export class PrismaLeadRepository implements LeadRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(lead: Lead): Promise<void> {
    const data = {
      id: lead.id.value,
      email: lead.email.value,
      firstName: lead.firstName ?? null,
      lastName: lead.lastName ?? null,
      company: lead.company ?? null,
      title: lead.title ?? null,
      phone: lead.phone ?? null,
      source: lead.source,
      status: lead.status,
      score: lead.score.value,
      ownerId: lead.ownerId,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
    };

    await this.prisma.lead.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }

  async findById(id: LeadId): Promise<Lead | null> {
    const record = await this.prisma.lead.findUnique({
      where: { id: id.value },
    });

    if (!record) return null;

    return Lead.reconstitute(
      createLeadId(record.id),
      {
        email: Email.create(record.email).value,
        firstName: record.firstName ?? undefined,
        lastName: record.lastName ?? undefined,
        company: record.company ?? undefined,
        title: record.title ?? undefined,
        phone: record.phone ?? undefined,
        source: record.source as LeadSource,
        status: record.status as LeadStatus,
        score: {
          value: record.score,
          confidence: 1.0, // Default confidence since Prisma only stores score value
        },
        ownerId: record.ownerId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }
    );
  }

  async findByEmail(email: Email): Promise<Lead | null> {
    // Note: email is not unique on Lead, use findFirst
    const record = await this.prisma.lead.findFirst({
      where: { email: email.value },
    });

    if (!record) return null;

    return Lead.reconstitute(
      createLeadId(record.id),
      {
        email: Email.create(record.email).value,
        firstName: record.firstName ?? undefined,
        lastName: record.lastName ?? undefined,
        company: record.company ?? undefined,
        title: record.title ?? undefined,
        phone: record.phone ?? undefined,
        source: record.source as LeadSource,
        status: record.status as LeadStatus,
        score: {
          value: record.score,
          confidence: 1.0,
        },
        ownerId: record.ownerId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }
    );
  }

  async findByOwnerId(ownerId: string): Promise<Lead[]> {
    const records = await this.prisma.lead.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((record) =>
      Lead.reconstitute(
        createLeadId(record.id),
        {
          email: Email.create(record.email).value,
          firstName: record.firstName ?? undefined,
          lastName: record.lastName ?? undefined,
          company: record.company ?? undefined,
          title: record.title ?? undefined,
          phone: record.phone ?? undefined,
          source: record.source as LeadSource,
          status: record.status as LeadStatus,
          score: {
            value: record.score,
            confidence: 1.0,
          },
          ownerId: record.ownerId,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        }
      )
    );
  }

  async findByStatus(status: string, ownerId?: string): Promise<Lead[]> {
    const records = await this.prisma.lead.findMany({
      where: {
        status: status as LeadStatus,
        ...(ownerId ? { ownerId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((record) =>
      Lead.reconstitute(
        createLeadId(record.id),
        {
          email: Email.create(record.email).value,
          firstName: record.firstName ?? undefined,
          lastName: record.lastName ?? undefined,
          company: record.company ?? undefined,
          title: record.title ?? undefined,
          phone: record.phone ?? undefined,
          source: record.source as LeadSource,
          status: record.status as LeadStatus,
          score: {
            value: record.score,
            confidence: 1.0,
          },
          ownerId: record.ownerId,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        }
      )
    );
  }

  async findByMinScore(minScore: number, ownerId?: string): Promise<Lead[]> {
    const records = await this.prisma.lead.findMany({
      where: {
        score: { gte: minScore },
        ...(ownerId ? { ownerId } : {}),
      },
      orderBy: { score: 'desc' },
    });

    return records.map((record) =>
      Lead.reconstitute(
        createLeadId(record.id),
        {
          email: Email.create(record.email).value,
          firstName: record.firstName ?? undefined,
          lastName: record.lastName ?? undefined,
          company: record.company ?? undefined,
          title: record.title ?? undefined,
          phone: record.phone ?? undefined,
          source: record.source as LeadSource,
          status: record.status as LeadStatus,
          score: {
            value: record.score,
            confidence: 1.0,
          },
          ownerId: record.ownerId,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        }
      )
    );
  }

  async delete(id: LeadId): Promise<void> {
    await this.prisma.lead.delete({
      where: { id: id.value },
    });
  }

  async existsByEmail(email: Email): Promise<boolean> {
    const count = await this.prisma.lead.count({
      where: { email: email.value },
    });
    return count > 0;
  }

  async countByStatus(ownerId?: string): Promise<Record<string, number>> {
    const results = await this.prisma.lead.groupBy({
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

  async findForScoring(limit: number): Promise<Lead[]> {
    // Find leads with score = 0 or updated > 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const records = await this.prisma.lead.findMany({
      where: {
        OR: [
          { score: 0 },
          { updatedAt: { lt: thirtyDaysAgo } },
        ],
      },
      take: limit,
      orderBy: { createdAt: 'asc' },
    });

    return records.map((record) =>
      Lead.reconstitute(
        createLeadId(record.id),
        {
          email: Email.create(record.email).value,
          firstName: record.firstName ?? undefined,
          lastName: record.lastName ?? undefined,
          company: record.company ?? undefined,
          title: record.title ?? undefined,
          phone: record.phone ?? undefined,
          source: record.source as LeadSource,
          status: record.status as LeadStatus,
          score: {
            value: record.score,
            confidence: 1.0,
          },
          ownerId: record.ownerId,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        }
      )
    );
  }
}
