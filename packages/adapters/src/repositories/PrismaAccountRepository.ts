import { PrismaClient, Decimal, type Account as PrismaAccount } from '@intelliflow/db';
import { Account, AccountId, WebsiteUrl, type AccountHierarchyRecord } from '@intelliflow/domain';
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
 *
 * IFC-269: All read/delete methods include tenantId in WHERE clause
 * for defense-in-depth tenant isolation (ADR-004).
 */
export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private toDomain(record: PrismaAccount): Account {
    return Account.reconstitute(createAccountId(record.id), {
      name: record.name,
      website: toWebsiteUrl(record.website),
      industry: record.industry ?? undefined,
      employees: record.employees ?? undefined,
      revenue: record.revenue ? Number(record.revenue) : undefined,
      description: record.description ?? undefined,
      parentAccountId: record.parentAccountId ?? undefined,
      ownerId: record.ownerId,
      tenantId: record.tenantId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  async save(account: Account): Promise<void> {
    const data = {
      id: account.id.value,
      name: account.name,
      website: account.website?.toValue() ?? null,
      industry: account.industry ?? null,
      employees: account.employees ?? null,
      revenue: account.revenue ? new Decimal(account.revenue.toString()) : null,
      description: account.description ?? null,
      parentAccountId: account.parentAccountId ?? null,
      ownerId: account.ownerId,
      tenantId: account.tenantId,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };

    // F2 fix: tenant-guarded write. Use updateMany with tenantId to prevent
    // cross-tenant record overwrite, then create if nothing was updated.
    const updated = await this.prisma.account.updateMany({
      where: { id: data.id, tenantId: data.tenantId },
      data,
    });

    if (updated.count === 0) {
      await this.prisma.account.create({ data });
    }
  }

  async findById(id: AccountId, tenantId: string): Promise<Account | null> {
    const record = await this.prisma.account.findFirst({
      where: { id: id.value, tenantId },
    });

    if (!record) return null;

    return this.toDomain(record);
  }

  async findByOwnerId(ownerId: string, tenantId: string): Promise<Account[]> {
    const records = await this.prisma.account.findMany({
      where: { ownerId, tenantId },
      orderBy: { name: 'asc' },
    });

    return records.map((record) => this.toDomain(record));
  }

  async findByName(name: string, tenantId: string): Promise<Account[]> {
    const records = await this.prisma.account.findMany({
      where: {
        name: { contains: name, mode: 'insensitive' },
        tenantId,
      },
      orderBy: { name: 'asc' },
    });

    return records.map((record) => this.toDomain(record));
  }

  async findByIndustry(industry: string, tenantId: string): Promise<Account[]> {
    const records = await this.prisma.account.findMany({
      where: {
        industry,
        tenantId,
      },
      orderBy: { name: 'asc' },
    });

    return records.map((record) => this.toDomain(record));
  }

  async delete(id: AccountId, tenantId: string): Promise<void> {
    // Use deleteMany to gracefully handle cross-tenant attempts (returns 0 instead of throwing)
    await this.prisma.account.deleteMany({
      where: { id: id.value, tenantId },
    });
  }

  async countByOwner(ownerId: string, tenantId: string): Promise<number> {
    return this.prisma.account.count({
      where: { ownerId, tenantId },
    });
  }

  async existsByName(name: string, tenantId: string): Promise<boolean> {
    const count = await this.prisma.account.count({
      where: { name, tenantId },
    });
    return count > 0;
  }

  async countByIndustry(tenantId: string): Promise<Record<string, number>> {
    const results = await this.prisma.account.groupBy({
      by: ['industry'],
      _count: true,
      where: { tenantId },
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

  private buildChildrenInclude(depth: number): Record<string, unknown> {
    if (depth <= 0) return {};
    return {
      childAccounts: {
        include: {
          _count: { select: { contacts: true, opportunities: true } },
          ...this.buildChildrenInclude(depth - 1),
        },
      },
    };
  }

  async findWithChildren(
    id: AccountId,
    maxDepth: number,
    tenantId: string
  ): Promise<AccountHierarchyRecord | null> {
    const include = {
      _count: { select: { contacts: true, opportunities: true } },
      ...this.buildChildrenInclude(maxDepth),
    };

    const record = await this.prisma.account.findFirst({
      where: { id: id.value, tenantId },
      include,
    });

    return record as AccountHierarchyRecord | null;
  }

  async findAncestors(id: AccountId, tenantId: string): Promise<Account[]> {
    const ancestors: Account[] = [];
    let currentId: string | null = id.value;
    const visited = new Set<string>();

    while (currentId) {
      if (visited.has(currentId)) break;
      visited.add(currentId);

      const record: PrismaAccount | null = await this.prisma.account.findFirst({
        where: { id: currentId, tenantId },
      });

      if (!record?.parentAccountId) break;

      const parentRecord: PrismaAccount | null = await this.prisma.account.findFirst({
        where: { id: record.parentAccountId, tenantId },
      });

      // Break traversal on cross-tenant boundary (parent not found within tenant)
      if (!parentRecord) break;

      ancestors.push(this.toDomain(parentRecord));
      currentId = parentRecord.parentAccountId;
    }

    return ancestors;
  }

  async getHierarchyDepth(id: AccountId, tenantId: string): Promise<number> {
    const ancestors = await this.findAncestors(id, tenantId);
    return ancestors.length;
  }
}
