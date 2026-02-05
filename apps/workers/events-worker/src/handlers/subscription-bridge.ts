/**
 * Subscription Bridge Handlers
 *
 * Bridges domain events from the outbox to tRPC real-time subscriptions.
 * Maps OutboxEvent payloads to subscription event formats and emits
 * them via the shared EventEmitter.
 *
 * @module @intelliflow/events-worker/handlers/subscription-bridge
 * @task IFC-150/IFC-016 Integration
 */

import type { OutboxEvent } from '../outbox/event-dispatcher';
import {
  emitLeadScored,
  emitTaskAssigned,
  emitSystemEvent,
  emitAIProgress,
  type LeadScoredEvent,
  type TaskAssignedEvent,
  type AIProgressEvent,
} from '@intelliflow/platform';
import type { Logger } from 'pino';

// ============================================================================
// Event Mappers
// ============================================================================

/**
 * Map OutboxEvent to LeadScored subscription event
 */
export function mapLeadScoredEvent(event: OutboxEvent): LeadScoredEvent | null {
  const payload = event.payload as Record<string, unknown>;

  // Validate required fields
  if (payload.score === undefined) {
    return null;
  }

  return {
    leadId: String(payload.leadId || event.aggregateId),
    score: Number(payload.score),
    confidence: Number(payload.confidence ?? 0.8),
    timestamp: new Date(event.metadata.timestamp),
  };
}

/**
 * Map OutboxEvent to TaskAssigned subscription event
 */
export function mapTaskAssignedEvent(event: OutboxEvent): TaskAssignedEvent | null {
  const payload = event.payload as Record<string, unknown>;

  // Validate required fields
  if (!payload.assigneeId && !payload.assignedTo) {
    return null;
  }

  return {
    taskId: String(payload.taskId || event.aggregateId),
    assigneeId: String(payload.assigneeId || payload.assignedTo || ''),
    title: String(payload.title || 'Task'),
    dueDate: payload.dueDate ? new Date(String(payload.dueDate)) : new Date(),
  };
}

/**
 * Map OutboxEvent to AIProgress subscription event
 */
export function mapAIProgressEvent(event: OutboxEvent): AIProgressEvent | null {
  const payload = event.payload as Record<string, unknown>;

  if (payload.progress === undefined || !payload.jobId) {
    return null;
  }

  return {
    jobId: String(payload.jobId || event.aggregateId),
    progress: Number(payload.progress),
    status: String(payload.status || 'processing'),
  };
}

// ============================================================================
// Bridge Handlers
// ============================================================================

/**
 * Create a handler that bridges lead.scored events to subscriptions
 */
export function createLeadScoredBridgeHandler(logger: Logger) {
  return async (event: OutboxEvent): Promise<void> => {
    const subscriptionEvent = mapLeadScoredEvent(event);

    if (!subscriptionEvent) {
      logger.warn(
        { eventId: event.id, aggregateId: event.aggregateId },
        'Could not map lead.scored event to subscription format'
      );
      return;
    }

    emitLeadScored(subscriptionEvent);

    logger.debug(
      {
        eventId: event.id,
        leadId: subscriptionEvent.leadId,
        score: subscriptionEvent.score,
      },
      'Emitted lead.scored to real-time subscription'
    );
  };
}

/**
 * Create a handler that bridges task.assigned events to subscriptions
 */
export function createTaskAssignedBridgeHandler(logger: Logger) {
  return async (event: OutboxEvent): Promise<void> => {
    const subscriptionEvent = mapTaskAssignedEvent(event);

    if (!subscriptionEvent) {
      logger.warn(
        { eventId: event.id, aggregateId: event.aggregateId },
        'Could not map task.assigned event to subscription format'
      );
      return;
    }

    emitTaskAssigned(subscriptionEvent);

    logger.debug(
      {
        eventId: event.id,
        taskId: subscriptionEvent.taskId,
        assigneeId: subscriptionEvent.assigneeId,
      },
      'Emitted task.assigned to real-time subscription'
    );
  };
}

/**
 * Create a handler that bridges ai.progress events to subscriptions
 */
export function createAIProgressBridgeHandler(logger: Logger) {
  return async (event: OutboxEvent): Promise<void> => {
    const subscriptionEvent = mapAIProgressEvent(event);

    if (!subscriptionEvent) {
      logger.warn(
        { eventId: event.id, aggregateId: event.aggregateId },
        'Could not map ai.progress event to subscription format'
      );
      return;
    }

    emitAIProgress(subscriptionEvent);

    logger.debug(
      {
        eventId: event.id,
        jobId: subscriptionEvent.jobId,
        progress: subscriptionEvent.progress,
      },
      'Emitted ai.progress to real-time subscription'
    );
  };
}

/**
 * Create a handler that bridges system events to subscriptions
 */
export function createSystemEventBridgeHandler(logger: Logger) {
  return async (event: OutboxEvent): Promise<void> => {
    const payload = event.payload as Record<string, unknown>;

    const eventType = (payload.type as 'info' | 'warning' | 'error') || 'info';
    const message = String(payload.message || 'System event');

    emitSystemEvent({
      type: eventType,
      message,
    });

    logger.debug(
      {
        eventId: event.id,
        type: eventType,
      },
      'Emitted system event to real-time subscription'
    );
  };
}
