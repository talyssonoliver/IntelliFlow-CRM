import { describe, it, expect, beforeEach } from 'vitest';
import { ScoreLeadUseCase, ScoreLeadInput } from '../src/usecases/leads/ScoreLeadUseCase';
import { InMemoryLeadRepository } from '../../adapters/src/repositories/InMemoryLeadRepository';
import { InMemoryEventBus } from '../../adapters/src/external/InMemoryEventBus';
import { MockAIService } from '../../adapters/src/external/MockAIService';
import { Lead, LeadScoredEvent } from '@intelliflow/domain';

describe('ScoreLeadUseCase', () => {
  let repository: InMemoryLeadRepository;
  let eventBus: InMemoryEventBus;
  let aiService: MockAIService;
  let useCase: ScoreLeadUseCase;

  beforeEach(() => {
    repository = new InMemoryLeadRepository();
    eventBus = new InMemoryEventBus();
    aiService = new MockAIService();
    useCase = new ScoreLeadUseCase(repository, aiService, eventBus);
  });

  describe('execute()', () => {
    it('should score a lead with valid input', async () => {
      // Create a lead first
      const leadResult = Lead.create({
        email: 'score@example.com',
        firstName: 'John',
        company: 'TechCorp',
        title: 'VP Engineering',
        ownerId: 'owner-123',
      });
      expect(leadResult.isSuccess).toBe(true);
      const lead = leadResult.value;
      await repository.save(lead);

      const input: ScoreLeadInput = {
        leadId: lead.id.value,
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      const output = result.value;
      expect(output.leadId).toBe(lead.id.value);
      expect(output.score).toBeGreaterThan(0);
      expect(output.confidence).toBeGreaterThan(0);
      expect(output.modelVersion).toBe('mock-v1.0');
      expect(output.reasoning).toBeDefined();
    });

    it('should fail when lead ID is invalid', async () => {
      const input: ScoreLeadInput = {
        leadId: 'invalid-uuid',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Invalid');
    });

    it('should fail when lead is not found', async () => {
      const input: ScoreLeadInput = {
        leadId: '00000000-0000-0000-0000-000000000000',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('not found');
      expect(result.error.code).toBe('VALIDATION_ERROR');
    });

    it('should update lead score in repository', async () => {
      const leadResult = Lead.create({
        email: 'update@example.com',
        company: 'UpdateCorp',
        ownerId: 'owner-456',
      });
      const lead = leadResult.value;
      await repository.save(lead);

      const input: ScoreLeadInput = {
        leadId: lead.id.value,
      };

      const result = await useCase.execute(input);
      expect(result.isSuccess).toBe(true);

      // Verify score was updated in repository
      const updatedLead = await repository.findById(lead.id);
      expect(updatedLead).not.toBeNull();
      expect(updatedLead!.score.value).toBeGreaterThan(0);
      expect(updatedLead!.score.value).toBe(result.value.score);
      expect(updatedLead!.score.confidence).toBe(result.value.confidence);
    });

    it('should publish LeadScoredEvent', async () => {
      const leadResult = Lead.create({
        email: 'event@example.com',
        ownerId: 'owner-789',
      });
      const lead = leadResult.value;
      lead.clearDomainEvents(); // Clear LeadCreatedEvent before saving
      await repository.save(lead);

      eventBus.clearPublishedEvents();

      const input: ScoreLeadInput = {
        leadId: lead.id.value,
      };

      const result = await useCase.execute(input);
      expect(result.isSuccess).toBe(true);

      const events = eventBus.getPublishedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(LeadScoredEvent);

      const scoredEvent = events[0] as LeadScoredEvent;
      expect(scoredEvent.eventType).toBe('lead.scored');
      expect(scoredEvent.leadId.value).toBe(lead.id.value);
    });

    it('should calculate higher score for leads with company', async () => {
      const leadWithCompany = Lead.create({
        email: 'withcompany@example.com',
        company: 'BigCorp',
        ownerId: 'owner-comp',
      });
      await repository.save(leadWithCompany.value);

      const leadWithoutCompany = Lead.create({
        email: 'nocompany@example.com',
        ownerId: 'owner-no-comp',
      });
      await repository.save(leadWithoutCompany.value);

      const result1 = await useCase.execute({ leadId: leadWithCompany.value.id.value });
      const result2 = await useCase.execute({ leadId: leadWithoutCompany.value.id.value });

      expect(result1.isSuccess).toBe(true);
      expect(result2.isSuccess).toBe(true);
      expect(result1.value.score).toBeGreaterThan(result2.value.score);
    });

    it('should calculate higher score for leads with senior titles', async () => {
      const ceoLead = Lead.create({
        email: 'ceo@example.com',
        title: 'CEO',
        ownerId: 'owner-ceo',
      });
      await repository.save(ceoLead.value);

      const juniorLead = Lead.create({
        email: 'junior@example.com',
        title: 'Junior Developer',
        ownerId: 'owner-junior',
      });
      await repository.save(juniorLead.value);

      const result1 = await useCase.execute({ leadId: ceoLead.value.id.value });
      const result2 = await useCase.execute({ leadId: juniorLead.value.id.value });

      expect(result1.isSuccess).toBe(true);
      expect(result2.isSuccess).toBe(true);
      expect(result1.value.score).toBeGreaterThan(result2.value.score);
    });

    it('should handle VP titles with higher scores', async () => {
      const vpLead = Lead.create({
        email: 'vp@example.com',
        title: 'VP of Sales',
        ownerId: 'owner-vp',
      });
      await repository.save(vpLead.value);

      const result = await useCase.execute({ leadId: vpLead.value.id.value });

      expect(result.isSuccess).toBe(true);
      expect(result.value.score).toBeGreaterThanOrEqual(70);
    });

    it('should handle Director titles with moderate scores', async () => {
      const directorLead = Lead.create({
        email: 'director@example.com',
        title: 'Director of Engineering',
        ownerId: 'owner-dir',
      });
      await repository.save(directorLead.value);

      const result = await useCase.execute({ leadId: directorLead.value.id.value });

      expect(result.isSuccess).toBe(true);
      expect(result.value.score).toBeGreaterThanOrEqual(65);
    });

    it('should rescore a lead that already has a score', async () => {
      const leadResult = Lead.create({
        email: 'rescore@example.com',
        ownerId: 'owner-rescore',
      });
      const lead = leadResult.value;
      await repository.save(lead);

      // First scoring
      const result1 = await useCase.execute({ leadId: lead.id.value });
      expect(result1.isSuccess).toBe(true);
      const firstScore = result1.value.score;

      // Update the lead with better information
      const updatedLead = await repository.findById(lead.id);
      updatedLead!.updateContactInfo({
        company: 'MegaCorp',
        title: 'CEO',
      });
      await repository.save(updatedLead!);

      // Second scoring should be higher
      const result2 = await useCase.execute({ leadId: lead.id.value });
      expect(result2.isSuccess).toBe(true);
      expect(result2.value.score).toBeGreaterThan(firstScore);
    });

    it('should clear domain events after publishing', async () => {
      const leadResult = Lead.create({
        email: 'cleared@example.com',
        ownerId: 'owner-clear',
      });
      const lead = leadResult.value;
      await repository.save(lead);

      const result = await useCase.execute({ leadId: lead.id.value });
      expect(result.isSuccess).toBe(true);

      const updatedLead = await repository.findById(lead.id);
      expect(updatedLead!.getDomainEvents()).toHaveLength(0);
    });

    it('should cap score at 100', async () => {
      // Use higher default score to test capping
      const highScoringAI = new MockAIService(95);
      const highScoreUseCase = new ScoreLeadUseCase(repository, highScoringAI, eventBus);

      const leadResult = Lead.create({
        email: 'maxscore@example.com',
        company: 'Enterprise Corp',
        title: 'CEO',
        ownerId: 'owner-max',
      });
      const lead = leadResult.value;
      await repository.save(lead);

      const result = await highScoreUseCase.execute({ leadId: lead.id.value });

      expect(result.isSuccess).toBe(true);
      expect(result.value.score).toBeLessThanOrEqual(100);
    });

    it('should cap confidence at 1.0', async () => {
      const highScoringAI = new MockAIService(95);
      const highConfidenceUseCase = new ScoreLeadUseCase(repository, highScoringAI, eventBus);

      const leadResult = Lead.create({
        email: 'maxconf@example.com',
        company: 'Enterprise Corp',
        title: 'CEO',
        ownerId: 'owner-maxconf',
      });
      const lead = leadResult.value;
      await repository.save(lead);

      const result = await highConfidenceUseCase.execute({ leadId: lead.id.value });

      expect(result.isSuccess).toBe(true);
      expect(result.value.confidence).toBeLessThanOrEqual(1.0);
    });

    it('should handle empty lead ID gracefully', async () => {
      const input: ScoreLeadInput = {
        leadId: '',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
    });

    it('should not fail if event bus throws but still persist the score', async () => {
      const failingEventBus = new InMemoryEventBus();
      failingEventBus.publishAll = async () => {
        throw new Error('Event bus failure');
      };

      const resilientUseCase = new ScoreLeadUseCase(repository, aiService, failingEventBus);

      const leadResult = Lead.create({
        email: 'resilient@example.com',
        ownerId: 'owner-resilient',
      });
      const lead = leadResult.value;
      await repository.save(lead);

      const result = await resilientUseCase.execute({ leadId: lead.id.value });

      // Operation should still succeed
      expect(result.isSuccess).toBe(true);

      // Score should be persisted
      const updatedLead = await repository.findById(lead.id);
      expect(updatedLead!.score.value).toBeGreaterThan(0);
    });

    it('should update lead updatedAt timestamp', async () => {
      const leadResult = Lead.create({
        email: 'timestamp@example.com',
        ownerId: 'owner-time',
      });
      const lead = leadResult.value;
      const originalUpdatedAt = lead.updatedAt;
      await repository.save(lead);

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await useCase.execute({ leadId: lead.id.value });
      expect(result.isSuccess).toBe(true);

      const updatedLead = await repository.findById(lead.id);
      expect(updatedLead!.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });
});
