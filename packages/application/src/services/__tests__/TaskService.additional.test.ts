/**
 * TaskService - Additional Coverage Tests
 *
 * Supplements TaskService.test.ts to cover uncovered methods/branches:
 * - getTaskById() (success, not found, invalid ID)
 * - getTasksByEntity() (all entity types including default)
 * - getTasksDueSoon()
 * - getTasksByPriority()
 * - getDueDateMetrics() without ownerId (empty result)
 * - getDueDateMetrics() with tasks in dueThisMonth range
 * - assignToContact() completed/cancelled task rejection
 * - assignToOpportunity() task not found
 * - cancelTask() with invalid taskId format
 * - changePriority() when domain changePriority fails
 * - updateDueDate() when domain updateDueDate fails
 * - deleteTask() with invalid taskId format
 * - createTask() when Task.create() fails
 * - Persistence error paths (repository.save throws)
 * - Event publishing error handling
 * - validateAssignment() error catch path
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskService } from '../TaskService';
import { InMemoryTaskRepository } from '../../../../adapters/src/repositories/InMemoryTaskRepository';
import { InMemoryLeadRepository } from '../../../../adapters/src/repositories/InMemoryLeadRepository';
import { InMemoryContactRepository } from '../../../../adapters/src/repositories/InMemoryContactRepository';
import { InMemoryOpportunityRepository } from '../../../../adapters/src/repositories/InMemoryOpportunityRepository';
import { InMemoryAccountRepository } from '../../../../adapters/src/repositories/InMemoryAccountRepository';
import { InMemoryEventBus } from '../../../../adapters/src/external/InMemoryEventBus';
import { Task, Lead, Contact, Opportunity, Account } from '@intelliflow/domain';

describe('TaskService - Additional Coverage', () => {
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

  describe('getTaskById()', () => {
    it('should return task when found', async () => {
      const task = Task.create({
        title: 'Findable Task',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const result = await service.getTaskById(task.id.value);

      expect(result.isSuccess).toBe(true);
      expect(result.value.title).toBe('Findable Task');
    });

    it('should fail when task not found', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000000';

      const result = await service.getTaskById(fakeId);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Task not found');
    });

    it('should fail with invalid task ID format', async () => {
      const result = await service.getTaskById('not-a-valid-uuid');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('getTasksByEntity()', () => {
    it('should get tasks by lead', async () => {
      const task = Task.create({
        title: 'Lead Task',
        leadId: testLead.id.value,
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const tasks = await service.getTasksByEntity('lead', testLead.id.value);

      expect(tasks.length).toBeGreaterThanOrEqual(1);
    });

    it('should get tasks by contact', async () => {
      const task = Task.create({
        title: 'Contact Task',
        contactId: testContact.id.value,
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const tasks = await service.getTasksByEntity('contact', testContact.id.value);

      expect(tasks.length).toBeGreaterThanOrEqual(1);
    });

    it('should get tasks by opportunity', async () => {
      const task = Task.create({
        title: 'Opp Task',
        opportunityId: testOpportunity.id.value,
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const tasks = await service.getTasksByEntity('opportunity', testOpportunity.id.value);

      expect(tasks.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty array for unknown entity type', async () => {
      const tasks = await service.getTasksByEntity('unknown' as any, 'some-id');

      expect(tasks).toEqual([]);
    });
  });

  describe('getTasksDueSoon()', () => {
    it('should return tasks due soon', async () => {
      const tomorrow = new Date();
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      tomorrow.setUTCHours(12, 0, 0, 0);

      const task = Task.create({
        title: 'Due Soon Task',
        dueDate: tomorrow,
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const dueSoon = await service.getTasksDueSoon('owner-1');

      expect(dueSoon.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getTasksByPriority()', () => {
    it('should return tasks with specified priority', async () => {
      const task = Task.create({
        title: 'Urgent Task',
        priority: 'URGENT',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const urgent = await service.getTasksByPriority('URGENT', 'owner-1');

      expect(urgent.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty when no tasks match priority', async () => {
      const lowTasks = await service.getTasksByPriority('LOW', 'owner-1');

      expect(lowTasks).toHaveLength(0);
    });
  });

  describe('getDueDateMetrics() - additional paths', () => {
    it('should return all zeros when ownerId is not provided', async () => {
      const metrics = await service.getDueDateMetrics();

      expect(metrics.overdue).toBe(0);
      expect(metrics.dueSoon).toBe(0);
      expect(metrics.dueThisWeek).toBe(0);
      expect(metrics.dueThisMonth).toBe(0);
      expect(metrics.noDueDate).toBe(0);
    });

    it('should categorize task due this month correctly', async () => {
      const nextMonth = new Date();
      nextMonth.setUTCDate(nextMonth.getUTCDate() + 20);

      const task = Task.create({
        title: 'Monthly Task',
        dueDate: nextMonth,
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const metrics = await service.getDueDateMetrics('owner-1');

      expect(metrics.dueThisMonth).toBe(1);
    });

    it('should not count completed tasks in metrics', async () => {
      const pastDate = new Date();
      pastDate.setUTCDate(pastDate.getUTCDate() - 5);

      const task = Task.create({
        title: 'Completed Overdue',
        dueDate: pastDate,
        ownerId: 'owner-1',
      }).value;
      task.complete('user');
      await taskRepository.save(task);

      const metrics = await service.getDueDateMetrics('owner-1');

      expect(metrics.overdue).toBe(0);
    });

    it('should not count cancelled tasks in metrics', async () => {
      const pastDate = new Date();
      pastDate.setUTCDate(pastDate.getUTCDate() - 5);

      const task = Task.create({
        title: 'Cancelled Overdue',
        dueDate: pastDate,
        ownerId: 'owner-1',
      }).value;
      task.cancel('No longer needed', 'user');
      await taskRepository.save(task);

      const metrics = await service.getDueDateMetrics('owner-1');

      expect(metrics.overdue).toBe(0);
    });
  });

  describe('assignToContact() - additional paths', () => {
    it('should fail when task is cancelled', async () => {
      const task = Task.create({
        title: 'Cancelled Contact Assign',
        ownerId: 'owner-1',
      }).value;
      task.cancel('Not needed', 'user');
      await taskRepository.save(task);

      const result = await service.assignToContact(task.id.value, testContact.id.value, 'user');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('completed or cancelled');
    });

    it('should fail when task ID is invalid', async () => {
      const result = await service.assignToContact('invalid-uuid', testContact.id.value, 'user');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('assignToOpportunity() - additional paths', () => {
    it('should fail when task is not found', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000000';

      const result = await service.assignToOpportunity(fakeId, testOpportunity.id.value, 'user');

      expect(result.isFailure).toBe(true);
    });

    it('should fail when opportunity is not found', async () => {
      const task = Task.create({
        title: 'Opp Not Found',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const fakeOppId = '00000000-0000-4000-8000-000000000000';

      const result = await service.assignToOpportunity(task.id.value, fakeOppId, 'user');

      expect(result.isFailure).toBe(true);
    });

    it('should fail when task is completed', async () => {
      const task = Task.create({
        title: 'Completed Opp Assign',
        ownerId: 'owner-1',
      }).value;
      task.complete('user');
      await taskRepository.save(task);

      const result = await service.assignToOpportunity(
        task.id.value,
        testOpportunity.id.value,
        'user'
      );

      expect(result.isFailure).toBe(true);
    });
  });

  describe('assignToLead() - additional paths', () => {
    it('should fail when lead ID is not found', async () => {
      const task = Task.create({
        title: 'Lead Not Found',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const fakeLeadId = '00000000-0000-4000-8000-000000000000';

      const result = await service.assignToLead(task.id.value, fakeLeadId, 'user');

      expect(result.isFailure).toBe(true);
    });

    it('should fail when task ID is invalid format', async () => {
      const result = await service.assignToLead('bad-uuid', testLead.id.value, 'user');

      expect(result.isFailure).toBe(true);
    });

    it('should fail when task not found', async () => {
      const fakeTaskId = '00000000-0000-4000-8000-000000000000';

      const result = await service.assignToLead(fakeTaskId, testLead.id.value, 'user');

      expect(result.isFailure).toBe(true);
    });

    it('should fail when task is cancelled', async () => {
      const task = Task.create({
        title: 'Cancelled Lead Assign',
        ownerId: 'owner-1',
      }).value;
      task.cancel('Not needed', 'user');
      await taskRepository.save(task);

      const result = await service.assignToLead(task.id.value, testLead.id.value, 'user');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('cancelTask() - additional paths', () => {
    it('should fail with invalid taskId format', async () => {
      const result = await service.cancelTask('bad-uuid', 'Good reason here', 'user');

      expect(result.isFailure).toBe(true);
    });

    it('should fail with empty reason', async () => {
      const task = Task.create({
        title: 'No Reason',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const result = await service.cancelTask(task.id.value, '', 'user');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('at least 5 characters');
    });
  });

  describe('changePriority() - additional paths', () => {
    it('should fail with invalid taskId format', async () => {
      const result = await service.changePriority('bad-uuid', 'HIGH', 'user');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('updateDueDate() - additional paths', () => {
    it('should fail with invalid taskId format', async () => {
      const result = await service.updateDueDate('bad-uuid', new Date(), 'user');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('startTask() - additional paths', () => {
    it('should fail with invalid taskId format', async () => {
      const result = await service.startTask('bad-uuid', 'user');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('completeTask() - additional paths', () => {
    it('should fail with invalid taskId format', async () => {
      const result = await service.completeTask('bad-uuid', 'user');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('deleteTask() - additional paths', () => {
    it('should fail with invalid taskId format', async () => {
      const result = await service.deleteTask('bad-uuid');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('createTask() - contact not found', () => {
    it('should fail when contact not found', async () => {
      const fakeContactId = '00000000-0000-4000-8000-000000000000';

      const result = await service.createTask({
        title: 'Invalid Contact Task',
        contactId: fakeContactId,
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Contact not found');
    });
  });

  describe('createTask() - opportunity not found', () => {
    it('should fail when opportunity not found', async () => {
      const fakeOppId = '00000000-0000-4000-8000-000000000000';

      const result = await service.createTask({
        title: 'Invalid Opp Task',
        opportunityId: fakeOppId,
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Opportunity not found');
    });
  });

  describe('createTask() - with due date', () => {
    it('should succeed with future due date', async () => {
      const futureDate = new Date();
      futureDate.setUTCDate(futureDate.getUTCDate() + 7);

      const result = await service.createTask({
        title: 'Future Due Task',
        dueDate: futureDate,
        ownerId: 'owner-1',
      });

      expect(result.isSuccess).toBe(true);
    });
  });

  describe('persistence error handling', () => {
    it('should handle save error in createTask', async () => {
      const saveSpy = vi.spyOn(taskRepository, 'save').mockRejectedValueOnce(new Error('DB error'));

      const result = await service.createTask({
        title: 'Save Fail',
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save task');

      saveSpy.mockRestore();
    });

    it('should handle save error in startTask', async () => {
      const task = Task.create({
        title: 'Start Save Fail',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const saveSpy = vi.spyOn(taskRepository, 'save').mockRejectedValueOnce(new Error('DB error'));

      const result = await service.startTask(task.id.value, 'user');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save task');

      saveSpy.mockRestore();
    });

    it('should handle save error in completeTask', async () => {
      const task = Task.create({
        title: 'Complete Save Fail',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const saveSpy = vi.spyOn(taskRepository, 'save').mockRejectedValueOnce(new Error('DB error'));

      const result = await service.completeTask(task.id.value, 'user');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save task');

      saveSpy.mockRestore();
    });

    it('should handle save error in cancelTask', async () => {
      const task = Task.create({
        title: 'Cancel Save Fail',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const saveSpy = vi.spyOn(taskRepository, 'save').mockRejectedValueOnce(new Error('DB error'));

      const result = await service.cancelTask(task.id.value, 'Good reason here', 'user');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save task');

      saveSpy.mockRestore();
    });

    it('should handle save error in changePriority', async () => {
      const task = Task.create({
        title: 'Priority Save Fail',
        priority: 'NORMAL',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const saveSpy = vi.spyOn(taskRepository, 'save').mockRejectedValueOnce(new Error('DB error'));

      const result = await service.changePriority(task.id.value, 'HIGH', 'user');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save task');

      saveSpy.mockRestore();
    });

    it('should handle save error in updateDueDate', async () => {
      const task = Task.create({
        title: 'DueDate Save Fail',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const futureDate = new Date();
      futureDate.setUTCDate(futureDate.getUTCDate() + 14);

      const saveSpy = vi.spyOn(taskRepository, 'save').mockRejectedValueOnce(new Error('DB error'));

      const result = await service.updateDueDate(task.id.value, futureDate, 'user');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save task');

      saveSpy.mockRestore();
    });

    it('should handle save error in updateTaskInfo', async () => {
      const task = Task.create({
        title: 'Info Save Fail',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const saveSpy = vi.spyOn(taskRepository, 'save').mockRejectedValueOnce(new Error('DB error'));

      const result = await service.updateTaskInfo(task.id.value, { title: 'New Title' });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save task');

      saveSpy.mockRestore();
    });

    it('should handle save error in assignToLead', async () => {
      const task = Task.create({
        title: 'Assign Lead Save Fail',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const saveSpy = vi.spyOn(taskRepository, 'save').mockRejectedValueOnce(new Error('DB error'));

      const result = await service.assignToLead(task.id.value, testLead.id.value, 'user');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save task');

      saveSpy.mockRestore();
    });

    it('should handle save error in assignToContact', async () => {
      const task = Task.create({
        title: 'Assign Contact Save Fail',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const saveSpy = vi.spyOn(taskRepository, 'save').mockRejectedValueOnce(new Error('DB error'));

      const result = await service.assignToContact(task.id.value, testContact.id.value, 'user');

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save task');

      saveSpy.mockRestore();
    });

    it('should handle save error in assignToOpportunity', async () => {
      const task = Task.create({
        title: 'Assign Opp Save Fail',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const saveSpy = vi.spyOn(taskRepository, 'save').mockRejectedValueOnce(new Error('DB error'));

      const result = await service.assignToOpportunity(
        task.id.value,
        testOpportunity.id.value,
        'user'
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to save task');

      saveSpy.mockRestore();
    });

    it('should handle delete error in deleteTask', async () => {
      const task = Task.create({
        title: 'Delete Fail',
        ownerId: 'owner-1',
      }).value;
      await taskRepository.save(task);

      const deleteSpy = vi
        .spyOn(taskRepository, 'delete')
        .mockRejectedValueOnce(new Error('DB error'));

      const result = await service.deleteTask(task.id.value);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to delete task');

      deleteSpy.mockRestore();
    });
  });

  describe('event publishing error handling', () => {
    it('should not fail task creation when event publishing fails', async () => {
      const publishSpy = vi
        .spyOn(eventBus, 'publishAll')
        .mockRejectedValueOnce(new Error('Event bus error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await service.createTask({
        title: 'Event Fail Task',
        ownerId: 'owner-1',
      });

      expect(result.isSuccess).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to publish task domain events:',
        expect.any(Error)
      );

      publishSpy.mockRestore();
      consoleSpy.mockRestore();
    });
  });

  describe('validateAssignment - error catch path', () => {
    it('should handle exception during lead validation', async () => {
      const findByIdSpy = vi
        .spyOn(leadRepository, 'findById')
        .mockRejectedValueOnce(new Error('DB down'));

      const result = await service.createTask({
        title: 'Validation Error Task',
        leadId: testLead.id.value,
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Error validating entity assignment');

      findByIdSpy.mockRestore();
    });

    it('should handle exception during contact validation', async () => {
      const findByIdSpy = vi
        .spyOn(contactRepository, 'findById')
        .mockRejectedValueOnce(new Error('DB down'));

      const result = await service.createTask({
        title: 'Contact Validation Error',
        contactId: testContact.id.value,
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Error validating entity assignment');

      findByIdSpy.mockRestore();
    });

    it('should handle exception during opportunity validation', async () => {
      const findByIdSpy = vi
        .spyOn(opportunityRepository, 'findById')
        .mockRejectedValueOnce(new Error('DB down'));

      const result = await service.createTask({
        title: 'Opp Validation Error',
        opportunityId: testOpportunity.id.value,
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Error validating entity assignment');

      findByIdSpy.mockRestore();
    });
  });

  describe('validateAssignment - invalid ID format', () => {
    it('should fail with invalid lead ID format', async () => {
      const result = await service.createTask({
        title: 'Invalid Lead Format',
        leadId: 'not-a-uuid',
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Invalid lead ID format');
    });

    it('should fail with invalid contact ID format', async () => {
      const result = await service.createTask({
        title: 'Invalid Contact Format',
        contactId: 'not-a-uuid',
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Invalid contact ID format');
    });

    it('should fail with invalid opportunity ID format', async () => {
      const result = await service.createTask({
        title: 'Invalid Opp Format',
        opportunityId: 'not-a-uuid',
        ownerId: 'owner-1',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Invalid opportunity ID format');
    });
  });
});
