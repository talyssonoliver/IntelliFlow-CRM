import { describe, it, expect, vi, beforeEach } from 'vitest';

type LazyConfig = { baseUrl: string | (() => string) };

const adapterState = vi.hoisted(() => ({
  ollama: null as null | { config: LazyConfig; scoreLead: () => Promise<string> },
  litellm: null as null | { config: LazyConfig; scoreLead: () => Promise<string> },
}));

vi.mock('@intelliflow/db', () => ({
  prisma: {},
}));

vi.mock('@intelliflow/adapters', () => {
  const resolveBaseUrl = (config: LazyConfig): string =>
    typeof config.baseUrl === 'function' ? config.baseUrl() : config.baseUrl;

  const named = (name: string) =>
    class {
      constructor() {
        return { name };
      }
    };

  class OllamaAIService {
    constructor(public readonly config: LazyConfig) {
      adapterState.ollama = this;
    }

    async scoreLead(): Promise<string> {
      return resolveBaseUrl(this.config);
    }
  }

  class LiteLLMAIService {
    constructor(public readonly config: LazyConfig) {
      adapterState.litellm = this;
    }

    async scoreLead(): Promise<string> {
      return resolveBaseUrl(this.config);
    }
  }

  return {
    PrismaLeadRepository: named('leadRepository'),
    PrismaContactRepository: named('contactRepository'),
    PrismaAccountRepository: named('accountRepository'),
    PrismaOpportunityRepository: named('opportunityRepository'),
    PrismaSetupInstalmentRepository: named('setupInstalmentRepository'),
    PrismaStripeSubscriptionRepository: named('stripeSubscriptionRepository'),
    PrismaTaskRepository: named('taskRepository'),
    PrismaChainVersionRepository: named('chainVersionRepository'),
    PrismaChainVersionAuditRepository: named('chainVersionAuditRepository'),
    PrismaActivityFeedRepository: named('activityFeedRepository'),
    PrismaTenantModuleRepository: named('tenantModuleRepository'),
    PrismaAnalyticsRepository: named('analyticsRepository'),
    PrismaTransactionManager: class {
      async run(work: (tx: unknown) => Promise<unknown>) {
        return work({});
      }
    },
    PrismaFeedbackSurveyRepository: named('feedbackSurveyRepository'),
    PrismaPublicFeedbackRepository: named('publicFeedbackRepository'),
    PrismaCaseDocumentRepository: named('caseDocumentRepository'),
    PrismaNotificationRepository: named('notificationRepository'),
    PrismaNotificationPreferenceRepository: named('notificationPreferenceRepository'),
    PrismaNotificationAuditLogger: named('notificationAuditLogger'),
    PrismaConversationSearchRepository: named('conversationSearchRepository'),
    InMemoryEventBus: named('eventBus'),
    MockAIService: named('mockAIService'),
    OllamaAIService,
    LiteLLMAIService,
    InMemoryCache: named('cache'),
    RedisCacheAdapter: named('redisCache'),
    GuardrailsAIService: class {
      readonly base: unknown;

      constructor(base: unknown) {
        this.base = base;
      }
    },
    DurableAuditLogAdapter: named('auditLogAdapter'),
    FeatureFlagAdapter: named('featureFlagAdapter'),
    SupabaseStorageAdapter: named('storageAdapter'),
    NoOpAVScanner: named('avScanner'),
    ClamAVScanner: named('clamAvScanner'),
    MockNotificationServiceAdapter: named('notificationService'),
    RealNotificationServiceAdapter: named('realNotificationService'),
    createEmailServiceAdapter: vi.fn().mockReturnValue({ name: 'emailServiceAdapter' }),
    IcsGenerationService: named('icsGenerationService'),
    CalendarSyncServiceAdapter: named('calendarSyncService'),
    PrismaExperimentRepository: class {
      assignments = {};
      results = {};
    },
    PrismaAppointmentRepository: class {
      forTenant() {
        return {};
      }
    },
  };
});

// container.ts now imports the AI providers from their dedicated entry points
// (so the @intelliflow/adapters barrel no longer pulls @langchain at cold start),
// so the lazy `await import(...)` resolves these deep paths — mock them here too.
vi.mock('@intelliflow/adapters/external/OllamaAIService', () => {
  const resolveBaseUrl = (config: LazyConfig): string =>
    typeof config.baseUrl === 'function' ? config.baseUrl() : config.baseUrl;
  return {
    OllamaAIService: class {
      constructor(public readonly config: LazyConfig) {
        adapterState.ollama = this;
      }
      async scoreLead(): Promise<string> {
        return resolveBaseUrl(this.config);
      }
    },
  };
});

vi.mock('@intelliflow/adapters/external/LiteLLMAIService', () => {
  const resolveBaseUrl = (config: LazyConfig): string =>
    typeof config.baseUrl === 'function' ? config.baseUrl() : config.baseUrl;
  return {
    LiteLLMAIService: class {
      constructor(public readonly config: LazyConfig) {
        adapterState.litellm = this;
      }
      async scoreLead(): Promise<string> {
        return resolveBaseUrl(this.config);
      }
    },
  };
});

vi.mock('@intelliflow/platform/feature-flags', () => ({
  InMemoryFeatureFlagProvider: {
    fromConfig: vi.fn().mockReturnValue({ isEnabled: vi.fn(), getDecision: vi.fn() }),
  },
}));

