/**
 * TaskService Tests
 *
 * Tests the TaskService application service which orchestrates
 * task-related business logic including assignment validation,
 * due date tracking, and completion workflows.
 *
 * Coverage target: >90% for application layer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TaskService } from '../TaskService';
import { InMemoryTaskRepository } from '../../../../adapters/src/repositories/InMemoryTaskRepository';
import { InMemoryLeadRepository } from '../../../../adapters/src/repositories/InMemoryLeadRepository';
import { InMemoryContactRepository } from '../../../../adapters/src/repositories/InMemoryContactRepository';
import { InMemoryOpportunityRepository } from '../../../../adapters/src/repositories/InMemoryOpportunityRepository';
import { InMemoryAccountRepository } from '../../../../adapters/src/repositories/InMemoryAccountRepository';
import { InMemoryEventBus } from '../../../../adapters/src/external/InMemoryEventBus';
import { Task, Lead, Contact, Opportunity, Account } from '@intelliflow/domain';

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
  let testOpportunity: Opportunity;
  let testAccount: Account;

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
      source: 'WEBSITE',
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
      firstName: 'John',
      lastName: 'Doe',
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
        title: 'Test Task',
        description: 'Description',
        ownerId: 'owner-1',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.title).toBe('Test Task');
      expect(result.value.status).toBe('PENDING');
    });

    it('should create task assigned to lead', async () => {
      const result = await service.createTask({
        title: 'Lead Task',
        leadId: testLead.id.value,
        ownerId: 'owner-1',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.leadId).toBe(testLead.id.value);
    });

    it('should create task assigned to contact', async () => {
      const result = await service.createTask({
        title: 'Contact Task',
        contactId: testContact.id.value,
        ownerId: 'owner-1',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.contactId).toBe(testContact.id.value);
    });

    it('should create task assigned to opportunity', async () => {
      const result = await service.createTask({
        title: 'Opportunity Task',
        opportunityId: testOpportunity.id.value,
        ownerId: 'owner-1',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.opportunityId).toBe(testOpportunity.id.value);
    });

    it('should fail if assigned to multiple entities', async () => {
      const result = await service.createTask({
        title: 'Multi Task',
        leadId: testLead.id.value,
        contactId: testContact.id.value,
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('one entity');
    });

    it('should fail if lead not found', async () => {
      const fakeLeadId = '00000000-0000-0000-0000-000000000000';

      const result = await service.createTask({
        title: 'Invalid Lead Task',
        leadId: fakeLeadId,
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Lead not found');
    });

    it('should fail if assigned to converted lead', async () => {
      testLead.updateScore(70, 0.8, 'test');
      testLead.qualify('user', 'Good fit');
      testLead.convert('contact-123', 'account-123', 'user');
      await leadRepository.save(testLead);

      const result = await service.createTask({
        title: 'Converted Lead Task',
        leadId: testLead.id.value,
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('converted leads');
    });

    it('should fail if assigned to closed opportunity', async () => {
      testOpportunity.markAsLost('Lost for test purposes', 'user');
      await opportunityRepository.save(testOpportunity);

      const result = await service.createTask({
        title: 'Closed Opp Task',
        opportunityId: testOpportunity.id.value,
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('closed opportunities');
    });

    it('should fail if due date is in the past', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 7);

      const result = await service.createTask({
        title: 'Past Due Task',
        dueDate: pastDate,
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('in the past');
    });

    it('should publish domain events after creation', async () => {
      eventBus.clearPublishedEvents();

      await service.createTask({
        title: 'Events Task',
        ownerId: 'owner-1',
      });

      const events = eventBus.getPublishedEvents();
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('updateTaskInfo()', () => {
    it('should update task information', async () => {
      const task = Task.create({
        title: 'Original Title',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const result = await service.updateTaskInfo(task.id.value, {
        title: 'Updated Title',
        description: 'New description',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.title).toBe('Updated Title');
      expect(result.value.description).toBe('New description');
    });

    it('should fail if task not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const result = await service.updateTaskInfo(fakeId, { title: 'New' });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Task not found');
    });

    it('should fail if task is completed', async () => {
      const task = Task.create({
        title: 'Completed Task',
        ownerId: 'owner-1',
      }).value;
      task.complete('user');
      await taskRepository.save(task);

      const result = await service.updateTaskInfo(task.id.value, { title: 'New' });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('completed or cancelled');
    });

    it('should fail if task is cancelled', async () => {
      const task = Task.create({
        title: 'Cancelled Task',
        ownerId: 'owner-1',
      }).value;
      task.cancel('No longer needed', 'user');
      await taskRepository.save(task);

      const result = await service.updateTaskInfo(task.id.value, { title: 'New' });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('completed or cancelled');
    });
  });

  describe('startTask()', () => {
    it('should start a pending task', async () => {
      const task = Task.create({
        title: 'Start Task',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const result = await service.startTask(task.id.value, 'user');

      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe('IN_PROGRESS');
    });

    it('should fail if task is not pending', async () => {
      const task = Task.create({
        title: 'Started Task',
        ownerId: 'owner-1',
      }).value;
      task.start('user');
      await taskRepository.save(task);

      const result = await service.startTask(task.id.value, 'user');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('must be PENDING');
    });

    it('should fail if task not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const result = await service.startTask(fakeId, 'user');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('completeTask()', () => {
    it('should complete a task', async () => {
      const task = Task.create({
        title: 'Complete Task',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const result = await service.completeTask(task.id.value, 'user');

      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe('COMPLETED');
      expect(result.value.isCompleted).toBe(true);
    });

    it('should fail if task not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const result = await service.completeTask(fakeId, 'user');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('cancelTask()', () => {
    it('should cancel a task with reason', async () => {
      const task = Task.create({
        title: 'Cancel Task',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const result = await service.cancelTask(task.id.value, 'No longer needed', 'user');

      expect(result.isSuccess).toBe(true);
      expect(result.value.status).toBe('CANCELLED');
      expect(result.value.isCancelled).toBe(true);
    });

    it('should fail without sufficient reason', async () => {
      const task = Task.create({
        title: 'Short Reason',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const result = await service.cancelTask(task.id.value, 'No', 'user');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('at least 5 characters');
    });

    it('should fail if task not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const result = await service.cancelTask(fakeId, 'Reason', 'user');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('changePriority()', () => {
    it('should change task priority', async () => {
      const task = Task.create({
        title: 'Priority Task',
        priority: 'NORMAL',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const result = await service.changePriority(task.id.value, 'HIGH', 'user');

      expect(result.isSuccess).toBe(true);
      expect(result.value.priority).toBe('HIGH');
    });

    it('should fail if task not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const result = await service.changePriority(fakeId, 'HIGH', 'user');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('updateDueDate()', () => {
    it('should update due date', async () => {
      const task = Task.create({
        title: 'Due Date Task',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 14);

      const result = await service.updateDueDate(task.id.value, futureDate, 'user');

      expect(result.isSuccess).toBe(true);
    });

    it('should fail if date is in the past', async () => {
      const task = Task.create({
        title: 'Past Due',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 7);

      const result = await service.updateDueDate(task.id.value, pastDate, 'user');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('in the past');
    });

    it('should fail if task not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const result = await service.updateDueDate(fakeId, new Date(), 'user');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('assignToLead()', () => {
    it('should assign task to lead', async () => {
      const task = Task.create({
        title: 'Assign Lead',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const result = await service.assignToLead(task.id.value, testLead.id.value, 'user');

      expect(result.isSuccess).toBe(true);
      expect(result.value.leadId).toBe(testLead.id.value);
    });

    it('should fail if lead is converted', async () => {
      const task = Task.create({
        title: 'Converted Lead',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      testLead.updateScore(70, 0.8, 'test');
      testLead.qualify('user', 'Good fit');
      testLead.convert('contact-123', 'account-123', 'user');
      await leadRepository.save(testLead);

      const result = await service.assignToLead(task.id.value, testLead.id.value, 'user');

      expect(result.isFailure).toBe(true);
    });

    it('should fail if task is completed', async () => {
      const task = Task.create({
        title: 'Completed Assign',
        ownerId: 'owner-1',
      }).value;
      task.complete('user');
      await taskRepository.save(task);

      const result = await service.assignToLead(task.id.value, testLead.id.value, 'user');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('completed or cancelled');
    });
  });

  describe('assignToContact()', () => {
    it('should assign task to contact', async () => {
      const task = Task.create({
        title: 'Assign Contact',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const result = await service.assignToContact(task.id.value, testContact.id.value, 'user');

      expect(result.isSuccess).toBe(true);
      expect(result.value.contactId).toBe(testContact.id.value);
    });

    it('should fail if contact not found', async () => {
      const task = Task.create({
        title: 'Contact Not Found',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const fakeContactId = '00000000-0000-0000-0000-000000000000';

      const result = await service.assignToContact(task.id.value, fakeContactId, 'user');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('assignToOpportunity()', () => {
    it('should assign task to opportunity', async () => {
      const task = Task.create({
        title: 'Assign Opportunity',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const result = await service.assignToOpportunity(
        task.id.value,
        testOpportunity.id.value,
        'user'
      );

      expect(result.isSuccess).toBe(true);
      expect(result.value.opportunityId).toBe(testOpportunity.id.value);
    });

    it('should fail if opportunity is closed', async () => {
      const task = Task.create({
        title: 'Closed Opp',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      testOpportunity.markAsLost('Lost for test purposes', 'user');
      await opportunityRepository.save(testOpportunity);

      const result = await service.assignToOpportunity(
        task.id.value,
        testOpportunity.id.value,
        'user'
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('closed opportunities');
    });
  });

  describe('getOverdueTasks()', () => {
    it('should return overdue tasks', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 3);

      const task = Task.create({
        title: 'Overdue Task',
        dueDate: pastDate,
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const overdue = await service.getOverdueTasks('owner-1');

      expect(overdue).toHaveLength(1);
    });

    it('should not include completed tasks', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 3);

      const task = Task.create({
        title: 'Completed Overdue',
        dueDate: pastDate,
        ownerId: 'owner-1',
      }).value;
      task.complete('user');
      await taskRepository.save(task);

      const overdue = await service.getOverdueTasks('owner-1');

      expect(overdue).toHaveLength(0);
    });
  });

  describe('getHighPriorityTasks()', () => {
    it('should return HIGH and URGENT tasks', async () => {
      const highTask = Task.create({
        title: 'High Priority',
        priority: 'HIGH',
        ownerId: 'owner-1',
      }).value;
      const urgentTask = Task.create({
        title: 'Urgent Priority',
        priority: 'URGENT',
        ownerId: 'owner-1',
      }).value;
      const normalTask = Task.create({
        title: 'Normal Priority',
        priority: 'NORMAL',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(highTask);
      await taskRepository.save(urgentTask);
      await taskRepository.save(normalTask);

      const highPriority = await service.getHighPriorityTasks('owner-1');

      expect(highPriority).toHaveLength(2);
    });
  });

  describe('bulkComplete()', () => {
    it('should complete multiple tasks', async () => {
      const task1 = Task.create({
        title: 'Bulk 1',
        ownerId: 'owner-1',
      }).value;
      const task2 = Task.create({
        title: 'Bulk 2',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task1);
      await taskRepository.save(task2);

      const result = await service.bulkComplete([task1.id.value, task2.id.value], 'user');

      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
      expect(result.totalProcessed).toBe(2);
    });

    it('should handle partial failures', async () => {
      const task = Task.create({
        title: 'Valid Task',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const fakeId = '00000000-0000-0000-0000-000000000000';

      const result = await service.bulkComplete([task.id.value, fakeId], 'user');

      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
    });
  });

  describe('getDueDateMetrics()', () => {
    it('should calculate due date metrics', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 2);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 5);

      const overdueTask = Task.create({
        title: 'Overdue',
        dueDate: pastDate,
        ownerId: 'owner-1',
      }).value;
      const soonTask = Task.create({
        title: 'Due Soon',
        dueDate: tomorrow,
        ownerId: 'owner-1',
      }).value;
      const weekTask = Task.create({
        title: 'Due This Week',
        dueDate: nextWeek,
        ownerId: 'owner-1',
      }).value;
      const noDueTask = Task.create({
        title: 'No Due Date',
        ownerId: 'owner-1',
      }).value;

      await taskRepository.save(overdueTask);
      await taskRepository.save(soonTask);
      await taskRepository.save(weekTask);
      await taskRepository.save(noDueTask);

      const metrics = await service.getDueDateMetrics('owner-1');

      expect(metrics.overdue).toBe(1);
      expect(metrics.noDueDate).toBe(1);
    });
  });

  describe('getCompletionStatistics()', () => {
    it('should calculate completion statistics', async () => {
      const pending = Task.create({
        title: 'Pending',
        ownerId: 'owner-1',
      }).value;
      const completed = Task.create({
        title: 'Completed',
        ownerId: 'owner-1',
      }).value;
      completed.complete('user');
      const cancelled = Task.create({
        title: 'Cancelled',
        ownerId: 'owner-1',
      }).value;
      cancelled.cancel('No longer needed', 'user');

      await taskRepository.save(pending);
      await taskRepository.save(completed);
      await taskRepository.save(cancelled);

      const stats = await service.getCompletionStatistics('owner-1');

      expect(stats.total).toBe(3);
      expect(stats.completed).toBe(1);
      expect(stats.pending).toBe(1);
      expect(stats.cancelled).toBe(1);
      expect(stats.completionRate).toBe(33); // 1/3 = 33.33%
    });

    it('should handle empty repository', async () => {
      const stats = await service.getCompletionStatistics('owner-1');

      expect(stats.total).toBe(0);
      expect(stats.completionRate).toBe(0);
    });
  });

  describe('deleteTask()', () => {
    it('should delete a task', async () => {
      const task = Task.create({
        title: 'Delete Task',
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
        title: 'Completed Delete',
        ownerId: 'owner-1',
      }).value;
      task.complete('user');
      await taskRepository.save(task);

      const result = await service.deleteTask(task.id.value);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Cannot delete completed tasks');
    });

    it('should allow deleting cancelled tasks', async () => {
      const task = Task.create({
        title: 'Cancelled Delete',
        ownerId: 'owner-1',
      }).value;
      task.cancel('No longer needed', 'user');
      await taskRepository.save(task);

      const result = await service.deleteTask(task.id.value);

      expect(result.isSuccess).toBe(true);
    });

    it('should fail if task not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const result = await service.deleteTask(fakeId);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Task not found');
    });
  });
});
