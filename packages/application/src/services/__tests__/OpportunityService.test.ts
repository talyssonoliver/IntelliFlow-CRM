/**
 * OpportunityService Tests
 *
 * Tests the OpportunityService application service which orchestrates
 * opportunity-related business logic including stage transitions,
 * probability calculation, and pipeline forecasting.
 *
 * Coverage target: >90% for application layer
 */

import { describe, it, expect, beforeEach } from 'vitest';
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

describe('OpportunityService', () => {
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

    // Create a test account
    testAccount = Account.create({
      name: 'Test Account',
      ownerId: 'owner-1',
    }).value;
    await accountRepository.save(testAccount);
  });

  describe('createOpportunity()', () => {
    it('should create an opportunity with valid input', async () => {
      const result = await service.createOpportunity({
        name: 'Test Opportunity',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.name).toBe('Test Opportunity');
      expect(result.value.value.amount).toBe(50000);
      expect(result.value.stage).toBe('PROSPECTING');
    });

    it('should fail if account not found', async () => {
      const fakeAccountId = '00000000-0000-0000-0000-000000000000';

      const result = await service.createOpportunity({
        name: 'Test Opportunity',
        value: 50000,
        accountId: fakeAccountId,
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Account not found');
    });

    it('should create opportunity with contact', async () => {
      const contact = Contact.create({
        email: 'contact@example.com',
        firstName: 'John',
        lastName: 'Doe',
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(contact);

      const result = await service.createOpportunity({
        name: 'Test Opportunity',
        value: 50000,
        accountId: testAccount.id.value,
        contactId: contact.id.value,
        ownerId: 'owner-1',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.contactId).toBe(contact.id.value);
    });

    it('should fail if contact not found', async () => {
      const fakeContactId = '00000000-0000-0000-0000-000000000000';

      const result = await service.createOpportunity({
        name: 'Test Opportunity',
        value: 50000,
        accountId: testAccount.id.value,
        contactId: fakeContactId,
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Contact not found');
    });

    it('should fail if contact does not belong to account', async () => {
      const otherAccount = Account.create({
        name: 'Other Account',
        ownerId: 'owner-1',
      }).value;
      await accountRepository.save(otherAccount);

      const contact = Contact.create({
        email: 'contact@example.com',
        firstName: 'John',
        lastName: 'Doe',
        accountId: otherAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(contact);

      const result = await service.createOpportunity({
        name: 'Test Opportunity',
        value: 50000,
        accountId: testAccount.id.value,
        contactId: contact.id.value,
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Contact must belong to the specified account');
    });

    it('should publish domain events after creation', async () => {
      eventBus.clearPublishedEvents();

      await service.createOpportunity({
        name: 'Test Opportunity',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      });

      const events = eventBus.getPublishedEvents();
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('advanceStage()', () => {
    it('should advance stage through the pipeline', async () => {
      const opp = Opportunity.create({
        name: 'Advance Test',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      // Advance from PROSPECTING to QUALIFICATION
      const result = await service.advanceStage(opp.id.value, 'user');

      expect(result.isSuccess).toBe(true);
      expect(result.value.stage).toBe('QUALIFICATION');
    });

    it('should fail to advance from terminal stage', async () => {
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
      opp.markAsWon('user'); // CLOSED_WON
      await opportunityRepository.save(opp);

      const result = await service.advanceStage(opp.id.value, 'user');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('terminal stage');
    });

    it('should fail if opportunity not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const result = await service.advanceStage(fakeId, 'user');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Opportunity not found');
    });
  });

  describe('changeStage()', () => {
    it('should change stage with valid transition', async () => {
      const opp = Opportunity.create({
        name: 'Change Test',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.changeStage(opp.id.value, 'QUALIFICATION', 'user');

      expect(result.isSuccess).toBe(true);
      expect(result.value.stage).toBe('QUALIFICATION');
    });

    it('should fail with invalid transition', async () => {
      const opp = Opportunity.create({
        name: 'Invalid Change',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      // Try to jump from PROSPECTING to NEGOTIATION (invalid)
      const result = await service.changeStage(opp.id.value, 'NEGOTIATION', 'user');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Invalid stage transition');
    });

    it('should allow going back to previous stage', async () => {
      const opp = Opportunity.create({
        name: 'Backward Test',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      opp.changeStage('QUALIFICATION', 'user');
      await opportunityRepository.save(opp);

      const result = await service.changeStage(opp.id.value, 'PROSPECTING', 'user');

      expect(result.isSuccess).toBe(true);
      expect(result.value.stage).toBe('PROSPECTING');
    });
  });

  describe('updateValue()', () => {
    it('should update opportunity value', async () => {
      const opp = Opportunity.create({
        name: 'Value Test',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.updateValue(opp.id.value, 75000, 'user');

      expect(result.isSuccess).toBe(true);
      expect(result.value.value.amount).toBe(75000);
    });

    it('should fail with negative value', async () => {
      const opp = Opportunity.create({
        name: 'Negative Value',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.updateValue(opp.id.value, -1000, 'user');

      expect(result.isFailure).toBe(true);
    });

    it('should fail if opportunity not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const result = await service.updateValue(fakeId, 100000, 'user');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('updateProbability()', () => {
    it('should update probability within tolerance', async () => {
      const opp = Opportunity.create({
        name: 'Probability Test',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      // PROSPECTING default is 10%, tolerance is 20%
      const result = await service.updateProbability(opp.id.value, 25, 'user');

      expect(result.isSuccess).toBe(true);
      expect(result.value.probability.value).toBe(25);
    });

    it('should fail if probability is too far from stage default', async () => {
      const opp = Opportunity.create({
        name: 'Probability Out of Range',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      // PROSPECTING default is 10%, trying 90% (too far)
      const result = await service.updateProbability(opp.id.value, 90, 'user');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('too far from stage default');
    });

    it('should fail if opportunity not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const result = await service.updateProbability(fakeId, 50, 'user');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('updateExpectedCloseDate()', () => {
    it('should update expected close date', async () => {
      const opp = Opportunity.create({
        name: 'Date Test',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      const result = await service.updateExpectedCloseDate(opp.id.value, futureDate, 'user');

      expect(result.isSuccess).toBe(true);
    });

    it('should fail if date is in the past', async () => {
      const opp = Opportunity.create({
        name: 'Past Date Test',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 30);

      const result = await service.updateExpectedCloseDate(opp.id.value, pastDate, 'user');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('cannot be in the past');
    });

    it('should fail if opportunity not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const result = await service.updateExpectedCloseDate(fakeId, new Date(), 'user');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('markAsWon()', () => {
    it('should mark opportunity as won from NEGOTIATION', async () => {
      const opp = Opportunity.create({
        name: 'Won Test',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      opp.changeStage('QUALIFICATION', 'user');
      opp.changeStage('NEEDS_ANALYSIS', 'user');
      opp.changeStage('PROPOSAL', 'user');
      opp.changeStage('NEGOTIATION', 'user');
      await opportunityRepository.save(opp);

      const result = await service.markAsWon(opp.id.value, 'user');

      expect(result.isSuccess).toBe(true);
      expect(result.value.isWon).toBe(true);
      expect(result.value.stage).toBe('CLOSED_WON');
      expect(result.value.probability.value).toBe(100);
    });

    it('should fail if not in NEGOTIATION stage', async () => {
      const opp = Opportunity.create({
        name: 'Not Ready',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.markAsWon(opp.id.value, 'user');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Must be in NEGOTIATION stage');
    });

    it('should fail if opportunity not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const result = await service.markAsWon(fakeId, 'user');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('markAsLost()', () => {
    it('should mark opportunity as lost with reason', async () => {
      const opp = Opportunity.create({
        name: 'Lost Test',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.markAsLost(
        opp.id.value,
        'Competitor had better pricing and features',
        'user'
      );

      expect(result.isSuccess).toBe(true);
      expect(result.value.isLost).toBe(true);
      expect(result.value.stage).toBe('CLOSED_LOST');
      expect(result.value.probability.value).toBe(0);
    });

    it('should fail without sufficient reason', async () => {
      const opp = Opportunity.create({
        name: 'Short Reason',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.markAsLost(opp.id.value, 'No', 'user');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('at least 10 characters');
    });

    it('should fail if opportunity not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const result = await service.markAsLost(fakeId, 'Reason for losing', 'user');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('reopenOpportunity()', () => {
    it('should reopen a lost opportunity', async () => {
      const opp = Opportunity.create({
        name: 'Reopen Test',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      opp.markAsLost('Budget constraints prevented purchase', 'user');
      await opportunityRepository.save(opp);

      const result = await service.reopenOpportunity(opp.id.value, 'user');

      expect(result.isSuccess).toBe(true);
      expect(result.value.stage).toBe('PROSPECTING');
      expect(result.value.isClosed).toBe(false);
    });

    it('should fail if opportunity is not lost', async () => {
      const opp = Opportunity.create({
        name: 'Active Opp',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.reopenOpportunity(opp.id.value, 'user');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Only lost opportunities can be reopened');
    });

    it('should fail if opportunity not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const result = await service.reopenOpportunity(fakeId, 'user');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('getPipelineForecast()', () => {
    it('should return pipeline forecast', async () => {
      const opp1 = Opportunity.create({
        name: 'Pipeline 1',
        value: 100000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      const opp2 = Opportunity.create({
        name: 'Pipeline 2',
        value: 200000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      opp2.changeStage('QUALIFICATION', 'user');
      await opportunityRepository.save(opp1);
      await opportunityRepository.save(opp2);

      const forecast = await service.getPipelineForecast('owner-1');

      expect(forecast.totalPipelineValue).toBe(300000);
      expect(forecast.byStage['PROSPECTING'].count).toBe(1);
      expect(forecast.byStage['QUALIFICATION'].count).toBe(1);
    });

    it('should exclude closed opportunities', async () => {
      const opp1 = Opportunity.create({
        name: 'Open Opp',
        value: 100000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      const opp2 = Opportunity.create({
        name: 'Lost Opp',
        value: 200000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      opp2.markAsLost('Lost for test purposes', 'user');
      await opportunityRepository.save(opp1);
      await opportunityRepository.save(opp2);

      const forecast = await service.getPipelineForecast('owner-1');

      expect(forecast.totalPipelineValue).toBe(100000);
    });

    it('should handle empty repository', async () => {
      const forecast = await service.getPipelineForecast('owner-1');

      expect(forecast.totalPipelineValue).toBe(0);
      expect(forecast.weightedPipelineValue).toBe(0);
    });
  });

  describe('getWinRateStatistics()', () => {
    it('should calculate win rate correctly', async () => {
      const opp1 = Opportunity.create({
        name: 'Won 1',
        value: 100000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      opp1.changeStage('QUALIFICATION', 'user');
      opp1.changeStage('NEEDS_ANALYSIS', 'user');
      opp1.changeStage('PROPOSAL', 'user');
      opp1.changeStage('NEGOTIATION', 'user');
      opp1.markAsWon('user');

      const opp2 = Opportunity.create({
        name: 'Won 2',
        value: 200000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      opp2.changeStage('QUALIFICATION', 'user');
      opp2.changeStage('NEEDS_ANALYSIS', 'user');
      opp2.changeStage('PROPOSAL', 'user');
      opp2.changeStage('NEGOTIATION', 'user');
      opp2.markAsWon('user');

      const opp3 = Opportunity.create({
        name: 'Lost 1',
        value: 150000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      opp3.markAsLost('Lost for test purposes', 'user');

      await opportunityRepository.save(opp1);
      await opportunityRepository.save(opp2);
      await opportunityRepository.save(opp3);

      const stats = await service.getWinRateStatistics('owner-1');

      expect(stats.totalClosed).toBe(3);
      expect(stats.wonCount).toBe(2);
      expect(stats.lostCount).toBe(1);
      expect(stats.winRate).toBe(67); // 2/3 = 66.67%
      expect(stats.totalWonValue).toBe(300000);
      expect(stats.averageWonValue).toBe(150000);
    });

    it('should handle no closed opportunities', async () => {
      const opp = Opportunity.create({
        name: 'Open Opp',
        value: 100000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const stats = await service.getWinRateStatistics('owner-1');

      expect(stats.totalClosed).toBe(0);
      expect(stats.winRate).toBe(0);
      expect(stats.averageWonValue).toBe(0);
    });
  });

  describe('deleteOpportunity()', () => {
    it('should delete an opportunity', async () => {
      const opp = Opportunity.create({
        name: 'Delete Test',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.deleteOpportunity(opp.id.value);

      expect(result.isSuccess).toBe(true);

      const deleted = await opportunityRepository.findById(opp.id);
      expect(deleted).toBeNull();
    });

    it('should fail if opportunity is won', async () => {
      const opp = Opportunity.create({
        name: 'Won Cannot Delete',
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

      const result = await service.deleteOpportunity(opp.id.value);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Cannot delete won opportunities');
    });

    it('should allow deleting lost opportunities', async () => {
      const opp = Opportunity.create({
        name: 'Lost Can Delete',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      opp.markAsLost('Lost for test purposes', 'user');
      await opportunityRepository.save(opp);

      const result = await service.deleteOpportunity(opp.id.value);

      expect(result.isSuccess).toBe(true);
    });

    it('should fail if opportunity not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const result = await service.deleteOpportunity(fakeId);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Opportunity not found');
    });
  });

  describe('STAGE_TRANSITION_RULES', () => {
    it('should define valid transitions for all stages', () => {
      expect(STAGE_TRANSITION_RULES.PROSPECTING).toContain('QUALIFICATION');
      expect(STAGE_TRANSITION_RULES.PROSPECTING).toContain('CLOSED_LOST');
      expect(STAGE_TRANSITION_RULES.QUALIFICATION).toContain('NEEDS_ANALYSIS');
      expect(STAGE_TRANSITION_RULES.NEEDS_ANALYSIS).toContain('PROPOSAL');
      expect(STAGE_TRANSITION_RULES.PROPOSAL).toContain('NEGOTIATION');
      expect(STAGE_TRANSITION_RULES.NEGOTIATION).toContain('CLOSED_WON');
      expect(STAGE_TRANSITION_RULES.CLOSED_WON).toHaveLength(0);
      expect(STAGE_TRANSITION_RULES.CLOSED_LOST).toContain('PROSPECTING');
    });
  });

  describe('STAGE_PROBABILITIES', () => {
    it('should have correct probability values', () => {
      expect(STAGE_PROBABILITIES.PROSPECTING).toBe(10);
      expect(STAGE_PROBABILITIES.QUALIFICATION).toBe(20);
      expect(STAGE_PROBABILITIES.NEEDS_ANALYSIS).toBe(40);
      expect(STAGE_PROBABILITIES.PROPOSAL).toBe(60);
      expect(STAGE_PROBABILITIES.NEGOTIATION).toBe(80);
      expect(STAGE_PROBABILITIES.CLOSED_WON).toBe(100);
      expect(STAGE_PROBABILITIES.CLOSED_LOST).toBe(0);
    });
  });
});
