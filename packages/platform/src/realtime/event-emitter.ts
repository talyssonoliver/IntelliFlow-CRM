/**
 * Shared Real-Time Event Emitter
 *
 * Provides a shared EventEmitter for real-time subscriptions across
 * API and worker processes. Used by tRPC subscriptions to push
 * updates to connected clients.
 *
 * @module @intelliflow/platform/realtime
 * @task IFC-150/IFC-016 Integration
 */

import { EventEmitter } from 'events';

/**
 * Singleton EventEmitter for real-time events
 *
 * In production multi-instance deployments, replace this with:
 * - Redis Pub/Sub for cross-instance communication
 * - RabbitMQ for complex event routing
 * - Server-Sent Events (SSE) for one-way streams
 */
const realtimeEmitter = new EventEmitter();

// Increase max listeners to avoid warnings in production
realtimeEmitter.setMaxListeners(100);

// ============================================================================
// Event Types
// ============================================================================

/**
 * Lead scored event payload
 */
export interface LeadScoredEvent {
  leadId: string;
  score: number;
  confidence: number;
  timestamp: Date;
}

/**
 * Task assigned event payload
 */
export interface TaskAssignedEvent {
  taskId: string;
  assigneeId: string;
  title: string;
  dueDate: Date;
}

/**
 * System event payload
 */
export interface SystemEvent {
  type: 'info' | 'warning' | 'error';
  message: string;
  timestamp: Date;
}

/**
 * AI progress event payload
 */
export interface AIProgressEvent {
  jobId: string;
  progress: number;
  status: string;
}

// ============================================================================
// Event Channels
// ============================================================================

export const REALTIME_CHANNELS = {
  LEAD_SCORED: 'lead:scored',
  TASK_ASSIGNED: 'task:assigned',
  SYSTEM_EVENT: 'system:event',
  AI_PROGRESS: 'ai:progress',
} as const;

export type RealtimeChannel = (typeof REALTIME_CHANNELS)[keyof typeof REALTIME_CHANNELS];

// ============================================================================
// Emit Functions
// ============================================================================

/**
 * Emit a lead scored event
 *
 * Call this after AI scores a lead to notify all subscribers.
 *
 * @example
 * await scoreLeadWithAI(leadId);
 * emitLeadScored({ leadId, score: 85, confidence: 0.92, timestamp: new Date() });
 */
export function emitLeadScored(event: LeadScoredEvent): void {
  realtimeEmitter.emit(REALTIME_CHANNELS.LEAD_SCORED, event);
}

/**
 * Emit a task assigned event
 *
 * Call this when a task is assigned to a user.
 *
 * @example
 * await createTask({ assigneeId: userId, ... });
 * emitTaskAssigned({ taskId, assigneeId: userId, title, dueDate });
 */
export function emitTaskAssigned(event: TaskAssignedEvent): void {
  realtimeEmitter.emit(REALTIME_CHANNELS.TASK_ASSIGNED, event);
}

/**
 * Emit a system event
 *
 * Call this for system-wide notifications.
 *
 * @example
 * emitSystemEvent({
 *   type: 'warning',
 *   message: 'Scheduled maintenance in 1 hour',
 * });
 */
export function emitSystemEvent(event: Omit<SystemEvent, 'timestamp'>): void {
  realtimeEmitter.emit(REALTIME_CHANNELS.SYSTEM_EVENT, {
    ...event,
    timestamp: new Date(),
  });
}

/**
 * Emit AI progress update
 *
 * Call this during long-running AI jobs to show progress.
 *
 * @example
 * for (let i = 0; i <= 100; i += 10) {
 *   await processChunk(i);
 *   emitAIProgress({ jobId, progress: i, status: `Processing ${i}%` });
 * }
 */
export function emitAIProgress(event: AIProgressEvent): void {
  realtimeEmitter.emit(REALTIME_CHANNELS.AI_PROGRESS, event);
}

// ============================================================================
// Subscription Helpers
// ============================================================================

/**
 * Subscribe to a realtime channel
 *
 * @param channel The channel to subscribe to
 * @param handler The handler function
 * @returns Unsubscribe function
 */
export function subscribeToChannel<T>(
  channel: RealtimeChannel,
  handler: (event: T) => void
): () => void {
  realtimeEmitter.on(channel, handler);
  return () => {
    realtimeEmitter.off(channel, handler);
  };
}

/**
 * Get the underlying EventEmitter for advanced use cases
 *
 * @returns The shared EventEmitter instance
 */
export function getRealtimeEmitter(): EventEmitter {
  return realtimeEmitter;
}
