/**
 * Task automation runtime wiring (PG-208): intake registered with the watched
 * set primed, engine wired to TaskService / notifications, webhook deps lazy.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Email, LeadCreatedEvent, LeadId } from '@intelliflow/domain';
import { InMemoryEventBus } from '@intelliflow/adapters';

const containerMock = vi.hoisted(() => ({
  adapters: { eventBus: null as unknown },
  taskService: { createTask: vi.fn(), assignTask: vi.fn() },
  notificationOrchestrator: { marker: 'orchestrator' },
}));
const createNotification = vi.hoisted(() => vi.fn());

vi.mock('../../../../container.js', () => ({ container: containerMock }));
vi.mock('../../../notifications/notifications.router.js', () => ({ createNotification }));
// The production factory reads the shared client from @intelliflow/db: use the mock.
vi.mock('@intelliflow/db', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { prismaMock: mock } = await import('../../../../test/setup.js');
  return { ...actual, prisma: mock };
});

import { prismaMock } from '../../../../test/setup';
import {
  buildTaskAutomationRuntime,
  createTaskAutomationRuntime,
  getTaskAutomationWebhookDeps,
  notificationLink,
  webhookEncryptionReady,
} from '../task-automation-runtime';

const m = prismaMock as any;

describe('notificationLink', () => {
  it('deep-links the task only for a recipient who can open it', () => {
    expect(notificationLink({ taskId: 'task-1', canOpenTask: true })).toEqual({
      entityId: 'task-1',
      actionUrl: '/tasks/task-1',
      actionLabel: 'Open task',
    });
    expect(notificationLink({ taskId: 'task-1', canOpenTask: false })).toEqual({
      actionUrl: '/tasks',
      actionLabel: 'Open tasks',
    });
    expect(notificationLink({})).toEqual({
      actionUrl: '/tasks/automation',
      actionLabel: 'Open Task Automation',
    });
  });
});

describe('webhookEncryptionReady', () => {
  it('requires the field-encryption key outside tests', () => {
    expect(webhookEncryptionReady({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(false);
    expect(
      webhookEncryptionReady({
        NODE_ENV: 'production',
        PRISMA_FIELD_ENCRYPTION_KEY: 'k',
      } as NodeJS.ProcessEnv)
    ).toBe(true);
    expect(webhookEncryptionReady({ NODE_ENV: 'test' } as NodeJS.ProcessEnv)).toBe(true);
    expect(webhookEncryptionReady({ VITEST: 'true' } as NodeJS.ProcessEnv)).toBe(true);
  });
});

beforeEach(() => {
  m.taskAutomationRule.findMany.mockResolvedValue([]);
  m.taskAutomationRule.updateMany.mockResolvedValue({ count: 1 });
  m.taskAutomationRun.findMany.mockResolvedValue([]);
  m.taskAutomationRun.updateMany.mockResolvedValue({ count: 0 });
  m.taskAutomationRun.deleteMany.mockResolvedValue({ count: 0 });
  m.taskAutomationRun.count.mockResolvedValue(0);
});

describe('buildTaskAutomationRuntime', () => {
  it('primes the watched set before registering, and refreshes it every tick', async () => {
    m.taskAutomationRule.findMany.mockResolvedValueOnce([{ eventType: 'lead.created' }]);
    const bus = new InMemoryEventBus();
    const runtime = await buildTaskAutomationRuntime({
      prisma: prismaMock as never,
      eventBus: bus,
      taskService: { createTask: vi.fn(), assignTask: vi.fn() },
      notify: vi.fn(),
      now: () => new Date('2026-10-20T10:00:00.000Z'),
    });
    const email = Email.create('ada@example.invalid').value;
    await bus.publish(new LeadCreatedEvent(LeadId.generate(), email, 'WEBSITE', 'owner'));
    expect(runtime.buffer.size).toBe(1);

    m.taskAutomationRun.findMany.mockResolvedValue([]);
    m.lead.findUnique.mockResolvedValue(null);
    await runtime.tick(); // the watched set is now empty (findMany → [])
    await bus.publish(new LeadCreatedEvent(LeadId.generate(), email, 'WEBSITE', 'owner'));
    expect(runtime.buffer.size).toBe(1); // only the requeued first event
  });
});

describe('createTaskAutomationRuntime (container wiring)', () => {
  it('wires TaskService and the notification orchestrator', async () => {
    m.taskAutomationRule.findMany.mockResolvedValue([]);
    const bus = new InMemoryEventBus();
    containerMock.adapters.eventBus = bus;
    const runtime = await createTaskAutomationRuntime();
    expect(runtime.store).toBeDefined();
    expect(typeof runtime.tick).toBe('function');
  });

  it('maps TaskService results and notification statuses', async () => {
    // Exercise the adapters through a runtime with a controlled store.
    const taskService = {
      createTask: vi
        .fn()
        .mockResolvedValueOnce({ isSuccess: true, value: { id: { value: 'task-1' } } })
        .mockResolvedValueOnce({ isSuccess: false, error: { message: 'nope' } }),
      assignTask: vi.fn().mockResolvedValue({ isSuccess: true }),
    };
    containerMock.taskService = taskService as never;
    createNotification
      .mockResolvedValueOnce({ status: 'filtered' })
      .mockResolvedValueOnce({ status: 'pending' });
    m.taskAutomationRule.findMany.mockResolvedValue([]);
    containerMock.adapters.eventBus = new InMemoryEventBus();
    const runtime = await createTaskAutomationRuntime();
    // Reach the injected deps through a run: one pending run for a live owner.
    m.taskAutomationRun.findMany.mockResolvedValueOnce([
      { id: 'run-1', tenantId: 't1', ruleId: 'r1', triggerType: 'SCHEDULE', context: {} },
    ]);
    m.taskAutomationRun.updateMany.mockResolvedValue({ count: 1 });
    m.taskAutomationRule.findFirst.mockResolvedValue({
      id: 'r1',
      tenantId: 't1',
      name: 'Daily',
      isActive: true,
      triggerType: 'SCHEDULE',
      eventType: null,
      eventFilter: null,
      scheduleTimezone: 'UTC',
      createdBy: 'creator',
      actions: [
        {
          type: 'CREATE_TASK',
          titleTemplate: 'Daily',
          priority: 'LOW',
          dueInDays: null,
          linkToRecord: false,
        },
        {
          type: 'NOTIFY',
          recipients: { assignee: false, owner: true, userIds: [] },
          message: 'hi',
        },
      ],
    });
    m.taskAutomationSetting.findUnique.mockResolvedValue(null);
    m.user.findMany.mockResolvedValue([{ id: 'creator', name: 'C', email: 'c@example.invalid' }]);
    m.taskAutomationRule.updateMany.mockResolvedValue({ count: 1 });
    await runtime.tick();

    expect(taskService.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1', ownerId: 'creator' })
    );
    expect(createNotification).toHaveBeenCalledWith(
      prismaMockLike(),
      expect.objectContaining({
        type: 'task_automation',
        userId: 'creator',
        entityId: 'task-1',
        actionUrl: '/tasks/task-1',
      }),
      containerMock.notificationOrchestrator
    );
    const finish = m.taskAutomationRun.updateMany.mock.calls.find(
      (c: any[]) => c[0].data?.status === 'SUCCEEDED'
    );
    expect(finish[0].data).toMatchObject({
      outcome: 'notify_filtered_by_preference',
      taskId: 'task-1',
    });
  });
});

function prismaMockLike() {
  return expect.anything();
}

describe('getTaskAutomationWebhookDeps', () => {
  it('builds the webhook dependencies once', async () => {
    const first = await getTaskAutomationWebhookDeps();
    const second = await getTaskAutomationWebhookDeps();
    expect(first).toBe(second);
    expect(first.encryptionReady()).toBe(true);
    expect(first.now()).toBeInstanceOf(Date);
  });
});
