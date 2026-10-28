/**
 * Task automation runtime wiring — PG-208 (ADR-084).
 *
 * Built by `startApiServer` after `containerReady`, only when the runner is
 * enabled (so a disabled runner never buffers events): store over the shared
 * API client, event buffer + conversion correlation, the intake registered on
 * the container's event bus (watched event types primed before registering),
 * and the engine wired to TaskService and the notification orchestrator.
 * The webhook route needs only the store and a limiter, so it has its own lazy
 * singleton and works whether or not this process runs the runner.
 */

import type { PrismaClient } from '@intelliflow/db';
import type { TaskPriority } from '@intelliflow/domain';
import { TaskAutomationEngine, type TickResult } from './task-automation-engine';
import {
  ConversionCorrelation,
  TaskAutomationEventBuffer,
  registerTaskAutomationEventIntake,
  type EventSubscriber,
} from './task-automation-event-intake';
import { createTaskAutomationStore, type TaskAutomationStore } from './task-automation-store';
import {
  WebhookFailureLimiter,
  webhookEncryptionReady,
  type WebhookRouteDeps,
} from './task-automation-webhook';

const AUTOMATION_ACTOR = 'system:task-automation';

export { webhookEncryptionReady };

let webhookDeps: WebhookRouteDeps | null = null;

export async function getTaskAutomationWebhookDeps(): Promise<WebhookRouteDeps> {
  if (webhookDeps) return webhookDeps;
  const { prisma } = await import('@intelliflow/db');
  webhookDeps = {
    store: createTaskAutomationStore(prisma as unknown as PrismaClient),
    limiter: new WebhookFailureLimiter(),
    now: () => new Date(),
    encryptionReady: () => webhookEncryptionReady(),
  };
  return webhookDeps;
}

interface TaskServiceLike {
  createTask(props: {
    title: string;
    description?: string;
    dueDate?: Date;
    priority?: TaskPriority;
    leadId?: string;
    contactId?: string;
    opportunityId?: string;
    ownerId: string;
    tenantId: string;
  }): Promise<{
    isSuccess: boolean;
    value?: { id: { value: string } };
    error?: { message: string };
  }>;
  assignTask(
    taskId: string,
    assigneeId: string | null,
    assignedBy: string,
    tenantId: string
  ): Promise<{ isSuccess: boolean }>;
}

export interface TaskAutomationRuntimeDeps {
  prisma: PrismaClient;
  eventBus: EventSubscriber;
  taskService: TaskServiceLike;
  notify: (params: {
    tenantId: string;
    userId: string;
    title: string;
    body: string;
    taskId?: string;
  }) => Promise<'sent' | 'filtered'>;
  now?: () => Date;
}

export interface TaskAutomationRuntime {
  store: TaskAutomationStore;
  buffer: TaskAutomationEventBuffer;
  tick(): Promise<TickResult>;
}

export async function buildTaskAutomationRuntime(
  deps: TaskAutomationRuntimeDeps
): Promise<TaskAutomationRuntime> {
  const now = deps.now ?? (() => new Date());
  const store = createTaskAutomationStore(deps.prisma);
  const buffer = new TaskAutomationEventBuffer();
  const correlation = new ConversionCorrelation();
  let watched = new Set(await store.activeEventTypes());

  await registerTaskAutomationEventIntake(deps.eventBus, {
    buffer,
    correlation,
    isWatched: (eventType) => watched.has(eventType),
    now: () => now().getTime(),
  });

  const engine = new TaskAutomationEngine({
    store,
    buffer,
    correlation,
    now,
    createTask: async (request) => {
      const result = await deps.taskService.createTask(request);
      if (result.isSuccess && result.value) return { ok: true, taskId: result.value.id.value };
      return { ok: false, reason: result.error?.message ?? 'create failed' };
    },
    assignTask: async (taskId, assigneeId, tenantId) =>
      (await deps.taskService.assignTask(taskId, assigneeId, AUTOMATION_ACTOR, tenantId)).isSuccess,
    notify: deps.notify,
  });

  return {
    store,
    buffer,
    async tick() {
      // A rule saved now applies from the next tick on (≤ one interval, ADR-084).
      watched = new Set(await store.activeEventTypes());
      return engine.tick();
    },
  };
}

/** Production wiring from the container (call after `containerReady`). */
export async function createTaskAutomationRuntime(): Promise<TaskAutomationRuntime> {
  const [{ prisma }, { container }, { createNotification }] = await Promise.all([
    import('@intelliflow/db'),
    import('../../../container.js'),
    import('../../notifications/notifications.router.js'),
  ]);
  const client = prisma as unknown as PrismaClient;
  return buildTaskAutomationRuntime({
    prisma: client,
    eventBus: container.adapters.eventBus,
    taskService: container.taskService,
    notify: async ({ tenantId, userId, title, body, taskId }) => {
      const notification = await createNotification(
        client as never,
        {
          tenantId,
          userId,
          type: 'task_automation',
          title,
          body,
          entityType: 'task',
          ...(taskId && { entityId: taskId }),
          actionUrl: taskId ? `/tasks/${taskId}` : '/tasks/automation',
          actionLabel: taskId ? 'Open task' : 'Open Task Automation',
        },
        container.notificationOrchestrator
      );
      return (notification.status as string) === 'filtered' ? 'filtered' : 'sent';
    },
  });
}
