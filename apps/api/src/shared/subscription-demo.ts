/**
 * Real-Time Subscription Demo
 *
 * This file demonstrates tRPC subscriptions for real-time updates.
 * Subscriptions use WebSocket connections to push data from server to client.
 *
 * Use cases in IntelliFlow CRM:
 * - Real-time lead score updates
 * - Live notifications (new leads, tasks assigned)
 * - Collaborative editing (multiple users editing same record)
 * - System status updates
 * - AI processing progress updates
 *
 * Technical Implementation:
 * - WebSocket transport (ws:// or wss://)
 * - Observable pattern for event streams
 * - Automatic reconnection on disconnect
 * - Type-safe event payloads
 *
 * Performance: Subscriptions maintain persistent connections,
 * so use them judiciously to avoid resource exhaustion.
 */

import { z } from 'zod';
import { observable } from '@trpc/server/observable';
import { createTRPCRouter, publicProcedure, protectedProcedure } from '../trpc';
import { EventEmitter } from 'events';

/**
 * Event Emitter for pub/sub pattern
 *
 * In production, replace this with:
 * - Redis Pub/Sub for multi-instance deployments
 * - RabbitMQ for complex event routing
 * - Server-Sent Events (SSE) for one-way streams
 */
const eventEmitter = new EventEmitter();

/**
 * Event types for type-safe event handling
 */
type LeadScoredEvent = {
  leadId: string;
  score: number;
  confidence: number;
  timestamp: Date;
};

type TaskAssignedEvent = {
  taskId: string;
  assigneeId: string;
  title: string;
  dueDate: Date;
};

type SystemEvent = {
  type: 'info' | 'warning' | 'error';
  message: string;
  timestamp: Date;
};

/**
 * Subscription Router
 *
 * Contains all subscription endpoints.
 * Subscriptions are different from queries/mutations:
 * - Queries: Request → Response (one-time)
 * - Mutations: Request → Response (one-time)
 * - Subscriptions: Request → Stream of Responses (continuous)
 */
export const subscriptionRouter = createTRPCRouter({
  /**
   * Subscribe to lead score updates
   *
   * Emits events whenever a lead is scored by AI.
   * Client receives real-time updates without polling.
   *
   * @example Client usage:
   * const subscription = trpc.subscriptions.onLeadScored.subscribe(
   *   { leadId: 'lead_123' },
   *   {
   *     onData: (data) => {
   *       console.log(`New score: ${data.score}`);
   *       updateUI(data);
   *     },
   *     onError: (err) => console.error(err),
   *   }
   * );
   *
   * // Later: subscription.unsubscribe();
   */
  onLeadScored: protectedProcedure
    .input(z.object({ leadId: z.string().optional() }))
    .subscription(({ input }) => {
      return observable<LeadScoredEvent>((emit) => {
        const handler = (event: LeadScoredEvent) => {
          // Filter by leadId if provided
          if (!input.leadId || event.leadId === input.leadId) {
            emit.next(event);
          }
        };

        eventEmitter.on('lead:scored', handler);

        // Cleanup on unsubscribe
        return () => {
          eventEmitter.off('lead:scored', handler);
        };
      });
    }),

  /**
   * Subscribe to task assignments
   *
   * Notifies user when they're assigned a new task.
   * Real-time notification without polling.
   *
   * @security Filtered by current user (ctx.user.userId)
   */
  onTaskAssigned: protectedProcedure.subscription(({ ctx }) => {
    return observable<TaskAssignedEvent>((emit) => {
      const handler = (event: TaskAssignedEvent) => {
        // Only emit if task is assigned to current user
        if (event.assigneeId === ctx.user.userId) {
          emit.next(event);
        }
      };

      eventEmitter.on('task:assigned', handler);

      return () => {
        eventEmitter.off('task:assigned', handler);
      };
    });
  }),

  /**
   * Subscribe to system events
   *
   * Receives system-wide notifications:
   * - Maintenance windows
   * - Performance degradation alerts
   * - New feature announcements
   *
   * Public endpoint for all users.
   */
  onSystemEvent: publicProcedure.subscription(() => {
    return observable<SystemEvent>((emit) => {
      const handler = (event: SystemEvent) => {
        emit.next(event);
      };

      eventEmitter.on('system:event', handler);

      return () => {
        eventEmitter.off('system:event', handler);
      };
    });
  }),

  /**
   * Subscribe to AI processing progress
   *
   * Shows real-time progress for long-running AI tasks:
   * - Batch lead scoring
   * - Document analysis
   * - Large dataset processing
   *
   * Returns progress percentage and status messages.
   */
  onAIProgress: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .subscription(({ input }) => {
      return observable<{ jobId: string; progress: number; status: string }>((emit) => {
        const handler = (event: { jobId: string; progress: number; status: string }) => {
          if (event.jobId === input.jobId) {
            emit.next(event);

            // Auto-complete when progress reaches 100%
            if (event.progress >= 100) {
              emit.complete();
            }
          }
        };

        eventEmitter.on('ai:progress', handler);

        return () => {
          eventEmitter.off('ai:progress', handler);
        };
      });
    }),

  /**
   * Heartbeat subscription
   *
   * Simple ping/pong to verify WebSocket connection is alive.
   * Emits timestamp every N seconds.
   *
   * Useful for:
   * - Connection health monitoring
   * - Keepalive to prevent timeouts
   * - Testing subscription infrastructure
   */
  heartbeat: publicProcedure
    .input(z.object({ intervalMs: z.number().min(1000).max(60000).default(5000) }))
    .subscription(({ input }) => {
      return observable<{ timestamp: string }>((emit) => {
        const interval = setInterval(() => {
          emit.next({ timestamp: new Date().toISOString() });
        }, input.intervalMs);

        return () => {
          clearInterval(interval);
        };
      });
    }),
});