vi.mock('@intelliflow/application', () => {
  const named = (name: string) =>
    class {
      constructor() {
        return { name };
      }
    };

  return {
    LeadService: named('leadService'),
    ContactService: named('contactService'),
    AccountService: named('accountService'),
    OpportunityService: named('opportunityService'),
    TaskService: named('taskService'),
    ChainVersionService: named('chainVersionService'),
    ActivityFeedService: named('activityFeedService'),
    AnalyticsAggregationService: named('analyticsService'),
    FeedbackSurveyAnalyticsService: named('feedbackSurveyService'),
    InternalSignatureProvider: named('signatureProvider'),
    IngestionOrchestrator: named('ingestionOrchestrator'),
    AppointmentIcsEventHandler: named('appointmentIcsHandler'),
    ReminderSchedulerService: named('reminderScheduler'),
    ConvertLeadToDealUseCase: named('convertLeadToDealUseCase'),
    CloseDealWonUseCase: named('closeDealWonUseCase'),
    CloseDealLostUseCase: named('closeDealLostUseCase'),
    ScheduleAppointmentUseCase: named('scheduleAppointmentUseCase'),
    RescheduleAppointmentUseCase: named('rescheduleAppointmentUseCase'),
    CancelAppointmentUseCase: named('cancelAppointmentUseCase'),
    CompleteAppointmentUseCase: named('completeAppointmentUseCase'),
    CheckConflictsUseCase: named('checkConflictsUseCase'),
    ExperimentService: named('experimentService'),
    NotificationService: named('notificationService'),
    ConversationSearchService: named('conversationSearchService'),
  };
});

vi.mock('../services/TicketService', () => ({ TicketService: class {} }));
vi.mock('../services/TicketRoutingService', () => ({ TicketRoutingService: class {} }));
vi.mock('../services/LeadRoutingService', () => ({ LeadRoutingService: class {} }));
vi.mock('../modules/calendar/calendar-webhook.service', () => ({
  CalendarWebhookService: class {},
}));
vi.mock('../services/AIMonitoringService', () => ({ AIMonitoringService: class {} }));
vi.mock('../modules/ai-monitoring/ai-monitoring.redis-store', () => ({
  RedisAIMonitoringStore: class {},
}));
vi.mock('../modules/home/home.cache', () => ({
  HomeCacheService: class {
    async registerInvalidationHandlers(): Promise<void> {
      return undefined;
    }
  },
}));
vi.mock('../modules/public-feedback/public-feedback.service', () => ({
  PublicFeedbackService: class {},
}));
vi.mock('../modules/contact/contact-duplicate-detection.service', () => ({
  createContactDuplicateDetectionService: vi.fn().mockReturnValue({}),
}));
vi.mock('../modules/account/account-duplicate-detection.service', () => ({
  createAccountDuplicateDetectionService: vi.fn().mockReturnValue({}),
}));
vi.mock('../services/queue', () => ({ QueueAIService: class {} }));
vi.mock('../config/feature-flags.config', () => ({
  loadFeatureFlagsConfig: vi.fn().mockReturnValue({ version: 1, flags: [] }),
}));
vi.mock('../security', () => ({
  getAuditLogger: vi.fn().mockReturnValue({}),
  getRBACService: vi.fn().mockReturnValue({}),
  getEncryptionService: vi.fn().mockReturnValue({}),
  getKeyRotationService: vi.fn().mockReturnValue({}),
  getAuditEventHandler: vi.fn().mockReturnValue({}),
}));

describe('AI provider base URL lazy container wiring', () => {
  beforeEach(() => {
    vi.resetModules();
    adapterState.ollama = null;
    adapterState.litellm = null;
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DISABLE_HOME_CACHE', '1');
    vi.stubEnv('AI_MONITORING_REDIS_DISABLED', '1');
    vi.stubEnv('SUPABASE_URL', 'https://supabase.example.test');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    vi.stubEnv('AI_AUDIT_SIGNING_KEY', 'test-signing-key');
  });

  it('constructs with AI_PROVIDER=ollama and no OLLAMA_BASE_URL, then throws on first use', async () => {
    vi.stubEnv('AI_PROVIDER', 'ollama');
    vi.stubEnv('OLLAMA_BASE_URL', '');

    // Import the module and await containerReady so the async createServices()
    // (which dynamically imports OllamaAIService) has fully resolved before we
    // assert on adapterState (perf/container-lazy-wiring).
    const mod = await import('../container.js');
    await expect(mod.containerReady).resolves.toBeUndefined();
    expect(mod).toHaveProperty('container');

    expect(adapterState.ollama).not.toBeNull();
    if (!adapterState.ollama) throw new Error('OllamaAIService was not constructed');
    const ollama = adapterState.ollama;
    expect(typeof ollama.config.baseUrl).toBe('function');
    await expect(ollama.scoreLead()).rejects.toThrow('OLLAMA_BASE_URL');
  });

  it('constructs with AI_PROVIDER=litellm and no LITELLM_BASE_URL, then throws on first use', async () => {
    vi.stubEnv('AI_PROVIDER', 'litellm');
    vi.stubEnv('LITELLM_BASE_URL', '');

    // Import the module and await containerReady so the async createServices()
    // (which dynamically imports LiteLLMAIService) has fully resolved before we
    // assert on adapterState (perf/container-lazy-wiring).
    const mod = await import('../container.js');
    await expect(mod.containerReady).resolves.toBeUndefined();
    expect(mod).toHaveProperty('container');

    expect(adapterState.litellm).not.toBeNull();
    if (!adapterState.litellm) throw new Error('LiteLLMAIService was not constructed');
    const litellm = adapterState.litellm;
    expect(typeof litellm.config.baseUrl).toBe('function');
    await expect(litellm.scoreLead()).rejects.toThrow('LITELLM_BASE_URL');
  });
});
