/**
 * InMemoryOpportunityRepository Tests
 *
 * These tests verify the in-memory repository implementation.
 * They ensure all repository methods work correctly and queries return expected results.
 *
 * Coverage target: >90% for adapters layer
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InMemoryOpportunityRepository } from '../src/repositories/InMemoryOpportunityRepository';
import { Opportunity, OpportunityId } from '@intelliflow/domain';

describe('InMemoryOpportunityRepository', () => {
  let repository: InMemoryOpportunityRepository;
  let testOpportunity: Opportunity;
  let testOpportunityId: OpportunityId;

  beforeEach(() => {
    repository = new InMemoryOpportunityRepository();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 15, 10, 0, 0));

    // Create a test opportunity for most tests
    const opportunityResult = Opportunity.create({
      name: 'Enterprise Deal',
      value: 50000,
      accountId: 'account-123',
      contactId: 'contact-456',
      expectedCloseDate: new Date(2025, 2, 15), // March 15
      description: 'Large enterprise software deal',
      ownerId: 'owner-123',
      tenantId: 'tenant-123',
    });

    testOpportunity = opportunityResult.value;
    testOpportunityId = testOpportunity.id;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('save()', () => {
    it('should save a new opportunity', async () => {
      await repository.save(testOpportunity);

      const found = await repository.findById(testOpportunityId);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(testOpportunityId);
      expect(found?.name).toBe('Enterprise Deal');
      expect(found?.value.amount).toBe(50000);
    });

    it('should update an existing opportunity', async () => {
      await repository.save(testOpportunity);

      // Update the opportunity
      testOpportunity.updateValue(75000, 'user-123');
      await repository.save(testOpportunity);

      const found = await repository.findById(testOpportunityId);
      expect(found).not.toBeNull();
      expect(found?.value.amount).toBe(75000);
    });

    it('should overwrite existing opportunity with same ID', async () => {
      await repository.save(testOpportunity);

      testOpportunity.updateDescription('Updated description');
      await repository.save(testOpportunity);

      const allOpps = repository.getAll();
      expect(allOpps).toHaveLength(1);
      expect(allOpps[0].description).toBe('Updated description');
    });

    it('should save multiple opportunities', async () => {
      const opp2Result = Opportunity.create({
        name: 'SMB Deal',
        value: 10000,
        accountId: 'account-456',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      const opp3Result = Opportunity.create({
        name: 'Startup Deal',
        value: 5000,
        accountId: 'account-789',
        ownerId: 'owner-456',
        tenantId: 'tenant-123',
      });

      await repository.save(testOpportunity);
      await repository.save(opp2Result.value);
      await repository.save(opp3Result.value);

      const allOpps = repository.getAll();
      expect(allOpps).toHaveLength(3);
    });
  });

  describe('findById()', () => {
    it('should return opportunity when exists', async () => {
      await repository.save(testOpportunity);

      const found = await repository.findById(testOpportunityId);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(testOpportunityId);
      expect(found?.name).toBe('Enterprise Deal');
      expect(found?.value.amount).toBe(50000);
      expect(found?.stage).toBe('PROSPECTING');
    });

    it('should return null when opportunity does not exist', async () => {
      const nonExistentId = OpportunityId.generate();

      const found = await repository.findById(nonExistentId);

      expect(found).toBeNull();
    });

    it('should return null for empty repository', async () => {
      const found = await repository.findById(testOpportunityId);

      expect(found).toBeNull();
    });

    it('should distinguish between different opportunity IDs', async () => {
      const opp2Result = Opportunity.create({
        name: 'Other Deal',
        value: 25000,
        accountId: 'account-456',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      await repository.save(testOpportunity);
      await repository.save(opp2Result.value);

      const found1 = await repository.findById(testOpportunityId);
      const found2 = await repository.findById(opp2Result.value.id);

      expect(found1?.name).toBe('Enterprise Deal');
      expect(found2?.name).toBe('Other Deal');
    });
  });

  describe('findByOwnerId()', () => {
    it('should return all opportunities for an owner', async () => {
      const opp2Result = Opportunity.create({
        name: 'Second Deal',
        value: 20000,
        accountId: 'account-456',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      const opp3Result = Opportunity.create({
        name: 'Third Deal',
        value: 30000,
        accountId: 'account-789',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      await repository.save(testOpportunity);
      await repository.save(opp2Result.value);
      await repository.save(opp3Result.value);

      const opportunities = await repository.findByOwnerId('owner-123');

      expect(opportunities).toHaveLength(3);
      expect(opportunities.every((o) => o.ownerId === 'owner-123')).toBe(true);
    });

    it('should return empty array when owner has no opportunities', async () => {
      await repository.save(testOpportunity);

      const opportunities = await repository.findByOwnerId('owner-999');

      expect(opportunities).toHaveLength(0);
    });

    it('should filter out opportunities from other owners', async () => {
      const opp2Result = Opportunity.create({
        name: 'Other Owner Deal',
        value: 15000,
        accountId: 'account-456',
        ownerId: 'owner-456',
        tenantId: 'tenant-123',
      });

      await repository.save(testOpportunity);
      await repository.save(opp2Result.value);

      const opportunities = await repository.findByOwnerId('owner-123');

      expect(opportunities).toHaveLength(1);
      expect(opportunities[0].ownerId).toBe('owner-123');
    });

    it('should sort opportunities by creation date descending', async () => {
      vi.advanceTimersByTime(1000);

      const opp2Result = Opportunity.create({
        name: 'Second Deal',
        value: 20000,
        accountId: 'account-456',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      vi.advanceTimersByTime(1000);

      const opp3Result = Opportunity.create({
        name: 'Third Deal',
        value: 30000,
        accountId: 'account-789',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      await repository.save(testOpportunity);
      await repository.save(opp2Result.value);
      await repository.save(opp3Result.value);

      const opportunities = await repository.findByOwnerId('owner-123');

      // Most recent first
      expect(opportunities[0].createdAt >= opportunities[1].createdAt).toBe(true);
      expect(opportunities[1].createdAt >= opportunities[2].createdAt).toBe(true);
    });
  });

  describe('findByAccountId()', () => {
    it('should return all opportunities for an account', async () => {
      const opp2Result = Opportunity.create({
        name: 'Second Deal',
        value: 20000,
        accountId: 'account-123',
        ownerId: 'owner-456',
        tenantId: 'tenant-123',
      });

      await repository.save(testOpportunity);
      await repository.save(opp2Result.value);

      const opportunities = await repository.findByAccountId('account-123');

      expect(opportunities).toHaveLength(2);
      expect(opportunities.every((o) => o.accountId === 'account-123')).toBe(true);
    });

    it('should return empty array when account has no opportunities', async () => {
      await repository.save(testOpportunity);

      const opportunities = await repository.findByAccountId('account-999');

      expect(opportunities).toHaveLength(0);
    });

    it('should filter out opportunities from other accounts', async () => {
      const opp2Result = Opportunity.create({
        name: 'Other Account Deal',
        value: 15000,
        accountId: 'account-456',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      await repository.save(testOpportunity);
      await repository.save(opp2Result.value);

      const opportunities = await repository.findByAccountId('account-123');

      expect(opportunities).toHaveLength(1);
      expect(opportunities[0].accountId).toBe('account-123');
    });

    it('should sort opportunities by creation date descending', async () => {
      vi.advanceTimersByTime(1000);

      const opp2Result = Opportunity.create({
        name: 'Second Deal',
        value: 20000,
        accountId: 'account-123',
        ownerId: 'owner-456',
        tenantId: 'tenant-123',
      });

      vi.advanceTimersByTime(1000);

      const opp3Result = Opportunity.create({
        name: 'Third Deal',
        value: 30000,
        accountId: 'account-123',
        ownerId: 'owner-789',
        tenantId: 'tenant-123',
      });

      await repository.save(testOpportunity);
      await repository.save(opp2Result.value);
      await repository.save(opp3Result.value);

      const opportunities = await repository.findByAccountId('account-123');

      // Most recent first
      expect(opportunities[0].createdAt >= opportunities[1].createdAt).toBe(true);
      expect(opportunities[1].createdAt >= opportunities[2].createdAt).toBe(true);
    });
  });

  describe('findByStage()', () => {
    it('should return opportunities matching stage', async () => {
      const opp2Result = Opportunity.create({
        name: 'Second Deal',
        value: 20000,
        accountId: 'account-456',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      await repository.save(testOpportunity);
      await repository.save(opp2Result.value);

      const opportunities = await repository.findByStage('PROSPECTING');

      expect(opportunities).toHaveLength(2);
      expect(opportunities.every((o) => o.stage === 'PROSPECTING')).toBe(true);
    });

    it('should filter by stage and owner', async () => {
      const opp2Result = Opportunity.create({
        name: 'Other Owner Deal',
        value: 20000,
        accountId: 'account-456',
        ownerId: 'owner-456',
        tenantId: 'tenant-123',
      });

      await repository.save(testOpportunity);
      await repository.save(opp2Result.value);

      const opportunities = await repository.findByStage('PROSPECTING', 'owner-123');

      expect(opportunities).toHaveLength(1);
      expect(opportunities[0].ownerId).toBe('owner-123');
    });

    it('should return empty array when no opportunities match stage', async () => {
      await repository.save(testOpportunity);

      const opportunities = await repository.findByStage('CLOSED_WON');

      expect(opportunities).toHaveLength(0);
    });

    it('should handle different stage values', async () => {
      testOpportunity.changeStage('PROPOSAL', 'user-123');
      await repository.save(testOpportunity);

      const proposalOpps = await repository.findByStage('PROPOSAL');
      const prospectingOpps = await repository.findByStage('PROSPECTING');

      expect(proposalOpps).toHaveLength(1);
      expect(prospectingOpps).toHaveLength(0);
    });

    it('should sort by value descending', async () => {
      const opp2Result = Opportunity.create({
        name: 'Small Deal',
        value: 10000,
        accountId: 'account-456',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      const opp3Result = Opportunity.create({
        name: 'Large Deal',
        value: 100000,
        accountId: 'account-789',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      await repository.save(testOpportunity);
      await repository.save(opp2Result.value);
      await repository.save(opp3Result.value);

      const opportunities = await repository.findByStage('PROSPECTING');

      expect(opportunities[0].value.amount).toBe(100000);
      expect(opportunities[1].value.amount).toBe(50000);
      expect(opportunities[2].value.amount).toBe(10000);
    });
  });

  describe('findByContactId()', () => {
    it('should return opportunities for a contact', async () => {
      const opp2Result = Opportunity.create({
        name: 'Same Contact Deal',
        value: 30000,
        accountId: 'account-456',
        contactId: 'contact-456',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      await repository.save(testOpportunity);
      await repository.save(opp2Result.value);

      const opportunities = await repository.findByContactId('contact-456');

      expect(opportunities).toHaveLength(2);
      expect(opportunities.every((o) => o.contactId === 'contact-456')).toBe(true);
    });

    it('should return empty array when contact has no opportunities', async () => {
      await repository.save(testOpportunity);

      const opportunities = await repository.findByContactId('contact-999');

      expect(opportunities).toHaveLength(0);
    });

    it('should not include opportunities without a contactId', async () => {
      const oppWithoutContact = Opportunity.create({
        name: 'No Contact Deal',
        value: 15000,
        accountId: 'account-456',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      await repository.save(testOpportunity);
      await repository.save(oppWithoutContact.value);

      const opportunities = await repository.findByContactId('contact-456');

      expect(opportunities).toHaveLength(1);
      expect(opportunities[0].contactId).toBe('contact-456');
    });

    it('should sort by creation date descending', async () => {
      vi.advanceTimersByTime(1000);

      const opp2Result = Opportunity.create({
        name: 'Second Contact Deal',
        value: 30000,
        accountId: 'account-456',
        contactId: 'contact-456',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      await repository.save(testOpportunity);
      await repository.save(opp2Result.value);

      const opportunities = await repository.findByContactId('contact-456');

      expect(opportunities[0].createdAt >= opportunities[1].createdAt).toBe(true);
    });
  });

  describe('delete()', () => {
    it('should delete an existing opportunity', async () => {
      await repository.save(testOpportunity);

      await repository.delete(testOpportunityId);

      const found = await repository.findById(testOpportunityId);
      expect(found).toBeNull();
    });

    it('should not throw when deleting non-existent opportunity', async () => {
      const nonExistentId = OpportunityId.generate();

      await expect(repository.delete(nonExistentId)).resolves.toBeUndefined();
    });

    it('should only delete specified opportunity', async () => {
      const opp2Result = Opportunity.create({
        name: 'Second Deal',
        value: 20000,
        accountId: 'account-456',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      await repository.save(testOpportunity);
      await repository.save(opp2Result.value);

      await repository.delete(testOpportunityId);

      const found1 = await repository.findById(testOpportunityId);
      const found2 = await repository.findById(opp2Result.value.id);

      expect(found1).toBeNull();
      expect(found2).not.toBeNull();
    });

    it('should allow re-adding a deleted opportunity', async () => {
      await repository.save(testOpportunity);
      await repository.delete(testOpportunityId);

      await repository.save(testOpportunity);

      const found = await repository.findById(testOpportunityId);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(testOpportunityId);
    });
  });

  describe('findClosingSoon()', () => {
    it('should return opportunities closing within days', async () => {
      // testOpportunity has expectedCloseDate = March 15, 2025
      // Current time is January 15, 2025
      // 60 days from now = March 16, 2025
      await repository.save(testOpportunity);

      const closingSoon = await repository.findClosingSoon(60);

      expect(closingSoon).toHaveLength(1);
      expect(closingSoon[0].id).toBe(testOpportunityId);
    });

    it('should not return opportunities beyond the deadline', async () => {
      // testOpportunity has expectedCloseDate = March 15, 2025
      // 30 days from now = February 14, 2025
      await repository.save(testOpportunity);

      const closingSoon = await repository.findClosingSoon(30);

      expect(closingSoon).toHaveLength(0);
    });

    it('should filter by owner', async () => {
      const opp2Result = Opportunity.create({
        name: 'Other Owner Deal',
        value: 30000,
        accountId: 'account-456',
        expectedCloseDate: new Date(2025, 1, 15), // Feb 15
        ownerId: 'owner-456',
        tenantId: 'tenant-123',
      });

      await repository.save(testOpportunity);
      await repository.save(opp2Result.value);

      const closingSoon = await repository.findClosingSoon(60, 'owner-123');

      expect(closingSoon).toHaveLength(1);
      expect(closingSoon[0].ownerId).toBe('owner-123');
    });

    it('should not include closed opportunities', async () => {
      testOpportunity.markAsWon('user-123');
      await repository.save(testOpportunity);

      const closingSoon = await repository.findClosingSoon(60);

      expect(closingSoon).toHaveLength(0);
    });

    it('should not include opportunities without expectedCloseDate', async () => {
      const oppWithoutDate = Opportunity.create({
        name: 'No Date Deal',
        value: 25000,
        accountId: 'account-456',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      await repository.save(oppWithoutDate.value);

      const closingSoon = await repository.findClosingSoon(60);

      expect(closingSoon).toHaveLength(0);
    });

    it('should sort by expectedCloseDate ascending (soonest first)', async () => {
      const opp2Result = Opportunity.create({
        name: 'Earlier Close',
        value: 30000,
        accountId: 'account-456',
        expectedCloseDate: new Date(2025, 1, 1), // Feb 1
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      const opp3Result = Opportunity.create({
        name: 'Later Close',
        value: 40000,
        accountId: 'account-789',
        expectedCloseDate: new Date(2025, 2, 1), // March 1
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      await repository.save(testOpportunity);
      await repository.save(opp2Result.value);
      await repository.save(opp3Result.value);

      const closingSoon = await repository.findClosingSoon(90);

      expect(closingSoon).toHaveLength(3);
      expect(closingSoon[0].name).toBe('Earlier Close');
      expect(closingSoon[1].name).toBe('Later Close');
      expect(closingSoon[2].name).toBe('Enterprise Deal');
    });

    it('should return empty array for empty repository', async () => {
      const closingSoon = await repository.findClosingSoon(30);

      expect(closingSoon).toHaveLength(0);
    });
  });

  describe('findHighValue()', () => {
    it('should return opportunities above minimum value', async () => {
      const opp2Result = Opportunity.create({
        name: 'Small Deal',
        value: 10000,
        accountId: 'account-456',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      await repository.save(testOpportunity);
      await repository.save(opp2Result.value);

      const highValue = await repository.findHighValue(25000);

      expect(highValue).toHaveLength(1);
      expect(highValue[0].value.amount).toBe(50000);
    });

    it('should include opportunities with exact minimum value', async () => {
      await repository.save(testOpportunity);

      const highValue = await repository.findHighValue(50000);

      expect(highValue).toHaveLength(1);
      expect(highValue[0].value.amount).toBe(50000);
    });

    it('should filter by owner', async () => {
      const opp2Result = Opportunity.create({
        name: 'Other Owner High Value',
        value: 100000,
        accountId: 'account-456',
        ownerId: 'owner-456',
        tenantId: 'tenant-123',
      });

      await repository.save(testOpportunity);
      await repository.save(opp2Result.value);

      const highValue = await repository.findHighValue(25000, 'owner-123');

      expect(highValue).toHaveLength(1);
      expect(highValue[0].ownerId).toBe('owner-123');
    });

    it('should not include closed opportunities', async () => {
      testOpportunity.markAsWon('user-123');
      await repository.save(testOpportunity);

      const highValue = await repository.findHighValue(25000);

      expect(highValue).toHaveLength(0);
    });

    it('should sort by value descending', async () => {
      const opp2Result = Opportunity.create({
        name: 'Very Large Deal',
        value: 200000,
        accountId: 'account-456',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      const opp3Result = Opportunity.create({
        name: 'Large Deal',
        value: 100000,
        accountId: 'account-789',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      await repository.save(testOpportunity);
      await repository.save(opp2Result.value);
      await repository.save(opp3Result.value);

      const highValue = await repository.findHighValue(25000);

      expect(highValue).toHaveLength(3);
      expect(highValue[0].value.amount).toBe(200000);
      expect(highValue[1].value.amount).toBe(100000);
      expect(highValue[2].value.amount).toBe(50000);
    });

    it('should return empty array when no opportunities meet threshold', async () => {
      await repository.save(testOpportunity);

      const highValue = await repository.findHighValue(100000);

      expect(highValue).toHaveLength(0);
    });

    it('should return empty array for empty repository', async () => {
      const highValue = await repository.findHighValue(25000);

      expect(highValue).toHaveLength(0);
    });
  });

  describe('Test Helper Methods', () => {
    describe('clear()', () => {
      it('should remove all opportunities from repository', async () => {
        await repository.save(testOpportunity);

        repository.clear();

        const allOpps = repository.getAll();
        expect(allOpps).toHaveLength(0);
      });

      it('should allow adding opportunities after clear', async () => {
        await repository.save(testOpportunity);
        repository.clear();

        await repository.save(testOpportunity);

        const allOpps = repository.getAll();
        expect(allOpps).toHaveLength(1);
      });
    });

    describe('getAll()', () => {
      it('should return all opportunities', async () => {
        const opp2Result = Opportunity.create({
          name: 'Second Deal',
          value: 20000,
          accountId: 'account-456',
          ownerId: 'owner-123',
          tenantId: 'tenant-123',
        });

        await repository.save(testOpportunity);
        await repository.save(opp2Result.value);

        const allOpps = repository.getAll();

        expect(allOpps).toHaveLength(2);
      });

      it('should return empty array for empty repository', () => {
        const allOpps = repository.getAll();

        expect(allOpps).toHaveLength(0);
      });

      it('should return actual Opportunity instances', async () => {
        await repository.save(testOpportunity);

        const allOpps = repository.getAll();

        expect(allOpps[0]).toBeInstanceOf(Opportunity);
        expect(allOpps[0].id).toBeInstanceOf(OpportunityId);
      });
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete opportunity lifecycle', async () => {
      // Create and save opportunity
      await repository.save(testOpportunity);

      // Find by account
      const accountOpps = await repository.findByAccountId('account-123');
      expect(accountOpps).toHaveLength(1);

      // Update value
      testOpportunity.updateValue(75000, 'user-123');
      await repository.save(testOpportunity);

      // Verify update
      const updated = await repository.findById(testOpportunityId);
      expect(updated?.value.amount).toBe(75000);

      // Progress through stages
      testOpportunity.changeStage('QUALIFICATION', 'user-123');
      testOpportunity.changeStage('PROPOSAL', 'user-123');
      await repository.save(testOpportunity);

      // Find by stage
      const proposalOpps = await repository.findByStage('PROPOSAL');
      expect(proposalOpps).toHaveLength(1);

      // Mark as won
      testOpportunity.markAsWon('user-123');
      await repository.save(testOpportunity);

      // Verify won status
      const won = await repository.findById(testOpportunityId);
      expect(won?.isWon).toBe(true);
      expect(won?.isClosed).toBe(true);
    });

    it('should handle multiple accounts and owners correctly', async () => {
      const owner1Opp1 = Opportunity.create({
        name: 'Owner1 Acc1 Deal',
        value: 30000,
        accountId: 'account-1',
        ownerId: 'owner-1',
        tenantId: 'tenant-123',
      });

      const owner1Opp2 = Opportunity.create({
        name: 'Owner1 Acc2 Deal',
        value: 40000,
        accountId: 'account-2',
        ownerId: 'owner-1',
        tenantId: 'tenant-123',
      });

      const owner2Opp1 = Opportunity.create({
        name: 'Owner2 Acc1 Deal',
        value: 50000,
        accountId: 'account-1',
        ownerId: 'owner-2',
        tenantId: 'tenant-123',
      });

      await repository.save(owner1Opp1.value);
      await repository.save(owner1Opp2.value);
      await repository.save(owner2Opp1.value);

      const owner1Opps = await repository.findByOwnerId('owner-1');
      const owner2Opps = await repository.findByOwnerId('owner-2');
      const account1Opps = await repository.findByAccountId('account-1');
      const account2Opps = await repository.findByAccountId('account-2');

      expect(owner1Opps).toHaveLength(2);
      expect(owner2Opps).toHaveLength(1);
      expect(account1Opps).toHaveLength(2);
      expect(account2Opps).toHaveLength(1);
    });

    it('should maintain data integrity during concurrent operations', async () => {
      const opp2Result = Opportunity.create({
        name: 'Concurrent Deal',
        value: 35000,
        accountId: 'account-456',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      // Simulate concurrent saves
      await Promise.all([
        repository.save(testOpportunity),
        repository.save(opp2Result.value),
      ]);

      const allOpps = repository.getAll();
      expect(allOpps).toHaveLength(2);

      // Verify both opportunities are findable
      const found1 = await repository.findById(testOpportunity.id);
      const found2 = await repository.findById(opp2Result.value.id);

      expect(found1).not.toBeNull();
      expect(found2).not.toBeNull();
    });

    it('should handle lost and reopened opportunities', async () => {
      await repository.save(testOpportunity);

      // Mark as lost
      testOpportunity.markAsLost('Budget cuts', 'user-123');
      await repository.save(testOpportunity);

      // Verify lost status
      let found = await repository.findById(testOpportunityId);
      expect(found?.isLost).toBe(true);
      expect(found?.isClosed).toBe(true);

      // Should not appear in high value active opportunities
      let highValue = await repository.findHighValue(25000);
      expect(highValue).toHaveLength(0);

      // Reopen opportunity
      testOpportunity.reopen('user-123');
      await repository.save(testOpportunity);

      // Verify reopened
      found = await repository.findById(testOpportunityId);
      expect(found?.isLost).toBe(false);
      expect(found?.isClosed).toBe(false);
      expect(found?.stage).toBe('PROSPECTING');

      // Should now appear in high value opportunities
      highValue = await repository.findHighValue(25000);
      expect(highValue).toHaveLength(1);
    });

    it('should correctly filter by multiple criteria', async () => {
      // Create opportunities with various attributes
      const highValueClosingSoon = Opportunity.create({
        name: 'High Value Soon',
        value: 100000,
        accountId: 'account-1',
        expectedCloseDate: new Date(2025, 1, 15),
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      const lowValueClosingSoon = Opportunity.create({
        name: 'Low Value Soon',
        value: 5000,
        accountId: 'account-1',
        expectedCloseDate: new Date(2025, 1, 10),
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      const highValueLater = Opportunity.create({
        name: 'High Value Later',
        value: 150000,
        accountId: 'account-1',
        expectedCloseDate: new Date(2025, 6, 15),
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });

      await repository.save(highValueClosingSoon.value);
      await repository.save(lowValueClosingSoon.value);
      await repository.save(highValueLater.value);

      // Find high value opportunities
      const highValue = await repository.findHighValue(50000);
      expect(highValue).toHaveLength(2);

      // Find closing soon (within 60 days)
      const closingSoon = await repository.findClosingSoon(60);
      expect(closingSoon).toHaveLength(2);

      // Should be sorted by close date (soonest first)
      expect(closingSoon[0].name).toBe('Low Value Soon');
      expect(closingSoon[1].name).toBe('High Value Soon');
    });
  });
});
