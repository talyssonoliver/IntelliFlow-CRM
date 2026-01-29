// IntelliFlow CRM - Database Package
// Re-exports Prisma client and types with pgvector support

export * from './client';
export * from '@prisma/client';

// Decimal export for currency/numeric precision
export { Decimal } from '@prisma/client/runtime/library';

// Type helpers for domain layer
export type {
  User,
  Lead,
  Contact,
  Account,
  Opportunity,
  Task,
  Ticket,
  AIScore,
  AuditLog,
  DomainEvent,
  Appointment,
  AppointmentAttendee,
  AppointmentCase,
  SecurityEvent,
} from '@prisma/client';

// Enum exports
export {
  UserRole,
  LeadSource,
  LeadStatus,
  OpportunityStage,
  TaskPriority,
  TaskStatus,
  TicketStatus,
  TicketPriority,
  SLAStatus,
  EventStatus,
  AppointmentType,
  AppointmentStatus,
  SecuritySeverity,
} from '@prisma/client';

// Re-export performance tracking utilities
export {
  QueryPerformanceTracker,
  queryPerformanceTracker,
  executeRawWithTiming,
  checkDatabaseHealth,
  withTransactionOptions,
  validateEmbedding,
  formatEmbeddingForPgVector,
} from './client';

// Re-export types for pgvector operations
export type { QueryMetrics, VectorSearchResult, VectorEmbedding, TransactionClient } from './client';

// pgvector utilities for AI embeddings
export {
  EMBEDDING_DIMENSIONS,
  validateEmbedding as validatePgVectorEmbedding,
  formatEmbedding,
  parseEmbedding,
  cosineSimilarity,
  l2Distance,
  findSimilarLeads,
  findSimilarContacts,
  updateLeadEmbedding,
  updateContactEmbedding,
  checkPgVectorInstalled,
  getEmbeddingIndexStatus,
} from './pgvector';

export type { EmbeddingModel, DistanceMetric, SimilaritySearchOptions } from './pgvector';
