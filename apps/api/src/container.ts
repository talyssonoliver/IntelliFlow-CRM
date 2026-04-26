/**
 * Dependency Injection Container
 *
 * Creates and wires up all services with their dependencies following
 * hexagonal architecture. Services depend on ports (interfaces), and
 * this container provides concrete adapter implementations.
 */

import { prisma as sharedPrisma, type PrismaClient } from '@intelliflow/db';
import {
  PrismaLeadRepository,
  PrismaContactRepository,
  PrismaAccountRepository,
  PrismaOpportunityRepository,
  PrismaTaskRepository,
  PrismaChainVersionRepository,
  PrismaChainVersionAuditRepository,
  PrismaActivityFeedRepository,
  PrismaTenantModuleRepository,
  PrismaAnalyticsRepository,
  PrismaFeedbackSurveyRepository,
  PrismaPublicFeedbackRepository,
  PrismaCaseDocumentRepository,
  PrismaNotificationRepository,
  PrismaNotificationPreferenceRepository,
  PrismaNotificationAuditLogger,
  PrismaExperimentRepository,
  PrismaAppointmentRepository,
  PrismaConversationSearchRepository,
  InMemoryEventBus,
  MockAIService,
  OllamaAIService,
  LiteLLMAIService,
  InMemoryCache,
  RedisCacheAdapter,
  type RedisLike,
  GuardrailsAIService,
  DurableAuditLogAdapter,
  FeatureFlagAdapter,
  SupabaseStorageAdapter,
  NoOpAVScanner,
  ClamAVScanner,
  MockNotificationServiceAdapter,
  RealNotificationServiceAdapter,
  createEmailServiceAdapter,
  IcsGenerationService,
  CalendarSyncServiceAdapter,
} from '@intelliflow/adapters';
import { InMemoryFeatureFlagProvider } from '@intelliflow/platform/feature-flags';
import { TicketService } from './services/TicketService';
import { TicketRoutingService } from './services/TicketRoutingService';
import { LeadRoutingService } from './services/LeadRoutingService';
import {
  LeadService,
  ContactService,
  AccountService,
  OpportunityService,
  TaskService,
  ChainVersionService,
  ActivityFeedService,
  AnalyticsAggregationService,
  FeedbackSurveyAnalyticsService,
  InternalSignatureProvider,
  IngestionOrchestrator,
  AppointmentIcsEventHandler,
  ReminderSchedulerService,
  ConvertLeadToDealUseCase,
  CloseDealWonUseCase,
  CloseDealLostUseCase,
  ScheduleAppointmentUseCase,
  RescheduleAppointmentUseCase,
  CancelAppointmentUseCase,
  CompleteAppointmentUseCase,
  CheckConflictsUseCase,
  ExperimentService,
  NotificationService,
  ConversationSearchService,
} from '@intelliflow/application';
import {
  getAuditLogger,
  getRBACService,
  getEncryptionService,
  getKeyRotationService,
  getAuditEventHandler,
} from './security';
import { loadFeatureFlagsConfig } from './config/feature-flags.config';
import { CalendarWebhookService } from './modules/calendar/calendar-webhook.service';
import { AIMonitoringService } from './services/AIMonitoringService';
import { HomeCacheService } from './modules/home/home.cache';
import { PublicFeedbackService } from './modules/public-feedback/public-feedback.service';
import type { CachePort } from '@intelliflow/application';
// IFC-310: Duplicate-detection runtime services
import {
  createContactDuplicateDetectionService,
  type ContactDuplicateDetectionService,
} from './modules/contact/contact-duplicate-detection.service';
import {
  createAccountDuplicateDetectionService,
  type AccountDuplicateDetectionService,
} from './modules/account/account-duplicate-detection.service';

/**
 * IFC-310: Generate an embedding for the check-time query contact.
 *
 * Calls LiteLLM proxy (preferred) or OpenAI directly via plain fetch so the
 * apps/api process can synthesize the query-side embedding without importing
 * the ai-worker package (cross-app dep) or LangChain (heavy bundle bloat).
 *
 * Returns null when no provider is configured OR when the HTTP call fails —
 * the detection service gracefully degrades to deterministic-only per AC-008.
 */
