import { Account, AccountId, AccountRepository } from '@intelliflow/domain';

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

  // Test helper methods
  clear(): void {
    this.accounts.clear();
  }

  getAll(): Account[] {
    return Array.from(this.accounts.values());
  }
}
