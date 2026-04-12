/**
 * Events Worker Configuration
 *
 * @module events-worker/config
 * @task IFC-163
 */

import { z } from 'zod';

export const EventsWorkerConfigSchema = z.object({
  /** Use database repository instead of in-memory */
  useDatabase: z.boolean().default(false),

  /** Outbox polling configuration */
  outbox: z.object({
    /** Polling interval in milliseconds */
    pollIntervalMs: z.number().int().min(10).max(10000).default(100),
    /** Maximum events to fetch per poll */
    batchSize: z.number().int().min(1).max(1000).default(100),
    /** Lock timeout for events being processed */
    lockTimeoutMs: z.number().int().min(1000).default(30000),
    /** Maximum retry attempts before DLQ */
    maxRetries: z.number().int().min(1).max(10).default(3),
  }),

  /** Event handler configuration */
  handlers: z.object({
    /** Enable parallel handler execution */
    parallel: z.boolean().default(true),
    /** Handler execution timeout in milliseconds */
    timeoutMs: z.number().int().min(1000).default(30000),
  }),
});

export type EventsWorkerConfig = z.infer<typeof EventsWorkerConfigSchema>;

export function loadEventsWorkerConfig(): EventsWorkerConfig {
  return EventsWorkerConfigSchema.parse({
    useDatabase: process.env.EVENTS_WORKER_USE_DATABASE === 'true',
    outbox: {
      pollIntervalMs: Number.parseInt(process.env.OUTBOX_POLL_INTERVAL_MS ?? '100', 10),
      batchSize: Number.parseInt(process.env.OUTBOX_BATCH_SIZE ?? '100', 10),
      lockTimeoutMs: Number.parseInt(process.env.OUTBOX_LOCK_TIMEOUT_MS ?? '30000', 10),
      maxRetries: Number.parseInt(process.env.OUTBOX_MAX_RETRIES ?? '3', 10),
    },
    handlers: {
      parallel: process.env.EVENTS_HANDLER_PARALLEL !== 'false',
      timeoutMs: Number.parseInt(process.env.EVENTS_HANDLER_TIMEOUT_MS ?? '30000', 10),
    },
  });
}