async function generateContactQueryEmbedding(text: string): Promise<number[] | null> {
  if (!text || text.length === 0) return null;

  const litellmBase = process.env.LITELLM_BASE_URL;
  const litellmKey = process.env.LITELLM_MASTER_KEY;
  const openAIKey = process.env.OPENAI_API_KEY;
  const model = process.env.EMBEDDING_MODEL_API || 'text-embedding-ada-002';

  let endpoint: string;
  let authHeader: string;

  if (litellmBase && litellmKey) {
    endpoint = `${litellmBase.replace(/\/$/, '')}/embeddings`;
    authHeader = `Bearer ${litellmKey}`;
  } else if (openAIKey) {
    endpoint = 'https://api.openai.com/v1/embeddings';
    authHeader = `Bearer ${openAIKey}`;
  } else {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ model, input: text }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
    const vec = body.data?.[0]?.embedding;
    return Array.isArray(vec) && vec.length > 0 ? vec : null;
  } catch {
    return null;
  }
}

/**
 * Get the API Prisma client.
 *
 * Uses the shared singleton from @intelliflow/db so all API modules reuse a single
 * PrismaClient instance (avoids connection exhaustion in Next.js dev/HMR).
 */
// M4 encryption is ACTIVE — sharedPrisma from @intelliflow/db is the
// $extends(fieldEncryptionExtension()) client (AES-256-GCM, bespoke).
// The `as unknown as` cast aligns the extended type with PrismaClient for callers.
export const getApiPrisma = (): PrismaClient => sharedPrisma as unknown as PrismaClient;

/**
 * Direct export for backward compatibility
 * Note: This triggers lazy initialization on first import
 */
export const apiPrisma = getApiPrisma();

/**
 * IFC-196: Create the cache adapter used across the API.
 *
 * Prefers RedisCacheAdapter when Redis is available; falls back to InMemoryCache
 * in test/dev environments where Redis isn't running. RedisCacheAdapter methods
 * swallow connection errors internally, so a misconfigured URL just degrades
 * cache hit rate without breaking the API.
 */
function createCacheAdapter(): CachePort {
  if (process.env.DISABLE_HOME_CACHE === '1') {
    return new InMemoryCache();
  }
  if (process.env.NODE_ENV === 'test' && !process.env.REDIS_HOST) {
    return new InMemoryCache();
  }
  try {
    // Lazy require so environments without ioredis don't fail at import.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const IORedis = require('ioredis');
    const RedisCtor = IORedis.default ?? IORedis;
    const client = new RedisCtor({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      db: Number.parseInt(process.env.REDIS_DB || '0', 10),
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    }) as RedisLike;
    return new RedisCacheAdapter(client, {
      keyPrefix: 'ifc:',
      onError: (op, key, err) => {
        console.warn('[cache] redis', op, key, err instanceof Error ? err.message : err);
      },
    });
  } catch (err) {
    console.warn(
      '[cache] ioredis unavailable — falling back to InMemoryCache',
      err instanceof Error ? err.message : err
    );
    return new InMemoryCache();
  }
}

/**
 * Create singleton instances of adapters
 * @param prismaClient - Prisma client instance to use for repositories
 */
