/**
 * Container (Dependency Injection) Tests
 *
 * Tests for apps/api/src/container.ts
 *
 * Validates:
 * - Prisma client lazy initialization
 * - Service creation and wiring
 * - Container `get()` method for dynamic service lookup
 * - Security services initialization
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock PrismaClient as a class constructor
const mockPrismaInstance = {
  $connect: vi.fn(),
  $disconnect: vi.fn(),
  auditLog: { create: vi.fn(), findMany: vi.fn() },
  auditLogEntry: { create: vi.fn() },
  securityEvent: { create: vi.fn() },
  permission: { findUnique: vi.fn() },
  userPermission: { findUnique: vi.fn(), findMany: vi.fn() },
  userRoleAssignment: { findMany: vi.fn() },
  rBACRole: { findUnique: vi.fn() },
  tenant: { findUnique: vi.fn() },
};

vi.mock('@intelliflow/db', () => {
  return {
    PrismaClient: class MockPrismaClient {
      constructor() {
        return mockPrismaInstance;
      }
    },
    prisma: mockPrismaInstance,
  };
});

// All adapter/service mocks must be constructable (source uses `new X(...)`)
vi.mock('@intelliflow/adapters', () => ({
  PrismaLeadRepository: class {
    constructor() {
      return { name: 'leadRepo' };
    }
  },
  PrismaContactRepository: class {
    constructor() {
      return { name: 'contactRepo' };
    }
  },
  PrismaAccountRepository: class {
    constructor() {
      return { name: 'accountRepo' };
    }
  },
  PrismaOpportunityRepository: class {
    constructor() {
      return { name: 'opportunityRepo' };
    }
  },
  PrismaSetupInstalmentRepository: class {
    constructor() {
      return { name: 'setupInstalmentRepo' };
    }
  },
  PrismaStripeSubscriptionRepository: class {
    constructor() {
      return { name: 'stripeSubscriptionRepo' };
    }
  },
  PrismaTaskRepository: class {
    constructor() {
      return { name: 'taskRepo' };
    }
  },
  PrismaChainVersionRepository: class {
    constructor() {
      return { name: 'chainVersionRepo' };
    }
  },
  PrismaChainVersionAuditRepository: class {
    constructor() {
      return { name: 'chainVersionAuditRepo' };
    }
  },
  PrismaActivityFeedRepository: class {
    constructor() {
      return { name: 'activityFeedRepo' };
    }
  },
  PrismaAnalyticsRepository: class {
    constructor() {
      return { name: 'analyticsRepo' };
    }
  },
  InMemoryEventBus: class {
    constructor() {
      return { name: 'eventBus' };
    }
  },
  MockAIService: class {
    constructor() {
      return { name: 'aiService' };
    }
  },
  OllamaAIService: class {
    constructor() {
      return { name: 'ollamaAIService' };
    }
  },
  GuardrailsAIService: class {
    constructor() {
      return { name: 'guardrailsAIService' };
    }
  },
  DurableAuditLogAdapter: class {
    constructor() {
      return { name: 'durableAuditLogAdapter' };
    }
  },
  InMemoryCache: class {
    constructor() {
      return { name: 'cache' };
    }
  },
  FeatureFlagAdapter: class {
    constructor() {
      return {
        name: 'featureFlagAdapter',
        isEnabled: vi.fn(),
        getVariant: vi.fn(),
        getRolloutPercent: vi.fn(),
      };
    }
  },
  PrismaCaseDocumentRepository: class {
    constructor() {
      return { name: 'caseDocumentRepo' };
    }
  },
  SupabaseStorageAdapter: class {
    constructor() {
      return { name: 'storageService' };
    }
  },
  NoOpAVScanner: class {
    constructor() {
      return { name: 'avScanner' };
    }
  },
  MockNotificationServiceAdapter: class {
    constructor() {
      return {
        name: 'notificationService',
        sendEmail: vi.fn(),
        schedule: vi.fn(),
        cancelScheduled: vi.fn(),
      };
    }
  },
  IcsGenerationService: class {
    constructor() {
      return {
        name: 'icsGenerationService',
        generateInvitation: vi.fn(),
        generateUpdate: vi.fn(),
        generateCancellation: vi.fn(),
      };
    }
  },
  PrismaFeedbackSurveyRepository: class {
    constructor() {
      return { name: 'feedbackSurveyRepo' };
    }
  },
  PrismaTenantModuleRepository: class {
    constructor() {
      return { name: 'tenantModuleRepo' };
    }
  },
  PrismaNotificationRepository: class {
    constructor() {
      return { name: 'notificationRepo' };
    }
  },
  PrismaNotificationPreferenceRepository: class {
    constructor() {
      return { name: 'notificationPreferenceRepo' };
    }
  },
  PrismaNotificationAuditLogger: class {
    constructor() {
      return { name: 'notificationAuditLogger' };
    }
  },
  PrismaExperimentRepository: class {
    constructor() {
      return {
        name: 'experimentRepo',
        assignments: { name: 'experimentAssignmentsRepo' },
        results: { name: 'experimentResultsRepo' },
      };
    }
  },
  CalendarSyncServiceAdapter: class {
    constructor() {
      return { name: 'calendarSyncService' };
    }
  },
  ClamAVScanner: class {
    constructor() {
      return { name: 'clamAvScanner' };
    }
  },
  RealNotificationServiceAdapter: class {
    constructor() {
      return {
        name: 'realNotificationService',
        sendEmail: vi.fn(),
        schedule: vi.fn(),
        cancelScheduled: vi.fn(),
      };
    }
  },
  createEmailServiceAdapter: vi.fn().mockReturnValue({ name: 'emailServiceAdapter' }),
  PrismaAppointmentRepository: class {
    forTenant() {
      return {};
    }
    save = vi.fn();
    saveAll = vi.fn();
    batchUpdateStatus = vi.fn();
  },
  PrismaConversationSearchRepository: class {
    constructor() {
      return { name: 'conversationSearchRepo' };
    }
  },
  PrismaPublicFeedbackRepository: class {
    constructor() {
      return { name: 'publicFeedbackRepo' };
    }
  },
}));

vi.mock('../modules/calendar/calendar-webhook.service', () => ({
  CalendarWebhookService: class {
    constructor() {
      return { name: 'calendarWebhookService' };
    }
  },
}));

vi.mock('@intelliflow/platform/feature-flags', () => ({
  InMemoryFeatureFlagProvider: {
    fromConfig: vi.fn().mockReturnValue({
      isEnabled: vi.fn().mockReturnValue(true),
      getDecision: vi.fn().mockReturnValue({ key: 'test', enabled: true, reason: 'default' }),
    }),
  },
}));

vi.mock('@intelliflow/application', () => ({
  LeadService: class {
    constructor() {
      return { name: 'leadService' };
    }
  },
  ContactService: class {
    constructor() {
      return { name: 'contactService' };
    }
  },
  AccountService: class {
    constructor() {
      return { name: 'accountService' };
    }
  },
  OpportunityService: class {
    constructor() {
      return { name: 'opportunityService' };
    }
  },
  TaskService: class {
    constructor() {
      return { name: 'taskService' };
    }
  },
  ChainVersionService: class {
    constructor() {
      return { name: 'chainVersionService' };
    }
  },
  ActivityFeedService: class {
    constructor() {
      return { name: 'activityFeedService' };
    }
  },
  AnalyticsAggregationService: class {
    constructor() {
      return { name: 'analyticsService' };
    }
  },
  InternalSignatureProvider: class {
    constructor() {
      return { name: 'signatureProvider', computeSignatureHash: vi.fn() };
    }
  },
  IngestionOrchestrator: class {
    constructor() {
      return { name: 'ingestionOrchestrator', ingestFile: vi.fn() };
    }
  },
  AppointmentIcsEventHandler: class {
    constructor() {
      return {
        name: 'appointmentIcsHandler',
        handleAppointmentCreated: vi.fn(),
        handleAppointmentRescheduled: vi.fn(),
        handleAppointmentCancelled: vi.fn(),
      };
    }
  },
  ReminderSchedulerService: class {
    constructor() {
      return {
        name: 'reminderScheduler',
        handleAppointmentCreated: vi.fn(),
        handleAppointmentRescheduled: vi.fn(),
        handleAppointmentCancelled: vi.fn(),
      };
    }
  },
  FeedbackSurveyAnalyticsService: class {
    constructor() {
      return { name: 'feedbackSurveyService' };
    }
  },
  ConvertLeadToDealUseCase: class {
    constructor() {
      return { name: 'convertLeadToDealUseCase' };
    }
  },
  CloseDealWonUseCase: class {
    constructor() {
      return { name: 'closeDealWonUseCase' };
    }
  },
  CloseDealLostUseCase: class {
    constructor() {
      return { name: 'closeDealLostUseCase' };
    }
  },
  ExperimentService: class {
    constructor() {
      return { name: 'experimentService' };
    }
  },
  NotificationService: class {
    constructor() {
      return { name: 'notificationOrchestrator' };
    }
  },
  ConversationSearchService: class {
    constructor() {
      return { name: 'conversationSearchService' };
    }
  },
  ScheduleAppointmentUseCase: class {
    constructor() {
      return { name: 'scheduleAppointmentUseCase', execute: vi.fn() };
    }
  },
  RescheduleAppointmentUseCase: class {
    constructor() {
      return { name: 'rescheduleAppointmentUseCase', execute: vi.fn() };
    }
  },
  CancelAppointmentUseCase: class {
    constructor() {
      return { name: 'cancelAppointmentUseCase', execute: vi.fn() };
    }
  },
  CompleteAppointmentUseCase: class {
    constructor() {
      return { name: 'completeAppointmentUseCase', execute: vi.fn() };
    }
  },
  CheckConflictsUseCase: class {
    constructor() {
      return {
        name: 'checkConflictsUseCase',
        checkConflicts: vi.fn(),
        checkAvailability: vi.fn(),
        findNextSlot: vi.fn(),
      };
    }
  },
}));

vi.mock('../services/TicketService', () => ({
  TicketService: class {
    constructor() {
      return { name: 'ticketService' };
    }
  },
}));

vi.mock('../services/LeadRoutingService', () => ({
  LeadRoutingService: class {
    constructor() {
      return { name: 'leadRoutingService' };
    }
  },
}));

vi.mock('../services/TicketRoutingService', () => ({
  TicketRoutingService: class {
    constructor() {
      return { name: 'ticketRoutingService' };
    }
  },
}));

// AnalyticsService removed — now uses AnalyticsAggregationService from @intelliflow/application (IFC-200)

vi.mock('../config/feature-flags.config', () => ({
  loadFeatureFlagsConfig: vi.fn().mockReturnValue({
    version: 1,
    flags: [{ key: 'test_flag', enabled: true }],
  }),
}));

vi.mock('../security', () => ({
  getAuditLogger: vi.fn().mockReturnValue({ name: 'auditLogger' }),
  getRBACService: vi.fn().mockReturnValue({ name: 'rbacService' }),
  getEncryptionService: vi.fn().mockReturnValue({ name: 'encryptionService' }),
  getKeyRotationService: vi.fn().mockReturnValue({ name: 'keyRotationService' }),
  getAuditEventHandler: vi.fn().mockReturnValue({ name: 'auditEventHandler' }),
}));

describe('Container', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export container with required services', async () => {
    const { container } = await import('../container.js');

    expect(container).toBeDefined();
    expect(container.leadService).toBeDefined();
    expect(container.contactService).toBeDefined();
    expect(container.accountService).toBeDefined();
    expect(container.opportunityService).toBeDefined();
    expect(container.taskService).toBeDefined();
    expect(container.ticketService).toBeDefined();
    expect(container.analyticsService).toBeDefined();
  });

  it('should export container with security services', async () => {
    const { container } = await import('../container.js');

    expect(container.security).toBeDefined();
    expect(container.security.auditLogger).toBeDefined();
    expect(container.security.rbacService).toBeDefined();
    expect(container.security.encryptionService).toBeDefined();
    expect(container.security.keyRotationService).toBeDefined();
    expect(container.security.auditEventHandler).toBeDefined();
  });

  it('should export container with adapters', async () => {
    const { container } = await import('../container.js');

    expect(container.adapters).toBeDefined();
    expect(container.adapters.leadRepository).toBeDefined();
    expect(container.adapters.contactRepository).toBeDefined();
    expect(container.adapters.accountRepository).toBeDefined();
    expect(container.adapters.opportunityRepository).toBeDefined();
    expect(container.adapters.taskRepository).toBeDefined();
    expect(container.adapters.eventBus).toBeDefined();
    expect(container.adapters.aiService).toBeDefined();
    expect(container.adapters.cache).toBeDefined();
    expect(container.adapters.featureFlagProvider).toBeDefined();
    expect(container.adapters.featureFlagAdapter).toBeDefined();
  });

  it('should export container with IFC-094 document services', async () => {
    const { container } = await import('../container.js');

    expect(container.signatureProvider).toBeDefined();
    expect(container.ingestionOrchestrator).toBeDefined();
  });

  it('should export container with IFC-158 appointment scheduling services', async () => {
    const { container } = await import('../container.js');

    expect(container.appointmentIcsHandler).toBeDefined();
    expect(container.reminderScheduler).toBeDefined();
    expect(container.adapters.notificationService).toBeDefined();
    expect(container.adapters.icsGenerationService).toBeDefined();
  });

  it('should expose caseDocumentRepository via adapters', async () => {
    const { container } = await import('../container.js');

    expect(container.adapters.caseDocumentRepository).toBeDefined();
    expect(container.adapters.storageService).toBeDefined();
    expect(container.adapters.avScanner).toBeDefined();
  });

  describe('container.get()', () => {
    it('should return a service by name', async () => {
      const { container } = await import('../container.js');

      const leadService = container.get('leadService');
      expect(leadService).toBeDefined();
      expect(leadService).toBe(container.leadService);
    });

    it('should return security services by name', async () => {
      const { container } = await import('../container.js');

      const security = container.get('security');
      expect(security).toBeDefined();
      expect(security).toBe(container.security);
    });

    it('should return adapters by name', async () => {
      const { container } = await import('../container.js');

      const adapters = container.get('adapters');
      expect(adapters).toBeDefined();
      expect(adapters).toBe(container.adapters);
    });

    it('should throw an error for non-existent service', async () => {
      const { container } = await import('../container.js');

      expect(() => container.get('nonExistentService')).toThrow(
        "Service 'nonExistentService' not found in container"
      );
    });

    it('should include available services in error message', async () => {
      const { container } = await import('../container.js');

      try {
        container.get('missing');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('Available services:');
        expect(error.message).toContain('leadService');
        expect(error.message).toContain('security');
      }
    });

    it('should support generic type parameter', async () => {
      const { container } = await import('../container.js');

      const service = container.get<{ name: string }>('leadService');
      expect(service).toBeDefined();
    });
  });

  describe('getApiPrisma()', () => {
    it('should return a Prisma client instance', async () => {
      const { getApiPrisma } = await import('../container.js');

      const prisma = getApiPrisma();
      expect(prisma).toBeDefined();
    });

    it('should return the same instance on subsequent calls (singleton)', async () => {
      const { getApiPrisma } = await import('../container.js');

      const prisma1 = getApiPrisma();
      const prisma2 = getApiPrisma();
      expect(prisma1).toBe(prisma2);
    });
  });

  describe('apiPrisma export', () => {
    it('should be a Prisma client instance', async () => {
      const { apiPrisma } = await import('../container.js');

      expect(apiPrisma).toBeDefined();
    });
  });
});
