import { PrismaClient, Decimal } from '@intelliflow/db';
import { Account, AccountId } from '@intelliflow/domain';
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
 * Prisma Account Repository
 * Implements AccountRepository port using Prisma ORM
 */
export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(account: Account): Promise<void> {
    const data = {
      id: account.id.value,
      name: account.name,
      website: account.website ?? null,
      industry: account.industry ?? null,
      employees: account.employees ?? null,
      revenue: account.revenue ? new Decimal(account.revenue.toString()) : null,
      description: account.description ?? null,
      ownerId: account.ownerId,
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
      website: record.website ?? undefined,
      industry: record.industry ?? undefined,
      employees: record.employees ?? undefined,
      revenue: record.revenue ? Number(record.revenue) : undefined,
      description: record.description ?? undefined,
      ownerId: record.ownerId,
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
        website: record.website ?? undefined,
        industry: record.industry ?? undefined,
        employees: record.employees ?? undefined,
        revenue: record.revenue ? Number(record.revenue) : undefined,
        description: record.description ?? undefined,
        ownerId: record.ownerId,
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
        website: record.website ?? undefined,
        industry: record.industry ?? undefined,
        employees: record.employees ?? undefined,
        revenue: record.revenue ? Number(record.revenue) : undefined,
        description: record.description ?? undefined,
        ownerId: record.ownerId,
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
        website: record.website ?? undefined,
        industry: record.industry ?? undefined,
        employees: record.employees ?? undefined,
        revenue: record.revenue ? Number(record.revenue) : undefined,
        description: record.description ?? undefined,
        ownerId: record.ownerId,
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
}
