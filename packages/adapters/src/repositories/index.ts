/**
 * Repository Implementations
 * Concrete implementations of repository ports
 */

// Prisma implementations (production)
export * from './PrismaLeadRepository';
export * from './PrismaContactRepository';
export * from './PrismaAccountRepository';
export * from './PrismaOpportunityRepository';
export * from './PrismaTaskRepository';
export * from './PrismaAppointmentRepository';
export * from './PrismaCaseRepository';
export * from './PrismaCaseDocumentRepository';
export * from './PrismaNotificationRepository';
export * from './PrismaNotificationPreferenceRepository';
export * from './PrismaAutoResponseDraftRepository';

// AI Output Review Repository (IFC-179)
export { PrismaAIOutputReviewRepository } from './PrismaAIOutputReviewRepository';
// Note: OptimisticLockError is exported from PrismaAutoResponseDraftRepository

// Chain Version Repositories (IFC-086)
export * from './PrismaChainVersionRepository';
export * from './PrismaChainVersionAuditRepository';

// Activity Feed Repository (IFC-069)
export * from './PrismaActivityFeedRepository';

// Tenant Module Repository (IFC-209)
export * from './PrismaTenantModuleRepository';

// Outbox pattern (domain events)
export * from './PrismaOutboxRepository';

// Analytics Repository (IFC-200)
export * from './PrismaAnalyticsRepository';

// Feedback Survey Repository (IFC-068)
export * from './PrismaFeedbackSurveyRepository';

// Experiment Repository (IFC-025)
export * from './PrismaExperimentRepository';

// In-memory implementations (testing)
export * from './InMemoryLeadRepository';
export * from './InMemoryContactRepository';
export * from './InMemoryAccountRepository';
export * from './InMemoryOpportunityRepository';
export * from './InMemoryTaskRepository';
export * from './InMemoryAppointmentRepository';
export * from './InMemoryCaseDocumentRepository';
export * from './InMemoryNotificationRepository';
export * from './InMemoryNotificationPreferenceRepository';
export * from './InMemoryAnalyticsRepository';
