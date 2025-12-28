import { describe, it, expect, beforeEach } from 'vitest';
import { OpportunityService, STAGE_TRANSITION_RULES } from '../../src/services/OpportunityService';
import { InMemoryOpportunityRepository } from '../../../adapters/src/repositories/InMemoryOpportunityRepository';
import { InMemoryAccountRepository } from '../../../adapters/src/repositories/InMemoryAccountRepository';
import { InMemoryContactRepository } from '../../../adapters/src/repositories/InMemoryContactRepository';
import { InMemoryEventBus } from '../../../adapters/src/external/InMemoryEventBus';
import {
  Account,
  Contact,
  Opportunity,
  OpportunityCreatedEvent,
  OpportunityStageChangedEvent,
  OpportunityWonEvent,
  OpportunityLostEvent,
} from '@intelliflow/domain';

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
        name: 'New Deal',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.name).toBe('New Deal');
      expect(result.value.value).toBe(50000);
      expect(result.value.stage).toBe('PROSPECTING');
      expect(result.value.probability).toBe(10);
    });

    it('should fail with invalid account', async () => {
      const result = await service.createOpportunity({
        name: 'Bad Account Deal',
        value: 50000,
        accountId: '00000000-0000-0000-0000-000000000000',
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Account not found');
    });

    it('should fail if contact does not belong to account', async () => {
      const otherAccount = Account.create({
        name: 'Other Account',
        ownerId: 'owner-1',
      }).value;
      await accountRepository.save(otherAccount);

      const contact = Contact.create({
        email: 'wrongaccount@example.com',
        firstName: 'John',
        lastName: 'Doe',
        accountId: otherAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(contact);

      const result = await service.createOpportunity({
        name: 'Wrong Contact Deal',
        value: 50000,
        accountId: testAccount.id.value,
        contactId: contact.id.value,
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('belong to the specified account');
    });

    it('should create opportunity with valid contact', async () => {
      const contact = Contact.create({
        email: 'validcontact@example.com',
        firstName: 'John',
        lastName: 'Doe',
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await contactRepository.save(contact);

      const result = await service.createOpportunity({
        name: 'Valid Contact Deal',
        value: 75000,
        accountId: testAccount.id.value,
        contactId: contact.id.value,
        ownerId: 'owner-1',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.contactId).toBe(contact.id.value);
    });

    it('should fail with invalid value', async () => {
      const result = await service.createOpportunity({
        name: 'Zero Value Deal',
        value: 0,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
    });

    it('should publish OpportunityCreatedEvent', async () => {
      eventBus.clearPublishedEvents();

      await service.createOpportunity({
        name: 'Events Deal',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      });

      const events = eventBus.getPublishedEvents();
      const createdEvents = events.filter((e) => e instanceof OpportunityCreatedEvent);
      expect(createdEvents.length).toBeGreaterThan(0);
    });
  });

  describe('advanceStage()', () => {
    it('should advance to next stage', async () => {
      const opp = Opportunity.create({
        name: 'Advance Deal',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.advanceStage(opp.id.value, 'advancer');

      expect(result.isSuccess).toBe(true);
      expect(result.value.stage).toBe('QUALIFICATION');
    });

    it('should fail if already in terminal stage', async () => {
      const opp = Opportunity.create({
        name: 'Won Deal',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      opp.changeStage('NEGOTIATION', 'someone');
      opp.markAsWon('winner');
      await opportunityRepository.save(opp);

      const result = await service.advanceStage(opp.id.value, 'advancer');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('changeStage()', () => {
    it('should allow valid stage transitions', async () => {
      const opp = Opportunity.create({
        name: 'Stage Deal',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.changeStage(opp.id.value, 'QUALIFICATION', 'changer');

      expect(result.isSuccess).toBe(true);
      expect(result.value.stage).toBe('QUALIFICATION');
    });

    it('should reject invalid stage transitions', async () => {
      const opp = Opportunity.create({
        name: 'Invalid Stage Deal',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      // Cannot go directly from PROSPECTING to PROPOSAL
      const result = await service.changeStage(opp.id.value, 'PROPOSAL', 'changer');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Invalid stage transition');
    });

    it('should publish OpportunityStageChangedEvent', async () => {
      const opp = Opportunity.create({
        name: 'Event Stage Deal',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      opp.clearDomainEvents();
      await opportunityRepository.save(opp);

      eventBus.clearPublishedEvents();

      await service.changeStage(opp.id.value, 'QUALIFICATION', 'changer');

      const events = eventBus.getPublishedEvents();
      const stageEvents = events.filter((e) => e instanceof OpportunityStageChangedEvent);
      expect(stageEvents.length).toBeGreaterThan(0);
    });
  });

  describe('updateValue()', () => {
    it('should update opportunity value', async () => {
      const opp = Opportunity.create({
        name: 'Value Deal',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.updateValue(opp.id.value, 75000, 'updater');

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe(75000);
    });

    it('should fail with invalid value', async () => {
      const opp = Opportunity.create({
        name: 'Bad Value Deal',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.updateValue(opp.id.value, -100, 'updater');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('updateProbability()', () => {
    it('should update probability within stage tolerance', async () => {
      const opp = Opportunity.create({
        name: 'Probability Deal',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      opp.changeStage('QUALIFICATION', 'someone');
      await opportunityRepository.save(opp);

      // QUALIFICATION default is 20%, so 25% should be within tolerance
      const result = await service.updateProbability(opp.id.value, 25, 'updater');

      expect(result.isSuccess).toBe(true);
      expect(result.value.probability).toBe(25);
    });

    it('should fail if probability too far from stage default', async () => {
      const opp = Opportunity.create({
        name: 'Bad Probability Deal',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      // PROSPECTING default is 10%, so 80% is way out of tolerance
      const result = await service.updateProbability(opp.id.value, 80, 'updater');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('too far from stage default');
    });
  });

  describe('updateExpectedCloseDate()', () => {
    it('should update expected close date', async () => {
      const opp = Opportunity.create({
        name: 'Date Deal',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 1);

      const result = await service.updateExpectedCloseDate(opp.id.value, futureDate, 'updater');

      expect(result.isSuccess).toBe(true);
      expect(result.value.expectedCloseDate?.getTime()).toBe(futureDate.getTime());
    });

    it('should fail with past date for open opportunity', async () => {
      const opp = Opportunity.create({
        name: 'Past Date Deal',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const pastDate = new Date();
      pastDate.setMonth(pastDate.getMonth() - 1);

      const result = await service.updateExpectedCloseDate(opp.id.value, pastDate, 'updater');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('markAsWon()', () => {
    it('should mark opportunity as won from NEGOTIATION', async () => {
      const opp = Opportunity.create({
        name: 'Win Deal',
        value: 100000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      opp.changeStage('QUALIFICATION', 'someone');
      opp.changeStage('NEEDS_ANALYSIS', 'someone');
      opp.changeStage('PROPOSAL', 'someone');
      opp.changeStage('NEGOTIATION', 'someone');
      await opportunityRepository.save(opp);

      const result = await service.markAsWon(opp.id.value, 'closer');

      expect(result.isSuccess).toBe(true);
      expect(result.value.stage).toBe('CLOSED_WON');
      expect(result.value.probability).toBe(100);
      expect(result.value.isWon).toBe(true);
    });

    it('should fail if not in NEGOTIATION stage', async () => {
      const opp = Opportunity.create({
        name: 'Not Ready Deal',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.markAsWon(opp.id.value, 'closer');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Must be in NEGOTIATION');
    });

    it('should publish OpportunityWonEvent', async () => {
      const opp = Opportunity.create({
        name: 'Win Event Deal',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      opp.changeStage('QUALIFICATION', 'someone');
      opp.changeStage('NEEDS_ANALYSIS', 'someone');
      opp.changeStage('PROPOSAL', 'someone');
      opp.changeStage('NEGOTIATION', 'someone');
      opp.clearDomainEvents();
      await opportunityRepository.save(opp);

      eventBus.clearPublishedEvents();

      await service.markAsWon(opp.id.value, 'closer');

      const events = eventBus.getPublishedEvents();
      const wonEvents = events.filter((e) => e instanceof OpportunityWonEvent);
      expect(wonEvents.length).toBeGreaterThan(0);
    });
  });

  describe('markAsLost()', () => {
    it('should mark opportunity as lost', async () => {
      const opp = Opportunity.create({
        name: 'Lost Deal',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.markAsLost(
        opp.id.value,
        'Customer went with competitor due to pricing',
        'closer'
      );

      expect(result.isSuccess).toBe(true);
      expect(result.value.stage).toBe('CLOSED_LOST');
      expect(result.value.probability).toBe(0);
      expect(result.value.isLost).toBe(true);
    });

    it('should fail with short reason', async () => {
      const opp = Opportunity.create({
        name: 'Short Reason Deal',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.markAsLost(opp.id.value, 'Lost', 'closer');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('at least 10 characters');
    });

    it('should publish OpportunityLostEvent', async () => {
      const opp = Opportunity.create({
        name: 'Lost Event Deal',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      opp.clearDomainEvents();
      await opportunityRepository.save(opp);

      eventBus.clearPublishedEvents();

      await service.markAsLost(
        opp.id.value,
        'Customer went with competitor due to pricing',
        'closer'
      );

      const events = eventBus.getPublishedEvents();
      const lostEvents = events.filter((e) => e instanceof OpportunityLostEvent);
      expect(lostEvents.length).toBeGreaterThan(0);
    });
  });

  describe('reopenOpportunity()', () => {
    it('should reopen lost opportunity', async () => {
      const opp = Opportunity.create({
        name: 'Reopen Deal',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      opp.markAsLost('Lost for testing', 'loser');
      await opportunityRepository.save(opp);

      const result = await service.reopenOpportunity(opp.id.value, 'reopener');

      expect(result.isSuccess).toBe(true);
      expect(result.value.stage).toBe('PROSPECTING');
      expect(result.value.isClosed).toBe(false);
    });

    it('should fail if opportunity is not lost', async () => {
      const opp = Opportunity.create({
        name: 'Active Deal',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      await opportunityRepository.save(opp);

      const result = await service.reopenOpportunity(opp.id.value, 'reopener');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('getPipelineForecast()', () => {
    it('should return pipeline forecast', async () => {
      const opp1 = Opportunity.create({
        name: 'Forecast 1',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      const opp2 = Opportunity.create({
        name: 'Forecast 2',
        value: 100000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      opp2.changeStage('QUALIFICATION', 'someone');
      await opportunityRepository.save(opp1);
      await opportunityRepository.save(opp2);

      const forecast = await service.getPipelineForecast('owner-1');

      expect(forecast.totalPipelineValue).toBe(150000);
      expect(forecast.byStage['PROSPECTING'].count).toBe(1);
      expect(forecast.byStage['QUALIFICATION'].count).toBe(1);
    });
  });

  describe('getWinRateStatistics()', () => {
    it('should return win rate statistics', async () => {
      const opp1 = Opportunity.create({
        name: 'Won 1',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      opp1.changeStage('QUALIFICATION', 'someone');
      opp1.changeStage('NEEDS_ANALYSIS', 'someone');
      opp1.changeStage('PROPOSAL', 'someone');
      opp1.changeStage('NEGOTIATION', 'someone');
      opp1.markAsWon('winner');
      await opportunityRepository.save(opp1);

      const opp2 = Opportunity.create({
        name: 'Lost 1',
        value: 30000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      opp2.markAsLost('Competitor won', 'loser');
      await opportunityRepository.save(opp2);

      const stats = await service.getWinRateStatistics('owner-1');

      expect(stats.totalClosed).toBe(2);
      expect(stats.wonCount).toBe(1);
      expect(stats.lostCount).toBe(1);
      expect(stats.winRate).toBe(50);
      expect(stats.totalWonValue).toBe(50000);
    });
  });

  describe('deleteOpportunity()', () => {
    it('should delete an opportunity', async () => {
      const opp = Opportunity.create({
        name: 'Delete Deal',
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
        name: 'Won Delete Deal',
        value: 50000,
        accountId: testAccount.id.value,
        ownerId: 'owner-1',
      }).value;
      opp.changeStage('QUALIFICATION', 'someone');
      opp.changeStage('NEEDS_ANALYSIS', 'someone');
      opp.changeStage('PROPOSAL', 'someone');
      opp.changeStage('NEGOTIATION', 'someone');
      opp.markAsWon('winner');
      await opportunityRepository.save(opp);

      const result = await service.deleteOpportunity(opp.id.value);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Cannot delete won opportunities');
    });
  });
});
