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
  PrismaCaseDocumentRepository,
  PrismaNotificationRepository,
  PrismaNotificationPreferenceRepository,
  InMemoryEventBus,
  MockAIService,
  OllamaAIService,
  InMemoryCache,
  GuardrailsAIService,
  DurableAuditLogAdapter,
  FeatureFlagAdapter,
  SupabaseStorageAdapter,
  NoOpAVScanner,
  MockNotificationServiceAdapter,
  RealNotificationServiceAdapter,
  createEmailServiceAdapter,
  IcsGenerationService,
  CalendarSyncServiceAdapter,
} from '@intelliflow/adapters';
import { InMemoryFeatureFlagProvider } from '@intelliflow/platform';
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

/**
 * Get the API Prisma client.
 *
 * Uses the shared singleton from @intelliflow/db so all API modules reuse a single
 * PrismaClient instance (avoids connection exhaustion in Next.js dev/HMR).
 */
export const getApiPrisma = (): PrismaClient => sharedPrisma;

/**
 * Direct export for backward compatibility
 * Note: This triggers lazy initialization on first import
 */
export const apiPrisma = getApiPrisma();

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
  const caseDocumentRepository = new PrismaCaseDocumentRepository(prismaClient);
  const tenantModuleRepository = new PrismaTenantModuleRepository(prismaClient);
  const notificationRepository = new PrismaNotificationRepository(prismaClient);
  const notificationPreferenceRepository = new PrismaNotificationPreferenceRepository(prismaClient);

  // Storage & AV (IFC-094)
  const storageService = new SupabaseStorageAdapter(
    process.env.SUPABASE_URL || 'http://localhost:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev-service-key'
  );
  const avScanner = new NoOpAVScanner();

  // Feature flags
  const featureFlagsConfig = loadFeatureFlagsConfig();
  const featureFlagProvider = InMemoryFeatureFlagProvider.fromConfig(featureFlagsConfig);
  const featureFlagAdapter = new FeatureFlagAdapter(featureFlagProvider, featureFlagsConfig);

  // External services
  const eventBus = new InMemoryEventBus();
  const baseAIService =
    process.env.AI_PROVIDER === 'ollama'
      ? new OllamaAIService({
          baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
          model: process.env.OLLAMA_MODEL || 'mistral',
          temperature: process.env.OLLAMA_TEMPERATURE
            ? parseFloat(process.env.OLLAMA_TEMPERATURE)
            : 0.1,
          timeout: process.env.OLLAMA_TIMEOUT ? parseInt(process.env.OLLAMA_TIMEOUT, 10) : 60_000,
        })
      : new MockAIService();
  const cache = new InMemoryCache();

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
  const auditSigningKey = Buffer.from(
    process.env.AI_AUDIT_SIGNING_KEY || 'dev-signing-key-change-in-production',
    'utf-8'
  );
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
    caseDocumentRepository,
    tenantModuleRepository,
    notificationRepository,
    notificationPreferenceRepository,
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

  // IFC-158: Appointment ICS + Reminder services
  const appointmentIcsHandler = new AppointmentIcsEventHandler(
    adapters.icsGenerationService,
    adapters.notificationService
  );
  const reminderScheduler = new ReminderSchedulerService(adapters.notificationService);

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
    chainVersionService,
    activityFeedService,
    // IFC-158: Appointment scheduling services
    appointmentIcsHandler,
    reminderScheduler,
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
    // IFC-209: Module Access Service
    moduleAccess: adapters.tenantModuleRepository,
    // Security services (IFC-098, IFC-113, IFC-127)
    security,
    // Also expose adapters for direct access when needed
    adapters,
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