const createAdapters = (prismaClient: PrismaClient) => {
  // Repositories (Prisma implementations)
  const leadRepository = new PrismaLeadRepository(prismaClient);
  const contactRepository = new PrismaContactRepository(prismaClient);
  const accountRepository = new PrismaAccountRepository(prismaClient);
  const opportunityRepository = new PrismaOpportunityRepository(prismaClient);
  const taskRepository = new PrismaTaskRepository(prismaClient);
  const chainVersionRepository = new PrismaChainVersionRepository(prismaClient);
  const chainVersionAuditRepository = new PrismaChainVersionAuditRepository(prismaClient);
  const activityFeedRepository = new PrismaActivityFeedRepository(prismaClient);
  const analyticsRepository = new PrismaAnalyticsRepository(prismaClient);
  const feedbackSurveyRepository = new PrismaFeedbackSurveyRepository(prismaClient);
  const publicFeedbackRepository = new PrismaPublicFeedbackRepository(prismaClient);
  const caseDocumentRepository = new PrismaCaseDocumentRepository(prismaClient);
  const tenantModuleRepository = new PrismaTenantModuleRepository(prismaClient);
  const notificationRepository = new PrismaNotificationRepository(prismaClient);
  const notificationPreferenceRepository = new PrismaNotificationPreferenceRepository(prismaClient);
  const notificationAuditLogger = new PrismaNotificationAuditLogger(prismaClient);
  const experimentRepository = new PrismaExperimentRepository(prismaClient);
  const appointmentRepository = new PrismaAppointmentRepository(prismaClient);

  // Storage & AV (IFC-094)
  const storageService = new SupabaseStorageAdapter(
    process.env.SUPABASE_URL || 'http://localhost:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev-service-key'
  );

  // AV Scanner (addressing audit finding)
  const clamAvHost = process.env.CLAMAV_HOST;
  const clamAvPort = process.env.CLAMAV_PORT ? parseInt(process.env.CLAMAV_PORT, 10) : 3310;
  const avScanner = clamAvHost
    ? new ClamAVScanner({ host: clamAvHost, port: clamAvPort })
    : new NoOpAVScanner();

  // Feature flags
  const featureFlagsConfig = loadFeatureFlagsConfig();
  const featureFlagProvider = InMemoryFeatureFlagProvider.fromConfig(featureFlagsConfig);
  const featureFlagAdapter = new FeatureFlagAdapter(featureFlagProvider, featureFlagsConfig);

  // External services
  const eventBus = new InMemoryEventBus();

  // AI provider selection:
  //   AI_PROVIDER=litellm (default) or openai → LiteLLMAIService (routes through LiteLLM proxy)
  //   AI_PROVIDER=ollama                       → OllamaAIService (offline / local dev escape hatch)
  //   AI_PROVIDER=mock (or unset in test env)  → MockAIService (deterministic, no network)
  const aiProvider = process.env.AI_PROVIDER;
  let baseAIService: MockAIService | OllamaAIService | LiteLLMAIService;
  if (aiProvider === 'ollama') {
    baseAIService = new OllamaAIService({
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      model: process.env.OLLAMA_MODEL || 'mistral',
      temperature: process.env.OLLAMA_TEMPERATURE
        ? Number.parseFloat(process.env.OLLAMA_TEMPERATURE)
        : 0.1,
      timeout: process.env.OLLAMA_TIMEOUT
        ? Number.parseInt(process.env.OLLAMA_TIMEOUT, 10)
        : 60_000,
    });
  } else if (aiProvider === 'mock' || (!aiProvider && process.env.NODE_ENV === 'test')) {
    baseAIService = new MockAIService();
  } else {
    // Default: litellm or openai — LiteLLMAIService routes through the LiteLLM proxy
    baseAIService = new LiteLLMAIService({
      baseUrl: process.env.LITELLM_BASE_URL || 'http://localhost:4000/v1',
      masterKey: process.env.LITELLM_MASTER_KEY || 'dev-master-key',
      timeout: process.env.LITELLM_TIMEOUT
        ? Number.parseInt(process.env.LITELLM_TIMEOUT, 10)
        : 120_000,
    });
  }
  // IFC-196: Prefer Redis-backed cache, fall back to InMemoryCache.
  const cache: CachePort = createCacheAdapter();

  // IFC-158/IFC-223: Notification service + ICS generation
  const emailProvider = process.env.EMAIL_PROVIDER || 'mock';
  let notificationService: MockNotificationServiceAdapter | RealNotificationServiceAdapter;
  if (emailProvider === 'sendgrid') {
    const sendgridApiKey = process.env.SENDGRID_API_KEY;
    if (!sendgridApiKey) {
      throw new Error('SENDGRID_API_KEY required when EMAIL_PROVIDER=sendgrid');
    }
    const emailAdapter = createEmailServiceAdapter({ sendgridApiKey });
    notificationService = new RealNotificationServiceAdapter(emailAdapter, {
      fromAddress: process.env.EMAIL_FROM_ADDRESS || 'noreply@intelliflow.com',
      fromName: process.env.EMAIL_FROM_NAME,
    });
  } else {
    notificationService = new MockNotificationServiceAdapter();
  }
  const icsGenerationService = new IcsGenerationService();

  // IFC-125: Wrap AI service with guardrails + audit logging
  // Security: In production, AI_AUDIT_SIGNING_KEY must be explicitly set.
  // In dev/test, a safe local-only fallback is used.
  const _rawSigningKey = process.env.AI_AUDIT_SIGNING_KEY;
  const _resolvedSigningKey =
    _rawSigningKey ||
    (process.env.NODE_ENV === 'production'
      ? (() => {
          throw new Error('AI_AUDIT_SIGNING_KEY is required in production');
        })()
      : 'dev-only-signing-key-not-for-production');
  const auditSigningKey = Buffer.from(_resolvedSigningKey, 'utf-8');
  const auditLogAdapter = new DurableAuditLogAdapter(prismaClient as any, auditSigningKey, {
    encryptPII: !!process.env.AI_AUDIT_ENCRYPTION_KEY,
  });
  const aiService = new GuardrailsAIService(baseAIService, auditLogAdapter, {
    userId: 'system',
    tenantId: process.env.DEFAULT_TENANT_ID || 'default',
    enableBiasDetection: true,
    enableLogging: true,
  });

  return {
    leadRepository,
    contactRepository,
    accountRepository,
    opportunityRepository,
    taskRepository,
    chainVersionRepository,
    chainVersionAuditRepository,
    activityFeedRepository,
    analyticsRepository,
    feedbackSurveyRepository,
    publicFeedbackRepository,
    caseDocumentRepository,
    tenantModuleRepository,
    notificationRepository,
    notificationPreferenceRepository,
    notificationAuditLogger,
    experimentRepository,
    appointmentRepository,
    eventBus,
    aiService,
    cache,
    featureFlagProvider,
    featureFlagAdapter,
    storageService,
    avScanner,
    notificationService,
    icsGenerationService,
  };
};

