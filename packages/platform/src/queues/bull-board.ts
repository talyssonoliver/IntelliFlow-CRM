/**
 * Bull Board Dashboard Integration
 *
 * Provides Bull Board setup for monitoring BullMQ queues with:
 * - Queue adapter configuration
 * - Express/Fastify middleware integration
 * - Custom theming and branding
 */

import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import type { Queue } from 'bullmq';
import { queueRegistry } from './queue-factory';
import { QUEUE_NAMES } from './types';

// ============================================================================
// Bull Board Configuration
// ============================================================================

/**
 * Bull Board configuration options
 */
export interface BullBoardConfig {
  /** Base path for the dashboard (default: '/admin/queues') */
  basePath?: string;
  /** Page title for the dashboard */
  title?: string;
  /** Logo URL for branding */
  logoUrl?: string;
  /** Favicon URL */
  faviconUrl?: string;
  /** Custom CSS */
  customCss?: string;
  /** Read-only mode (disables job actions) */
  readOnly?: boolean;
}

const DEFAULT_CONFIG: BullBoardConfig = {
  basePath: '/admin/queues',
  title: 'IntelliFlow CRM - Job Queue Dashboard',
  readOnly: false,
};

// ============================================================================
// Bull Board Setup
// ============================================================================

/**
 * Bull Board instance holder
 */
let bullBoardInstance: ReturnType<typeof createBullBoard> | null = null;

/**
 * Create Bull Board adapters for all registered queues
 */
export function createQueueAdapters(): BullMQAdapter[] {
  const queues = queueRegistry.getQueues();
  const adapters: BullMQAdapter[] = [];

  for (const [, queue] of queues) {
    adapters.push(new BullMQAdapter(queue));
  }

  return adapters;
}

/**
 * Add a queue to Bull Board dynamically
 */
export function addQueueToBullBoard(queue: Queue): void {
  if (bullBoardInstance) {
    bullBoardInstance.addQueue(new BullMQAdapter(queue));
  }
}

/**
 * Remove a queue from Bull Board
 */
export function removeQueueFromBullBoard(queueName: string): void {
  if (bullBoardInstance) {
    bullBoardInstance.removeQueue(queueName);
  }
}

/**
 * Set up Bull Board with all queues
 * Returns the configured Bull Board instance
 */
export function setupBullBoard(
  config: BullBoardConfig = {}
): ReturnType<typeof createBullBoard> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // Create adapters for all known queues
  const adapters = createQueueAdapters();

  // Create Bull Board instance
  bullBoardInstance = createBullBoard({
    queues: adapters,
    serverAdapter: undefined as any, // Will be set by the framework-specific adapter
  });

  return bullBoardInstance;
}

/**
 * Get the current Bull Board instance
 */
export function getBullBoardInstance(): ReturnType<typeof createBullBoard> | null {
  return bullBoardInstance;
}

// ============================================================================
// Express Middleware Setup
// ============================================================================

/**
 * Creates Express middleware for Bull Board
 * Usage:
 * ```
 * import { ExpressAdapter } from '@bull-board/express';
 * const serverAdapter = new ExpressAdapter();
 * setupBullBoardExpress(serverAdapter, config);
 * app.use('/admin/queues', serverAdapter.getRouter());
 * ```
 */
export function configureBullBoardForExpress<T extends { setBasePath: (path: string) => void }>(
  serverAdapter: T,
  config: BullBoardConfig = {}
): void {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  serverAdapter.setBasePath(mergedConfig.basePath || '/admin/queues');

  const adapters = createQueueAdapters();

  bullBoardInstance = createBullBoard({
    queues: adapters,
    serverAdapter: serverAdapter as any,
  });
}

// ============================================================================
// Fastify Plugin Setup
// ============================================================================

/**
 * Creates Fastify plugin for Bull Board
 * Usage:
 * ```
 * import { FastifyAdapter } from '@bull-board/fastify';
 * const serverAdapter = new FastifyAdapter();
 * configureBullBoardForFastify(serverAdapter, config);
 * await fastify.register(serverAdapter.registerPlugin());
 * ```
 */
export function configureBullBoardForFastify<T extends { setBasePath: (path: string) => void }>(
  serverAdapter: T,
  config: BullBoardConfig = {}
): void {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  serverAdapter.setBasePath(mergedConfig.basePath || '/admin/queues');

  const adapters = createQueueAdapters();

  bullBoardInstance = createBullBoard({
    queues: adapters,
    serverAdapter: serverAdapter as any,
  });
}

// ============================================================================
// Dashboard Information
// ============================================================================

/**
 * Get dashboard information for display
 */
export function getDashboardInfo(): {
  title: string;
  queueCount: number;
  queues: string[];
  features: string[];
} {
  return {
    title: 'IntelliFlow CRM - Job Queue Dashboard',
    queueCount: queueRegistry.getQueues().size,
    queues: Array.from(queueRegistry.getQueues().keys()),
    features: [
      'Real-time job monitoring',
      'Job retry and removal',
      'Queue pause/resume',
      'Job data inspection',
      'Processing metrics',
      'Error stack traces',
    ],
  };
}

/**
 * Get Bull Board dashboard screenshot description
 * (Used for documentation/artifact generation)
 */
export function getBullBoardScreenshotDescription(): {
  description: string;
  components: string[];
  layout: string;
} {
  return {
    description: `
Bull Board Dashboard for IntelliFlow CRM Job Queues

The dashboard provides a comprehensive view of all BullMQ job queues in the system,
including real-time monitoring, job management, and performance metrics.

Dashboard URL: http://localhost:3000/admin/queues (when API server is running)
    `.trim(),
    components: [
      'Queue List Sidebar - Shows all registered queues (AI Scoring, Email Notifications, Webhook Delivery)',
      'Queue Summary Cards - Active, Waiting, Completed, Failed job counts',
      'Jobs Table - Paginated list of jobs with ID, Status, Progress, Timestamps',
      'Job Details Panel - Full job data, logs, and error stack traces',
      'Action Buttons - Retry, Remove, Pause/Resume queue controls',
      'Metrics Charts - Processing rate, latency distribution (when enabled)',
    ],
    layout: `
+------------------------------------------+
|  IntelliFlow CRM - Job Queue Dashboard   |
+------------------------------------------+
|        |                                 |
| Queues |  Queue: intelliflow:ai-scoring  |
|--------|                                 |
| > AI   |  [Active: 5] [Waiting: 12]      |
|   Scor |  [Completed: 1,234] [Failed: 8] |
|        |                                 |
| > Email|  +---------------------------+  |
|   Noti |  | ID | Status | Created    |  |
|        |  |----+--------+------------|  |
| > Web  |  | 42 | active | 2 min ago  |  |
|   hook |  | 41 | done   | 5 min ago  |  |
|        |  | 40 | done   | 8 min ago  |  |
|        |  +---------------------------+  |
|        |                                 |
|        |  [Pause Queue] [Clean Jobs]     |
+------------------------------------------+
    `.trim(),
  };
}
