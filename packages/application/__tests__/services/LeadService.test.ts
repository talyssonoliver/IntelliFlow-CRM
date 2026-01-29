import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LeadService, LEAD_SCORE_THRESHOLDS } from '../../src/services/LeadService';
import { InMemoryLeadRepository } from '../../../adapters/src/repositories/InMemoryLeadRepository';
import { InMemoryContactRepository } from '../../../adapters/src/repositories/InMemoryContactRepository';
import { InMemoryAccountRepository } from '../../../adapters/src/repositories/InMemoryAccountRepository';
import { InMemoryEventBus } from '../../../adapters/src/external/InMemoryEventBus';
import { MockAIService } from '../../../adapters/src/external/MockAIService';
import {
  Lead,
  Account,
  LeadScoredEvent,
  LeadQualifiedEvent,
  LeadConvertedEvent,
} from '@intelliflow/domain';

describe('LeadService', () => {
  let leadRepository: InMemoryLeadRepository;
  let contactRepository: InMemoryContactRepository;
  let accountRepository: InMemoryAccountRepository;
  let eventBus: InMemoryEventBus;
  let aiService: MockAIService;
  let service: LeadService;

  beforeEach(() => {
    leadRepository = new InMemoryLeadRepository();
    contactRepository = new InMemoryContactRepository();
    accountRepository = new InMemoryAccountRepository();
    eventBus = new InMemoryEventBus();
    aiService = new MockAIService();
    service = new LeadService(
      leadRepository,
      contactRepository,
      accountRepository,
      aiService,
      eventBus
    );
  });

  describe('createLead()', () => {
    it('should create a lead with valid input', async () => {
      const result = await service.createLead({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        company: 'TestCorp',
        ownerId: 'owner-1',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.email.value).toBe('test@example.com');
      expect(result.value.firstName).toBe('John');
      expect(result.value.lastName).toBe('Doe');
    });

    it('should fail with invalid email', async () => {
      const result = await service.createLead({
        email: 'invalid-email',
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_EMAIL');
    });

    it('should fail if email already exists', async () => {
      await service.createLead({
        email: 'duplicate@example.com',
        ownerId: 'owner-1',
      });

      const result = await service.createLead({
        email: 'duplicate@example.com',
        ownerId: 'owner-2',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('already exists');
    });

    it('should persist the lead', async () => {
      const result = await service.createLead({
        email: 'persist@example.com',
        ownerId: 'owner-1',
      });

      expect(result.isSuccess).toBe(true);
      const savedLead = await leadRepository.findById(result.value.id);
      expect(savedLead).not.toBeNull();
      expect(savedLead?.email.value).toBe('persist@example.com');
    });

    it('should publish domain events', async () => {
      eventBus.clearPublishedEvents();

      const result = await service.createLead({
        email: 'events@example.com',
        ownerId: 'owner-1',
      });

      expect(result.isSuccess).toBe(true);
      const events = eventBus.getPublishedEvents();
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('scoreLead()', () => {
    it('should score a lead successfully', async () => {
      const lead = Lead.create({
        email: 'score@example.com',
        company: 'TechCorp',
        title: 'VP Engineering',
        ownerId: 'owner-1',
      }).value;
      await leadRepository.save(lead);

      const result = await service.scoreLead(lead.id.value);

      expect(result.isSuccess).toBe(true);
      expect(result.value.newScore).toBeGreaterThan(0);
      expect(result.value.confidence).toBeGreaterThan(0);
    });

    it('should fail if lead not found', async () => {
      const result = await service.scoreLead('00000000-0000-0000-0000-000000000000');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('not found');
    });

    it('should auto-qualify lead with high score', async () => {
      const highScoreAI = new MockAIService(85);
      const highScoreService = new LeadService(
        leadRepository,
        contactRepository,
        accountRepository,
        highScoreAI,
        eventBus
      );

      const lead = Lead.create({
        email: 'autoqualify@example.com',
        ownerId: 'owner-1',
      }).value;
      await leadRepository.save(lead);

      const result = await highScoreService.scoreLead(lead.id.value);

      expect(result.isSuccess).toBe(true);
      expect(result.value.autoQualified).toBe(true);

      const updatedLead = await leadRepository.findById(lead.id);
      expect(updatedLead?.status).toBe('QUALIFIED');
    });

    it('should auto-disqualify lead with low score', async () => {
      const lowScoreAI = new MockAIService(10);
      const lowScoreService = new LeadService(
        leadRepository,
        contactRepository,
        accountRepository,
        lowScoreAI,
        eventBus
      );

      const lead = Lead.create({
        email: 'autodisqualify@example.com',
        ownerId: 'owner-1',
      }).value;
      await leadRepository.save(lead);

      const result = await lowScoreService.scoreLead(lead.id.value);

      expect(result.isSuccess).toBe(true);
      expect(result.value.autoDisqualified).toBe(true);

      const updatedLead = await leadRepository.findById(lead.id);
      expect(updatedLead?.status).toBe('UNQUALIFIED');
    });

    it('should publish LeadScoredEvent', async () => {
      const lead = Lead.create({
        email: 'scoredevent@example.com',
        ownerId: 'owner-1',
      }).value;
      lead.clearDomainEvents();
      await leadRepository.save(lead);

      eventBus.clearPublishedEvents();

      await service.scoreLead(lead.id.value);

      const events = eventBus.getPublishedEvents();
      const scoredEvents = events.filter((e) => e instanceof LeadScoredEvent);
      expect(scoredEvents.length).toBeGreaterThan(0);
    });
  });

  describe('qualifyLead()', () => {
    it('should qualify lead with sufficient score', async () => {
      const lead = Lead.create({
        email: 'qualify@example.com',
        ownerId: 'owner-1',
      }).value;
      lead.updateScore(60, 0.9, 'test-v1');
      await leadRepository.save(lead);

      const result = await service.qualifyLead(lead.id.value, 'tester', 'High potential');

      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe('QUALIFIED');
    });

    it('should fail if score is below threshold', async () => {
      const lead = Lead.create({
        email: 'lowscore@example.com',
        ownerId: 'owner-1',
      }).value;
      // Score is 0 by default
      await leadRepository.save(lead);

      const result = await service.qualifyLead(lead.id.value, 'tester', 'Trying anyway');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('below minimum');
    });

    it('should fail if lead not found', async () => {
      const result = await service.qualifyLead(
        '00000000-0000-0000-0000-000000000000',
        'tester',
        'Test reason'
      );

      expect(result.isFailure).toBe(true);
    });

    it('should fail if lead is already converted', async () => {
      const lead = Lead.create({
        email: 'converted@example.com',
        ownerId: 'owner-1',
      }).value;
      lead.updateScore(60, 0.9, 'test-v1');
      lead.qualify('someone', 'Initial qualification');
      lead.convert('contact-123', null, 'converter');
      await leadRepository.save(lead);

      const result = await service.qualifyLead(lead.id.value, 'tester', 'Re-qualify');

      expect(result.isFailure).toBe(true);
    });

    it('should publish LeadQualifiedEvent', async () => {
      const lead = Lead.create({
        email: 'qualifyevent@example.com',
        ownerId: 'owner-1',
      }).value;
      lead.updateScore(60, 0.9, 'test-v1');
      lead.clearDomainEvents();
      await leadRepository.save(lead);

      eventBus.clearPublishedEvents();

      await service.qualifyLead(lead.id.value, 'tester', 'Good prospect');

      const events = eventBus.getPublishedEvents();
      const qualifiedEvents = events.filter((e) => e instanceof LeadQualifiedEvent);
      expect(qualifiedEvents.length).toBeGreaterThan(0);
    });
  });

  describe('convertLead()', () => {
    it('should convert qualified lead to contact', async () => {
      const lead = Lead.create({
        email: 'convert@example.com',
        firstName: 'John',
        lastName: 'Doe',
        ownerId: 'owner-1',
      }).value;
      lead.updateScore(60, 0.9, 'test-v1');
      lead.qualify('someone', 'Ready to convert');
      await leadRepository.save(lead);

      const result = await service.convertLead(lead.id.value, 'New Account', 'converter');

      expect(result.isSuccess).toBe(true);
      expect(result.value.leadId).toBe(lead.id.value);
      expect(result.value.contactId).toBeDefined();
      expect(result.value.accountId).not.toBeNull();
    });

    it('should fail if lead is not qualified', async () => {
      const lead = Lead.create({
        email: 'notqualified@example.com',
        ownerId: 'owner-1',
      }).value;
      await leadRepository.save(lead);

      const result = await service.convertLead(lead.id.value, null, 'converter');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('qualified');
    });

    it('should create contact from lead data', async () => {
      const lead = Lead.create({
        email: 'contactdata@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        title: 'CEO',
        phone: '123-456-7890',
        ownerId: 'owner-1',
      }).value;
      lead.updateScore(60, 0.9, 'test-v1');
      lead.qualify('someone', 'Ready');
      await leadRepository.save(lead);

      const result = await service.convertLead(lead.id.value, null, 'converter');

      expect(result.isSuccess).toBe(true);

      const contact = await contactRepository.findByLeadId(lead.id.value);
      expect(contact).not.toBeNull();
      expect(contact?.email.value).toBe('contactdata@example.com');
      expect(contact?.firstName).toBe('Jane');
      expect(contact?.lastName).toBe('Smith');
    });

    it('should use existing account if name matches', async () => {
      const existingAccount = Account.create({
        name: 'Existing Corp',
        ownerId: 'owner-1',
      }).value;
      await accountRepository.save(existingAccount);

      const lead = Lead.create({
        email: 'existingaccount@example.com',
        ownerId: 'owner-1',
      }).value;
      lead.updateScore(60, 0.9, 'test-v1');
      lead.qualify('someone', 'Ready');
      await leadRepository.save(lead);

      const result = await service.convertLead(lead.id.value, 'Existing Corp', 'converter');

      expect(result.isSuccess).toBe(true);
      expect(result.value.accountId).toBe(existingAccount.id.value);
    });

    it('should publish LeadConvertedEvent', async () => {
      const lead = Lead.create({
        email: 'convertevent@example.com',
        ownerId: 'owner-1',
      }).value;
      lead.updateScore(60, 0.9, 'test-v1');
      lead.qualify('someone', 'Ready');
      lead.clearDomainEvents();
      await leadRepository.save(lead);

      eventBus.clearPublishedEvents();

      await service.convertLead(lead.id.value, null, 'converter');

      const events = eventBus.getPublishedEvents();
      const convertedEvents = events.filter((e) => e instanceof LeadConvertedEvent);
      expect(convertedEvents.length).toBeGreaterThan(0);
    });
  });

  describe('changeLeadStatus()', () => {
    it('should allow valid status transitions', async () => {
      const lead = Lead.create({
        email: 'statustransition@example.com',
        ownerId: 'owner-1',
      }).value;
      await leadRepository.save(lead);

      const result = await service.changeLeadStatus(lead.id.value, 'CONTACTED', 'user');

      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe('CONTACTED');
    });

    it('should reject invalid status transitions', async () => {
      const lead = Lead.create({
        email: 'invalidtransition@example.com',
        ownerId: 'owner-1',
      }).value;
      await leadRepository.save(lead);

      const result = await service.changeLeadStatus(lead.id.value, 'CONVERTED', 'user');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Invalid status transition');
    });

    it('should fail if lead not found', async () => {
      const result = await service.changeLeadStatus(
        '00000000-0000-0000-0000-000000000000',
        'CONTACTED',
        'user'
      );

      expect(result.isFailure).toBe(true);
    });
  });

  describe('updateLeadContactInfo()', () => {
    it('should update lead contact info', async () => {
      const lead = Lead.create({
        email: 'updateinfo@example.com',
        ownerId: 'owner-1',
      }).value;
      await leadRepository.save(lead);

      const result = await service.updateLeadContactInfo(lead.id.value, {
        firstName: 'Updated',
        company: 'New Company',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.firstName).toBe('Updated');
      expect(result.value.company).toBe('New Company');
    });

    it('should fail if lead is converted', async () => {
      const lead = Lead.create({
        email: 'convertedupdated@example.com',
        ownerId: 'owner-1',
      }).value;
      lead.updateScore(60, 0.9, 'test-v1');
      lead.qualify('someone', 'Ready');
      lead.convert('contact-1', null, 'converter');
      await leadRepository.save(lead);

      const result = await service.updateLeadContactInfo(lead.id.value, {
        firstName: 'Blocked',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('converted');
    });
  });

  describe('bulkScoreLeads()', () => {
    it('should score multiple leads', async () => {
      const lead1 = Lead.create({ email: 'bulk1@example.com', ownerId: 'owner-1' }).value;
      const lead2 = Lead.create({ email: 'bulk2@example.com', ownerId: 'owner-1' }).value;
      await leadRepository.save(lead1);
      await leadRepository.save(lead2);

      const result = await service.bulkScoreLeads([lead1.id.value, lead2.id.value]);

      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
      expect(result.totalProcessed).toBe(2);
    });

    it('should handle partial failures', async () => {
      const lead1 = Lead.create({ email: 'partial1@example.com', ownerId: 'owner-1' }).value;
      await leadRepository.save(lead1);

      const result = await service.bulkScoreLeads([
        lead1.id.value,
        '00000000-0000-0000-0000-000000000000',
      ]);

      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
      expect(result.totalProcessed).toBe(2);
    });
  });

  describe('getLeadsReadyForQualification()', () => {
    it('should return leads with sufficient score and eligible status', async () => {
      const qualifiedLead = Lead.create({
        email: 'ready@example.com',
        ownerId: 'owner-1',
      }).value;
      qualifiedLead.updateScore(60, 0.9, 'test-v1');
      await leadRepository.save(qualifiedLead);

      const lowScoreLead = Lead.create({
        email: 'notready@example.com',
        ownerId: 'owner-1',
      }).value;
      await leadRepository.save(lowScoreLead);

      const result = await service.getLeadsReadyForQualification('owner-1');

      expect(result).toHaveLength(1);
      expect(result[0].id.value).toBe(qualifiedLead.id.value);
    });
  });

  describe('getHotLeads()', () => {
    it('should return leads with score >= 80', async () => {
      const hotLead = Lead.create({
        email: 'hot@example.com',
        ownerId: 'owner-1',
      }).value;
      hotLead.updateScore(85, 0.9, 'test-v1');
      await leadRepository.save(hotLead);

      const warmLead = Lead.create({
        email: 'warm@example.com',
        ownerId: 'owner-1',
      }).value;
      warmLead.updateScore(60, 0.9, 'test-v1');
      await leadRepository.save(warmLead);

      const result = await service.getHotLeads('owner-1');

      expect(result).toHaveLength(1);
      expect(result[0].score.tier).toBe('HOT');
    });
  });

  describe('getLeadStatistics()', () => {
    it('should return correct statistics', async () => {
      const lead1 = Lead.create({ email: 'stat1@example.com', ownerId: 'owner-1' }).value;
      lead1.updateScore(85, 0.9, 'test-v1');
      await leadRepository.save(lead1);

      const lead2 = Lead.create({ email: 'stat2@example.com', ownerId: 'owner-1' }).value;
      lead2.updateScore(60, 0.9, 'test-v1');
      await leadRepository.save(lead2);

      const stats = await service.getLeadStatistics('owner-1');

      expect(stats.hotLeads).toBe(1);
      expect(stats.warmLeads).toBe(1);
      expect(stats.averageScore).toBeGreaterThan(0);
    });
  });
});
