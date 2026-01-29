import { describe, it, expect, beforeEach } from 'vitest';
import { LeadService } from '../../../src/services/LeadService';
import { ContactService } from '../../../src/services/ContactService';
import { AccountService } from '../../../src/services/AccountService';
import { OpportunityService } from '../../../src/services/OpportunityService';
import { TaskService } from '../../../src/services/TaskService';
import { InMemoryLeadRepository } from '../../../../adapters/src/repositories/InMemoryLeadRepository';
import { InMemoryContactRepository } from '../../../../adapters/src/repositories/InMemoryContactRepository';
import { InMemoryAccountRepository } from '../../../../adapters/src/repositories/InMemoryAccountRepository';
import { InMemoryOpportunityRepository } from '../../../../adapters/src/repositories/InMemoryOpportunityRepository';
import { InMemoryTaskRepository } from '../../../../adapters/src/repositories/InMemoryTaskRepository';
import { InMemoryEventBus } from '../../../../adapters/src/external/InMemoryEventBus';
import { MockAIService } from '../../../../adapters/src/external/MockAIService';

/**
 * Integration tests for domain services
 * Tests the interaction between multiple services in realistic scenarios
 */
describe('Domain Services Integration', () => {
  let leadRepository: InMemoryLeadRepository;
  let contactRepository: InMemoryContactRepository;
  let accountRepository: InMemoryAccountRepository;
  let opportunityRepository: InMemoryOpportunityRepository;
  let taskRepository: InMemoryTaskRepository;
  let eventBus: InMemoryEventBus;
  let aiService: MockAIService;

  let leadService: LeadService;
  let contactService: ContactService;
  let accountService: AccountService;
  let opportunityService: OpportunityService;
  let taskService: TaskService;

  beforeEach(() => {
    leadRepository = new InMemoryLeadRepository();
    contactRepository = new InMemoryContactRepository();
    accountRepository = new InMemoryAccountRepository();
    opportunityRepository = new InMemoryOpportunityRepository();
    taskRepository = new InMemoryTaskRepository();
    eventBus = new InMemoryEventBus();
    aiService = new MockAIService(75); // High score for auto-qualification

    leadService = new LeadService(
      leadRepository,
      contactRepository,
      accountRepository,
      aiService,
      eventBus
    );

    contactService = new ContactService(contactRepository, accountRepository, eventBus);

    accountService = new AccountService(
      accountRepository,
      contactRepository,
      opportunityRepository,
      eventBus
    );

    opportunityService = new OpportunityService(
      opportunityRepository,
      accountRepository,
      contactRepository,
      eventBus
    );

    taskService = new TaskService(
      taskRepository,
      leadRepository,
      contactRepository,
      opportunityRepository,
      eventBus
    );
  });

  describe('Full Sales Cycle Integration', () => {
    it('should complete a full lead-to-opportunity cycle', async () => {
      // Step 1: Create a lead
      const leadResult = await leadService.createLead({
        email: 'prospect@techcorp.com',
        firstName: 'Alice',
        lastName: 'Johnson',
        company: 'TechCorp',
        title: 'CTO',
        ownerId: 'sales-rep-1',
      });
      expect(leadResult.isSuccess).toBe(true);
      const lead = leadResult.value;

      // Step 2: Score the lead (should auto-qualify with high score)
      const scoreResult = await leadService.scoreLead(lead.id.value);
      expect(scoreResult.isSuccess).toBe(true);
      expect(scoreResult.value.autoQualified).toBe(true);

      // Step 3: Create a task for the lead
      const taskResult = await taskService.createTask({
        title: 'Initial call with Alice',
        description: 'Discuss their needs',
        leadId: lead.id.value,
        ownerId: 'sales-rep-1',
        priority: 'HIGH',
      });
      expect(taskResult.isSuccess).toBe(true);

      // Step 4: Complete the task
      const completeTaskResult = await taskService.completeTask(
        taskResult.value.id.value,
        'sales-rep-1'
      );
      expect(completeTaskResult.isSuccess).toBe(true);

      // Step 5: Convert the lead to contact with new account
      const convertResult = await leadService.convertLead(
        lead.id.value,
        'TechCorp Inc',
        'sales-rep-1'
      );
      expect(convertResult.isSuccess).toBe(true);
      expect(convertResult.value.contactId).toBeDefined();
      expect(convertResult.value.accountId).not.toBeNull();

      // Step 6: Create an opportunity for the account
      const oppResult = await opportunityService.createOpportunity({
        name: 'TechCorp Enterprise Deal',
        value: 150000,
        accountId: convertResult.value.accountId!,
        contactId: convertResult.value.contactId,
        ownerId: 'sales-rep-1',
      });
      expect(oppResult.isSuccess).toBe(true);

      // Step 7: Create a task for the opportunity
      const oppTaskResult = await taskService.createTask({
        title: 'Send proposal to TechCorp',
        opportunityId: oppResult.value.id.value,
        ownerId: 'sales-rep-1',
        priority: 'URGENT',
      });
      expect(oppTaskResult.isSuccess).toBe(true);

      // Step 8: Progress the opportunity through stages
      await opportunityService.advanceStage(oppResult.value.id.value, 'sales-rep-1'); // QUALIFICATION
      await opportunityService.advanceStage(oppResult.value.id.value, 'sales-rep-1'); // NEEDS_ANALYSIS
      await opportunityService.advanceStage(oppResult.value.id.value, 'sales-rep-1'); // PROPOSAL
      await opportunityService.advanceStage(oppResult.value.id.value, 'sales-rep-1'); // NEGOTIATION

      // Step 9: Complete the opportunity task
      await taskService.completeTask(oppTaskResult.value.id.value, 'sales-rep-1');

      // Step 10: Win the deal
      const winResult = await opportunityService.markAsWon(oppResult.value.id.value, 'sales-rep-1');
      expect(winResult.isSuccess).toBe(true);
      expect(winResult.value.isWon).toBe(true);

      // Verify final state
      const account = await accountRepository.findByName('TechCorp Inc');
      expect(account).toHaveLength(1);

      const contact = await contactRepository.findByLeadId(lead.id.value);
      expect(contact).not.toBeNull();

      const wonOpp = await opportunityRepository.findById(oppResult.value.id);
      expect(wonOpp?.stage).toBe('CLOSED_WON');
      expect(wonOpp?.probability.value).toBe(100);
    });

    it('should handle account with multiple contacts and opportunities', async () => {
      // Create account
      const accountResult = await accountService.createAccount({
        name: 'MegaCorp',
        industry: 'Technology',
        revenue: 5000000, // 5M = MID_MARKET tier (< 10M ENTERPRISE threshold)
        ownerId: 'sales-rep-1',
      });
      expect(accountResult.isSuccess).toBe(true);
      const account = accountResult.value;

      // Create multiple contacts
      const contact1 = await contactService.createContact({
        email: 'ceo@megacorp.com',
        firstName: 'John',
        lastName: 'CEO',
        accountId: account.id.value,
        ownerId: 'sales-rep-1',
      });
      expect(contact1.isSuccess).toBe(true);

      const contact2 = await contactService.createContact({
        email: 'cto@megacorp.com',
        firstName: 'Jane',
        lastName: 'CTO',
        accountId: account.id.value,
        ownerId: 'sales-rep-1',
      });
      expect(contact2.isSuccess).toBe(true);

      // Create multiple opportunities
      const opp1 = await opportunityService.createOpportunity({
        name: 'MegaCorp Phase 1',
        value: 100000,
        accountId: account.id.value,
        contactId: contact1.value.id.value,
        ownerId: 'sales-rep-1',
      });
      expect(opp1.isSuccess).toBe(true);

      const opp2 = await opportunityService.createOpportunity({
        name: 'MegaCorp Phase 2',
        value: 200000,
        accountId: account.id.value,
        contactId: contact2.value.id.value,
        ownerId: 'sales-rep-1',
      });
      expect(opp2.isSuccess).toBe(true);

      // Verify account context
      const contextResult = await accountService.getAccountWithContext(account.id.value);
      expect(contextResult.isSuccess).toBe(true);
      expect(contextResult.value.contacts).toBe(2);
      expect(contextResult.value.opportunities.total).toBe(2);
      expect(contextResult.value.opportunities.totalValue).toBe(300000);
      expect(contextResult.value.tier).toBe('MID_MARKET');

      // Verify pipeline forecast
      const forecast = await opportunityService.getPipelineForecast('sales-rep-1');
      expect(forecast.totalPipelineValue).toBe(300000);
    });

    it('should handle task assignments across entity types', async () => {
      // Create a lead
      const leadResult = await leadService.createLead({
        email: 'tasktest@example.com',
        ownerId: 'owner-1',
      });
      expect(leadResult.isSuccess).toBe(true);

      // Create task for lead
      const leadTaskResult = await taskService.createTask({
        title: 'Lead Task',
        leadId: leadResult.value.id.value,
        ownerId: 'owner-1',
      });
      expect(leadTaskResult.isSuccess).toBe(true);

      // Score and convert the lead
      await leadService.scoreLead(leadResult.value.id.value);
      const convertResult = await leadService.convertLead(
        leadResult.value.id.value,
        'Task Test Corp',
        'owner-1'
      );
      expect(convertResult.isSuccess).toBe(true);

      // Try to create new task for converted lead (should fail)
      const failedTaskResult = await taskService.createTask({
        title: 'Post-conversion lead task',
        leadId: leadResult.value.id.value,
        ownerId: 'owner-1',
      });
      expect(failedTaskResult.isFailure).toBe(true);

      // Create task for the contact instead
      const contactTaskResult = await taskService.createTask({
        title: 'Contact Task',
        contactId: convertResult.value.contactId,
        ownerId: 'owner-1',
      });
      expect(contactTaskResult.isSuccess).toBe(true);

      // Verify task statistics
      const stats = await taskService.getCompletionStatistics('owner-1');
      expect(stats.total).toBe(2); // Lead task + Contact task
      expect(stats.pending).toBe(2);
    });
  });

  describe('Event Publishing Integration', () => {
    it('should publish events across the full sales cycle', async () => {
      eventBus.clearPublishedEvents();

      // Create lead and score
      const leadResult = await leadService.createLead({
        email: 'events@test.com',
        company: 'EventCorp',
        title: 'CEO',
        ownerId: 'owner-1',
      });
      await leadService.scoreLead(leadResult.value.id.value);

      // Convert lead
      await leadService.convertLead(leadResult.value.id.value, 'EventCorp', 'owner-1');

      const events = eventBus.getPublishedEvents();

      // Should have multiple events from the cycle
      expect(events.length).toBeGreaterThan(3);

      // Verify event types
      const eventTypes = events.map((e) => e.eventType);
      expect(eventTypes).toContain('lead.created');
      expect(eventTypes).toContain('lead.scored');
      // Auto-qualified due to high score
      expect(eventTypes).toContain('lead.qualified');
      expect(eventTypes).toContain('lead.converted');
      expect(eventTypes).toContain('contact.created');
      expect(eventTypes).toContain('account.created');
    });
  });

  describe('Business Rule Enforcement Integration', () => {
    it('should enforce cross-service business rules', async () => {
      // Create account with contacts and opportunity
      const accountResult = await accountService.createAccount({
        name: 'RulesTest Corp',
        ownerId: 'owner-1',
      });
      const account = accountResult.value;

      await contactService.createContact({
        email: 'rules@test.com',
        firstName: 'Test',
        lastName: 'User',
        accountId: account.id.value,
        ownerId: 'owner-1',
      });

      await opportunityService.createOpportunity({
        name: 'Rules Test Opp',
        value: 50000,
        accountId: account.id.value,
        ownerId: 'owner-1',
      });

      // Try to delete account (should fail - has contacts)
      const deleteResult = await accountService.deleteAccount(account.id.value);
      expect(deleteResult.isFailure).toBe(true);
      expect(deleteResult.error.message).toContain('associated contacts');
    });

    it('should enforce opportunity stage transition rules', async () => {
      const accountResult = await accountService.createAccount({
        name: 'Stage Rules Corp',
        ownerId: 'owner-1',
      });

      const oppResult = await opportunityService.createOpportunity({
        name: 'Stage Rules Opp',
        value: 50000,
        accountId: accountResult.value.id.value,
        ownerId: 'owner-1',
      });

      // Try to jump stages (should fail)
      const jumpResult = await opportunityService.changeStage(
        oppResult.value.id.value,
        'NEGOTIATION', // Can't jump from PROSPECTING to NEGOTIATION
        'owner-1'
      );
      expect(jumpResult.isFailure).toBe(true);

      // Try to win before reaching NEGOTIATION (should fail)
      const prematureWinResult = await opportunityService.markAsWon(
        oppResult.value.id.value,
        'owner-1'
      );
      expect(prematureWinResult.isFailure).toBe(true);
    });
  });
});
