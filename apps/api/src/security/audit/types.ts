/**
 * Audit Logger Types
 * Re-exports audit types from the main security types module
 */
export type {
  AuditLogInput,
  SecurityEventInput,
  AuditAction,
  ActionResult,
  ActorType,
  DataClassification,
  ResourceType,
  SecuritySeverity,
} from '../types';

// Import the type for use in this file
import type { DataClassification } from '../types';

/**
 * Configuration for the audit logger
 */
export interface AuditLoggerConfig {
  /** Enable async logging (batched writes) */
  async?: boolean;
  /** Batch size for async logging */
  batchSize?: number;
  /** Batch flush interval in ms */
  flushIntervalMs?: number;
  /** Enable console logging for development */
  consoleLog?: boolean;
  /** Default data classification */
  defaultClassification?: DataClassification;
  /** Default retention period in days */
  defaultRetentionDays?: number;
}

export type RequiredAuditLoggerConfig = Required<AuditLoggerConfig>;
