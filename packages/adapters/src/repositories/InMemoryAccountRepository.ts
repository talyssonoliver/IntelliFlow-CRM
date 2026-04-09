import {
  Account,
  AccountId,
  AccountRepository,
  type AccountHierarchyRecord,
} from '@intelliflow/domain';

/**
 * In-Memory Account Repository
 * Used for testing and development
 *
 * IFC-269: All read/delete methods include tenantId parameter
 * for defense-in-depth tenant isolation (ADR-004).
 */
export class InMemoryAccountRepository implements AccountRepository {
  private readonly accounts: Map<string, Account> = new Map();

  async save(account: Account): Promise<void> {
    this.accounts.set(account.id.value, account);
  }

  async findById(id: AccountId, tenantId: string): Promise<Account | null> {
    const account = this.accounts.get(id.value) ?? null;
    if (account && account.tenantId !== tenantId) return null;
    return account;
  }

  async findByName(name: string, tenantId: string): Promise<Account[]> {
    const lowerName = name.toLowerCase();
    return Array.from(this.accounts.values())
      .filter((account) => account.tenantId === tenantId && account.name.toLowerCase().includes(lowerName))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async findByOwnerId(ownerId: string, tenantId: string): Promise<Account[]> {
    return Array.from(this.accounts.values())
      .filter((account) => account.tenantId === tenantId && account.ownerId === ownerId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findByIndustry(industry: string, tenantId: string): Promise<Account[]> {
    return Array.from(this.accounts.values())
      .filter((account) => account.tenantId === tenantId && account.industry === industry)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async delete(id: AccountId, tenantId: string): Promise<void> {
    const account = this.accounts.get(id.value);
    if (account && account.tenantId === tenantId) {
      this.accounts.delete(id.value);
    }
  }

  async existsByName(name: string, tenantId: string): Promise<boolean> {
    const lowerName = name.toLowerCase();
    for (const account of this.accounts.values()) {
      if (account.tenantId === tenantId && account.name.toLowerCase() === lowerName) {
        return true;
      }
    }
    return false;
  }

  async countByIndustry(tenantId: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};

    for (const account of this.accounts.values()) {
      if (account.tenantId !== tenantId) continue;
      const industry = account.industry ?? 'Uncategorized';
      counts[industry] = (counts[industry] ?? 0) + 1;
    }

    return counts;
  }

  async findWithChildren(
    id: AccountId,
    maxDepth: number = 5,
    tenantId: string
  ): Promise<AccountHierarchyRecord | null> {
    const root = this.accounts.get(id.value);
    if (!root || root.tenantId !== tenantId) return null;

    const buildNode = (account: Account, depth: number): AccountHierarchyRecord => {
      const children =
        depth > 0
          ? Array.from(this.accounts.values())
              .filter((a) => a.tenantId === tenantId && a.parentAccountId === account.id.value)
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

  async findAncestors(id: AccountId, tenantId: string): Promise<Account[]> {
    const ancestors: Account[] = [];
    let current = this.accounts.get(id.value);
    if (current && current.tenantId !== tenantId) return [];
    const visited = new Set<string>();

    while (current?.parentAccountId && !visited.has(current.parentAccountId)) {
      visited.add(current.parentAccountId);
      const parent = this.accounts.get(current.parentAccountId);
      // Break on cross-tenant boundary
      if (!parent || parent.tenantId !== tenantId) break;
      ancestors.unshift(parent);
      current = parent;
    }

    return ancestors;
  }

  async getHierarchyDepth(id: AccountId, tenantId: string): Promise<number> {
    const ancestors = await this.findAncestors(id, tenantId);
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
