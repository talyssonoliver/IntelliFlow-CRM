import { describe, it, expect, beforeEach } from 'vitest';
import { TaskService } from '../../src/services/TaskService';
import { InMemoryTaskRepository } from '../../../adapters/src/repositories/InMemoryTaskRepository';
import { InMemoryLeadRepository } from '../../../adapters/src/repositories/InMemoryLeadRepository';
import { InMemoryContactRepository } from '../../../adapters/src/repositories/InMemoryContactRepository';
import { InMemoryOpportunityRepository } from '../../../adapters/src/repositories/InMemoryOpportunityRepository';
import { InMemoryAccountRepository } from '../../../adapters/src/repositories/InMemoryAccountRepository';
import { InMemoryEventBus } from '../../../adapters/src/external/InMemoryEventBus';
import {
  Task,
  Lead,
  Contact,
  Opportunity,
  Account,
  TaskCreatedEvent,
  TaskCompletedEvent,
  TaskCancelledEvent,
} from '@intelliflow/domain';

describe('TaskService', () => {
  let taskRepository: InMemoryTaskRepository;
  let leadRepository: InMemoryLeadRepository;
  let contactRepository: InMemoryContactRepository;
  let opportunityRepository: InMemoryOpportunityRepository;
  let accountRepository: InMemoryAccountRepository;
  let eventBus: InMemoryEventBus;
  let service: TaskService;

  let testLead: Lead;
  let testContact: Contact;
  let testAccount: Account;
  let testOpportunity: Opportunity;

  beforeEach(async () => {
    taskRepository = new InMemoryTaskRepository();
    leadRepository = new InMemoryLeadRepository();
    contactRepository = new InMemoryContactRepository();
    opportunityRepository = new InMemoryOpportunityRepository();
    accountRepository = new InMemoryAccountRepository();
    eventBus = new InMemoryEventBus();

    service = new TaskService(
      taskRepository,
      leadRepository,
      contactRepository,
      opportunityRepository,
      eventBus
    );

    // Create test entities
    testLead = Lead.create({
      email: 'lead@example.com',
      firstName: 'Lead',
      lastName: 'Test',
      ownerId: 'owner-1',
    }).value;
    await leadRepository.save(testLead);

    testAccount = Account.create({
      name: 'Test Account',
      ownerId: 'owner-1',
    }).value;
    await accountRepository.save(testAccount);

    testContact = Contact.create({
      email: 'contact@example.com',
      firstName: 'Contact',
      lastName: 'Test',
      accountId: testAccount.id.value,
      ownerId: 'owner-1',
    }).value;
    await contactRepository.save(testContact);

    testOpportunity = Opportunity.create({
      name: 'Test Opportunity',
      value: 50000,
      accountId: testAccount.id.value,
      ownerId: 'owner-1',
    }).value;
    await opportunityRepository.save(testOpportunity);
  });

  describe('createTask()', () => {
    it('should create a task with valid input', async () => {
      const result = await service.createTask({
        title: 'Follow up call',
        description: 'Call the prospect',
        ownerId: 'owner-1',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.title).toBe('Follow up call');
      expect(result.value.status).toBe('PENDING');
      expect(result.value.priority).toBe('MEDIUM');
    });

    it('should create task assigned to lead', async () => {
      const result = await service.createTask({
        title: 'Contact lead',
        leadId: testLead.id.value,
        ownerId: 'owner-1',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.leadId).toBe(testLead.id.value);
    });

    it('should create task assigned to contact', async () => {
      const result = await service.createTask({
        title: 'Follow up with contact',
        contactId: testContact.id.value,
        ownerId: 'owner-1',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.contactId).toBe(testContact.id.value);
    });

    it('should create task assigned to opportunity', async () => {
      const result = await service.createTask({
        title: 'Send proposal',
        opportunityId: testOpportunity.id.value,
        ownerId: 'owner-1',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.opportunityId).toBe(testOpportunity.id.value);
    });

    it('should fail if assigned to multiple entities', async () => {
      const result = await service.createTask({
        title: 'Multi-assign task',
        leadId: testLead.id.value,
        contactId: testContact.id.value,
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('only be assigned to one entity');
    });

    it('should fail if lead not found', async () => {
      const result = await service.createTask({
        title: 'Missing lead task',
        leadId: '00000000-0000-0000-0000-000000000000',
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
    });

    it('should fail if due date is in the past', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      const result = await service.createTask({
        title: 'Past due task',
        dueDate: pastDate,
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('in the past');
    });

    it('should fail if assigning to converted lead', async () => {
      testLead.updateScore(60, 0.9, 'test-v1');
      testLead.qualify('qualifier', 'Ready');
      testLead.convert('contact-1', null, 'converter');
      await leadRepository.save(testLead);

      const result = await service.createTask({
        title: 'Converted lead task',
        leadId: testLead.id.value,
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('converted leads');
    });

    it('should fail if assigning to closed opportunity', async () => {
      testOpportunity.markAsLost('Lost for testing', 'loser');
      await opportunityRepository.save(testOpportunity);

      const result = await service.createTask({
        title: 'Closed opp task',
        opportunityId: testOpportunity.id.value,
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('closed opportunities');
    });

    it('should publish TaskCreatedEvent', async () => {
      eventBus.clearPublishedEvents();

      await service.createTask({
        title: 'Events task',
        ownerId: 'owner-1',
      });

      const events = eventBus.getPublishedEvents();
      const createdEvents = events.filter((e) => e instanceof TaskCreatedEvent);
      expect(createdEvents.length).toBeGreaterThan(0);
    });
  });

  describe('startTask()', () => {
    it('should start a pending task', async () => {
      const task = Task.create({
        title: 'Start task',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const result = await service.startTask(task.id.value, 'starter');

      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe('IN_PROGRESS');
    });

    it('should fail if task is not pending', async () => {
      const task = Task.create({
        title: 'Already started task',
        ownerId: 'owner-1',
      }).value;
      task.start('starter');
      await taskRepository.save(task);

      const result = await service.startTask(task.id.value, 'starter');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('completeTask()', () => {
    it('should complete a task', async () => {
      const task = Task.create({
        title: 'Complete task',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const result = await service.completeTask(task.id.value, 'completer');

      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe('COMPLETED');
      expect(result.value.completedAt).toBeDefined();
    });

    it('should fail if already completed', async () => {
      const task = Task.create({
        title: 'Already complete task',
        ownerId: 'owner-1',
      }).value;
      task.complete('someone');
      await taskRepository.save(task);

      const result = await service.completeTask(task.id.value, 'completer');

      expect(result.isFailure).toBe(true);
    });

    it('should publish TaskCompletedEvent', async () => {
      const task = Task.create({
        title: 'Complete events task',
        ownerId: 'owner-1',
      }).value;
      task.clearDomainEvents();
      await taskRepository.save(task);

      eventBus.clearPublishedEvents();

      await service.completeTask(task.id.value, 'completer');

      const events = eventBus.getPublishedEvents();
      const completedEvents = events.filter((e) => e instanceof TaskCompletedEvent);
      expect(completedEvents.length).toBeGreaterThan(0);
    });
  });

  describe('cancelTask()', () => {
    it('should cancel a task with valid reason', async () => {
      const task = Task.create({
        title: 'Cancel task',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const result = await service.cancelTask(task.id.value, 'No longer needed', 'canceller');

      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe('CANCELLED');
    });

    it('should fail with short reason', async () => {
      const task = Task.create({
        title: 'Short reason cancel task',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const result = await service.cancelTask(task.id.value, 'Bad', 'canceller');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('at least 5 characters');
    });

    it('should publish TaskCancelledEvent', async () => {
      const task = Task.create({
        title: 'Cancel events task',
        ownerId: 'owner-1',
      }).value;
      task.clearDomainEvents();
      await taskRepository.save(task);

      eventBus.clearPublishedEvents();

      await service.cancelTask(task.id.value, 'No longer needed', 'canceller');

      const events = eventBus.getPublishedEvents();
      const cancelledEvents = events.filter((e) => e instanceof TaskCancelledEvent);
      expect(cancelledEvents.length).toBeGreaterThan(0);
    });
  });

  describe('changePriority()', () => {
    it('should change task priority', async () => {
      const task = Task.create({
        title: 'Priority task',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const result = await service.changePriority(task.id.value, 'HIGH', 'changer');

      expect(result.isSuccess).toBe(true);
      expect(result.value.priority).toBe('HIGH');
    });

    it('should fail if task is completed', async () => {
      const task = Task.create({
        title: 'Completed priority task',
        ownerId: 'owner-1',
      }).value;
      task.complete('completer');
      await taskRepository.save(task);

      const result = await service.changePriority(task.id.value, 'URGENT', 'changer');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('updateDueDate()', () => {
    it('should update due date', async () => {
      const task = Task.create({
        title: 'Due date task',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const result = await service.updateDueDate(task.id.value, futureDate, 'updater');

      expect(result.isSuccess).toBe(true);
      expect(result.value.dueDate?.getTime()).toBe(futureDate.getTime());
    });

    it('should fail with past date for open task', async () => {
      const task = Task.create({
        title: 'Past date task',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      const result = await service.updateDueDate(task.id.value, pastDate, 'updater');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('assignToLead()', () => {
    it('should assign task to lead', async () => {
      const task = Task.create({
        title: 'Lead assign task',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const result = await service.assignToLead(task.id.value, testLead.id.value, 'assigner');

      expect(result.isSuccess).toBe(true);
      expect(result.value.leadId).toBe(testLead.id.value);
    });

    it('should fail if task is completed', async () => {
      const task = Task.create({
        title: 'Completed assign task',
        ownerId: 'owner-1',
      }).value;
      task.complete('completer');
      await taskRepository.save(task);

      const result = await service.assignToLead(task.id.value, testLead.id.value, 'assigner');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('bulkComplete()', () => {
    it('should complete multiple tasks', async () => {
      const task1 = Task.create({ title: 'Bulk 1', ownerId: 'owner-1' }).value;
      const task2 = Task.create({ title: 'Bulk 2', ownerId: 'owner-1' }).value;
      await taskRepository.save(task1);
      await taskRepository.save(task2);

      const result = await service.bulkComplete([task1.id.value, task2.id.value], 'completer');

      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
      expect(result.totalProcessed).toBe(2);
    });

    it('should handle partial failures', async () => {
      const task1 = Task.create({ title: 'Bulk Success', ownerId: 'owner-1' }).value;
      const task2 = Task.create({ title: 'Bulk Fail', ownerId: 'owner-1' }).value;
      task2.complete('already');
      await taskRepository.save(task1);
      await taskRepository.save(task2);

      const result = await service.bulkComplete([task1.id.value, task2.id.value], 'completer');

      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
    });
  });

  describe('getOverdueTasks()', () => {
    it('should return overdue tasks', async () => {
      const overdueTask = Task.create({
        title: 'Overdue task',
        dueDate: new Date(Date.now() - 86400000), // Yesterday
        ownerId: 'owner-1',
      }).value;
      // Manually set dueDate since create won't allow past dates
      (overdueTask as any).props.dueDate = new Date(Date.now() - 86400000);
      await taskRepository.save(overdueTask);

      const futureTask = Task.create({
        title: 'Future task',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(futureTask);

      const overdue = await service.getOverdueTasks('owner-1');

      expect(overdue).toHaveLength(1);
      expect(overdue[0].id.value).toBe(overdueTask.id.value);
    });
  });

  describe('getHighPriorityTasks()', () => {
    it('should return HIGH and URGENT priority tasks', async () => {
      const highTask = Task.create({
        title: 'High task',
        priority: 'HIGH',
        ownerId: 'owner-1',
      }).value;
      const urgentTask = Task.create({
        title: 'Urgent task',
        priority: 'URGENT',
        ownerId: 'owner-1',
      }).value;
      const mediumTask = Task.create({
        title: 'Medium task',
        priority: 'MEDIUM',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(highTask);
      await taskRepository.save(urgentTask);
      await taskRepository.save(mediumTask);

      const highPriority = await service.getHighPriorityTasks('owner-1');

      expect(highPriority).toHaveLength(2);
    });
  });

  describe('getDueDateMetrics()', () => {
    it('should return due date metrics', async () => {
      const task1 = Task.create({
        title: 'No due date',
        ownerId: 'owner-1',
      }).value;

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const task2 = Task.create({
        title: 'Future task',
        dueDate: futureDate,
        ownerId: 'owner-1',
      }).value;

      await taskRepository.save(task1);
      await taskRepository.save(task2);

      const metrics = await service.getDueDateMetrics('owner-1');

      expect(metrics.noDueDate).toBe(1);
      expect(metrics.dueThisWeek).toBe(1);
    });
  });

  describe('getCompletionStatistics()', () => {
    it('should return completion statistics', async () => {
      const pending = Task.create({ title: 'Pending', ownerId: 'owner-1' }).value;
      const completed = Task.create({ title: 'Completed', ownerId: 'owner-1' }).value;
      completed.complete('completer');

      await taskRepository.save(pending);
      await taskRepository.save(completed);

      const stats = await service.getCompletionStatistics('owner-1');

      expect(stats.total).toBe(2);
      expect(stats.pending).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.completionRate).toBe(50);
    });
  });

  describe('deleteTask()', () => {
    it('should delete a task', async () => {
      const task = Task.create({
        title: 'Delete task',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const result = await service.deleteTask(task.id.value);

      expect(result.isSuccess).toBe(true);

      const deleted = await taskRepository.findById(task.id);
      expect(deleted).toBeNull();
    });

    it('should fail if task is completed', async () => {
      const task = Task.create({
        title: 'Completed delete task',
        ownerId: 'owner-1',
      }).value;
      task.complete('completer');
      await taskRepository.save(task);

      const result = await service.deleteTask(task.id.value);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Cannot delete completed tasks');
    });
  });
});
