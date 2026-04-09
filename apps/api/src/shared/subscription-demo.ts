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
import {
  getRealtimeEmitter,
  REALTIME_CHANNELS,
  type LeadScoredEvent,
  type TaskAssignedEvent,
  type SystemEvent,
  // Re-export emit functions from platform for API consumers
  emitLeadScored,
  emitTaskAssigned,
  emitSystemEvent,
  emitAIProgress,
} from '@intelliflow/platform/realtime';

/**
 * Shared EventEmitter from @intelliflow/platform
 *
 * This allows both API and events-worker to share the same EventEmitter
 * for real-time subscriptions in a single-process deployment.
 *
 * For multi-instance deployments, replace with:
 * - Redis Pub/Sub for cross-instance communication
 * - RabbitMQ for complex event routing
 */
const eventEmitter = getRealtimeEmitter();

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

        eventEmitter.on(REALTIME_CHANNELS.LEAD_SCORED, handler);

        // Cleanup on unsubscribe
        return () => {
          eventEmitter.off(REALTIME_CHANNELS.LEAD_SCORED, handler);
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

      eventEmitter.on(REALTIME_CHANNELS.TASK_ASSIGNED, handler);

      return () => {
        eventEmitter.off(REALTIME_CHANNELS.TASK_ASSIGNED, handler);
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

      eventEmitter.on(REALTIME_CHANNELS.SYSTEM_EVENT, handler);

      return () => {
        eventEmitter.off(REALTIME_CHANNELS.SYSTEM_EVENT, handler);
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

        eventEmitter.on(REALTIME_CHANNELS.AI_PROGRESS, handler);

        return () => {
          eventEmitter.off(REALTIME_CHANNELS.AI_PROGRESS, handler);
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
 * Re-exported Emit Functions from @intelliflow/platform/realtime
 *
 * These functions are used by other parts of the API to trigger subscription updates.
 * Call these from mutations to notify subscribers of changes.
 *
 * - emitLeadScored: Emit when AI scores a lead
 * - emitTaskAssigned: Emit when a task is assigned
 * - emitSystemEvent: Emit system-wide notifications
 * - emitAIProgress: Emit AI processing progress
 *
 * @see @intelliflow/platform/realtime for function signatures
 */
export {
  emitLeadScored,
  emitTaskAssigned,
  emitSystemEvent,
  emitAIProgress,
} from '@intelliflow/platform/realtime';

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