/**
 * Helper Functions to Emit Events
 *
 * These functions are used by other parts of the API to trigger subscription updates.
 * Call these from mutations to notify subscribers of changes.
 */

/**
 * Emit a lead scored event
 *
 * Call this after AI scores a lead to notify all subscribers.
 *
 * @example
 * await scoreLeadWithAI(leadId);
 * emitLeadScored({ leadId, score: 85, confidence: 0.92 });
 */
export function emitLeadScored(event: LeadScoredEvent) {
  eventEmitter.emit('lead:scored', event);
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
export function emitTaskAssigned(event: TaskAssignedEvent) {
  eventEmitter.emit('task:assigned', event);
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
export function emitSystemEvent(event: Omit<SystemEvent, 'timestamp'>) {
  eventEmitter.emit('system:event', { ...event, timestamp: new Date() });
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
export function emitAIProgress(event: { jobId: string; progress: number; status: string }) {
  eventEmitter.emit('ai:progress', event);
}

/**
 * CLIENT-SIDE USAGE EXAMPLE
 *
 * This is how a frontend would consume these subscriptions:
 *
 * ```typescript
 * import { trpc } from './utils/trpc';
 *
 * function LeadScoreWidget({ leadId }) {
 *   const [score, setScore] = useState(null);
 *
 *   useEffect(() => {
 *     // Subscribe to score updates
 *     const subscription = trpc.subscriptions.onLeadScored.subscribe(
 *       { leadId },
 *       {
 *         onData: (data) => {
 *           setScore(data.score);
 *           toast.success(`Lead scored: ${data.score}`);
 *         },
 *         onError: (err) => {
 *           console.error('Subscription error:', err);
 *         },
 *       }
 *     );
 *
 *     // Cleanup on unmount
 *     return () => subscription.unsubscribe();
 *   }, [leadId]);
 *
 *   return <div>Current Score: {score ?? 'Not scored yet'}</div>;
 * }
 * ```
 */

/**
 * WEBSOCKET CONFIGURATION
 *
 * To enable subscriptions, the tRPC server must be configured with WebSocket support:
 *
 * ```typescript
 * import { createWSContext } from './context';
 * import { applyWSSHandler } from '@trpc/server/adapters/ws';
 * import ws from 'ws';
 *
 * const wss = new ws.Server({ port: 3001 });
 *
 * applyWSSHandler({
 *   wss,
 *   router: appRouter,
 *   createContext: createWSContext,
 * });
 *
 * console.log('WebSocket server listening on ws://localhost:3001');
 * ```
 *
 * Client configuration:
 *
 * ```typescript
 * import { createWSClient, wsLink } from '@trpc/client';
 *
 * const wsClient = createWSClient({
 *   url: 'ws://localhost:3001',
 * });
 *
 * const trpcClient = createTRPCClient({
 *   links: [wsLink({ client: wsClient })],
 * });
 * ```
 */

/**
 * PERFORMANCE CONSIDERATIONS
 *
 * 1. Connection Limits
 *    - Each subscription maintains a WebSocket connection
 *    - Limit concurrent connections per server
 *    - Use load balancer for horizontal scaling
 *
 * 2. Memory Usage
 *    - EventEmitter stores listeners in memory
 *    - In production, use Redis Pub/Sub for multi-instance
 *
 * 3. Backpressure
 *    - If client is slow, buffer events or drop old ones
 *    - Implement max buffer size to prevent memory leaks
 *
 * 4. Reconnection
 *    - Client should auto-reconnect on disconnect
 *    - Use exponential backoff for retries
 *
 * 5. Authentication
 *    - Validate user on connection AND on each event
 *    - Rotate tokens to prevent stale connections
 */

/**
 * TESTING SUBSCRIPTIONS
 *
 * Manual testing:
 * 1. Start WebSocket server
 * 2. Connect client and subscribe
 * 3. Trigger events from API (mutations, background jobs)
 * 4. Verify client receives events in real-time
 *
 * Automated testing:
 * ```typescript
 * test('subscription emits events', async () => {
 *   const events: LeadScoredEvent[] = [];
 *
 *   const subscription = await client.subscriptions.onLeadScored.subscribe(
 *     { leadId: 'test_lead' },
 *     {
 *       onData: (data) => events.push(data),
 *     }
 *   );
 *
 *   // Emit test event
 *   emitLeadScored({ leadId: 'test_lead', score: 85, confidence: 0.9 });
 *
 *   // Wait for event
 *   await new Promise((resolve) => setTimeout(resolve, 100));
 *
 *   expect(events).toHaveLength(1);
 *   expect(events[0].score).toBe(85);
 *
 *   subscription.unsubscribe();
 * });
 * ```
 */

/**
 * FUTURE ENHANCEMENTS
 *
 * 1. Filtered Subscriptions
 *    - Subscribe to specific lead statuses
 *    - Subscribe to tasks by priority
 *    - Subscribe to events by date range
 *
 * 2. Batched Events
 *    - Accumulate multiple events
 *    - Send in batches to reduce network overhead
 *
 * 3. Event Replay
 *    - Store events in database
 *    - Allow clients to replay missed events
 *    - Useful for offline-first applications
 *
 * 4. Event Schemas
 *    - Validate event payloads with Zod
 *    - Version events for backwards compatibility
 *    - Document events in shared types package
 */

export default subscriptionRouter;
