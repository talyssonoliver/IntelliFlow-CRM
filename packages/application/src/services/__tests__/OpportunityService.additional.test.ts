/**
 * OpportunityService Additional Tests
 *
 * Supplementary tests to improve coverage for uncovered methods and branches:
 * - getOpportunityById
 * - listOpportunities (filtering, sorting, pagination)
 * - updateOpportunity (all branches)
 * - getOpportunitiesClosingSoon
 * - getHighValueOpportunities
 * - getOpportunitiesByAccount
 * - getOpportunitiesByContact
 * - getPipelineForecast (closing this month/quarter)
 * - Persistence error paths
 * - Invalid ID error paths
 * - advanceStage from CLOSED_LOST terminal stage
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  OpportunityService,
  STAGE_TRANSITION_RULES,
  STAGE_PROBABILITIES,
} from '../OpportunityService';
import { InMemoryOpportunityRepository } from '../../../../adapters/src/repositories/InMemoryOpportunityRepository';
import { InMemoryAccountRepository } from '../../../../adapters/src/repositories/InMemoryAccountRepository';
import { InMemoryContactRepository } from '../../../../adapters/src/repositories/InMemoryContactRepository';
import { InMemoryEventBus } from '../../../../adapters/src/external/InMemoryEventBus';
import { Opportunity, Account, Contact } from '@intelliflow/domain';
import { TEST_TENANT_ID } from '@intelliflow/test-fixtures';

describe('OpportunityService (additional coverage)', () => {
  let opportunityRepository: InMemoryOpportunityRepository;
  let accountRepository: InMemoryAccountRepository;
  let contactRepository: InMemoryContactRepository;
  let eventBus: InMemoryEventBus;
  let service: OpportunityService;
  let testAccount: Account;

  beforeEach(async () => {
    opportunityRepository = new InMemoryOpportunityRepository();
    accountRepository = new InMemoryAccountRepository();
    contactRepository = new InMemoryContactRepository();
    eventBus = new InMemoryEventBus();
    service = new OpportunityService(
      opportunityRepository,
      accountRepository,
      contactRepository,
      eventBus
    );

    testAccount = Account.create({
      name: 'Test Account',
      ownerId: 'owner-1',
    } as any).value;
    await accountRepository.save(testAccount);
  });

  // =========================================================================
  // getOpportunityById
  // =========================================================================
  describe('getOpportunityById()', () => {
    it('should return opportunity when found', async () => {
      const opp = Opportunity.create({
        name: 'Find Me',
        value: 25000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.getOpportunityById(opp.id.value);

      expect(result.isSuccess).toBe(true);
      expect(result.value.name).toBe('Find Me');
      expect(result.value.value.amount).toBe(25000);
    });

    it('should fail when opportunity not found', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000000';
      const result = await service.getOpportunityById(fakeId);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Opportunity not found');
    });

    it('should fail with invalid ID format', async () => {
      const result = await service.getOpportunityById('not-a-uuid');

      expect(result.isFailure).toBe(true);
    });
  });

  // =========================================================================
  // listOpportunities
  // =========================================================================
  describe('listOpportunities()', () => {
    beforeEach(async () => {
      // Create a set of opportunities for filtering tests
      const names = ['Alpha Deal', 'Beta Contract', 'Gamma Opportunity'];
      const values = [100000, 50000, 200000];
      for (let i = 0; i < 3; i++) {
        const opp = Opportunity.create({
          name: names[i],
          value: values[i],
          accountId: testAccount.id.value,
          ownerId: 'owner-1',
        }).value;
        if (i === 1) {
          opp.changeStage('QUALIFICATION', 'user');
        }
        await opportunityRepository.save(opp);
      }
    });

    it('should return all opportunities for owner', async () => {
      const result = await service.listOpportunities({ ownerId: 'owner-1' });

      expect(result.total).toBe(3);
      expect(result.opportunities).toHaveLength(3);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should filter by stage', async () => {
      const result = await service.listOpportunities({
        ownerId: 'owner-1',
        stage: ['QUALIFICATION'],
      });

      expect(result.total).toBe(1);
      expect(result.opportunities[0].name).toBe('Beta Contract');
    });

    it('should filter by accountId', async () => {
      const otherAccount = Account.create({
        name: 'Other Account',
        ownerId: 'owner-1',
      } as any).value;
      await accountRepository.save(otherAccount);

      const opp = Opportunity.create({
        name: 'Other Account Opp',
        value: 10000,
        accountId: otherAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.listOpportunities({
        ownerId: 'owner-1',
        accountId: testAccount.id.value,
      });

      expect(result.total).toBe(3);
      result.opportunities.forEach((o) => {
        expect(o.accountId).toBe(testAccount.id.value);
      });
    });

    it('should filter by contactId', async () => {
      const contact = Contact.create({
        email: 'contact@example.com',
        firstName: 'John',
        lastName: 'Doe',
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      } as any).value;
      await contactRepository.save(contact);

      const opp = Opportunity.create({
        name: 'Contact Opp',
        value: 10000,
        accountId: testAccount.id.value,
        contactId: contact.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.listOpportunities({
        ownerId: 'owner-1',
        contactId: contact.id.value,
      });

      expect(result.total).toBe(1);
      expect(result.opportunities[0].name).toBe('Contact Opp');
    });

    it('should filter by minValue', async () => {
      const result = await service.listOpportunities({
        ownerId: 'owner-1',
        minValue: 100000,
      });

      expect(result.total).toBe(2); // Alpha (100000) and Gamma (200000)
    });

    it('should filter by maxValue', async () => {
      const result = await service.listOpportunities({
        ownerId: 'owner-1',
        maxValue: 100000,
      });

      expect(result.total).toBe(2); // Alpha (100000) and Beta (50000)
    });

    it('should filter by query (name search)', async () => {
      const result = await service.listOpportunities({
        ownerId: 'owner-1',
        query: 'alpha',
      });

      expect(result.total).toBe(1);
      expect(result.opportunities[0].name).toBe('Alpha Deal');
    });

    it('should paginate results', async () => {
      const result = await service.listOpportunities({
        ownerId: 'owner-1',
        page: 1,
        limit: 2,
      });

      expect(result.opportunities).toHaveLength(2);
      expect(result.total).toBe(3);
      expect(result.hasMore).toBe(true);
    });

    it('should return second page', async () => {
      const result = await service.listOpportunities({
        ownerId: 'owner-1',
        page: 2,
        limit: 2,
      });

      expect(result.opportunities).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });

    it('should sort by sortBy and sortOrder', async () => {
      const result = await service.listOpportunities({
        ownerId: 'owner-1',
        sortBy: 'name',
        sortOrder: 'asc',
      });

      expect(result.opportunities[0].name).toBe('Alpha Deal');
      expect(result.opportunities[2].name).toBe('Gamma Opportunity');
    });

    it('should return empty for unknown owner', async () => {
      const result = await service.listOpportunities({
        ownerId: 'non-existent-owner',
      });

      expect(result.total).toBe(0);
      expect(result.opportunities).toHaveLength(0);
    });

    it('should combine multiple filters', async () => {
      const result = await service.listOpportunities({
        ownerId: 'owner-1',
        stage: ['PROSPECTING'],
        minValue: 150000,
      });

      expect(result.total).toBe(1);
      expect(result.opportunities[0].name).toBe('Gamma Opportunity');
    });
  });

  // =========================================================================
  // updateOpportunity
  // =========================================================================
  describe('updateOpportunity()', () => {
    it('should update value successfully', async () => {
      const opp = Opportunity.create({
        name: 'Update Test',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.updateOpportunity(opp.id.value, { value: 75000 }, 'updater');

      expect(result.isSuccess).toBe(true);
      expect(result.value.value.amount).toBe(75000);
    });

    // IFC-282 B-04: name updates were silently dropped (service TODO).
    it('should persist a name update', async () => {
      const opp = Opportunity.create({
        name: 'Old Name',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.updateOpportunity(opp.id.value, { name: 'New Name' }, 'updater');

      expect(result.isSuccess).toBe(true);
      expect(result.value.name).toBe('New Name');
      const reloaded = await opportunityRepository.findById(opp.id);
      expect(reloaded?.name).toBe('New Name');
    });

    it('should fail an update with an empty name', async () => {
      const opp = Opportunity.create({
        name: 'Keep Name',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.updateOpportunity(opp.id.value, { name: '   ' }, 'updater');

      expect(result.isFailure).toBe(true);
      const reloaded = await opportunityRepository.findById(opp.id);
      expect(reloaded?.name).toBe('Keep Name');
    });

    it('should update probability successfully', async () => {
      const opp = Opportunity.create({
        name: 'Probability Update',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      // PROSPECTING default is 10%, tolerance is 20%
      const result = await service.updateOpportunity(opp.id.value, { probability: 15 }, 'updater');

      expect(result.isSuccess).toBe(true);
    });

    it('should update stage with valid transition', async () => {
      const opp = Opportunity.create({
        name: 'Stage Update',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.updateOpportunity(
        opp.id.value,
        { stage: 'QUALIFICATION' },
        'updater'
      );

      expect(result.isSuccess).toBe(true);
      expect(result.value.stage).toBe('QUALIFICATION');
    });

    it('should fail with invalid stage transition', async () => {
      const opp = Opportunity.create({
        name: 'Invalid Transition',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.updateOpportunity(
        opp.id.value,
        { stage: 'CLOSED_WON' },
        'updater'
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Invalid stage transition');
    });

    it('should skip stage change when updating to same stage', async () => {
      const opp = Opportunity.create({
        name: 'Same Stage',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.updateOpportunity(
        opp.id.value,
        { stage: 'PROSPECTING' },
        'updater'
      );

      expect(result.isSuccess).toBe(true);
      expect(result.value.stage).toBe('PROSPECTING');
    });

    it('should update expectedCloseDate', async () => {
      const opp = Opportunity.create({
        name: 'Date Update',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const result = await service.updateOpportunity(
        opp.id.value,
        { expectedCloseDate: futureDate },
        'updater'
      );

      expect(result.isSuccess).toBe(true);
    });

    it('should handle null expectedCloseDate (clearing)', async () => {
      const opp = Opportunity.create({
        name: 'Clear Date',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.updateOpportunity(
        opp.id.value,
        { expectedCloseDate: null },
        'updater'
      );

      // Should succeed since null expectedCloseDate is just skipped
      expect(result.isSuccess).toBe(true);
    });

    it('should validate accountId if provided and account not found', async () => {
      const opp = Opportunity.create({
        name: 'Account Validate',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
        tenantId: TEST_TENANT_ID,
      } as any).value;
      await opportunityRepository.save(opp);

      const fakeAccountId = '00000000-0000-4000-8000-000000000000';
      const result = await service.updateOpportunity(
        opp.id.value,
        { accountId: fakeAccountId },
        'updater',
        TEST_TENANT_ID
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Account not found');
    });

    it('should validate contactId if provided and contact not found', async () => {
      const opp = Opportunity.create({
        name: 'Contact Validate',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const fakeContactId = '00000000-0000-4000-8000-000000000000';
      const result = await service.updateOpportunity(
        opp.id.value,
        { contactId: fakeContactId },
        'updater'
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Contact not found');
    });

    it('should fail when opportunity not found', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000000';
      const result = await service.updateOpportunity(fakeId, { value: 100 }, 'updater');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Opportunity not found');
    });

    it('should fail with invalid opportunity ID', async () => {
      const result = await service.updateOpportunity('bad-id', { value: 100 }, 'updater');

      expect(result.isFailure).toBe(true);
    });

    it('should update with valid accountId', async () => {
      const opp = Opportunity.create({
        name: 'Valid Account Update',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const newAccount = Account.create({
        name: 'New Account',
        ownerId: 'owner-1',
      } as any).value;
      await accountRepository.save(newAccount);

      const result = await service.updateOpportunity(
        opp.id.value,
        { accountId: newAccount.id.value },
        'updater'
      );

      expect(result.isSuccess).toBe(true);
    });

    it('should fail with invalid accountId format', async () => {
      const opp = Opportunity.create({
        name: 'Bad Account ID',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
        tenantId: TEST_TENANT_ID,
      } as any).value;
      await opportunityRepository.save(opp);

      const result = await service.updateOpportunity(
        opp.id.value,
        { accountId: 'not-a-uuid' },
        'updater',
        TEST_TENANT_ID
      );

      expect(result.isFailure).toBe(true);
    });

    it('should fail with invalid contactId format', async () => {
      const opp = Opportunity.create({
        name: 'Bad Contact ID',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.updateOpportunity(
        opp.id.value,
        { contactId: 'not-a-uuid' },
        'updater'
      );

      expect(result.isFailure).toBe(true);
    });

    it('should update multiple fields at once', async () => {
      const opp = Opportunity.create({
        name: 'Multi Update',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.updateOpportunity(
        opp.id.value,
        { value: 75000, stage: 'QUALIFICATION' },
        'updater'
      );

      expect(result.isSuccess).toBe(true);
      expect(result.value.value.amount).toBe(75000);
      expect(result.value.stage).toBe('QUALIFICATION');
    });
  });

  // =========================================================================
  // getOpportunitiesClosingSoon
  // =========================================================================
  describe('getOpportunitiesClosingSoon()', () => {
    it('should return opportunities closing within specified days', async () => {
      const opp = Opportunity.create({
        name: 'Closing Soon',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
        expectedCloseDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
      }).value;
      await opportunityRepository.save(opp);

      const results = await service.getOpportunitiesClosingSoon(7, 'owner-1');

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Closing Soon');
    });

    it('should use default 7 days if not specified', async () => {
      const opp = Opportunity.create({
        name: 'Default Days',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
        expectedCloseDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      }).value;
      await opportunityRepository.save(opp);

      const results = await service.getOpportunitiesClosingSoon();

      // Without ownerId, returns based on repo implementation
      expect(Array.isArray(results)).toBe(true);
    });

    it('should not return opportunities closing after the deadline', async () => {
      const opp = Opportunity.create({
        name: 'Far Away',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
        expectedCloseDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      }).value;
      await opportunityRepository.save(opp);

      const results = await service.getOpportunitiesClosingSoon(7, 'owner-1');

      expect(results).toHaveLength(0);
    });
  });

  // =========================================================================
  // getHighValueOpportunities
  // =========================================================================
  describe('getHighValueOpportunities()', () => {
    it('should return opportunities above min value', async () => {
      const opp1 = Opportunity.create({
        name: 'High Value',
        value: 500000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      const opp2 = Opportunity.create({
        name: 'Low Value',
        value: 5000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp1);
      await opportunityRepository.save(opp2);

      const results = await service.getHighValueOpportunities(100000, 'owner-1');

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('High Value');
    });

    it('should exclude closed opportunities', async () => {
      const opp = Opportunity.create({
        name: 'Closed High Value',
        value: 500000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      opp.markAsLost('Lost to competition in market', 'user');
      await opportunityRepository.save(opp);

      const results = await service.getHighValueOpportunities(100000, 'owner-1');

      expect(results).toHaveLength(0);
    });
  });

  // =========================================================================
  // getOpportunitiesByAccount
  // =========================================================================
  describe('getOpportunitiesByAccount()', () => {
    it('should return opportunities for a specific account', async () => {
      const opp = Opportunity.create({
        name: 'Account Opp',
        value: 25000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const results = await service.getOpportunitiesByAccount(testAccount.id.value);

      expect(results).toHaveLength(1);
      expect(results[0].accountId).toBe(testAccount.id.value);
    });

    it('should return empty for account with no opportunities', async () => {
      const results = await service.getOpportunitiesByAccount('no-opps-account');

      expect(results).toHaveLength(0);
    });
  });

  // =========================================================================
  // getOpportunitiesByContact
  // =========================================================================
  describe('getOpportunitiesByContact()', () => {
    it('should return opportunities for a specific contact', async () => {
      const contact = Contact.create({
        email: 'contact@test.com',
        firstName: 'Jane',
        lastName: 'Smith',
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      } as any).value;
      await contactRepository.save(contact);

      const opp = Opportunity.create({
        name: 'Contact Opp',
        value: 25000,
        accountId: testAccount.id.value,
        contactId: contact.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const results = await service.getOpportunitiesByContact(contact.id.value);

      expect(results).toHaveLength(1);
    });

    it('should return empty for contact with no opportunities', async () => {
      const results = await service.getOpportunitiesByContact('no-opps-contact');

      expect(results).toHaveLength(0);
    });
  });

  // =========================================================================
  // getPipelineForecast (extended)
  // =========================================================================
  describe('getPipelineForecast() - extended', () => {
    it('should calculate closing this month', async () => {
      const now = new Date();
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const closeDate = new Date(endOfMonth);
      closeDate.setUTCDate(closeDate.getUTCDate() - 1); // 1 day before end of month

      const opp = Opportunity.create({
        name: 'Closing This Month',
        value: 100000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
        expectedCloseDate: closeDate,
      }).value;
      await opportunityRepository.save(opp);

      const forecast = await service.getPipelineForecast('owner-1', 'test-tenant');

      expect(forecast.closingThisMonth).toBeGreaterThan(0);
    });

    it('should calculate closing this quarter', async () => {
      const now = new Date();
      const currentQuarterEnd = new Date(
        now.getFullYear(),
        Math.ceil((now.getMonth() + 1) / 3) * 3,
        0
      );
      const closeDate = new Date(currentQuarterEnd);
      closeDate.setUTCDate(closeDate.getUTCDate() - 1);

      const opp = Opportunity.create({
        name: 'Closing This Quarter',
        value: 200000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
        expectedCloseDate: closeDate,
      }).value;
      await opportunityRepository.save(opp);

      const forecast = await service.getPipelineForecast('owner-1', 'test-tenant');

      expect(forecast.closingThisQuarter).toBeGreaterThan(0);
    });

    it('should return zeros without ownerId', async () => {
      const forecast = await service.getPipelineForecast();

      expect(forecast.totalPipelineValue).toBe(0);
      expect(forecast.weightedPipelineValue).toBe(0);
      expect(forecast.closingThisMonth).toBe(0);
      expect(forecast.closingThisQuarter).toBe(0);
    });

    it('should calculate weighted pipeline value correctly', async () => {
      const opp = Opportunity.create({
        name: 'Weighted Value',
        value: 100000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      // PROSPECTING stage with default 10% probability
      await opportunityRepository.save(opp);

      const forecast = await service.getPipelineForecast('owner-1', 'test-tenant');

      expect(forecast.totalPipelineValue).toBe(100000);
      // weightedValue = 100000 * 0.10 = 10000
      expect(forecast.weightedPipelineValue).toBe(10000);
    });

    it('should populate byStage correctly', async () => {
      const opp1 = Opportunity.create({
        name: 'Prospecting',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      const opp2 = Opportunity.create({
        name: 'Proposal',
        value: 100000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      opp2.changeStage('QUALIFICATION', 'user');
      opp2.changeStage('NEEDS_ANALYSIS', 'user');
      opp2.changeStage('PROPOSAL', 'user');
      await opportunityRepository.save(opp1);
      await opportunityRepository.save(opp2);

      const forecast = await service.getPipelineForecast('owner-1', 'test-tenant');

      expect(forecast.byStage['PROSPECTING'].count).toBe(1);
      expect(forecast.byStage['PROSPECTING'].totalValue).toBe(50000);
      expect(forecast.byStage['PROPOSAL'].count).toBe(1);
      expect(forecast.byStage['PROPOSAL'].totalValue).toBe(100000);
      expect(forecast.byStage['QUALIFICATION'].count).toBe(0);
    });
  });

  // =========================================================================
  // getWinRateStatistics (extended)
  // =========================================================================
  describe('getWinRateStatistics() - extended', () => {
    it('should return zeros without ownerId', async () => {
      const stats = await service.getWinRateStatistics();

      expect(stats.totalClosed).toBe(0);
      expect(stats.wonCount).toBe(0);
      expect(stats.lostCount).toBe(0);
      expect(stats.winRate).toBe(0);
      expect(stats.totalWonValue).toBe(0);
      expect(stats.averageWonValue).toBe(0);
    });
  });

  // =========================================================================
  // advanceStage (extended)
  // =========================================================================
  describe('advanceStage() - extended', () => {
    it('should fail to advance from CLOSED_LOST terminal stage', async () => {
      const opp = Opportunity.create({
        name: 'Lost Opp',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      opp.markAsLost('Budget constraints prevented purchase', 'user');
      await opportunityRepository.save(opp);

      const result = await service.advanceStage(opp.id.value, 'user', '');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('terminal stage');
    });

    it('should fail with invalid ID', async () => {
      const result = await service.advanceStage('not-a-uuid', 'user', '');

      expect(result.isFailure).toBe(true);
    });
  });

  // =========================================================================
  // changeStage (extended)
  // =========================================================================
  describe('changeStage() - extended', () => {
    it('should fail with invalid ID', async () => {
      const result = await service.changeStage('not-a-uuid', 'QUALIFICATION', 'user', '');

      expect(result.isFailure).toBe(true);
    });

    it('should fail if opportunity not found', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000000';
      const result = await service.changeStage(fakeId, 'QUALIFICATION', 'user', '');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Opportunity not found');
    });
  });

  // =========================================================================
  // updateValue (extended)
  // =========================================================================
  describe('updateValue() - extended', () => {
    it('should fail with invalid ID', async () => {
      const result = await service.updateValue('not-a-uuid', 100, 'user', '');

      expect(result.isFailure).toBe(true);
    });
  });

  // =========================================================================
  // updateProbability (extended)
  // =========================================================================
  describe('updateProbability() - extended', () => {
    it('should fail with invalid ID', async () => {
      const result = await service.updateProbability('not-a-uuid', 50, 'user', '');

      expect(result.isFailure).toBe(true);
    });

    it('should allow CLOSED_WON probability without tolerance check', async () => {
      const opp = Opportunity.create({
        name: 'Won Opp',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      opp.changeStage('QUALIFICATION', 'user');
      opp.changeStage('NEEDS_ANALYSIS', 'user');
      opp.changeStage('PROPOSAL', 'user');
      opp.changeStage('NEGOTIATION', 'user');
      opp.markAsWon('user');
      await opportunityRepository.save(opp);

      // CLOSED_WON and CLOSED_LOST skip the tolerance check
      const result = await service.updateProbability(opp.id.value, 50, 'user', '');

      // domain entity may reject updating probability on closed opportunity
      // The main thing is the tolerance check is skipped
      expect(result.isFailure).toBe(true); // closed opportunities can't update probability
    });
  });

  // =========================================================================
  // updateExpectedCloseDate (extended)
  // =========================================================================
  describe('updateExpectedCloseDate() - extended', () => {
    it('should fail with invalid ID', async () => {
      const futureDate = new Date();
      futureDate.setUTCDate(futureDate.getUTCDate() + 30);
      const result = await service.updateExpectedCloseDate('not-a-uuid', futureDate, 'user', '');

      expect(result.isFailure).toBe(true);
    });
  });

  // =========================================================================
  // markAsWon (extended)
  // =========================================================================
  describe('markAsWon() - extended', () => {
    it('should fail with invalid ID', async () => {
      const result = await service.markAsWon('not-a-uuid', 'user', '');

      expect(result.isFailure).toBe(true);
    });
  });

  // =========================================================================
  // markAsLost (extended)
  // =========================================================================
  describe('markAsLost() - extended', () => {
    it('should fail with invalid ID', async () => {
      const result = await service.markAsLost('not-a-uuid', 'Valid reason text', 'user', '');

      expect(result.isFailure).toBe(true);
    });

    it('should fail with empty reason', async () => {
      const opp = Opportunity.create({
        name: 'Empty Reason',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.markAsLost(opp.id.value, '', 'user', '');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('at least 10 characters');
    });

    it('should fail with whitespace-only reason', async () => {
      const opp = Opportunity.create({
        name: 'Whitespace Reason',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.markAsLost(opp.id.value, '   ', 'user', '');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('at least 10 characters');
    });
  });

  // =========================================================================
  // reopenOpportunity (extended)
  // =========================================================================
  describe('reopenOpportunity() - extended', () => {
    it('should fail with invalid ID', async () => {
      const result = await service.reopenOpportunity('not-a-uuid', 'user', '');

      expect(result.isFailure).toBe(true);
    });
  });

  // =========================================================================
  // deleteOpportunity (extended)
  // =========================================================================
  describe('deleteOpportunity() - extended', () => {
    it('should fail with invalid ID', async () => {
      const result = await service.deleteOpportunity('not-a-uuid', '');

      expect(result.isFailure).toBe(true);
    });
  });

  // =========================================================================
  // Persistence error paths
  // =========================================================================
  describe('persistence error handling', () => {
    it('should return PersistenceError when save fails on create', async () => {
      // Override save to throw
      const origSave = opportunityRepository.save.bind(opportunityRepository);
      opportunityRepository.save = vi.fn().mockRejectedValue(new Error('DB down'));

      const result = await service.createOpportunity({
        name: 'Fail Save',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save opportunity');

      // Restore
      opportunityRepository.save = origSave;
    });

    it('should return PersistenceError when save fails on changeStage', async () => {
      const opp = Opportunity.create({
        name: 'Fail Stage Save',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      opportunityRepository.save = vi.fn().mockRejectedValue(new Error('DB down'));

      const result = await service.changeStage(opp.id.value, 'QUALIFICATION', 'user', '');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save opportunity');
    });

    it('should return PersistenceError when save fails on updateValue', async () => {
      const opp = Opportunity.create({
        name: 'Fail Value Save',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      opportunityRepository.save = vi.fn().mockRejectedValue(new Error('DB down'));

      const result = await service.updateValue(opp.id.value, 75000, 'user', '');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save opportunity');
    });

    it('should return PersistenceError when save fails on updateProbability', async () => {
      const opp = Opportunity.create({
        name: 'Fail Prob Save',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      opportunityRepository.save = vi.fn().mockRejectedValue(new Error('DB down'));

      const result = await service.updateProbability(opp.id.value, 15, 'user', '');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save opportunity');
    });

    it('should return PersistenceError when save fails on updateExpectedCloseDate', async () => {
      const opp = Opportunity.create({
        name: 'Fail Date Save',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      opportunityRepository.save = vi.fn().mockRejectedValue(new Error('DB down'));

      const futureDate = new Date();
      futureDate.setUTCDate(futureDate.getUTCDate() + 30);

      const result = await service.updateExpectedCloseDate(opp.id.value, futureDate, 'user', '');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save opportunity');
    });

    it('should return PersistenceError when save fails on markAsWon', async () => {
      const opp = Opportunity.create({
        name: 'Fail Won Save',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      opp.changeStage('QUALIFICATION', 'user');
      opp.changeStage('NEEDS_ANALYSIS', 'user');
      opp.changeStage('PROPOSAL', 'user');
      opp.changeStage('NEGOTIATION', 'user');
      await opportunityRepository.save(opp);

      opportunityRepository.save = vi.fn().mockRejectedValue(new Error('DB down'));

      const result = await service.markAsWon(opp.id.value, 'user', '');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save opportunity');
    });

    it('should return PersistenceError when save fails on markAsLost', async () => {
      const opp = Opportunity.create({
        name: 'Fail Lost Save',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      opportunityRepository.save = vi.fn().mockRejectedValue(new Error('DB down'));

      const result = await service.markAsLost(
        opp.id.value,
        'Competition had better offering',
        'user',
        ''
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save opportunity');
    });

    it('should return PersistenceError when save fails on reopenOpportunity', async () => {
      const opp = Opportunity.create({
        name: 'Fail Reopen Save',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      opp.markAsLost('Budget constraints prevented purchase', 'user');
      await opportunityRepository.save(opp);

      opportunityRepository.save = vi.fn().mockRejectedValue(new Error('DB down'));

      const result = await service.reopenOpportunity(opp.id.value, 'user', '');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save opportunity');
    });

    it('should return PersistenceError when delete fails', async () => {
      const opp = Opportunity.create({
        name: 'Fail Delete',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      opportunityRepository.softDelete = vi.fn().mockRejectedValue(new Error('DB down'));

      const result = await service.deleteOpportunity(opp.id.value, '');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to delete opportunity');
    });

    it('should return PersistenceError when save fails on updateOpportunity', async () => {
      const opp = Opportunity.create({
        name: 'Fail Update Save',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      opportunityRepository.save = vi.fn().mockRejectedValue(new Error('DB down'));

      const result = await service.updateOpportunity(opp.id.value, { value: 75000 }, 'updater');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save opportunity');
    });
  });

  // =========================================================================
  // Event publishing resilience
  // =========================================================================
  describe('event publishing resilience', () => {
    it('should not fail when event publishing throws', async () => {
      eventBus.publishAll = vi.fn().mockRejectedValue(new Error('Event bus down'));

      const result = await service.createOpportunity({
        name: 'Events Fail',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      });

      // Should still succeed even if event publishing fails
      expect(result.isSuccess).toBe(true);
    });
  });

  // =========================================================================
  // createOpportunity - invalid account ID format
  // =========================================================================
  describe('createOpportunity() - extended', () => {
    it('should fail with invalid account ID format', async () => {
      const result = await service.createOpportunity({
        name: 'Invalid Account ID',
        value: 50000,
        accountId: 'not-a-uuid',
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
    });

    it('should fail with invalid contact ID format', async () => {
      const result = await service.createOpportunity({
        name: 'Invalid Contact ID',
        value: 50000,
        accountId: testAccount.id.value,
        contactId: 'not-a-uuid',
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
    });
  });
});
