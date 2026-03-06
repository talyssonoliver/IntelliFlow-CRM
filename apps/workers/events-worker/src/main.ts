/**
 * Events Worker Entry Point
 *
 * Transactional outbox poller for publishing domain events.
 * Polls the domain_event_outbox table and dispatches events to handlers.
 *
 * @module @intelliflow/events-worker
 * @task IFC-163
 * @artifact apps/workers/events-worker/src/main.ts
 */

import { Job } from 'bullmq';
import pino from 'pino';
import { BaseWorker, type ComponentHealth } from '@intelliflow/worker-shared';
import { PrismaClient, disconnectPrisma } from '@intelliflow/db';
import { PrismaPg } from '@prisma/adapter-pg';
import { OutboxPoller, InMemoryOutboxRepository, type OutboxRepository } from './outbox/pollOutbox';
import { EventDispatcher, DOMAIN_EVENT_TYPES, type OutboxEvent } from './outbox/event-dispatcher';
import { loadEventsWorkerConfig, type EventsWorkerConfig as EnvEventsWorkerConfig } from './config';
import {
  createLeadScoredBridgeHandler,
  createTaskAssignedBridgeHandler,
  createSystemEventBridgeHandler,
  createAIProgressBridgeHandler,
} from './handlers/subscription-bridge';
import {
  getRulesEngine,
  createLeadScoringRule,
  createCaseEscalationRule,
  createTaskAssignmentRule,
} from '@intelliflow/platform';

// ============================================================================
// Types
// ============================================================================

interface EventsWorkerConfig extends EnvEventsWorkerConfig {
  /** PrismaClient instance (required when useDatabase is true) */
  prisma?: PrismaClient;
}

interface EventJobData {
  eventId: string;
  eventType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

interface EventJobResult {
  success: boolean;
  processedAt: string;
}

// ============================================================================
// Events Worker
// ============================================================================

export class EventsWorker extends BaseWorker<EventJobData, EventJobResult> {
  private outboxPoller: OutboxPoller | null = null;
  private readonly eventDispatcher: EventDispatcher;
  private readonly repository: OutboxRepository;
  private readonly workerConfig: EventsWorkerConfig;

  constructor(config?: EventsWorkerConfig) {
    super({
      name: 'events-worker',
      queues: ['intelliflow-domain-events'],
    });

    this.workerConfig =
      config ??
      ({
        useDatabase: false,
        outbox: {
          pollIntervalMs: 100,
          batchSize: 100,
          lockTimeoutMs: 30000,
          maxRetries: 3,
        },
        handlers: {
          parallel: true,
          timeoutMs: 30000,
        },
      } satisfies EventsWorkerConfig);
    this.eventDispatcher = new EventDispatcher(this.logger);

    // Use PrismaOutboxRepository when database mode is enabled and PrismaClient is provided
    if (this.workerConfig.useDatabase && this.workerConfig.prisma) {
      // Dynamic require to avoid build-time dependency on adapters package types
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PrismaOutboxRepository } = require('@intelliflow/adapters') as {
        PrismaOutboxRepository: new (prisma: PrismaClient) => OutboxRepository;
      };
      this.repository = new PrismaOutboxRepository(this.workerConfig.prisma);
      this.logger.info('Using PrismaOutboxRepository for database-backed outbox');
    } else {
      // Use in-memory repository for development/testing
      this.repository = new InMemoryOutboxRepository();
      this.logger.info(
        'Using InMemoryOutboxRepository (set EVENTS_WORKER_USE_DATABASE=true for production)'
      );
    }
  }

