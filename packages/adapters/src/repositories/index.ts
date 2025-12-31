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
export * from './PrismaCaseDocumentRepository';
export * from './PrismaNotificationRepository';
export * from './PrismaNotificationPreferenceRepository';

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
