import { Account, AccountId, AccountRepository, type AccountHierarchyRecord } from '@intelliflow/domain';

/**
 * In-Memory Account Repository
 * Used for testing and development
 */
export class InMemoryAccountRepository implements AccountRepository {
  private accounts: Map<string, Account> = new Map();

  async save(account: Account): Promise<void> {
    this.accounts.set(account.id.value, account);
  }

  async findById(id: AccountId): Promise<Account | null> {
    return this.accounts.get(id.value) ?? null;
  }

  async findByName(name: string): Promise<Account[]> {
    const lowerName = name.toLowerCase();
    return Array.from(this.accounts.values())
      .filter((account) => account.name.toLowerCase().includes(lowerName))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async findByOwnerId(ownerId: string): Promise<Account[]> {
    return Array.from(this.accounts.values())
      .filter((account) => account.ownerId === ownerId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findByIndustry(industry: string): Promise<Account[]> {
    return Array.from(this.accounts.values())
      .filter((account) => account.industry === industry)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async delete(id: AccountId): Promise<void> {
    this.accounts.delete(id.value);
  }

  async existsByName(name: string): Promise<boolean> {
    const lowerName = name.toLowerCase();
    for (const account of this.accounts.values()) {
      if (account.name.toLowerCase() === lowerName) {
        return true;
      }
    }
    return false;
  }

  async countByIndustry(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};

    for (const account of this.accounts.values()) {
      const industry = account.industry ?? 'Uncategorized';
      counts[industry] = (counts[industry] ?? 0) + 1;
    }

    return counts;
  }

  async findWithChildren(id: AccountId, maxDepth: number = 5): Promise<AccountHierarchyRecord | null> {
    const root = this.accounts.get(id.value);
    if (!root) return null;

    const buildNode = (account: Account, depth: number): AccountHierarchyRecord => {
      const children = depth > 0
        ? Array.from(this.accounts.values())
            .filter((a) => a.parentAccountId === account.id.value)
            .map((child) => buildNode(child, depth - 1))
        : [];
      return {
        id: account.id.value,
        name: account.name,
        industry: account.industry ?? null,
        revenue: account.revenue ?? null,
        tenantId: account.tenantId,
        _count: { contacts: 0, opportunities: 0 },
        childAccounts: children,
      };
    };

    return buildNode(root, maxDepth);
  }

  async findAncestors(id: AccountId): Promise<Account[]> {
    const ancestors: Account[] = [];
    let current = this.accounts.get(id.value);
    const visited = new Set<string>();

    while (current?.parentAccountId && !visited.has(current.parentAccountId)) {
      visited.add(current.parentAccountId);
      const parent = this.accounts.get(current.parentAccountId);
      if (!parent) break;
      ancestors.unshift(parent);
      current = parent;
    }

    return ancestors;
  }

  async getHierarchyDepth(id: AccountId): Promise<number> {
    const ancestors = await this.findAncestors(id);
    return ancestors.length;
  }

  // Test helper methods
  clear(): void {
    this.accounts.clear();
  }

  getAll(): Account[] {
    return Array.from(this.accounts.values());
  }
}
