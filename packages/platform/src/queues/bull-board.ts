/**
 * Bull Board Dashboard Integration
 *
 * Provides Bull Board setup for monitoring BullMQ queues with:
 * - Queue adapter configuration
 * - Express/Fastify middleware integration
 * - Custom theming and branding
 *
 * @bull-board/api is loaded lazily via dynamic import so that consumers
 * who only need connection/retry utilities (e.g. Next.js tRPC route)
 * never trigger a resolution of this server-only dependency.
 */

import type { Queue } from 'bullmq';
import type { createBullBoard } from '@bull-board/api';
import type { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { queueRegistry } from './queue-factory';

type BullBoardReturn = ReturnType<typeof createBullBoard>;
type BullMQAdapterClass = typeof BullMQAdapter;

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
// Lazy loader for @bull-board/api
// ============================================================================

async function loadBullBoard(): Promise<{
  createBullBoard: typeof createBullBoard;
  BullMQAdapter: BullMQAdapterClass;
}> {
  const [bullBoardApi, bullMQAdapter] = await Promise.all([
    import('@bull-board/api'),
    import('@bull-board/api/bullMQAdapter'),
  ]);
  return {
    createBullBoard: bullBoardApi.createBullBoard,
    BullMQAdapter: bullMQAdapter.BullMQAdapter,
  };
}

// ============================================================================
// Bull Board Setup
// ============================================================================

/**
 * Bull Board instance holder
 */
let bullBoardInstance: BullBoardReturn | null = null;

/**
 * Create Bull Board adapters for all registered queues
 */
export async function createQueueAdapters() {
  const { BullMQAdapter } = await loadBullBoard();
  const queues = queueRegistry.getQueues();
  const adapters: InstanceType<typeof BullMQAdapter>[] = [];

  for (const [, queue] of queues) {
    adapters.push(new BullMQAdapter(queue));
  }

  return adapters;
}

/**
 * Add a queue to Bull Board dynamically
 */
export async function addQueueToBullBoard(queue: Queue): Promise<void> {
  if (bullBoardInstance) {
    const { BullMQAdapter } = await loadBullBoard();
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
export async function setupBullBoard(config: BullBoardConfig = {}) {
  const { createBullBoard } = await loadBullBoard();
  // Create adapters for all known queues
  const adapters = await createQueueAdapters();

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
export function getBullBoardInstance() {
  return bullBoardInstance;
}

// ============================================================================
// Express/Fastify Middleware Setup
// ============================================================================

/**
 * Creates middleware for Bull Board with a framework-specific adapter
 * Usage:
 * ```
 * import { ExpressAdapter } from '@bull-board/express';
 * const serverAdapter = new ExpressAdapter();
 * await configureBullBoard(serverAdapter, config);
 * app.use('/admin/queues', serverAdapter.getRouter());
 * ```
 */
async function configureBullBoard<T extends { setBasePath: (path: string) => void }>(
  serverAdapter: T,
  config: BullBoardConfig = {}
): Promise<void> {
  const { createBullBoard } = await loadBullBoard();
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  serverAdapter.setBasePath(mergedConfig.basePath || '/admin/queues');

  const adapters = await createQueueAdapters();

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
| Queues |  Queue: ai-scoring              |
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
