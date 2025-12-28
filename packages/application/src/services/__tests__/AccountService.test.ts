/**
 * AccountService Tests
 *
 * Tests the AccountService application service which orchestrates
 * account-related business logic including tier classification,
 * health scoring, and hierarchy management.
 *
 * Coverage target: >90% for application layer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AccountService, ACCOUNT_TIER_THRESHOLDS } from '../AccountService';
import { InMemoryAccountRepository } from '../../../../adapters/src/repositories/InMemoryAccountRepository';
import { InMemoryContactRepository } from '../../../../adapters/src/repositories/InMemoryContactRepository';
import { InMemoryOpportunityRepository } from '../../../../adapters/src/repositories/InMemoryOpportunityRepository';
import { InMemoryEventBus } from '../../../../adapters/src/external/InMemoryEventBus';
import { Account, Contact, Opportunity } from '@intelliflow/domain';

describe('AccountService', () => {
  let accountRepository: InMemoryAccountRepository;
  let contactRepository: InMemoryContactRepository;
  let opportunityRepository: InMemoryOpportunityRepository;
  let eventBus: InMemoryEventBus;
  let service: AccountService;

  beforeEach(() => {
    accountRepository = new InMemoryAccountRepository();
    contactRepository = new InMemoryContactRepository();
    opportunityRepository = new InMemoryOpportunityRepository();
    eventBus = new InMemoryEventBus();
    service = new AccountService(
      accountRepository,
      contactRepository,
      opportunityRepository,
      eventBus
    );
  });

  describe('createAccount()', () => {
    it('should create an account with valid input', async () => {
      const result = await service.createAccount({
        name: 'Test Company',
        website: 'https://test.com',
        industry: 'Technology',
        ownerId: 'owner-1',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.name).toBe('Test Company');
      expect(result.value.website).toBe('https://test.com');
      expect(result.value.industry).toBe('Technology');
    });

    it('should fail if name already exists', async () => {
      await service.createAccount({
        name: 'Duplicate Company',
        ownerId: 'owner-1',
      });

      const result = await service.createAccount({
        name: 'Duplicate Company',
        ownerId: 'owner-2',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('already exists');
    });

    it('should create account with revenue', async () => {
      const result = await service.createAccount({
        name: 'Revenue Company',
        revenue: 5000000,
        ownerId: 'owner-1',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.revenue).toBe(5000000);
    });

    it('should fail with negative revenue', async () => {
      const result = await service.createAccount({
        name: 'Negative Revenue',
        revenue: -100,
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
    });

    it('should publish domain events after creation', async () => {
      eventBus.clearPublishedEvents();

      await service.createAccount({
        name: 'Events Company',
        ownerId: 'owner-1',
      });

      const events = eventBus.getPublishedEvents();
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('updateAccountInfo()', () => {
    it('should update account information', async () => {
      const account = Account.create({
        name: 'Original Name',
        ownerId: 'owner-1',
      }).value;
      await accountRepository.save(account);

      const result = await service.updateAccountInfo(
        account.id.value,
        { name: 'Updated Name', website: 'https://updated.com' },
        'updater'
      );

      expect(result.isSuccess).toBe(true);
      expect(result.value.name).toBe('Updated Name');
      expect(result.value.website).toBe('https://updated.com');
    });

    it('should fail if new name already exists', async () => {
      const account1 = Account.create({
        name: 'First Company',
        ownerId: 'owner-1',
      }).value;
      const account2 = Account.create({
        name: 'Second Company',
        ownerId: 'owner-1',
      }).value;
      await accountRepository.save(account1);
      await accountRepository.save(account2);

      const result = await service.updateAccountInfo(
        account2.id.value,
        { name: 'First Company' },
        'updater'
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('already exists');
    });

    it('should allow updating to same name', async () => {
      const account = Account.create({
        name: 'Same Name',
        ownerId: 'owner-1',
      }).value;
      await accountRepository.save(account);

      const result = await service.updateAccountInfo(
        account.id.value,
        { name: 'Same Name', description: 'Updated description' },
        'updater'
      );

      expect(result.isSuccess).toBe(true);
    });

    it('should fail if account not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const result = await service.updateAccountInfo(fakeId, { name: 'New Name' }, 'updater');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Account not found');
    });
  });

  describe('updateRevenue()', () => {
    it('should update account revenue', async () => {
      const account = Account.create({
        name: 'Revenue Test',
        ownerId: 'owner-1',
      }).value;
      await accountRepository.save(account);

      const result = await service.updateRevenue(account.id.value, 10000000, 'updater');

      expect(result.isSuccess).toBe(true);
      expect(result.value.revenue).toBe(10000000);
    });

    it('should fail with negative revenue', async () => {
      const account = Account.create({
        name: 'Negative Test',
        ownerId: 'owner-1',
      }).value;
      await accountRepository.save(account);

      const result = await service.updateRevenue(account.id.value, -500, 'updater');

      expect(result.isFailure).toBe(true);
    });

    it('should fail if account not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const result = await service.updateRevenue(fakeId, 1000, 'updater');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('updateEmployeeCount()', () => {
    it('should update employee count', async () => {
      const account = Account.create({
        name: 'Employees Test',
        ownerId: 'owner-1',
      }).value;
      await accountRepository.save(account);

      const result = await service.updateEmployeeCount(account.id.value, 500, 'updater');

      expect(result.isSuccess).toBe(true);
      expect(result.value.employees).toBe(500);
    });

    it('should fail with zero or negative employees', async () => {
      const account = Account.create({
        name: 'Zero Employees',
        ownerId: 'owner-1',
      }).value;
      await accountRepository.save(account);

      const result = await service.updateEmployeeCount(account.id.value, 0, 'updater');

      expect(result.isFailure).toBe(true);
    });

    it('should fail if account not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const result = await service.updateEmployeeCount(fakeId, 100, 'updater');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('categorizeIndustry()', () => {
    it('should categorize industry', async () => {
      const account = Account.create({
        name: 'Industry Test',
        ownerId: 'owner-1',
      }).value;
      await accountRepository.save(account);

      const result = await service.categorizeIndustry(
        account.id.value,
        'Healthcare',
        'categorizer'
      );

      expect(result.isSuccess).toBe(true);
      expect(result.value.industry).toBe('Healthcare');
    });

    it('should fail if account not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const result = await service.categorizeIndustry(fakeId, 'Technology', 'categorizer');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('getAccountTier()', () => {
    it('should return ENTERPRISE for high revenue', () => {
      const tier = service.getAccountTier(15000000);
      expect(tier).toBe('ENTERPRISE');
    });

    it('should return MID_MARKET for mid revenue', () => {
      const tier = service.getAccountTier(5000000);
      expect(tier).toBe('MID_MARKET');
    });

    it('should return SMB for small revenue', () => {
      const tier = service.getAccountTier(500000);
      expect(tier).toBe('SMB');
    });

    it('should return STARTUP for very small revenue', () => {
      const tier = service.getAccountTier(50000);
      expect(tier).toBe('STARTUP');
    });

    it('should return STARTUP for no revenue', () => {
      const tier = service.getAccountTier(undefined);
      expect(tier).toBe('STARTUP');
    });

    it('should return STARTUP for zero revenue', () => {
      const tier = service.getAccountTier(0);
      expect(tier).toBe('STARTUP');
    });
  });

  describe('calculateAccountHealth()', () => {
    it('should calculate health score', async () => {
      const account = Account.create({
        name: 'Health Test',
        revenue: 5000000,
        ownerId: 'owner-1',
      }).value;
      await accountRepository.save(account);

      // Add contact
      const contact = Contact.create({
        email: 'health@example.com',
        firstName: 'John',
        lastName: 'Doe',
        accountId: account.id.value,
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(contact);

      // Add opportunity
      const opportunity = Opportunity.create({
        name: 'Health Opp',
        value: 50000,
        accountId: account.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opportunity);

      const result = await service.calculateAccountHealth(account.id.value);

      expect(result.isSuccess).toBe(true);
      expect(result.value.overallScore).toBeGreaterThan(0);
      expect(result.value.tier).toBe('MID_MARKET');
    });

    it('should fail if account not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const result = await service.calculateAccountHealth(fakeId);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Account not found');
    });

    it('should handle account with no contacts or opportunities', async () => {
      const account = Account.create({
        name: 'Empty Account',
        ownerId: 'owner-1',
      }).value;
      await accountRepository.save(account);

      const result = await service.calculateAccountHealth(account.id.value);

      expect(result.isSuccess).toBe(true);
      expect(result.value.overallScore).toBe(0);
      expect(result.value.tier).toBe('STARTUP');
    });
  });

  describe('getAccountWithContext()', () => {
    it('should return account with full context', async () => {
      const account = Account.create({
        name: 'Context Test',
        revenue: 5000000, // 5M = MID_MARKET tier (1M-10M)
        ownerId: 'owner-1',
      }).value;
      await accountRepository.save(account);

      const contact = Contact.create({
        email: 'context@example.com',
        firstName: 'John',
        lastName: 'Doe',
        accountId: account.id.value,
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(contact);

      const opportunity = Opportunity.create({
        name: 'Context Opp',
        value: 100000,
        accountId: account.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opportunity);

      const result = await service.getAccountWithContext(account.id.value);

      expect(result.isSuccess).toBe(true);
      expect(result.value.account.id.value).toBe(account.id.value);
      expect(result.value.contacts).toBe(1);
      expect(result.value.opportunities.total).toBe(1);
      expect(result.value.opportunities.totalValue).toBe(100000);
      expect(result.value.tier).toBe('MID_MARKET');
    });

    it('should fail if account not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const result = await service.getAccountWithContext(fakeId);

      expect(result.isFailure).toBe(true);
    });
  });

  describe('getAccountsByIndustry()', () => {
    it('should return accounts by industry', async () => {
      const account1 = Account.create({
        name: 'Tech Company 1',
        industry: 'Technology',
        ownerId: 'owner-1',
      }).value;
      const account2 = Account.create({
        name: 'Tech Company 2',
        industry: 'Technology',
        ownerId: 'owner-1',
      }).value;
      const account3 = Account.create({
        name: 'Health Company',
        industry: 'Healthcare',
        ownerId: 'owner-1',
      }).value;
      await accountRepository.save(account1);
      await accountRepository.save(account2);
      await accountRepository.save(account3);

      const techAccounts = await service.getAccountsByIndustry('Technology');

      expect(techAccounts).toHaveLength(2);
    });
  });

  describe('getHighValueAccounts()', () => {
    it('should return high-value accounts', async () => {
      const account1 = Account.create({
        name: 'Enterprise Corp',
        revenue: 15000000,
        ownerId: 'owner-1',
      }).value;
      const account2 = Account.create({
        name: 'Startup Inc',
        revenue: 50000,
        ownerId: 'owner-1',
      }).value;
      await accountRepository.save(account1);
      await accountRepository.save(account2);

      const highValue = await service.getHighValueAccounts(1000000, 'owner-1');

      expect(highValue).toHaveLength(1);
      expect(highValue[0].name).toBe('Enterprise Corp');
    });
  });

  describe('deleteAccount()', () => {
    it('should delete an account', async () => {
      const account = Account.create({
        name: 'Delete Test',
        ownerId: 'owner-1',
      }).value;
      await accountRepository.save(account);

      const result = await service.deleteAccount(account.id.value);

      expect(result.isSuccess).toBe(true);

      const deleted = await accountRepository.findById(account.id);
      expect(deleted).toBeNull();
    });

    it('should fail if account has contacts', async () => {
      const account = Account.create({
        name: 'Has Contacts',
        ownerId: 'owner-1',
      }).value;
      await accountRepository.save(account);

      const contact = Contact.create({
        email: 'hasaccount@example.com',
        firstName: 'John',
        lastName: 'Doe',
        accountId: account.id.value,
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(contact);

      const result = await service.deleteAccount(account.id.value);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('associated contacts');
    });

    it('should fail if account has active opportunities', async () => {
      const account = Account.create({
        name: 'Has Opportunities',
        ownerId: 'owner-1',
      }).value;
      await accountRepository.save(account);

      const opportunity = Opportunity.create({
        name: 'Active Opp',
        value: 50000,
        accountId: account.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opportunity);

      const result = await service.deleteAccount(account.id.value);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('active opportunities');
    });

    it('should allow deletion if opportunities are closed', async () => {
      const account = Account.create({
        name: 'Closed Opportunities',
        ownerId: 'owner-1',
      }).value;
      await accountRepository.save(account);

      const opportunity = Opportunity.create({
        name: 'Closed Opp',
        value: 50000,
        accountId: account.id.value,
        ownerId: 'owner-1',
      }).value;
      // Progress to NEGOTIATION then close
      opportunity.changeStage('QUALIFICATION', 'user');
      opportunity.changeStage('NEEDS_ANALYSIS', 'user');
      opportunity.changeStage('PROPOSAL', 'user');
      opportunity.changeStage('NEGOTIATION', 'user');
      opportunity.markAsWon('user');
      await opportunityRepository.save(opportunity);

      const result = await service.deleteAccount(account.id.value);

      expect(result.isSuccess).toBe(true);
    });

    it('should fail if account not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const result = await service.deleteAccount(fakeId);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Account not found');
    });
  });

  describe('getAccountStatistics()', () => {
    it('should return correct statistics', async () => {
      const account1 = Account.create({
        name: 'Stat 1',
        revenue: 15000000,
        industry: 'Technology',
        ownerId: 'owner-1',
      }).value;
      const account2 = Account.create({
        name: 'Stat 2',
        revenue: 500000,
        industry: 'Technology',
        ownerId: 'owner-1',
      }).value;
      const account3 = Account.create({
        name: 'Stat 3',
        industry: 'Healthcare',
        ownerId: 'owner-1',
      }).value;
      await accountRepository.save(account1);
      await accountRepository.save(account2);
      await accountRepository.save(account3);

      const stats = await service.getAccountStatistics('owner-1');

      expect(stats.total).toBe(3);
      expect(stats.byTier['ENTERPRISE']).toBe(1);
      expect(stats.byTier['SMB']).toBe(1);
      expect(stats.byTier['STARTUP']).toBe(1);
      expect(stats.byIndustry['Technology']).toBe(2);
      expect(stats.byIndustry['Healthcare']).toBe(1);
      expect(stats.totalRevenue).toBe(15500000);
    });

    it('should handle empty repository', async () => {
      const stats = await service.getAccountStatistics('owner-1');

      expect(stats.total).toBe(0);
      expect(stats.totalRevenue).toBe(0);
      expect(stats.averageRevenue).toBe(0);
    });
  });

  describe('ACCOUNT_TIER_THRESHOLDS', () => {
    it('should have correct threshold values', () => {
      expect(ACCOUNT_TIER_THRESHOLDS.ENTERPRISE).toBe(10_000_000);
      expect(ACCOUNT_TIER_THRESHOLDS.MID_MARKET).toBe(1_000_000);
      expect(ACCOUNT_TIER_THRESHOLDS.SMB).toBe(100_000);
      expect(ACCOUNT_TIER_THRESHOLDS.STARTUP).toBe(0);
    });
  });
});
