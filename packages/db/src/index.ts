// IntelliFlow CRM - Database Package
// Re-exports Prisma client and types with pgvector support

export * from './client';

// Prisma 7 generated client splits exports across files.
// client.ts uses .js extensions in imports that webpack can't resolve,
// so we import enums from the self-contained enums.ts instead.
export * from '../generated/prisma/enums';

// Decimal export for currency/numeric precision
export { Decimal } from '@prisma/client/runtime/client';

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
  AIOutputReview,
  AuditLogEntry,
  AutoResponseDraft,
  ChainVersion,
  ChainVersionAudit,
  DomainEvent,
  Appointment,
  AppointmentAttendee,
  AppointmentCase,
  Calendar,
  SecurityEvent,
  Experiment,
  ExperimentAssignment,
  ExperimentResult,
  HelpArticle,
  ArticleSection,
  ArticleFeedback,
  ContactDuplicateRule,
  ContactRequiredField,
  ContactTag,
  ContactAutomationSetting,
} from '../generated/prisma/client';

// Re-export performance tracking utilities
export {
  QueryPerformanceTracker,
  queryPerformanceTracker,
  executeRawWithTiming,
  checkDatabaseHealth,
  withTransaction,
  withTransactionOptions,
  disconnectPrisma,
  validateEmbedding,
  formatEmbeddingForPgVector,
} from './client';

// Re-export types for pgvector operations
export type {
  QueryMetrics,
  VectorSearchResult,
  VectorEmbedding,
  TransactionClient,
} from './client';

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