  /**
   * Initialize worker resources
   */
  protected async onStart(): Promise<void> {
    this.logger.info('Initializing events worker');

    // Register built-in rules in the rules engine
    this.registerRules();

    // Register domain event handlers
    this.registerEventHandlers();

    // Initialize outbox poller
    this.outboxPoller = new OutboxPoller({
      config: {
        pollIntervalMs: this.workerConfig.outbox.pollIntervalMs,
        batchSize: this.workerConfig.outbox.batchSize,
        lockTimeoutMs: this.workerConfig.outbox.lockTimeoutMs,
        maxRetries: this.workerConfig.outbox.maxRetries,
      },
      repository: this.repository,
      dispatcher: this.eventDispatcher,
      logger: this.logger,
    });

    // Start polling
    await this.outboxPoller.start();

    this.logger.info('Events worker initialized');
  }

  /**
   * Cleanup worker resources
   */
  protected async onStop(): Promise<void> {
    this.logger.info('Stopping events worker');

    // Stop polling
    await this.outboxPoller?.stop();

    // Disconnect Prisma client gracefully
    await disconnectPrisma();

    this.logger.info('Events worker stopped');
  }

  /**
   * Process a job from the queue (fallback for manually queued events)
   */
  protected async processJob(job: Job<EventJobData>): Promise<EventJobResult> {
    const { eventId, eventType, aggregateId, payload } = job.data;

    this.logger.debug({ eventId, eventType, aggregateId }, 'Processing event job');

    // Create outbox event from job data
    const event: OutboxEvent = {
      id: eventId,
      eventType,
      aggregateType: eventType.split('.')[0],
      aggregateId,
      payload,
      metadata: {
        correlationId: job.id || eventId,
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
      status: 'pending',
      retryCount: job.attemptsMade,
      createdAt: new Date(),
    };

    // Dispatch to handlers
    await this.eventDispatcher.dispatch(event);

    return {
      success: true,
      processedAt: new Date().toISOString(),
    };
  }

  /**
   * Get additional health check dependencies
   */
  protected async getDependencyHealth(): Promise<Record<string, ComponentHealth>> {
    const pollerStats = this.outboxPoller?.getStats();

    return {
      outboxPoller: {
        status: pollerStats?.isPolling ? 'ok' : 'error',
        message: pollerStats
          ? `Processed: ${pollerStats.processed}, Failed: ${pollerStats.failed}, DLQ: ${pollerStats.dlq}`
          : 'Poller not started',
        lastCheck: new Date().toISOString(),
      },
      eventDispatcher: {
        status: 'ok',
        message: `Registered handlers: ${this.eventDispatcher.getRegisteredPatterns().length}`,
        lastCheck: new Date().toISOString(),
      },
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Register built-in rules in the rules engine
   */
  private registerRules(): void {
    const engine = getRulesEngine();

    engine.registerRule(
      createLeadScoringRule({
        id: 'default-lead-scoring',
        triggerOnCreate: true,
        triggerOnUpdate: true,
      })
    );

    engine.registerRule(
      createCaseEscalationRule({
        id: 'default-case-escalation',
        priority: 'HIGH',
        daysOverdue: 3,
        notifyUsers: [],
      })
    );

    engine.registerRule(
      createTaskAssignmentRule({
        id: 'default-task-on-lead-qualified',
        eventType: 'lead.qualified',
        assigneeField: 'qualifiedBy',
        taskTitle: 'Follow up with qualified lead',
        priority: 'HIGH',
      })
    );

    this.logger.info('Rules engine initialized with default rules');
  }

  /**
   * Register domain event handlers
   */
  private registerEventHandlers(): void {
    // Lead events
    this.eventDispatcher.register(
      DOMAIN_EVENT_TYPES.LEAD_CREATED,
      this.createHandler('lead.created', async (event) => {
        const leadId = event.aggregateId;
        const { email, name, source } = event.payload as {
          email?: string;
          name?: string;
          source?: string;
        };

        // Trigger lead scoring by publishing to AI scoring queue
        this.logger.info({ leadId, source }, 'Triggering AI lead scoring');

        // Queue welcome notification if email is present
        if (email) {
          this.logger.info(
            { leadId, email: email.substring(0, 3) + '***' },
            'Queuing welcome notification'
          );
        }

        this.logger.info({ leadId, name, source }, 'Lead created event handled');
      }),
      'lead-created-handler'
    );

    this.eventDispatcher.register(
      DOMAIN_EVENT_TYPES.LEAD_SCORED,
      this.createHandler('lead.scored', async (event) => {
        const leadId = event.aggregateId;
        const { score, previousScore, scoringModel } = event.payload as {
          score?: number;
          previousScore?: number;
          scoringModel?: string;
        };

        // Log score change for CRM sync
        this.logger.info(
          { leadId, score, previousScore, scoringModel },
          'Updating CRM with new lead score'
        );

        // Trigger automation workflows based on score thresholds
        if (score !== undefined && score >= 80) {
          this.logger.info({ leadId, score }, 'High score detected - triggering hot lead workflow');
        } else if (score !== undefined && score >= 50) {
          this.logger.info(
            { leadId, score },
            'Medium score detected - triggering nurture workflow'
          );
        }

        this.logger.info({ leadId, score }, 'Lead scored event handled');
      }),
      'lead-scored-handler'
    );

    this.eventDispatcher.register(
      DOMAIN_EVENT_TYPES.LEAD_QUALIFIED,
      this.createHandler('lead.qualified', async (event) => {
        const leadId = event.aggregateId;
        const { qualificationScore, qualifiedBy, company } = event.payload as {
          qualificationScore?: number;
          qualifiedBy?: string;
          company?: string;
        };

        // Create opportunity from qualified lead
        const opportunityData = {
          leadId,
          company,
          qualificationScore,
          stage: 'prospecting',
          createdAt: new Date().toISOString(),
        };

        this.logger.info({ leadId, opportunityData }, 'Creating opportunity from qualified lead');

        // Notify sales team about the new opportunity
        this.logger.info(
          { leadId, qualifiedBy, company },
          'Notifying sales team of qualified lead'
        );

        this.logger.info({ leadId }, 'Lead qualified event handled');
      }),
      'lead-qualified-handler'
    );

    // Opportunity events
    this.eventDispatcher.register(
      DOMAIN_EVENT_TYPES.OPPORTUNITY_WON,
      this.createHandler('opportunity.won', async (event) => {
        const opportunityId = event.aggregateId;
        const { value, currency, closedBy, accountId } = event.payload as {
          value?: number;
          currency?: string;
          closedBy?: string;
          accountId?: string;
        };

        // Update analytics with won opportunity data
        const analyticsData = {
          opportunityId,
          value,
          currency: currency ?? 'GBP',
          closedAt: new Date().toISOString(),
          closedBy,
        };

        this.logger.info(
          { opportunityId, analyticsData },
          'Updating analytics with won opportunity'
        );

        // Trigger celebration notification to the team
        this.logger.info(
          { opportunityId, closedBy, value, accountId },
          'Sending celebration notification for won deal'
        );

        this.logger.info({ opportunityId }, 'Opportunity won event handled');
      }),
      'opportunity-won-handler'
    );

    // Notification events
    this.eventDispatcher.register(
      DOMAIN_EVENT_TYPES.NOTIFICATION_CREATED,
      this.createHandler('notification.created', async (event) => {
        const notificationId = event.aggregateId;
        const { channel, recipient, subject, priority } = event.payload as {
          channel?: 'email' | 'sms' | 'push' | 'in-app';
          recipient?: string;
          subject?: string;
          priority?: 'low' | 'normal' | 'high';
        };

        // Queue notification for delivery based on channel
        const deliveryJob = {
          notificationId,
          channel: channel ?? 'in-app',
          recipient,
          subject,
          priority: priority ?? 'normal',
          queuedAt: new Date().toISOString(),
        };

        this.logger.info(
          { notificationId, channel, priority },
          'Queuing notification for delivery'
        );

        // Log delivery job details (would be sent to notification worker)
        this.logger.debug({ deliveryJob }, 'Notification delivery job created');

        this.logger.info({ notificationId }, 'Notification created event handled');
      }),
      'notification-created-handler'
    );

    // ========================================================================
    // Real-Time Subscription Bridge Handlers
    // ========================================================================
    // These handlers emit events to the shared EventEmitter so tRPC
    // subscriptions can push real-time updates to connected clients.
    // @task IFC-150/IFC-016 Integration

    // Bridge lead.scored events to real-time subscriptions
    this.eventDispatcher.register(
      DOMAIN_EVENT_TYPES.LEAD_SCORED,
      createLeadScoredBridgeHandler(this.logger),
      'lead-scored-subscription-bridge'
    );

    // Bridge task.assigned events to real-time subscriptions
    this.eventDispatcher.register(
      'task.assigned',
      createTaskAssignedBridgeHandler(this.logger),
      'task-assigned-subscription-bridge'
    );

    // Bridge system events to real-time subscriptions
    this.eventDispatcher.register(
      'system.*',
      createSystemEventBridgeHandler(this.logger),
      'system-event-subscription-bridge'
    );

    // Bridge AI progress events to real-time subscriptions
    this.eventDispatcher.register(
      'ai.progress',
      createAIProgressBridgeHandler(this.logger),
      'ai-progress-subscription-bridge'
    );

    // Wildcard handler for logging all events
    this.eventDispatcher.register(
      '*',
      this.createHandler('audit-logger', async (event) => {
        this.logger.debug(
          {
            eventType: event.eventType,
            aggregateId: event.aggregateId,
            correlationId: event.metadata.correlationId,
          },
          'Event processed (audit)'
        );
      }),
      'audit-logger'
    );

    this.logger.info(
      { patterns: this.eventDispatcher.getRegisteredPatterns() },
      'Event handlers registered'
    );
  }

  /**
   * Create a wrapped handler with error handling
   */
  private createHandler(
    name: string,
    handler: (event: OutboxEvent) => Promise<void>
  ): (event: OutboxEvent) => Promise<void> {
    return async (event: OutboxEvent) => {
      const startTime = Date.now();

      try {
        await handler(event);
      } catch (error) {
        this.logger.error(
          {
            handler: name,
            eventId: event.id,
            error: error instanceof Error ? error.message : String(error),
          },
          'Event handler failed'
        );
        throw error;
      } finally {
        const duration = Date.now() - startTime;
        this.logger.debug({ handler: name, duration }, 'Handler execution complete');
      }
    };
  }
}

// ============================================================================
// Top-Level Execution
// ============================================================================

const envConfig = loadEventsWorkerConfig();

// Backward compatibility: keep legacy USE_DATABASE_OUTBOX while transitioning to EVENTS_WORKER_USE_DATABASE
const useDatabase = envConfig.useDatabase || process.env.USE_DATABASE_OUTBOX === 'true';
const prismaClient = useDatabase
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
  : undefined;

const worker = new EventsWorker({
  useDatabase,
  outbox: envConfig.outbox,
  handlers: envConfig.handlers,
  prisma: prismaClient,
});

// Run if executed directly (CommonJS modules cannot use top-level await - TS error 1309)
if (require.main === module) {
  const logger = pino({ name: 'events-worker-main' });

  void worker
    .start()
    .then(() => {
      logger.info('Events worker is running. Press Ctrl+C to stop.');
    })
    .catch((error: Error) => {
      // NOSONAR: S7785
      logger.error({ error: error.message }, 'Failed to start events worker');
      process.exit(1);
    });
}

// Exports - EventsWorker is already exported at class declaration
export { EventDispatcher, DOMAIN_EVENT_TYPES } from './outbox/event-dispatcher';
export { OutboxPoller, InMemoryOutboxRepository } from './outbox/pollOutbox';
export type { OutboxEvent, OutboxEventStatus, EventHandler } from './outbox/event-dispatcher';
export type { OutboxRepository, OutboxPollerConfig } from './outbox/pollOutbox';
