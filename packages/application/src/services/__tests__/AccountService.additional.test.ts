/**
 * AccountService Additional Tests
 *
 * Supplementary tests to improve coverage for uncovered methods and branches:
 * - getAccountById
 * - getAccountContacts (IFC-185, tenant isolation, cursor pagination, status filter)
 * - getAccountOpportunities (IFC-185, tenant isolation, stage filter, summary)
 * - getAccountActivity (IFC-185, tenant isolation, type filter, cursor pagination)
 * - Persistence error paths
 * - Invalid ID error paths
 * - Event publishing resilience
 * - getAccountStatistics edge cases
 * - getHighValueAccounts edge cases
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AccountService, ACCOUNT_TIER_THRESHOLDS } from '../AccountService';
import { InMemoryAccountRepository } from '../../../../adapters/src/repositories/InMemoryAccountRepository';
import { InMemoryContactRepository } from '../../../../adapters/src/repositories/InMemoryContactRepository';
import { InMemoryOpportunityRepository } from '../../../../adapters/src/repositories/InMemoryOpportunityRepository';
import { InMemoryEventBus } from '../../../../adapters/src/external/InMemoryEventBus';
import { Account, Contact, Opportunity } from '@intelliflow/domain';

describe('AccountService (additional coverage)', () => {
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

  // =========================================================================
  // getAccountById
  // =========================================================================
  describe('getAccountById()', () => {
    it('should return account when found', async () => {
      const account = Account.create({
        name: 'Test Corp',
        industry: 'Technology',
        ownerId: 'owner-1',
      } as any).value;
      await accountRepository.save(account);

      const result = await service.getAccountById(account.id.value);

      expect(result.isSuccess).toBe(true);
      expect(result.value.name).toBe('Test Corp');
    });

    it('should fail when account not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const result = await service.getAccountById(fakeId);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Account not found');
    });

    it('should fail with invalid ID format', async () => {
      const result = await service.getAccountById('not-a-uuid');

      expect(result.isFailure).toBe(true);
    });
  });

  // =========================================================================
  // Persistence error paths
  // =========================================================================
  describe('persistence error handling', () => {
    it('should return PersistenceError when save fails on create', async () => {
      accountRepository.save = vi.fn().mockRejectedValue(new Error('DB down'));

      const result = await service.createAccount({
        name: 'Fail Save',
        ownerId: 'owner-1',
      } as any);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save account');
    });

    it('should return PersistenceError when save fails on updateAccountInfo', async () => {
      const account = Account.create({
        name: 'Update Fail',
        ownerId: 'owner-1',
      } as any).value;
      await accountRepository.save(account);

      accountRepository.save = vi.fn().mockRejectedValue(new Error('DB down'));

      const result = await service.updateAccountInfo(
        account.id.value,
        { description: 'New description' },
        'updater'
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save account');
    });

    it('should return PersistenceError when save fails on updateRevenue', async () => {
      const account = Account.create({
        name: 'Revenue Fail',
        ownerId: 'owner-1',
      } as any).value;
      await accountRepository.save(account);

      accountRepository.save = vi.fn().mockRejectedValue(new Error('DB down'));

      const result = await service.updateRevenue(account.id.value, 5000000, 'updater');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save account');
    });

    it('should return PersistenceError when save fails on updateEmployeeCount', async () => {
      const account = Account.create({
        name: 'Employee Fail',
        ownerId: 'owner-1',
      } as any).value;
      await accountRepository.save(account);

      accountRepository.save = vi.fn().mockRejectedValue(new Error('DB down'));

      const result = await service.updateEmployeeCount(account.id.value, 100, 'updater');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save account');
    });

    it('should return PersistenceError when save fails on categorizeIndustry', async () => {
      const account = Account.create({
        name: 'Industry Fail',
        ownerId: 'owner-1',
      } as any).value;
      await accountRepository.save(account);

      accountRepository.save = vi.fn().mockRejectedValue(new Error('DB down'));

      const result = await service.categorizeIndustry(account.id.value, 'Fintech', 'categorizer');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save account');
    });

    it('should return PersistenceError when delete fails', async () => {
      const account = Account.create({
        name: 'Delete Fail',
        ownerId: 'owner-1',
      } as any).value;
      await accountRepository.save(account);

      accountRepository.delete = vi.fn().mockRejectedValue(new Error('DB down'));

      const result = await service.deleteAccount(account.id.value);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to delete account');
    });
  });

  // =========================================================================
  // Invalid ID error paths
  // =========================================================================
  describe('invalid ID error paths', () => {
    it('should fail updateAccountInfo with invalid ID', async () => {
      const result = await service.updateAccountInfo('bad-id', { name: 'X' }, 'u');
      expect(result.isFailure).toBe(true);
    });

    it('should fail updateRevenue with invalid ID', async () => {
      const result = await service.updateRevenue('bad-id', 100, 'u');
      expect(result.isFailure).toBe(true);
    });

    it('should fail updateEmployeeCount with invalid ID', async () => {
      const result = await service.updateEmployeeCount('bad-id', 100, 'u');
      expect(result.isFailure).toBe(true);
    });

    it('should fail categorizeIndustry with invalid ID', async () => {
      const result = await service.categorizeIndustry('bad-id', 'Tech', 'u');
      expect(result.isFailure).toBe(true);
    });

    it('should fail calculateAccountHealth with invalid ID', async () => {
      const result = await service.calculateAccountHealth('bad-id');
      expect(result.isFailure).toBe(true);
    });

    it('should fail getAccountWithContext with invalid ID', async () => {
      const result = await service.getAccountWithContext('bad-id');
      expect(result.isFailure).toBe(true);
    });

    it('should fail deleteAccount with invalid ID', async () => {
      const result = await service.deleteAccount('bad-id');
      expect(result.isFailure).toBe(true);
    });
  });

  // =========================================================================
  // Event publishing resilience
  // =========================================================================
  describe('event publishing resilience', () => {
    it('should not fail when event publishing throws on create', async () => {
      eventBus.publishAll = vi.fn().mockRejectedValue(new Error('Event bus down'));

      const result = await service.createAccount({
        name: 'Events Fail',
        ownerId: 'owner-1',
      } as any);

      expect(result.isSuccess).toBe(true);
    });

    it('should not fail when event publishing throws on update', async () => {
      const account = Account.create({
        name: 'Events Fail Update',
        ownerId: 'owner-1',
      } as any).value;
      await accountRepository.save(account);

      eventBus.publishAll = vi.fn().mockRejectedValue(new Error('Event bus down'));

      const result = await service.updateAccountInfo(
        account.id.value,
        { description: 'Updated' },
        'updater'
      );

      expect(result.isSuccess).toBe(true);
    });
  });

  // =========================================================================
  // getAccountStatistics edge cases
  // =========================================================================
  describe('getAccountStatistics() - extended', () => {
    it('should return zeros without ownerId', async () => {
      const stats = await service.getAccountStatistics();

      expect(stats.total).toBe(0);
      expect(stats.totalRevenue).toBe(0);
      expect(stats.averageRevenue).toBe(0);
    });

    it('should correctly categorize Uncategorized industry', async () => {
      const account = Account.create({
        name: 'No Industry',
        ownerId: 'owner-1',
      } as any).value;
      await accountRepository.save(account);

      const stats = await service.getAccountStatistics('owner-1');

      expect(stats.byIndustry['Uncategorized']).toBe(1);
    });

    it('should calculate average revenue correctly', async () => {
      const a1 = Account.create({
        name: 'A1',
        revenue: 1000000,
        ownerId: 'owner-1',
      } as any).value;
      const a2 = Account.create({
        name: 'A2',
        revenue: 3000000,
        ownerId: 'owner-1',
      } as any).value;
      await accountRepository.save(a1);
      await accountRepository.save(a2);

      const stats = await service.getAccountStatistics('owner-1');

      expect(stats.total).toBe(2);
      expect(stats.totalRevenue).toBe(4000000);
      expect(stats.averageRevenue).toBe(2000000);
    });
  });

  // =========================================================================
  // getHighValueAccounts edge cases
  // =========================================================================
  describe('getHighValueAccounts() - extended', () => {
    it('should use default threshold if not specified', async () => {
      const account = Account.create({
        name: 'Mid Market',
        revenue: 2000000,
        ownerId: 'owner-1',
      } as any).value;
      await accountRepository.save(account);

      // Default is MID_MARKET threshold = 1,000,000
      const results = await service.getHighValueAccounts(undefined, 'owner-1');

      expect(results).toHaveLength(1);
    });

    it('should return empty without ownerId', async () => {
      const results = await service.getHighValueAccounts(100000);

      expect(results).toHaveLength(0);
    });

    it('should handle accounts with undefined revenue', async () => {
      const account = Account.create({
        name: 'No Revenue',
        ownerId: 'owner-1',
      } as any).value;
      await accountRepository.save(account);

      const results = await service.getHighValueAccounts(0, 'owner-1');

      // revenue is undefined, so (undefined ?? 0) = 0, which is >= 0
      expect(results).toHaveLength(1);
    });
  });

  // =========================================================================
  // calculateAccountHealth edge cases
  // =========================================================================
  describe('calculateAccountHealth() - extended', () => {
    it('should handle multiple contacts (engagement score)', async () => {
      const account = Account.create({
        name: 'Many Contacts',
        ownerId: 'owner-1',
      } as any).value;
      await accountRepository.save(account);

      // Add 6 contacts to get contactEngagementScore = min(100, 6*20) = 100
      for (let i = 0; i < 6; i++) {
        const contact = Contact.create({
          email: `c${i}@test.com`,
          firstName: `First${i}`,
          lastName: `Last${i}`,
          accountId: account.id.value,
          ownerId: 'owner-1',
        } as any).value;
        await contactRepository.save(contact);
      }

      const result = await service.calculateAccountHealth(account.id.value);

      expect(result.isSuccess).toBe(true);
      expect(result.value.contactEngagement).toBe(100);
    });

    it('should handle high opportunity value (capped at 100)', async () => {
      const account = Account.create({
        name: 'Big Value',
        revenue: 50000000,
        ownerId: 'owner-1',
      } as any).value;
      await accountRepository.save(account);

      const opp = Opportunity.create({
        name: 'Huge Opp',
        value: 100000000,
        accountId: account.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.calculateAccountHealth(account.id.value);

      expect(result.isSuccess).toBe(true);
      expect(result.value.opportunityValue).toBeLessThanOrEqual(100);
      expect(result.value.tier).toBe('ENTERPRISE');
    });

    it('should not count closed opportunities in value score', async () => {
      const account = Account.create({
        name: 'Closed Opps',
        ownerId: 'owner-1',
      } as any).value;
      await accountRepository.save(account);

      const opp = Opportunity.create({
        name: 'Closed Opp',
        value: 1000000,
        accountId: account.id.value,
        ownerId: 'owner-1',
      }).value;
      opp.markAsLost('Lost for business reasons test', 'user');
      await opportunityRepository.save(opp);

      const result = await service.calculateAccountHealth(account.id.value);

      expect(result.isSuccess).toBe(true);
      // Closed opportunity should not count toward opportunity value
      expect(result.value.opportunityValue).toBe(0);
    });
  });

  // =========================================================================
  // getAccountWithContext - extended
  // =========================================================================
  describe('getAccountWithContext() - extended', () => {
    it('should count active vs closed opportunities', async () => {
      const account = Account.create({
        name: 'Mixed Opps',
        ownerId: 'owner-1',
      } as any).value;
      await accountRepository.save(account);

      const opp1 = Opportunity.create({
        name: 'Active Opp',
        value: 50000,
        accountId: account.id.value,
        ownerId: 'owner-1',
      }).value;
      const opp2 = Opportunity.create({
        name: 'Closed Opp',
        value: 100000,
        accountId: account.id.value,
        ownerId: 'owner-1',
      }).value;
      opp2.markAsLost('Lost for business reasons test', 'user');
      await opportunityRepository.save(opp1);
      await opportunityRepository.save(opp2);

      const result = await service.getAccountWithContext(account.id.value);

      expect(result.isSuccess).toBe(true);
      expect(result.value.opportunities.total).toBe(2);
      expect(result.value.opportunities.activeCount).toBe(1);
      expect(result.value.opportunities.totalValue).toBe(150000);
    });

    it('should handle account with no contacts or opportunities', async () => {
      const account = Account.create({
        name: 'Empty Account',
        ownerId: 'owner-1',
      } as any).value;
      await accountRepository.save(account);

      const result = await service.getAccountWithContext(account.id.value);

      expect(result.isSuccess).toBe(true);
      expect(result.value.contacts).toBe(0);
      expect(result.value.opportunities.total).toBe(0);
      expect(result.value.opportunities.totalValue).toBe(0);
      expect(result.value.tier).toBe('STARTUP');
    });
  });

  // =========================================================================
  // getAccountContacts (IFC-185)
  // =========================================================================
  describe('getAccountContacts()', () => {
    it('should return contacts for account', async () => {
      const account = Account.create({
        name: 'Contacts Test',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
      } as any).value;
      await accountRepository.save(account);

      const contact = Contact.create({
        email: 'c1@test.com',
        firstName: 'John',
        lastName: 'Doe',
        accountId: account.id.value,
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
      } as any).value;
      await contactRepository.save(contact);

      const result = await service.getAccountContacts(account.id.value, 'tenant-1', {
        limit: 10,
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.contacts).toHaveLength(1);
      expect(result.value.total).toBe(1);
    });

    it('should fail if account not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const result = await service.getAccountContacts(fakeId, 'tenant-1', { limit: 10 });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('not found');
    });

    it('should fail with invalid account ID', async () => {
      const result = await service.getAccountContacts('bad-id', 'tenant-1', { limit: 10 });

      expect(result.isFailure).toBe(true);
    });

    it('should fail for tenant isolation violation', async () => {
      const account = Account.create({
        name: 'Tenant Test',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
      } as any).value;
      await accountRepository.save(account);

      const result = await service.getAccountContacts(account.id.value, 'tenant-2', {
        limit: 10,
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('not found');
    });

    it('should filter contacts by status', async () => {
      const account = Account.create({
        name: 'Status Filter',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
      } as any).value;
      await accountRepository.save(account);

      const c1 = Contact.create({
        email: 'active@test.com',
        firstName: 'Active',
        lastName: 'Contact',
        accountId: account.id.value,
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
        status: 'ACTIVE',
      } as any).value;
      const c2 = Contact.create({
        email: 'inactive@test.com',
        firstName: 'Inactive',
        lastName: 'Contact',
        accountId: account.id.value,
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
        status: 'INACTIVE',
      } as any).value;
      await contactRepository.save(c1);
      await contactRepository.save(c2);

      const result = await service.getAccountContacts(account.id.value, 'tenant-1', {
        limit: 10,
        status: ['ACTIVE'],
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.contacts).toHaveLength(1);
      expect(result.value.contacts[0].status).toBe('ACTIVE');
    });

    it('should support cursor-based pagination', async () => {
      const account = Account.create({
        name: 'Cursor Test',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
      } as any).value;
      await accountRepository.save(account);

      const contacts: Contact[] = [];
      for (let i = 0; i < 5; i++) {
        const c = Contact.create({
          email: `cursor${i}@test.com`,
          firstName: `First${i}`,
          lastName: `Last${i}`,
          accountId: account.id.value,
          ownerId: 'owner-1',
          tenantId: 'tenant-1',
        } as any).value;
        await contactRepository.save(c);
        contacts.push(c);
      }

      const result = await service.getAccountContacts(account.id.value, 'tenant-1', {
        limit: 2,
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.contacts).toHaveLength(2);
      expect(result.value.total).toBe(5);
      if (result.value.nextCursor) {
        // Second page using cursor
        const page2 = await service.getAccountContacts(account.id.value, 'tenant-1', {
          limit: 2,
          cursor: result.value.nextCursor,
        });
        expect(page2.isSuccess).toBe(true);
        expect(page2.value.contacts.length).toBeGreaterThan(0);
      }
    });
  });

  // =========================================================================
  // getAccountOpportunities (IFC-185)
  // =========================================================================
  describe('getAccountOpportunities()', () => {
    it('should return opportunities for account with summary', async () => {
      const account = Account.create({
        name: 'Opps Test',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
      } as any).value;
      await accountRepository.save(account);

      const opp = Opportunity.create({
        name: 'Test Opp',
        value: 100000,
        accountId: account.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.getAccountOpportunities(account.id.value, 'tenant-1', {
        limit: 10,
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.opportunities).toHaveLength(1);
      expect(result.value.summary.totalValue).toBe(100000);
      expect(result.value.summary.stageBreakdown['PROSPECTING']).toBe(1);
    });

    it('should fail if account not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const result = await service.getAccountOpportunities(fakeId, 'tenant-1', { limit: 10 });

      expect(result.isFailure).toBe(true);
    });

    it('should fail with invalid ID', async () => {
      const result = await service.getAccountOpportunities('bad-id', 'tenant-1', { limit: 10 });

      expect(result.isFailure).toBe(true);
    });

    it('should fail for tenant isolation violation', async () => {
      const account = Account.create({
        name: 'Tenant Opp',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
      } as any).value;
      await accountRepository.save(account);

      const result = await service.getAccountOpportunities(account.id.value, 'tenant-2', {
        limit: 10,
      });

      expect(result.isFailure).toBe(true);
    });

    it('should filter by stage', async () => {
      const account = Account.create({
        name: 'Stage Filter',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
      } as any).value;
      await accountRepository.save(account);

      const opp1 = Opportunity.create({
        name: 'Prospecting',
        value: 50000,
        accountId: account.id.value,
        ownerId: 'owner-1',
      }).value;
      const opp2 = Opportunity.create({
        name: 'Qualification',
        value: 100000,
        accountId: account.id.value,
        ownerId: 'owner-1',
      }).value;
      opp2.changeStage('QUALIFICATION', 'user');
      await opportunityRepository.save(opp1);
      await opportunityRepository.save(opp2);

      const result = await service.getAccountOpportunities(account.id.value, 'tenant-1', {
        limit: 10,
        stage: ['QUALIFICATION'],
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.opportunities).toHaveLength(1);
      expect(result.value.opportunities[0].stage).toBe('QUALIFICATION');
    });

    it('should support cursor-based pagination for opportunities', async () => {
      const account = Account.create({
        name: 'Opp Cursor',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
      } as any).value;
      await accountRepository.save(account);

      for (let i = 0; i < 5; i++) {
        const opp = Opportunity.create({
          name: `Opp ${i}`,
          value: 10000 * (i + 1),
          accountId: account.id.value,
          ownerId: 'owner-1',
        }).value;
        await opportunityRepository.save(opp);
      }

      const result = await service.getAccountOpportunities(account.id.value, 'tenant-1', {
        limit: 2,
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.opportunities).toHaveLength(2);
      expect(result.value.total).toBe(5);
    });
  });

  // =========================================================================
  // getAccountActivity (IFC-185)
  // =========================================================================
  describe('getAccountActivity()', () => {
    it('should return activity feed from contacts and opportunities', async () => {
      const account = Account.create({
        name: 'Activity Test',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
      } as any).value;
      await accountRepository.save(account);

      const contact = Contact.create({
        email: 'activity@test.com',
        firstName: 'Jane',
        lastName: 'Doe',
        accountId: account.id.value,
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
      } as any).value;
      await contactRepository.save(contact);

      const opp = Opportunity.create({
        name: 'Activity Opp',
        value: 50000,
        accountId: account.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.getAccountActivity(account.id.value, 'tenant-1', {
        limit: 10,
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.activities).toHaveLength(2);
      // Should have CONTACT_CREATED and OPPORTUNITY_CREATED
      const types = result.value.activities.map((a) => a.type);
      expect(types).toContain('CONTACT_CREATED');
      expect(types).toContain('OPPORTUNITY_CREATED');
    });

    it('should fail if account not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const result = await service.getAccountActivity(fakeId, 'tenant-1', { limit: 10 });

      expect(result.isFailure).toBe(true);
    });

    it('should fail with invalid ID', async () => {
      const result = await service.getAccountActivity('bad-id', 'tenant-1', { limit: 10 });

      expect(result.isFailure).toBe(true);
    });

    it('should fail for tenant isolation violation', async () => {
      const account = Account.create({
        name: 'Tenant Activity',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
      } as any).value;
      await accountRepository.save(account);

      const result = await service.getAccountActivity(account.id.value, 'tenant-2', {
        limit: 10,
      });

      expect(result.isFailure).toBe(true);
    });

    it('should filter activities by type', async () => {
      const account = Account.create({
        name: 'Filter Activity',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
      } as any).value;
      await accountRepository.save(account);

      const contact = Contact.create({
        email: 'filter@test.com',
        firstName: 'Filter',
        lastName: 'Test',
        accountId: account.id.value,
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
      } as any).value;
      await contactRepository.save(contact);

      const opp = Opportunity.create({
        name: 'Filter Opp',
        value: 50000,
        accountId: account.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.getAccountActivity(account.id.value, 'tenant-1', {
        limit: 10,
        types: ['CONTACT_CREATED'],
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.activities).toHaveLength(1);
      expect(result.value.activities[0].type).toBe('CONTACT_CREATED');
    });

    it('should paginate activities', async () => {
      const account = Account.create({
        name: 'Paginate Activity',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
      } as any).value;
      await accountRepository.save(account);

      for (let i = 0; i < 5; i++) {
        const contact = Contact.create({
          email: `page${i}@test.com`,
          firstName: `Page${i}`,
          lastName: 'Test',
          accountId: account.id.value,
          ownerId: 'owner-1',
          tenantId: 'tenant-1',
        } as any).value;
        await contactRepository.save(contact);
      }

      const result = await service.getAccountActivity(account.id.value, 'tenant-1', {
        limit: 2,
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.activities).toHaveLength(2);
      expect(result.value.nextCursor).toBeDefined();
    });

    it('should return empty when no contacts or opportunities', async () => {
      const account = Account.create({
        name: 'Empty Activity',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
      } as any).value;
      await accountRepository.save(account);

      const result = await service.getAccountActivity(account.id.value, 'tenant-1', {
        limit: 10,
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.activities).toHaveLength(0);
    });
  });

  // =========================================================================
  // getAccountTier edge cases
  // =========================================================================
  describe('getAccountTier() - edge cases', () => {
    it('should return ENTERPRISE at exact threshold', () => {
      expect(service.getAccountTier(10_000_000)).toBe('ENTERPRISE');
    });

    it('should return MID_MARKET at exact threshold', () => {
      expect(service.getAccountTier(1_000_000)).toBe('MID_MARKET');
    });

    it('should return SMB at exact threshold', () => {
      expect(service.getAccountTier(100_000)).toBe('SMB');
    });

    it('should return STARTUP just below SMB threshold', () => {
      expect(service.getAccountTier(99_999)).toBe('STARTUP');
    });
  });

  // =========================================================================
  // updateAccountInfo - update only name (no other fields)
  // =========================================================================
  describe('updateAccountInfo() - extended', () => {
    it('should update only description without name uniqueness check', async () => {
      const account = Account.create({
        name: 'Desc Only',
        ownerId: 'owner-1',
      } as any).value;
      await accountRepository.save(account);

      const result = await service.updateAccountInfo(
        account.id.value,
        { description: 'New description only' },
        'updater'
      );

      expect(result.isSuccess).toBe(true);
    });
  });

  // =========================================================================
  // deleteAccount - not found for account ID
  // =========================================================================
  describe('deleteAccount() - extended', () => {
    it('should fail if account not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const result = await service.deleteAccount(fakeId);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Account not found');
    });
  });
});
