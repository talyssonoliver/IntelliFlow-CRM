import { PrismaClient, Decimal } from '@intelliflow/db';
import { Account, AccountId, WebsiteUrl } from '@intelliflow/domain';
import { AccountRepository } from '@intelliflow/application';

/**
 * Helper to create AccountId from string, throwing if invalid
 */
function createAccountId(id: string): AccountId {
  const result = AccountId.create(id);
  if (result.isFailure) {
    throw new Error(`Invalid AccountId: ${id}`);
  }
  return result.value;
}

/**
 * Helper to convert string to WebsiteUrl Value Object
 */
function toWebsiteUrl(url: string | null): WebsiteUrl | undefined {
  if (!url) return undefined;
  const result = WebsiteUrl.create(url);
  if (result.isFailure) {
    // Log warning but don't throw - data might be legacy
    console.warn(`Invalid website URL in database: ${url}`);
    return undefined;
  }
  return result.value;
}

/**
 * Prisma Account Repository
 * Implements AccountRepository port using Prisma ORM
 */
export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(account: Account): Promise<void> {
    const data = {
      id: account.id.value,
      name: account.name,
      website: account.website?.toValue() ?? null, // Convert WebsiteUrl to string
      industry: account.industry ?? null,
      employees: account.employees ?? null,
      revenue: account.revenue ? new Decimal(account.revenue.toString()) : null,
      description: account.description ?? null,
      ownerId: account.ownerId,
      tenantId: account.tenantId,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };

    await this.prisma.account.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }

  async findById(id: AccountId): Promise<Account | null> {
    const record = await this.prisma.account.findUnique({
      where: { id: id.value },
    });

    if (!record) return null;

    return Account.reconstitute(createAccountId(record.id), {
      name: record.name,
      website: toWebsiteUrl(record.website),
      industry: record.industry ?? undefined,
      employees: record.employees ?? undefined,
      revenue: record.revenue ? Number(record.revenue) : undefined,
      description: record.description ?? undefined,
      ownerId: record.ownerId,
      tenantId: record.tenantId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  async findByOwnerId(ownerId: string): Promise<Account[]> {
    const records = await this.prisma.account.findMany({
      where: { ownerId },
      orderBy: { name: 'asc' },
    });

    return records.map((record) =>
      Account.reconstitute(createAccountId(record.id), {
        name: record.name,
        website: toWebsiteUrl(record.website),
        industry: record.industry ?? undefined,
        employees: record.employees ?? undefined,
        revenue: record.revenue ? Number(record.revenue) : undefined,
        description: record.description ?? undefined,
        ownerId: record.ownerId,
      tenantId: record.tenantId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      })
    );
  }

  async findByName(name: string): Promise<Account[]> {
    const records = await this.prisma.account.findMany({
      where: {
        name: { contains: name, mode: 'insensitive' },
      },
      orderBy: { name: 'asc' },
    });

    return records.map((record) =>
      Account.reconstitute(createAccountId(record.id), {
        name: record.name,
        website: toWebsiteUrl(record.website),
        industry: record.industry ?? undefined,
        employees: record.employees ?? undefined,
        revenue: record.revenue ? Number(record.revenue) : undefined,
        description: record.description ?? undefined,
        ownerId: record.ownerId,
      tenantId: record.tenantId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      })
    );
  }

  async findByIndustry(industry: string, ownerId?: string): Promise<Account[]> {
    const records = await this.prisma.account.findMany({
      where: {
        industry,
        ...(ownerId ? { ownerId } : {}),
      },
      orderBy: { name: 'asc' },
    });

    return records.map((record) =>
      Account.reconstitute(createAccountId(record.id), {
        name: record.name,
        website: toWebsiteUrl(record.website),
        industry: record.industry ?? undefined,
        employees: record.employees ?? undefined,
        revenue: record.revenue ? Number(record.revenue) : undefined,
        description: record.description ?? undefined,
        ownerId: record.ownerId,
      tenantId: record.tenantId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      })
    );
  }

  async delete(id: AccountId): Promise<void> {
    await this.prisma.account.delete({
      where: { id: id.value },
    });
  }

  async countByOwner(ownerId: string): Promise<number> {
    return this.prisma.account.count({
      where: { ownerId },
    });
  }

  async existsByName(name: string): Promise<boolean> {
    const count = await this.prisma.account.count({
      where: { name },
    });
    return count > 0;
  }

  async countByIndustry(): Promise<Record<string, number>> {
    const results = await this.prisma.account.groupBy({
      by: ['industry'],
      _count: true,
    });

    return results.reduce(
      (acc, result) => {
        if (result.industry) {
          acc[result.industry] = result._count;
        }
        return acc;
      },
      {} as Record<string, number>
    );
  }
}
