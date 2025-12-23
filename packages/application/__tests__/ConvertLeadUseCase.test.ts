import { describe, it, expect, beforeEach } from 'vitest';
import { ConvertLeadUseCase, ConvertLeadInput } from '../src/usecases/leads/ConvertLeadUseCase';
import { InMemoryLeadRepository } from '../../adapters/src/repositories/InMemoryLeadRepository';
import { InMemoryEventBus } from '../../adapters/src/external/InMemoryEventBus';
import { Lead, LeadConvertedEvent } from '@intelliflow/domain';

describe('ConvertLeadUseCase', () => {
  let repository: InMemoryLeadRepository;
  let eventBus: InMemoryEventBus;
  let useCase: ConvertLeadUseCase;

  beforeEach(() => {
    repository = new InMemoryLeadRepository();
    eventBus = new InMemoryEventBus();
    useCase = new ConvertLeadUseCase(repository, eventBus);
  });

  describe('execute()', () => {
    it('should convert a lead with contact and account', async () => {
      const leadResult = Lead.create({
        email: 'convert@example.com',
        firstName: 'John',
        lastName: 'Doe',
        ownerId: 'owner-123',
      });
      expect(leadResult.isSuccess).toBe(true);
      const lead = leadResult.value;
      await repository.save(lead);

      const input: ConvertLeadInput = {
        leadId: lead.id.value,
        contactId: 'contact-456',
        accountId: 'account-789',
        convertedBy: 'sales-rep-1',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      const output = result.value;
      expect(output.leadId).toBe(lead.id.value);
      expect(output.contactId).toBe('contact-456');
      expect(output.accountId).toBe('account-789');
      expect(output.status).toBe('CONVERTED');
      expect(output.convertedBy).toBe('sales-rep-1');
    });

    it('should convert a lead with contact only (no account)', async () => {
      const leadResult = Lead.create({
        email: 'noaccnt@example.com',
        ownerId: 'owner-456',
      });
      const lead = leadResult.value;
      await repository.save(lead);

      const input: ConvertLeadInput = {
        leadId: lead.id.value,
        contactId: 'contact-999',
        accountId: null,
        convertedBy: 'sales-rep-2',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.contactId).toBe('contact-999');
      expect(result.value.accountId).toBeNull();
      expect(result.value.status).toBe('CONVERTED');
    });

    it('should fail when lead ID is invalid', async () => {
      const input: ConvertLeadInput = {
        leadId: 'invalid-uuid',
        contactId: 'contact-123',
        accountId: null,
        convertedBy: 'sales-rep-1',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Invalid');
    });

    it('should fail when lead is not found', async () => {
      const input: ConvertLeadInput = {
        leadId: '00000000-0000-0000-0000-000000000000',
        contactId: 'contact-123',
        accountId: null,
        convertedBy: 'sales-rep-1',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('not found');
      expect(result.error.code).toBe('VALIDATION_ERROR');
    });

    it('should fail when lead is already CONVERTED', async () => {
      const leadResult = Lead.create({
        email: 'alreadyconverted@example.com',
        ownerId: 'owner-789',
      });
      const lead = leadResult.value;

      // Convert the lead first
      lead.convert('contact-111', 'account-222', 'sales-rep-1');
      lead.clearDomainEvents();
      await repository.save(lead);

      const input: ConvertLeadInput = {
        leadId: lead.id.value,
        contactId: 'contact-333',
        accountId: 'account-444',
        convertedBy: 'sales-rep-2',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('LEAD_ALREADY_CONVERTED');
      expect(result.error.message).toContain('already been converted');
    });

    it('should convert a NEW lead', async () => {
      const leadResult = Lead.create({
        email: 'newlead@example.com',
        ownerId: 'owner-new',
      });
      const lead = leadResult.value;
      await repository.save(lead);

      const input: ConvertLeadInput = {
        leadId: lead.id.value,
        contactId: 'contact-new',
        accountId: 'account-new',
        convertedBy: 'sales-new',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe('CONVERTED');
    });

    it('should convert a CONTACTED lead', async () => {
      const leadResult = Lead.create({
        email: 'contacted@example.com',
        ownerId: 'owner-contacted',
      });
      const lead = leadResult.value;
      lead.changeStatus('CONTACTED', 'sales-rep-1');
      lead.clearDomainEvents();
      await repository.save(lead);

      const input: ConvertLeadInput = {
        leadId: lead.id.value,
        contactId: 'contact-contacted',
        accountId: null,
        convertedBy: 'sales-contacted',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe('CONVERTED');
    });

    it('should convert a QUALIFIED lead', async () => {
      const leadResult = Lead.create({
        email: 'qualified@example.com',
        ownerId: 'owner-qual',
      });
      const lead = leadResult.value;
      lead.qualify('sales-rep-1', 'Good fit');
      lead.clearDomainEvents();
      await repository.save(lead);

      const input: ConvertLeadInput = {
        leadId: lead.id.value,
        contactId: 'contact-qual',
        accountId: 'account-qual',
        convertedBy: 'sales-qual',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe('CONVERTED');
    });

    it('should convert an UNQUALIFIED lead', async () => {
      const leadResult = Lead.create({
        email: 'unqualified@example.com',
        ownerId: 'owner-unq',
      });
      const lead = leadResult.value;
      lead.changeStatus('UNQUALIFIED', 'sales-rep-1');
      lead.clearDomainEvents();
      await repository.save(lead);

      const input: ConvertLeadInput = {
        leadId: lead.id.value,
        contactId: 'contact-unq',
        accountId: null,
        convertedBy: 'sales-unq',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe('CONVERTED');
    });

    it('should convert a LOST lead', async () => {
      const leadResult = Lead.create({
        email: 'lost@example.com',
        ownerId: 'owner-lost',
      });
      const lead = leadResult.value;
      lead.changeStatus('LOST', 'sales-rep-1');
      lead.clearDomainEvents();
      await repository.save(lead);

      const input: ConvertLeadInput = {
        leadId: lead.id.value,
        contactId: 'contact-lost',
        accountId: null,
        convertedBy: 'sales-lost',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe('CONVERTED');
    });

    it('should update lead status in repository', async () => {
      const leadResult = Lead.create({
        email: 'update@example.com',
        ownerId: 'owner-update',
      });
      const lead = leadResult.value;
      await repository.save(lead);

      const input: ConvertLeadInput = {
        leadId: lead.id.value,
        contactId: 'contact-update',
        accountId: 'account-update',
        convertedBy: 'sales-update',
      };

      const result = await useCase.execute(input);
      expect(result.isSuccess).toBe(true);

      const updatedLead = await repository.findById(lead.id);
      expect(updatedLead).not.toBeNull();
      expect(updatedLead!.status).toBe('CONVERTED');
      expect(updatedLead!.isConverted).toBe(true);
    });

    it('should publish LeadConvertedEvent', async () => {
      const leadResult = Lead.create({
        email: 'event@example.com',
        ownerId: 'owner-event',
      });
      const lead = leadResult.value;
      lead.clearDomainEvents(); // Clear LeadCreatedEvent before saving
      await repository.save(lead);

      eventBus.clearPublishedEvents();

      const input: ConvertLeadInput = {
        leadId: lead.id.value,
        contactId: 'contact-event',
        accountId: 'account-event',
        convertedBy: 'sales-event',
      };

      const result = await useCase.execute(input);
      expect(result.isSuccess).toBe(true);

      const events = eventBus.getPublishedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(LeadConvertedEvent);

      const convertedEvent = events[0] as LeadConvertedEvent;
      expect(convertedEvent.eventType).toBe('lead.converted');
      expect(convertedEvent.leadId.value).toBe(lead.id.value);
      expect(convertedEvent.contactId).toBe('contact-event');
      expect(convertedEvent.accountId).toBe('account-event');
      expect(convertedEvent.convertedBy).toBe('sales-event');
    });

    it('should publish event with null accountId when no account provided', async () => {
      const leadResult = Lead.create({
        email: 'nullaccount@example.com',
        ownerId: 'owner-null',
      });
      const lead = leadResult.value;
      lead.clearDomainEvents(); // Clear LeadCreatedEvent before saving
      await repository.save(lead);

      eventBus.clearPublishedEvents();

      const input: ConvertLeadInput = {
        leadId: lead.id.value,
        contactId: 'contact-null',
        accountId: null,
        convertedBy: 'sales-null',
      };

      const result = await useCase.execute(input);
      expect(result.isSuccess).toBe(true);

      const events = eventBus.getPublishedEvents();
      expect(events).toHaveLength(1);
      const convertedEvent = events[0] as LeadConvertedEvent;
      expect(convertedEvent.accountId).toBeNull();
    });

    it('should clear domain events after publishing', async () => {
      const leadResult = Lead.create({
        email: 'cleared@example.com',
        ownerId: 'owner-clear',
      });
      const lead = leadResult.value;
      await repository.save(lead);

      const input: ConvertLeadInput = {
        leadId: lead.id.value,
        contactId: 'contact-clear',
        accountId: null,
        convertedBy: 'sales-clear',
      };

      const result = await useCase.execute(input);
      expect(result.isSuccess).toBe(true);

      const updatedLead = await repository.findById(lead.id);
      expect(updatedLead!.getDomainEvents()).toHaveLength(0);
    });

    it('should handle special characters in IDs', async () => {
      const leadResult = Lead.create({
        email: 'special@example.com',
        ownerId: 'owner-special',
      });
      const lead = leadResult.value;
      await repository.save(lead);

      const input: ConvertLeadInput = {
        leadId: lead.id.value,
        contactId: 'contact-123-abc',
        accountId: 'account-456-def',
        convertedBy: "O'Brien-Smith",
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.contactId).toBe('contact-123-abc');
      expect(result.value.accountId).toBe('account-456-def');
      expect(result.value.convertedBy).toBe("O'Brien-Smith");
    });

    it('should not fail if event bus throws but still persist the conversion', async () => {
      const failingEventBus = new InMemoryEventBus();
      failingEventBus.publishAll = async () => {
        throw new Error('Event bus failure');
      };

      const resilientUseCase = new ConvertLeadUseCase(repository, failingEventBus);

      const leadResult = Lead.create({
        email: 'resilient@example.com',
        ownerId: 'owner-resilient',
      });
      const lead = leadResult.value;
      await repository.save(lead);

      const input: ConvertLeadInput = {
        leadId: lead.id.value,
        contactId: 'contact-resilient',
        accountId: null,
        convertedBy: 'sales-resilient',
      };

      const result = await resilientUseCase.execute(input);

      // Operation should still succeed
      expect(result.isSuccess).toBe(true);

      // Status should be updated
      const updatedLead = await repository.findById(lead.id);
      expect(updatedLead!.status).toBe('CONVERTED');
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

      const input: ConvertLeadInput = {
        leadId: lead.id.value,
        contactId: 'contact-time',
        accountId: null,
        convertedBy: 'sales-time',
      };

      const result = await useCase.execute(input);
      expect(result.isSuccess).toBe(true);

      const updatedLead = await repository.findById(lead.id);
      expect(updatedLead!.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });

    it('should handle empty lead ID gracefully', async () => {
      const input: ConvertLeadInput = {
        leadId: '',
        contactId: 'contact-123',
        accountId: null,
        convertedBy: 'sales-rep-1',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
    });

    it('should convert multiple leads independently', async () => {
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
            contactId: `contact-${index}`,
            accountId: index % 2 === 0 ? `account-${index}` : null,
            convertedBy: `sales-rep-${index}`,
          })
        )
      );

      results.forEach((result) => {
        expect(result.isSuccess).toBe(true);
        expect(result.value.status).toBe('CONVERTED');
      });

      const convertedLeads = await repository.findByStatus('CONVERTED');
      expect(convertedLeads).toHaveLength(3);
    });

    it('should not allow converting same lead twice', async () => {
      const leadResult = Lead.create({
        email: 'once@example.com',
        ownerId: 'owner-once',
      });
      const lead = leadResult.value;
      await repository.save(lead);

      const input1: ConvertLeadInput = {
        leadId: lead.id.value,
        contactId: 'contact-first',
        accountId: 'account-first',
        convertedBy: 'sales-first',
      };

      const result1 = await useCase.execute(input1);
      expect(result1.isSuccess).toBe(true);

      // Try to convert again
      const input2: ConvertLeadInput = {
        leadId: lead.id.value,
        contactId: 'contact-second',
        accountId: 'account-second',
        convertedBy: 'sales-second',
      };

      const result2 = await useCase.execute(input2);
      expect(result2.isFailure).toBe(true);
      expect(result2.error.code).toBe('LEAD_ALREADY_CONVERTED');
    });
  });
});
