import { describe, it, expect, beforeEach } from 'vitest';
import { CreateLeadUseCase, CreateLeadInput } from '../src/usecases/leads/CreateLeadUseCase';
import { InMemoryLeadRepository } from '../../adapters/src/repositories/InMemoryLeadRepository';
import { InMemoryEventBus } from '../../adapters/src/external/InMemoryEventBus';
import { LeadCreatedEvent } from '@intelliflow/domain';

describe('CreateLeadUseCase', () => {
  let repository: InMemoryLeadRepository;
  let eventBus: InMemoryEventBus;
  let useCase: CreateLeadUseCase;

  beforeEach(() => {
    repository = new InMemoryLeadRepository();
    eventBus = new InMemoryEventBus();
    useCase = new CreateLeadUseCase(repository, eventBus);
  });

  describe('execute()', () => {
    it('should create a lead with valid input', async () => {
      const input: CreateLeadInput = {
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        company: 'Example Corp',
        title: 'CTO',
        phone: '+1234567890',
        source: 'WEBSITE',
        ownerId: 'owner-123',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      const output = result.value;
      expect(output.email).toBe('john.doe@example.com');
      expect(output.firstName).toBe('John');
      expect(output.lastName).toBe('Doe');
      expect(output.company).toBe('Example Corp');
      expect(output.title).toBe('CTO');
      expect(output.phone).toBe('+1234567890');
      expect(output.source).toBe('WEBSITE');
      expect(output.status).toBe('NEW');
      expect(output.ownerId).toBe('owner-123');
      expect(output.id).toBeDefined();
      expect(output.createdAt).toBeInstanceOf(Date);
    });

    it('should create a lead with minimal input (email and ownerId only)', async () => {
      const input: CreateLeadInput = {
        email: 'minimal@example.com',
        ownerId: 'owner-456',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      const output = result.value;
      expect(output.email).toBe('minimal@example.com');
      expect(output.firstName).toBeUndefined();
      expect(output.lastName).toBeUndefined();
      expect(output.company).toBeUndefined();
      expect(output.source).toBe('WEBSITE'); // Default source
      expect(output.status).toBe('NEW');
      expect(output.ownerId).toBe('owner-456');
    });

    it('should fail when email is invalid', async () => {
      const input: CreateLeadInput = {
        email: 'invalid-email',
        ownerId: 'owner-123',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('email');
    });

    it('should fail when email is empty', async () => {
      const input: CreateLeadInput = {
        email: '',
        ownerId: 'owner-123',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
    });

    it('should persist lead to repository', async () => {
      const input: CreateLeadInput = {
        email: 'persisted@example.com',
        firstName: 'Jane',
        ownerId: 'owner-789',
      };

      const result = await useCase.execute(input);
      expect(result.isSuccess).toBe(true);

      const leadId = result.value.id;
      const savedLeads = repository.getAll();
      expect(savedLeads).toHaveLength(1);
      expect(savedLeads[0].id.value).toBe(leadId);
      expect(savedLeads[0].email.value).toBe('persisted@example.com');
      expect(savedLeads[0].firstName).toBe('Jane');
    });

    it('should publish LeadCreatedEvent', async () => {
      const input: CreateLeadInput = {
        email: 'event@example.com',
        company: 'Event Corp',
        source: 'REFERRAL',
        ownerId: 'owner-999',
      };

      eventBus.clearPublishedEvents();
      const result = await useCase.execute(input);
      expect(result.isSuccess).toBe(true);

      const events = eventBus.getPublishedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(LeadCreatedEvent);

      const leadCreatedEvent = events[0] as LeadCreatedEvent;
      expect(leadCreatedEvent.eventType).toBe('lead.created');
      expect(leadCreatedEvent.leadId.value).toBe(result.value.id);
    });

    it('should set default source to WEBSITE when not provided', async () => {
      const input: CreateLeadInput = {
        email: 'default-source@example.com',
        ownerId: 'owner-111',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.source).toBe('WEBSITE');
    });

    it('should handle all valid lead sources', async () => {
      const sources = ['WEBSITE', 'REFERRAL', 'SOCIAL', 'EMAIL', 'COLD_CALL', 'EVENT', 'OTHER'];

      for (const source of sources) {
        repository.clear();
        eventBus.clearPublishedEvents();

        const input: CreateLeadInput = {
          email: `${source.toLowerCase()}@example.com`,
          source: source,
          ownerId: 'owner-multi',
        };

        const result = await useCase.execute(input);
        expect(result.isSuccess).toBe(true);
        expect(result.value.source).toBe(source);
      }
    });

    it('should create multiple leads independently', async () => {
      const inputs: CreateLeadInput[] = [
        { email: 'lead1@example.com', ownerId: 'owner-1' },
        { email: 'lead2@example.com', ownerId: 'owner-1' },
        { email: 'lead3@example.com', ownerId: 'owner-2' },
      ];

      const results = await Promise.all(inputs.map((input) => useCase.execute(input)));

      results.forEach((result) => {
        expect(result.isSuccess).toBe(true);
      });

      const savedLeads = repository.getAll();
      expect(savedLeads).toHaveLength(3);
      expect(new Set(savedLeads.map((l) => l.id.value)).size).toBe(3); // All unique IDs
    });

    it('should initialize lead with zero score', async () => {
      const input: CreateLeadInput = {
        email: 'zero-score@example.com',
        ownerId: 'owner-score',
      };

      const result = await useCase.execute(input);
      expect(result.isSuccess).toBe(true);

      const savedLeads = repository.getAll();
      expect(savedLeads[0].score.value).toBe(0);
      expect(savedLeads[0].score.confidence).toBe(1); // LeadScore.zero() has confidence of 1
    });

    it('should clear domain events after publishing', async () => {
      const input: CreateLeadInput = {
        email: 'cleared@example.com',
        ownerId: 'owner-clear',
      };

      const result = await useCase.execute(input);
      expect(result.isSuccess).toBe(true);

      const savedLeads = repository.getAll();
      const domainEvents = savedLeads[0].getDomainEvents();
      expect(domainEvents).toHaveLength(0);
    });

    it('should handle special characters in names', async () => {
      const input: CreateLeadInput = {
        email: 'special@example.com',
        firstName: "O'Brien",
        lastName: 'Smith-Jones',
        company: 'Acme & Co.',
        ownerId: 'owner-special',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.firstName).toBe("O'Brien");
      expect(result.value.lastName).toBe('Smith-Jones');
      expect(result.value.company).toBe('Acme & Co.');
    });

    it('should handle international phone numbers', async () => {
      const input: CreateLeadInput = {
        email: 'intl@example.com',
        phone: '+44 20 7946 0958',
        ownerId: 'owner-intl',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.phone).toBe('+44 20 7946 0958');
    });

    it('should not fail if event bus throws but still persist the lead', async () => {
      // Create a failing event bus
      const failingEventBus = new InMemoryEventBus();
      const originalPublish = failingEventBus.publishAll.bind(failingEventBus);
      failingEventBus.publishAll = async () => {
        throw new Error('Event bus failure');
      };

      const failingUseCase = new CreateLeadUseCase(repository, failingEventBus);

      const input: CreateLeadInput = {
        email: 'resilient@example.com',
        ownerId: 'owner-resilient',
      };

      const result = await failingUseCase.execute(input);

      // Operation should still succeed
      expect(result.isSuccess).toBe(true);

      // Lead should be persisted
      const savedLeads = repository.getAll();
      expect(savedLeads).toHaveLength(1);
      expect(savedLeads[0].email.value).toBe('resilient@example.com');
    });
  });
});