/**
 * Create singleton instances of security services
 * IFC-098: RBAC/ABAC & Audit Trail
 * IFC-113: Secrets Management & Encryption
 * IFC-127: Tenant Isolation
 * @param prismaClient - Prisma client instance to use for security services
 */
const createSecurityServices = (prismaClient: PrismaClient) => {
  // IFC-098: Audit logger and RBAC
  const auditLogger = getAuditLogger(prismaClient);
  const rbacService = getRBACService(prismaClient);

  // IFC-113: Encryption and key rotation
  const encryptionService = getEncryptionService();
  const keyRotationService = getKeyRotationService();

  // IFC-098: Audit event handler (connects domain events to audit logs)
  const auditEventHandler = getAuditEventHandler(prismaClient);

  return {
    auditLogger,
    rbacService,
    encryptionService,
    keyRotationService,
    auditEventHandler,
  };
};

/**
 * Create application services with injected dependencies
 * @param prismaClient - Prisma client instance to use for all services
 */
const createServices = (prismaClient: PrismaClient) => {
  const adapters = createAdapters(prismaClient);
  const security = createSecurityServices(prismaClient);

  const leadService = new LeadService(
    adapters.leadRepository,
    adapters.contactRepository,
    adapters.accountRepository,
    adapters.aiService,
    adapters.eventBus
  );

  const contactService = new ContactService(
    adapters.contactRepository,
    adapters.accountRepository,
    adapters.leadRepository,
    adapters.eventBus
  );

  const accountService = new AccountService(
    adapters.accountRepository,
    adapters.contactRepository,
    adapters.opportunityRepository,
    adapters.eventBus
  );

  const opportunityService = new OpportunityService(
    adapters.opportunityRepository,
    adapters.accountRepository,
    adapters.contactRepository,
    adapters.eventBus
  );

  const taskService = new TaskService(
    adapters.taskRepository,
    adapters.leadRepository,
    adapters.contactRepository,
    adapters.opportunityRepository,
    adapters.eventBus
  );

  const ticketService = new TicketService(prismaClient);

  // IFC-067: Ticket Routing Service
  const ticketRoutingService = new TicketRoutingService(prismaClient);

  // IFC-030: Lead Routing Service
  const leadRoutingService = new LeadRoutingService(prismaClient);

  const analyticsService = new AnalyticsAggregationService(adapters.analyticsRepository);

  // IFC-068: Feedback Survey Analytics
  const feedbackSurveyService = new FeedbackSurveyAnalyticsService(
    adapters.feedbackSurveyRepository
  );

  // PG-126: Anonymous Public Feedback Widget
  const publicFeedbackService = new PublicFeedbackService(
    adapters.publicFeedbackRepository
  );

  const chainVersionService = new ChainVersionService(
    adapters.chainVersionRepository,
    adapters.chainVersionAuditRepository,
    adapters.featureFlagAdapter,
    adapters.eventBus
  );

  // IFC-069: Activity Feed Service
  const activityFeedService = new ActivityFeedService(
    adapters.activityFeedRepository,
    adapters.cache
  );

  // IFC-157: Notification Orchestrator (unified notification service with preferences + audit)
  const notificationOrchestrator = new NotificationService(
    adapters.notificationRepository,
    adapters.notificationPreferenceRepository,
    adapters.notificationService,
    adapters.eventBus,
    adapters.notificationAuditLogger
  );

  // IFC-158: Appointment ICS + Reminder services
  const appointmentIcsHandler = new AppointmentIcsEventHandler(
    adapters.icsGenerationService,
    adapters.notificationService
  );
  const reminderScheduler = new ReminderSchedulerService(adapters.notificationService);

  // IFC-155: Appointment scheduling use cases (hexagonal orchestration over
  // AppointmentRepository). Router currently talks to AppointmentDomainService +
  // direct Prisma; these use cases are the canonical path for new callers and
  // will replace the direct-Prisma mutations in a follow-up refactor.
  const scheduleAppointmentUseCase = new ScheduleAppointmentUseCase(adapters.appointmentRepository);
  const rescheduleAppointmentUseCase = new RescheduleAppointmentUseCase(
    adapters.appointmentRepository
  );
  const cancelAppointmentUseCase = new CancelAppointmentUseCase(adapters.appointmentRepository);
  const completeAppointmentUseCase = new CompleteAppointmentUseCase(adapters.appointmentRepository);
  const checkConflictsUseCase = new CheckConflictsUseCase(adapters.appointmentRepository);

  // IFC-062: Lead to Deal Conversion
  const convertLeadToDealUseCase = new ConvertLeadToDealUseCase(
    adapters.leadRepository,
    adapters.contactRepository,
    adapters.accountRepository,
    adapters.opportunityRepository,
    adapters.eventBus
  );

  // IFC-065: Deal Won Closure Workflow
  const closeDealWonUseCase = new CloseDealWonUseCase(
    opportunityService,
    adapters.eventBus,
    adapters.notificationService
  );

  // IFC-066: Deal Lost Closure Workflow
  const closeDealLostUseCase = new CloseDealLostUseCase(
    opportunityService,
    adapters.eventBus,
    adapters.notificationService
  );

  // IFC-025: Experiment Service (A/B testing)
  const experimentService = new ExperimentService(
    adapters.experimentRepository,
    adapters.experimentRepository.assignments,
    adapters.experimentRepository.results,
    adapters.eventBus
  );

  // IFC-224: Calendar Webhook Service + Sync Adapter (stub)
  const calendarSyncService = new CalendarSyncServiceAdapter();
  const calendarWebhookService = new CalendarWebhookService(calendarSyncService);

  // IFC-094: Signature Provider + Ingestion Orchestrator
  const signatureProvider = new InternalSignatureProvider();
  const ingestionOrchestrator = new IngestionOrchestrator(
    adapters.caseDocumentRepository,
    adapters.eventBus,
    adapters.storageService,
    adapters.avScanner
  );

  // IFC-297: AI Monitoring persistence service
  const aiMonitoringService = new AIMonitoringService(prismaClient);

  // IFC-148: Conversation Search Service — wired with real Prisma repository
  const conversationSearchRepository = new PrismaConversationSearchRepository(prismaClient);
  const conversationSearchService = new ConversationSearchService(conversationSearchRepository);

  // IFC-196: Home Page Response Caching
  const homeCacheService = new HomeCacheService(adapters.cache, adapters.eventBus);
  homeCacheService.registerInvalidationHandlers().catch((err) => {
    console.warn('[home.cache] failed to register invalidation handlers', err);
  });

  // IFC-310: Duplicate-detection runtime services
  // Stateless singletons — accept per-request HasTenantContext.
  //
  // Wiring:
  //  - mergeContacts:        delegates to the hardened ContactService.mergeContacts
  //                          (atomic $transaction + child re-parenting + event publish).
  //  - findSimilarContacts:  bridges packages/db/src/pgvector#findSimilarContacts
  //                          with a tenant-scope filter applied in the caller after
  //                          the vector search returns candidates (candidate rows are
  //                          re-fetched tenant-scoped inside runAiBranch).
  //  - enqueueEmbeddingJob:  fire-and-forget BullMQ producer for intelliflow-contact-embed.
  //                          Consumed by ContactEmbedWorker (apps/ai-worker).
  //  - generateEmbedding:    HTTP-based LiteLLM/OpenAI call so AC-007 fires at
  //                          check-time. Returns null when no provider is
  //                          configured — detection service degrades to
  //                          deterministic-only per AC-008.
  const contactDuplicateDetectionService: ContactDuplicateDetectionService =
    createContactDuplicateDetectionService({
      mergeContacts: async (_ctx, primaryId, secondaryId, mergedBy) => {
        const result = await contactService.mergeContacts(
          primaryId,
          secondaryId,
          mergedBy,
        );
        if (result.isFailure) {
          throw result.error;
        }
        return result.value;
      },
      findSimilarContacts: async (_prismaIgnored, _tenantId, embedding, opts) => {
        const { findSimilarContacts } = await import('@intelliflow/db');
        const results = await findSimilarContacts(embedding, {
          limit: opts?.limit ?? 5,
          threshold: 1 - (opts?.threshold ?? 0.3),
        });
        return results.map((r) => ({ id: r.item.id, similarity: r.similarity }));
      },
      generateEmbedding: generateContactQueryEmbedding,
      enqueueEmbeddingJob: async (payload) => {
        try {
          const { Queue } = await import(
            /* webpackIgnore: true */ 'bullmq'
          );
          const { getBullMQConnectionOptions } = await import(
            '@intelliflow/platform/queues/connection'
          );
          const queue = new Queue('intelliflow-contact-embed', {
            connection: getBullMQConnectionOptions(),
          });
          await queue.add('embed', payload, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: { age: 86400, count: 200 },
            removeOnFail: { age: 604800, count: 1000 },
          });
          await queue.close();
        } catch (error) {
          console.warn(
            '[container] intelliflow-contact-embed enqueue failed (fire-and-forget):',
            error,
          );
        }
      },
    });
  const accountDuplicateDetectionService: AccountDuplicateDetectionService =
    createAccountDuplicateDetectionService({
      linkContactsByEmailDomain: async (accountId, domain, tenantId, maxBatch) => {
        const result = await accountService.linkContactsByEmailDomain(
          accountId,
          domain,
          tenantId,
          maxBatch,
        );
        if (result.isFailure) {
          throw result.error;
        }
        return result.value;
      },
    });

  return {
    leadService,
    contactService,
    accountService,
    opportunityService,
    taskService,
    ticketService,
    ticketRoutingService,
    leadRoutingService,
    analyticsService,
    feedbackSurveyService,
    publicFeedbackService,
    chainVersionService,
    activityFeedService,
    // IFC-158: Appointment scheduling services
    appointmentIcsHandler,
    reminderScheduler,
    // IFC-155: Appointment scheduling use cases
    scheduleAppointmentUseCase,
    rescheduleAppointmentUseCase,
    cancelAppointmentUseCase,
    completeAppointmentUseCase,
    checkConflictsUseCase,
    // IFC-062: Lead to Deal conversion
    convertLeadToDealUseCase,
    // IFC-065: Deal Won Closure
    closeDealWonUseCase,
    // IFC-066: Deal Lost Closure
    closeDealLostUseCase,
    // IFC-224: Calendar webhook processing
    calendarSyncService,
    calendarWebhookService,
    // IFC-094: Document services
    signatureProvider,
    ingestionOrchestrator,
    // IFC-025: Experiment Service
    experimentService,
    // IFC-157: Notification Orchestrator (unified service with preferences + audit)
    notificationOrchestrator,
    // IFC-209: Module Access Service
    moduleAccess: adapters.tenantModuleRepository,
    // Security services (IFC-098, IFC-113, IFC-127)
    security,
    // Also expose adapters for direct access when needed
    adapters,
    // IFC-297: AI Monitoring persistence service
    aiMonitoringService,
    // IFC-148: Conversation Search Service
    conversationSearchService,
    // IFC-196: Home Page Response Caching
    homeCacheService,
    // IFC-310: Duplicate-detection runtime services
    contactDuplicateDetectionService,
    accountDuplicateDetectionService,
  };
};

/**
 * Singleton container instance
 * Services are created once with the shared Prisma client and reused across all requests
 */
const containerBase = createServices(apiPrisma);

/**
 * Container with get() method for dynamic service lookup
 */
export const container = {
  ...containerBase,
  /**
   * Get a service by name (for services not yet in the container)
   * @param serviceName - Name of the service to retrieve
   * @returns The service instance or throws if not found
   */
  get<T = any>(serviceName: string): T {
    // Check if service exists in container
    const service = (containerBase as any)[serviceName];
    if (service) {
      return service as T;
    }

    // Service not found - throw error with helpful message
    throw new Error(
      `Service '${serviceName}' not found in container. ` +
        `Available services: ${Object.keys(containerBase).join(', ')}`
    );
  },
};

/**
 * Type for the container
 */
export type Container = typeof container;
