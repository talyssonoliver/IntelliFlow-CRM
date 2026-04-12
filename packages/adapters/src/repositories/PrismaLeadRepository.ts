import { PrismaClient } from '@intelliflow/db';
import {
  Lead,
  LeadId,
  Email,
  PhoneNumber,
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
 * Helper to convert string to PhoneNumber Value Object
 */
function toPhoneNumber(phone: string | null): PhoneNumber | undefined {
  if (!phone) return undefined;
  const result = PhoneNumber.create(phone);
  if (result.isFailure) {
    // Log warning but don't throw - data might be legacy
    console.warn(`Invalid phone number in database: ${phone}`);
    return undefined;
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
      phone: lead.phone?.toValue() ?? null, // Convert PhoneNumber to string
      source: lead.source,
      status: lead.status,
      score: lead.score.value,
      ownerId: lead.ownerId,
      tenantId: lead.tenantId,
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

    return Lead.reconstitute(createLeadId(record.id), {
      email: Email.create(record.email).value,
      firstName: record.firstName ?? undefined,
      lastName: record.lastName ?? undefined,
      company: record.company ?? undefined,
      title: record.title ?? undefined,
      phone: toPhoneNumber(record.phone),
      source: record.source as LeadSource,
      status: record.status as LeadStatus,
      score: {
        value: record.score,
        confidence: 1, // Default confidence since Prisma only stores score value
      },
      ownerId: record.ownerId,
      tenantId: record.tenantId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  async findByEmail(email: Email): Promise<Lead | null> {
    // Note: email is not unique on Lead, use findFirst
    const record = await this.prisma.lead.findFirst({
      where: { email: email.value },
    });

    if (!record) return null;

    return Lead.reconstitute(createLeadId(record.id), {
      email: Email.create(record.email).value,
      firstName: record.firstName ?? undefined,
      lastName: record.lastName ?? undefined,
      company: record.company ?? undefined,
      title: record.title ?? undefined,
      phone: toPhoneNumber(record.phone),
      source: record.source as LeadSource,
      status: record.status as LeadStatus,
      score: {
        value: record.score,
        confidence: 1,
      },
      ownerId: record.ownerId,
      tenantId: record.tenantId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  async findByOwnerId(ownerId: string): Promise<Lead[]> {
    const records = await this.prisma.lead.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((record) =>
      Lead.reconstitute(createLeadId(record.id), {
        email: Email.create(record.email).value,
        firstName: record.firstName ?? undefined,
        lastName: record.lastName ?? undefined,
        company: record.company ?? undefined,
        title: record.title ?? undefined,
        phone: toPhoneNumber(record.phone),
        source: record.source as LeadSource,
        status: record.status as LeadStatus,
        score: {
          value: record.score,
          confidence: 1,
        },
        ownerId: record.ownerId,
        tenantId: record.tenantId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      })
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
      Lead.reconstitute(createLeadId(record.id), {
        email: Email.create(record.email).value,
        firstName: record.firstName ?? undefined,
        lastName: record.lastName ?? undefined,
        company: record.company ?? undefined,
        title: record.title ?? undefined,
        phone: toPhoneNumber(record.phone),
        source: record.source as LeadSource,
        status: record.status as LeadStatus,
        score: {
          value: record.score,
          confidence: 1,
        },
        ownerId: record.ownerId,
        tenantId: record.tenantId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      })
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
      Lead.reconstitute(createLeadId(record.id), {
        email: Email.create(record.email).value,
        firstName: record.firstName ?? undefined,
        lastName: record.lastName ?? undefined,
        company: record.company ?? undefined,
        title: record.title ?? undefined,
        phone: toPhoneNumber(record.phone),
        source: record.source as LeadSource,
        status: record.status as LeadStatus,
        score: {
          value: record.score,
          confidence: 1,
        },
        ownerId: record.ownerId,
        tenantId: record.tenantId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      })
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
        OR: [{ score: 0 }, { updatedAt: { lt: thirtyDaysAgo } }],
      },
      take: limit,
      orderBy: { createdAt: 'asc' },
    });

    return records.map((record) =>
      Lead.reconstitute(createLeadId(record.id), {
        email: Email.create(record.email).value,
        firstName: record.firstName ?? undefined,
        lastName: record.lastName ?? undefined,
        company: record.company ?? undefined,
        title: record.title ?? undefined,
        phone: toPhoneNumber(record.phone),
        source: record.source as LeadSource,
        status: record.status as LeadStatus,
        score: {
          value: record.score,
          confidence: 1,
        },
        ownerId: record.ownerId,
        tenantId: record.tenantId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      })
    );
  }

  /**
   * IFC-007: Bulk update lead status
   * Uses updateMany for O(1) batch operation instead of O(n) sequential updates
   */
  async bulkUpdateStatus(
    ids: string[],
    status: LeadStatus,
    updatedBy: string
  ): Promise<{ successful: string[]; failed: Array<{ id: string; error: string }> }> {
    const successful: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    try {
      // Verify which leads exist
      const existingLeads = await this.prisma.lead.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      const existingIds = new Set(existingLeads.map((l) => l.id));

      // Track non-existent IDs
      for (const id of ids) {
        if (!existingIds.has(id)) {
          failed.push({ id, error: 'Lead not found' });
        }
      }

      // Batch update existing leads
      const idsToUpdate = ids.filter((id) => existingIds.has(id));
      if (idsToUpdate.length > 0) {
        await this.prisma.lead.updateMany({
          where: { id: { in: idsToUpdate } },
          data: {
            status,
            updatedAt: new Date(),
          },
        });
        successful.push(...idsToUpdate);
      }
    } catch (error) {
      // If batch update fails, all IDs fail
      for (const id of ids) {
        if (!failed.some((f) => f.id === id)) {
          failed.push({
            id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    return { successful, failed };
  }

  /**
   * IFC-007: Bulk delete leads
   * Uses deleteMany for O(1) batch operation instead of O(n) sequential deletes
   */
  async bulkDelete(
    ids: string[]
  ): Promise<{ successful: string[]; failed: Array<{ id: string; error: string }> }> {
    const successful: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    try {
      // Verify which leads exist before deletion
      const existingLeads = await this.prisma.lead.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      const existingIds = new Set(existingLeads.map((l) => l.id));

      // Track non-existent IDs
      for (const id of ids) {
        if (!existingIds.has(id)) {
          failed.push({ id, error: 'Lead not found' });
        }
      }

      // Batch delete existing leads
      const idsToDelete = ids.filter((id) => existingIds.has(id));
      if (idsToDelete.length > 0) {
        await this.prisma.lead.deleteMany({
          where: { id: { in: idsToDelete } },
        });
        successful.push(...idsToDelete);
      }
    } catch (error) {
      // If batch delete fails, all IDs fail
      for (const id of ids) {
        if (!failed.some((f) => f.id === id)) {
          failed.push({
            id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    return { successful, failed };
  }

  /**
   * IFC-007: Bulk convert leads to contacts
   * Uses transaction with batch operations for O(1) instead of O(n)
   */
  async bulkConvert(
    ids: string[],
    createAccounts: boolean,
    userId: string
  ): Promise<{ successful: string[]; failed: Array<{ id: string; error: string }> }> {
    return await this.prisma.$transaction(async (tx) => {
      const successful: string[] = [];
      const failed: Array<{ id: string; error: string }> = [];

      // Fetch all leads in single query
      const leads = await tx.lead.findMany({
        where: { id: { in: ids } },
      });
      const existingIds = new Set(leads.map((l) => l.id));

      // Track non-existent leads
      for (const id of ids) {
        if (!existingIds.has(id)) {
          failed.push({ id, error: 'Lead not found' });
        }
      }

      // Filter valid leads for conversion (not already converted)
      const validLeads = leads.filter((l) => l.status !== 'CONVERTED');
      const alreadyConverted = leads.filter((l) => l.status === 'CONVERTED');

      for (const lead of alreadyConverted) {
        failed.push({ id: lead.id, error: 'Lead already converted' });
      }

      if (validLeads.length === 0) {
        return { successful, failed };
      }

      // Batch update lead statuses
      await tx.lead.updateMany({
        where: { id: { in: validLeads.map((l) => l.id) } },
        data: {
          status: 'CONVERTED',
          updatedAt: new Date(),
        },
      });

      // Batch create contacts
      await tx.contact.createMany({
        data: validLeads.map((lead) => ({
          firstName: lead.firstName || 'Unknown',
          lastName: lead.lastName || 'Unknown',
          email: lead.email,
          phone: lead.phone,
          company: lead.company,
          title: lead.title,
          tenantId: lead.tenantId,
          ownerId: lead.ownerId || userId,
          createdBy: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
        skipDuplicates: true,
      });

      // Optionally create accounts
      if (createAccounts) {
        const companiesWithLeads = validLeads.filter((l) => l.company);
        if (companiesWithLeads.length > 0) {
          await tx.account.createMany({
            data: companiesWithLeads.map((lead) => ({
              name: lead.company!,
              tenantId: lead.tenantId,
              ownerId: lead.ownerId || userId,
              createdBy: userId,
              createdAt: new Date(),
              updatedAt: new Date(),
            })),
            skipDuplicates: true,
          });
        }
      }

      successful.push(...validLeads.map((l) => l.id));
      return { successful, failed };
    });
  }
}
