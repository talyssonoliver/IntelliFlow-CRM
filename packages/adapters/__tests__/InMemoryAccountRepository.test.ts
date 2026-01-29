/**
 * InMemoryAccountRepository Tests
 *
 * These tests verify the in-memory repository implementation.
 * They ensure all repository methods work correctly and queries return expected results.
 *
 * Coverage target: >90% for adapters layer
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InMemoryAccountRepository } from '../src/repositories/InMemoryAccountRepository';
import { Account, AccountId } from '@intelliflow/domain';

describe('InMemoryAccountRepository', () => {
  let repository: InMemoryAccountRepository;
  let testAccount: Account;
  let testAccountId: AccountId;

  beforeEach(() => {
    repository = new InMemoryAccountRepository();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 15, 10, 0, 0));

    // Create a test account for most tests
    const accountResult = Account.create({
      name: 'Acme Corporation',
      website: 'https://acme.example.com',
      industry: 'Technology',
      employees: 500,
      revenue: 50000000,
      description: 'Enterprise software company',
      ownerId: 'owner-123',
      tenantId: 'tenant-123',
    });

    testAccount = accountResult.value;
    testAccountId = testAccount.id;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('save()', () => {
    it('should save a new account', async () => {
      await repository.save(testAccount);

      const found = await repository.findById(testAccountId);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(testAccountId);
      expect(found?.name).toBe('Acme Corporation');
    });

    it('should update an existing account', async () => {
      await repository.save(testAccount);

      // Update the account
      testAccount.updateAccountInfo({ name: 'Acme Inc' }, 'user-123');
      await repository.save(testAccount);

      const found = await repository.findById(testAccountId);
      expect(found).not.toBeNull();
      expect(found?.name).toBe('Acme Inc');
    });

    it('should overwrite existing account with same ID', async () => {
      await repository.save(testAccount);

      const originalWebsite = testAccount.website?.value;
      testAccount.updateAccountInfo({ website: 'https://new.acme.com' }, 'user-123');
      await repository.save(testAccount);

      const allAccounts = repository.getAll();
      expect(allAccounts).toHaveLength(1);
      expect(allAccounts[0].website?.value).toBe('https://new.acme.com');
      expect(allAccounts[0].website?.value).not.toBe(originalWebsite);
    });

    it('should save multiple accounts', async () => {
      const account2Result = Account.create({
        name: 'TechCorp',
        industry: 'Technology',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      const account3Result = Account.create({
        name: 'HealthCo',
        industry: 'Healthcare',
        ownerId: 'owner-456',
        tenantId: 'tenant-123',
      });

      await repository.save(testAccount);
      await repository.save(account2Result.value);
      await repository.save(account3Result.value);

      const allAccounts = repository.getAll();
      expect(allAccounts).toHaveLength(3);
    });
  });

  describe('findById()', () => {
    it('should return account when exists', async () => {
      await repository.save(testAccount);

      const found = await repository.findById(testAccountId);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(testAccountId);
      expect(found?.name).toBe('Acme Corporation');
      expect(found?.industry).toBe('Technology');
      expect(found?.employees).toBe(500);
    });

    it('should return null when account does not exist', async () => {
      const nonExistentId = AccountId.generate();

      const found = await repository.findById(nonExistentId);

      expect(found).toBeNull();
    });

    it('should return null for empty repository', async () => {
      const found = await repository.findById(testAccountId);

      expect(found).toBeNull();
    });

    it('should distinguish between different account IDs', async () => {
      const account2Result = Account.create({
        name: 'Other Company',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      await repository.save(testAccount);
      await repository.save(account2Result.value);

      const found1 = await repository.findById(testAccountId);
      const found2 = await repository.findById(account2Result.value.id);

      expect(found1?.name).toBe('Acme Corporation');
      expect(found2?.name).toBe('Other Company');
    });
  });

  describe('findByName()', () => {
    it('should return accounts matching name substring', async () => {
      const account2Result = Account.create({
        name: 'Acme Industries',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      const account3Result = Account.create({
        name: 'TechCorp',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      await repository.save(testAccount);
      await repository.save(account2Result.value);
      await repository.save(account3Result.value);

      const accounts = await repository.findByName('Acme');

      expect(accounts).toHaveLength(2);
      expect(accounts.every((a) => a.name.toLowerCase().includes('acme'))).toBe(true);
    });

    it('should handle case insensitive search', async () => {
      await repository.save(testAccount);

      const accounts = await repository.findByName('ACME');

      expect(accounts).toHaveLength(1);
      expect(accounts[0].name).toBe('Acme Corporation');
    });

    it('should return empty array when no accounts match', async () => {
      await repository.save(testAccount);

      const accounts = await repository.findByName('NonExistent');

      expect(accounts).toHaveLength(0);
    });

    it('should sort results by name ascending', async () => {
      const account2Result = Account.create({
        name: 'Beta Corp',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      const account3Result = Account.create({
        name: 'Alpha Inc',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      await repository.save(testAccount);
      await repository.save(account2Result.value);
      await repository.save(account3Result.value);

      const accounts = await repository.findByName('');

      expect(accounts[0].name).toBe('Acme Corporation');
      expect(accounts[1].name).toBe('Alpha Inc');
      expect(accounts[2].name).toBe('Beta Corp');
    });

    it('should match partial names', async () => {
      await repository.save(testAccount);

      const accounts = await repository.findByName('Corp');

      expect(accounts).toHaveLength(1);
      expect(accounts[0].name).toBe('Acme Corporation');
    });

    it('should return empty array for empty repository', async () => {
      const accounts = await repository.findByName('Any');

      expect(accounts).toHaveLength(0);
    });
  });

  describe('findByOwnerId()', () => {
    it('should return all accounts for an owner', async () => {
      const account2Result = Account.create({
        name: 'Second Company',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      const account3Result = Account.create({
        name: 'Third Company',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      await repository.save(testAccount);
      await repository.save(account2Result.value);
      await repository.save(account3Result.value);

      const accounts = await repository.findByOwnerId('owner-123');

      expect(accounts).toHaveLength(3);
      expect(accounts.every((a) => a.ownerId === 'owner-123')).toBe(true);
    });

    it('should return empty array when owner has no accounts', async () => {
      await repository.save(testAccount);

      const accounts = await repository.findByOwnerId('owner-999');

      expect(accounts).toHaveLength(0);
    });

    it('should filter out accounts from other owners', async () => {
      const account2Result = Account.create({
        name: 'Other Owner Account',
        ownerId: 'owner-456',
        tenantId: 'tenant-123',
      });

      await repository.save(testAccount);
      await repository.save(account2Result.value);

      const accounts = await repository.findByOwnerId('owner-123');

      expect(accounts).toHaveLength(1);
      expect(accounts[0].ownerId).toBe('owner-123');
    });

    it('should sort accounts by creation date descending', async () => {
      vi.advanceTimersByTime(1000);

      const account2Result = Account.create({
        name: 'Second Company',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      vi.advanceTimersByTime(1000);

      const account3Result = Account.create({
        name: 'Third Company',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      await repository.save(testAccount);
      await repository.save(account2Result.value);
      await repository.save(account3Result.value);

      const accounts = await repository.findByOwnerId('owner-123');

      // Most recent first
      expect(accounts[0].createdAt >= accounts[1].createdAt).toBe(true);
      expect(accounts[1].createdAt >= accounts[2].createdAt).toBe(true);
    });
  });

  describe('findByIndustry()', () => {
    it('should return accounts in the specified industry', async () => {
      const account2Result = Account.create({
        name: 'TechCorp',
        industry: 'Technology',
        ownerId: 'owner-456',
        tenantId: 'tenant-123',
      });

      const account3Result = Account.create({
        name: 'HealthCo',
        industry: 'Healthcare',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      await repository.save(testAccount);
      await repository.save(account2Result.value);
      await repository.save(account3Result.value);

      const accounts = await repository.findByIndustry('Technology');

      expect(accounts).toHaveLength(2);
      expect(accounts.every((a) => a.industry === 'Technology')).toBe(true);
    });

    it('should return empty array when no accounts in industry', async () => {
      await repository.save(testAccount);

      const accounts = await repository.findByIndustry('Finance');

      expect(accounts).toHaveLength(0);
    });

    it('should not include accounts without industry', async () => {
      const accountWithoutIndustry = Account.create({
        name: 'No Industry Corp',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      await repository.save(testAccount);
      await repository.save(accountWithoutIndustry.value);

      const accounts = await repository.findByIndustry('Technology');

      expect(accounts).toHaveLength(1);
      expect(accounts[0].industry).toBe('Technology');
    });

    it('should sort by creation date descending', async () => {
      vi.advanceTimersByTime(1000);

      const account2Result = Account.create({
        name: 'TechCorp',
        industry: 'Technology',
        ownerId: 'owner-456',
        tenantId: 'tenant-123',
      });

      vi.advanceTimersByTime(1000);

      const account3Result = Account.create({
        name: 'TechStart',
        industry: 'Technology',
        ownerId: 'owner-789',
        tenantId: 'tenant-123',
      });

      await repository.save(testAccount);
      await repository.save(account2Result.value);
      await repository.save(account3Result.value);

      const accounts = await repository.findByIndustry('Technology');

      expect(accounts[0].createdAt >= accounts[1].createdAt).toBe(true);
      expect(accounts[1].createdAt >= accounts[2].createdAt).toBe(true);
    });

    it('should handle exact industry match', async () => {
      await repository.save(testAccount);

      // Should not match partial industry
      const accounts = await repository.findByIndustry('Tech');

      expect(accounts).toHaveLength(0);
    });
  });

  describe('delete()', () => {
    it('should delete an existing account', async () => {
      await repository.save(testAccount);

      await repository.delete(testAccountId);

      const found = await repository.findById(testAccountId);
      expect(found).toBeNull();
    });

    it('should not throw when deleting non-existent account', async () => {
      const nonExistentId = AccountId.generate();

      await expect(repository.delete(nonExistentId)).resolves.toBeUndefined();
    });

    it('should only delete specified account', async () => {
      const account2Result = Account.create({
        name: 'Second Company',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      await repository.save(testAccount);
      await repository.save(account2Result.value);

      await repository.delete(testAccountId);

      const found1 = await repository.findById(testAccountId);
      const found2 = await repository.findById(account2Result.value.id);

      expect(found1).toBeNull();
      expect(found2).not.toBeNull();
    });

    it('should allow re-adding a deleted account', async () => {
      await repository.save(testAccount);
      await repository.delete(testAccountId);

      await repository.save(testAccount);

      const found = await repository.findById(testAccountId);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(testAccountId);
    });
  });

  describe('existsByName()', () => {
    it('should return true when name exists', async () => {
      await repository.save(testAccount);

      const exists = await repository.existsByName('Acme Corporation');

      expect(exists).toBe(true);
    });

    it('should return false when name does not exist', async () => {
      const exists = await repository.existsByName('NonExistent Company');

      expect(exists).toBe(false);
    });

    it('should handle case insensitive matching', async () => {
      await repository.save(testAccount);

      const exists = await repository.existsByName('ACME CORPORATION');

      expect(exists).toBe(true);
    });

    it('should require exact name match (not substring)', async () => {
      await repository.save(testAccount);

      const existsPartial = await repository.existsByName('Acme');
      const existsExact = await repository.existsByName('Acme Corporation');

      expect(existsPartial).toBe(false);
      expect(existsExact).toBe(true);
    });

    it('should return false after account is deleted', async () => {
      await repository.save(testAccount);
      await repository.delete(testAccountId);

      const exists = await repository.existsByName('Acme Corporation');

      expect(exists).toBe(false);
    });

    it('should return false for empty repository', async () => {
      const exists = await repository.existsByName('Any Company');

      expect(exists).toBe(false);
    });
  });

  describe('countByIndustry()', () => {
    it('should count accounts by industry', async () => {
      const account2Result = Account.create({
        name: 'TechCorp',
        industry: 'Technology',
        ownerId: 'owner-456',
        tenantId: 'tenant-123',
      });

      const account3Result = Account.create({
        name: 'HealthCo',
        industry: 'Healthcare',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      await repository.save(testAccount);
      await repository.save(account2Result.value);
      await repository.save(account3Result.value);

      const counts = await repository.countByIndustry();

      expect(counts['Technology']).toBe(2);
      expect(counts['Healthcare']).toBe(1);
    });

    it('should categorize accounts without industry as Uncategorized', async () => {
      const accountWithoutIndustry = Account.create({
        name: 'No Industry Corp',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      await repository.save(testAccount);
      await repository.save(accountWithoutIndustry.value);

      const counts = await repository.countByIndustry();

      expect(counts['Technology']).toBe(1);
      expect(counts['Uncategorized']).toBe(1);
    });

    it('should return empty object for empty repository', async () => {
      const counts = await repository.countByIndustry();

      expect(counts).toEqual({});
    });

    it('should handle multiple industries', async () => {
      const industries = ['Technology', 'Healthcare', 'Finance', 'Retail'];

      for (const industry of industries) {
        const accountResult = Account.create({
          name: `${industry} Company`,
          industry,
          ownerId: 'owner-123',
          tenantId: 'tenant-123',
        });
        await repository.save(accountResult.value);
      }

      const counts = await repository.countByIndustry();

      expect(Object.keys(counts)).toHaveLength(4);
      expect(counts['Technology']).toBe(1);
      expect(counts['Healthcare']).toBe(1);
      expect(counts['Finance']).toBe(1);
      expect(counts['Retail']).toBe(1);
    });

    it('should count correctly with same industry across multiple accounts', async () => {
      for (let i = 0; i < 5; i++) {
        const accountResult = Account.create({
          name: `Tech Company ${i}`,
          industry: 'Technology',
          ownerId: 'owner-123',
          tenantId: 'tenant-123',
        });
        await repository.save(accountResult.value);
      }

      const counts = await repository.countByIndustry();

      expect(counts['Technology']).toBe(5);
    });
  });

  describe('Test Helper Methods', () => {
    describe('clear()', () => {
      it('should remove all accounts from repository', async () => {
        await repository.save(testAccount);

        repository.clear();

        const allAccounts = repository.getAll();
        expect(allAccounts).toHaveLength(0);
      });

      it('should allow adding accounts after clear', async () => {
        await repository.save(testAccount);
        repository.clear();

        await repository.save(testAccount);

        const allAccounts = repository.getAll();
        expect(allAccounts).toHaveLength(1);
      });
    });

    describe('getAll()', () => {
      it('should return all accounts', async () => {
        const account2Result = Account.create({
          name: 'Second Company',
          ownerId: 'owner-123',
          tenantId: 'tenant-123',
        });

        await repository.save(testAccount);
        await repository.save(account2Result.value);

        const allAccounts = repository.getAll();

        expect(allAccounts).toHaveLength(2);
      });

      it('should return empty array for empty repository', () => {
        const allAccounts = repository.getAll();

        expect(allAccounts).toHaveLength(0);
      });

      it('should return actual Account instances', async () => {
        await repository.save(testAccount);

        const allAccounts = repository.getAll();

        expect(allAccounts[0]).toBeInstanceOf(Account);
        expect(allAccounts[0].id).toBeInstanceOf(AccountId);
      });
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete account lifecycle', async () => {
      // Create and save account
      await repository.save(testAccount);

      // Find by name
      const accountsByName = await repository.findByName('Acme');
      expect(accountsByName).toHaveLength(1);

      // Update account info
      testAccount.updateAccountInfo({ website: 'https://acme-new.com' }, 'user-123');
      await repository.save(testAccount);

      // Verify update
      const updated = await repository.findById(testAccountId);
      expect(updated?.website?.value).toBe('https://acme-new.com');

      // Update revenue
      testAccount.updateRevenue(75000000, 'user-123');
      await repository.save(testAccount);

      // Verify revenue update
      const withNewRevenue = await repository.findById(testAccountId);
      expect(withNewRevenue?.revenue).toBe(75000000);

      // Find by industry
      const techAccounts = await repository.findByIndustry('Technology');
      expect(techAccounts).toHaveLength(1);

      // Check counts
      const counts = await repository.countByIndustry();
      expect(counts['Technology']).toBe(1);

      // Delete account
      await repository.delete(testAccountId);

      // Verify deletion
      const deleted = await repository.findById(testAccountId);
      expect(deleted).toBeNull();
    });

    it('should handle multiple owners and industries correctly', async () => {
      const owner1Account1 = Account.create({
        name: 'Owner1 Tech',
        industry: 'Technology',
        ownerId: 'owner-1',
        tenantId: 'tenant-123',
      });

      const owner1Account2 = Account.create({
        name: 'Owner1 Health',
        industry: 'Healthcare',
        ownerId: 'owner-1',
        tenantId: 'tenant-123',
      });

      const owner2Account1 = Account.create({
        name: 'Owner2 Tech',
        industry: 'Technology',
        ownerId: 'owner-2',
        tenantId: 'tenant-123',
      });

      await repository.save(owner1Account1.value);
      await repository.save(owner1Account2.value);
      await repository.save(owner2Account1.value);

      const owner1Accounts = await repository.findByOwnerId('owner-1');
      const owner2Accounts = await repository.findByOwnerId('owner-2');
      const techAccounts = await repository.findByIndustry('Technology');
      const healthAccounts = await repository.findByIndustry('Healthcare');

      expect(owner1Accounts).toHaveLength(2);
      expect(owner2Accounts).toHaveLength(1);
      expect(techAccounts).toHaveLength(2);
      expect(healthAccounts).toHaveLength(1);

      const counts = await repository.countByIndustry();
      expect(counts['Technology']).toBe(2);
      expect(counts['Healthcare']).toBe(1);
    });

    it('should maintain data integrity during concurrent operations', async () => {
      const account2Result = Account.create({
        name: 'Concurrent Company',
        industry: 'Finance',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      // Simulate concurrent saves
      await Promise.all([
        repository.save(testAccount),
        repository.save(account2Result.value),
      ]);

      const allAccounts = repository.getAll();
      expect(allAccounts).toHaveLength(2);

      // Verify both accounts are findable
      const found1 = await repository.findById(testAccount.id);
      const found2 = await repository.findById(account2Result.value.id);

      expect(found1).not.toBeNull();
      expect(found2).not.toBeNull();
    });

    it('should handle industry categorization changes', async () => {
      await repository.save(testAccount);

      // Initially in Technology
      let counts = await repository.countByIndustry();
      expect(counts['Technology']).toBe(1);

      // Change industry
      testAccount.categorizeIndustry('Software', 'user-123');
      await repository.save(testAccount);

      // Should now be in Software
      counts = await repository.countByIndustry();
      expect(counts['Technology']).toBeUndefined();
      expect(counts['Software']).toBe(1);
    });

    it('should correctly handle name search with special characters', async () => {
      const accountWithSpecialName = Account.create({
        name: 'ABC & Partners Ltd.',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      await repository.save(testAccount);
      await repository.save(accountWithSpecialName.value);

      const accounts = await repository.findByName('&');

      expect(accounts).toHaveLength(1);
      expect(accounts[0].name).toBe('ABC & Partners Ltd.');
    });

    it('should handle account with minimal properties', async () => {
      const minimalAccount = Account.create({
        name: 'Minimal Corp',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      await repository.save(minimalAccount.value);

      const found = await repository.findById(minimalAccount.value.id);
      expect(found).not.toBeNull();
      expect(found?.name).toBe('Minimal Corp');
      expect(found?.industry).toBeUndefined();
      expect(found?.website).toBeUndefined();
      expect(found?.employees).toBeUndefined();
      expect(found?.revenue).toBeUndefined();
    });

    it('should handle empty name search returning all accounts', async () => {
      const account2Result = Account.create({
        name: 'Another Company',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      await repository.save(testAccount);
      await repository.save(account2Result.value);

      const accounts = await repository.findByName('');

      expect(accounts).toHaveLength(2);
    });
  });
});
