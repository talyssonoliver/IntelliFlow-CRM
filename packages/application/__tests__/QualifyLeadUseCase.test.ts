import { describe, it, expect, beforeEach } from 'vitest';
import { QualifyLeadUseCase, QualifyLeadInput } from '../src/usecases/leads/QualifyLeadUseCase';
import { InMemoryLeadRepository } from '../../adapters/src/repositories/InMemoryLeadRepository';
import { InMemoryEventBus } from '../../adapters/src/external/InMemoryEventBus';
import { Lead, LeadQualifiedEvent } from '@intelliflow/domain';

describe('QualifyLeadUseCase', () => {
  let repository: InMemoryLeadRepository;
  let eventBus: InMemoryEventBus;
  let useCase: QualifyLeadUseCase;

  beforeEach(() => {
    repository = new InMemoryLeadRepository();
    eventBus = new InMemoryEventBus();
    useCase = new QualifyLeadUseCase(repository, eventBus);
  });

  describe('execute()', () => {
    it('should qualify a NEW lead successfully', async () => {
      const leadResult = Lead.create({
        email: 'new@example.com',
        ownerId: 'owner-123',
      });
      expect(leadResult.isSuccess).toBe(true);
      const lead = leadResult.value;
      await repository.save(lead);

      const input: QualifyLeadInput = {
        leadId: lead.id.value,
        qualifiedBy: 'sales-rep-1',
        reason: 'High budget and clear need',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      const output = result.value;
      expect(output.leadId).toBe(lead.id.value);
      expect(output.status).toBe('QUALIFIED');
      expect(output.qualifiedBy).toBe('sales-rep-1');
      expect(output.reason).toBe('High budget and clear need');
    });

    it('should qualify a CONTACTED lead successfully', async () => {
      const leadResult = Lead.create({
        email: 'contacted@example.com',
        ownerId: 'owner-456',
      });
      const lead = leadResult.value;

      // Change status to CONTACTED
      lead.changeStatus('CONTACTED', 'sales-rep-1');
      lead.clearDomainEvents(); // Clear events from status change
      await repository.save(lead);

      const input: QualifyLeadInput = {
        leadId: lead.id.value,
        qualifiedBy: 'sales-manager-1',
        reason: 'Positive conversation, ready to proceed',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe('QUALIFIED');
    });

    it('should fail when lead ID is invalid', async () => {
      const input: QualifyLeadInput = {
        leadId: 'invalid-uuid',
        qualifiedBy: 'sales-rep-1',
        reason: 'Some reason',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Invalid');
    });

    it('should fail when lead is not found', async () => {
      const input: QualifyLeadInput = {
        leadId: '00000000-0000-0000-0000-000000000000',
        qualifiedBy: 'sales-rep-1',
        reason: 'Some reason',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('not found');
      expect(result.error.code).toBe('VALIDATION_ERROR');
    });

    it('should fail when lead is already QUALIFIED', async () => {
      const leadResult = Lead.create({
        email: 'alreadyqualified@example.com',
        ownerId: 'owner-789',
      });
      const lead = leadResult.value;

      // Qualify the lead first
      lead.qualify('sales-rep-1', 'Initial qualification');
      lead.clearDomainEvents();
      await repository.save(lead);

      const input: QualifyLeadInput = {
        leadId: lead.id.value,
        qualifiedBy: 'sales-rep-2',
        reason: 'Re-qualification attempt',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('LEAD_CANNOT_BE_QUALIFIED');
      expect(result.error.message).toContain('QUALIFIED');
    });

    it('should fail when lead is already CONVERTED', async () => {
      const leadResult = Lead.create({
        email: 'converted@example.com',
        ownerId: 'owner-999',
      });
      const lead = leadResult.value;

      // Convert the lead
      lead.convert('contact-123', 'account-456', 'sales-rep-1');
      lead.clearDomainEvents();
      await repository.save(lead);

      const input: QualifyLeadInput = {
        leadId: lead.id.value,
        qualifiedBy: 'sales-rep-2',
        reason: 'Trying to qualify converted lead',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('LEAD_ALREADY_CONVERTED');
    });

    it('should fail when lead is UNQUALIFIED', async () => {
      const leadResult = Lead.create({
        email: 'unqualified@example.com',
        ownerId: 'owner-unq',
      });
      const lead = leadResult.value;

      // Change to UNQUALIFIED status
      lead.changeStatus('UNQUALIFIED', 'sales-rep-1');
      lead.clearDomainEvents();
      await repository.save(lead);

      const input: QualifyLeadInput = {
        leadId: lead.id.value,
        qualifiedBy: 'sales-rep-2',
        reason: 'Trying to re-qualify',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('LEAD_CANNOT_BE_QUALIFIED');
    });

    it('should fail when lead is LOST', async () => {
      const leadResult = Lead.create({
        email: 'lost@example.com',
        ownerId: 'owner-lost',
      });
      const lead = leadResult.value;

      // Change to LOST status
      lead.changeStatus('LOST', 'sales-rep-1');
      lead.clearDomainEvents();
      await repository.save(lead);

      const input: QualifyLeadInput = {
        leadId: lead.id.value,
        qualifiedBy: 'sales-rep-2',
        reason: 'Trying to qualify lost lead',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('LEAD_CANNOT_BE_QUALIFIED');
    });

    it('should update lead status in repository', async () => {
      const leadResult = Lead.create({
        email: 'update@example.com',
        ownerId: 'owner-update',
      });
      const lead = leadResult.value;
      await repository.save(lead);

      const input: QualifyLeadInput = {
        leadId: lead.id.value,
        qualifiedBy: 'sales-mgr',
        reason: 'Meets all criteria',
      };

      const result = await useCase.execute(input);
      expect(result.isSuccess).toBe(true);

      const updatedLead = await repository.findById(lead.id);
      expect(updatedLead).not.toBeNull();
      expect(updatedLead!.status).toBe('QUALIFIED');
      expect(updatedLead!.isQualified).toBe(true);
    });

    it('should publish LeadQualifiedEvent', async () => {
      const leadResult = Lead.create({
        email: 'event@example.com',
        ownerId: 'owner-event',
      });
      const lead = leadResult.value;
      lead.clearDomainEvents(); // Clear LeadCreatedEvent before saving
      await repository.save(lead);

      eventBus.clearPublishedEvents();

      const input: QualifyLeadInput = {
        leadId: lead.id.value,
        qualifiedBy: 'sales-rep-event',
        reason: 'Event test qualification',
      };

      const result = await useCase.execute(input);
      expect(result.isSuccess).toBe(true);

      const events = eventBus.getPublishedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(LeadQualifiedEvent);

      const qualifiedEvent = events[0] as LeadQualifiedEvent;
      expect(qualifiedEvent.eventType).toBe('lead.qualified');
      expect(qualifiedEvent.leadId.value).toBe(lead.id.value);
      expect(qualifiedEvent.qualifiedBy).toBe('sales-rep-event');
      expect(qualifiedEvent.reason).toBe('Event test qualification');
    });

    it('should clear domain events after publishing', async () => {
      const leadResult = Lead.create({
        email: 'cleared@example.com',
        ownerId: 'owner-clear',
      });
      const lead = leadResult.value;
      await repository.save(lead);

      const input: QualifyLeadInput = {
        leadId: lead.id.value,
        qualifiedBy: 'sales-rep-clear',
        reason: 'Clear test',
      };

      const result = await useCase.execute(input);
      expect(result.isSuccess).toBe(true);

      const updatedLead = await repository.findById(lead.id);
      expect(updatedLead!.getDomainEvents()).toHaveLength(0);
    });

    it('should handle long qualification reasons', async () => {
      const leadResult = Lead.create({
        email: 'longreason@example.com',
        ownerId: 'owner-long',
      });
      const lead = leadResult.value;
      await repository.save(lead);

      const longReason = 'A'.repeat(1000);

      const input: QualifyLeadInput = {
        leadId: lead.id.value,
        qualifiedBy: 'sales-rep-long',
        reason: longReason,
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.reason).toBe(longReason);
    });

    it('should handle special characters in qualification data', async () => {
      const leadResult = Lead.create({
        email: 'special@example.com',
        ownerId: 'owner-special',
      });
      const lead = leadResult.value;
      await repository.save(lead);

      const input: QualifyLeadInput = {
        leadId: lead.id.value,
        qualifiedBy: "O'Brien-Smith",
        reason: 'Budget: $100,000+ | Timeline: Q1 2025 | Decision maker: Yes',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.qualifiedBy).toBe("O'Brien-Smith");
      expect(result.value.reason).toContain('$100,000+');
    });

    it('should not fail if event bus throws but still persist the qualification', async () => {
      const failingEventBus = new InMemoryEventBus();
      failingEventBus.publishAll = async () => {
        throw new Error('Event bus failure');
      };

      const resilientUseCase = new QualifyLeadUseCase(repository, failingEventBus);

      const leadResult = Lead.create({
        email: 'resilient@example.com',
        ownerId: 'owner-resilient',
      });
      const lead = leadResult.value;
      await repository.save(lead);

      const input: QualifyLeadInput = {
        leadId: lead.id.value,
        qualifiedBy: 'sales-rep-resilient',
        reason: 'Resilience test',
      };

      const result = await resilientUseCase.execute(input);

      // Operation should still succeed
      expect(result.isSuccess).toBe(true);

      // Status should be updated
      const updatedLead = await repository.findById(lead.id);
      expect(updatedLead!.status).toBe('QUALIFIED');
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

      const input: QualifyLeadInput = {
        leadId: lead.id.value,
        qualifiedBy: 'sales-rep-time',
        reason: 'Timestamp test',
      };

      const result = await useCase.execute(input);
      expect(result.isSuccess).toBe(true);

      const updatedLead = await repository.findById(lead.id);
      expect(updatedLead!.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });

    it('should handle empty lead ID gracefully', async () => {
      const input: QualifyLeadInput = {
        leadId: '',
        qualifiedBy: 'sales-rep-1',
        reason: 'Some reason',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
    });

    it('should qualify multiple leads independently', async () => {
      const leads = await Promise.all([
        Lead.create({ email: 'lead1@example.com', ownerId: 'owner-1' }),
        Lead.create({ email: 'lead2@example.com', ownerId: 'owner-1' }),
        Lead.create({ email: 'lead3@example.com', ownerId: 'owner-2' }),
      ]);

      for (const leadResult of leads) {
        await repository.save(leadResult.value);
      }

      const results = await Promise.all(
        leads.map((leadResult, index) =>
          useCase.execute({
            leadId: leadResult.value.id.value,
            qualifiedBy: `sales-rep-${index}`,
            reason: `Qualification reason ${index}`,
          })
        )
      );

      results.forEach((result) => {
        expect(result.isSuccess).toBe(true);
        expect(result.value.status).toBe('QUALIFIED');
      });

      const qualifiedLeads = await repository.findByStatus('QUALIFIED');
      expect(qualifiedLeads).toHaveLength(3);
    });
  });
});
