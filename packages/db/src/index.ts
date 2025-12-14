// IntelliFlow CRM - Database Package
// Re-exports Prisma client and types

export * from './client';
export * from '@prisma/client';

// Type helpers for domain layer
export type {
  User,
  Lead,
  Contact,
  Account,
  Opportunity,
  Task,
  AIScore,
  AuditLog,
  DomainEvent,
} from '@prisma/client';

// Enum exports
export {
  UserRole,
  LeadSource,
  LeadStatus,
  OpportunityStage,
  TaskPriority,
  TaskStatus,
  EventStatus,
} from '@prisma/client';
